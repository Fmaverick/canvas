# 生产级组合运行系统 Spec

## Why
现有画布批量运行能力本质仍是“固定节点集 × runCount”，缺少对多个输入源进行组合展开、分片调度、实例级追踪和恢复治理的运行模型。为了让多文本、多图片、多视频输入在生产环境下稳定驱动图片、视频、文本节点生成，需要补齐组合计划、组合实例、分片执行和结果索引这套能力。

## What Changes
- 新增 `input` 输入源节点，承载文本、图片、视频资源集合
- 新增 `combination` 组合节点，负责多输入源绑定、组合模式定义、数量估算和组合计划生成
- 新增组合实例层，正式引入 `combination_plan`、`combination_item`、`combination_shard` 的运行对象
- 修改批量运行模型，使 `node_run_batches` 从“重复运行计数”扩展为“组合计划驱动的批量执行容器”
- 修改节点执行流程，为生成节点增加组合上下文解析能力，并按组合实例逐条生成
- 修改 `batch_result` 节点和批量查询接口，使结果可按组合实例、输入绑定、失败原因和目标节点维度检索
- 新增生产治理能力，包括组合预估、执行阈值、分片调度、暂停恢复、实例级重试、容量感知和观测字段
- **BREAKING** 画布运行协议从“节点批量重复执行”扩展为“组合计划 + 节点链路执行”，相关运行态、任务详情和批量结果接口返回结构需要增量调整

## Impact
- Affected specs: 画布节点协议、批量运行协议、任务系统、结果聚合协议、运行态同步协议
- Affected code: `src/application/services/task-service.ts`、`src/application/services/canvas-service.ts`、`src/infrastructure/db/schema.ts`、`src/components/canvas/infinite-canvas-board.shared.ts`、`src/components/canvas/infinite-canvas-board.api.ts`、画布运行相关 API routes、批量结果面板与节点卡片

## ADDED Requirements
### Requirement: 输入源节点
系统 SHALL 提供 `input` 节点作为生产级输入源容器，用于承载文本、图片、视频资源集合，并将输入项作为可持久化、可排序、可启停、可追踪的独立对象管理。

#### Scenario: 输入源保存成功
- **WHEN** 用户在画布中创建 `input` 节点并选择多个文本、图片或视频资源
- **THEN** 系统保存节点本体和输入项列表
- **AND** 输入项支持稳定排序、启停状态和来源追踪
- **AND** 节点输出快照只返回摘要信息而不是完整明细

#### Scenario: 输入源引用资源被更新
- **WHEN** 输入源节点引用的底层资源元数据发生变化
- **THEN** 系统在不破坏已保存节点配置的前提下刷新可展示摘要
- **AND** 已运行批次继续基于当次快照保持可追溯性

### Requirement: 组合节点
系统 SHALL 提供 `combination` 节点，用于接收多个 `input` 节点，并以显式的组合模式生成组合计划，而不是让生成节点直接隐式展开多个输入源。

#### Scenario: 组合节点创建组合计划
- **WHEN** 用户将两个或多个 `input` 节点连接到 `combination` 节点，并选择 `zip`、`cartesian`、`anchor` 或 `custom_mapping` 模式
- **THEN** 系统生成组合计划定义
- **AND** 返回估算数量、样例预览和执行风险信息

#### Scenario: 组合节点输出组合摘要
- **WHEN** 组合节点完成估算或运行前预览
- **THEN** 节点输出包含组合模式、输入源摘要、预计组合数、前若干组合样例和治理提示

### Requirement: 组合实例层
系统 SHALL 在批量运行和生成任务之间引入组合实例层，用于表达单个输入组合实例，并支撑实例级查询、失败定位、重试和恢复。

#### Scenario: 组合实例持久化
- **WHEN** 用户启动一个组合计划
- **THEN** 系统创建 `combination_plan`
- **AND** 为计划生成 `combination_item`
- **AND** 每个 `combination_item` 记录输入绑定、显示标签、实例状态和稳定键

#### Scenario: 实例级追踪
- **WHEN** 某个组合实例下的生成任务失败
- **THEN** 系统能够基于组合实例查看失败节点、错误码、错误信息和输入绑定摘要
- **AND** 用户可只重试失败的组合实例而不是重跑整批计划

### Requirement: 分片执行与调度治理
系统 SHALL 以分片方式推进组合计划执行，并在调度前检查容量、阈值和供应商健康状态，避免大规模组合一次性创建任务导致系统失稳。

#### Scenario: 大规模组合被分片调度
- **WHEN** 组合计划预计生成大量组合实例
- **THEN** 系统将组合实例切分为多个 shard
- **AND** worker 逐 shard 调度执行
- **AND** 单个 shard 的推进不会阻塞其他批次的查询和结果读取

#### Scenario: 超阈值组合触发治理
- **WHEN** 组合计划预计组合数、视频任务数或轮询成本超出预设阈值
- **THEN** 系统返回 `warn`、`confirm`、`manual_approval` 或 `reject` 等治理信号
- **AND** 未获批准的高成本计划不得直接运行

#### Scenario: 调度器感知容量
- **WHEN** 调度器准备推进新的 shard
- **THEN** 系统检查 OpenAI 并发令牌、媒体轮询积压、供应商限流状态和工作空间活跃任务占用
- **AND** 仅在容量允许时继续调度

### Requirement: 组合上下文驱动生成
系统 SHALL 让生成节点消费组合上下文而不是直接理解多个输入源，并按组合实例逐条构建执行请求。

#### Scenario: 视频节点消费组合上下文
- **WHEN** 视频节点连接到 `combination` 节点并触发运行
- **THEN** 系统按单个组合实例解析文本、图片、视频绑定
- **AND** 将其映射为脚本、关键帧、参考图或风格参考
- **AND** 为每个组合实例独立创建节点运行和生成任务

#### Scenario: 链路中的下游节点依赖上游成功
- **WHEN** 一个组合实例所在链路中存在多个生成节点
- **THEN** 系统仍按拓扑顺序推进节点运行
- **AND** 上游失败只阻断该组合实例对应的后续节点
- **AND** 不影响同一批次中其他组合实例继续执行

### Requirement: 结果索引与批量结果节点
系统 SHALL 让 `batch_result` 节点按组合实例聚合结果，并支持筛选、下载、提取和实例级重试入口。

#### Scenario: 结果按组合实例展示
- **WHEN** 用户打开 `batch_result` 节点
- **THEN** 系统按组合实例展示结果
- **AND** 每条结果包含输入绑定摘要、节点标题、状态、结果预览、错误信息和任务标识

#### Scenario: 单实例结果提取
- **WHEN** 用户从 `batch_result` 节点中选择单条结果进行提取
- **THEN** 系统可将其提取为独立节点或独立资源
- **AND** 保留与原组合实例的追溯关系

### Requirement: 暂停、恢复与幂等
系统 SHALL 支持组合计划、分片和实例级别的幂等执行、暂停、恢复与取消，以适应长时间运行和供应商波动。

#### Scenario: 计划暂停与恢复
- **WHEN** 系统检测到供应商异常率过高或管理员手动暂停计划
- **THEN** 未开始的 shard 停止推进
- **AND** 已完成结果保持可见
- **AND** 用户可在后续恢复计划继续执行剩余 shard

#### Scenario: worker 重启后恢复
- **WHEN** worker 在执行中重启
- **THEN** 系统能够依据计划、分片和实例状态恢复待执行工作
- **AND** 不得重复创建已成功提交的供应商任务

### Requirement: 生产观测与审计
系统 SHALL 为组合计划、分片、实例、节点运行和任务执行补齐结构化日志和指标字段，支持生产排障与容量评估。

#### Scenario: 查询生产故障链路
- **WHEN** 某个组合实例生成失败
- **THEN** 系统可从日志和数据库中追溯 `plan_id`、`shard_id`、`combination_item_id`、`node_run_id` 和 `task_id`
- **AND** 运营或开发可定位失败发生在哪个输入组合和哪个节点

## MODIFIED Requirements
### Requirement: 批量运行
系统 SHALL 将批量运行定义为“一个执行容器承载若干组合计划或重复运行实例”，而不再只表示固定节点集的 `runCount` 重复执行。

#### Scenario: 批量运行启动
- **WHEN** 用户启动包含组合节点的生成链路
- **THEN** 系统先创建批量运行容器
- **AND** 再创建组合计划、组合实例和分片
- **AND** 节点运行记录需关联组合实例标识

#### Scenario: 批量运行查询
- **WHEN** 用户查询批量运行详情
- **THEN** 系统返回 summary/detail 分层数据
- **AND** detail 查询可分页查看组合实例、节点运行和结果信息

### Requirement: 运行态同步
系统 SHALL 在运行态同步中区分批量运行摘要、组合计划摘要和节点运行变更，并避免用全量快照回传全部组合明细。

#### Scenario: 运行态增量更新
- **WHEN** 某个分片完成、某个实例失败或某个批量摘要更新
- **THEN** 系统仅推送必要的 summary 或 patch
- **AND** 组合明细通过详情接口分页加载

## REMOVED Requirements
### Requirement: 批量运行仅依赖 runCount
**Reason**: 仅依赖 `runCount` 只能表达重复执行，无法表达生产级多输入组合、实例级恢复和分片治理。
**Migration**: 旧批量运行能力继续保留为“重复运行模式”，新组合运行以计划模式落地，并通过 `batch_mode` 区分两类批量执行。

# Tasks
- [x] Task 1: 扩展节点协议和画布连线模型，使画布支持 `input` 与 `combination` 节点，并定义组合运行的前端/后端公共类型。
  - [x] SubTask 1.1: 更新节点类型、节点配置、节点输出摘要和连线语义的共享类型定义
  - [x] SubTask 1.2: 设计并实现 `input -> combination -> generation node` 的连线校验与节点创建入口
  - [x] SubTask 1.3: 为运行态快照补充组合计划摘要字段，并保持 summary/detail 分层

- [x] Task 2: 建立组合运行的数据模型，在数据库层引入组合计划、组合实例和分片执行对象，并扩展现有批量运行表。
  - [x] SubTask 2.1: 为 `node_run_batches`、`node_runs`、`generation_tasks`、`task_results` 增加组合运行相关字段
  - [x] SubTask 2.2: 新增 `input_node_items`、`combination_plans`、`combination_items`、`combination_shards` 表及索引
  - [x] SubTask 2.3: 编写迁移脚本并确保旧批量运行模式仍可读取

- [x] Task 3: 实现输入源节点与组合节点的应用服务和 API，使用户可配置输入集合、组合模式、估算结果和计划生命周期。
  - [x] SubTask 3.1: 为输入源节点实现输入项的保存、排序、启停和摘要读取
  - [x] SubTask 3.2: 为组合节点实现计划估算、样例预览和治理信号返回
  - [x] SubTask 3.3: 提供组合计划的创建、运行、暂停、恢复、取消和详情查询接口

- [x] Task 4: 重构批量执行链路，让生成节点按组合实例逐条执行，并以分片方式推进长批次任务。
  - [x] SubTask 4.1: 在 `task-service` 中增加组合上下文解析与执行负载构建逻辑
  - [x] SubTask 4.2: 实现 shard 调度、容量检查、实例级状态推进和幂等恢复
  - [x] SubTask 4.3: 让链路中的上游失败仅阻断当前组合实例，不影响其他实例继续执行

- [x] Task 5: 升级 `batch_result` 和批量查询体验，使结果能按组合实例维度浏览、筛选、提取和重试。
  - [x] SubTask 5.1: 扩展批量详情查询，支持分页读取组合实例与结果索引
  - [x] SubTask 5.2: 改造 `batch_result` 节点展示模型，增加输入绑定摘要、失败原因和实例级动作
  - [x] SubTask 5.3: 提供单实例重试、结果提取和批量导出入口

- [x] Task 6: 完成生产级治理与验证，包括观测、配额控制、暂停恢复、迁移兼容和端到端验证。
  - [x] SubTask 6.1: 为组合计划、分片、实例、节点运行和任务执行补充结构化日志与指标字段
  - [x] SubTask 6.2: 增加阈值控制、容量感知、供应商熔断和工作空间级配额校验
  - [x] SubTask 6.3: 编写并执行关键测试，覆盖估算、组合展开、分片执行、失败恢复和旧批量模式兼容

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1] and [Task 2]
- [Task 4] depends on [Task 2] and [Task 3]
- [Task 5] depends on [Task 4]
- [Task 6] depends on [Task 4] and [Task 5]

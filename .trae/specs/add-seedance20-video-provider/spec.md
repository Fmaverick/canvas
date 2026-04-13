# Seedance2.0 视频模型接入 Spec

## Why
当前平台已具备统一网关与视频异步任务能力，但缺少 `seedance2.0` 供应商接入，导致视频节点无法选择该模型，也无法利用参考图能力完成图生视频场景。

## What Changes
- 新增 `seedance2.0` 视频供应商配置与管理能力（支持多 key、可用性探测、模型可见性）
- 新增 `seedance2.0` 视频模型注册，使其出现在模型列表并可被视频节点选择
- 扩展视频节点参数与请求映射，支持参考图输入（单图或多图，按供应商约束转换）
- 扩展网关视频请求协议，在 `assets` 与 `settings` 中明确参考图字段
- 补充任务提交与轮询链路映射，确保 `seedance2.0` 异步状态、错误码、输出结构归一
- 补充 Admin 侧联调与验收路径，覆盖供应商配置、模型可见性、任务提交、任务轮询与错误场景

## Impact
- Affected specs: AI 网关协议、视频节点协议、模型管理协议、任务轮询协议、错误码归一协议
- Affected code: `src/infrastructure/ai/adapters`、`src/infrastructure/ai/registry`、`src/application/services/task`、`src/app/api/admin/providers`、`src/app/api/v1/models`、`src/app/api/v1/gateway`、`src/app/api/v1/tasks`、视频节点配置与模型选择 UI

## ADDED Requirements
### Requirement: Seedance2.0 供应商接入
系统 SHALL 支持在 Admin 侧配置 `seedance2.0` 供应商的 `baseUrl` 与密钥集合，并将其纳入统一供应商可用性判定。

#### Scenario: Admin 成功配置供应商
- **WHEN** 管理员提交 `seedance2.0` 的 `baseUrl` 与至少一个有效 key
- **THEN** 系统保存供应商配置并返回脱敏 key 列表
- **AND** 供应商状态可在管理状态接口中查询为 `available=true/false`

### Requirement: Seedance2.0 模型可见且可选
系统 SHALL 将 `seedance2.0` 视频模型注册到模型目录，并允许视频节点在模型选择器中使用该模型。

#### Scenario: 模型列表可见
- **WHEN** 客户端查询模型列表
- **THEN** 返回 `seedance2.0` 视频模型条目
- **AND** 条目包含 `modality=video`、`capability=generate`、`async=true` 与对应 `providers`

#### Scenario: 视频节点选择模型
- **WHEN** 用户在视频节点选择 `seedance2.0` 模型并保存节点
- **THEN** 节点配置被持久化
- **AND** 运行时按该模型路由到 `seedance2.0` 适配器

### Requirement: 参考图输入支持
系统 SHALL 支持视频节点为 `seedance2.0` 提交参考图，并在网关请求中以标准化资产结构表达。

#### Scenario: 仅文本生成视频
- **WHEN** 用户未提供参考图
- **THEN** 系统仍可提交 `seedance2.0` 视频生成任务
- **AND** 请求体中的参考图字段为空或省略

#### Scenario: 使用参考图生成视频
- **WHEN** 用户在视频节点配置中添加参考图资产
- **THEN** 系统在网关请求 `assets` 中携带参考图信息
- **AND** 适配器将标准资产映射为 `seedance2.0` 所需参数
- **AND** 不满足供应商约束时返回 `VALIDATION_ERROR`

### Requirement: 异步任务生命周期对齐
系统 SHALL 将 `seedance2.0` 视频任务纳入统一异步生命周期，支持提交、轮询、完成、失败、取消与可追溯元数据。

#### Scenario: 任务提交成功
- **WHEN** 客户端调用视频网关并命中 `seedance2.0`
- **THEN** 网关返回 `202 Accepted` 与平台 `task.id`
- **AND** 任务状态进入 `queued` 或 `processing`
- **AND** 任务记录保存 `provider`、`model`、`provider_task_id`

#### Scenario: 轮询完成
- **WHEN** 轮询任务检测到供应商任务成功
- **THEN** 系统将任务更新为 `succeeded`
- **AND** 输出写入统一 `output[].kind=url` 结构
- **AND** 记录关键追溯信息（如 `jobId`、`traceId`、`keyId`）

### Requirement: 错误码归一与联调可观测
系统 SHALL 对 `seedance2.0` 的常见失败进行标准错误码映射，并提供与现有 curl 联调顺序一致的可观测行为。

#### Scenario: 供应商不可用
- **WHEN** `seedance2.0` 未配置或被标记不可用
- **THEN** 返回 `PROVIDER_UNAVAILABLE`

#### Scenario: 模型未启用
- **WHEN** `seedance2.0` 模型被关闭或未注册
- **THEN** 返回 `MODEL_NOT_ENABLED`

#### Scenario: 参考图参数非法
- **WHEN** 参考图数量、格式或字段不满足要求
- **THEN** 返回 `VALIDATION_ERROR`
- **AND** `details` 指出具体字段与校验失败原因

## MODIFIED Requirements
### Requirement: 视频节点参数协议
系统 SHALL 在视频节点 `params/settings` 中增加参考图输入字段，并保持与现有首帧/末帧参数兼容。

#### Scenario: 视频节点保存与回显
- **WHEN** 用户保存包含参考图的 `seedance2.0` 视频节点
- **THEN** 节点详情接口可正确回显参考图配置
- **AND** 不影响非 `seedance2.0` 视频模型的原有配置行为

### Requirement: 网关视频请求协议
系统 SHALL 扩展视频请求规范，允许通过统一 `assets` 描述参考图输入，并由适配器做供应商差异映射。

#### Scenario: 标准请求映射到供应商请求
- **WHEN** 网关接收到包含参考图的标准视频请求
- **THEN** 适配器按 `seedance2.0` 协议完成参数转换
- **AND** 任务查询接口继续返回统一任务结构

## REMOVED Requirements
### Requirement: 视频模型仅支持纯文本输入
**Reason**: `seedance2.0` 需要支持参考图以覆盖图生视频与风格约束场景。
**Migration**: 旧节点保持可运行；新字段默认为空，不影响未使用参考图的历史流程。

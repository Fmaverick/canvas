# 火山引擎图片供应商接入 Spec

## Why
当前平台已有统一网关与视频供应商接入路径，但图片生成侧缺少火山引擎 Ark 供应商与对应模型，导致图片节点和网关无法使用 `doubao-seedream-4-5-251128` 发起生成，也无法按供应商要求限制清晰度参数。

## What Changes
- 新增火山引擎 Ark 图片供应商配置与可用性校验能力，支持配置 `baseUrl` 与至少一个访问密钥
- 新增图片模型 `doubao-seedream-4-5-251128` 的模型注册，使其可出现在模型目录并被图片节点选择
- 扩展统一图片生成协议，映射火山引擎 `POST /api/v3/images/generations` 请求与标准输出结构
- 为图片节点增加 `size` 参数约束，仅允许 `2K` 与 `4K`
- 对齐同步图片生成结果的回写、资产落库与错误码归一
- 补充联调与验证路径，覆盖供应商配置、模型可见性、图片生成成功与非法参数失败场景

## Impact
- Affected specs: AI 网关图片协议、图片节点参数协议、模型管理协议、资产回写协议、错误码归一协议
- Affected code: `src/lib/gateway-provider-registry.ts`、`src/app/v1/gateway/route.ts`、`src/infrastructure/ai` 下图片供应商客户端与适配层、`src/application/services/task-service.ts`、图片节点配置与模型选择 UI、相关测试与联调文档

## ADDED Requirements
### Requirement: 火山引擎图片供应商接入
系统 SHALL 支持在管理端配置火山引擎 Ark 图片供应商，并将其纳入统一供应商可用性判定。

#### Scenario: Admin 成功配置火山引擎供应商
- **WHEN** 管理员提交火山引擎图片供应商的 `baseUrl` 与至少一个有效 key
- **THEN** 系统保存供应商配置并返回脱敏后的 key 信息
- **AND** 管理状态接口可以查询该供应商的 `available` 状态

### Requirement: 火山引擎图片模型可见且可选
系统 SHALL 将 `doubao-seedream-4-5-251128` 注册为图片模型，并允许客户端与图片节点选择该模型。

#### Scenario: 模型目录返回图片模型
- **WHEN** 客户端查询模型列表
- **THEN** 返回 `doubao-seedream-4-5-251128` 模型条目
- **AND** 条目包含 `modality=image`、`capability=generate`、`async=false` 与火山引擎供应商信息

#### Scenario: 图片节点选择模型
- **WHEN** 用户在图片节点选择 `doubao-seedream-4-5-251128` 并保存
- **THEN** 节点配置被正确持久化
- **AND** 运行时按照图片能力路由到火山引擎适配器

### Requirement: 图片生成请求映射
系统 SHALL 支持将统一图片生成请求映射为火山引擎 `images/generations` 请求，并将返回的图片 URL 归一为平台标准输出。

#### Scenario: 图片生成成功
- **WHEN** 客户端使用 `doubao-seedream-4-5-251128` 发起图片生成
- **THEN** 系统向火山引擎发送包含 `model`、`prompt`、`response_format`、`size`、`stream`、`watermark` 的请求
- **AND** 将响应中的 `data[].url` 转换为统一输出结构
- **AND** 任务与节点输出可引用对应图片资产

#### Scenario: 输出结构归一
- **WHEN** 火山引擎返回图片 URL 与分辨率信息
- **THEN** 系统写入统一 `output[].kind=url` 与图片资产元数据
- **AND** 保留供应商响应中的可追溯字段用于排障

### Requirement: 图片尺寸参数受控
系统 SHALL 对火山引擎图片模型的 `size` 参数做白名单限制，仅允许 `2K` 与 `4K`。

#### Scenario: 使用 2K 尺寸生成
- **WHEN** 用户在图片节点或网关请求中将 `size` 设置为 `2K`
- **THEN** 系统接受该请求并传递给火山引擎

#### Scenario: 使用 4K 尺寸生成
- **WHEN** 用户在图片节点或网关请求中将 `size` 设置为 `4K`
- **THEN** 系统接受该请求并传递给火山引擎

#### Scenario: 非法尺寸被拒绝
- **WHEN** 用户提交 `1K`、`1024x1024` 或其他非 `2K/4K` 的值
- **THEN** 系统返回 `VALIDATION_ERROR`
- **AND** 错误详情明确指出 `size` 字段仅支持 `2K` 与 `4K`

### Requirement: 错误码归一与联调可观测
系统 SHALL 对火山引擎图片生成常见失败场景做标准错误码映射，并保持与现有联调方式一致的可观测行为。

#### Scenario: 供应商不可用
- **WHEN** 火山引擎供应商未配置、无有效 key 或被标记不可用
- **THEN** 返回 `PROVIDER_UNAVAILABLE`

#### Scenario: 模型未启用
- **WHEN** `doubao-seedream-4-5-251128` 未注册或被关闭
- **THEN** 返回 `MODEL_NOT_ENABLED`

#### Scenario: 上游返回图片生成错误
- **WHEN** 火山引擎返回 4xx 或 5xx 错误
- **THEN** 系统映射为平台标准错误结构
- **AND** 保留可用于审计与排障的供应商错误摘要

## MODIFIED Requirements
### Requirement: 图片节点参数协议
系统 SHALL 在图片节点 `params/settings` 中显式支持火山引擎模型的 `size`、`responseFormat`、`watermark` 等参数，并保持其他图片模型的兼容性。

#### Scenario: 图片节点保存与回显
- **WHEN** 用户保存使用火山引擎模型且包含 `size=2K` 或 `size=4K` 的图片节点
- **THEN** 节点详情接口可以正确回显这些参数
- **AND** 不影响其他图片模型的现有配置行为

### Requirement: 统一图片网关协议
系统 SHALL 扩展统一图片生成协议，使其可以表达火山引擎所需字段，并由适配器完成供应商差异映射。

#### Scenario: 标准请求映射到火山引擎请求
- **WHEN** 网关接收到标准图片生成请求
- **THEN** 系统依据模型与供应商配置映射到火山引擎 `images/generations` 协议
- **AND** 响应继续返回平台统一结构

## REMOVED Requirements
### Requirement: 图片模型尺寸参数接受任意透传值
**Reason**: 火山引擎模型接入需要对 `size` 做明确白名单约束，避免无效参数直接透传到供应商侧造成不稳定行为。
**Migration**: 历史非火山引擎图片模型保持原有行为；火山引擎模型新增后仅接受 `2K` 与 `4K`。

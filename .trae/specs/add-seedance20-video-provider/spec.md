# 火山 Seedance2.0 官方视频端点替换 Spec

## Why
当前仓库虽然已有 `seedance2.0` 视频能力，但实现仍基于自定义 `/video/generations` 协议和独立 `seedance2.0` provider，和火山官方 Ark `contents/generations/tasks` 接口不一致，也无法完整利用示例中已验证可用的 `content[]` 多模态字段与任务回包字段。

## What Changes
- **BREAKING** 将 `seedance2.0` 视频提交与轮询链路替换为火山官方 Ark 端点：`POST /contents/generations/tasks` 与 `GET /contents/generations/tasks/:id`
- **BREAKING** 将 `seedance2.0` 视频能力归并到 `volcengine` 供应商体系，由模型目录将对外模型键映射到火山官方可用 `modelId`
- 扩展统一视频请求协议，支持文本、参考图片、参考视频、参考音频等多模态输入，并优先映射到火山官方 `content[]` 结构
- 扩展视频请求设置，覆盖 `generate_audio`、`ratio`、`duration`、`watermark` 等火山官方字段，并保留可追溯元数据
- 更新任务提交、轮询与结果回写协议，完整归一 `status`、`content.video_url`、`usage`、`resolution`、`ratio`、`duration`、`framespersecond`、`seed`、`service_tier`、`execution_expires_after`、`draft`
- 补充兼容迁移策略：历史仅图片参考的 `assets` 请求仍可映射到新协议，但新实现以火山官方字段和语义为准

## Impact
- Affected specs: AI 网关协议、视频节点协议、供应商注册协议、模型目录协议、异步任务轮询协议、环境配置协议
- Affected code: `src/infrastructure/ai/seedance20-client.ts`、`src/app/v1/gateway/route.ts`、`src/app/v1/tasks/[taskId]/route.ts`、`src/lib/gateway-provider-registry.ts`、`src/lib/env.ts`、`API_CURL_EXAMPLES.md`、相关测试文件

## ADDED Requirements
### Requirement: 火山官方视频端点直连
系统 SHALL 通过火山官方 Ark 视频生成端点提交和查询 Seedance2.0 任务，而不是继续使用仓库内现有的自定义视频 gateway 协议。

#### Scenario: 使用官方提交端点创建任务
- **WHEN** 客户端通过统一视频网关提交 `seedance2.0` 生成请求
- **THEN** 适配器使用 Bearer 鉴权调用 `POST /contents/generations/tasks`
- **AND** 请求体包含官方 `model` 字段和官方请求结构，而不是自定义 `/video/generations` payload
- **AND** 平台任务记录保存火山返回的任务 ID 作为 `provider_task_id`

#### Scenario: 使用官方查询端点轮询任务
- **WHEN** 任务中心或轮询逻辑查询视频任务状态
- **THEN** 适配器调用 `GET /contents/generations/tasks/:id`
- **AND** 将火山 `status` 归一到平台任务状态
- **AND** 保留原始响应以供排障

### Requirement: 官方多模态内容字段映射
系统 SHALL 支持将统一视频输入映射为火山官方 `content[]` 数组，覆盖文本、参考图片、参考视频和参考音频。

#### Scenario: 组合文本与多模态参考素材
- **WHEN** 用户提交文本提示词、参考图片、参考视频和参考音频
- **THEN** 适配器按顺序组装 `content[]`
- **AND** 文本项映射为 `{ "type": "text", "text": ... }`
- **AND** 图片项映射为 `{ "type": "image_url", "image_url": { "url": ... }, "role": "reference_image" }`
- **AND** 视频项映射为 `{ "type": "video_url", "video_url": { "url": ... }, "role": "reference_video" }`
- **AND** 音频项映射为 `{ "type": "audio_url", "audio_url": { "url": ... }, "role": "reference_audio" }`

#### Scenario: 仅文本生成视频
- **WHEN** 用户只提交文本提示词而不提供任何参考素材
- **THEN** 系统仍可提交火山视频任务
- **AND** `content[]` 至少包含文本项

#### Scenario: 历史图片参考请求兼容迁移
- **WHEN** 旧请求仍通过 `assets` 传入图片参考
- **THEN** 网关将其转换为火山官方 `reference_image` 内容项
- **AND** 不要求调用方立即切换到新字段

### Requirement: 火山视频设置字段优先落地
系统 SHALL 在统一视频网关与节点配置中显式支持火山官方已验证可用的核心字段。

#### Scenario: 设置火山视频生成参数
- **WHEN** 用户提交视频生成请求
- **THEN** 系统支持 `generate_audio`、`ratio`、`duration`、`watermark`
- **AND** 这些字段直接映射到火山官方请求体
- **AND** 未提供时使用平台默认值或保持省略

### Requirement: 视频任务结果元数据完整回写
系统 SHALL 在任务完成后返回统一视频 URL 输出，并保留火山任务元数据用于展示、诊断和后续审计。

#### Scenario: 任务成功完成
- **WHEN** 火山任务返回 `succeeded`
- **THEN** 系统将任务更新为 `succeeded`
- **AND** 从 `content.video_url` 提取最终视频地址并归一为 `output[].kind=url`
- **AND** 将 `usage`、`resolution`、`ratio`、`duration`、`framespersecond`、`seed`、`service_tier`、`execution_expires_after`、`generate_audio`、`draft` 保存到任务结果元数据

#### Scenario: 任务处理中
- **WHEN** 火山任务仍处于非完成态
- **THEN** 系统维持 `queued` 或 `processing`
- **AND** 不错误地把已提交任务标记为完成

### Requirement: 火山错误码归一
系统 SHALL 将火山官方视频接口常见失败归一为平台标准错误码。

#### Scenario: 供应商配置缺失
- **WHEN** 火山视频 key、base URL 或视频模型 ID 未配置
- **THEN** 返回 `PROVIDER_UNAVAILABLE`

#### Scenario: 模型未启用
- **WHEN** 请求模型未在模型目录启用，或未映射到有效火山视频模型 ID
- **THEN** 返回 `MODEL_NOT_ENABLED`

#### Scenario: 参考素材字段非法
- **WHEN** 参考图片、视频或音频的 URL、类型或角色不合法
- **THEN** 返回 `VALIDATION_ERROR`
- **AND** 错误消息指出具体非法字段

## MODIFIED Requirements
### Requirement: 视频节点参数协议
系统 SHALL 在视频节点参数中支持参考图片、参考视频、参考音频以及火山官方视频设置字段，并兼容现有首帧/末帧语义。

#### Scenario: 节点保存与回显
- **WHEN** 用户保存包含火山参考素材和官方设置字段的视频节点
- **THEN** 节点详情接口可正确回显这些字段
- **AND** 非火山视频模型不受影响

### Requirement: 网关视频请求协议
系统 SHALL 扩展统一视频请求协议，使其既能表达平台标准 `assets/settings`，又能无损映射到火山官方 `content[]` 结构。

#### Scenario: 标准请求映射到火山官方请求
- **WHEN** 网关收到视频请求
- **THEN** 适配器优先按火山官方字段构造请求体
- **AND** 任务查询接口继续返回统一任务结构

### Requirement: 模型与供应商目录协议
系统 SHALL 将 Seedance2.0 视频模型挂接到 `volcengine` 供应商能力，而不是继续维护独立的自定义视频 provider 协议。

#### Scenario: 模型目录可见
- **WHEN** 客户端查询模型列表
- **THEN** 返回 Seedance2.0 视频模型条目
- **AND** 条目声明 `modality=video`、`capability=generate`、`async=true`
- **AND** 对应 provider 为 `volcengine`

## REMOVED Requirements
### Requirement: 自定义 Seedance `/video/generations` 协议
**Reason**: 该协议与火山官方 Ark 视频接口不一致，且无法覆盖已验证可用的多模态输入与任务字段。
**Migration**: 旧的图片参考 `assets` 输入可继续通过映射运行；提交流程与轮询流程统一切换到火山官方端点。

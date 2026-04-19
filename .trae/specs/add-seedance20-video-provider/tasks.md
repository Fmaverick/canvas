# Tasks
- [x] Task 1: 重构火山视频供应商与模型目录契约，明确 Seedance2.0 改为火山官方 Ark 视频能力接入。
  - [x] SubTask 1.1: 调整 provider registry，使 Seedance2.0 视频能力归并到 `volcengine` 而不是独立自定义 provider
  - [x] SubTask 1.2: 增加火山视频模型 ID 配置项，区分对外模型键与实际官方 `modelId`
  - [x] SubTask 1.3: 更新管理状态与模型目录输出，确保视频模型、provider 可见性与启用状态一致

- [x] Task 2: 重写视频网关请求协议与参数映射，优先对齐火山官方 `content[]` 结构。
  - [x] SubTask 2.1: 扩展网关视频 schema，支持文本、参考图片、参考视频、参考音频
  - [x] SubTask 2.2: 将 `generate_audio`、`ratio`、`duration`、`watermark` 等字段定义为可直传火山的标准设置
  - [x] SubTask 2.3: 保留旧图片 `assets` 请求的兼容映射，避免现有调用方立即失效

- [x] Task 3: 替换 `seedance20-client` 的提交与查询实现，改为火山官方端点。
  - [x] SubTask 3.1: 将任务提交切换到 `POST /contents/generations/tasks`
  - [x] SubTask 3.2: 将任务查询切换到 `GET /contents/generations/tasks/:id`
  - [x] SubTask 3.3: 按官方响应结构提取 `provider_task_id`、`content.video_url`、状态和原始元数据

- [x] Task 4: 对齐任务状态机、结果回写与错误码归一，覆盖火山官方任务字段。
  - [x] SubTask 4.1: 归一 `status` 到平台 `queued/processing/succeeded/failed`
  - [x] SubTask 4.2: 持久化 `usage`、`resolution`、`ratio`、`duration`、`framespersecond`、`seed`、`service_tier`、`execution_expires_after`、`generate_audio`、`draft`
  - [x] SubTask 4.3: 统一 `PROVIDER_UNAVAILABLE`、`MODEL_NOT_ENABLED`、`VALIDATION_ERROR` 等错误映射

- [x] Task 5: 更新联调样例与验证覆盖，确保官方示例字段和兼容路径都可复现。
  - [x] SubTask 5.1: 更新 curl 文档，体现官方端点语义和多模态参考字段
  - [x] SubTask 5.2: 增加测试覆盖文本+图片、文本+视频、文本+音频和混合参考场景
  - [x] SubTask 5.3: 验证旧图片参考调用、提交成功、轮询成功、非法字段等关键路径

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1] and [Task 2]
- [Task 4] depends on [Task 3]
- [Task 5] depends on [Task 2] and [Task 4]

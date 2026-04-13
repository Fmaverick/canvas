# Tasks
- [x] Task 1: 梳理并落地 `seedance2.0` 供应商与模型配置入口，确保 Admin 可配置并在模型目录可见。
  - [x] SubTask 1.1: 扩展供应商配置结构，支持 `seedance2.0` 的 `baseUrl`、多 key 与可用性状态
  - [x] SubTask 1.2: 注册 `seedance2.0` 视频模型元数据，打通 `/v1/models` 的可见性
  - [x] SubTask 1.3: 对齐管理状态查询返回，确认供应商 `available` 与 `readOnly` 字段行为

- [x] Task 2: 实现 `seedance2.0` 视频适配器与网关映射，支持参考图参数。
  - [x] SubTask 2.1: 在统一视频请求中定义参考图输入字段，并明确 `assets/settings` 映射规则
  - [x] SubTask 2.2: 新增或扩展 `seedance2.0` 适配器，完成提交、状态查询、取消能力
  - [x] SubTask 2.3: 增加参数校验与错误映射，覆盖 `PROVIDER_UNAVAILABLE`、`MODEL_NOT_ENABLED`、`VALIDATION_ERROR`

- [x] Task 3: 打通视频节点对 `seedance2.0` 与参考图的配置和运行链路。
  - [x] SubTask 3.1: 扩展视频节点配置表单与持久化字段，支持参考图选择与回显
  - [x] SubTask 3.2: 更新节点运行上下文构建，确保参考图资产进入网关标准请求
  - [x] SubTask 3.3: 校验非 `seedance2.0` 模型兼容性，避免影响既有视频节点流程

- [x] Task 4: 对齐异步任务与轮询结果回写，确保 `seedance2.0` 任务可追踪。
  - [x] SubTask 4.1: 写入并维护 `provider_task_id`、轮询计数、下次轮询时间等关键字段
  - [x] SubTask 4.2: 统一完成态输出结构，保证 `output.kind=url` 与视频资源元数据一致
  - [x] SubTask 4.3: 保留追溯字段（如 `jobId/traceId/keyId`）用于排障与审计

- [x] Task 5: 完成联调与验证，基于现有 curl 顺序覆盖端到端场景。
  - [x] SubTask 5.1: 验证管理端登录、供应商配置、模型可见、调用方 key 生成流程
  - [x] SubTask 5.2: 验证视频提交与轮询完成流程（含参考图场景）
  - [x] SubTask 5.3: 验证常见错误返回结构与错误码映射

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1] and [Task 2]
- [Task 4] depends on [Task 2] and [Task 3]
- [Task 5] depends on [Task 4]

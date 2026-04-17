# Tasks
- [x] Task 1: 梳理并落地火山引擎图片供应商与模型配置入口，确保管理端可配置、模型目录可见。
  - [x] SubTask 1.1: 扩展供应商配置结构，支持火山引擎 Ark 图片供应商的 `baseUrl`、密钥集合与可用性状态
  - [x] SubTask 1.2: 注册 `doubao-seedream-4-5-251128` 图片模型，打通模型目录与模型启停控制
  - [x] SubTask 1.3: 对齐管理状态查询返回，确认供应商 `available` 与密钥脱敏展示行为

- [x] Task 2: 实现火山引擎图片适配器与网关映射，支持统一请求到 `images/generations` 的转换。
  - [x] SubTask 2.1: 在统一图片请求中明确 `prompt`、`response_format`、`size`、`stream`、`watermark` 的标准字段与默认值
  - [x] SubTask 2.2: 新增或扩展火山引擎图片客户端，完成请求构造、响应解析与错误映射
  - [x] SubTask 2.3: 将供应商返回的 `data[].url`、分辨率与追溯信息归一为平台输出和资产数据

- [x] Task 3: 打通图片节点对火山引擎模型的配置与运行链路，补齐 `size` 参数约束。
  - [x] SubTask 3.1: 扩展图片节点配置表单与持久化字段，支持选择 `doubao-seedream-4-5-251128`
  - [x] SubTask 3.2: 为火山引擎模型增加 `size` 选项并限制为 `2K`、`4K`
  - [x] SubTask 3.3: 校验节点保存、回显与运行上下文构建，确保不影响其他图片模型流程

- [x] Task 4: 对齐任务结果与错误码，确保图片生成输出可追踪、可复现。
  - [x] SubTask 4.1: 将同步图片生成结果写入统一任务输出与节点输出快照
  - [x] SubTask 4.2: 映射 `PROVIDER_UNAVAILABLE`、`MODEL_NOT_ENABLED`、`VALIDATION_ERROR` 等标准错误码
  - [x] SubTask 4.3: 保留供应商错误摘要与关键追溯字段，便于排障与审计

- [x] Task 5: 完成联调与验证，覆盖火山引擎图片生成成功与非法参数失败场景。
  - [x] SubTask 5.1: 验证管理端配置、模型可见性与图片节点模型选择流程
  - [x] SubTask 5.2: 验证 `size=2K` 与 `size=4K` 两种图片生成成功路径
  - [x] SubTask 5.3: 验证非法 `size`、供应商不可用、模型未启用三类错误返回结构

- [x] Task 6: 补齐图片资产元数据落库，确保供应商返回的分辨率写入资产记录。
  - [x] SubTask 6.1: 在图片生成资产创建链路中写入 `width` 与 `height`
  - [x] SubTask 6.2: 对齐任务输出、节点输出与资产元数据来源，避免字段口径不一致
  - [x] SubTask 6.3: 补充资产元数据落库相关测试

- [x] Task 7: 补充可复现的联调验证用例，覆盖 `size=2K` 与 `size=4K` 两条成功路径。
  - [x] SubTask 7.1: 增加火山引擎图片 `2K` 成功路径自动化验证
  - [x] SubTask 7.2: 增加火山引擎图片 `4K` 成功路径自动化验证
  - [x] SubTask 7.3: 统一整理验证命令与断言，确保本地可重复执行

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1] and [Task 2]
- [Task 4] depends on [Task 2] and [Task 3]
- [Task 5] depends on [Task 4]
- [Task 6] depends on [Task 4]
- [Task 7] depends on [Task 6]

# Tasks
- [x] Task 1: 梳理文档约束并确定新增供应商与视频模型示例的字段口径。
  - [x] SubTask 1.1: 对齐 `docs/api-design.md` 中网关接口、任务查询与错误结构
  - [x] SubTask 1.2: 对齐 `docs/technical-architecture.md` 中供应商适配与视频异步链路约束
  - [x] SubTask 1.3: 产出本次文档示例所需变量与响应字段清单

- [x] Task 2: 更新 `API_CURL_EXAMPLES.md`，新增供应商配置与新视频模型调用示例。
  - [x] SubTask 2.1: 增加新供应商配置章节（含配置请求、状态核验响应）
  - [x] SubTask 2.2: 增加新视频模型提交章节（含请求示例与 202 响应）
  - [x] SubTask 2.3: 增加新视频模型轮询章节（含处理中/完成态示例）

- [x] Task 3: 完善错误案例并统一文档结构。
  - [x] SubTask 3.1: 补充供应商未配置、模型未启用、参数不合法等错误示例
  - [x] SubTask 3.2: 调整章节顺序与标题，保证联调流程从配置到调用闭环
  - [x] SubTask 3.3: 复核变量命名、Header、路径与 JSON 字段一致性

- [x] Task 4: 执行文档验收与回归检查。
  - [x] SubTask 4.1: 按文档顺序逐步核查命令可执行性（静态审阅）
  - [x] SubTask 4.2: 核查示例返回字段与现有统一响应结构是否冲突
  - [x] SubTask 4.3: 记录本次变更影响点并完成 checklist 勾选

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 2]
- [Task 4] depends on [Task 3]

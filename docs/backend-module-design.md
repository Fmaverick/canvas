# AI 内容生产平台后端模块设计

## 1. 文档目标

本文档用于把平台后端拆分为可开发的业务模块、基础设施模块和异步执行模块，明确模块职责、依赖关系与推荐边界。

关联文档：

- `docs/technical-architecture.md`
- `docs/database-design.md`
- `docs/api-design.md`
- `docs/canvas-node-spec.md`

## 2. 总体设计原则

- 业务模块按领域拆分
- 模型调用与业务逻辑分层
- API 层不直接依赖供应商 SDK
- 同步请求与异步任务解耦
- 权限校验前置
- 关键模块保持可替换性

## 3. 后端层次结构

建议使用四层结构：

- Interface Layer
- Application Layer
- Domain Layer
- Infrastructure Layer

## 4. 分层职责

### 4.1 Interface Layer

负责：

- API Route
- 请求解析
- 参数校验
- 鉴权接入
- 响应组装

不负责：

- 复杂业务编排
- 模型调用
- SQL 细节

### 4.2 Application Layer

负责：

- 用例编排
- 事务边界
- 权限调用
- 多服务协作
- 返回 DTO

典型例子：

- 创建画布
- 创建节点
- 运行节点
- 重试任务

### 4.3 Domain Layer

负责：

- 实体定义
- 领域规则
- 状态机
- 业务校验
- 仓储接口

典型规则：

- 画布图不能成环
- 节点运行依赖必须满足
- 任务状态流转合法

### 4.4 Infrastructure Layer

负责：

- 数据库实现
- Redis
- 队列
- 对象存储
- AI 适配器
- 日志
- 定时任务

## 5. 模块清单

### 5.1 Auth Module

职责：

- 用户登录与注册
- Session / Token 管理
- 当前用户获取
- Admin 独立鉴权

核心接口：

- `login`
- `register`
- `getCurrentUser`
- `loginAdmin`

### 5.2 Workspace Module

职责：

- 个人空间与团队空间管理
- 成员关系
- 角色权限
- 空间级资源隔离

核心接口：

- `listWorkspaces`
- `createWorkspace`
- `inviteMember`
- `changeMemberRole`
- `assertWorkspacePermission`

### 5.3 Library Item Module

职责：

- 主体库与场景库 CRUD
- 标签、类型与关键词搜索
- 资源与素材关联

核心接口：

- `createLibraryItem`
- `updateLibraryItem`
- `deleteLibraryItem`
- `listLibraryItems`

### 5.4 Instruction Preset Module

职责：

- 指令库 CRUD
- personal / workspace 作用域隔离
- 预制 Prompt 与 negative prompt 管理

核心接口：

- `createInstructionPreset`
- `updateInstructionPreset`
- `deleteInstructionPreset`
- `listInstructionPresets`

### 5.5 Asset Module

职责：

- 文件上传凭证
- 文件完成回调
- 资产元数据维护
- 资产归属关系

核心接口：

- `createUploadTicket`
- `completeUpload`
- `attachAsset`
- `deleteAsset`

### 5.6 Canvas Module

职责：

- 画布 CRUD
- 节点管理
- 节点复制
- 边管理
- 防环校验
- 画布结构加载

核心接口：

- `createCanvas`
- `updateCanvas`
- `createNode`
- `duplicateNode`
- `updateNode`
- `deleteNode`
- `createEdge`
- `deleteEdge`
- `validateGraph`

### 5.7 Node Template Module

职责：

- 节点模板创建
- 节点模板更新
- 节点模板删除
- 模板列表与详情
- 从模板创建节点

核心接口：

- `createTemplate`
- `updateTemplate`
- `deleteTemplate`
- `listTemplates`
- `applyTemplateToCanvas`

### 5.8 Node Runtime Module

职责：

- 节点输入组装
- 上下文合并
- 运行前校验
- 创建任务
- 回填节点状态

核心接口：

- `buildNodeExecutionContext`
- `validateNodeRun`
- `runNode`
- `syncNodeRuntimeState`

这是连接画布和任务系统的核心模块。

### 5.9 Task Module

职责：

- 任务创建
- 任务查询
- 任务重试
- 任务取消
- 任务状态流转

核心接口：

- `createTask`
- `getTask`
- `listTasks`
- `retryTask`
- `cancelTask`
- `updateTaskStatus`

### 5.10 AI Gateway Module

职责：

- 接收标准请求
- 路由到对应能力适配器
- 统一错误码
- 统一响应对象

核心接口：

- `generateText`
- `generateImage`
- `generateVideo`
- `generateAudio`
- `getTaskStatus`
- `cancelTask`

### 5.11 Adapter Registry Module

职责：

- 注册适配器
- 按 provider/capability/modelKey 查找适配器
- 模型启停
- 适配器降级

核心接口：

- `registerAdapter`
- `resolveAdapter`
- `isModelEnabled`

### 5.12 Queue Module

职责：

- 任务入队
- 队列消费
- 延迟队列
- 失败重试

建议队列：

- `text_generation_queue`
- `image_generation_queue`
- `audio_generation_queue`
- `video_submit_queue`
- `media_poll_queue`

### 5.13 Runtime Limit Module

职责：

- OpenAI 全局并发控制
- 配额管理
- 分布式锁
- 限流指标采集

核心接口：

- `acquireOpenAIToken`
- `releaseOpenAIToken`
- `getRuntimeLimits`
- `updateRuntimeLimits`

### 5.14 Media Polling Module

职责：

- 定时拉取异步媒体任务
- 批量查询供应商状态
- 更新任务与结果
- 推进下次轮询时间

核心接口：

- `pollPendingTasks`
- `pollTaskStatus`
- `scheduleNextPoll`

### 5.15 Result Module

职责：

- 标准结果写入
- 结果资产化
- 节点输出快照回填

核心接口：

- `saveTaskResult`
- `createResultAsset`
- `writeNodeOutputSnapshot`

### 5.16 Admin Module

职责：

- 后台鉴权
- 平台任务查询
- 模型开关
- 适配器管理
- 限流调整
- 审计日志查看

核心接口：

- `getDashboardSummary`
- `listPlatformTasks`
- `updateProviderConfig`
- `updateAdapterConfig`
- `updateRuntimeLimit`

### 5.17 Audit Module

职责：

- 关键操作记录
- 用户行为追踪
- Admin 操作审计

核心接口：

- `recordAuditLog`

## 6. 模块依赖关系

推荐依赖方向：

```text
Interface
  -> Application
    -> Domain
    -> Infrastructure
```

业务模块间推荐依赖：

- Canvas Module 依赖 Workspace Module 做权限校验
- Node Template Module 依赖 Workspace Module、Canvas Module
- Node Runtime Module 依赖 Canvas Module、Library Item Module、Instruction Preset Module、Node Template Module
- Task Module 依赖 AI Gateway Module、Queue Module、Result Module
- Media Polling Module 依赖 Task Module、AI Gateway Module、Result Module
- Admin Module 依赖 Task Module、Adapter Registry Module、Runtime Limit Module

## 7. 关键用例链路

### 7.1 节点运行链路

```text
API
  -> Auth 校验
  -> Workspace 权限校验
  -> Node Runtime Module 构建上下文
  -> Task Module 创建任务
  -> Queue Module 入队
  -> Worker 消费
  -> AI Gateway Module 调用适配器
  -> Result Module 写结果
  -> Node Runtime Module 回填节点状态
```

### 7.2 异步视频链路

```text
API
  -> Task Module 创建任务
  -> Queue Module 入视频提交队列
  -> Video Worker 提交供应商任务
  -> Task Module 写 provider_task_id
  -> Media Polling Module 定时轮询
  -> Result Module 写回结果
```

### 7.3 异步音频链路

```text
API
  -> Task Module 创建音频任务
  -> Audio Worker 调用音频适配器
  -> 若同步完成则直接写结果
  -> 若异步则转入 Media Polling Module
```

## 8. 推荐代码目录

```text
src/
  application/
    services/
      auth/
      workspace/
      product/
      model-profile/
      asset/
      canvas/
      node-runtime/
      task/
      admin/
  domain/
    entities/
    services/
    repositories/
    policies/
  infrastructure/
    db/
    queue/
    ai/
      adapters/
      registry/
      gateway/
    storage/
    auth/
    audit/
    runtime/
```

## 9. 仓储接口建议

建议每个核心模块优先面向仓储接口编程，例如：

```ts
interface CanvasRepository {
  findById(id: string): Promise<unknown>;
  save(canvas: unknown): Promise<void>;
}

interface TaskRepository {
  create(payload: unknown): Promise<unknown>;
  findById(id: string): Promise<unknown>;
  updateStatus(id: string, status: string): Promise<void>;
}
```

这样可以降低后续从初始化实现迁移到正式数据库实现的成本。

## 10. 事务边界建议

以下场景建议使用事务：

- 创建画布和首批节点
- 删除节点并清理关联边
- 创建任务并更新节点状态为 `queued`
- 轮询成功后同时写任务结果和节点输出快照

以下场景不建议包进长事务：

- 实际模型调用
- 长时间文件上传
- 长时间轮询等待

## 11. 错误处理建议

### 11.1 业务错误

- 权限不足
- 资源不存在
- 图结构非法
- 上游节点失败

### 11.2 平台错误

- 适配器未注册
- 模型未启用
- 供应商限流
- 供应商超时

### 11.3 处理原则

- API 层返回标准错误码
- Application 层负责转换业务异常
- Infrastructure 层返回原始异常时要包装为平台异常

## 12. 并发与一致性建议

- OpenAI 并发令牌必须由 Runtime Limit Module 统一管理
- Task 状态更新必须幂等
- 重试必须检查任务是否已完成
- 同一 `request_id` 不得重复创建任务

## 13. 可观测性建议

每个模块建议打印结构化日志字段：

- `request_id`
- `workspace_id`
- `task_id`
- `node_id`
- `provider`
- `model`
- `status`

每个核心模块建议暴露指标：

- 请求数
- 成功率
- 失败率
- 平均耗时
- 队列积压

## 14. 从现有初始化代码迁移建议

既然当前代码还只是初始化阶段，并允许破坏性改造，建议直接按目标模块重构，不保留旧的本地持久化架构作为主链路。

建议迁移策略：

### 第一步

- 保留 UI 组件层
- 停止把 Dexie 当作主业务存储
- 把 Dexie 降级为临时缓存或直接移除

### 第二步

- 先建立新的服务端数据模型
- 使用 Drizzle ORM 定义 schema 与迁移
- 建立 API Route 层
- 建立 Application Service 层

### 第三步

- 接入 PostgreSQL、Redis、对象存储
- 建立任务系统与 Worker

### 第四步

- 用新的后端模块替换前端本地数据流

## 15. 第一批开发优先模块

建议优先落地顺序：

1. Auth Module
2. Workspace Module
3. Library Item Module
4. Instruction Preset Module
5. Canvas Module
6. Node Template Module
7. Node Runtime Module
8. Task Module
9. AI Gateway Module
10. Queue Module
11. Admin Module

## 16. 开发前待确认事项

- 认证选型使用哪套方案
- ORM 采用 Drizzle ORM，明确不使用 Prisma
- Queue 实现选型
- Redis 部署方式
- Worker 是否与 Web 进程分离部署
- 是否保留 Dexie 作为草稿缓存

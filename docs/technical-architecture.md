# AI 内容生产平台技术架构设计

## 1. 文档目标

本文档用于把 PRD 转换为可开发、可拆分、可评估的技术方案，供前端、后端、AI 平台、数据层和运维协同使用。

关联文档：

- `docs/ai-content-platform-prd.md`
- `docs/database-design.md`
- `docs/api-design.md`
- `docs/development-plan.md`
- `docs/environment-config.md`

## 2. 当前技术基线

基于当前仓库现状，建议按以下技术基线继续演进：

- 前端框架：Next.js 16 App Router
- UI 层：React 19
- 语言：TypeScript
- 状态管理：Zustand
- 校验：Zod
- 当前本地数据能力：Dexie
- 数据库 ORM：不使用 Prisma，建议使用 Drizzle ORM

面向正式业务落地时，建议增加以下服务能力：

- 主数据库：PostgreSQL
- 队列与限流：Redis
- 对象存储：S3 兼容存储
- 定时任务：Cron / Queue Worker
- 日志与监控：结构化日志 + 指标采集
- 数据库迁移工具：drizzle-kit

## 3. 总体架构

建议采用“前台应用 + 平台 API + AI 网关 + 异步任务系统 + 持久化存储”的分层结构。

### 3.1 架构分层

#### 表现层

- Web 前台
- Admin 后台
- 画布编辑器

#### 应用层

- 鉴权与空间权限
- 产品库服务
- 模特库服务
- 画布编排服务
- 任务中心服务

#### AI 平台层

- Prompt 组装器
- 模型网关
- 适配器注册中心
- 并发控制器
- 任务编排器

#### 基础设施层

- PostgreSQL
- Redis
- 对象存储
- 定时任务执行器
- 日志与监控系统

## 4. 推荐目录演进

当前项目还处于较轻量结构，建议在不破坏现有代码的前提下，逐步演进为以下结构：

```text
src/
  app/
    (marketing)/
    (workspace)/
    admin/
    api/
  application/
    services/
    use-cases/
    dto/
  domain/
    entities/
    value-objects/
    repositories/
    services/
  infrastructure/
    db/
    auth/
    queue/
    ai/
      adapters/
      gateway/
      prompt/
    storage/
    logger/
  components/
    canvas/
    workspace/
    admin/
    ui/
  lib/
  hooks/
```

## 5. 核心子系统拆分

### 5.1 账号与权限子系统

负责以下能力：

- 用户登录与注册
- 空间切换
- 团队成员关系
- 角色权限校验
- Admin 独立鉴权

建议规则：

- 业务数据一律绑定 `workspace_id`
- API 层做空间权限校验
- Admin 与普通用户鉴权体系分离

### 5.2 资产管理子系统

负责管理：

- 产品库
- 模特库
- 上传文件
- 标签与筛选
- 资产引用关系

建议设计：

- 资产元数据入 PostgreSQL
- 原始文件入对象存储
- 数据库仅保存文件 URL、MIME、尺寸、时长、哈希等元信息

### 5.3 画布编排子系统

负责：

- 节点管理
- 节点复制
- 节点模板
- 连接管理
- 节点参数管理
- 上下文合并
- 运行状态回填

画布节点一期支持：

- 文本节点
- 图片节点
- 视频节点
- 音频节点

建议原则：

- 画布结构持久化存储
- 节点输出做快照
- 连接关系禁止成环
- 节点状态与任务状态分开建模
- 节点复制默认只复制节点本体，不自动复制关联边
- 节点模板支持个人模板、空间模板和系统模板

### 5.4 AI 网关子系统

负责：

- 统一文本、图片、视频、音频生成接口
- 适配器注册与分发
- 统一错误码
- 统一任务状态
- 供应商能力抽象

建议接口：

- `generateText`
- `generateImage`
- `generateVideo`
- `generateAudio`
- `getTaskStatus`
- `cancelTask`

### 5.5 异步任务子系统

负责：

- 任务入队
- 队列消费
- 并发控制
- 轮询调度
- 重试
- 状态更新

建议最小队列集合：

- 文本生成队列
- 图片生成队列
- 音频生成队列
- 视频提交队列
- 媒体轮询队列

## 6. 关键技术决策

### 6.1 为什么业务数据不能继续只依赖 Dexie

Dexie 适合本地离线或轻量单机数据，但当前业务已经明确需要：

- 个人与团队空间
- 平台 Admin
- 跨设备同步
- 队列任务
- 异步轮询
- 审计日志

因此正式业务数据应迁移到服务端数据库。Dexie 可以保留用于前端临时缓存、草稿和本地编辑态。

### 6.2 为什么需要 Redis

因为系统存在以下需求：

- 全局并发 50 的信号量控制
- 多队列消费
- 定时轮询调度
- 分布式锁
- 重试与延迟队列

这些能力更适合使用 Redis 作为任务协调层。

### 6.3 为什么要把节点状态与任务状态分离

节点是画布上的业务对象，任务是执行对象，两者关注点不同：

- 节点关注最终展示和可编辑状态
- 任务关注执行生命周期

一个节点可以对应多次任务执行，因此不应混为一个状态字段。

## 7. AI 适配器架构

### 7.1 统一抽象

建议每种模型能力都实现统一接口：

```ts
type AdapterCapability = "text" | "image" | "video" | "audio";

interface StandardGenerateRequest {
  workspaceId: string;
  taskType: AdapterCapability;
  provider: string;
  model: string;
  prompt?: string;
  assets?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  requestId: string;
}

interface StandardGenerateResponse {
  taskId: string;
  provider: string;
  model: string;
  status: "queued" | "dispatched" | "processing" | "succeeded" | "failed";
  output?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  rawResponse?: unknown;
}
```

### 7.2 适配器职责

- 参数标准化
- 请求签名与鉴权
- 供应商请求发送
- 返回结构归一化
- 状态转换
- 错误归类

### 7.3 适配器注册中心

建议实现一个注册中心：

- 按 `provider + capability` 注册
- 根据 `model_key` 解析适配器
- 支持模型开关、降级与灰度

## 8. 并发控制方案

### 8.1 全局策略

- OpenAI 全局并发上限：50
- 不按用户独占配额
- 支持后台动态调节

### 8.2 实现建议

- Redis 维护 semaphore
- Worker 获取令牌后才可真正调用模型
- 请求完成后立即释放令牌
- 超时必须兜底释放

### 8.3 建议配额

- 文本类：20
- 图片类相关文本加工：10
- 音频类相关文本加工：10
- 系统轮询与保底任务：10

## 9. 异步媒体任务方案

### 9.1 适用对象

- 视频生成
- 异步音频生成
- 异步图片生成

### 9.2 生命周期

- `queued`
- `dispatched`
- `processing`
- `succeeded`
- `failed`
- `canceled`

### 9.3 执行过程

1. 创建平台任务
2. 提交供应商任务
3. 保存 `provider_task_id`
4. 设置 `next_poll_at`
5. 定时批量轮询
6. 回写结果和元数据

## 10. 画布运行机制

### 10.1 节点执行输入

- 当前节点输入
- 上游节点输出
- 产品引用信息
- 模特引用信息
- 模板提示词

### 10.2 节点执行约束

- 不允许循环依赖
- 上游失败节点默认阻断执行
- 支持只引用上一个节点或聚合全部上游节点

### 10.3 节点输出结构建议

- 文本节点：文本内容、结构化 JSON
- 图片节点：图片 URL、缩略图、尺寸、参考图关系
- 视频节点：视频 URL、封面图、时长、分辨率
- 音频节点：音频 URL、波形图、时长、格式、文本稿

## 11. Admin 架构建议

### 11.1 鉴权

- 独立后台登录入口
- 用户名和密码来源于环境变量
- 生产环境仅存哈希密码

### 11.2 功能模块

- 用户管理
- 空间管理
- 模型管理
- 适配器管理
- 任务监控
- 队列监控
- 审计日志

## 12. 非功能需求落地

### 12.1 安全

- API 必须做空间权限校验
- 管理端与用户端鉴权隔离
- 不向前端暴露供应商密钥
- 上传文件做类型校验

### 12.2 可观测性

- 每个任务打印结构化日志
- 每个供应商调用有 trace id
- 每个队列有积压指标
- 每个模型有成功率和耗时指标

### 12.3 可恢复性

- 任务状态必须持久化
- Worker 重启后可从数据库恢复待执行和待轮询任务
- 超时任务支持后台重试

## 13. 开发顺序建议

### 第一阶段

- 完成数据库模型
- 完成鉴权与空间模型
- 完成文件上传链路

### 第二阶段

- 完成产品库与模特库
- 完成画布数据结构
- 完成节点和边的 CRUD

### 第三阶段

- 完成 AI 网关与适配器框架
- 完成任务队列
- 完成 OpenAI 并发控制

### 第四阶段

- 完成视频与音频异步轮询
- 完成任务中心
- 完成 Admin 后台

## 14. 开发前待确认事项

- 数据库 ORM 选型
- Redis 与对象存储部署方式
- 登录方式是否支持第三方 OAuth
- 文件上传大小和格式限制
- 第一阶段接入的图片、视频、音频模型名单
- 是否需要 webhook 与轮询并存

# AI 内容生产平台画布节点协议

## 1. 文档目标

本文档用于定义画布节点的统一协议，作为前端画布、后端存储、任务调度、AI 适配器和任务中心之间的公共契约。

关联文档：

- `docs/ai-content-platform-prd.md`
- `docs/technical-architecture.md`
- `docs/database-design.md`
- `docs/api-design.md`

## 2. 设计原则

- 节点协议必须前后端统一
- 节点定义与任务定义解耦
- 节点类型可扩展
- 节点输入输出必须可持久化
- 节点配置必须支持版本演进
- 单节点运行和链路运行共用同一协议

## 3. 节点模型概览

每个节点由四部分组成：

- 元信息
- 输入定义
- 运行配置
- 输出快照

建议把节点理解为“可编排的业务单元”，而不是直接等同于一次模型调用。

## 4. 节点类型

一期支持以下类型：

- `text`
- `storyboard`
- `image`
- `video`
- `audio`

后续可扩展：

- `batch_result`
- `group`
- `condition`
- `template`
- `transform`

## 5. 标准节点结构

```ts
type CanvasNodeType = "text" | "storyboard" | "image" | "video" | "audio" | "batch_result";

type NodeRuntimeStatus =
  | "idle"
  | "queued"
  | "processing"
  | "succeeded"
  | "failed";

interface CanvasNode {
  id: string;
  canvasId: string;
  workspaceId: string;
  type: CanvasNodeType;
  title: string;
  description?: string;
  version: number;
  position: {
    x: number;
    y: number;
  };
  input: NodeInputPayload;
  config: NodeConfigPayload;
  refs: NodeReferencePayload;
  origin: NodeOriginPayload;
  output?: NodeOutputSnapshot;
  runtime: NodeRuntimePayload;
  createdAt: string;
  updatedAt: string;
}
```

## 6. 标准输入结构

```ts
interface NodeInputPayload {
  promptText?: string;
  systemTemplateId?: string;
  customInstructions?: string;
  useUpstreamOutputs: boolean;
  upstreamMergeMode: "previous_only" | "merge_all" | "custom";
  upstreamNodeIds?: string[];
}
```

字段说明：

- `promptText`：节点主输入
- `systemTemplateId`：系统模板标识
- `customInstructions`：用户自定义补充要求
- `useUpstreamOutputs`：是否启用上游输出
- `upstreamMergeMode`：上游合并方式
- `upstreamNodeIds`：仅在自定义模式下生效

## 7. 节点来源结构

```ts
interface NodeOriginPayload {
  sourceType: "manual" | "duplicate" | "template";
  copiedFromNodeId?: string;
  appliedTemplateId?: string;
}
```

说明：

- `manual`：用户手动新建
- `duplicate`：由已有节点复制产生
- `template`：由节点模板生成

## 8. 引用资源结构

```ts
interface NodeReferencePayload {
  subjectIds: string[];
  sceneIds: string[];
  instructionPresetIds: string[];
  assetIds: string[];
}
```

说明：

- `subjectIds`：引用主体库对象，统一承载产品主体、人物主体、IP 主体等
- `sceneIds`：引用场景库对象
- `instructionPresetIds`：引用指令库中的预制 Prompt
- `assetIds`：引用额外媒体资源

## 9. 运行配置结构

```ts
interface NodeConfigPayload {
  modelKey: string;
  provider?: string;
  capability: "text" | "image" | "video" | "audio";
  timeoutMs?: number;
  retryLimit?: number;
  params: Record<string, unknown>;
}
```

说明：

- `modelKey`：业务层模型键
- `provider`：可选供应商名
- `capability`：与节点类型一致
- `params`：各节点类型特有参数

## 10. 输出快照结构

```ts
interface NodeOutputSnapshot {
  taskId?: string;
  outputType: "text" | "image" | "video" | "audio" | "json";
  content?: string;
  assets?: Array<{
    assetId: string;
    assetType: "image" | "video" | "audio";
    url: string;
    mimeType?: string;
    durationMs?: number;
    width?: number;
    height?: number;
  }>;
  structuredData?: Record<string, unknown>;
  generatedAt: string;
}
```

## 11. 运行时状态结构

```ts
interface NodeRuntimePayload {
  status: NodeRuntimeStatus;
  latestTaskId?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  lastStartedAt?: string;
  lastFinishedAt?: string;
}
```

## 12. 边协议

```ts
interface CanvasEdge {
  id: string;
  canvasId: string;
  sourceNodeId: string;
  targetNodeId: string;
  mergeMode: "previous_only" | "merge_all" | "custom";
  priority: number;
}
```

约束：

- 不允许自连接
- 不允许闭环
- 同一对节点只允许一条有效边

## 13. 节点类型详细协议

### 12.1 文本节点

#### 用途

- 文案生成
- Prompt 优化
- 视频脚本
- 音频脚本
- 结构化 JSON 输出

#### params 建议

```ts
interface TextNodeParams {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "markdown" | "json";
  language?: string;
}
```

#### 输出

- 文本内容
- 结构化 JSON

### 12.2 分镜节点

#### 用途

- 剧情分镜拆解
- 连续镜头规划
- 视频镜头脚本输出
- 结构化 shot JSON 输出

#### params 建议

```ts
interface StoryboardNodeParams {
  shotCount?: number;
  responseFormat?: "json";
  templateFile?: string;
}
```

#### 输出

- 结构化 JSON
- `shots` 数组
- 可直接复用的视频镜头 prompt

### 12.3 图片节点

#### 用途

- 商品图生成
- 海报图生成
- 参考图二创

#### params 建议

```ts
interface ImageNodeParams {
  width?: number;
  height?: number;
  style?: string;
  referenceImageIds?: string[];
  negativePrompt?: string;
}
```

#### 输出

- 图片 URL
- 缩略图
- 尺寸信息

### 12.4 视频节点

#### 用途

- 商品展示视频
- 镜头动画视频
- 图生视频

#### params 建议

```ts
interface VideoNodeParams {
  durationSec?: number;
  resolution?: "720p" | "1080p";
  fps?: number;
  firstFrameAssetId?: string;
  lastFrameAssetId?: string;
  motionStrength?: number;
}
```

#### 输出

- 视频 URL
- 封面图
- 时长
- 分辨率

### 12.5 音频节点

#### 用途

- 品牌口播
- 角色配音
- 背景音乐
- 环境音
- 歌词演唱

#### params 建议

```ts
interface AudioNodeParams {
  durationSec?: number;
  voiceStyle?: string;
  speed?: number;
  emotion?: string;
  backgroundStyle?: string;
  outputFormat?: "mp3" | "wav" | "aac";
  lyricsMode?: boolean;
}
```

#### 输出

- 音频 URL
- 时长
- 音频格式
- 波形图资源
- 可选转写文本

### 12.6 批量产出节点

#### 用途

- 承接一次批量执行的结果集合
- 集中展示同一工作流或同一节点的多轮生成结果
- 作为批量执行后的结果汇总节点，避免在画布上直接铺开大量重复结果节点

#### params 建议

```ts
interface BatchResultNodeParams {
  batchRunId: string;
  resultType: "image" | "video" | "audio" | "text" | "mixed";
  itemCount?: number;
  sourceMode: "single_node" | "group";
  sourceNodeIds: string[];
  terminalNodeId?: string;
  allowExpandToStandaloneNodes?: boolean;
}
```

#### 输出

- 批量结果列表
- 每条结果的预览资源
- 每条结果的下载信息
- 每条结果的状态和错误信息
- 可选的结果拆分入口

## 14. 节点复制协议

### 14.1 复制规则

- 用户可在同一画布内复制节点
- 默认复制节点本体、输入、配置、引用资源和来源信息
- 默认不复制上下游边
- 复制后的节点位置默认在原节点基础上偏移
- 复制后的节点状态重置为 `idle`
- 复制后的节点不继承原节点输出快照和运行态

### 14.2 复制后的来源标记

- `origin.sourceType = "duplicate"`
- `origin.copiedFromNodeId = 原节点 ID`

## 15. 节点模板协议

### 15.1 模板对象

```ts
interface NodeTemplate {
  id: string;
  workspaceId?: string;
  createdBy: string;
  scope: "personal" | "workspace" | "system";
  type: CanvasNodeType;
  name: string;
  description?: string;
  promptText?: string;
  modelKey?: string;
  settings: Record<string, unknown>;
  refs: NodeReferencePayload;
  tags: string[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}
```

### 15.2 模板使用规则

- 用户可以把当前节点保存为模板
- 用户可以从模板直接创建新节点
- 模板分为个人模板、空间模板、系统模板
- 从模板创建的新节点状态初始化为 `idle`

### 15.3 从模板创建节点的来源标记

- `origin.sourceType = "template"`
- `origin.appliedTemplateId = 模板 ID`

## 16. 上下文合并协议

### 13.1 合并来源

- 当前节点输入
- 上游节点输出
- 主体引用
- 场景引用
- 指令库引用
- 资源引用
- 系统模板

### 13.2 合并优先级

从高到低：

1. 当前节点手动输入
2. 当前节点 params 中的显式设置
3. 上游节点输出
4. 主体与场景上下文
5. 指令库预制 Prompt
6. 系统模板默认值

### 13.3 各节点合并行为

#### 文本节点

- 上游文本拼接为 Prompt
- 上游图片生成描述引用
- 上游视频提取脚本摘要
- 上游音频提取文本稿或情绪描述

#### 分镜节点

- 上游文本与分镜结果拼接为镜头简报
- 输出保持 JSON 结构
- 模板文件定义字段骨架
- 生成结果可继续作为视频节点 Prompt 来源

#### 图片节点

- 上游文本作为 Prompt
- 上游图片作为参考图
- 上游视频封面可作为视觉参考
- 上游音频可提取风格标签参与描述

#### 视频节点

- 上游文本作为脚本和镜头说明
- 上游图片作为首帧或风格参考
- 上游音频作为配乐或节奏参考

#### 音频节点

- 上游文本作为旁白、歌词、对白脚本
- 上游图片作为氛围描述来源
- 上游视频作为节奏和镜头感来源

## 17. 节点运行协议

### 17.1 单节点运行请求

```ts
interface RunNodeRequest {
  requestId: string;
  nodeId: string;
  canvasId: string;
  useUpstreamOutputs: boolean;
  mergeStrategy: "previous_only" | "merge_all" | "custom";
  overrideSettings?: Record<string, unknown>;
}
```

### 17.2 单节点运行返回

```ts
interface RunNodeResponse {
  taskId: string;
  status: "queued" | "dispatched" | "processing";
}
```

## 18. 节点状态机

```text
idle
  -> queued
  -> processing
  -> succeeded
  -> failed
```

重试路径：

```text
failed -> queued
succeeded -> queued
```

说明：

- 节点支持基于历史结果重新生成
- 节点状态由最新任务驱动，但保留输出快照

## 19. 前端渲染协议

前端至少需要基于协议渲染以下区域：

- 节点标题
- 节点图标
- 输入区
- 参数区
- 引用资源区
- 上游引用区
- 节点来源区
- 输出预览区
- 状态区

## 20. 输出预览建议

### 文本节点

- 纯文本预览
- Markdown 预览
- JSON 折叠预览

### 图片节点

- 缩略图
- 查看原图
- 下载

### 视频节点

- 封面图
- 播放器
- 元数据

### 音频节点

- 播放器
- 波形预览
- 文本稿

## 21. 存储映射建议

### canvas_nodes 表

- `type`
- `title`
- `created_by`
- `copied_from_node_id`
- `applied_template_id`
- `prompt_input`
- `settings_json`
- `resource_refs`
- `output_snapshot`
- `status`

### canvas_edges 表

- `source_node_id`
- `target_node_id`
- `merge_mode`
- `priority`

### node_templates 表

- `scope`
- `type`
- `name`
- `prompt_input`
- `model_key`
- `settings_json`
- `resource_refs`
- `tags`

## 22. 版本演进策略

- 节点协议增加 `version`
- 新字段优先追加，不破坏旧字段
- 节点 params 应按类型拆分校验
- 运行时做 schema 兼容转换

## 23. 开发建议

### 前端优先完成

- 节点通用卡片容器
- 四类节点表单 schema
- 边的可视化与防环逻辑
- 节点复制交互
- 模板保存与模板应用交互
- 输出预览组件

### 后端优先完成

- 节点协议校验器
- 上下文合并器
- 节点复制器
- 节点模板服务
- 节点运行器
- 节点输出回填器

## 24. 开发前待确认项

- 是否需要画布级批量运行协议
- 是否引入条件节点
- 是否支持节点输出作为模板变量显式引用
- 音频输出是否要强制转写文本
- 节点模板是否支持平台内置推荐模板

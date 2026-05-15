# canvas

**An AI-native creative workspace for turning ideas into structured visual workflows.**  
**一个把创意变成结构化视觉工作流的 AI 原生创作工作台。**

`canvas` is built around a simple belief: creative work gets easier when assets, prompts, tasks, and outputs live in one shared operating surface instead of being scattered across tools.  
`canvas` 的核心判断很简单：当素材、提示词、任务和结果都被收进同一个工作台，创作工作就会比在一堆分散工具之间切换轻很多。

Instead of treating generation as a single prompt box, `canvas` treats it as a collaborative system:
`canvas` 不把生成理解成一个孤立的输入框，而是把它当成一个可协作、可复用、可追踪的系统：

- infinite-canvas style visual planning  
  以无限画布的方式组织创意与生成链路
- shared workspaces with role-based collaboration  
  支持团队 workspace 和角色权限协作
- reusable subject, scene, and instruction libraries  
  沉淀可复用的主体库、场景库和指令库
- task execution across text, image, and video workflows  
  承接文本、图片、视频等多模态任务运行
- result tracking, retries, and workspace-level operations  
  跟踪结果、失败重试和 workspace 级别任务管理

## Why this exists / 为什么做它

Most AI creation tools optimize for one-shot generation.  
I’m more interested in the layer above that: how teams actually organize assets, iterate prompts, run tasks, and keep context alive across a full workflow.

大多数 AI 创作工具优化的是“一次生成”。  
我更关心的是上面那一层：团队到底怎么组织素材、迭代提示词、发起任务，以及在完整工作流里保持上下文连续。

That is the product direction behind `canvas`.  
这就是 `canvas` 这款产品的方向。

## What it includes / 当前能力

- workspace-aware task and asset management  
  面向 workspace 的任务与资产管理
- canvas nodes for planning, generation, and review  
  面向规划、生成和回看的画布节点系统
- library layers for reusable creative context  
  让创作上下文可复用的资源库层
- multi-provider AI workflow infrastructure  
  面向多供应商的 AI 工作流基础设施
- session, permissions, and operational product scaffolding  
  真实 session、权限与产品化运行骨架

## Tech Stack / 技术栈

- Next.js
- TypeScript
- React
- Drizzle ORM
- PostgreSQL
- Tailwind CSS

## Run locally / 本地运行

```bash
npm install
npm run dev
```

## Demo / 在线体验

[Live demo](https://canvas-cyan-pi.vercel.app)

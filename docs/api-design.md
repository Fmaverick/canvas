# AI 内容生产平台 API 设计

## 1. 文档目标

本文档定义前后端开发联调所需的核心接口范围、请求响应规范、鉴权约定和错误模型。

## 2. 设计原则

- REST 风格优先
- 所有业务接口默认带空间上下文
- 响应结构统一
- 错误码统一
- 异步任务统一返回平台任务 ID

## 3. 基础约定

### 3.1 Base URL

- 前台业务接口：`/api`
- Admin 接口：`/api/admin`
- AI 网关接口：`/api/ai`

### 3.2 鉴权方式

- 用户侧：Bearer Token / Session Cookie
- Admin 侧：独立 Admin Session

### 3.3 通用 Header

- `Authorization`
- `Content-Type: application/json`
- `X-Workspace-Id`
- `X-Request-Id`

### 3.4 通用响应结构

```json
{
  "success": true,
  "data": {},
  "error": null,
  "request_id": "req_xxx"
}
```

### 3.5 通用错误结构

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "任务不存在"
  },
  "request_id": "req_xxx"
}
```

## 4. 鉴权与空间接口

### 4.1 登录

- `POST /api/auth/login`

请求体：

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

### 4.2 注册

- `POST /api/auth/register`

### 4.3 获取当前用户

- `GET /api/auth/me`

### 4.4 获取空间列表

- `GET /api/workspaces`

返回重点字段：

- `id`
- `name`
- `type`
- `role`

### 4.5 创建团队空间

- `POST /api/workspaces`

## 5. 团队接口

### 5.1 获取成员列表

- `GET /api/workspaces/:workspaceId/members`

### 5.2 邀请成员

- `POST /api/workspaces/:workspaceId/members`

### 5.3 修改成员角色

- `PATCH /api/workspaces/:workspaceId/members/:memberId`

### 5.4 移除成员

- `DELETE /api/workspaces/:workspaceId/members/:memberId`

## 6. 主体库 / 场景库接口

### 6.1 获取资源列表

- `GET /api/library-items`

查询参数：

- `kind` = `subject` / `scene`
- `keyword`
- `tag`
- `page`
- `page_size`

### 6.2 获取资源详情

- `GET /api/library-items/:id`

### 6.3 创建资源

- `POST /api/library-items`

请求体示例：

```json
{
  "kind": "subject",
  "entity_type": "product",
  "name": "夏季连衣裙主体",
  "description": "轻薄面料，适合棚拍和电商主图",
  "prompt_hints": "soft daylight, premium fabric, clean composition",
  "tags": ["夏季", "女装", "电商"]
}
```

### 6.4 更新资源

- `PATCH /api/library-items/:id`

### 6.5 删除资源

- `DELETE /api/library-items/:id`

## 7. 指令库接口

### 7.1 获取指令列表

- `GET /api/instruction-presets`

### 7.2 获取指令详情

- `GET /api/instruction-presets/:id`

### 7.3 创建指令

- `POST /api/instruction-presets`

请求体示例：

```json
{
  "scope": "workspace",
  "name": "商品棚拍主视觉",
  "description": "适合商品文生图与图生图的主视觉 Prompt",
  "prompt_template": "premium product photography, studio lighting, clean background",
  "negative_prompt": "blurry, deformed, extra fingers",
  "tags": ["文生图", "棚拍", "商业摄影"]
}
```

### 7.4 更新指令

- `PATCH /api/instruction-presets/:id`

### 7.5 删除指令

- `DELETE /api/instruction-presets/:id`

## 8. 画布接口

### 8.1 获取画布列表

- `GET /api/canvases`

### 8.2 获取画布详情

- `GET /api/canvases/:id`

建议返回：

- 画布基本信息
- 节点列表
- 边列表
- 最近任务摘要

### 8.3 创建画布

- `POST /api/canvases`

### 8.4 更新画布

- `PATCH /api/canvases/:id`

### 8.5 删除画布

- `DELETE /api/canvases/:id`

## 9. 画布节点接口

### 9.1 创建节点

- `POST /api/canvases/:canvasId/nodes`

请求体示例：

```json
{
  "type": "audio",
  "title": "品牌口播",
  "prompt_input": "生成一段 15 秒品牌口播",
  "model_key": "audio.default",
  "settings_json": {
    "duration_sec": 15,
    "voice_style": "female_warm"
  },
  "resource_refs": {
    "subject_ids": ["subject_1"],
    "scene_ids": ["scene_1"],
    "instruction_preset_ids": ["instruction_1"]
  },
  "position_x": 320,
  "position_y": 180
}
```

### 9.2 更新节点

- `PATCH /api/canvases/:canvasId/nodes/:nodeId`

### 9.3 删除节点

- `DELETE /api/canvases/:canvasId/nodes/:nodeId`

### 9.4 复制节点

- `POST /api/canvases/:canvasId/nodes/:nodeId/duplicate`

请求体示例：

```json
{
  "title": "品牌口播副本",
  "offset": {
    "x": 40,
    "y": 40
  },
  "copy_edges": false
}
```

说明：

- 默认只复制节点本体、参数和资源引用
- 默认不复制上下游边，避免自动生成复杂依赖关系

### 9.5 创建连接

- `POST /api/canvases/:canvasId/edges`

请求体示例：

```json
{
  "source_node_id": "node_1",
  "target_node_id": "node_2",
  "merge_mode": "merge_all",
  "priority": 1
}
```

### 9.6 删除连接

- `DELETE /api/canvases/:canvasId/edges/:edgeId`

## 10. 节点模板接口

### 10.1 获取模板列表

- `GET /api/node-templates`

查询参数：

- `scope`
- `type`
- `keyword`
- `page`
- `page_size`

### 10.2 获取模板详情

- `GET /api/node-templates/:templateId`

### 10.3 创建模板

- `POST /api/node-templates`

请求体示例：

```json
{
  "scope": "personal",
  "type": "audio",
  "name": "品牌口播模板",
  "description": "适合 15 秒商品卖点播报",
  "prompt_input": "围绕产品卖点生成一段口播",
  "model_key": "audio.default",
  "settings_json": {
    "duration_sec": 15,
    "voice_style": "female_warm"
  },
  "resource_refs": {
    "subject_ids": [],
    "scene_ids": [],
    "instruction_preset_ids": [],
    "asset_ids": []
  },
  "tags": ["口播", "商品"]
}
```

### 10.4 更新模板

- `PATCH /api/node-templates/:templateId`

### 10.5 删除模板

- `DELETE /api/node-templates/:templateId`

### 10.6 从模板创建节点

- `POST /api/canvases/:canvasId/nodes/from-template`

请求体示例：

```json
{
  "template_id": "tpl_123",
  "title": "从模板创建的品牌口播",
  "position_x": 400,
  "position_y": 240
}
```

## 11. 节点执行接口

### 11.1 发起节点生成

- `POST /api/canvases/:canvasId/nodes/:nodeId/run`

请求体示例：

```json
{
  "request_id": "req_node_run_001",
  "use_upstream_outputs": true,
  "merge_strategy": "merge_all",
  "override_settings": {
    "duration_sec": 20
  }
}
```

返回示例：

```json
{
  "success": true,
  "data": {
    "task_id": "task_123",
    "status": "queued"
  },
  "error": null,
  "request_id": "req_node_run_001"
}
```

### 11.2 获取节点最近结果

- `GET /api/canvases/:canvasId/nodes/:nodeId/result`

## 12. 任务中心接口

### 11.1 获取任务列表

- `GET /api/tasks`

查询参数：

- `status`
- `task_type`
- `provider`
- `canvas_id`
- `node_id`
- `page`
- `page_size`

### 11.2 获取任务详情

- `GET /api/tasks/:taskId`

### 11.3 查询任务状态

- `GET /api/tasks/:taskId/status`

返回重点字段：

- `task_id`
- `status`
- `progress`
- `provider_task_id`
- `result`
- `error`

### 11.4 重试任务

- `POST /api/tasks/:taskId/retry`

### 11.5 取消任务

- `POST /api/tasks/:taskId/cancel`

## 13. AI 网关接口

这些接口通常由应用服务内部调用，也可保留为内部 API。

### 12.1 文本生成

- `POST /api/ai/text/generate`

### 12.2 图片生成

- `POST /api/ai/image/generate`

### 12.3 视频生成

- `POST /api/ai/video/generate`

### 12.4 音频生成

- `POST /api/ai/audio/generate`

### 12.5 任务查询

- `GET /api/ai/tasks/:taskId`

### 12.6 任务取消

- `POST /api/ai/tasks/:taskId/cancel`

## 14. 上传接口

### 13.1 获取上传凭证

- `POST /api/uploads/presign`

请求体：

```json
{
  "file_name": "demo.png",
  "mime_type": "image/png",
  "owner_type": "product",
  "owner_id": "prod_1"
}
```

### 13.2 提交上传完成

- `POST /api/uploads/complete`

## 15. Admin 接口

### 14.1 Admin 登录

- `POST /api/admin/auth/login`

### 14.2 获取平台任务概览

- `GET /api/admin/dashboard`

### 14.3 获取任务列表

- `GET /api/admin/tasks`

### 14.4 获取失败任务

- `GET /api/admin/tasks/failed`

### 14.5 更新模型开关

- `PATCH /api/admin/providers/:id`

### 14.6 更新适配器配置

- `PATCH /api/admin/adapters/:id`

### 14.7 更新限流配置

- `PATCH /api/admin/runtime/limits`

## 16. 错误码建议

### 15.1 通用错误

- `UNAUTHORIZED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `NOT_FOUND`
- `CONFLICT`
- `INTERNAL_ERROR`

### 15.2 任务错误

- `TASK_NOT_FOUND`
- `TASK_ALREADY_FINISHED`
- `TASK_RETRY_EXCEEDED`
- `UPSTREAM_NODE_FAILED`
- `NODE_GRAPH_INVALID`
- `NODE_TEMPLATE_NOT_FOUND`
- `NODE_DUPLICATE_INVALID`

### 15.3 模型错误

- `MODEL_NOT_ENABLED`
- `PROVIDER_RATE_LIMITED`
- `PROVIDER_TIMEOUT`
- `PROVIDER_BAD_REQUEST`
- `ADAPTER_NOT_FOUND`

## 17. 联调顺序建议

1. 鉴权与空间接口
2. 产品库与模特库接口
3. 画布 CRUD 接口
4. 节点与边接口
5. 节点运行与任务中心接口
6. Admin 监控接口

## 18. 需要继续细化的点

- 分页字段命名是否统一为 `page` / `page_size`
- 上传接口是否支持分片
- 节点运行接口是否需要批量执行
- Admin 接口是否需要更细粒度权限

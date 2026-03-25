# AI 内容生产平台数据库设计

## 1. 文档目标

本文档用于定义核心数据实体、字段建议、关系约束与建表优先级，供后端开发、数据库建模和接口联调使用。

## 2. 设计原则

- 所有业务数据默认绑定 `workspace_id`
- 节点与任务分离建模
- 文件资源与业务实体分离建模
- 模型请求与响应保留快照，方便审计与追踪
- 支持同步任务和异步任务共存
- 数据库 ORM 不使用 Prisma，建议使用 Drizzle ORM + drizzle-kit
- 节点复制与节点模板要可追溯来源

## 3. 建表优先级

### P0

- users
- workspaces
- workspace_members
- library_items
- instruction_presets
- assets
- canvases
- canvas_nodes
- canvas_edges
- node_templates
- generation_tasks

### P1

- node_runs
- task_results
- provider_configs
- adapter_configs
- audit_logs

## 4. 核心表设计

### 4.1 users

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| email | varchar(255) unique | 登录邮箱 |
| password_hash | varchar(255) nullable | 密码哈希 |
| name | varchar(100) | 用户名称 |
| avatar_url | text nullable | 头像 |
| status | varchar(20) | active / disabled |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

索引建议：

- unique(email)
- index(status)

### 4.2 workspaces

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| type | varchar(20) | personal / team |
| name | varchar(100) | 空间名称 |
| owner_id | uuid | 所属人 |
| status | varchar(20) | active / archived |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

索引建议：

- index(owner_id)
- index(type, status)

### 4.3 workspace_members

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| workspace_id | uuid | 空间 ID |
| user_id | uuid | 用户 ID |
| role | varchar(20) | owner / admin / editor / viewer |
| status | varchar(20) | active / invited / removed |
| invited_by | uuid nullable | 邀请人 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

约束建议：

- unique(workspace_id, user_id)

### 4.4 library_items

统一承载主体库与场景库。产品主体、人物主体、IP 主体等都归入 `subject`，棚拍环境、室内空间、户外场景等归入 `scene`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| workspace_id | uuid | 空间 ID |
| kind | varchar(20) | subject / scene |
| entity_type | varchar(30) nullable | product / person / object / studio / outdoor 等细分类型 |
| name | varchar(255) | 资源名称 |
| description | text nullable | 描述 |
| cover_asset_id | uuid nullable | 封面素材 |
| prompt_hints | text nullable | 常用提示词锚点 |
| profile_meta | jsonb | 差异化结构信息 |
| tags | jsonb | 标签集合 |
| status | varchar(20) | active / archived |
| created_by | uuid | 创建人 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

索引建议：

- index(workspace_id, kind, status)
- index(workspace_id, name)
- gin(tags)

### 4.5 instruction_presets

用于承载可复用的预制 Prompt，供文生图、图生图和节点模板引用。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| workspace_id | uuid nullable | workspace 级指令所属空间，personal 指令可为空 |
| created_by | uuid | 创建人 |
| scope | varchar(20) | personal / workspace / system |
| name | varchar(255) | 指令名称 |
| description | text nullable | 指令说明 |
| prompt_template | text | 主 Prompt 模板 |
| negative_prompt | text nullable | 负向 Prompt |
| variable_schema | jsonb | 变量占位描述 |
| tags | jsonb | 标签集合 |
| is_public | boolean | 是否向空间公开 |
| status | varchar(20) | active / archived |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

索引建议：

- index(created_by, scope)
- index(workspace_id, scope, status)
- gin(tags)

### 4.6 assets

统一存储主体图、场景图、参考图、视频、音频等媒体资产。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| workspace_id | uuid | 空间 ID |
| owner_type | varchar(50) | library_item / instruction_preset / canvas_node / task_result |
| owner_id | uuid | 所属业务对象 |
| asset_type | varchar(20) | image / video / audio / document |
| file_name | varchar(255) | 文件名 |
| mime_type | varchar(100) | MIME |
| storage_key | text | 对象存储键 |
| file_url | text | 访问地址 |
| file_size | bigint nullable | 文件大小 |
| width | integer nullable | 宽度 |
| height | integer nullable | 高度 |
| duration_ms | integer nullable | 时长 |
| checksum | varchar(128) nullable | 文件哈希 |
| meta | jsonb | 额外信息 |
| created_at | timestamptz | 创建时间 |

索引建议：

- index(workspace_id, owner_type, owner_id)
- index(asset_type)

### 4.7 canvases

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| workspace_id | uuid | 空间 ID |
| name | varchar(255) | 画布名称 |
| description | text nullable | 画布说明 |
| version | integer | 当前版本号 |
| status | varchar(20) | draft / active / archived |
| created_by | uuid | 创建人 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

索引建议：

- index(workspace_id, status)
- index(workspace_id, updated_at desc)

### 4.8 canvas_nodes

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| canvas_id | uuid | 画布 ID |
| workspace_id | uuid | 空间 ID |
| type | varchar(20) | text / image / video / audio |
| title | varchar(255) | 节点标题 |
| created_by | uuid | 创建人 |
| copied_from_node_id | uuid nullable | 复制来源节点 |
| applied_template_id | uuid nullable | 来源模板 |
| prompt_input | text nullable | 主输入内容 |
| model_key | varchar(100) nullable | 模型标识 |
| settings_json | jsonb | 节点参数 |
| resource_refs | jsonb | 主体/场景/指令/素材引用 |
| output_snapshot | jsonb nullable | 最近一次输出快照 |
| status | varchar(20) | idle / queued / processing / succeeded / failed |
| position_x | numeric(10,2) | 画布横坐标 |
| position_y | numeric(10,2) | 画布纵坐标 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

索引建议：

- index(canvas_id)
- index(workspace_id, type)
- index(copied_from_node_id)
- index(applied_template_id)

### 4.9 canvas_edges

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| canvas_id | uuid | 画布 ID |
| workspace_id | uuid | 空间 ID |
| source_node_id | uuid | 起始节点 |
| target_node_id | uuid | 目标节点 |
| merge_mode | varchar(30) | previous_only / merge_all / custom |
| priority | integer | 优先级 |
| created_at | timestamptz | 创建时间 |

约束建议：

- unique(canvas_id, source_node_id, target_node_id)
- 不允许 source_node_id = target_node_id

### 4.10 node_templates

用于支持用户创建、收藏、复用节点模板。模板既可以是个人模板，也可以是团队模板，后续也可扩展平台内置模板。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| workspace_id | uuid nullable | 团队模板所属空间，个人模板可为空 |
| created_by | uuid | 创建人 |
| scope | varchar(20) | personal / workspace / system |
| type | varchar(20) | text / image / video / audio |
| name | varchar(255) | 模板名称 |
| description | text nullable | 模板说明 |
| cover_asset_id | uuid nullable | 模板封面 |
| prompt_input | text nullable | 默认输入 |
| model_key | varchar(100) nullable | 默认模型标识 |
| settings_json | jsonb | 默认参数 |
| resource_refs | jsonb | 默认引用资源 |
| tags | jsonb | 标签集合 |
| is_public | boolean | 是否公开给空间成员 |
| usage_count | integer | 使用次数 |
| status | varchar(20) | active / archived |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

索引建议：

- index(created_by, scope)
- index(workspace_id, scope, status)
- index(type, status)
- gin(tags)

### 4.11 generation_tasks

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| workspace_id | uuid | 空间 ID |
| canvas_id | uuid nullable | 关联画布 |
| node_id | uuid nullable | 关联节点 |
| request_id | varchar(100) | 幂等请求 ID |
| task_type | varchar(20) | text / image / video / audio |
| provider | varchar(50) | 供应商 |
| model | varchar(100) | 模型名 |
| status | varchar(20) | queued / dispatched / processing / succeeded / failed / canceled |
| provider_task_id | varchar(255) nullable | 供应商任务 ID |
| request_payload | jsonb | 请求快照 |
| response_payload | jsonb nullable | 响应快照 |
| error_code | varchar(100) nullable | 错误码 |
| error_message | text nullable | 错误信息 |
| retry_count | integer | 重试次数 |
| poll_count | integer | 轮询次数 |
| next_poll_at | timestamptz nullable | 下次轮询时间 |
| started_at | timestamptz nullable | 执行开始时间 |
| finished_at | timestamptz nullable | 执行结束时间 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

索引建议：

- unique(request_id)
- index(workspace_id, created_at desc)
- index(status, next_poll_at)
- index(provider, provider_task_id)
- index(node_id, created_at desc)

### 4.12 task_results

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| task_id | uuid | 任务 ID |
| workspace_id | uuid | 空间 ID |
| result_type | varchar(20) | text / image / video / audio / json |
| content_text | text nullable | 文本结果 |
| asset_id | uuid nullable | 媒体资产 ID |
| meta | jsonb | 额外结果信息 |
| created_at | timestamptz | 创建时间 |

索引建议：

- index(task_id)
- index(workspace_id, result_type)

### 4.13 provider_configs

用于存储平台可见的模型与供应商元数据，不存明文密钥。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| provider | varchar(50) | 供应商 |
| capability | varchar(20) | text / image / video / audio |
| model_key | varchar(100) | 业务模型键 |
| model_name | varchar(100) | 供应商模型名 |
| enabled | boolean | 是否启用 |
| config_json | jsonb | 非敏感配置 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### 4.14 adapter_configs

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| adapter_key | varchar(100) | 适配器键 |
| capability | varchar(20) | text / image / video / audio |
| provider | varchar(50) | 供应商 |
| enabled | boolean | 是否启用 |
| rate_limit_json | jsonb | 限流配置 |
| fallback_json | jsonb | 降级配置 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### 4.15 audit_logs

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | uuid | 主键 |
| actor_type | varchar(20) | user / admin / system |
| actor_id | uuid nullable | 操作者 ID |
| workspace_id | uuid nullable | 空间 ID |
| action | varchar(100) | 操作类型 |
| target_type | varchar(50) | 目标对象类型 |
| target_id | uuid nullable | 目标对象 ID |
| payload | jsonb | 操作快照 |
| created_at | timestamptz | 创建时间 |

## 5. 关系说明

- users 1:N workspaces
- workspaces 1:N workspace_members
- workspaces 1:N library_items
- workspaces 1:N instruction_presets
- workspaces 1:N canvases
- canvases 1:N canvas_nodes
- canvases 1:N canvas_edges
- users 1:N node_templates
- workspaces 1:N node_templates
- canvas_nodes 1:N generation_tasks
- generation_tasks 1:N task_results
- assets 可被多个业务对象按 `owner_type + owner_id` 关联

## 6. 状态字段建议

### 6.1 节点状态

- `idle`
- `queued`
- `processing`
- `succeeded`
- `failed`

### 6.2 任务状态

- `queued`
- `dispatched`
- `processing`
- `succeeded`
- `failed`
- `canceled`

## 7. 建表顺序建议

1. users
2. workspaces
3. workspace_members
4. library_items
5. instruction_presets
6. assets
7. canvases
8. canvas_nodes
9. canvas_edges
10. node_templates
11. generation_tasks
12. task_results
13. provider_configs
14. adapter_configs
15. audit_logs

## 8. 需要继续细化的点

- 是否引入 `canvas_versions` 表保存历史版本
- 用户复制节点时是否同步复制上游边和下游边
- 是否对 tags 单独拆表
- Drizzle ORM 下字段类型与迁移策略是否需要微调
- 资源删除策略采用软删还是引用计数

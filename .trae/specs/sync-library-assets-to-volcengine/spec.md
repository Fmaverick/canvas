# 主体库素材同步火山素材库 Spec

## Why
当前主体库只保存平台本地 `assets`，Seedance2.0 视频生成在引用主体图片时仍主要传公网 URL，无法稳定复用火山方舟私域素材库能力。我们需要把主体库中的可用图片素材同步到火山素材库，并在视频生成时优先转换为 `asset://<asset_id>`，提高引用素材的一致性与合规性。

## What Changes
- 为主体库图片素材增加“同步到火山素材库”的业务能力，支持创建或复用对应的火山 `Asset Group`
- 为本地素材记录持久化火山同步状态、火山 `Asset ID`、火山 `Asset Group ID`、失败信息与最近同步时间
- 新增主体库维度的同步入口与查询结果，允许前端查看素材是否已同步、处理中、失败或可用于推理
- 修改视频生成引用构建逻辑：当主体关联图片已同步且状态为 `Active` 时，优先传入 `asset://<volcengine_asset_id>`
- 保留兜底路径：未同步、处理中或同步失败时，仍可继续使用现有公网 URL 引用，不阻断已有视频生成流程
- **BREAKING** 视频供应商引用校验需从“仅接受标准 URL”扩展为“接受标准 URL 或 `asset://` URI”

## Impact
- Affected specs: 主体库、资产管理、视频生成、供应商适配、异步任务/状态同步
- Affected code: `src/application/services/library-item-service.ts`、`src/application/services/asset-service.ts`、`src/application/services/task-service.ts`、`src/app/api/library-items/**`、`src/infrastructure/db/schema.ts`、`src/infrastructure/ai/seedance20-client.ts`

## ADDED Requirements

### Requirement: 主体库素材可同步到火山素材库
系统 SHALL 允许主体库中的图片素材同步到火山方舟私域素材库，并为每个主体维护可复用的火山素材组。

#### Scenario: 首次同步主体素材成功
- **WHEN** 用户对某个主体库条目发起素材同步，且该主体存在至少一张可访问的图片素材
- **THEN** 系统创建或复用一个与该主体绑定的火山 `Asset Group`
- **AND** 系统按素材逐个调用火山 `CreateAsset`
- **AND** 系统为每个本地素材保存火山 `Asset ID`、`Asset Group ID`、同步状态与最近同步时间

#### Scenario: 重复同步时复用现有火山素材组
- **WHEN** 用户再次同步同一主体库条目
- **THEN** 系统 SHALL 优先复用该主体已绑定的火山 `Asset Group`
- **AND** 系统不得重复创建新的素材组，除非现有绑定已失效且无法恢复

#### Scenario: 非图片素材不会被同步
- **WHEN** 主体库附件中包含非图片素材
- **THEN** 系统 SHALL 跳过这些素材
- **AND** 返回结果中需明确标记该素材未进入火山同步范围

#### Scenario: 火山上传为异步处理
- **WHEN** 系统收到火山 `CreateAsset` 成功响应
- **THEN** 系统 SHALL 将本地同步状态标记为“处理中”
- **AND** 仅在轮询 `GetAsset` 得到 `Status=Active` 后，才将该素材标记为“可引用”

#### Scenario: 同步失败记录可追踪
- **WHEN** 火山接口返回错误或轮询结果为 `Failed`
- **THEN** 系统 SHALL 保存失败状态、错误码、错误信息与最近失败时间
- **AND** 用户可以从主体库素材状态中看到失败结果

### Requirement: 主体库返回火山同步状态
系统 SHALL 在主体库素材列表与主体详情中返回火山同步所需的状态字段，供前端展示与后续视频编排使用。

#### Scenario: 查询主体素材列表
- **WHEN** 用户请求主体库条目详情或其素材列表
- **THEN** 响应中包含每个素材的火山同步摘要
- **AND** 至少包含 `sync_status`、`volcengine_asset_id`、`volcengine_asset_group_id`、`last_synced_at`、`last_sync_error`

### Requirement: 视频生成优先使用火山素材 URI
系统 SHALL 在 Seedance2.0 视频生成引用构造阶段，优先使用主体库中已同步完成的火山素材 `asset://` URI。

#### Scenario: 主体引用存在已激活的火山素材
- **WHEN** 视频节点引用了主体库条目，且该主体下存在已同步为 `Active` 的图片素材
- **THEN** 系统 SHALL 将这些图片引用构造成 `asset://<volcengine_asset_id>`
- **AND** 这些引用按现有参考图顺序进入视频请求

#### Scenario: 同步未就绪时回退公网 URL
- **WHEN** 引用素材尚未同步完成、同步失败或未配置火山同步能力
- **THEN** 系统 SHALL 回退到现有公网 `fileUrl`
- **AND** 不因火山同步不可用而阻断视频任务提交

#### Scenario: Seedance 客户端接受资产 URI
- **WHEN** 视频请求中的 `content.image_url.url` 为 `asset://<volcengine_asset_id>`
- **THEN** 系统 SHALL 视其为合法引用
- **AND** 不再按普通 HTTP URL 规则拒绝该值

### Requirement: 同步前校验火山项目与配置
系统 SHALL 在同步前校验火山配置与项目归属，避免创建出不可用于推理的素材。

#### Scenario: 缺少火山素材库配置
- **WHEN** 未配置火山素材库所需的 AK/SK、项目名或基础参数
- **THEN** 系统 SHALL 拒绝执行同步
- **AND** 返回明确的配置错误信息

#### Scenario: 项目归属不一致
- **WHEN** 素材组、素材或后续推理所用项目归属不一致
- **THEN** 系统 SHALL 阻止将该同步结果标记为可引用
- **AND** 返回项目不一致的错误提示

## MODIFIED Requirements

### Requirement: 视频引用素材解析
系统原有的视频引用素材解析逻辑只依赖本地资产公网 URL。修改后，系统 SHALL 支持两类等价引用源：

- 已同步完成的火山资产 URI：`asset://<volcengine_asset_id>`
- 本地资产公网 URL：`https://...`

#### Scenario: 同一主体存在多张图片
- **WHEN** 主体引用下同时存在多张本地图片，且其中部分已同步到火山素材库
- **THEN** 系统 SHALL 对已同步素材使用 `asset://`，对未同步素材继续使用公网 URL
- **AND** 保持最终参考图顺序稳定，不因来源不同而重排

## REMOVED Requirements

### Requirement: 无
**Reason**: 本次变更为能力新增与引用策略增强，不删除现有业务能力。
**Migration**: 无需迁移；未同步素材继续按现有 URL 模式工作。

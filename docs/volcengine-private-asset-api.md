# 火山引擎私域素材资产库 API 梳理

## 文档说明

本文基于火山引擎火山方舟文档中“私域虚拟人像素材资产库使用指南”及对应 API 参考页整理，聚焦以下接口：

- `CreateAssetGroup`
- `CreateAsset`
- `ListAssetGroups`
- `ListAssets`
- `GetAsset`
- `GetAssetGroup`
- `UpdateAssetGroup`
- `UpdateAsset`
- `DeleteAsset`
- `DeleteAssetGroup`

适用范围：

- 火山方舟私域素材资产库
- 区域固定为 `cn-beijing`
- API 版本固定为 `2024-01-01`
- 鉴权方式为 `Access Key (AK/SK)`，不支持 Bearer Token

## 通用请求规范

### 1. 请求地址格式

所有接口均使用：

```text
POST https://ark.cn-beijing.volcengineapi.com/?Action=<ActionName>&Version=2024-01-01
```

其中：

- `Action` 为具体接口名，如 `CreateAsset`
- `Version` 固定为 `2024-01-01`
- HTTP Method 固定为 `POST`

### 2. 通用请求头

| 请求头 | 是否必填 | 用途 |
| --- | --- | --- |
| `Content-Type: application/json` | 是 | 声明请求体为 JSON |
| `X-Date` | 是 | 火山引擎签名时间 |
| `X-Content-Sha256` | 是 | 请求体哈希，用于签名 |
| `Authorization` | 是 | HMAC-SHA256 签名串 |
| `Host: ark.cn-beijing.volcengineapi.com` | 是 | 请求主机 |

说明：

- 官方示例全部为 AK/SK 签名方式。
- 该组接口不是 `https://ark.cn-beijing.volces.com/api/v3/...` 形式，而是 OpenAPI 风格的 `volcengineapi.com` 域名。

### 3. 通用请求体约定

| 约定项 | 说明 |
| --- | --- |
| `ProjectName` | 大部分接口支持传入项目名；默认值为 `default` |
| 项目隔离 | Asset 与 Asset Group 必须处于同一 `ProjectName`；后续推理使用的 API Key 也必须属于同一项目 |
| 数据格式 | 请求体统一为 JSON |
| 资源类型 | Asset 目前支持 `Image`、`Video`、`Audio` |

### 4. 通用响应规范

所有接口响应都遵循统一外层结构：

```json
{
  "ResponseMetadata": {
    "RequestId": "20260328000000000000000000000000",
    "Action": "CreateAsset",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "cn-beijing"
  },
  "Result": {}
}
```

`ResponseMetadata` 字段说明：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `RequestId` | `string` | 请求唯一 ID，用于排查问题 |
| `Action` | `string` | 实际调用的接口名 |
| `Version` | `string` | 接口版本 |
| `Service` | `string` | 固定为 `ark` |
| `Region` | `string` | 固定为 `cn-beijing` |

`Result` 字段说明：

- `Result` 为业务响应体。
- 创建/更新类接口通常返回 `Id`。
- 删除类接口通常返回空对象 `{}`。
- 列表类接口返回 `Items`、`TotalCount`、分页信息。

## 关键枚举与状态

### 1. `GroupType`

| 值 | 含义 | 备注 |
| --- | --- | --- |
| `AIGC` | 虚拟人像素材组 | 创建素材组时当前仅支持该值 |
| `LivenessFace` | 真人素材组 | 在查询类接口的文档中出现 |

### 2. `AssetType`

| 值 | 含义 |
| --- | --- |
| `Image` | 图像素材 |
| `Video` | 视频素材 |
| `Audio` | 音频素材 |

### 3. `Status`

| 值 | 含义 | 是否可用于推理 |
| --- | --- | --- |
| `Active` | 预处理完成 | 是 |
| `Processing` | 正在预处理 | 否 |
| `Failed` | 处理失败 | 否 |

### 4. 排序字段

| 字段 | 适用接口 | 含义 |
| --- | --- | --- |
| `CreateTime` | `ListAssetGroups` / `ListAssets` | 按创建时间排序 |
| `UpdateTime` | `ListAssetGroups` / `ListAssets` | 按更新时间排序 |
| `GroupId` | `ListAssets` | 按所属素材组 ID 排序 |

### 5. 排序方向

| 值 | 含义 |
| --- | --- |
| `Desc` | 降序 |
| `Asc` | 升序 |

## 接口使用流程建议

推荐按以下顺序调用：

1. 调用 `CreateAssetGroup` 创建素材组
2. 调用 `CreateAsset` 向素材组上传素材
3. 调用 `GetAsset` 轮询素材状态
4. 只有在 `Status = Active` 时，才可将素材用于视频生成

补充说明：

- `CreateAsset` 是异步接口，上传成功只代表已受理，不代表素材已可用。
- `GetAsset` 返回的 `URL` 有效期为 12 小时，如需长期保存请及时转存。
- 后续在生成视频时，素材 URI 需要写成 `asset://<asset_id>`。

## 1. 创建素材组 `CreateAssetGroup`

### 接口信息

- 地址：`POST https://ark.cn-beijing.volcengineapi.com/?Action=CreateAssetGroup&Version=2024-01-01`
- 用途：创建 Asset Group（素材资产组合），用于管理一组素材
- 鉴权：仅支持 AK/SK

### 请求体参数

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `Name` | `string` | 是 | 指定素材组名称 | 最长 64 字符 |
| `Description` | `string` | 否 | 指定素材组描述 | 最长 300 字符 |
| `GroupType` | `string` | 否 | 指定素材组类型 | 当前仅支持 `AIGC` |
| `ProjectName` | `string` | 否 | 指定资源所属项目 | 默认 `default` |

### 响应参数

`Result` 内字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `Id` | `string` | 新创建的素材组 ID |

### 注意事项

- 首次创建 Asset Group 前，需先在控制台签署授权函。

## 2. 上传素材 `CreateAsset`

### 接口信息

- 地址：`POST https://ark.cn-beijing.volcengineapi.com/?Action=CreateAsset&Version=2024-01-01`
- 用途：向指定素材组中上传一个素材资产
- 鉴权：仅支持 AK/SK
- 特性：异步处理

### 请求体参数

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `GroupId` | `string` | 是 | 指定素材归属的素材组 | 必须是已存在的 Asset Group ID |
| `URL` | `string` | 是 | 提供素材源文件的公网可访问地址 | 仅支持 URL，不支持 Base64 |
| `Name` | `string` | 否 | 设置素材名称 | 最长 64 字符；主要用于 `ListAssets` 模糊搜索，不会传入模型推理 |
| `AssetType` | `string` | 是 | 声明素材类型 | 可选 `Image` / `Video` / `Audio` |
| `ProjectName` | `string` | 否 | 指定资源所属项目 | 默认 `default`；必须与 `GroupId` 所属项目一致 |

### 响应参数

`Result` 内字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `Id` | `string` | 新创建的素材 ID（Asset ID） |

### 素材限制

#### 图像素材 `Image`

| 项目 | 要求 |
| --- | --- |
| 格式 | `jpeg`、`png`、`webp`、`bmp`、`tiff`、`gif`、`heic`、`heif` |
| 宽高比 | `(0.4, 2.5)` |
| 宽高范围 | `(300, 6000)` 像素 |
| 大小 | 小于 30 MB |

#### 视频素材 `Video`

| 项目 | 要求 |
| --- | --- |
| 格式 | `mp4`、`mov` |
| 分辨率 | `480p`、`720p` |
| 时长 | `[2, 15]` 秒 |
| 宽高比 | `[0.4, 2.5]` |
| 宽高范围 | `[300, 6000]` 像素 |
| 总像素数 | `宽 × 高 ∈ [409600, 927408]` |
| 大小 | 不超过 50 MB |
| 帧率 | `[24, 60]` FPS |

#### 音频素材 `Audio`

| 项目 | 要求 |
| --- | --- |
| 格式 | `wav`、`mp3` |
| 时长 | `[2, 15]` 秒 |
| 大小 | 不超过 15 MB |

### 注意事项

- 每次请求只能上传一个素材文件。
- 上传成功后应继续调用 `GetAsset` 查询状态。
- `CreateAsset` 返回 `Id` 不代表素材已可用于推理。

## 3. 查询素材组列表 `ListAssetGroups`

### 接口信息

- 地址：`POST https://ark.cn-beijing.volcengineapi.com/?Action=ListAssetGroups&Version=2024-01-01`
- 用途：按条件分页查询素材组列表

### 请求体参数

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `Filter` | `object` | 是 | 定义筛选条件 | 详见下表 |
| `PageNumber` | `integer(i64)` | 是 | 指定页码 | 从 1 开始 |
| `PageSize` | `integer(i64)` | 是 | 指定每页数量 | 最大 100 |
| `SortBy` | `string` | 否 | 指定排序字段 | 默认 `CreateTime` |
| `SortOrder` | `string` | 否 | 指定排序方向 | 默认 `Desc` |
| `ProjectName` | `string` | 否 | 指定所属项目 | 默认 `default` |

`Filter` 子字段：

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `Filter.GroupIds` | `string[]` | 否 | 按素材组 ID 精确筛选 | 可传多个 |
| `Filter.GroupType` | `string` | 是 | 按素材组类型筛选 | 可选 `AIGC` / `LivenessFace` |
| `Filter.Name` | `string` | 否 | 按素材组名称筛选 | 模糊搜索，最长 64 字符 |

### 响应参数

`Result` 内字段：

| 字段 | 类型 | 用途 | 说明 |
| --- | --- | --- | --- |
| `TotalCount` | `integer(i64)` | 返回总数 | 满足筛选条件的素材组总量 |
| `Items` | `object[]` | 返回素材组列表 | 每个元素代表一个素材组 |
| `PageNumber` | `integer(i64)` | 返回页码 | 与分页请求对应 |
| `PageSize` | `integer(i64)` | 返回每页数量 | 最大 100 |

`Items[]` 子字段：

| 字段 | 类型 | 用途 | 说明 |
| --- | --- | --- | --- |
| `Items[].Id` | `string` | 素材组 ID | 唯一标识 |
| `Items[].Name` | `string` | 素材组名称 | 最长 64 字符 |
| `Items[].Description` | `string` | 素材组描述 | 最长 300 字符 |
| `Items[].GroupType` | `string` | 素材组类型 | `AIGC` / `LivenessFace` |
| `Items[].ProjectName` | `string` | 所属项目 | 项目隔离依据 |
| `Items[].CreateTime` | `string` | 创建时间 | ISO 时间字符串 |
| `Items[].UpdateTime` | `string` | 更新时间 | ISO 时间字符串 |

### 文档差异说明

- 官方响应参数表未单独列出 `Title`，但响应示例中出现了该字段。
- 按示例看，`Title` 与 `Name` 值一致，建议接入时做兼容处理，但不要强依赖该字段。

## 4. 查询素材列表 `ListAssets`

### 接口信息

- 地址：`POST https://ark.cn-beijing.volcengineapi.com/?Action=ListAssets&Version=2024-01-01`
- 用途：按条件分页查询素材资产列表

### 请求体参数

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `Filter` | `object` | 是 | 定义筛选条件 | 详见下表 |
| `PageNumber` | `integer(i64)` | 是 | 指定页码 | 从 1 开始 |
| `PageSize` | `integer(i64)` | 是 | 指定每页数量 | 最大 100 |
| `SortBy` | `string` | 否 | 指定排序字段 | 默认 `CreateTime` |
| `SortOrder` | `string` | 否 | 指定排序方向 | 默认 `Desc` |
| `ProjectName` | `string` | 否 | 指定所属项目 | 默认 `default` |

`Filter` 子字段：

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `Filter.GroupIds` | `string[]` | 否 | 按素材组 ID 过滤 | 可传多个 |
| `Filter.GroupType` | `string` | 是 | 按素材组类型过滤 | `AIGC` / `LivenessFace` |
| `Filter.Statuses` | `string[]` | 否 | 按素材状态过滤 | 可选 `Active` / `Processing` / `Failed` |
| `Filter.Name` | `string` | 否 | 按素材名称过滤 | 模糊搜索，最长 64 字符 |

### 响应参数

`Result` 内字段：

| 字段 | 类型 | 用途 | 说明 |
| --- | --- | --- | --- |
| `Items` | `object[]` | 返回素材列表 | 每个元素代表一个素材 |
| `TotalCount` | `integer(i64)` | 返回总数 | 满足条件的素材总量 |
| `PageNumber` | `integer(i64)` | 返回页码 | 与请求一致 |
| `PageSize` | `integer(i64)` | 返回每页数量 | 最大 100 |

`Items[]` 子字段：

| 字段 | 类型 | 用途 | 说明 |
| --- | --- | --- | --- |
| `Items[].Id` | `string` | 素材 ID | 唯一标识 |
| `Items[].Name` | `string` | 素材名称 | 最长 64 字符 |
| `Items[].URL` | `string` | 素材访问地址 | 返回 URL 有效期 12 小时 |
| `Items[].GroupId` | `string` | 所属素材组 ID | 关联 Asset Group |
| `Items[].AssetType` | `string` | 素材类型 | `Image` / `Video` / `Audio` |
| `Items[].Status` | `string` | 素材处理状态 | `Active` / `Processing` / `Failed` |
| `Items[].Error` | `object` | 错误信息 | 处理失败时重点关注 |
| `Items[].ProjectName` | `string` | 所属项目 | 项目隔离依据 |
| `Items[].CreateTime` | `string` | 创建时间 | ISO 时间字符串 |
| `Items[].UpdateTime` | `string` | 更新时间 | ISO 时间字符串 |

`Items[].Error` 子字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `Items[].Error.Code` | `string` | 错误码 |
| `Items[].Error.Message` | `string` | 错误描述 |

## 5. 查询单个素材 `GetAsset`

### 接口信息

- 地址：`POST https://ark.cn-beijing.volcengineapi.com/?Action=GetAsset&Version=2024-01-01`
- 用途：查询单个素材状态及详情，通常用于轮询上传结果

### 请求体参数

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `Id` | `string` | 是 | 指定素材 ID | 即 Asset ID |
| `ProjectName` | `string` | 否 | 指定素材所属项目 | 默认 `default` |

### 响应参数

`Result` 内字段：

| 字段 | 类型 | 用途 | 说明 |
| --- | --- | --- | --- |
| `Id` | `string` | 素材 ID | 唯一标识 |
| `Name` | `string` | 素材名称 | 最长 64 字符 |
| `URL` | `string` | 素材访问地址 | 有效期 12 小时 |
| `AssetType` | `string` | 素材类型 | `Image` / `Video` / `Audio` |
| `GroupId` | `string` | 所属素材组 ID | 关联到 Asset Group |
| `Status` | `string` | 素材处理状态 | `Active` / `Processing` / `Failed` |
| `Error` | `object` | 错误信息 | 失败时返回关键错误 |
| `CreateTime` | `string` | 创建时间 | ISO 时间字符串 |
| `UpdateTime` | `string` | 更新时间 | ISO 时间字符串 |
| `ProjectName` | `string` | 所属项目 | 项目隔离依据 |

`Error` 子字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `Error.Code` | `string` | 错误码 |
| `Error.Message` | `string` | 错误信息 |

## 6. 查询单个素材组 `GetAssetGroup`

### 接口信息

- 地址：`POST https://ark.cn-beijing.volcengineapi.com/?Action=GetAssetGroup&Version=2024-01-01`
- 用途：查询单个素材组详情

### 请求体参数

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `Id` | `string` | 是 | 指定素材组 ID | 即 Asset Group ID |
| `ProjectName` | `string` | 否 | 指定素材组所属项目 | 默认 `default` |

### 响应参数

`Result` 内字段：

| 字段 | 类型 | 用途 | 说明 |
| --- | --- | --- | --- |
| `Id` | `string` | 素材组 ID | 唯一标识 |
| `Name` | `string` | 素材组名称 | 最长 64 字符 |
| `Description` | `string` | 素材组描述 | 最长 300 字符 |
| `GroupType` | `string` | 素材组类型 | `AIGC` / `LivenessFace` |
| `ProjectName` | `string` | 所属项目 | 项目隔离依据 |
| `CreateTime` | `string` | 创建时间 | ISO 时间字符串 |
| `UpdateTime` | `string` | 更新时间 | ISO 时间字符串 |

## 7. 更新素材组 `UpdateAssetGroup`

### 接口信息

- 地址：`POST https://ark.cn-beijing.volcengineapi.com/?Action=UpdateAssetGroup&Version=2024-01-01`
- 用途：更新单个素材组信息
- 限制：当前仅支持更新 `Name` 和 `Description`

### 请求体参数

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `Id` | `string` | 是 | 指定要更新的素材组 ID | 必须是已存在 ID |
| `Name` | `string` | 否 | 更新后的素材组名称 | 最长 64 字符 |
| `Description` | `string` | 否 | 更新后的素材组描述 | 最长 300 字符 |
| `ProjectName` | `string` | 否 | 指定素材组所属项目 | 默认 `default` |

### 响应参数

`Result` 内字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `Id` | `string` | 被更新的素材组 ID |

## 8. 更新素材 `UpdateAsset`

### 接口信息

- 地址：`POST https://ark.cn-beijing.volcengineapi.com/?Action=UpdateAsset&Version=2024-01-01`
- 用途：更新单个素材信息
- 限制：当前仅支持更新 `Name`

### 请求体参数

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `Id` | `string` | 是 | 指定要更新的素材 ID | 即 Asset ID |
| `Name` | `string` | 否 | 更新后的素材名称 | 最长 64 字符 |
| `ProjectName` | `string` | 否 | 指定素材所属项目 | 默认 `default` |

### 响应参数

`Result` 内字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `Id` | `string` | 被更新的素材 ID |

## 9. 删除素材 `DeleteAsset`

### 接口信息

- 地址：`POST https://ark.cn-beijing.volcengineapi.com/?Action=DeleteAsset&Version=2024-01-01`
- 用途：删除单个素材资产

### 请求体参数

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `Id` | `string` | 是 | 指定要删除的素材 ID | 即 Asset ID |
| `ProjectName` | `string` | 否 | 指定素材所属项目 | 默认 `default` |

### 响应参数

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `Result` | `object` | 固定返回空对象 `{}`，无业务字段 |

## 10. 删除素材组 `DeleteAssetGroup`

### 接口信息

- 地址：`POST https://ark.cn-beijing.volcengineapi.com/?Action=DeleteAssetGroup&Version=2024-01-01`
- 用途：删除单个素材组，并批量删除组内所有素材

### 请求体参数

| 字段 | 类型 | 必填 | 用途 | 说明 |
| --- | --- | --- | --- | --- |
| `Id` | `string` | 是 | 指定要删除的素材组 ID | 即 Asset Group ID |
| `ProjectName` | `string` | 否 | 指定素材组所属项目 | 默认 `default` |

### 响应参数

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `Result` | `object` | 固定返回空对象 `{}`，无业务字段 |

### 注意事项

- 删除素材组会连带删除组内所有素材。
- 该操作不可逆。
- 如果组内素材较多，删除可能耗时较长。
- 对于控制台创建的真人素材组，只有授权已过期或已拒绝接收的素材组才能删除。

## 常见接入注意点

### 1. 项目必须一致

以下三者必须保持同一项目：

- `AssetGroup.ProjectName`
- `Asset.ProjectName`
- 用于后续模型推理的 API Key 所属项目

否则会出现：

- 上传成功但查询失败
- 素材存在但无法用于视频生成

### 2. 上传后必须轮询状态

推荐轮询逻辑：

1. 调用 `CreateAsset` 获取 `Asset ID`
2. 定时调用 `GetAsset`
3. 根据 `Status` 做分支处理：
   - `Processing`：继续轮询
   - `Active`：可以用于推理
   - `Failed`：读取 `Error.Code` / `Error.Message` 排查

### 3. 生成视频时不要在提示词里直接写 Asset ID

官方建议：

- 在请求体素材 URL 中使用 `asset://<asset_id>`
- 在提示词中使用“图片 1”“视频 1”“音频 1”这类相对引用
- 不要直接在提示词文本里写 Asset ID

## 简版对照表

| 接口 | 作用 | 关键返回 |
| --- | --- | --- |
| `CreateAssetGroup` | 创建素材组 | `Result.Id` |
| `CreateAsset` | 上传素材 | `Result.Id` |
| `ListAssetGroups` | 查询素材组列表 | `Result.Items` / `TotalCount` |
| `ListAssets` | 查询素材列表 | `Result.Items` / `TotalCount` |
| `GetAsset` | 查询素材详情与状态 | `Result.Status` |
| `GetAssetGroup` | 查询素材组详情 | 素材组基础信息 |
| `UpdateAssetGroup` | 更新素材组名称/描述 | `Result.Id` |
| `UpdateAsset` | 更新素材名称 | `Result.Id` |
| `DeleteAsset` | 删除素材 | `Result = {}` |
| `DeleteAssetGroup` | 删除素材组及组内素材 | `Result = {}` |

## 来源页面

- 使用指南：`https://www.volcengine.com/docs/82379/2333565?lang=zh`
- `CreateAssetGroup`：`https://www.volcengine.com/docs/82379/2318270?lang=zh`
- `CreateAsset`：`https://www.volcengine.com/docs/82379/2318271?lang=zh`
- `ListAssetGroups`：`https://www.volcengine.com/docs/82379/2318272?lang=zh`
- `ListAssets`：`https://www.volcengine.com/docs/82379/2318273?lang=zh`
- `GetAsset`：`https://www.volcengine.com/docs/82379/2318274?lang=zh`
- `GetAssetGroup`：`https://www.volcengine.com/docs/82379/2318275?lang=zh`
- `UpdateAssetGroup`：`https://www.volcengine.com/docs/82379/2318276?lang=zh`
- `UpdateAsset`：`https://www.volcengine.com/docs/82379/2318277?lang=zh`
- `DeleteAsset`：`https://www.volcengine.com/docs/82379/2318278?lang=zh`
- `DeleteAssetGroup`：`https://www.volcengine.com/docs/82379/2341606?lang=zh`

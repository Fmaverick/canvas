# Tasks
- [x] Task 1: 设计并落地主体素材的火山同步数据模型。
  - [x] SubTask 1.1: 明确本地素材需要持久化的火山字段，包括素材组 ID、素材 ID、同步状态、最近同步时间、错误摘要
  - [x] SubTask 1.2: 为主体与素材建立“可复用火山素材组”的绑定规则，避免重复创建素材组
  - [x] SubTask 1.3: 补齐读取主体素材时的同步状态返回结构，保证前端可直接展示

- [x] Task 2: 增加主体库素材同步接口与服务编排。
  - [x] SubTask 2.1: 新增主体维度的同步入口，支持按主体批量同步其图片素材
  - [x] SubTask 2.2: 接入火山 `CreateAssetGroup`、`CreateAsset`、`GetAsset`，实现创建/复用素材组、上传素材、轮询状态
  - [x] SubTask 2.3: 对缺少配置、项目不一致、远端失败、重复同步等场景返回统一错误与结果摘要

- [x] Task 3: 改造 Seedance2.0 视频引用构造逻辑，优先使用火山 `asset://`。
  - [x] SubTask 3.1: 在主体引用解析中优先读取已激活的火山素材 ID，而不是直接使用本地公网 URL
  - [x] SubTask 3.2: 对未同步、处理中、失败素材保留公网 URL 兜底
  - [x] SubTask 3.3: 放宽视频供应商校验，允许 `content.image_url.url` 接受 `asset://` URI

- [x] Task 4: 打通主体库展示与联调验证。
  - [x] SubTask 4.1: 在主体素材列表或详情中展示同步状态、火山素材 ID、失败原因与最近同步时间
  - [x] SubTask 4.2: 验证主体同步成功后，视频请求能产出 `asset://<id>` 引用
  - [x] SubTask 4.3: 验证未同步/失败回退到公网 URL、配置缺失报错、重复同步复用素材组

- [x] Task 5: 补齐火山同步配置校验与回归测试。
  - [x] SubTask 5.1: 移除或收紧火山素材库 `ProjectName` / 基础参数的静默默认值，缺失时返回明确配置错误
  - [x] SubTask 5.2: 为 `library-item-asset-sync-service` 增加覆盖缺少配置、项目不一致、远端失败、重复同步复用素材组的自动化测试
  - [x] Failure Reason: 已移除 `src/lib/env.ts` 中火山素材库 `ProjectName` / `Base URL` 的静默默认值，并补齐 `library-item-asset-sync-service` 的回归测试覆盖，checklist 第 8 项可据此判定通过

# Task Dependencies
- [Task 2] depends on [Task 1]
- [Task 3] depends on [Task 1] and [Task 2]
- [Task 4] depends on [Task 2] and [Task 3]
- [Task 5] depends on [Task 2] and [Task 4]

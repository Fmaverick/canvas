# AI 内容生产平台环境变量与配置说明

## 1. 文档目标

本文档用于整理开发和部署阶段所需的配置项，避免开发前后配置口径不一致。

## 2. 配置原则

- 敏感信息只通过环境变量注入
- 不把密钥写入代码仓库
- Admin 密码不入库
- 非敏感模型配置可存数据库，敏感密钥只存运行环境

## 3. 必需配置

### 3.1 应用基础配置

| 变量名 | 说明 |
| --- | --- |
| `NODE_ENV` | 运行环境 |
| `APP_URL` | 前台应用地址 |
| `ADMIN_URL` | Admin 地址 |
| `APP_SECRET` | 应用密钥 |

### 3.2 数据库配置

| 变量名 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串 |

### 3.3 Redis 配置

| 变量名 | 说明 |
| --- | --- |
| `REDIS_URL` | Redis 连接串 |

### 3.4 对象存储配置

| 变量名 | 说明 |
| --- | --- |
| `STORAGE_ENDPOINT` | 对象存储地址 |
| `STORAGE_BUCKET` | Bucket 名称 |
| `STORAGE_ACCESS_KEY` | 存储访问 Key |
| `STORAGE_SECRET_KEY` | 存储访问 Secret |
| `STORAGE_REGION` | 区域 |

## 4. Admin 配置

| 变量名 | 说明 |
| --- | --- |
| `ADMIN_USERNAME` | Admin 用户名 |
| `ADMIN_PASSWORD_HASH` | Admin 哈希密码 |

开发环境可临时增加：

| 变量名 | 说明 |
| --- | --- |
| `ADMIN_PASSWORD` | 临时明文密码，仅开发使用 |

## 5. AI 配置

### 5.1 OpenAI

| 变量名 | 说明 |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI Key |
| `OPENAI_BASE_URL` | OpenAI 网关地址，可选 |
| `OPENAI_TEXT_MODEL` | 默认文本模型 |

### 5.2 图片模型配置

| 变量名 | 说明 |
| --- | --- |
| `IMAGE_PROVIDER_DEFAULT` | 默认图片供应商 |
| `IMAGE_PROVIDER_A_API_KEY` | 图片供应商 A Key |
| `IMAGE_PROVIDER_B_API_KEY` | 图片供应商 B Key |

### 5.3 视频模型配置

| 变量名 | 说明 |
| --- | --- |
| `VIDEO_PROVIDER_DEFAULT` | 默认视频供应商 |
| `VIDEO_PROVIDER_A_API_KEY` | 视频供应商 A Key |
| `VIDEO_PROVIDER_B_API_KEY` | 视频供应商 B Key |

### 5.4 音频模型配置

| 变量名 | 说明 |
| --- | --- |
| `AUDIO_PROVIDER_DEFAULT` | 默认音频供应商 |
| `AUDIO_PROVIDER_A_API_KEY` | 音频供应商 A Key |
| `AUDIO_PROVIDER_B_API_KEY` | 音频供应商 B Key |

## 6. 运行时配置

| 变量名 | 说明 |
| --- | --- |
| `OPENAI_GLOBAL_CONCURRENCY` | OpenAI 全局并发上限，默认 50 |
| `TEXT_QUEUE_CONCURRENCY` | 文本任务并发 |
| `IMAGE_QUEUE_CONCURRENCY` | 图片任务并发 |
| `AUDIO_QUEUE_CONCURRENCY` | 音频任务并发 |
| `VIDEO_SUBMIT_CONCURRENCY` | 视频提交任务并发 |
| `MEDIA_POLL_BATCH_SIZE` | 媒体轮询批大小 |
| `MEDIA_POLL_INTERVAL_MS` | 媒体轮询间隔 |
| `TASK_MAX_RETRY` | 最大重试次数 |

## 7. 日志与监控配置

| 变量名 | 说明 |
| --- | --- |
| `LOG_LEVEL` | 日志级别 |
| `ENABLE_STRUCTURED_LOG` | 是否开启结构化日志 |
| `SENTRY_DSN` | 错误监控 |
| `METRICS_ENABLED` | 指标采集开关 |

## 8. 开发环境建议

- 使用单独的开发数据库
- 使用单独的 Redis
- 使用测试对象存储 Bucket
- 不与生产 Key 混用
- 通过 `.env.local` 管理本地变量

## 9. 配置落地建议

### 9.1 哪些配置放环境变量

- 所有密钥
- 所有连接串
- Admin 登录凭证
- 全局并发与队列运行时参数

### 9.2 哪些配置可放数据库

- 模型开关
- 模型展示名称
- 非敏感参数映射
- 适配器启停状态
- 降级与回退策略

## 10. 开发前检查清单

- 已准备本地数据库
- 已准备 Redis
- 已准备对象存储
- 已准备至少一个图片模型 Key
- 已准备至少一个视频模型 Key
- 已准备至少一个音频模型 Key
- 已准备 OpenAI Key
- 已配置 Admin 用户名与密码

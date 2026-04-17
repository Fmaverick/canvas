# AIGateway Curl 调用文档

本文档提供当前网关的常用 `curl` 调用方式与响应示例，覆盖：
- 健康检查
- 模型查询
- 管理端登录与配置
- 调用方 API Key 生成/撤销
- LLM 调用
- 火山引擎图片生成
- 视频任务提交与轮询

## 0. 准备变量

```bash
BASE_URL="http://localhost:3000"
ADMIN_PASSWORD="你的ADMIN_PASSWORD"
```

## 1. 健康检查

```bash
curl -s "$BASE_URL/health"
```

响应示例：

```json
{
  "ok": true
}
```

## 2. 模型列表

```bash
curl -s "$BASE_URL/v1/models"
```

响应示例（节选）：

```json
{
  "data": [
    {
      "id": "mock-llm",
      "modality": "llm",
      "capability": "chat",
      "async": false,
      "providers": ["mock"]
    },
    {
      "id": "doubao-seedream-4-5-251128",
      "modality": "image",
      "capability": "generate",
      "async": false,
      "providers": ["volcengine"]
    },
    {
      "id": "seedance-2.0",
      "modality": "video",
      "capability": "generate",
      "async": true,
      "providers": ["seedance2.0"]
    }
  ]
}
```

## 3. 管理端登录（保存 Cookie）

```bash
curl -i -s -c cookies.txt \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"$ADMIN_PASSWORD\"}" \
  "$BASE_URL/admin/login"
```

响应示例：

```json
{
  "ok": true,
  "passwordEnabled": true
}
```

## 4. 生成调用方 API Key（服务端生成）

```bash
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"count":1}' \
  "$BASE_URL/admin/gateway-api-keys/generate"
```

响应示例：

```json
{
  "ok": true,
  "generatedKeys": [
    "agw_xxxxxxxxxxxxxxxxxxxxx"
  ],
  "gatewayApiKeys": [
    {
      "id": "gateway-client-key-1",
      "value": "agw_xxxxxxxxxxxxxxxxxxxxx",
      "label": "agw_***xxxx"
    }
  ]
}
```

## 5. 撤销调用方 API Key

```bash
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"key":"agw_xxxxxxxxxxxxxxxxxxxxx"}' \
  "$BASE_URL/admin/gateway-api-keys/revoke"
```

响应示例：

```json
{
  "ok": true,
  "gatewayApiKeys": []
}
```

## 6. 查看管理状态

```bash
curl -s -b cookies.txt "$BASE_URL/admin/status"
```

响应示例（节选）：

```json
{
  "auth": {
    "passwordEnabled": true,
    "gatewayApiKeyCount": 1
  },
  "gatewayApiKeys": [
    {
      "id": "gateway-client-key-1",
      "value": "agw_xxxxxxxxxxxxxxxxxxxxx",
      "label": "agw_***xxxx"
    }
  ],
  "providers": [
    {
      "name": "volcengine",
      "available": true,
      "readOnly": false,
      "baseUrl": "mock://volcengine"
    },
    {
      "name": "seedance2.0",
      "available": true,
      "readOnly": false,
      "baseUrl": "mock://seedance2.0"
    }
  ]
}
```

## 7. 更新 seedance2.0 配置

```bash
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "mock://seedance2.0",
    "keys": ["your-seedance-key-1","your-seedance-key-2"]
  }' \
  "$BASE_URL/admin/providers/seedance2.0"
```

响应示例（节选）：

```json
{
  "ok": true,
  "provider": {
    "name": "seedance2.0",
    "available": true,
    "baseUrl": "mock://seedance2.0",
    "keys": [
      { "id": "seedance2-key-1", "label": "your***ey-1" },
      { "id": "seedance2-key-2", "label": "your***ey-2" }
    ]
  }
}
```

说明：使用 `mock://seedance2.0` 可在本地完成可复现联调（提交 + 轮询成功），无需真实第三方网络。

## 8. 更新 volcengine 图片供应商配置

```bash
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "mock://volcengine",
    "keys": ["your-volcengine-key-1"]
  }' \
  "$BASE_URL/admin/providers/volcengine"
```

响应示例（节选）：

```json
{
  "ok": true,
  "provider": {
    "name": "volcengine",
    "available": true,
    "baseUrl": "mock://volcengine",
    "modalities": ["image"],
    "models": ["doubao-seedream-4-5-251128"],
    "keys": [
      { "id": "volcengine-key-1", "label": "your***ey-1" }
    ]
  }
}
```

说明：使用 `mock://volcengine` 可在本地完成可复现联调，无需真实火山引擎网络。

## 9. LLM 调用（OpenAI messages 格式）

先使用第 4 步生成一个调用方 key，假设为：

```bash
CLIENT_KEY="agw_xxxxxxxxxxxxxxxxxxxxx"
```

调用：

```bash
curl -s \
  -H "x-gateway-api-key: $CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "modality": "llm",
    "model": "mock-llm",
    "messages": [
      {"role":"system","content":"你是助手"},
      {"role":"user","content":"hello"}
    ]
  }' \
  "$BASE_URL/v1/gateway"
```

响应示例：

```json
{
  "requestId": "uuid",
  "modality": "llm",
  "model": "mock-llm",
  "provider": "mock",
  "output": {
    "text": "echo:hello",
    "message": {
      "role": "assistant",
      "content": "echo:hello"
    }
  },
  "metadata": {}
}
```

## 10. 火山引擎图片生成（2K）

先使用第 4 步生成一个调用方 key，假设为：

```bash
CLIENT_KEY="agw_xxxxxxxxxxxxxxxxxxxxx"
```

调用：

```bash
curl -s \
  -H "x-gateway-api-key: $CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -H "x-request-id: req_volc_image_2k" \
  -d '{
    "modality": "image",
    "model": "doubao-seedream-4-5-251128",
    "prompt": "生成一张白底电商商品主图",
    "settings": {
      "size": "2K",
      "watermark": false
    }
  }' \
  "$BASE_URL/v1/gateway"
```

响应示例：

```json
{
  "requestId": "req_volc_image_2k",
  "modality": "image",
  "model": "doubao-seedream-4-5-251128",
  "provider": "volcengine",
  "output": [
    {
      "kind": "url",
      "url": "https://mock.volcengine.local/generated-2k.png",
      "width": 2048,
      "height": 2048
    }
  ],
  "metadata": {
    "size": "2K",
    "responseFormat": "url",
    "trace": {
      "requestId": "mock-request-id",
      "keyId": "volcengine-key-1"
    }
  }
}
```

## 11. 火山引擎图片生成（4K）

```bash
curl -s \
  -H "x-gateway-api-key: $CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -H "x-request-id: req_volc_image_4k" \
  -d '{
    "modality": "image",
    "model": "doubao-seedream-4-5-251128",
    "prompt": "生成一张高质感 4K 商品海报",
    "settings": {
      "size": "4K",
      "watermark": true
    }
  }' \
  "$BASE_URL/v1/gateway"
```

响应示例：

```json
{
  "requestId": "req_volc_image_4k",
  "modality": "image",
  "model": "doubao-seedream-4-5-251128",
  "provider": "volcengine",
  "output": [
    {
      "kind": "url",
      "url": "https://mock.volcengine.local/generated-4k.png",
      "width": 4096,
      "height": 4096
    }
  ],
  "metadata": {
    "size": "4K",
    "responseFormat": "url",
    "trace": {
      "requestId": "mock-request-id",
      "keyId": "volcengine-key-1"
    }
  }
}
```

## 12. 视频任务提交

```bash
curl -s \
  -H "x-gateway-api-key: $CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "modality": "video",
    "model": "seedance-2.0",
    "prompt": "生成一段山谷晨雾短片",
    "operation": "generate",
    "assets": []
  }' \
  "$BASE_URL/v1/gateway"
```

响应示例（202）：

```json
{
  "requestId": "uuid",
  "modality": "video",
  "model": "seedance-2.0",
  "provider": "seedance2.0",
  "task": {
    "id": "task-uuid",
    "status": "queued",
    "modality": "video",
    "model": "seedance-2.0"
  }
}
```

## 13. 视频任务轮询

```bash
TASK_ID="上一步返回的task.id"

curl -s \
  -H "x-gateway-api-key: $CLIENT_KEY" \
  "$BASE_URL/v1/tasks/$TASK_ID"
```

响应示例（完成）：

```json
{
  "task": {
    "id": "task-uuid",
    "status": "succeeded",
    "output": [
      {
        "kind": "url",
        "url": "https://mock.seedance.local/.../final.mp4"
      }
    ],
    "providerTask": {
      "traceId": "trace-xxx",
      "keyId": "seedance2-key-1"
    }
  }
}
```

## 14. 参考图生视频（image-to-video）

关键参数：
- `modality`: `"video"`
- `model`: `"seedance-2.0"`
- `operation`: `"image-to-video"`
- `assets`: 至少包含一项参考图（`kind: "image"`）

### 11.1 使用图片 URL

```bash
curl -s \
  -H "x-gateway-api-key: $CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "modality": "video",
    "model": "seedance-2.0",
    "operation": "image-to-video",
    "prompt": "让人物缓慢抬头，头发有自然风动，镜头轻推，电影感光影",
    "assets": [
      {
        "kind": "image",
        "url": "https://your-cdn.example.com/reference.jpg"
      }
    ]
  }' \
  "$BASE_URL/v1/gateway"
```

响应示例（202）：

```json
{
  "requestId": "uuid",
  "modality": "video",
  "model": "seedance-2.0",
  "provider": "seedance2.0",
  "task": {
    "id": "task-uuid",
    "status": "queued",
    "modality": "video",
    "model": "seedance-2.0"
  }
}
```

### 11.2 使用本地图片文件路径

```bash
curl -s \
  -H "x-gateway-api-key: $CLIENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "modality": "video",
    "model": "seedance-2.0",
    "operation": "image-to-video",
    "prompt": "保持人物一致性，生成5秒自然运镜镜头",
    "assets": [
      {
        "kind": "image",
        "filePath": "/absolute/path/to/reference.jpg"
      }
    ]
  }' \
  "$BASE_URL/v1/gateway"
```

说明：
- `filePath` 必须是网关服务所在机器可访问的绝对路径
- 提交后用“视频任务轮询”接口查询结果

## 15. 常见错误示例

### 12.1 未携带调用方 API key

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "缺少或无效的 gateway api key"
  }
}
```

### 12.2 供应商不可用（未配置 / 标记 unavailable）

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "PROVIDER_UNAVAILABLE",
    "message": "Provider seedance2.0 is unavailable."
  }
}
```

### 12.3 参数校验失败（火山引擎图片 size）

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "size 仅支持 2K 或 4K。"
  }
}
```

### 12.4 模型未启用

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "MODEL_NOT_ENABLED",
    "message": "Model seedance-2.0 is not enabled for provider seedance2.0."
  }
}
```

### 12.5 参数校验失败（参考图参数）

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "operation=image-to-video requires at least one reference image."
  }
}
```

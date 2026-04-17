import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUnifiedImageArtifacts,
  extractImageTraceMeta,
  normalizeUnifiedImageOutput,
} from "@/application/services/task-image-payload";

test("图片结果归一：统一输出使用平台资产地址并保留供应商输出与追溯字段", () => {
  const artifacts = buildUnifiedImageArtifacts({
    taskId: "task-image-1",
    provider: "volcengine",
    model: "doubao-seedream-4-5-251128",
    markdown: "![generated image](https://provider.example.com/source.png)",
    sourceImageUrl: "https://provider.example.com/source.png",
    referenceImages: ["https://reference.example.com/1.png"],
    usage: {
      total_tokens: 10,
    },
    responseFormat: "url",
    size: "4K",
    trace: {
      requestId: "req-volc-1",
      traceId: "trace-volc-1",
      keyId: "key-volc-1",
    },
    rawResponse: {
      request_id: "req-volc-1",
      trace: {
        traceId: "trace-volc-1",
        keyId: "key-volc-1",
      },
    },
    providerOutput: [
      {
        kind: "url",
        url: "https://provider.example.com/source.png",
        width: 4096,
        height: 4096,
      },
    ],
    asset: {
      id: "asset-image-1",
      fileUrl: "https://canvas.example.com/assets/generated.png",
      storageKey: "workspace/generated.png",
      mimeType: "image/png",
    },
    generatedAt: "2026-04-16T00:00:00.000Z",
  });

  assert.deepEqual(artifacts.outputSnapshot, {
    taskId: "task-image-1",
    outputType: "image",
    content: "https://canvas.example.com/assets/generated.png",
    assets: [
      {
        assetId: "asset-image-1",
        assetType: "image",
        url: "https://canvas.example.com/assets/generated.png",
        mimeType: "image/png",
        width: 4096,
        height: 4096,
      },
    ],
    structuredData: {
      provider: "volcengine",
      model: "doubao-seedream-4-5-251128",
      markdown: "![generated image](https://provider.example.com/source.png)",
      imageUrl: "https://canvas.example.com/assets/generated.png",
      sourceImageUrl: "https://provider.example.com/source.png",
      assetId: "asset-image-1",
      storageKey: "workspace/generated.png",
      referenceImages: ["https://reference.example.com/1.png"],
      output: [
        {
          kind: "url",
          url: "https://canvas.example.com/assets/generated.png",
          mimeType: "image/png",
          width: 4096,
          height: 4096,
        },
      ],
      providerOutput: [
        {
          kind: "url",
          url: "https://provider.example.com/source.png",
          width: 4096,
          height: 4096,
        },
      ],
      usage: {
        total_tokens: 10,
      },
      size: "4K",
      responseFormat: "url",
      trace: {
        requestId: "req-volc-1",
        traceId: "trace-volc-1",
        keyId: "key-volc-1",
      },
    },
    generatedAt: "2026-04-16T00:00:00.000Z",
  });

  assert.deepEqual(artifacts.taskResultMeta.output, [
    {
      kind: "url",
      url: "https://canvas.example.com/assets/generated.png",
      mimeType: "image/png",
      width: 4096,
      height: 4096,
    },
  ]);
  assert.deepEqual(artifacts.taskResultMeta.providerOutput, [
    {
      kind: "url",
      url: "https://provider.example.com/source.png",
      width: 4096,
      height: 4096,
    },
  ]);
  assert.deepEqual(artifacts.taskResultMeta.trace, {
    requestId: "req-volc-1",
    traceId: "trace-volc-1",
    keyId: "key-volc-1",
  });
  assert.deepEqual(artifacts.responsePayload.rawResponse, {
    request_id: "req-volc-1",
    trace: {
      traceId: "trace-volc-1",
      keyId: "key-volc-1",
    },
  });
});

test("图片结果归一：支持 data uri 回退生成标准输出", () => {
  const output = normalizeUnifiedImageOutput([], "data:image/png;base64,abc");

  assert.deepEqual(output, [
    {
      kind: "url",
      url: "data:image/png;base64,abc",
    },
  ]);
});

test("图片结果归一：当供应商输出缺少宽高时回退到平台资产元数据", () => {
  const artifacts = buildUnifiedImageArtifacts({
    taskId: "task-image-asset-dimensions",
    provider: "cloubic",
    model: "gpt-image",
    markdown: "![generated image](data:image/png;base64,abc)",
    dataUri: "data:image/png;base64,abc",
    referenceImages: [],
    rawResponse: {
      id: "raw-cloubic-1",
    },
    providerOutput: [
      {
        kind: "url",
        url: "data:image/png;base64,abc",
      },
    ],
    asset: {
      id: "asset-image-2",
      fileUrl: "https://canvas.example.com/assets/generated-2.png",
      storageKey: "workspace/generated-2.png",
      mimeType: "image/png",
      width: 1536,
      height: 1024,
    },
    generatedAt: "2026-04-16T01:00:00.000Z",
  });

  assert.deepEqual(artifacts.taskResultMeta.output, [
    {
      kind: "url",
      url: "https://canvas.example.com/assets/generated-2.png",
      mimeType: "image/png",
      width: 1536,
      height: 1024,
    },
  ]);
  assert.deepEqual(artifacts.outputSnapshot.assets, [
    {
      assetId: "asset-image-2",
      assetType: "image",
      url: "https://canvas.example.com/assets/generated-2.png",
      mimeType: "image/png",
      width: 1536,
      height: 1024,
    },
  ]);
});

test("图片追溯字段提取：兼容 trace 内部与扁平字段", () => {
  const trace = extractImageTraceMeta({
    trace: {
      request_id: "req-1",
      traceId: "trace-1",
      key_id: "key-1",
    },
  });

  assert.deepEqual(trace, {
    requestId: "req-1",
    traceId: "trace-1",
    keyId: "key-1",
  });
});

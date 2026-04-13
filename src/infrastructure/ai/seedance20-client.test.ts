import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "@/lib/api";
import { __seedance20TestUtils } from "@/infrastructure/ai/seedance20-client";

test("seedance2.0 参考图映射：合并 assets 与 settings 字段", () => {
  const payload = __seedance20TestUtils.buildRequestBody(
    {
      prompt: "生成视频",
      model: "seedance-2.0",
      assets: [
        {
          kind: "image",
          url: "https://example.com/a.png",
          role: "reference",
        },
      ],
      settings: {
        firstFrameImageUrl: "https://example.com/first.png",
        lastFrameImageUrl: "https://example.com/last.png",
        referenceImages: ["https://example.com/b.png"],
      },
    },
    "seedance-2.0",
  );

  const urls = payload.body.assets.map((asset) => asset.url);
  assert.deepEqual(urls, [
    "https://example.com/a.png",
    "https://example.com/first.png",
    "https://example.com/last.png",
    "https://example.com/b.png",
  ]);
});

test("seedance2.0 参数校验：image-to-video 必须包含参考图", () => {
  assert.throws(
    () =>
      __seedance20TestUtils.buildRequestBody(
        {
          prompt: "生成视频",
          model: "seedance-2.0",
          settings: {
            operation: "image-to-video",
          },
        },
        "seedance-2.0",
      ),
    (error) => error instanceof ApiError && error.code === "VALIDATION_ERROR",
  );
});

test("seedance2.0 状态映射：完成态输出统一为 output.kind=url", () => {
  const output = __seedance20TestUtils.normalizeVideoOutputItems({
    status: "succeeded",
    data: {
      output: [
        {
          kind: "video",
          url: "https://example.com/final.mp4",
          mime_type: "video/mp4",
          width: 1280,
          height: 720,
          duration_ms: 5000,
        },
      ],
    },
  });

  assert.deepEqual(output, [
    {
      kind: "url",
      url: "https://example.com/final.mp4",
      mimeType: "video/mp4",
      width: 1280,
      height: 720,
      durationMs: 5000,
    },
  ]);
});

test("seedance2.0 追溯字段提取：兼容 jobId/traceId/keyId", () => {
  const trace = __seedance20TestUtils.pickTraceMeta({
    data: {
      jobId: "job-1",
      traceId: "trace-1",
      keyId: "key-1",
    },
  });

  assert.deepEqual(trace, {
    jobId: "job-1",
    traceId: "trace-1",
    keyId: "key-1",
  });
});

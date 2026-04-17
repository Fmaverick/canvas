import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "@/lib/api";
import { __volcengineImageTestUtils } from "@/infrastructure/ai/volcengine-image-client";

test("volcengine 图片请求映射：默认填充 response_format/size/stream/watermark", () => {
  const payload = __volcengineImageTestUtils.buildRequestBody(
    {
      prompt: "生成一张商品主图",
      model: "doubao-seedream-5-0-260128",
    },
    "doubao-seedream-5-0-260128",
  );

  assert.deepEqual(payload.body, {
    model: "doubao-seedream-5-0-260128",
    prompt: "生成一张商品主图",
    response_format: "url",
    size: "2048x2048",
    stream: false,
    watermark: false,
  });
});

test("volcengine 图片请求映射：支持 4K、宽高比与参考图", () => {
  const payload = __volcengineImageTestUtils.buildRequestBody(
    {
      prompt: "生成一张海报",
      model: "doubao-seedream-5-0-260128",
      settings: {
        size: "4K",
        aspectRatio: "16:9",
        stream: true,
        watermark: true,
        sequentialImageGeneration: "auto",
        sequentialImageGenerationOptions: { max_images: 3 },
      },
      assets: [
        { kind: "image", url: "https://example.com/ref1.png", role: "reference" },
        { kind: "image", url: "https://example.com/ref2.png", role: "reference" },
      ],
    },
    "doubao-seedream-5-0-260128",
  );

  assert.deepEqual(payload.body, {
    model: "doubao-seedream-5-0-260128",
    prompt: "生成一张海报",
    response_format: "url",
    size: "5504x3040",
    stream: true,
    watermark: true,
    sequential_image_generation: "auto",
    sequential_image_generation_options: { max_images: 3 },
    image: ["https://example.com/ref1.png", "https://example.com/ref2.png"],
  });
});

test("volcengine 参数校验：非法 size 或 aspectRatio 被拒绝", () => {
  assert.throws(
    () =>
      __volcengineImageTestUtils.buildRequestBody(
        {
          prompt: "生成图片",
          model: "doubao-seedream-5-0-260128",
          settings: {
            size: "1024x1024",
          },
        },
        "doubao-seedream-5-0-260128",
      ),
    (error) => error instanceof ApiError && error.code === "VALIDATION_ERROR",
  );

  assert.throws(
    () =>
      __volcengineImageTestUtils.buildRequestBody(
        {
          prompt: "生成图片",
          model: "doubao-seedream-5-0-260128",
          settings: {
            aspectRatio: "99:99",
          },
        },
        "doubao-seedream-5-0-260128",
      ),
    (error) => error instanceof ApiError && error.code === "VALIDATION_ERROR",
  );
});

test("volcengine 输出归一：将 data[].url 与分辨率信息映射为标准输出", () => {
  const output = __volcengineImageTestUtils.normalizeImageOutputItems({
    created: 1,
    data: [
      {
        url: "https://cdn.example.com/generated.png",
        size: "4096x4096",
      },
    ],
  });

  assert.deepEqual(output, [
    {
      kind: "url",
      url: "https://cdn.example.com/generated.png",
      width: 4096,
      height: 4096,
    },
  ]);
});

test("volcengine 错误码归一：供应商参数错误映射为 PROVIDER_BAD_REQUEST", () => {
  const error = __volcengineImageTestUtils.mapProviderError(
    400,
    {
      error: {
        code: "InvalidParameter",
        message: "invalid prompt",
      },
    },
    "fallback",
  );

  assert.equal(error.code, "PROVIDER_BAD_REQUEST");
  assert.equal(error.status, 400);
});

test("volcengine 错误码归一：供应商限流映射为 PROVIDER_RATE_LIMITED", () => {
  const error = __volcengineImageTestUtils.mapProviderError(
    429,
    {
      error: {
        code: "RateLimitExceeded",
        message: "too many requests",
      },
    },
    "fallback",
  );

  assert.equal(error.code, "PROVIDER_RATE_LIMITED");
  assert.equal(error.status, 429);
});

test("volcengine 错误码归一：传输超时映射为 PROVIDER_TIMEOUT", () => {
  const error = __volcengineImageTestUtils.mapTransportError(new Error("request timed out after 30s"));

  assert.equal(error.code, "PROVIDER_TIMEOUT");
  assert.equal(error.status, 504);
});

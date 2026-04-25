import assert from "node:assert/strict";
import test from "node:test";

import { ApiError } from "@/lib/api";
import { __seedance20TestUtils } from "@/infrastructure/ai/seedance20-client";

test("volcengine seedance 2.0 content 映射：合并 prompt/assets/settings", () => {
  const content = __seedance20TestUtils.normalizeContent({
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
      referenceVideoUrl: "https://example.com/ref.mp4",
      referenceAudioUrl: "https://example.com/ref.mp3",
    },
  });

  assert.deepEqual(
    content.map((item) => item.type),
    ["text", "image_url", "image_url", "image_url", "image_url", "video_url", "audio_url"],
  );
});

test("volcengine seedance 2.0 参数校验：需要至少一个 text content", () => {
  assert.throws(
    () =>
      __seedance20TestUtils.normalizeContent({
        content: [
          {
            type: "image_url",
            image_url: {
              url: "https://example.com/a.png",
            },
            role: "reference_image",
          },
        ],
      }),
    (error) => error instanceof ApiError && error.code === "VALIDATION_ERROR",
  );
});

test("volcengine seedance 2.0 请求体：透传 generate_audio/ratio/duration/watermark", () => {
  const payload = __seedance20TestUtils.buildRequestBody({
    prompt: "生成视频",
    model: "seedance-2.0",
    settings: {
      generate_audio: true,
      ratio: "16:9",
      duration: 11,
      watermark: false,
    },
  });

  assert.equal(payload.body.generate_audio, true);
  assert.equal(payload.body.ratio, "16:9");
  assert.equal(payload.body.duration, 11);
  assert.equal(payload.body.watermark, false);
});

test("volcengine seedance 2.0 请求体：兼容从视频节点 size 映射 ratio", () => {
  const payload = __seedance20TestUtils.buildRequestBody({
    prompt: "生成视频",
    model: "seedance-2.0",
    settings: {
      size: "16:9",
      duration: 5,
    },
  });

  assert.equal(payload.body.ratio, "16:9");
});

test("volcengine seedance 2.0 参数校验：接受 asset:// 引用", () => {
  const content = __seedance20TestUtils.normalizeContent({
    prompt: "生成视频",
    model: "seedance-2.0",
    assets: [
      {
        kind: "image",
        url: "asset://volc-subject-1",
        role: "reference",
      },
    ],
    content: [
      {
        type: "image_url",
        image_url: {
          url: "asset://volc-cover-1",
        },
        role: "reference_image",
      },
    ],
    settings: {
      firstFrameImageUrl: "asset://volc-first-1",
      lastFrameImageUrl: "asset://volc-last-1",
      referenceImages: ["asset://volc-extra-1"],
      referenceVideoUrl: "asset://volc-video-1",
      referenceAudioUrl: "asset://volc-audio-1",
    },
  });

  assert.deepEqual(
    content.map((item) => {
      if (item.type === "text") {
        return item.text;
      }

      if (item.type === "image_url") {
        return item.image_url.url;
      }

      if (item.type === "video_url") {
        return item.video_url.url;
      }

      return item.audio_url.url;
    }),
    [
      "asset://volc-cover-1",
      "生成视频",
      "asset://volc-subject-1",
      "asset://volc-first-1",
      "asset://volc-last-1",
      "asset://volc-extra-1",
      "asset://volc-video-1",
      "asset://volc-audio-1",
    ],
  );
});

test("volcengine seedance 2.0 状态映射：succeeded -> completed", () => {
  assert.equal(__seedance20TestUtils.mapVolcengineTaskStatus("succeeded"), "completed");
});

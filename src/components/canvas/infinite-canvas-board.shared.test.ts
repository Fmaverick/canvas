import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_IMAGE_NODE_SETTINGS,
  getDefaultCanvasNodeSettings,
  normalizeImageNodeSettings,
  serializeImageNodeSettings,
} from "@/components/canvas/infinite-canvas-board.shared";

test("图片节点默认配置包含 2K 尺寸与 1:1 比例", () => {
  assert.deepEqual(getDefaultCanvasNodeSettings("image"), {
    size: "2K",
    aspectRatio: "1:1",
  });
});

test("图片节点配置归一化接受 2K/4K 与比例，非法值回退", () => {
  assert.deepEqual(normalizeImageNodeSettings(null), DEFAULT_IMAGE_NODE_SETTINGS);
  assert.deepEqual(normalizeImageNodeSettings({ size: "4K", aspectRatio: "16:9" }), {
    size: "4K",
    aspectRatio: "16:9",
  });
  assert.deepEqual(normalizeImageNodeSettings({ size: "1024x1024", aspectRatio: "99:99" }), DEFAULT_IMAGE_NODE_SETTINGS);
});

test("图片节点配置序列化保留字段", () => {
  assert.deepEqual(serializeImageNodeSettings({ size: "4K", aspectRatio: "16:9" }), {
    size: "4K",
    aspectRatio: "16:9",
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { detectImageDimensions } from "@/lib/image-dimensions";

test("生成资产尺寸探测：可从 PNG 文件头解析宽高", () => {
  const buffer = Buffer.alloc(24);

  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer[4] = 0x0d;
  buffer[5] = 0x0a;
  buffer[6] = 0x1a;
  buffer[7] = 0x0a;
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(1536, 16);
  buffer.writeUInt32BE(1024, 20);

  assert.deepEqual(detectImageDimensions(buffer, "image/png"), {
    width: 1536,
    height: 1024,
  });
});

test("生成资产尺寸探测：mimeType 缺失时回退到文件头识别 JPEG", () => {
  const buffer = Buffer.from(
    "ffd8ffe000104a46494600010100000100010000ffc00011080004000603011100021100031100ffd9",
    "hex",
  );

  assert.deepEqual(detectImageDimensions(buffer), {
    width: 6,
    height: 4,
  });
});

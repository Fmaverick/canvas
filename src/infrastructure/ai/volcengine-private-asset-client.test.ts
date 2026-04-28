import assert from "node:assert/strict";
import test from "node:test";

import { buildArtsApiUrl } from "@/infrastructure/ai/arts-api-client";

test("volcengine 私域素材请求：query 按字典序排序并做 URL 编码", () => {
  const url = buildArtsApiUrl("https://apis.artsapi.com/api", "", {
    Version: "2024-01-01",
    Action: "CreateAsset",
    Name: "summer dress",
  });

  assert.equal(url, "https://apis.artsapi.com/api?Action=CreateAsset&Name=summer+dress&Version=2024-01-01");
});

test("volcengine 私域素材请求：保留根路径并附带 Action/Version", () => {
  const url = buildArtsApiUrl("https://apis.artsapi.com/api", "", {
    Action: "GetAsset",
    Version: "2024-01-01",
  });

  assert.equal(url, "https://apis.artsapi.com/api?Action=GetAsset&Version=2024-01-01");
});

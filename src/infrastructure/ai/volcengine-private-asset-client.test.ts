import assert from "node:assert/strict";
import test from "node:test";

import { __volcenginePrivateAssetTestUtils } from "@/infrastructure/ai/volcengine-private-asset-client";

test("volcengine 私域素材签名：query 按字典序排序并做 RFC3986 编码", () => {
  const canonicalQuery = __volcenginePrivateAssetTestUtils.buildCanonicalQuery({
    Version: "2024-01-01",
    Action: "CreateAsset",
    Name: "summer dress",
  });

  assert.equal(canonicalQuery, "Action=CreateAsset&Name=summer%20dress&Version=2024-01-01");
});

test("volcengine 私域素材签名：固定输入生成稳定的 string-to-sign", () => {
  const signed = __volcenginePrivateAssetTestUtils.buildAuthorizationHeader({
    method: "POST",
    pathname: "/",
    query: {
      Action: "GetAsset",
      Version: "2024-01-01",
    },
    bodyText: JSON.stringify({
      Id: "asset-123",
      ProjectName: "default",
    }),
    host: "ark.cn-beijing.volcengineapi.com",
    accessKey: "ak-test",
    secretKey: "sk-test",
    region: "cn-beijing",
    service: "ark",
    now: new Date("2026-04-21T08:30:45.000Z"),
  });

  assert.equal(signed.xDate, "20260421T083045Z");
  assert.match(signed.authorization, /^HMAC-SHA256 Credential=ak-test\/20260421\/cn-beijing\/ark\/request,/);
  assert.match(signed.authorization, /SignedHeaders=content-type;host;x-content-sha256;x-date,/);
  assert.match(signed.authorization, /Signature=[0-9a-f]{64}$/);
  assert.ok(signed.canonicalRequest.includes("Action=GetAsset&Version=2024-01-01"));
  assert.ok(signed.stringToSign.includes("20260421/cn-beijing/ark/request"));
});

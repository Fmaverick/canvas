import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveUpstreamVideoReferenceUrl,
  resolveVideoReferenceSourceUrl,
  toVolcengineAssetUri,
} from "@/application/services/volcengine-video-reference";

test("素材库图片已激活时优先使用 asset://<volcengine_asset_id>", () => {
  const resolved = resolveVideoReferenceSourceUrl({
    asset: {
      ownerType: "library_item",
      ownerId: "subject-1",
      fileUrl: "https://cdn.example.com/subject-1.png",
      volcengineAssetId: "volc-asset-1",
      volcengineSyncStatus: "active",
    },
    provider: "volcengine",
  });

  assert.equal(resolved, toVolcengineAssetUri("volc-asset-1"));
});

test("主体素材未同步成功时回退本地公网 URL", () => {
  const processingUrl = resolveVideoReferenceSourceUrl({
    asset: {
      ownerType: "library_item",
      ownerId: "subject-1",
      fileUrl: "https://cdn.example.com/subject-processing.png",
      volcengineAssetId: "volc-asset-processing",
      volcengineSyncStatus: "processing",
    },
    provider: "volcengine",
  });
  const failedUrl = resolveVideoReferenceSourceUrl({
    asset: {
      ownerType: "library_item",
      ownerId: "subject-1",
      fileUrl: "https://cdn.example.com/subject-failed.png",
      volcengineAssetId: "volc-asset-failed",
      volcengineSyncStatus: "failed",
    },
    provider: "volcengine",
  });

  assert.equal(processingUrl, "https://cdn.example.com/subject-processing.png");
  assert.equal(failedUrl, "https://cdn.example.com/subject-failed.png");
});

test("非素材库引用或非火山 provider 不使用 asset://", () => {
  const nonLibraryItemUrl = resolveVideoReferenceSourceUrl({
    asset: {
      ownerType: "canvas_node",
      ownerId: "node-1",
      fileUrl: "https://cdn.example.com/node-1.png",
      volcengineAssetId: "volc-node-1",
      volcengineSyncStatus: "active",
    },
    provider: "volcengine",
  });
  const otherProviderUrl = resolveVideoReferenceSourceUrl({
    asset: {
      ownerType: "library_item",
      ownerId: "subject-1",
      fileUrl: "https://cdn.example.com/subject-1.png",
      volcengineAssetId: "volc-asset-1",
      volcengineSyncStatus: "active",
    },
    provider: "cloubic",
  });

  assert.equal(nonLibraryItemUrl, "https://cdn.example.com/node-1.png");
  assert.equal(otherProviderUrl, "https://cdn.example.com/subject-1.png");
});

test("上游 fallback 资产命中素材库时也会转换为 asset://", () => {
  const resolved = resolveUpstreamVideoReferenceUrl({
    provider: "volcengine",
    upstreamImageUrl: "https://cdn.example.com/subject-1.png",
    fallbackAsset: {
      ownerType: "library_item",
      ownerId: "subject-1",
      fileUrl: "https://cdn.example.com/subject-1.png",
      volcengineAssetId: "volc-asset-upstream-1",
      volcengineSyncStatus: "active",
    },
  });

  assert.equal(resolved, toVolcengineAssetUri("volc-asset-upstream-1"));
});

test("上游已生成的新图片输出保留原始 URL，不误替换为 asset://", () => {
  const resolved = resolveUpstreamVideoReferenceUrl({
    provider: "volcengine",
    upstreamImageUrl: "https://cdn.example.com/generated-output.png",
    fallbackAsset: {
      ownerType: "library_item",
      ownerId: "subject-1",
      fileUrl: "https://cdn.example.com/subject-1.png",
      volcengineAssetId: "volc-asset-upstream-1",
      volcengineSyncStatus: "active",
    },
  });

  assert.equal(resolved, "https://cdn.example.com/generated-output.png");
});

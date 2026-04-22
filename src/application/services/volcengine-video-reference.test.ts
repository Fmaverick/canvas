import assert from "node:assert/strict";
import test from "node:test";

import { resolveVideoReferenceSourceUrl, toVolcengineAssetUri } from "@/application/services/volcengine-video-reference";

test("主体素材已激活时优先使用 asset://<volcengine_asset_id>", () => {
  const resolved = resolveVideoReferenceSourceUrl({
    asset: {
      ownerType: "library_item",
      ownerId: "subject-1",
      fileUrl: "https://cdn.example.com/subject-1.png",
      volcengineAssetId: "volc-asset-1",
      volcengineSyncStatus: "active",
    },
    provider: "volcengine",
    subjectIds: ["subject-1"],
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
    subjectIds: ["subject-1"],
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
    subjectIds: ["subject-1"],
  });

  assert.equal(processingUrl, "https://cdn.example.com/subject-processing.png");
  assert.equal(failedUrl, "https://cdn.example.com/subject-failed.png");
});

test("非主体引用或非火山 provider 不使用 asset://", () => {
  const nonSubjectUrl = resolveVideoReferenceSourceUrl({
    asset: {
      ownerType: "library_item",
      ownerId: "scene-1",
      fileUrl: "https://cdn.example.com/scene-1.png",
      volcengineAssetId: "volc-scene-1",
      volcengineSyncStatus: "active",
    },
    provider: "volcengine",
    subjectIds: ["subject-1"],
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
    subjectIds: ["subject-1"],
  });

  assert.equal(nonSubjectUrl, "https://cdn.example.com/scene-1.png");
  assert.equal(otherProviderUrl, "https://cdn.example.com/subject-1.png");
});

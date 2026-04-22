type SupportedVideoProvider = "volcengine" | "cloubic" | "internal" | string;

type VideoReferenceAsset = {
  ownerType?: string | null;
  ownerId?: string | null;
  fileUrl: string;
  volcengineAssetId?: string | null;
  volcengineSyncStatus?: string | null;
};

export function toVolcengineAssetUri(assetId: string) {
  return `asset://${assetId}`;
}

export function resolveVideoReferenceSourceUrl(params: {
  asset: VideoReferenceAsset;
  provider: SupportedVideoProvider;
  subjectIds: string[];
}) {
  const normalizedSubjectIds = new Set(params.subjectIds);

  if (
    params.provider === "volcengine" &&
    params.asset.ownerType === "library_item" &&
    params.asset.ownerId &&
    normalizedSubjectIds.has(params.asset.ownerId) &&
    params.asset.volcengineSyncStatus === "active" &&
    typeof params.asset.volcengineAssetId === "string" &&
    params.asset.volcengineAssetId.trim().length > 0
  ) {
    return toVolcengineAssetUri(params.asset.volcengineAssetId.trim());
  }

  return params.asset.fileUrl;
}

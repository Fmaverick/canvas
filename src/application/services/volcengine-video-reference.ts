export type SupportedVideoProvider = "volcengine" | "cloubic" | "internal" | string;

export type VideoReferenceAsset = {
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
  subjectIds?: string[];
}) {
  if (
    params.provider === "volcengine" &&
    params.asset.ownerType === "library_item" &&
    params.asset.volcengineSyncStatus === "active" &&
    typeof params.asset.volcengineAssetId === "string" &&
    params.asset.volcengineAssetId.trim().length > 0
  ) {
    return toVolcengineAssetUri(params.asset.volcengineAssetId.trim());
  }

  return params.asset.fileUrl;
}

export function resolveUpstreamVideoReferenceUrl(params: {
  provider: SupportedVideoProvider;
  upstreamImageUrl?: string | null;
  fallbackAsset?: VideoReferenceAsset | null;
}) {
  const normalizedUpstreamImageUrl =
    typeof params.upstreamImageUrl === "string" && params.upstreamImageUrl.trim().length > 0
      ? params.upstreamImageUrl.trim()
      : null;

  if (!params.fallbackAsset) {
    return normalizedUpstreamImageUrl ?? undefined;
  }

  const fallbackUrl = resolveVideoReferenceSourceUrl({
    asset: params.fallbackAsset,
    provider: params.provider,
  });

  if (!normalizedUpstreamImageUrl || normalizedUpstreamImageUrl === params.fallbackAsset.fileUrl) {
    return fallbackUrl;
  }

  return normalizedUpstreamImageUrl;
}

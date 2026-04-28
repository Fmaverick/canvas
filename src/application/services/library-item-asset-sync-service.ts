import { z } from "zod";

import {
  listAssetRowsByOwner,
  getVolcengineSyncSummaryFromAssetRow,
  updateAssetVolcengineSyncState,
  volcengineSyncStatusSchema,
} from "@/application/services/asset-service";
import { getLibraryItemById, updateLibraryItemVolcengineBinding } from "@/application/services/library-item-service";
import {
  createVolcengineAsset,
  createVolcengineAssetGroup,
  getVolcengineAsset,
} from "@/infrastructure/ai/volcengine-private-asset-client";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

const DEFAULT_POLL_ATTEMPTS = 3;
const DEFAULT_POLL_INTERVAL_MS = 500;

const syncAssetIdListSchema = z.array(z.uuid()).default([]);
type VolcengineSyncStatus = z.infer<typeof volcengineSyncStatusSchema>;

export const syncLibraryItemAssetsInputSchema = z.object({
  workspaceId: z.uuid(),
  itemId: z.uuid(),
  assetIds: syncAssetIdListSchema.optional(),
  pollAttempts: z.coerce.number().int().positive().max(10).optional(),
});

type VolcengineSyncConfig = {
  apiKey?: string;
  projectName?: string;
  baseUrl?: string;
};

type SyncAction = "created" | "reused" | "polled" | "skipped";

type SyncAssetResult = {
  assetId: string;
  fileName: string;
  assetType: string;
  action: SyncAction;
  syncStatus: "not_synced" | "processing" | "active" | "failed" | "skipped";
  volcengineAssetId: string | null;
  volcengineAssetGroupId: string | null;
  volcengineProjectName: string | null;
  lastSyncedAt: Date | null;
  lastSyncErrorCode: string | null;
  lastSyncError: string | null;
  error: {
    code: string;
    message: string;
  } | null;
  syncSummary: ReturnType<typeof getVolcengineSyncSummaryFromAssetRow>;
};

type LibraryItemRecord = {
  kind: string;
  name: string;
  volcengineAssetGroupId: string | null;
  volcengineProjectName: string | null;
};

type LibraryItemAssetRow = {
  id: string;
  fileName: string;
  fileUrl: string;
  assetType: string;
  volcengineAssetId: string | null;
  volcengineAssetGroupId: string | null;
  volcengineProjectName: string | null;
  volcengineSyncStatus: VolcengineSyncStatus;
  volcengineLastSyncedAt: Date | null;
  volcengineLastSyncErrorCode: string | null;
  volcengineLastSyncError: string | null;
};

type SyncedLibraryItemAssetRow = LibraryItemAssetRow & {
  volcengineSync: ReturnType<typeof getVolcengineSyncSummaryFromAssetRow>;
};

type LibraryItemAssetSyncDeps = {
  config: VolcengineSyncConfig;
  listAssetRowsByOwner: (input: { workspaceId: string; ownerType: "library_item"; ownerId: string }) => Promise<LibraryItemAssetRow[]>;
  getLibraryItemById: (workspaceId: string, itemId: string) => Promise<LibraryItemRecord>;
  updateLibraryItemVolcengineBinding: (input: {
    workspaceId: string;
    itemId: string;
    volcengineAssetGroupId?: string | null;
    volcengineProjectName?: string | null;
  }) => Promise<unknown>;
  updateAssetVolcengineSyncState: (input: {
    workspaceId: string;
    assetId: string;
    volcengineAssetId?: string | null;
    volcengineAssetGroupId?: string | null;
    volcengineProjectName?: string | null;
    volcengineSyncStatus: VolcengineSyncStatus;
    volcengineLastSyncedAt?: Date | null;
    volcengineLastSyncErrorCode?: string | null;
    volcengineLastSyncError?: string | null;
  }) => Promise<SyncedLibraryItemAssetRow>;
  createVolcengineAssetGroup: (input: {
    name: string;
    description?: string;
    projectName?: string;
  }) => Promise<{ id: string }>;
  createVolcengineAsset: (input: {
    groupId: string;
    url: string;
    name?: string;
    assetType: "Image";
    projectName?: string;
  }) => Promise<{ id: string }>;
  getVolcengineAsset: (input: {
    id: string;
    projectName?: string;
  }) => Promise<{
    id: string;
    groupId?: string;
    projectName?: string;
    status?: "Active" | "Processing" | "Failed";
    error?: {
      code?: string;
      message?: string;
    };
  }>;
  sleep: (ms: number) => Promise<unknown>;
};

type PolledAssetState = {
  syncStatus: "processing" | "active" | "failed";
  assetId: string;
  assetGroupId: string | null;
  projectName: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  lastSyncedAt: Date;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toVolcengineSyncStatus(status: string): VolcengineSyncStatus {
  return volcengineSyncStatusSchema.parse(status);
}

function assertSyncConfig(config: VolcengineSyncConfig) {
  if (!config.apiKey) {
    throw new ApiError(503, "VOLCENGINE_SYNC_CONFIG_MISSING", "缺少火山私域素材库 Bearer Key 配置。");
  }

  if (!config.projectName) {
    throw new ApiError(503, "VOLCENGINE_SYNC_CONFIG_MISSING", "缺少火山私域素材库 ProjectName 配置。");
  }

  if (!config.baseUrl) {
    throw new ApiError(503, "VOLCENGINE_SYNC_CONFIG_MISSING", "缺少火山私域素材库 Base URL 配置。");
  }

  return config.projectName;
}

const defaultLibraryItemAssetSyncDeps: LibraryItemAssetSyncDeps = {
  config: {
    apiKey: env.artsApiKey,
    projectName: env.artsAssetProjectName,
    baseUrl: env.artsApiBaseUrl,
  },
  listAssetRowsByOwner: async (input) => {
    const rows = await listAssetRowsByOwner(input);

    return rows.map((row) => ({
      ...row,
      volcengineSyncStatus: toVolcengineSyncStatus(row.volcengineSyncStatus),
    }));
  },
  getLibraryItemById,
  updateLibraryItemVolcengineBinding,
  updateAssetVolcengineSyncState,
  createVolcengineAssetGroup,
  createVolcengineAsset,
  getVolcengineAsset,
  sleep,
};

function mergeLibraryItemAssetSyncDeps(overrides: Partial<LibraryItemAssetSyncDeps>) {
  return {
    ...defaultLibraryItemAssetSyncDeps,
    ...overrides,
    config: {
      ...defaultLibraryItemAssetSyncDeps.config,
      ...overrides.config,
    },
  } satisfies LibraryItemAssetSyncDeps;
}

async function ensureSubjectAssetGroup(
  deps: LibraryItemAssetSyncDeps,
  params: {
  workspaceId: string;
  itemId: string;
  itemName: string;
  boundGroupId: string | null;
  boundProjectName: string | null;
  projectName: string;
},
) {
  if (params.boundGroupId) {
    if (params.boundProjectName && params.boundProjectName !== params.projectName) {
      throw new ApiError(
        409,
        "VOLCENGINE_SYNC_PROJECT_MISMATCH",
        "主体已绑定的火山项目与当前配置不一致，无法复用素材组。",
      );
    }

    return {
      assetGroupId: params.boundGroupId,
      reused: true,
    };
  }

  const group = await deps.createVolcengineAssetGroup({
    name: `${params.itemName}-subject-assets`,
    description: `Library item ${params.itemId}`,
    projectName: params.projectName,
  });

  await deps.updateLibraryItemVolcengineBinding({
    workspaceId: params.workspaceId,
    itemId: params.itemId,
    volcengineAssetGroupId: group.id,
    volcengineProjectName: params.projectName,
  });

  return {
    assetGroupId: group.id,
    reused: false,
  };
}

async function pollAssetState(
  deps: LibraryItemAssetSyncDeps,
  params: {
  volcengineAssetId: string;
  assetGroupId: string;
  projectName: string;
  pollAttempts: number;
},
) {
  let latest: PolledAssetState = {
    syncStatus: "processing",
    assetId: params.volcengineAssetId,
    assetGroupId: params.assetGroupId,
    projectName: params.projectName,
    errorCode: null,
    errorMessage: null,
    lastSyncedAt: new Date(),
  };

  for (let attempt = 0; attempt < params.pollAttempts; attempt += 1) {
    const remoteAsset = await deps.getVolcengineAsset({
      id: params.volcengineAssetId,
      projectName: params.projectName,
    });
    const remoteProjectName = remoteAsset.projectName ?? params.projectName;

    if (remoteProjectName !== params.projectName) {
      return {
        syncStatus: "failed",
        assetId: params.volcengineAssetId,
        assetGroupId: remoteAsset.groupId ?? params.assetGroupId,
        projectName: remoteProjectName,
        errorCode: "VOLCENGINE_SYNC_PROJECT_MISMATCH",
        errorMessage: "火山素材所属项目与当前推理项目不一致。",
        lastSyncedAt: new Date(),
      } satisfies PolledAssetState;
    }

    if (remoteAsset.status === "Active") {
      return {
        syncStatus: "active",
        assetId: remoteAsset.id,
        assetGroupId: remoteAsset.groupId ?? params.assetGroupId,
        projectName: remoteProjectName,
        errorCode: null,
        errorMessage: null,
        lastSyncedAt: new Date(),
      } satisfies PolledAssetState;
    }

    if (remoteAsset.status === "Failed") {
      return {
        syncStatus: "failed",
        assetId: remoteAsset.id,
        assetGroupId: remoteAsset.groupId ?? params.assetGroupId,
        projectName: remoteProjectName,
        errorCode: remoteAsset.error?.code ?? "VOLCENGINE_SYNC_REMOTE_FAILED",
        errorMessage: remoteAsset.error?.message ?? "火山素材处理失败。",
        lastSyncedAt: new Date(),
      } satisfies PolledAssetState;
    }

    latest = {
      syncStatus: "processing",
      assetId: remoteAsset.id,
      assetGroupId: remoteAsset.groupId ?? params.assetGroupId,
      projectName: remoteProjectName,
      errorCode: null,
      errorMessage: null,
      lastSyncedAt: new Date(),
    };

    if (attempt < params.pollAttempts - 1) {
      await deps.sleep(DEFAULT_POLL_INTERVAL_MS);
    }
  }

  return latest;
}

async function persistPolledAssetState(
  deps: LibraryItemAssetSyncDeps,
  params: {
  workspaceId: string;
  localAssetId: string;
  state: PolledAssetState;
},
) {
  return deps.updateAssetVolcengineSyncState({
    workspaceId: params.workspaceId,
    assetId: params.localAssetId,
    volcengineAssetId: params.state.assetId,
    volcengineAssetGroupId: params.state.assetGroupId,
    volcengineProjectName: params.state.projectName,
    volcengineSyncStatus: params.state.syncStatus,
    volcengineLastSyncedAt: params.state.lastSyncedAt,
    volcengineLastSyncErrorCode: params.state.errorCode,
    volcengineLastSyncError: params.state.errorMessage,
  });
}

async function syncLibraryItemAssetsWithDeps(
  input: z.infer<typeof syncLibraryItemAssetsInputSchema>,
  deps: LibraryItemAssetSyncDeps,
) {
  const parsed = syncLibraryItemAssetsInputSchema.parse(input);
  const projectName = assertSyncConfig(deps.config);
  const item = await deps.getLibraryItemById(parsed.workspaceId, parsed.itemId);

  if (item.kind !== "subject") {
    throw new ApiError(400, "VOLCENGINE_SYNC_ONLY_SUPPORTS_SUBJECT", "仅主体库条目支持同步到火山素材库。");
  }

  if (item.volcengineProjectName && item.volcengineProjectName !== projectName) {
    throw new ApiError(409, "VOLCENGINE_SYNC_PROJECT_MISMATCH", "主体绑定的火山项目与当前配置不一致。");
  }

  const assetRows = await deps.listAssetRowsByOwner({
    workspaceId: parsed.workspaceId,
    ownerType: "library_item",
    ownerId: parsed.itemId,
  });
  const targetAssetIds = parsed.assetIds ?? [];
  const candidateAssets =
    targetAssetIds.length > 0 ? assetRows.filter((asset) => targetAssetIds.includes(asset.id)) : assetRows;

  if (candidateAssets.length === 0) {
    throw new ApiError(404, "VOLCENGINE_SYNC_ASSETS_NOT_FOUND", "主体下没有可同步的素材。");
  }

  const { assetGroupId, reused } = await ensureSubjectAssetGroup(deps, {
    workspaceId: parsed.workspaceId,
    itemId: parsed.itemId,
    itemName: item.name,
    boundGroupId: item.volcengineAssetGroupId,
    boundProjectName: item.volcengineProjectName,
    projectName,
  });

  const results: SyncAssetResult[] = [];
  const pollAttempts = parsed.pollAttempts ?? DEFAULT_POLL_ATTEMPTS;

  for (const asset of candidateAssets) {
    if (asset.assetType !== "image") {
      const skippedAsset = await deps.updateAssetVolcengineSyncState({
        workspaceId: parsed.workspaceId,
        assetId: asset.id,
        volcengineSyncStatus: "skipped",
        volcengineLastSyncedAt: asset.volcengineLastSyncedAt ?? null,
        volcengineLastSyncErrorCode: "VOLCENGINE_SYNC_UNSUPPORTED_ASSET_TYPE",
        volcengineLastSyncError: "仅图片素材支持同步到火山素材库。",
      });
      results.push({
        assetId: skippedAsset.id,
        fileName: skippedAsset.fileName,
        assetType: skippedAsset.assetType,
        action: "skipped",
        syncStatus: toVolcengineSyncStatus(skippedAsset.volcengineSyncStatus),
        volcengineAssetId: skippedAsset.volcengineAssetId,
        volcengineAssetGroupId: skippedAsset.volcengineAssetGroupId,
        volcengineProjectName: skippedAsset.volcengineProjectName,
        lastSyncedAt: skippedAsset.volcengineLastSyncedAt,
        lastSyncErrorCode: skippedAsset.volcengineLastSyncErrorCode,
        lastSyncError: skippedAsset.volcengineLastSyncError,
        error: {
          code: skippedAsset.volcengineLastSyncErrorCode ?? "VOLCENGINE_SYNC_UNSUPPORTED_ASSET_TYPE",
          message: skippedAsset.volcengineLastSyncError ?? "仅图片素材支持同步到火山素材库。",
        },
        syncSummary: skippedAsset.volcengineSync,
      });
      continue;
    }

    if (asset.volcengineProjectName && asset.volcengineProjectName !== projectName) {
      const mismatchAsset = await deps.updateAssetVolcengineSyncState({
        workspaceId: parsed.workspaceId,
        assetId: asset.id,
        volcengineAssetId: asset.volcengineAssetId,
        volcengineAssetGroupId: asset.volcengineAssetGroupId ?? assetGroupId,
        volcengineProjectName: asset.volcengineProjectName,
        volcengineSyncStatus: "failed",
        volcengineLastSyncedAt: new Date(),
        volcengineLastSyncErrorCode: "VOLCENGINE_SYNC_PROJECT_MISMATCH",
        volcengineLastSyncError: "素材已绑定到其他火山项目，无法直接复用。",
      });
      results.push({
        assetId: mismatchAsset.id,
        fileName: mismatchAsset.fileName,
        assetType: mismatchAsset.assetType,
        action: "skipped",
        syncStatus: toVolcengineSyncStatus(mismatchAsset.volcengineSyncStatus),
        volcengineAssetId: mismatchAsset.volcengineAssetId,
        volcengineAssetGroupId: mismatchAsset.volcengineAssetGroupId,
        volcengineProjectName: mismatchAsset.volcengineProjectName,
        lastSyncedAt: mismatchAsset.volcengineLastSyncedAt,
        lastSyncErrorCode: mismatchAsset.volcengineLastSyncErrorCode,
        lastSyncError: mismatchAsset.volcengineLastSyncError,
        error: {
          code: mismatchAsset.volcengineLastSyncErrorCode ?? "VOLCENGINE_SYNC_PROJECT_MISMATCH",
          message: mismatchAsset.volcengineLastSyncError ?? "素材已绑定到其他火山项目，无法直接复用。",
        },
        syncSummary: mismatchAsset.volcengineSync,
      });
      continue;
    }

    if (asset.volcengineAssetId && asset.volcengineSyncStatus === "active") {
      const refreshedAsset = await deps.updateAssetVolcengineSyncState({
        workspaceId: parsed.workspaceId,
        assetId: asset.id,
        volcengineAssetId: asset.volcengineAssetId,
        volcengineAssetGroupId: asset.volcengineAssetGroupId ?? assetGroupId,
        volcengineProjectName: projectName,
        volcengineSyncStatus: "active",
        volcengineLastSyncedAt: asset.volcengineLastSyncedAt ?? new Date(),
        volcengineLastSyncErrorCode: null,
        volcengineLastSyncError: null,
      });
      results.push({
        assetId: refreshedAsset.id,
        fileName: refreshedAsset.fileName,
        assetType: refreshedAsset.assetType,
        action: "reused",
        syncStatus: toVolcengineSyncStatus(refreshedAsset.volcengineSyncStatus),
        volcengineAssetId: refreshedAsset.volcengineAssetId,
        volcengineAssetGroupId: refreshedAsset.volcengineAssetGroupId,
        volcengineProjectName: refreshedAsset.volcengineProjectName,
        lastSyncedAt: refreshedAsset.volcengineLastSyncedAt,
        lastSyncErrorCode: refreshedAsset.volcengineLastSyncErrorCode,
        lastSyncError: refreshedAsset.volcengineLastSyncError,
        error: null,
        syncSummary: refreshedAsset.volcengineSync,
      });
      continue;
    }

    if (asset.volcengineAssetId && asset.volcengineSyncStatus === "processing") {
      const polledState = await pollAssetState(deps, {
        volcengineAssetId: asset.volcengineAssetId,
        assetGroupId,
        projectName,
        pollAttempts,
      });
      const syncedAsset = await persistPolledAssetState(deps, {
        workspaceId: parsed.workspaceId,
        localAssetId: asset.id,
        state: polledState,
      });
      results.push({
        assetId: syncedAsset.id,
        fileName: syncedAsset.fileName,
        assetType: syncedAsset.assetType,
        action: "polled",
        syncStatus: toVolcengineSyncStatus(syncedAsset.volcengineSyncStatus),
        volcengineAssetId: syncedAsset.volcengineAssetId,
        volcengineAssetGroupId: syncedAsset.volcengineAssetGroupId,
        volcengineProjectName: syncedAsset.volcengineProjectName,
        lastSyncedAt: syncedAsset.volcengineLastSyncedAt,
        lastSyncErrorCode: syncedAsset.volcengineLastSyncErrorCode,
        lastSyncError: syncedAsset.volcengineLastSyncError,
        error:
          syncedAsset.volcengineLastSyncError || syncedAsset.volcengineLastSyncErrorCode
            ? {
                code: syncedAsset.volcengineLastSyncErrorCode ?? "VOLCENGINE_SYNC_REMOTE_FAILED",
                message: syncedAsset.volcengineLastSyncError ?? "素材同步失败。",
              }
            : null,
        syncSummary: syncedAsset.volcengineSync,
      });
      continue;
    }

    const createdRemoteAsset = await deps.createVolcengineAsset({
      groupId: assetGroupId,
      url: asset.fileUrl,
      name: asset.fileName,
      assetType: "Image",
      projectName,
    });
    await deps.updateAssetVolcengineSyncState({
      workspaceId: parsed.workspaceId,
      assetId: asset.id,
      volcengineAssetId: createdRemoteAsset.id,
      volcengineAssetGroupId: assetGroupId,
      volcengineProjectName: projectName,
      volcengineSyncStatus: "processing",
      volcengineLastSyncedAt: new Date(),
      volcengineLastSyncErrorCode: null,
      volcengineLastSyncError: null,
    });

    const polledState = await pollAssetState(deps, {
      volcengineAssetId: createdRemoteAsset.id,
      assetGroupId,
      projectName,
      pollAttempts,
    });
    const syncedAsset = await persistPolledAssetState(deps, {
      workspaceId: parsed.workspaceId,
      localAssetId: asset.id,
      state: polledState,
    });
    results.push({
      assetId: syncedAsset.id,
      fileName: syncedAsset.fileName,
      assetType: syncedAsset.assetType,
      action: "created",
      syncStatus: toVolcengineSyncStatus(syncedAsset.volcengineSyncStatus),
      volcengineAssetId: syncedAsset.volcengineAssetId,
      volcengineAssetGroupId: syncedAsset.volcengineAssetGroupId,
      volcengineProjectName: syncedAsset.volcengineProjectName,
      lastSyncedAt: syncedAsset.volcengineLastSyncedAt,
      lastSyncErrorCode: syncedAsset.volcengineLastSyncErrorCode,
      lastSyncError: syncedAsset.volcengineLastSyncError,
      error:
        syncedAsset.volcengineLastSyncError || syncedAsset.volcengineLastSyncErrorCode
          ? {
              code: syncedAsset.volcengineLastSyncErrorCode ?? "VOLCENGINE_SYNC_REMOTE_FAILED",
              message: syncedAsset.volcengineLastSyncError ?? "素材同步失败。",
            }
          : null,
      syncSummary: syncedAsset.volcengineSync,
    });
  }

  const summary = {
    total: results.length,
    eligible: results.filter((result) => result.assetType === "image").length,
    active: results.filter((result) => result.syncStatus === "active").length,
    processing: results.filter((result) => result.syncStatus === "processing").length,
    failed: results.filter((result) => result.syncStatus === "failed").length,
    skipped: results.filter((result) => result.syncStatus === "skipped").length,
    reused: results.filter((result) => result.action === "reused").length,
    created: results.filter((result) => result.action === "created").length,
  };

  return {
    libraryItemId: parsed.itemId,
    volcengineAssetGroupId: assetGroupId,
    volcengineProjectName: projectName,
    reusedAssetGroup: reused,
    summary,
    assets: results,
  };
}

export function createLibraryItemAssetSyncService(overrides: Partial<LibraryItemAssetSyncDeps> = {}) {
  const deps = mergeLibraryItemAssetSyncDeps(overrides);

  return {
    syncLibraryItemAssets(input: z.infer<typeof syncLibraryItemAssetsInputSchema>) {
      return syncLibraryItemAssetsWithDeps(input, deps);
    },
  };
}

export const syncLibraryItemAssets = createLibraryItemAssetSyncService().syncLibraryItemAssets;

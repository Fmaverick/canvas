import assert from "node:assert/strict";
import test from "node:test";

Object.assign(process.env, { NODE_ENV: "test" });
process.env.DATABASE_URL ??= "postgres://postgres:postgres@127.0.0.1:5432/canvas_test";

let createLibraryItemAssetSyncServicePromise:
  | Promise<typeof import("@/application/services/library-item-asset-sync-service")["createLibraryItemAssetSyncService"]>
  | undefined;

async function getCreateLibraryItemAssetSyncService() {
  if (!createLibraryItemAssetSyncServicePromise) {
    createLibraryItemAssetSyncServicePromise = import("@/application/services/library-item-asset-sync-service").then(
      (module) => module.createLibraryItemAssetSyncService,
    );
  }

  return createLibraryItemAssetSyncServicePromise;
}

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const ITEM_ID = "22222222-2222-4222-8222-222222222222";
const ASSET_ID = "33333333-3333-4333-8333-333333333333";

const DEFAULT_CONFIG = {
  accessKey: "asset-ak",
  secretKey: "asset-sk",
  projectName: "project-a",
  baseUrl: "https://ark.cn-beijing.volcengineapi.com",
};

type TestItem = {
  kind: string;
  name: string;
  volcengineAssetGroupId: string | null;
  volcengineProjectName: string | null;
};

type TestAsset = {
  id: string;
  fileName: string;
  fileUrl: string;
  assetType: string;
  volcengineAssetId: string | null;
  volcengineAssetGroupId: string | null;
  volcengineProjectName: string | null;
  volcengineSyncStatus: "not_synced" | "processing" | "active" | "failed" | "skipped";
  volcengineLastSyncedAt: Date | null;
  volcengineLastSyncErrorCode: string | null;
  volcengineLastSyncError: string | null;
};

function buildItem(overrides: Partial<TestItem> = {}): TestItem {
  return {
    kind: "subject",
    name: "夏季连衣裙主体",
    volcengineAssetGroupId: null,
    volcengineProjectName: null,
    ...overrides,
  };
}

function buildAsset(overrides: Partial<TestAsset> = {}): TestAsset {
  return {
    id: ASSET_ID,
    fileName: "dress.png",
    fileUrl: "https://cdn.example.com/dress.png",
    assetType: "image",
    volcengineAssetId: null,
    volcengineAssetGroupId: null,
    volcengineProjectName: null,
    volcengineSyncStatus: "not_synced",
    volcengineLastSyncedAt: null,
    volcengineLastSyncErrorCode: null,
    volcengineLastSyncError: null,
    ...overrides,
  };
}

function buildSyncSummary(asset: TestAsset) {
  return {
    sync_status: asset.volcengineSyncStatus,
    volcengine_asset_id: asset.volcengineAssetId,
    volcengine_asset_group_id: asset.volcengineAssetGroupId,
    volcengine_project_name: asset.volcengineProjectName,
    last_synced_at: asset.volcengineLastSyncedAt,
    last_sync_error_code: asset.volcengineLastSyncErrorCode,
    last_sync_error: asset.volcengineLastSyncError,
  };
}

function serializeAsset(asset: TestAsset) {
  return {
    ...asset,
    volcengineSync: buildSyncSummary(asset),
  };
}

async function createTestContext(options: {
  config?: Partial<typeof DEFAULT_CONFIG>;
  item?: TestItem;
  assets?: TestAsset[];
  groupId?: string;
  remoteAssetId?: string;
  getAssetResult?: {
    id: string;
    groupId?: string;
    projectName?: string;
    status?: "Active" | "Processing" | "Failed";
    error?: {
      code?: string;
      message?: string;
    };
  };
  getAsset?: (input: { id: string; projectName?: string }) => Promise<{
    id: string;
    groupId?: string;
    projectName?: string;
    status?: "Active" | "Processing" | "Failed";
    error?: {
      code?: string;
      message?: string;
    };
  }>;
} = {}) {
  const createLibraryItemAssetSyncService = await getCreateLibraryItemAssetSyncService();

  const state = {
    item: options.item ?? buildItem(),
    assets: new Map((options.assets ?? [buildAsset()]).map((asset) => [asset.id, asset])),
  };
  const calls = {
    getLibraryItemById: 0,
    listAssetRowsByOwner: 0,
    updateLibraryItemVolcengineBinding: [] as Array<Record<string, unknown>>,
    updateAssetVolcengineSyncState: [] as Array<Record<string, unknown>>,
    createVolcengineAssetGroup: [] as Array<Record<string, unknown>>,
    createVolcengineAsset: [] as Array<Record<string, unknown>>,
    getVolcengineAsset: [] as Array<Record<string, unknown>>,
    sleep: [] as number[],
  };
  const groupId = options.groupId ?? "volc-group-001";
  const remoteAssetId = options.remoteAssetId ?? "volc-asset-001";
  const getAsset =
    options.getAsset ??
    (async () =>
      options.getAssetResult ?? {
        id: remoteAssetId,
        groupId,
        projectName: DEFAULT_CONFIG.projectName,
        status: "Active",
      });

  const service = createLibraryItemAssetSyncService({
    config: {
      ...DEFAULT_CONFIG,
      ...options.config,
    },
    getLibraryItemById: async () => {
      calls.getLibraryItemById += 1;
      return state.item;
    },
    listAssetRowsByOwner: async () => {
      calls.listAssetRowsByOwner += 1;
      return Array.from(state.assets.values());
    },
    updateLibraryItemVolcengineBinding: async (input) => {
      calls.updateLibraryItemVolcengineBinding.push(input);
      state.item = {
        ...state.item,
        volcengineAssetGroupId:
          input.volcengineAssetGroupId === undefined ? state.item.volcengineAssetGroupId : input.volcengineAssetGroupId,
        volcengineProjectName:
          input.volcengineProjectName === undefined ? state.item.volcengineProjectName : input.volcengineProjectName,
      };

      return state.item;
    },
    updateAssetVolcengineSyncState: async (input) => {
      calls.updateAssetVolcengineSyncState.push(input);
      const currentAsset = state.assets.get(input.assetId);
      assert.ok(currentAsset, `missing test asset ${input.assetId}`);

      const nextAsset = {
        ...currentAsset,
        volcengineAssetId: input.volcengineAssetId === undefined ? currentAsset.volcengineAssetId : input.volcengineAssetId,
        volcengineAssetGroupId:
          input.volcengineAssetGroupId === undefined ? currentAsset.volcengineAssetGroupId : input.volcengineAssetGroupId,
        volcengineProjectName:
          input.volcengineProjectName === undefined ? currentAsset.volcengineProjectName : input.volcengineProjectName,
        volcengineSyncStatus: input.volcengineSyncStatus,
        volcengineLastSyncedAt:
          input.volcengineLastSyncedAt === undefined ? currentAsset.volcengineLastSyncedAt : input.volcengineLastSyncedAt,
        volcengineLastSyncErrorCode:
          input.volcengineLastSyncErrorCode === undefined
            ? currentAsset.volcengineLastSyncErrorCode
            : input.volcengineLastSyncErrorCode,
        volcengineLastSyncError:
          input.volcengineLastSyncError === undefined ? currentAsset.volcengineLastSyncError : input.volcengineLastSyncError,
      };
      state.assets.set(nextAsset.id, nextAsset);

      return serializeAsset(nextAsset);
    },
    createVolcengineAssetGroup: async (input) => {
      calls.createVolcengineAssetGroup.push(input);
      return { id: groupId };
    },
    createVolcengineAsset: async (input) => {
      calls.createVolcengineAsset.push(input);
      return { id: remoteAssetId };
    },
    getVolcengineAsset: async (input) => {
      calls.getVolcengineAsset.push(input);
      return getAsset(input);
    },
    sleep: async (ms) => {
      calls.sleep.push(ms);
    },
  });

  return {
    service,
    calls,
    state,
  };
}

test("主体素材同步：缺少 ProjectName 或 Base URL 时返回明确配置错误", async (t) => {
  await t.test("缺少 ProjectName", async () => {
    const { service, calls } = await createTestContext({
      config: {
        projectName: undefined,
      },
    });

    await assert.rejects(
      () =>
        service.syncLibraryItemAssets({
          workspaceId: WORKSPACE_ID,
          itemId: ITEM_ID,
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, "VOLCENGINE_SYNC_CONFIG_MISSING");
        assert.match(error.message, /ProjectName/);
        return true;
      },
    );
    assert.equal(calls.getLibraryItemById, 0);
  });

  await t.test("缺少 Base URL", async () => {
    const { service, calls } = await createTestContext({
      config: {
        baseUrl: undefined,
      },
    });

    await assert.rejects(
      () =>
        service.syncLibraryItemAssets({
          workspaceId: WORKSPACE_ID,
          itemId: ITEM_ID,
        }),
      (error) => {
        assert.ok(error instanceof Error);
        assert.equal((error as { code?: string }).code, "VOLCENGINE_SYNC_CONFIG_MISSING");
        assert.match(error.message, /Base URL/);
        return true;
      },
    );
    assert.equal(calls.getLibraryItemById, 0);
  });
});

test("主体素材同步：主体绑定项目与当前配置不一致时明确拒绝", async () => {
  const { service, calls } = await createTestContext({
    item: buildItem({
      volcengineProjectName: "project-b",
    }),
  });

  await assert.rejects(
    () =>
      service.syncLibraryItemAssets({
        workspaceId: WORKSPACE_ID,
        itemId: ITEM_ID,
      }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: string }).code, "VOLCENGINE_SYNC_PROJECT_MISMATCH");
      assert.match(error.message, /项目与当前配置不一致/);
      return true;
    },
  );
  assert.equal(calls.listAssetRowsByOwner, 0);
  assert.equal(calls.createVolcengineAssetGroup.length, 0);
});

test("主体素材同步：远端轮询失败会回写失败状态和错误摘要", async () => {
  const { service, calls, state } = await createTestContext({
    getAssetResult: {
      id: "volc-asset-remote-failed",
      groupId: "volc-group-001",
      projectName: DEFAULT_CONFIG.projectName,
      status: "Failed",
      error: {
        code: "REMOTE_FAILED",
        message: "远端处理失败",
      },
    },
  });

  const result = await service.syncLibraryItemAssets({
    workspaceId: WORKSPACE_ID,
    itemId: ITEM_ID,
  });

  assert.equal(result.summary.total, 1);
  assert.equal(result.summary.created, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.assets[0]?.syncStatus, "failed");
  assert.deepEqual(result.assets[0]?.error, {
    code: "REMOTE_FAILED",
    message: "远端处理失败",
  });
  assert.equal(calls.createVolcengineAssetGroup.length, 1);
  assert.equal(calls.createVolcengineAsset.length, 1);
  assert.equal(calls.getVolcengineAsset.length, 1);
  assert.equal(state.assets.get(ASSET_ID)?.volcengineSyncStatus, "failed");
  assert.equal(state.assets.get(ASSET_ID)?.volcengineLastSyncErrorCode, "REMOTE_FAILED");
});

test("主体素材同步：重复同步会复用已绑定素材组而不是重复创建", async () => {
  const { service, calls } = await createTestContext({
    item: buildItem({
      volcengineAssetGroupId: "volc-group-existing",
      volcengineProjectName: DEFAULT_CONFIG.projectName,
    }),
    getAssetResult: {
      id: "volc-asset-reused-group",
      groupId: "volc-group-existing",
      projectName: DEFAULT_CONFIG.projectName,
      status: "Active",
    },
  });

  const result = await service.syncLibraryItemAssets({
    workspaceId: WORKSPACE_ID,
    itemId: ITEM_ID,
  });

  assert.equal(result.reusedAssetGroup, true);
  assert.equal(result.volcengineAssetGroupId, "volc-group-existing");
  assert.equal(calls.createVolcengineAssetGroup.length, 0);
  assert.equal(calls.updateLibraryItemVolcengineBinding.length, 0);
  assert.equal(calls.createVolcengineAsset.length, 1);
  assert.equal(calls.createVolcengineAsset[0]?.groupId, "volc-group-existing");
});

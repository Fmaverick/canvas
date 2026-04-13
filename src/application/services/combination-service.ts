import { createHash } from "node:crypto";

import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import {
  assets,
  canvasEdges,
  canvasNodes,
  combinationItems,
  combinationPlans,
  combinationShards,
  inputNodeItems,
} from "@/infrastructure/db/schema";
import { ApiError } from "@/lib/api";
import { notifyCanvasRuntimeChanged } from "@/lib/canvas-runtime-events";
import { buildPlanGovernance, governanceActionSchema, type GovernanceAction } from "@/lib/combination-runtime";
import { logRuntimeEvent, recordRuntimeMetric } from "@/lib/runtime-observability";

const inputSourceTypeSchema = z.enum(["text", "image", "video"]);
const combinationModeSchema = z.enum(["zip", "cartesian", "anchor", "custom_mapping"]);
type PlanStatus = "draft" | "queued" | "running" | "paused" | "canceled" | "succeeded" | "failed";

const MAX_INPUT_ITEMS = 500;
const MAX_PREVIEW_SAMPLE_SIZE = 10;
const DEFAULT_PREVIEW_SAMPLE_SIZE = 3;
const DEFAULT_SHARD_SIZE = 50;
const MAX_SHARD_SIZE = 200;
const MAX_EXPANDABLE_COMBINATION_COUNT = 2000;

const inputItemPayloadSchema = z.object({
  id: z.uuid().optional(),
  stableKey: z.string().trim().min(1).max(160).optional(),
  sourceType: inputSourceTypeSchema,
  displayLabel: z.string().trim().min(1).max(255),
  contentText: z.string().trim().nullable().optional(),
  assetId: z.uuid().nullable().optional(),
  sourceRefJson: z.record(z.string(), z.unknown()).default({}),
  snapshotJson: z.record(z.string(), z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

export const saveInputNodeItemsInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  nodeId: z.uuid(),
  items: z.array(inputItemPayloadSchema).max(MAX_INPUT_ITEMS),
});

export const listInputNodeItemsInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  nodeId: z.uuid(),
});

export const reorderInputNodeItemsInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  nodeId: z.uuid(),
  itemIds: z.array(z.uuid()).min(1).max(MAX_INPUT_ITEMS),
});

export const updateInputNodeItemInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  nodeId: z.uuid(),
  itemId: z.uuid(),
  enabled: z.boolean(),
});

export const estimateCombinationPlanInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  nodeId: z.uuid(),
  mode: combinationModeSchema.optional(),
  anchorInputNodeId: z.uuid().nullable().optional(),
  sampleSize: z.coerce.number().int().positive().max(MAX_PREVIEW_SAMPLE_SIZE).optional(),
});

export const createCombinationPlanInputSchema = estimateCombinationPlanInputSchema.extend({
  actorUserId: z.uuid(),
  shardSize: z.coerce.number().int().positive().max(MAX_SHARD_SIZE).optional(),
});

export const getCombinationPlanInputSchema = z.object({
  workspaceId: z.uuid(),
  planId: z.uuid(),
  itemLimit: z.coerce.number().int().positive().max(100).optional(),
  itemOffset: z.coerce.number().int().min(0).optional(),
  shardLimit: z.coerce.number().int().positive().max(100).optional(),
  shardOffset: z.coerce.number().int().min(0).optional(),
});

export const changeCombinationPlanStatusInputSchema = z.object({
  workspaceId: z.uuid(),
  planId: z.uuid(),
  actorUserId: z.uuid(),
  allowHighCost: z.boolean().optional(),
});

type InputNodeRecord = typeof canvasNodes.$inferSelect;
type InputNodeItemRecord = typeof inputNodeItems.$inferSelect;

type CombinationBinding = {
  inputNodeId: string;
  inputNodeTitle: string;
  itemId: string;
  stableKey: string;
  itemLabel: string;
  sourceType: "text" | "image" | "video";
  contentText: string | null;
  assetId: string | null;
  sourceRefJson: Record<string, unknown>;
  snapshotJson: Record<string, unknown>;
};

type CombinationSource = {
  inputNodeId: string;
  inputNodeTitle: string;
  sourceType: "text" | "image" | "video";
  totalItems: number;
  enabledItems: number;
  items: Array<
    CombinationBinding & {
      sortOrder: number;
      enabled: boolean;
    }
  >;
};

type CombinationExpansion = {
  estimatedCombinationCount: number;
  sampleLabels: string[];
  samples: Array<{
    id: string;
    label: string;
    bindings: Array<{
      inputNodeId: string;
      itemId: string;
      itemLabel: string;
      sourceType: "text" | "image" | "video";
    }>;
  }>;
  items?: Array<{
    stableKey: string;
    displayLabel: string;
    bindings: CombinationBinding[];
  }>;
};

function emitCanvasRuntimeEvent(workspaceId: string, canvasId: string, reason: string) {
  notifyCanvasRuntimeChanged({
    workspaceId,
    canvasId,
    reason,
  });
}

function normalizeRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function normalizeInputNodeSettings(node: InputNodeRecord) {
  const settings = normalizeRecord(node.settingsJson);

  return {
    sourceType:
      settings.sourceType === "image" || settings.sourceType === "video" || settings.sourceType === "text"
        ? settings.sourceType
        : "text",
    allowMixedSources: Boolean(settings.allowMixedSources),
  };
}

function normalizeCombinationNodeSettings(node: typeof canvasNodes.$inferSelect, input?: {
  mode?: "zip" | "cartesian" | "anchor" | "custom_mapping";
  anchorInputNodeId?: string | null;
  sampleSize?: number;
}) {
  const settings = normalizeRecord(node.settingsJson);

  return {
    mode: input?.mode ?? (settings.mode === "cartesian" || settings.mode === "anchor" || settings.mode === "custom_mapping" ? settings.mode : "zip"),
    anchorInputNodeId:
      input?.anchorInputNodeId !== undefined
        ? input.anchorInputNodeId
        : typeof settings.anchorInputNodeId === "string"
          ? settings.anchorInputNodeId
          : null,
    sampleSize: Math.min(
      MAX_PREVIEW_SAMPLE_SIZE,
      Math.max(
        1,
        Math.round(
          input?.sampleSize ??
            (typeof settings.sampleSize === "number" && Number.isFinite(settings.sampleSize)
              ? settings.sampleSize
              : DEFAULT_PREVIEW_SAMPLE_SIZE),
        ),
      ),
    ),
  };
}

function assertInputNode(node: typeof canvasNodes.$inferSelect) {
  if (node.type !== "input") {
    throw new ApiError(409, "INVALID_NODE_TYPE", "仅支持在 input 节点上管理输入项。");
  }
}

function assertCombinationNode(node: typeof canvasNodes.$inferSelect) {
  if (node.type !== "combination") {
    throw new ApiError(409, "INVALID_NODE_TYPE", "仅支持在 combination 节点上管理组合计划。");
  }
}

async function getScopedNode(workspaceId: string, canvasId: string, nodeId: string) {
  const [node] = await db
    .select()
    .from(canvasNodes)
    .where(
      and(eq(canvasNodes.workspaceId, workspaceId), eq(canvasNodes.canvasId, canvasId), eq(canvasNodes.id, nodeId)),
    )
    .limit(1);

  if (!node) {
    throw new ApiError(404, "NODE_NOT_FOUND", "节点不存在。");
  }

  return node;
}

async function getScopedCombinationPlan(workspaceId: string, planId: string) {
  const [plan] = await db
    .select()
    .from(combinationPlans)
    .where(and(eq(combinationPlans.workspaceId, workspaceId), eq(combinationPlans.id, planId)))
    .limit(1);

  if (!plan) {
    throw new ApiError(404, "COMBINATION_PLAN_NOT_FOUND", "组合计划不存在。");
  }

  return plan;
}

async function getAssetMapForWorkspace(workspaceId: string, assetIds: string[]) {
  if (assetIds.length === 0) {
    return new Map<string, typeof assets.$inferSelect>();
  }

  const records = await db
    .select()
    .from(assets)
    .where(and(eq(assets.workspaceId, workspaceId), inArray(assets.id, assetIds)));

  return new Map(records.map((asset) => [asset.id, asset]));
}

function createStableKeyBase(item: z.infer<typeof inputItemPayloadSchema>) {
  if (item.stableKey) {
    return item.stableKey.trim();
  }

  if (item.assetId) {
    return `${item.sourceType}:${item.assetId}`;
  }

  return `${item.sourceType}:${createHash("sha1")
    .update(`${item.displayLabel}:${item.contentText ?? ""}`)
    .digest("hex")
    .slice(0, 16)}`;
}

function assignStableKeys(items: z.infer<typeof inputItemPayloadSchema>[]) {
  const counts = new Map<string, number>();

  return items.map((item) => {
    const base = createStableKeyBase(item);
    const nextCount = (counts.get(base) ?? 0) + 1;
    counts.set(base, nextCount);

    return nextCount === 1 ? base : `${base}:${nextCount}`;
  });
}

async function validateInputItems(
  workspaceId: string,
  node: InputNodeRecord,
  items: z.infer<typeof inputItemPayloadSchema>[],
) {
  const nodeSettings = normalizeInputNodeSettings(node);
  const assetIds = Array.from(
    new Set(
      items
        .map((item) => item.assetId)
        .filter((assetId): assetId is string => typeof assetId === "string" && assetId.trim().length > 0),
    ),
  );
  const assetMap = await getAssetMapForWorkspace(workspaceId, assetIds);

  if (assetMap.size !== assetIds.length) {
    throw new ApiError(404, "ASSET_NOT_FOUND", "部分输入项引用的资源不存在。");
  }

  for (const item of items) {
    if (!nodeSettings.allowMixedSources && item.sourceType !== nodeSettings.sourceType) {
      throw new ApiError(409, "INPUT_SOURCE_TYPE_MISMATCH", "当前输入节点不允许混合不同类型的输入项。");
    }

    if (item.sourceType === "text") {
      if (!item.contentText || item.contentText.trim().length === 0) {
        throw new ApiError(400, "INPUT_TEXT_REQUIRED", "文本输入项必须提供内容。");
      }

      if (item.assetId) {
        throw new ApiError(400, "INPUT_TEXT_ASSET_INVALID", "文本输入项不能绑定媒体资源。");
      }
    }

    if (item.sourceType === "image" || item.sourceType === "video") {
      if (!item.assetId) {
        throw new ApiError(400, "INPUT_ASSET_REQUIRED", "图片或视频输入项必须绑定资源。");
      }

      const asset = assetMap.get(item.assetId);

      if (!asset) {
        throw new ApiError(404, "ASSET_NOT_FOUND", "输入项绑定的资源不存在。");
      }

      if (asset.assetType !== item.sourceType) {
        throw new ApiError(409, "INPUT_ASSET_TYPE_MISMATCH", "输入项类型与资源类型不匹配。");
      }
    }
  }

  return assetMap;
}

function buildInputItemSnapshot(
  item: z.infer<typeof inputItemPayloadSchema>,
  assetMap: Map<string, typeof assets.$inferSelect>,
) {
  const asset = item.assetId ? assetMap.get(item.assetId) : null;

  return {
    ...(item.snapshotJson ?? {}),
    sourceType: item.sourceType,
    displayLabel: item.displayLabel,
    ...(item.contentText ? { contentText: item.contentText } : {}),
    ...(asset
      ? {
          asset: {
            id: asset.id,
            assetType: asset.assetType,
            fileName: asset.fileName,
            fileUrl: asset.fileUrl,
            mimeType: asset.mimeType,
            width: asset.width,
            height: asset.height,
            durationMs: asset.durationMs,
          },
        }
      : {}),
  };
}

async function rebuildInputNodeSnapshot(workspaceId: string, canvasId: string, nodeId: string) {
  const node = await getScopedNode(workspaceId, canvasId, nodeId);
  assertInputNode(node);

  const items = await db
    .select()
    .from(inputNodeItems)
    .where(and(eq(inputNodeItems.workspaceId, workspaceId), eq(inputNodeItems.canvasId, canvasId), eq(inputNodeItems.nodeId, nodeId)))
    .orderBy(asc(inputNodeItems.sortOrder), asc(inputNodeItems.createdAt));

  const nodeSettings = normalizeInputNodeSettings(node);
  const summary = {
    kind: "input_collection" as const,
    sourceType:
      items[0]?.sourceType === "image" || items[0]?.sourceType === "video" || items[0]?.sourceType === "text"
        ? items[0].sourceType
        : nodeSettings.sourceType,
    totalItems: items.length,
    enabledItems: items.filter((item) => item.enabled).length,
    sampleLabels: items
      .filter((item) => item.enabled)
      .slice(0, 5)
      .map((item) => item.displayLabel),
  };
  const detail = {
    items: items.map((item) => ({
      id: item.id,
      label: item.displayLabel,
      sourceType: item.sourceType,
      enabled: item.enabled,
      sortOrder: item.sortOrder,
    })),
  };
  const outputSnapshot = {
    outputType: "input_summary",
    summary,
    detail,
    generatedAt: new Date().toISOString(),
  };

  await db
    .update(canvasNodes)
    .set({
      outputSnapshot,
      updatedAt: new Date(),
    })
    .where(eq(canvasNodes.id, nodeId));

  emitCanvasRuntimeEvent(workspaceId, canvasId, "input_items_updated");

  return {
    summary,
    detail,
    outputSnapshot,
  };
}

export async function saveInputNodeItems(input: z.infer<typeof saveInputNodeItemsInputSchema>) {
  const parsed = saveInputNodeItemsInputSchema.parse(input);
  const node = await getScopedNode(parsed.workspaceId, parsed.canvasId, parsed.nodeId);
  assertInputNode(node);

  const assetMap = await validateInputItems(parsed.workspaceId, node, parsed.items);
  const stableKeys = assignStableKeys(parsed.items);
  const duplicatedStableKey = stableKeys.find((stableKey, index) => stableKeys.indexOf(stableKey) !== index);

  if (duplicatedStableKey) {
    throw new ApiError(409, "INPUT_STABLE_KEY_CONFLICT", "输入项 stable_key 不能重复。");
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(inputNodeItems)
      .where(
        and(
          eq(inputNodeItems.workspaceId, parsed.workspaceId),
          eq(inputNodeItems.canvasId, parsed.canvasId),
          eq(inputNodeItems.nodeId, parsed.nodeId),
        ),
      );

    if (parsed.items.length > 0) {
      await tx.insert(inputNodeItems).values(
        parsed.items.map((item, index) => ({
          workspaceId: parsed.workspaceId,
          canvasId: parsed.canvasId,
          nodeId: parsed.nodeId,
          stableKey: stableKeys[index],
          sourceType: item.sourceType,
          displayLabel: item.displayLabel,
          contentText: item.contentText ?? null,
          assetId: item.assetId ?? null,
          sourceRefJson: item.sourceRefJson,
          snapshotJson: buildInputItemSnapshot(item, assetMap),
          enabled: item.enabled,
          sortOrder: index,
        })),
      );
    }
  });

  return listInputNodeItems(parsed);
}

export async function listInputNodeItems(input: z.infer<typeof listInputNodeItemsInputSchema>) {
  const parsed = listInputNodeItemsInputSchema.parse(input);
  await getScopedNode(parsed.workspaceId, parsed.canvasId, parsed.nodeId).then(assertInputNode);

  const items = await db
    .select({
      id: inputNodeItems.id,
      stableKey: inputNodeItems.stableKey,
      sourceType: inputNodeItems.sourceType,
      displayLabel: inputNodeItems.displayLabel,
      contentText: inputNodeItems.contentText,
      assetId: inputNodeItems.assetId,
      sourceRefJson: inputNodeItems.sourceRefJson,
      snapshotJson: inputNodeItems.snapshotJson,
      enabled: inputNodeItems.enabled,
      sortOrder: inputNodeItems.sortOrder,
      createdAt: inputNodeItems.createdAt,
      updatedAt: inputNodeItems.updatedAt,
      assetType: assets.assetType,
      assetFileName: assets.fileName,
      assetFileUrl: assets.fileUrl,
      assetMimeType: assets.mimeType,
      assetWidth: assets.width,
      assetHeight: assets.height,
      assetDurationMs: assets.durationMs,
    })
    .from(inputNodeItems)
    .leftJoin(assets, eq(assets.id, inputNodeItems.assetId))
    .where(
      and(
        eq(inputNodeItems.workspaceId, parsed.workspaceId),
        eq(inputNodeItems.canvasId, parsed.canvasId),
        eq(inputNodeItems.nodeId, parsed.nodeId),
      ),
    )
    .orderBy(asc(inputNodeItems.sortOrder), asc(inputNodeItems.createdAt));

  const snapshot = await rebuildInputNodeSnapshot(parsed.workspaceId, parsed.canvasId, parsed.nodeId);

  return {
    node_id: parsed.nodeId,
    summary: snapshot.summary,
    items: items.map((item) => ({
      id: item.id,
      stable_key: item.stableKey,
      source_type: item.sourceType,
      label: item.displayLabel,
      content_text: item.contentText,
      asset_id: item.assetId,
      enabled: item.enabled,
      sort_order: item.sortOrder,
      source_ref: item.sourceRefJson,
      snapshot: item.snapshotJson,
      asset:
        item.assetId && item.assetType
          ? {
              id: item.assetId,
              asset_type: item.assetType,
              file_name: item.assetFileName,
              file_url: item.assetFileUrl,
              mime_type: item.assetMimeType,
              width: item.assetWidth,
              height: item.assetHeight,
              duration_ms: item.assetDurationMs,
            }
          : null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    })),
  };
}

export async function reorderInputNodeItems(input: z.infer<typeof reorderInputNodeItemsInputSchema>) {
  const parsed = reorderInputNodeItemsInputSchema.parse(input);
  await getScopedNode(parsed.workspaceId, parsed.canvasId, parsed.nodeId).then(assertInputNode);

  const existingItems = await db
    .select({
      id: inputNodeItems.id,
    })
    .from(inputNodeItems)
    .where(
      and(
        eq(inputNodeItems.workspaceId, parsed.workspaceId),
        eq(inputNodeItems.canvasId, parsed.canvasId),
        eq(inputNodeItems.nodeId, parsed.nodeId),
      ),
    )
    .orderBy(asc(inputNodeItems.sortOrder), asc(inputNodeItems.createdAt));

  if (existingItems.length !== parsed.itemIds.length) {
    throw new ApiError(409, "INPUT_ITEM_REORDER_INVALID", "排序项数量与当前输入项不一致。");
  }

  const existingIdSet = new Set(existingItems.map((item) => item.id));

  for (const itemId of parsed.itemIds) {
    if (!existingIdSet.has(itemId)) {
      throw new ApiError(404, "INPUT_ITEM_NOT_FOUND", "存在不属于当前输入节点的排序项。");
    }
  }

  await db.transaction(async (tx) => {
    for (const [index, itemId] of parsed.itemIds.entries()) {
      await tx
        .update(inputNodeItems)
        .set({
          sortOrder: index,
          updatedAt: new Date(),
        })
        .where(eq(inputNodeItems.id, itemId));
    }
  });

  return listInputNodeItems({
    workspaceId: parsed.workspaceId,
    canvasId: parsed.canvasId,
    nodeId: parsed.nodeId,
  });
}

export async function updateInputNodeItem(input: z.infer<typeof updateInputNodeItemInputSchema>) {
  const parsed = updateInputNodeItemInputSchema.parse(input);
  await getScopedNode(parsed.workspaceId, parsed.canvasId, parsed.nodeId).then(assertInputNode);

  const [item] = await db
    .update(inputNodeItems)
    .set({
      enabled: parsed.enabled,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inputNodeItems.id, parsed.itemId),
        eq(inputNodeItems.workspaceId, parsed.workspaceId),
        eq(inputNodeItems.canvasId, parsed.canvasId),
        eq(inputNodeItems.nodeId, parsed.nodeId),
      ),
    )
    .returning();

  if (!item) {
    throw new ApiError(404, "INPUT_ITEM_NOT_FOUND", "输入项不存在。");
  }

  await rebuildInputNodeSnapshot(parsed.workspaceId, parsed.canvasId, parsed.nodeId);

  return {
    item_id: item.id,
    enabled: item.enabled,
  };
}

async function getCombinationInputSources(workspaceId: string, canvasId: string, nodeId: string) {
  const incomingInputs = await db
    .select({
      inputNodeId: canvasEdges.sourceNodeId,
      inputNodeTitle: canvasNodes.title,
      inputNodeType: canvasNodes.type,
      priority: canvasEdges.priority,
      createdAt: canvasEdges.createdAt,
    })
    .from(canvasEdges)
    .innerJoin(canvasNodes, eq(canvasNodes.id, canvasEdges.sourceNodeId))
    .where(
      and(
        eq(canvasEdges.workspaceId, workspaceId),
        eq(canvasEdges.canvasId, canvasId),
        eq(canvasEdges.targetNodeId, nodeId),
        eq(canvasNodes.type, "input"),
      ),
    )
    .orderBy(asc(canvasEdges.priority), asc(canvasEdges.createdAt));

  if (incomingInputs.length < 2) {
    throw new ApiError(409, "COMBINATION_INPUTS_REQUIRED", "组合节点至少需要连接两个 input 节点。");
  }

  const inputNodeIds = incomingInputs.map((record) => record.inputNodeId);
  const items = await db
    .select()
    .from(inputNodeItems)
    .where(
      and(
        eq(inputNodeItems.workspaceId, workspaceId),
        eq(inputNodeItems.canvasId, canvasId),
        inArray(inputNodeItems.nodeId, inputNodeIds),
      ),
    )
    .orderBy(asc(inputNodeItems.sortOrder), asc(inputNodeItems.createdAt));
  const itemsByNodeId = new Map<string, InputNodeItemRecord[]>();

  for (const item of items) {
    const current = itemsByNodeId.get(item.nodeId) ?? [];
    current.push(item);
    itemsByNodeId.set(item.nodeId, current);
  }

  return incomingInputs.map((inputNode) => {
    const nodeItems = itemsByNodeId.get(inputNode.inputNodeId) ?? [];
    const firstItem = nodeItems[0];

    return {
      inputNodeId: inputNode.inputNodeId,
      inputNodeTitle: inputNode.inputNodeTitle,
      sourceType:
        firstItem?.sourceType === "image" || firstItem?.sourceType === "video" || firstItem?.sourceType === "text"
          ? firstItem.sourceType
          : "text",
      totalItems: nodeItems.length,
      enabledItems: nodeItems.filter((item) => item.enabled).length,
      items: nodeItems.map((item) => ({
        inputNodeId: item.nodeId,
        inputNodeTitle: inputNode.inputNodeTitle,
        itemId: item.id,
        stableKey: item.stableKey,
        itemLabel: item.displayLabel,
        sourceType: item.sourceType as "text" | "image" | "video",
        contentText: item.contentText,
        assetId: item.assetId,
        sourceRefJson: normalizeRecord(item.sourceRefJson),
        snapshotJson: normalizeRecord(item.snapshotJson),
        sortOrder: item.sortOrder,
        enabled: item.enabled,
      })),
    } satisfies CombinationSource;
  });
}

function buildCombinationDisplayLabel(bindings: CombinationBinding[]) {
  return bindings.map((binding) => binding.itemLabel).join(" | ");
}

function buildCombinationStableKey(bindings: CombinationBinding[]) {
  return createHash("sha1")
    .update(bindings.map((binding) => `${binding.inputNodeId}:${binding.stableKey}`).join("|"))
    .digest("hex")
    .slice(0, 24);
}

function sliceSamples(
  items: Array<{
    stableKey: string;
    displayLabel: string;
    bindings: CombinationBinding[];
  }>,
  sampleSize: number,
) {
  const limitedItems = items.slice(0, sampleSize);

  return {
    sampleLabels: limitedItems.map((item) => item.displayLabel),
    samples: limitedItems.map((item) => ({
      id: item.stableKey,
      label: item.displayLabel,
      bindings: item.bindings.map((binding) => ({
        inputNodeId: binding.inputNodeId,
        itemId: binding.itemId,
        itemLabel: binding.itemLabel,
        sourceType: binding.sourceType,
      })),
    })),
  };
}

function expandZipCombinations(sources: CombinationSource[], sampleSize: number, expandAll: boolean): CombinationExpansion {
  const enabledSources = sources.map((source) => ({
    ...source,
    items: source.items.filter((item) => item.enabled),
  }));
  const estimatedCombinationCount = Math.min(...enabledSources.map((source) => source.items.length));

  if (!Number.isFinite(estimatedCombinationCount) || estimatedCombinationCount <= 0) {
    return {
      estimatedCombinationCount: 0,
      sampleLabels: [],
      samples: [],
      items: expandAll ? [] : undefined,
    };
  }

  const combinations = Array.from({ length: expandAll ? estimatedCombinationCount : Math.min(sampleSize, estimatedCombinationCount) }, (_, index) => {
    const bindings = enabledSources.map((source) => source.items[index]).filter(Boolean) as CombinationBinding[];

    return {
      stableKey: buildCombinationStableKey(bindings),
      displayLabel: buildCombinationDisplayLabel(bindings),
      bindings,
    };
  });
  const samples = sliceSamples(combinations, sampleSize);

  return {
    estimatedCombinationCount,
    sampleLabels: samples.sampleLabels,
    samples: samples.samples,
    ...(expandAll ? { items: combinations } : {}),
  };
}

function expandAnchorCombinations(
  sources: CombinationSource[],
  sampleSize: number,
  expandAll: boolean,
  anchorInputNodeId: string | null,
): CombinationExpansion {
  const enabledSources = sources.map((source) => ({
    ...source,
    items: source.items.filter((item) => item.enabled),
  }));
  const anchorSource = enabledSources.find((source) => source.inputNodeId === anchorInputNodeId) ?? enabledSources[0];

  if (!anchorSource) {
    return {
      estimatedCombinationCount: 0,
      sampleLabels: [],
      samples: [],
      items: expandAll ? [] : undefined,
    };
  }

  if (enabledSources.some((source) => source.items.length === 0)) {
    return {
      estimatedCombinationCount: 0,
      sampleLabels: [],
      samples: [],
      items: expandAll ? [] : undefined,
    };
  }

  const estimatedCombinationCount = anchorSource.items.length;
  const combinations = Array.from(
    { length: expandAll ? estimatedCombinationCount : Math.min(sampleSize, estimatedCombinationCount) },
    (_, index) => {
      const bindings = enabledSources.map((source) =>
        source.inputNodeId === anchorSource.inputNodeId ? source.items[index] : source.items[index % source.items.length],
      ) as CombinationBinding[];

      return {
        stableKey: buildCombinationStableKey(bindings),
        displayLabel: buildCombinationDisplayLabel(bindings),
        bindings,
      };
    },
  );
  const samples = sliceSamples(combinations, sampleSize);

  return {
    estimatedCombinationCount,
    sampleLabels: samples.sampleLabels,
    samples: samples.samples,
    ...(expandAll ? { items: combinations } : {}),
  };
}

function expandCartesianCombinations(
  sources: CombinationSource[],
  sampleSize: number,
  expandAll: boolean,
): CombinationExpansion {
  const enabledSources = sources.map((source) => ({
    ...source,
    items: source.items.filter((item) => item.enabled),
  }));

  if (enabledSources.some((source) => source.items.length === 0)) {
    return {
      estimatedCombinationCount: 0,
      sampleLabels: [],
      samples: [],
      items: expandAll ? [] : undefined,
    };
  }

  const estimatedCombinationCount = enabledSources.reduce((total, source) => total * source.items.length, 1);
  const combinations: Array<{
    stableKey: string;
    displayLabel: string;
    bindings: CombinationBinding[];
  }> = [];
  const maxCount = expandAll ? estimatedCombinationCount : Math.min(sampleSize, estimatedCombinationCount);

  const walk = (depth: number, current: CombinationBinding[]) => {
    if (combinations.length >= maxCount) {
      return;
    }

    if (depth >= enabledSources.length) {
      combinations.push({
        stableKey: buildCombinationStableKey(current),
        displayLabel: buildCombinationDisplayLabel(current),
        bindings: [...current],
      });

      return;
    }

    for (const item of enabledSources[depth].items) {
      current.push(item);
      walk(depth + 1, current);
      current.pop();

      if (combinations.length >= maxCount) {
        return;
      }
    }
  };

  walk(0, []);

  const samples = sliceSamples(combinations, sampleSize);

  return {
    estimatedCombinationCount,
    sampleLabels: samples.sampleLabels,
    samples: samples.samples,
    ...(expandAll ? { items: combinations } : {}),
  };
}

function resolveCustomMappingKey(item: CombinationSource["items"][number]) {
  const mappingKey = item.sourceRefJson.mappingKey ?? item.sourceRefJson.groupKey ?? item.snapshotJson.mappingKey;

  if (typeof mappingKey === "string" && mappingKey.trim().length > 0) {
    return mappingKey.trim();
  }

  return item.stableKey;
}

function expandCustomMappingCombinations(
  sources: CombinationSource[],
  sampleSize: number,
  expandAll: boolean,
): CombinationExpansion {
  const enabledSources = sources.map((source) => ({
    ...source,
    items: source.items.filter((item) => item.enabled),
  }));

  if (enabledSources.some((source) => source.items.length === 0)) {
    return {
      estimatedCombinationCount: 0,
      sampleLabels: [],
      samples: [],
      items: expandAll ? [] : undefined,
    };
  }

  const mappingBySource = enabledSources.map((source) => {
    const map = new Map<string, CombinationBinding>();

    for (const item of source.items) {
      const mappingKey = resolveCustomMappingKey(item);

      if (!map.has(mappingKey)) {
        map.set(mappingKey, item);
      }
    }

    return map;
  });
  const sharedKeys = Array.from(mappingBySource[0].keys()).filter((key) => mappingBySource.every((map) => map.has(key)));
  const limitedKeys = sharedKeys.slice(0, expandAll ? sharedKeys.length : sampleSize);
  const combinations = limitedKeys.map((key) => {
    const bindings = mappingBySource.map((map) => map.get(key)).filter(Boolean) as CombinationBinding[];

    return {
      stableKey: buildCombinationStableKey(bindings),
      displayLabel: buildCombinationDisplayLabel(bindings),
      bindings,
    };
  });
  const samples = sliceSamples(combinations, sampleSize);

  return {
    estimatedCombinationCount: sharedKeys.length,
    sampleLabels: samples.sampleLabels,
    samples: samples.samples,
    ...(expandAll ? { items: combinations } : {}),
  };
}

function expandCombinationItems(
  sources: CombinationSource[],
  settings: {
    mode: "zip" | "cartesian" | "anchor" | "custom_mapping";
    anchorInputNodeId: string | null;
    sampleSize: number;
  },
  expandAll: boolean,
) {
  if (settings.mode === "cartesian") {
    return expandCartesianCombinations(sources, settings.sampleSize, expandAll);
  }

  if (settings.mode === "anchor") {
    return expandAnchorCombinations(sources, settings.sampleSize, expandAll, settings.anchorInputNodeId);
  }

  if (settings.mode === "custom_mapping") {
    return expandCustomMappingCombinations(sources, settings.sampleSize, expandAll);
  }

  return expandZipCombinations(sources, settings.sampleSize, expandAll);
}

async function hasVideoGenerationTarget(workspaceId: string, canvasId: string, nodeId: string) {
  const targets = await db
    .select({
      type: canvasNodes.type,
    })
    .from(canvasEdges)
    .innerJoin(canvasNodes, eq(canvasNodes.id, canvasEdges.targetNodeId))
    .where(
      and(
        eq(canvasEdges.workspaceId, workspaceId),
        eq(canvasEdges.canvasId, canvasId),
        eq(canvasEdges.sourceNodeId, nodeId),
      ),
    );

  return targets.some((target) => target.type === "video");
}

async function writeCombinationNodeSnapshot(params: {
  workspaceId: string;
  canvasId: string;
  nodeId: string;
  mode: "zip" | "cartesian" | "anchor" | "custom_mapping";
  sources: CombinationSource[];
  estimatedCombinationCount: number;
  governanceSignals: Array<z.infer<typeof governanceActionSchema>>;
  sampleLabels: string[];
  samples: Array<{
    id: string;
    label: string;
    bindings: Array<{
      inputNodeId: string;
      itemId: string;
      itemLabel: string;
      sourceType: "text" | "image" | "video";
    }>;
  }>;
  latestPlanId?: string | null;
  latestPlanStatus?: string | null;
  governanceAction?: string | null;
}) {
  const outputSnapshot = {
    outputType: "combination_summary",
    summary: {
      kind: "combination_plan",
      mode: params.mode,
      inputSourceCount: params.sources.length,
      estimatedCombinationCount: params.estimatedCombinationCount,
      governanceSignals: params.governanceSignals,
      sampleLabels: params.sampleLabels,
    },
    detail: {
      mode: params.mode,
      inputSourceCount: params.sources.length,
      estimatedCombinationCount: params.estimatedCombinationCount,
      governanceSignals: params.governanceSignals,
      sampleLabels: params.sampleLabels,
      sources: params.sources.map((source) => ({
        inputNodeId: source.inputNodeId,
        inputNodeTitle: source.inputNodeTitle,
        sourceType: source.sourceType,
        totalItems: source.totalItems,
        enabledItems: source.enabledItems,
      })),
      samples: params.samples,
      latestPlanId: params.latestPlanId ?? null,
      latestPlanStatus: params.latestPlanStatus ?? null,
      governanceAction: params.governanceAction ?? null,
    },
    generatedAt: new Date().toISOString(),
  };

  await db
    .update(canvasNodes)
    .set({
      settingsJson: {
        ...normalizeRecord(
          (
            await db
              .select({
                settingsJson: canvasNodes.settingsJson,
              })
              .from(canvasNodes)
              .where(eq(canvasNodes.id, params.nodeId))
              .limit(1)
          )[0]?.settingsJson,
        ),
        mode: params.mode,
      },
      outputSnapshot,
      updatedAt: new Date(),
    })
    .where(eq(canvasNodes.id, params.nodeId));

  emitCanvasRuntimeEvent(params.workspaceId, params.canvasId, "combination_preview_updated");

  return outputSnapshot;
}

async function buildCombinationPlanPreview(
  input: z.infer<typeof estimateCombinationPlanInputSchema>,
  expandAll: boolean,
) {
  const node = await getScopedNode(input.workspaceId, input.canvasId, input.nodeId);
  assertCombinationNode(node);

  const settings = normalizeCombinationNodeSettings(node, input);
  const sources = await getCombinationInputSources(input.workspaceId, input.canvasId, input.nodeId);

  if (settings.mode === "anchor" && settings.anchorInputNodeId) {
    const hasAnchorSource = sources.some((source) => source.inputNodeId === settings.anchorInputNodeId);

    if (!hasAnchorSource) {
      throw new ApiError(409, "COMBINATION_ANCHOR_INVALID", "锚点输入源必须是当前组合节点的上游 input 节点。");
    }
  }

  const expansion = expandCombinationItems(sources, settings, expandAll);
  const videoTarget = await hasVideoGenerationTarget(input.workspaceId, input.canvasId, input.nodeId);
  const governance = buildPlanGovernance({
    estimatedCombinationCount: expansion.estimatedCombinationCount,
    hasVideoTarget: videoTarget,
    estimatedVideoTaskCount: videoTarget ? expansion.estimatedCombinationCount : 0,
    estimatedPollCost: videoTarget ? expansion.estimatedCombinationCount : 0,
  });

  await writeCombinationNodeSnapshot({
    workspaceId: input.workspaceId,
    canvasId: input.canvasId,
    nodeId: input.nodeId,
    mode: settings.mode,
    sources,
    estimatedCombinationCount: expansion.estimatedCombinationCount,
    governanceSignals: governance.governanceSignals,
    sampleLabels: expansion.sampleLabels,
    samples: expansion.samples,
    governanceAction: governance.governanceAction,
  });
  recordRuntimeMetric({
    name: "combination_plan_estimated_count",
    value: expansion.estimatedCombinationCount,
    unit: "count",
    tags: {
      workspace_id: input.workspaceId,
      canvas_id: input.canvasId,
      node_id: input.nodeId,
      mode: settings.mode,
      governance_action: governance.governanceAction ?? "none",
    },
    fields: {
      inputSourceCount: sources.length,
      estimatedVideoTaskCount: governance.metrics.estimatedVideoTaskCount,
      estimatedPollCost: governance.metrics.estimatedPollCost,
      governanceSignals: governance.governanceSignals,
      governanceReasons: governance.reasons,
    },
  });
  logRuntimeEvent({
    level: governance.governanceAction === "reject" ? "warn" : "info",
    event: "combination.plan.preview_built",
    workspaceId: input.workspaceId,
    canvasId: input.canvasId,
    nodeId: input.nodeId,
    status: governance.governanceAction ?? "preview_ready",
    details: {
      mode: settings.mode,
      expandAll,
      inputSourceCount: sources.length,
      estimatedCombinationCount: expansion.estimatedCombinationCount,
      governanceSignals: governance.governanceSignals,
      governanceReasons: governance.reasons,
    },
  });

  return {
    node,
    settings,
    sources,
    expansion,
    governance,
    inputSnapshotJson: {
      mode: settings.mode,
      anchorInputNodeId: settings.anchorInputNodeId,
      sources: sources.map((source) => ({
        inputNodeId: source.inputNodeId,
        inputNodeTitle: source.inputNodeTitle,
        sourceType: source.sourceType,
        totalItems: source.totalItems,
        enabledItems: source.enabledItems,
        items: source.items
          .filter((item) => item.enabled)
          .map((item) => ({
            itemId: item.itemId,
            stableKey: item.stableKey,
            label: item.itemLabel,
            sourceType: item.sourceType,
            snapshotJson: item.snapshotJson,
          })),
      })),
    },
  };
}

export async function estimateCombinationPlan(input: z.infer<typeof estimateCombinationPlanInputSchema>) {
  const parsed = estimateCombinationPlanInputSchema.parse(input);
  const preview = await buildCombinationPlanPreview(parsed, false);

  return {
    mode: preview.settings.mode,
    anchor_input_node_id: preview.settings.anchorInputNodeId,
    input_source_count: preview.sources.length,
    estimated_combination_count: preview.expansion.estimatedCombinationCount,
    governance_action: preview.governance.governanceAction,
    governance_signals: preview.governance.governanceSignals,
    sources: preview.sources.map((source) => ({
      input_node_id: source.inputNodeId,
      input_node_title: source.inputNodeTitle,
      source_type: source.sourceType,
      total_items: source.totalItems,
      enabled_items: source.enabledItems,
    })),
    samples: preview.expansion.samples,
    sample_labels: preview.expansion.sampleLabels,
    max_expandable_combination_count: MAX_EXPANDABLE_COMBINATION_COUNT,
  };
}

export async function createCombinationPlan(input: z.infer<typeof createCombinationPlanInputSchema>) {
  const parsed = createCombinationPlanInputSchema.parse(input);
  const preview = await buildCombinationPlanPreview(parsed, true);

  if (preview.expansion.estimatedCombinationCount > MAX_EXPANDABLE_COMBINATION_COUNT) {
    throw new ApiError(
      409,
      "COMBINATION_PLAN_TOO_LARGE",
      `当前计划预计会生成 ${preview.expansion.estimatedCombinationCount} 个组合实例，超过当前可创建上限 ${MAX_EXPANDABLE_COMBINATION_COUNT}。`,
    );
  }

  const expandedItems = preview.expansion.items ?? [];
  const shardSize = Math.min(MAX_SHARD_SIZE, Math.max(1, parsed.shardSize ?? DEFAULT_SHARD_SIZE));
  const totalShardCount = expandedItems.length === 0 ? 0 : Math.ceil(expandedItems.length / shardSize);
  const createdAt = new Date();

  const plan = await db.transaction(async (tx) => {
    const [createdPlan] = await tx
      .insert(combinationPlans)
      .values({
        workspaceId: parsed.workspaceId,
        canvasId: parsed.canvasId,
        combinationNodeId: parsed.nodeId,
        createdBy: parsed.actorUserId,
        mode: preview.settings.mode,
        status: "draft",
        governanceAction: preview.governance.governanceAction,
        governanceSignalsJson: preview.governance.governanceSignals,
        inputNodeIdsJson: preview.sources.map((source) => source.inputNodeId),
        inputSnapshotJson: preview.inputSnapshotJson,
        samplePreviewJson: preview.expansion.samples,
        estimatedCombinationCount: preview.expansion.estimatedCombinationCount,
        totalItemCount: expandedItems.length,
        completedItemCount: 0,
        succeededItemCount: 0,
        failedItemCount: 0,
        totalShardCount,
        completedShardCount: 0,
        succeededShardCount: 0,
        failedShardCount: 0,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();

    const createdShards =
      totalShardCount > 0
        ? await tx
            .insert(combinationShards)
            .values(
              Array.from({ length: totalShardCount }, (_, shardIndex) => {
                const itemStartIndex = shardIndex * shardSize;
                const itemEndIndex = Math.min(expandedItems.length - 1, itemStartIndex + shardSize - 1);

                return {
                  workspaceId: parsed.workspaceId,
                  canvasId: parsed.canvasId,
                  batchRunId: null,
                  planId: createdPlan.id,
                  shardIndex,
                  status: "draft",
                  itemStartIndex,
                  itemEndIndex,
                  itemCount: itemEndIndex - itemStartIndex + 1,
                  completedItemCount: 0,
                  succeededItemCount: 0,
                  failedItemCount: 0,
                  createdAt,
                  updatedAt: createdAt,
                };
              }),
            )
            .returning()
        : [];
    const shardIdByIndex = new Map(createdShards.map((shard) => [shard.shardIndex, shard.id]));

    if (expandedItems.length > 0) {
      await tx.insert(combinationItems).values(
        expandedItems.map((item, itemIndex) => {
          const shardIndex = Math.floor(itemIndex / shardSize);

          return {
            workspaceId: parsed.workspaceId,
            canvasId: parsed.canvasId,
            batchRunId: null,
            planId: createdPlan.id,
            shardId: shardIdByIndex.get(shardIndex) ?? null,
            itemIndex,
            stableKey: item.stableKey,
            displayLabel: item.displayLabel,
            status: "draft",
            bindingSummaryJson: item.bindings.map((binding) => ({
              inputNodeId: binding.inputNodeId,
              inputNodeTitle: binding.inputNodeTitle,
              itemId: binding.itemId,
              itemLabel: binding.itemLabel,
              sourceType: binding.sourceType,
            })),
            inputBindingsJson: item.bindings.map((binding) => ({
              inputNodeId: binding.inputNodeId,
              inputNodeTitle: binding.inputNodeTitle,
              itemId: binding.itemId,
              stableKey: binding.stableKey,
              itemLabel: binding.itemLabel,
              sourceType: binding.sourceType,
              contentText: binding.contentText,
              assetId: binding.assetId,
              sourceRefJson: binding.sourceRefJson,
              snapshotJson: binding.snapshotJson,
            })),
            displayOrder: itemIndex,
            attemptCount: 0,
            createdAt,
            updatedAt: createdAt,
          };
        }),
      );
    }

    return createdPlan;
  });

  await writeCombinationNodeSnapshot({
    workspaceId: parsed.workspaceId,
    canvasId: parsed.canvasId,
    nodeId: parsed.nodeId,
    mode: preview.settings.mode,
    sources: preview.sources,
    estimatedCombinationCount: preview.expansion.estimatedCombinationCount,
    governanceSignals: preview.governance.governanceSignals,
    sampleLabels: preview.expansion.sampleLabels,
    samples: preview.expansion.samples,
    latestPlanId: plan.id,
    latestPlanStatus: plan.status,
    governanceAction: preview.governance.governanceAction,
  });
  recordRuntimeMetric({
    name: "combination_plan_created",
    value: 1,
    unit: "count",
    tags: {
      workspace_id: parsed.workspaceId,
      canvas_id: parsed.canvasId,
      plan_id: plan.id,
      mode: preview.settings.mode,
      governance_action: preview.governance.governanceAction ?? "none",
    },
    fields: {
      estimatedCombinationCount: preview.expansion.estimatedCombinationCount,
      totalItemCount: expandedItems.length,
      totalShardCount,
      shardSize,
      governanceSignals: preview.governance.governanceSignals,
    },
  });
  logRuntimeEvent({
    level: preview.governance.governanceAction === "reject" ? "warn" : "info",
    event: "combination.plan.created",
    workspaceId: parsed.workspaceId,
    canvasId: parsed.canvasId,
    nodeId: parsed.nodeId,
    planId: plan.id,
    status: plan.status,
    details: {
      mode: preview.settings.mode,
      estimatedCombinationCount: preview.expansion.estimatedCombinationCount,
      totalItemCount: expandedItems.length,
      totalShardCount,
      shardSize,
      governanceSignals: preview.governance.governanceSignals,
    },
  });

  return getCombinationPlan({
    workspaceId: parsed.workspaceId,
    planId: plan.id,
  });
}

export async function getCombinationPlan(input: z.infer<typeof getCombinationPlanInputSchema>) {
  const parsed = getCombinationPlanInputSchema.parse(input);
  const plan = await getScopedCombinationPlan(parsed.workspaceId, parsed.planId);
  const itemLimit = parsed.itemLimit ?? 50;
  const itemOffset = parsed.itemOffset ?? 0;
  const shardLimit = parsed.shardLimit ?? 20;
  const shardOffset = parsed.shardOffset ?? 0;
  const [items, shards] = await Promise.all([
    db
      .select()
      .from(combinationItems)
      .where(and(eq(combinationItems.workspaceId, parsed.workspaceId), eq(combinationItems.planId, parsed.planId)))
      .orderBy(asc(combinationItems.itemIndex))
      .limit(itemLimit)
      .offset(itemOffset),
    db
      .select()
      .from(combinationShards)
      .where(and(eq(combinationShards.workspaceId, parsed.workspaceId), eq(combinationShards.planId, parsed.planId)))
      .orderBy(asc(combinationShards.shardIndex))
      .limit(shardLimit)
      .offset(shardOffset),
  ]);

  const [latestNode] = await db
    .select({
      title: canvasNodes.title,
    })
    .from(canvasNodes)
    .where(eq(canvasNodes.id, plan.combinationNodeId))
    .limit(1);

  return {
    id: plan.id,
    canvas_id: plan.canvasId,
    combination_node_id: plan.combinationNodeId,
    combination_node_title: latestNode?.title ?? null,
    batch_run_id: plan.batchRunId,
    mode: plan.mode,
    status: plan.status,
    governance_action: plan.governanceAction,
    governance_signals: plan.governanceSignalsJson,
    input_node_ids: plan.inputNodeIdsJson,
    estimated_combination_count: plan.estimatedCombinationCount,
    total_item_count: plan.totalItemCount,
    completed_item_count: plan.completedItemCount,
    succeeded_item_count: plan.succeededItemCount,
    failed_item_count: plan.failedItemCount,
    total_shard_count: plan.totalShardCount,
    completed_shard_count: plan.completedShardCount,
    succeeded_shard_count: plan.succeededShardCount,
    failed_shard_count: plan.failedShardCount,
    started_at: plan.startedAt,
    finished_at: plan.finishedAt,
    last_error_code: plan.lastErrorCode,
    last_error_message: plan.lastErrorMessage,
    input_snapshot: plan.inputSnapshotJson,
    sample_preview: plan.samplePreviewJson,
    items_page: {
      offset: itemOffset,
      limit: itemLimit,
      total: plan.totalItemCount,
      items: items.map((item) => ({
        id: item.id,
        shard_id: item.shardId,
        item_index: item.itemIndex,
        stable_key: item.stableKey,
        label: item.displayLabel,
        status: item.status,
        binding_summary: item.bindingSummaryJson,
        input_bindings: item.inputBindingsJson,
        source_batch_item_key: item.sourceBatchItemKey,
        display_order: item.displayOrder,
        attempt_count: item.attemptCount,
        last_error_node_id: item.lastErrorNodeId,
        last_error_code: item.lastErrorCode,
        last_error_message: item.lastErrorMessage,
        started_at: item.startedAt,
        finished_at: item.finishedAt,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      })),
    },
    shards_page: {
      offset: shardOffset,
      limit: shardLimit,
      total: plan.totalShardCount,
      items: shards.map((shard) => ({
        id: shard.id,
        shard_index: shard.shardIndex,
        status: shard.status,
        item_start_index: shard.itemStartIndex,
        item_end_index: shard.itemEndIndex,
        item_count: shard.itemCount,
        completed_item_count: shard.completedItemCount,
        succeeded_item_count: shard.succeededItemCount,
        failed_item_count: shard.failedItemCount,
        scheduled_at: shard.scheduledAt,
        started_at: shard.startedAt,
        finished_at: shard.finishedAt,
        last_error_code: shard.lastErrorCode,
        last_error_message: shard.lastErrorMessage,
        created_at: shard.createdAt,
        updated_at: shard.updatedAt,
      })),
    },
    created_at: plan.createdAt,
    updated_at: plan.updatedAt,
  };
}

async function setPlanStatus(
  workspaceId: string,
  planId: string,
  nextStatus: PlanStatus,
  options?: {
    startedAt?: Date | null;
    finishedAt?: Date | null;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    itemStatuses?: string[];
    itemNextStatus?: string;
    shardStatuses?: string[];
    shardNextStatus?: string;
  },
) {
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(combinationPlans)
      .set({
        status: nextStatus,
        startedAt: options?.startedAt === undefined ? undefined : options.startedAt,
        finishedAt: options?.finishedAt === undefined ? undefined : options.finishedAt,
        lastErrorCode: options?.lastErrorCode === undefined ? undefined : options.lastErrorCode,
        lastErrorMessage: options?.lastErrorMessage === undefined ? undefined : options.lastErrorMessage,
        updatedAt: now,
      })
      .where(and(eq(combinationPlans.workspaceId, workspaceId), eq(combinationPlans.id, planId)));

    if (options?.itemStatuses && options.itemStatuses.length > 0 && options.itemNextStatus) {
      await tx
        .update(combinationItems)
        .set({
          status: options.itemNextStatus,
          updatedAt: now,
        })
        .where(
          and(
            eq(combinationItems.workspaceId, workspaceId),
            eq(combinationItems.planId, planId),
            inArray(combinationItems.status, options.itemStatuses),
          ),
        );
    }

    if (options?.shardStatuses && options.shardStatuses.length > 0 && options.shardNextStatus) {
      await tx
        .update(combinationShards)
        .set({
          status: options.shardNextStatus,
          updatedAt: now,
        })
        .where(
          and(
            eq(combinationShards.workspaceId, workspaceId),
            eq(combinationShards.planId, planId),
            inArray(combinationShards.status, options.shardStatuses),
          ),
        );
    }
  });
}

async function syncCombinationNodeSnapshotForPlan(workspaceId: string, planId: string) {
  const plan = await getScopedCombinationPlan(workspaceId, planId);
  const combinationNode = await getScopedNode(workspaceId, plan.canvasId, plan.combinationNodeId);
  const settings = normalizeCombinationNodeSettings(combinationNode, {
    mode: plan.mode as "zip" | "cartesian" | "anchor" | "custom_mapping",
  });
  const sources = await getCombinationInputSources(workspaceId, plan.canvasId, plan.combinationNodeId);

  await writeCombinationNodeSnapshot({
    workspaceId,
    canvasId: plan.canvasId,
    nodeId: plan.combinationNodeId,
    mode: settings.mode,
    sources,
    estimatedCombinationCount: plan.estimatedCombinationCount,
    governanceSignals: (plan.governanceSignalsJson ?? []).filter(
      (signal): signal is GovernanceAction =>
        signal === "warn" || signal === "confirm" || signal === "manual_approval" || signal === "reject",
    ),
    sampleLabels: (plan.samplePreviewJson ?? [])
      .map((sample) => normalizeRecord(sample).label)
      .filter((label): label is string => typeof label === "string"),
    samples: (plan.samplePreviewJson ?? [])
      .map((sample) => normalizeRecord(sample))
      .filter((sample) => typeof sample.id === "string" && typeof sample.label === "string")
      .map((sample) => ({
        id: String(sample.id),
        label: String(sample.label),
        bindings: Array.isArray(sample.bindings)
          ? sample.bindings
              .filter((binding): binding is Record<string, unknown> => Boolean(binding && typeof binding === "object"))
              .map((binding) => ({
                inputNodeId: String(binding.inputNodeId ?? ""),
                itemId: String(binding.itemId ?? ""),
                itemLabel: String(binding.itemLabel ?? ""),
                sourceType:
                  binding.sourceType === "image" || binding.sourceType === "video" || binding.sourceType === "text"
                    ? binding.sourceType
                    : "text",
              }))
          : [],
      })),
    latestPlanId: plan.id,
    latestPlanStatus: plan.status,
    governanceAction: plan.governanceAction,
  });
}

export async function runCombinationPlan(input: z.infer<typeof changeCombinationPlanStatusInputSchema>) {
  const parsed = changeCombinationPlanStatusInputSchema.parse(input);
  const plan = await getScopedCombinationPlan(parsed.workspaceId, parsed.planId);

  if (plan.status !== "draft" && plan.status !== "paused") {
    throw new ApiError(409, "COMBINATION_PLAN_STATUS_INVALID", "当前计划状态不允许启动。");
  }

  if (plan.governanceAction === "reject") {
    throw new ApiError(409, "COMBINATION_PLAN_REJECTED", "当前计划已被治理规则拒绝，不能直接运行。");
  }

  if ((plan.governanceAction === "confirm" || plan.governanceAction === "manual_approval") && !parsed.allowHighCost) {
    throw new ApiError(409, "COMBINATION_PLAN_CONFIRM_REQUIRED", "当前计划需要显式确认后才能运行。");
  }

  const startedAt = plan.startedAt ?? new Date();

  await setPlanStatus(parsed.workspaceId, parsed.planId, "queued", {
    startedAt,
    finishedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    itemStatuses: ["draft", "paused"],
    itemNextStatus: "queued",
    shardStatuses: ["draft", "paused"],
    shardNextStatus: "queued",
  });
  await syncCombinationNodeSnapshotForPlan(parsed.workspaceId, parsed.planId);
  recordRuntimeMetric({
    name: "combination_plan_status_change",
    value: 1,
    unit: "count",
    tags: {
      workspace_id: parsed.workspaceId,
      plan_id: parsed.planId,
      status: "queued",
      action: "run",
    },
  });
  logRuntimeEvent({
    level: "info",
    event: "combination.plan.run_requested",
    workspaceId: parsed.workspaceId,
    canvasId: plan.canvasId,
    nodeId: plan.combinationNodeId,
    planId: parsed.planId,
    status: "queued",
    details: {
      previousStatus: plan.status,
      governanceAction: plan.governanceAction,
      allowHighCost: Boolean(parsed.allowHighCost),
    },
  });

  return getCombinationPlan({
    workspaceId: parsed.workspaceId,
    planId: parsed.planId,
  });
}

export async function pauseCombinationPlan(input: z.infer<typeof changeCombinationPlanStatusInputSchema>) {
  const parsed = changeCombinationPlanStatusInputSchema.parse(input);
  const plan = await getScopedCombinationPlan(parsed.workspaceId, parsed.planId);

  if (plan.status !== "queued" && plan.status !== "running") {
    throw new ApiError(409, "COMBINATION_PLAN_STATUS_INVALID", "当前计划状态不允许暂停。");
  }

  await setPlanStatus(parsed.workspaceId, parsed.planId, "paused", {
    itemStatuses: ["queued", "running"],
    itemNextStatus: "paused",
    shardStatuses: ["queued", "running"],
    shardNextStatus: "paused",
  });
  await syncCombinationNodeSnapshotForPlan(parsed.workspaceId, parsed.planId);
  recordRuntimeMetric({
    name: "combination_plan_status_change",
    value: 1,
    unit: "count",
    tags: {
      workspace_id: parsed.workspaceId,
      plan_id: parsed.planId,
      status: "paused",
      action: "pause",
    },
  });
  logRuntimeEvent({
    level: "warn",
    event: "combination.plan.paused",
    workspaceId: parsed.workspaceId,
    canvasId: plan.canvasId,
    nodeId: plan.combinationNodeId,
    planId: parsed.planId,
    status: "paused",
    details: {
      previousStatus: plan.status,
    },
  });

  return getCombinationPlan({
    workspaceId: parsed.workspaceId,
    planId: parsed.planId,
  });
}

export async function resumeCombinationPlan(input: z.infer<typeof changeCombinationPlanStatusInputSchema>) {
  const parsed = changeCombinationPlanStatusInputSchema.parse(input);
  const plan = await getScopedCombinationPlan(parsed.workspaceId, parsed.planId);

  if (plan.status !== "paused") {
    throw new ApiError(409, "COMBINATION_PLAN_STATUS_INVALID", "当前计划状态不允许恢复。");
  }

  if ((plan.governanceAction === "confirm" || plan.governanceAction === "manual_approval") && !parsed.allowHighCost) {
    throw new ApiError(409, "COMBINATION_PLAN_CONFIRM_REQUIRED", "恢复当前计划前需要显式确认。");
  }

  await setPlanStatus(parsed.workspaceId, parsed.planId, "queued", {
    finishedAt: null,
    itemStatuses: ["paused"],
    itemNextStatus: "queued",
    shardStatuses: ["paused"],
    shardNextStatus: "queued",
  });
  await syncCombinationNodeSnapshotForPlan(parsed.workspaceId, parsed.planId);
  recordRuntimeMetric({
    name: "combination_plan_status_change",
    value: 1,
    unit: "count",
    tags: {
      workspace_id: parsed.workspaceId,
      plan_id: parsed.planId,
      status: "queued",
      action: "resume",
    },
  });
  logRuntimeEvent({
    level: "info",
    event: "combination.plan.resumed",
    workspaceId: parsed.workspaceId,
    canvasId: plan.canvasId,
    nodeId: plan.combinationNodeId,
    planId: parsed.planId,
    status: "queued",
    details: {
      previousStatus: plan.status,
      governanceAction: plan.governanceAction,
      allowHighCost: Boolean(parsed.allowHighCost),
    },
  });

  return getCombinationPlan({
    workspaceId: parsed.workspaceId,
    planId: parsed.planId,
  });
}

export async function cancelCombinationPlan(input: z.infer<typeof changeCombinationPlanStatusInputSchema>) {
  const parsed = changeCombinationPlanStatusInputSchema.parse(input);
  const plan = await getScopedCombinationPlan(parsed.workspaceId, parsed.planId);

  if (plan.status === "canceled" || plan.status === "succeeded" || plan.status === "failed") {
    throw new ApiError(409, "COMBINATION_PLAN_STATUS_INVALID", "当前计划已结束，不能再取消。");
  }

  await setPlanStatus(parsed.workspaceId, parsed.planId, "canceled", {
    finishedAt: new Date(),
    itemStatuses: ["draft", "queued", "running", "paused"],
    itemNextStatus: "canceled",
    shardStatuses: ["draft", "queued", "running", "paused"],
    shardNextStatus: "canceled",
  });
  await syncCombinationNodeSnapshotForPlan(parsed.workspaceId, parsed.planId);
  recordRuntimeMetric({
    name: "combination_plan_status_change",
    value: 1,
    unit: "count",
    tags: {
      workspace_id: parsed.workspaceId,
      plan_id: parsed.planId,
      status: "canceled",
      action: "cancel",
    },
  });
  logRuntimeEvent({
    level: "warn",
    event: "combination.plan.canceled",
    workspaceId: parsed.workspaceId,
    canvasId: plan.canvasId,
    nodeId: plan.combinationNodeId,
    planId: parsed.planId,
    status: "canceled",
    details: {
      previousStatus: plan.status,
    },
  });

  return getCombinationPlan({
    workspaceId: parsed.workspaceId,
    planId: parsed.planId,
  });
}

import { readFileSync } from "node:fs";
import path from "node:path";

import { and, asc, desc, eq, inArray, lte, or } from "drizzle-orm";
import { z } from "zod";

import { createGeneratedAsset, listAssetsByOwner } from "@/application/services/asset-service";
import { db } from "@/infrastructure/db/client";
import {
  assets,
  canvasEdges,
  canvasNodes,
  canvases,
  generationTasks,
  instructionPresets,
  libraryItems,
  nodeRunBatches,
  nodeRuns,
  taskResults,
} from "@/infrastructure/db/schema";
import {
  generateImageWithCloubic,
  generateTextWithCloubic,
  generateVideoWithCloubic,
  getVideoStatusWithCloubic,
} from "@/infrastructure/ai/cloubic-client";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

const runNodeMergeStrategySchema = z.enum(["previous_only", "merge_all", "custom"]);

export const runNodeInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  nodeId: z.uuid(),
  actorUserId: z.uuid(),
  requestId: z.string().min(1, "request_id is required.").max(100, "request_id is too long."),
  useUpstreamOutputs: z.boolean().default(true),
  mergeStrategy: runNodeMergeStrategySchema.default("merge_all"),
  upstreamNodeIds: z.array(z.uuid()).optional(),
  overrideSettings: z.record(z.string(), z.unknown()).default({}),
  batchRunId: z.uuid().optional(),
  batchRunIndex: z.coerce.number().int().positive().optional(),
});

export const getTaskInputSchema = z.object({
  workspaceId: z.uuid(),
  taskId: z.uuid(),
});

export const pollTaskInputSchema = z.object({
  workspaceId: z.uuid(),
  taskId: z.uuid(),
});

export const pollDueTasksInputSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const retryTaskInputSchema = z.object({
  workspaceId: z.uuid(),
  taskId: z.uuid(),
});

export const listTasksInputSchema = z.object({
  workspaceId: z.uuid(),
  status: z.enum(["queued", "processing", "succeeded", "failed", "canceled"]).optional(),
  taskType: z.enum(["text", "image", "video", "audio", "storyboard"]).optional(),
  canvasId: z.uuid().optional(),
  nodeId: z.uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const runNodeBatchInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid(),
  actorUserId: z.uuid(),
  nodeIds: z.array(z.uuid()).min(1).max(30),
  runCount: z.coerce.number().int().positive().max(50),
});

export const listNodeRunBatchesInputSchema = z.object({
  workspaceId: z.uuid(),
  canvasId: z.uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const getNodeRunBatchInputSchema = z.object({
  workspaceId: z.uuid(),
  batchRunId: z.uuid(),
});

const DEFAULT_STORYBOARD_TEMPLATE_FILE = "shotOutFormat.md";
const DEFAULT_STORYBOARD_SHOT_COUNT = 6;
const STORYBOARD_SYSTEM_PROMPT =
  "你是一名专业电影分镜导演、镜头设计师和连续性脚本专家。你必须严格返回一个 JSON 对象，不要输出 Markdown、代码块或任何解释文字。shots 数组必须完整、连续、可直接用于后续视频生成。";

let cachedStoryboardTemplate:
  | {
      filePath: string;
      content: string;
    }
  | null = null;

export const runLibraryItemImageGenerationInputSchema = z.object({
  workspaceId: z.uuid(),
  actorUserId: z.uuid(),
  itemId: z.uuid(),
  itemKind: z.enum(["subject", "scene"]).optional(),
  requestId: z.string().min(1, "request_id is required.").max(100, "request_id is too long."),
  mode: z.enum(["text_to_image", "image_to_image"]).default("text_to_image"),
  instructionPresetId: z.uuid().optional(),
  prompt: z.string().trim().optional(),
  referenceAssetIds: z.array(z.uuid()).default([]),
});

function tryParseStructuredData(content: string) {
  try {
    const parsed = JSON.parse(content);

    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeOutputContent(outputSnapshot: Record<string, unknown> | null) {
  if (!outputSnapshot) {
    return null;
  }

  const content = outputSnapshot.content;

  if (typeof content === "string" && content.trim().length > 0) {
    return content.trim();
  }

  const structuredData = outputSnapshot.structuredData;

  if (structuredData && typeof structuredData === "object") {
    return JSON.stringify(structuredData);
  }

  return null;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function createBatchRunRequestId(batchRunId: string, runIndex: number, nodeId: string) {
  return `br-${batchRunId.slice(0, 8)}-${runIndex}-${nodeId.slice(0, 8)}-${crypto.randomUUID().slice(0, 12)}`;
}

function buildLibraryItemGenerationPrompt(params: {
  item: {
    name: string;
    description: string | null;
    promptHints: string | null;
  };
  instructionPreset: {
    promptTemplate: string;
    negativePrompt: string | null;
  } | null;
  prompt: string | undefined;
}) {
  return [
    params.instructionPreset?.promptTemplate ?? null,
    params.item.name,
    params.item.description,
    params.item.promptHints,
    params.prompt,
    params.instructionPreset?.negativePrompt ? `Negative prompt: ${params.instructionPreset.negativePrompt}` : null,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join("\n\n");
}

function resolveUpstreamSemantic(sourceType: string, targetType: string) {
  if (
    (sourceType === "text" || sourceType === "storyboard") &&
    (targetType === "text" || targetType === "storyboard" || targetType === "image" || targetType === "video")
  ) {
    return "prompt" as const;
  }

  if (sourceType === "image" && (targetType === "image" || targetType === "video")) {
    return "reference_image" as const;
  }

  return null;
}

function normalizeStoryboardTemplateFile(templateFile: unknown) {
  if (typeof templateFile === "string" && templateFile.trim().length > 0) {
    return templateFile.trim();
  }

  return DEFAULT_STORYBOARD_TEMPLATE_FILE;
}

function normalizeStoryboardShotCount(shotCount: unknown) {
  if (typeof shotCount === "number" && Number.isFinite(shotCount)) {
    return Math.min(24, Math.max(1, Math.round(shotCount)));
  }

  return DEFAULT_STORYBOARD_SHOT_COUNT;
}

function resolveStoryboardTemplatePath(templateFile: string) {
  return path.isAbsolute(templateFile) ? templateFile : path.join(process.cwd(), templateFile);
}

function getStoryboardTemplate(templateFile: string) {
  const filePath = resolveStoryboardTemplatePath(templateFile);

  if (cachedStoryboardTemplate?.filePath === filePath) {
    return cachedStoryboardTemplate.content;
  }

  const content = readFileSync(filePath, "utf8");
  cachedStoryboardTemplate = {
    filePath,
    content,
  };

  return content;
}

function buildStoryboardGenerationPrompt(prompt: string, settings: Record<string, unknown>) {
  const templateFile = normalizeStoryboardTemplateFile(settings.templateFile);
  const shotCount = normalizeStoryboardShotCount(settings.shotCount);
  const template = getStoryboardTemplate(templateFile);
  const brief = prompt.trim() || "请生成一套具备明确动作设计、镜头衔接和视频生成提示词的连续分镜。";

  return [
    "请根据以下创意简报生成一组连续分镜。",
    `镜头数量必须严格为 ${shotCount} 个，sequence 从 1 递增到 ${shotCount}。`,
    "输出必须严格遵循下方模板中的字段名和层级结构。",
    "模板中的注释、说明文字、示例值、占位符和省略号都不要原样出现在最终 JSON 中。",
    "每个 shot 都必须补全 characters、transition、suggestedAssets、videoPrompt 等字段。",
    "videoPrompt 必须为英文，其他字段可根据内容自然表达，但整体必须保持 JSON 可解析。",
    `模板文件：${templateFile}`,
    "模板内容：",
    template,
    "创意简报：",
    brief,
  ].join("\n\n");
}

function extractImageSourceFromString(value: string) {
  const markdownMatch = value.match(/!\[[^\]]*]\(([^)]+)\)/);

  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const directMatch = value.match(/(data:image\/[^\s)]+|https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|webp|gif|bmp|svg)(?:\?[^\s)]*)?)/i);

  return directMatch?.[1];
}

function extractImageSourceFromSnapshot(outputSnapshot: Record<string, unknown> | null) {
  if (!outputSnapshot) {
    return undefined;
  }

  const structuredData =
    outputSnapshot.structuredData && typeof outputSnapshot.structuredData === "object"
      ? (outputSnapshot.structuredData as Record<string, unknown>)
      : null;

  const candidateValues = [
    structuredData?.imageUrl,
    structuredData?.dataUri,
    structuredData?.url,
    outputSnapshot.content,
  ];

  for (const candidate of candidateValues) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      continue;
    }

    const source = extractImageSourceFromString(candidate.trim());

    if (source) {
      return source;
    }
  }

  return undefined;
}

async function assertNodeForRun(workspaceId: string, canvasId: string, nodeId: string) {
  const [node] = await db
    .select()
    .from(canvasNodes)
    .where(
      and(
        eq(canvasNodes.id, nodeId),
        eq(canvasNodes.canvasId, canvasId),
        eq(canvasNodes.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!node) {
    throw new ApiError(404, "NODE_NOT_FOUND", "Canvas node not found.");
  }

  return node;
}

async function assertLibraryItemForGeneration(
  workspaceId: string,
  itemId: string,
  expectedKind?: "subject" | "scene",
) {
  const [item] = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.id, itemId),
        eq(libraryItems.workspaceId, workspaceId),
        expectedKind ? eq(libraryItems.kind, expectedKind) : undefined,
      ),
    )
    .limit(1);

  if (!item) {
    throw new ApiError(404, "LIBRARY_ITEM_NOT_FOUND", expectedKind === "scene" ? "场景资源不存在。" : "主体资源不存在。");
  }

  return item;
}

async function resolveInstructionPresetForGeneration(workspaceId: string, actorUserId: string, presetId?: string) {
  if (!presetId) {
    return null;
  }

  const [preset] = await db
    .select()
    .from(instructionPresets)
    .where(
      and(
        eq(instructionPresets.id, presetId),
        eq(instructionPresets.status, "active"),
        or(
          and(eq(instructionPresets.scope, "workspace"), eq(instructionPresets.workspaceId, workspaceId)),
          and(eq(instructionPresets.scope, "personal"), eq(instructionPresets.createdBy, actorUserId)),
        ),
      ),
    )
    .limit(1);

  if (!preset) {
    throw new ApiError(404, "INSTRUCTION_PRESET_NOT_FOUND", "指令不存在。");
  }

  return preset;
}

async function resolveLibraryReferenceAssets(params: {
  workspaceId: string;
  itemId: string;
  referenceAssetIds: string[];
}) {
  const ownerAssets = await listAssetsByOwner({
    workspaceId: params.workspaceId,
    ownerType: "library_item",
    ownerId: params.itemId,
  });
  const imageAssets = ownerAssets.filter((asset) => asset.assetType === "image");

  if (params.referenceAssetIds.length === 0) {
    return imageAssets;
  }

  const requestedSet = new Set(params.referenceAssetIds);

  return imageAssets.filter((asset) => requestedSet.has(asset.id));
}

async function getIncomingEdges(workspaceId: string, canvasId: string, nodeId: string) {
  return db
    .select()
    .from(canvasEdges)
    .where(
      and(
        eq(canvasEdges.workspaceId, workspaceId),
        eq(canvasEdges.canvasId, canvasId),
        eq(canvasEdges.targetNodeId, nodeId),
      ),
    )
    .orderBy(asc(canvasEdges.priority), asc(canvasEdges.createdAt));
}

async function resolveSelectedUpstreamNodeIds(
  input: z.infer<typeof runNodeInputSchema>,
  incomingEdges: Array<{
    sourceNodeId: string;
    targetNodeId: string;
    priority: number;
    createdAt: Date;
  }>,
) {
  if (!input.useUpstreamOutputs || incomingEdges.length === 0) {
    return [];
  }

  if (input.mergeStrategy === "previous_only") {
    return incomingEdges.slice(0, 1).map((edge) => edge.sourceNodeId);
  }

  if (input.mergeStrategy === "custom") {
    if (!input.upstreamNodeIds || input.upstreamNodeIds.length === 0) {
      throw new ApiError(400, "VALIDATION_ERROR", "upstreamNodeIds is required when mergeStrategy is custom.");
    }

    const availableNodeIds = new Set(incomingEdges.map((edge) => edge.sourceNodeId));

    for (const upstreamNodeId of input.upstreamNodeIds) {
      if (!availableNodeIds.has(upstreamNodeId)) {
        throw new ApiError(400, "NODE_GRAPH_INVALID", "Custom upstreamNodeIds must belong to incoming canvas edges.");
      }
    }

    return input.upstreamNodeIds;
  }

  return incomingEdges.map((edge) => edge.sourceNodeId);
}

async function getUpstreamNodes(workspaceId: string, canvasId: string, upstreamNodeIds: string[]) {
  if (upstreamNodeIds.length === 0) {
    return [];
  }

  const upstreamNodes = await db
    .select()
    .from(canvasNodes)
    .where(
      and(
        eq(canvasNodes.workspaceId, workspaceId),
        eq(canvasNodes.canvasId, canvasId),
        inArray(canvasNodes.id, upstreamNodeIds),
      ),
    );

  const upstreamNodeMap = new Map(upstreamNodes.map((node) => [node.id, node]));

  return upstreamNodeIds
    .map((nodeId) => upstreamNodeMap.get(nodeId))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
}

async function getNodeReferenceAssets(node: Awaited<ReturnType<typeof assertNodeForRun>>) {
  const assetIds = uniqueStrings(
    ((node.resourceRefs as { assetIds?: string[] } | null)?.assetIds ?? []).filter((assetId): assetId is string => typeof assetId === "string"),
  );

  if (assetIds.length === 0) {
    return [];
  }

  const imageAssets = await db
    .select({
      id: assets.id,
      fileUrl: assets.fileUrl,
      fileName: assets.fileName,
      mimeType: assets.mimeType,
      width: assets.width,
      height: assets.height,
    })
    .from(assets)
    .where(
      and(
        eq(assets.workspaceId, node.workspaceId),
        eq(assets.assetType, "image"),
        inArray(assets.id, assetIds),
      ),
    );

  const assetMap = new Map(imageAssets.map((asset) => [asset.id, asset]));

  return assetIds
    .map((assetId) => assetMap.get(assetId))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
}

async function getNodeReferenceAssetMap(
  workspaceId: string,
  nodes: Array<{
    id: string;
    resourceRefs: unknown;
  }>,
) {
  const nodeAssetIds = nodes.map((node) => ({
    nodeId: node.id,
    assetIds: uniqueStrings(
      (((node.resourceRefs as { assetIds?: string[] } | null)?.assetIds ?? []).filter(
        (assetId): assetId is string => typeof assetId === "string",
      )),
    ),
  }));
  const allAssetIds = uniqueStrings(nodeAssetIds.flatMap((item) => item.assetIds));

  if (allAssetIds.length === 0) {
    return new Map<string, Array<{ id: string; fileUrl: string; fileName: string; mimeType: string; width: number | null; height: number | null }>>();
  }

  const imageAssets = await db
    .select({
      id: assets.id,
      fileUrl: assets.fileUrl,
      fileName: assets.fileName,
      mimeType: assets.mimeType,
      width: assets.width,
      height: assets.height,
    })
    .from(assets)
    .where(and(eq(assets.workspaceId, workspaceId), eq(assets.assetType, "image"), inArray(assets.id, allAssetIds)));
  const assetMap = new Map(imageAssets.map((asset) => [asset.id, asset]));

  return new Map(
    nodeAssetIds.map(({ nodeId, assetIds }) => [
      nodeId,
      assetIds.map((assetId) => assetMap.get(assetId)).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset)),
    ]),
  );
}

async function getCanvasNodesByIds(workspaceId: string, canvasId: string, nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return [];
  }

  const records = await db
    .select()
    .from(canvasNodes)
    .where(
      and(
        eq(canvasNodes.workspaceId, workspaceId),
        eq(canvasNodes.canvasId, canvasId),
        inArray(canvasNodes.id, nodeIds),
      ),
    );
  const recordMap = new Map(records.map((node) => [node.id, node]));

  return nodeIds
    .map((nodeId) => recordMap.get(nodeId))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
}

async function getCanvasEdgesForNodes(workspaceId: string, canvasId: string, nodeIds: string[]) {
  if (nodeIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(canvasEdges)
    .where(
      and(
        eq(canvasEdges.workspaceId, workspaceId),
        eq(canvasEdges.canvasId, canvasId),
        inArray(canvasEdges.sourceNodeId, nodeIds),
        inArray(canvasEdges.targetNodeId, nodeIds),
      ),
    )
    .orderBy(asc(canvasEdges.priority), asc(canvasEdges.createdAt));
}

function sortNodesForBatchRun(
  nodes: Array<{ id: string; title: string; type: string }>,
  edges: Array<{ sourceNodeId: string; targetNodeId: string; priority: number }>,
) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingCount = new Map<string, number>(nodes.map((node) => [node.id, 0]));
  const outgoingMap = new Map<string, Array<{ sourceNodeId: string; targetNodeId: string; priority: number }>>();

  for (const edge of edges) {
    incomingCount.set(edge.targetNodeId, (incomingCount.get(edge.targetNodeId) ?? 0) + 1);
    const current = outgoingMap.get(edge.sourceNodeId) ?? [];
    current.push(edge);
    outgoingMap.set(edge.sourceNodeId, current);
  }

  const queue = nodes
    .filter((node) => (incomingCount.get(node.id) ?? 0) === 0)
    .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
  const ordered: typeof nodes = [];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      break;
    }

    ordered.push(current);

    const outgoingEdges = (outgoingMap.get(current.id) ?? []).sort((left, right) => left.priority - right.priority);

    for (const edge of outgoingEdges) {
      const nextIncoming = (incomingCount.get(edge.targetNodeId) ?? 0) - 1;
      incomingCount.set(edge.targetNodeId, nextIncoming);

      if (nextIncoming === 0) {
        const nextNode = nodeMap.get(edge.targetNodeId);

        if (nextNode) {
          queue.push(nextNode);
          queue.sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
        }
      }
    }
  }

  if (ordered.length !== nodes.length) {
    throw new ApiError(409, "NODE_GRAPH_INVALID", "当前选中节点之间存在非法依赖，无法执行批量运行。");
  }

  return ordered;
}

async function buildExecutionPayload(
  node: Awaited<ReturnType<typeof assertNodeForRun>>,
  upstreamNodes: Awaited<ReturnType<typeof getUpstreamNodes>>,
  referenceAssets: Awaited<ReturnType<typeof getNodeReferenceAssets>>,
  input: z.infer<typeof runNodeInputSchema>,
) {
  for (const upstreamNode of upstreamNodes) {
    if (upstreamNode.status === "failed") {
      throw new ApiError(409, "UPSTREAM_NODE_FAILED", "An upstream node has failed and blocks execution.");
    }
  }

  const upstreamReferenceAssetMap = await getNodeReferenceAssetMap(input.workspaceId, upstreamNodes);
  const upstreamOutputs = upstreamNodes
    .map((upstreamNode) => {
      const fallbackReferenceImageUrl = upstreamReferenceAssetMap.get(upstreamNode.id)?.[0]?.fileUrl;

      return {
        nodeId: upstreamNode.id,
        type: upstreamNode.type,
        title: upstreamNode.title,
        content: normalizeOutputContent(upstreamNode.outputSnapshot as Record<string, unknown> | null),
        outputSnapshot: upstreamNode.outputSnapshot,
        status: upstreamNode.status,
        imageUrl:
          extractImageSourceFromSnapshot(upstreamNode.outputSnapshot as Record<string, unknown> | null) ?? fallbackReferenceImageUrl,
      };
    })
    .filter((item) => item.content || item.outputSnapshot || item.imageUrl);
  const promptUpstreamOutputs = upstreamOutputs.filter(
    (output) => resolveUpstreamSemantic(output.type, node.type) === "prompt",
  );
  const referenceImageUpstreamOutputs = upstreamOutputs.filter(
    (output) => resolveUpstreamSemantic(output.type, node.type) === "reference_image",
  );

  const promptSegments = [node.promptInput?.trim() ?? ""];

  if (input.useUpstreamOutputs) {
    promptSegments.push(
      ...promptUpstreamOutputs
        .map((output) => output.content)
        .filter((content): content is string => Boolean(content)),
    );
  }

  const mergedSettings = {
    ...(node.settingsJson as Record<string, unknown>),
    ...input.overrideSettings,
  };
  const referenceAssetMap = new Map(referenceAssets.map((asset) => [asset.id, asset.fileUrl]));
  const firstFrameAssetId =
    typeof mergedSettings.firstFrameAssetId === "string" && mergedSettings.firstFrameAssetId.trim().length > 0
      ? mergedSettings.firstFrameAssetId
      : undefined;
  const lastFrameAssetId =
    typeof mergedSettings.lastFrameAssetId === "string" && mergedSettings.lastFrameAssetId.trim().length > 0
      ? mergedSettings.lastFrameAssetId
      : undefined;
  const explicitReferenceAssetIds = uniqueStrings(
    ((mergedSettings.referenceAssetIds as unknown[]) ?? []).filter(
      (assetId): assetId is string => typeof assetId === "string",
    ),
  );
  const managedVideoAssetIds = uniqueStrings([
    ...(firstFrameAssetId ? [firstFrameAssetId] : []),
    ...(lastFrameAssetId ? [lastFrameAssetId] : []),
    ...explicitReferenceAssetIds,
  ]);
  const explicitReferenceImages = explicitReferenceAssetIds
    .map((assetId) => referenceAssetMap.get(assetId))
    .filter((fileUrl): fileUrl is string => Boolean(fileUrl));
  const unassignedReferenceImages = referenceAssets
    .filter((asset) => !managedVideoAssetIds.includes(asset.id))
    .map((asset) => asset.fileUrl);
  const referenceImages = uniqueStrings([
    ...(node.type === "video" ? [...explicitReferenceImages, ...unassignedReferenceImages] : referenceAssets.map((asset) => asset.fileUrl)),
    ...referenceImageUpstreamOutputs
      .map((output) => output.imageUrl)
      .filter((imageUrl): imageUrl is string => Boolean(imageUrl)),
    ...(((mergedSettings.referenceImages as unknown[]) ?? []).filter(
      (imageUrl): imageUrl is string => typeof imageUrl === "string",
    )),
  ]);
  const firstFrameImageUrl =
    (firstFrameAssetId ? referenceAssetMap.get(firstFrameAssetId) : undefined) ??
    (node.type === "video" ? referenceImages[0] : undefined);
  const lastFrameImageUrl = lastFrameAssetId ? referenceAssetMap.get(lastFrameAssetId) : undefined;
  const shotPrompts = uniqueStrings(
    ((mergedSettings.shotPrompts as unknown[]) ?? []).filter((item): item is string => typeof item === "string"),
  );

  return {
    workspaceId: input.workspaceId,
    canvasId: input.canvasId,
    nodeId: input.nodeId,
    requestId: input.requestId,
    taskType: node.type,
    provider: "internal",
    model: node.modelKey ?? "unassigned",
    prompt: promptSegments.filter(Boolean).join("\n\n"),
    settings: {
      ...mergedSettings,
      referenceImages,
      ...(node.type === "video"
        ? {
            firstFrameImageUrl,
            lastFrameImageUrl,
            imageUrl: firstFrameImageUrl,
            shotPrompts,
          }
        : {}),
    },
    referenceImages,
    referenceAssets,
    upstreamNodeIds: upstreamNodes.map((upstreamNode) => upstreamNode.id),
    upstreamOutputs,
    useUpstreamOutputs: input.useUpstreamOutputs,
    mergeStrategy: input.mergeStrategy,
  };
}

function getNextPollAt(delaySeconds = 10) {
  return new Date(Date.now() + delaySeconds * 1000);
}

async function refreshNodeRunBatchSummary(batchRunId: string) {
  const batchNodeRuns = await db
    .select({
      status: nodeRuns.status,
    })
    .from(nodeRuns)
    .where(eq(nodeRuns.batchRunId, batchRunId));

  const totalNodeRunCount = batchNodeRuns.length;
  const completedNodeRunCount = batchNodeRuns.filter((item) => item.status === "succeeded" || item.status === "failed").length;
  const succeededNodeRunCount = batchNodeRuns.filter((item) => item.status === "succeeded").length;
  const failedNodeRunCount = batchNodeRuns.filter((item) => item.status === "failed").length;
  const status =
    totalNodeRunCount === 0 || completedNodeRunCount < totalNodeRunCount
      ? "processing"
      : failedNodeRunCount === 0
        ? "succeeded"
        : succeededNodeRunCount === 0
          ? "failed"
          : "partial_failed";

  await db
    .update(nodeRunBatches)
    .set({
      status,
      totalNodeRunCount,
      completedNodeRunCount,
      succeededNodeRunCount,
      failedNodeRunCount,
      updatedAt: new Date(),
    })
    .where(eq(nodeRunBatches.id, batchRunId));
}

async function updateNodeRunRecord(
  nodeRunId: string | null | undefined,
  payload: Partial<{
    taskId: string | null;
    status: string;
    resultType: string | null;
    contentText: string | null;
    assetId: string | null;
    resultMeta: Record<string, unknown>;
    errorCode: string | null;
    errorMessage: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
  }>,
) {
  if (!nodeRunId) {
    return;
  }

  await db
    .update(nodeRuns)
    .set({
      taskId: payload.taskId,
      status: payload.status,
      resultType: payload.resultType,
      contentText: payload.contentText,
      assetId: payload.assetId,
      resultMeta: payload.resultMeta,
      errorCode: payload.errorCode,
      errorMessage: payload.errorMessage,
      startedAt: payload.startedAt,
      finishedAt: payload.finishedAt,
      updatedAt: new Date(),
    })
    .where(eq(nodeRuns.id, nodeRunId));

  const [record] = await db
    .select({
      batchRunId: nodeRuns.batchRunId,
    })
    .from(nodeRuns)
    .where(eq(nodeRuns.id, nodeRunId))
    .limit(1);

  if (record?.batchRunId) {
    await refreshNodeRunBatchSummary(record.batchRunId);
  }
}

async function persistTaskFailure(taskId: string, nodeId: string, code: string, message: string) {
  const finishedAt = new Date();
  const [task] = await db
    .select({
      nodeRunId: generationTasks.nodeRunId,
    })
    .from(generationTasks)
    .where(eq(generationTasks.id, taskId))
    .limit(1);

  await db.transaction(async (tx) => {
    await tx
      .update(generationTasks)
      .set({
        status: "failed",
        errorCode: code,
        errorMessage: message,
        finishedAt,
        updatedAt: finishedAt,
      })
      .where(eq(generationTasks.id, taskId));

    await tx
      .update(canvasNodes)
      .set({
        status: "failed",
        updatedAt: finishedAt,
      })
      .where(eq(canvasNodes.id, nodeId));
  });

  await updateNodeRunRecord(task?.nodeRunId, {
    status: "failed",
    resultType: null,
    contentText: null,
    assetId: null,
    resultMeta: {},
    errorCode: code,
    errorMessage: message,
    finishedAt,
  });
}

async function getTaskRecord(taskId: string) {
  const [task] = await db
    .select()
    .from(generationTasks)
    .where(eq(generationTasks.id, taskId))
    .limit(1);

  if (!task) {
    throw new ApiError(404, "TASK_NOT_FOUND", "Task not found.");
  }

  return task;
}

async function getTaskNode(taskId: string, nodeId: string) {
  const [node] = await db
    .select()
    .from(canvasNodes)
    .where(eq(canvasNodes.id, nodeId))
    .limit(1);

  if (!node) {
    throw new ApiError(404, "NODE_NOT_FOUND", "Canvas node not found.");
  }

  return node;
}

function assertTaskBelongsToWorkspace(task: Awaited<ReturnType<typeof getTaskRecord>>, workspaceId: string) {
  if (task.workspaceId !== workspaceId) {
    throw new ApiError(404, "TASK_NOT_FOUND", "Task not found.");
  }
}

async function executeTask(taskId: string) {
  const task = await getTaskRecord(taskId);
  const node = await getTaskNode(taskId, task.nodeId as string);
  const startedAt = new Date();

  await db
    .update(generationTasks)
    .set({
      status: "processing",
      startedAt,
      updatedAt: startedAt,
    })
    .where(eq(generationTasks.id, taskId));

  await db
    .update(canvasNodes)
    .set({
      status: "processing",
      updatedAt: new Date(),
    })
    .where(eq(canvasNodes.id, node.id));

  await updateNodeRunRecord(task.nodeRunId, {
    taskId: task.id,
    status: "processing",
    startedAt,
    errorCode: null,
    errorMessage: null,
  });

  try {
    const requestPayload = task.requestPayload as Record<string, unknown>;
    const settings =
      requestPayload.settings && typeof requestPayload.settings === "object"
        ? (requestPayload.settings as Record<string, unknown>)
        : {};
    const prompt = typeof requestPayload.prompt === "string" ? requestPayload.prompt : "";
    const referenceImages = Array.isArray(requestPayload.referenceImages)
      ? requestPayload.referenceImages.filter((imageUrl): imageUrl is string => typeof imageUrl === "string" && imageUrl.trim().length > 0)
      : [];

    if (task.taskType === "text" || task.taskType === "storyboard") {
      const isStoryboardTask = task.taskType === "storyboard";
      const generationPrompt = isStoryboardTask ? buildStoryboardGenerationPrompt(prompt, settings) : prompt;
      const output = await generateTextWithCloubic({
        prompt: generationPrompt,
        model: task.model === "unassigned" ? undefined : task.model,
        settings: isStoryboardTask
          ? {
              ...settings,
              responseFormat: "json",
              systemPrompt: STORYBOARD_SYSTEM_PROMPT,
            }
          : settings,
      });
      const structuredData = tryParseStructuredData(output.content);
      const finishedAt = new Date();
      const outputSnapshot = {
        taskId: task.id,
        outputType: isStoryboardTask ? "json" : "text",
        content: output.content,
        structuredData,
        generatedAt: finishedAt.toISOString(),
      };

      await db.transaction(async (tx) => {
        await tx.insert(taskResults).values({
          taskId: task.id,
          workspaceId: task.workspaceId,
          resultType: isStoryboardTask ? "json" : "text",
          contentText: output.content,
          meta: {
            provider: output.provider,
            model: output.model,
            usage: output.usage,
            outputType: isStoryboardTask ? "storyboard" : "text",
          },
        });

        await tx
          .update(generationTasks)
          .set({
            status: "succeeded",
            provider: output.provider,
            model: output.model,
            responsePayload: {
              content: output.content,
              structuredData,
              usage: output.usage,
              rawResponse: output.rawResponse,
            },
            errorCode: null,
            errorMessage: null,
            finishedAt,
            updatedAt: finishedAt,
          })
          .where(eq(generationTasks.id, task.id));

        await tx
          .update(canvasNodes)
          .set({
            status: "succeeded",
            outputSnapshot,
            updatedAt: finishedAt,
          })
          .where(eq(canvasNodes.id, node.id));
      });

      await updateNodeRunRecord(task.nodeRunId, {
        taskId: task.id,
        status: "succeeded",
        resultType: isStoryboardTask ? "json" : "text",
        contentText: output.content,
        assetId: null,
        resultMeta: {
          provider: output.provider,
          model: output.model,
          usage: output.usage,
          structuredData,
          outputType: isStoryboardTask ? "storyboard" : "text",
        },
        errorCode: null,
        errorMessage: null,
        finishedAt,
      });

      return;
    }

    if (task.taskType === "image") {
      console.info("[canvas-image] request prepared", {
        workspaceId: task.workspaceId,
        canvasId: task.canvasId,
        taskId: task.id,
        nodeId: node.id,
        nodeTitle: node.title,
        model: task.model === "unassigned" ? null : task.model,
        promptPreview: prompt.slice(0, 800),
        promptLength: prompt.length,
        referenceImageCount: referenceImages.length,
        referenceImagesPreview: referenceImages.slice(0, 3),
      });

      const output = await generateImageWithCloubic({
        prompt,
        model: task.model === "unassigned" ? undefined : task.model,
        settings,
        referenceImages,
      });
      const imageSourceType = output.dataUri ? "data_uri" : output.imageUrl ? "remote_url" : "markdown_only";

      console.info("[canvas-image] provider output ready", {
        workspaceId: task.workspaceId,
        canvasId: task.canvasId,
        taskId: task.id,
        nodeId: node.id,
        nodeTitle: node.title,
        provider: output.provider,
        model: output.model,
        sourceType: imageSourceType,
        hasDataUri: Boolean(output.dataUri),
        hasImageUrl: Boolean(output.imageUrl),
        contentPreview: output.markdown.slice(0, 400),
      });

      const generatedAsset = await createGeneratedAsset({
        workspaceId: task.workspaceId,
        ownerType: "canvas_node",
        ownerId: node.id,
        fileName: `${node.title || "image-node"}-${Date.now()}`,
        sourceUrl: output.imageUrl,
        dataUri: output.dataUri,
        meta: {
          provider: output.provider,
          model: output.model,
          taskId: task.id,
          canvasId: task.canvasId,
          nodeId: node.id,
          referenceImages,
        },
      });

      console.info("[canvas-image] asset stored", {
        workspaceId: task.workspaceId,
        canvasId: task.canvasId,
        taskId: task.id,
        nodeId: node.id,
        assetId: generatedAsset.id,
        storageKey: generatedAsset.storageKey,
        fileUrl: generatedAsset.fileUrl,
        mimeType: generatedAsset.mimeType,
      });

      const finishedAt = new Date();
      const outputSnapshot = {
        taskId: task.id,
        outputType: "image",
        content: generatedAsset.fileUrl,
        assets: [
          {
            assetId: generatedAsset.id,
            assetType: "image",
            url: generatedAsset.fileUrl,
            mimeType: generatedAsset.mimeType ?? undefined,
          },
        ],
        structuredData: {
          markdown: output.markdown,
          dataUri: output.dataUri,
          imageUrl: generatedAsset.fileUrl,
          sourceImageUrl: output.imageUrl,
          assetId: generatedAsset.id,
          storageKey: generatedAsset.storageKey,
          referenceImages,
        },
        generatedAt: finishedAt.toISOString(),
      };

      await db.transaction(async (tx) => {
        await tx.insert(taskResults).values({
          taskId: task.id,
          workspaceId: task.workspaceId,
          resultType: "image",
          contentText: output.markdown,
          assetId: generatedAsset.id,
          meta: {
            provider: output.provider,
            model: output.model,
            usage: output.usage,
            dataUri: output.dataUri,
            imageUrl: generatedAsset.fileUrl,
            sourceImageUrl: output.imageUrl,
            assetId: generatedAsset.id,
            storageKey: generatedAsset.storageKey,
            referenceImages,
          },
        });

        await tx
          .update(generationTasks)
          .set({
            status: "succeeded",
            provider: output.provider,
            model: output.model,
            responsePayload: {
              content: output.markdown,
              dataUri: output.dataUri,
              imageUrl: generatedAsset.fileUrl,
              sourceImageUrl: output.imageUrl,
              assetId: generatedAsset.id,
              storageKey: generatedAsset.storageKey,
              referenceImages,
              usage: output.usage,
              rawResponse: output.rawResponse,
            },
            errorCode: null,
            errorMessage: null,
            finishedAt,
            updatedAt: finishedAt,
          })
          .where(eq(generationTasks.id, task.id));

        await tx
          .update(canvasNodes)
          .set({
            status: "succeeded",
            outputSnapshot,
            updatedAt: finishedAt,
          })
          .where(eq(canvasNodes.id, node.id));
      });

      await updateNodeRunRecord(task.nodeRunId, {
        taskId: task.id,
        status: "succeeded",
        resultType: "image",
        contentText: output.markdown,
        assetId: generatedAsset.id,
        resultMeta: {
          provider: output.provider,
          model: output.model,
          usage: output.usage,
          imageUrl: generatedAsset.fileUrl,
          sourceImageUrl: output.imageUrl,
          assetId: generatedAsset.id,
          storageKey: generatedAsset.storageKey,
          referenceImages,
        },
        errorCode: null,
        errorMessage: null,
        finishedAt,
      });

      return;
    }

    if (task.taskType === "video") {
      const normalizedSettings = settings as Record<string, unknown>;

      console.info("[canvas-video] request prepared", {
        workspaceId: task.workspaceId,
        canvasId: task.canvasId,
        taskId: task.id,
        nodeId: node.id,
        nodeTitle: node.title,
        model: task.model === "unassigned" ? null : task.model,
        promptPreview: prompt.slice(0, 800),
        promptLength: prompt.length,
        generationMode: normalizedSettings.generationMode ?? "reference",
        firstFrameImageUrl:
          typeof normalizedSettings.firstFrameImageUrl === "string" ? normalizedSettings.firstFrameImageUrl : null,
        lastFrameImageUrl:
          typeof normalizedSettings.lastFrameImageUrl === "string" ? normalizedSettings.lastFrameImageUrl : null,
        referenceImageCount: referenceImages.length,
        referenceImagesPreview: referenceImages.slice(0, 5),
      });

      const output = await generateVideoWithCloubic({
        prompt,
        model: task.model === "unassigned" ? undefined : task.model,
        settings,
      });

      console.info("[canvas-video] provider task accepted", {
        workspaceId: task.workspaceId,
        canvasId: task.canvasId,
        taskId: task.id,
        nodeId: node.id,
        provider: output.provider,
        model: output.model,
        providerTaskId: output.providerTaskId,
        status: output.status,
      });

      const updatedAt = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(generationTasks)
          .set({
            status: output.status === "failed" ? "failed" : "processing",
            provider: output.provider,
            model: output.model,
            providerTaskId: output.providerTaskId,
            responsePayload: {
              submission: output.rawResponse,
            },
            errorCode: output.status === "failed" ? "VIDEO_SUBMIT_FAILED" : null,
            errorMessage: output.status === "failed" ? "Video submission failed." : null,
            nextPollAt: output.status === "failed" ? null : getNextPollAt(),
            updatedAt,
            finishedAt: output.status === "failed" ? updatedAt : null,
          })
          .where(eq(generationTasks.id, task.id));

        await tx
          .update(canvasNodes)
          .set({
            status: output.status === "failed" ? "failed" : "processing",
            updatedAt,
          })
          .where(eq(canvasNodes.id, node.id));
      });

      await updateNodeRunRecord(task.nodeRunId, {
        taskId: task.id,
        status: output.status === "failed" ? "failed" : "processing",
        resultType: null,
        contentText: null,
        assetId: null,
        resultMeta: {
          provider: output.provider,
          model: output.model,
          providerTaskId: output.providerTaskId,
          submission: output.rawResponse,
        },
        errorCode: output.status === "failed" ? "VIDEO_SUBMIT_FAILED" : null,
        errorMessage: output.status === "failed" ? "Video submission failed." : null,
        finishedAt: output.status === "failed" ? updatedAt : null,
      });

      return;
    }

    throw new ApiError(501, "TASK_TYPE_NOT_IMPLEMENTED", `Task type ${task.taskType} is not implemented yet.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown task execution error.";
    const code = error instanceof ApiError ? error.code : "TASK_EXECUTION_FAILED";

    console.error("[task-execution] failed", {
      workspaceId: task.workspaceId,
      canvasId: task.canvasId,
      taskId: task.id,
      nodeId: node.id,
      taskType: task.taskType,
      code,
      message,
    });

    await persistTaskFailure(task.id, node.id, code, message);
  }
}

export async function runNode(input: z.infer<typeof runNodeInputSchema>) {
  const parsed = runNodeInputSchema.parse(input);
  const existingTask = await db
    .select()
    .from(generationTasks)
    .where(
      and(
        eq(generationTasks.workspaceId, parsed.workspaceId),
        eq(generationTasks.requestId, parsed.requestId),
      ),
    )
    .limit(1);

  if (existingTask.length > 0) {
    return {
      taskId: existingTask[0].id,
      status: existingTask[0].status,
      requestId: existingTask[0].requestId,
      batchRunId: existingTask[0].batchRunId,
    };
  }

  const node = await assertNodeForRun(parsed.workspaceId, parsed.canvasId, parsed.nodeId);
  const incomingEdges = await getIncomingEdges(parsed.workspaceId, parsed.canvasId, parsed.nodeId);
  const upstreamNodeIds = await resolveSelectedUpstreamNodeIds(parsed, incomingEdges);
  const upstreamNodes = await getUpstreamNodes(parsed.workspaceId, parsed.canvasId, upstreamNodeIds);
  const referenceAssets = await getNodeReferenceAssets(node);
  const requestPayload = await buildExecutionPayload(node, upstreamNodes, referenceAssets, parsed);

  const createdTask = await db.transaction(async (tx) => {
    const [nodeRun] = await tx
      .insert(nodeRuns)
      .values({
        workspaceId: parsed.workspaceId,
        canvasId: parsed.canvasId,
        nodeId: parsed.nodeId,
        batchRunId: parsed.batchRunId ?? null,
        requestId: parsed.requestId,
        runIndex: parsed.batchRunIndex ?? null,
        nodeType: node.type,
        nodeTitle: node.title,
        status: "queued",
      })
      .returning();
    const [task] = await tx
      .insert(generationTasks)
      .values({
        workspaceId: parsed.workspaceId,
        canvasId: parsed.canvasId,
        nodeId: parsed.nodeId,
        nodeRunId: nodeRun.id,
        batchRunId: parsed.batchRunId ?? null,
        batchRunIndex: parsed.batchRunIndex ?? null,
        requestId: parsed.requestId,
        taskType: node.type,
        provider: "internal",
        model: node.modelKey ?? "unassigned",
        status: "queued",
        requestPayload,
        retryCount: 0,
        pollCount: 0,
      })
      .returning();

    await tx
      .update(canvasNodes)
      .set({
        status: "queued",
        updatedAt: new Date(),
      })
      .where(eq(canvasNodes.id, parsed.nodeId));

    return {
      taskId: task.id,
      status: task.status,
      requestId: task.requestId,
      batchRunId: task.batchRunId,
    };
  });

  await executeTask(createdTask.taskId);

  const [latestTask] = await db
    .select()
    .from(generationTasks)
    .where(eq(generationTasks.id, createdTask.taskId))
    .limit(1);

  if (!latestTask) {
    return createdTask;
  }

  return {
    taskId: latestTask.id,
    status: latestTask.status,
    requestId: latestTask.requestId,
    batchRunId: latestTask.batchRunId,
  };
}

export async function runLibraryItemImageGeneration(
  input: z.infer<typeof runLibraryItemImageGenerationInputSchema>,
) {
  const parsed = runLibraryItemImageGenerationInputSchema.parse(input);
  const existingTask = await db
    .select()
    .from(generationTasks)
    .where(and(eq(generationTasks.workspaceId, parsed.workspaceId), eq(generationTasks.requestId, parsed.requestId)))
    .limit(1);

  if (existingTask.length > 0) {
    const existingResults = await db
      .select()
      .from(taskResults)
      .where(and(eq(taskResults.taskId, existingTask[0].id), eq(taskResults.workspaceId, parsed.workspaceId)))
      .orderBy(desc(taskResults.createdAt));

    return {
      taskId: existingTask[0].id,
      status: existingTask[0].status,
      assetId: existingResults[0]?.assetId ?? null,
    };
  }

  const item = await assertLibraryItemForGeneration(parsed.workspaceId, parsed.itemId, parsed.itemKind);
  const instructionPreset = await resolveInstructionPresetForGeneration(
    parsed.workspaceId,
    parsed.actorUserId,
    parsed.instructionPresetId,
  );
  const referenceAssets = await resolveLibraryReferenceAssets({
    workspaceId: parsed.workspaceId,
    itemId: parsed.itemId,
    referenceAssetIds: parsed.referenceAssetIds,
  });

  if (parsed.mode === "image_to_image" && referenceAssets.length === 0) {
    throw new ApiError(400, "REFERENCE_IMAGES_REQUIRED", "图生图至少需要一张参考图。");
  }

  const referenceImages = parsed.mode === "image_to_image" ? referenceAssets.map((asset) => asset.fileUrl) : [];
  const prompt = buildLibraryItemGenerationPrompt({
    item,
    instructionPreset,
    prompt: parsed.prompt,
  });

  if (!prompt.trim()) {
    throw new ApiError(400, "PROMPT_REQUIRED", "请先填写提示词或选择预制指令。");
  }

  const queuedAt = new Date();
  const requestPayload = {
    ownerType: "library_item",
    ownerId: item.id,
    mode: parsed.mode,
    instructionPresetId: instructionPreset?.id ?? null,
    prompt,
    referenceAssetIds: referenceAssets.map((asset) => asset.id),
    referenceImages,
  };

  const [task] = await db
    .insert(generationTasks)
    .values({
      workspaceId: parsed.workspaceId,
      canvasId: null,
      nodeId: null,
      requestId: parsed.requestId,
      taskType: "image",
      provider: "internal",
      model: env.cloubicImageModel,
      status: "processing",
      requestPayload,
      retryCount: 0,
      pollCount: 0,
      startedAt: queuedAt,
      updatedAt: queuedAt,
    })
    .returning();

  try {
    const output = await generateImageWithCloubic({
      prompt,
      model: env.cloubicImageModel,
      settings: {
        mode: parsed.mode,
        instructionPresetId: instructionPreset?.id ?? null,
      },
      referenceImages,
    });
    const generatedAsset = await createGeneratedAsset({
      workspaceId: parsed.workspaceId,
      ownerType: "library_item",
      ownerId: item.id,
      fileName: `${item.name}-${Date.now()}`,
      sourceUrl: output.imageUrl,
      dataUri: output.dataUri,
      meta: {
        provider: output.provider,
        model: output.model,
        instructionPresetId: instructionPreset?.id ?? null,
        generationMode: parsed.mode,
      },
    });
    const finishedAt = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(taskResults).values({
        taskId: task.id,
        workspaceId: parsed.workspaceId,
        resultType: "image",
        contentText: output.markdown,
        assetId: generatedAsset.id,
        meta: {
          provider: output.provider,
          model: output.model,
          imageUrl: generatedAsset.fileUrl,
          referenceImages,
        },
      });

      await tx
        .update(generationTasks)
        .set({
          status: "succeeded",
          provider: output.provider,
          model: output.model,
          responsePayload: {
            markdown: output.markdown,
            imageUrl: generatedAsset.fileUrl,
            sourceImageUrl: output.imageUrl,
            referenceImages,
            usage: output.usage,
            rawResponse: output.rawResponse,
          },
          errorCode: null,
          errorMessage: null,
          finishedAt,
          updatedAt: finishedAt,
        })
        .where(eq(generationTasks.id, task.id));

      await tx
        .update(libraryItems)
        .set({
          coverAssetId: generatedAsset.id,
          updatedAt: finishedAt,
        })
        .where(eq(libraryItems.id, item.id));
    });

    await updateNodeRunRecord(task.nodeRunId, {
      taskId: task.id,
      status: "succeeded",
      resultType: "image",
      contentText: output.markdown,
      assetId: generatedAsset.id,
      resultMeta: {
        provider: output.provider,
        model: output.model,
        usage: output.usage,
        imageUrl: generatedAsset.fileUrl,
        sourceImageUrl: output.imageUrl,
        assetId: generatedAsset.id,
        storageKey: generatedAsset.storageKey,
        referenceImages,
      },
      errorCode: null,
      errorMessage: null,
      finishedAt,
    });

    return {
      taskId: task.id,
      status: "succeeded" as const,
      assetId: generatedAsset.id,
      asset: generatedAsset,
    };
  } catch (error) {
    const finishedAt = new Date();

    await db
      .update(generationTasks)
      .set({
        status: "failed",
        errorCode: error instanceof ApiError ? error.code : "IMAGE_GENERATION_FAILED",
        errorMessage: error instanceof Error ? error.message : "图片生成失败。",
        finishedAt,
        updatedAt: finishedAt,
      })
      .where(eq(generationTasks.id, task.id));

    throw error;
  }
}

export async function getTask(input: z.infer<typeof getTaskInputSchema>) {
  const parsed = getTaskInputSchema.parse(input);

  const [task] = await db
    .select()
    .from(generationTasks)
    .where(
      and(
        eq(generationTasks.id, parsed.taskId),
        eq(generationTasks.workspaceId, parsed.workspaceId),
      ),
    )
    .limit(1);

  if (!task) {
    throw new ApiError(404, "TASK_NOT_FOUND", "Task not found.");
  }

  const results = await db
    .select()
    .from(taskResults)
    .where(
      and(
        eq(taskResults.taskId, parsed.taskId),
        eq(taskResults.workspaceId, parsed.workspaceId),
      ),
    )
    .orderBy(desc(taskResults.createdAt));

  return {
    ...task,
    results,
  };
}

export async function getTaskStatus(input: z.infer<typeof getTaskInputSchema>) {
  const task = await getTask(input);

  return {
    task_id: task.id,
    status: task.status,
    provider_task_id: task.providerTaskId,
    poll_count: task.pollCount,
    next_poll_at: task.nextPollAt,
    error: task.errorMessage
      ? {
          code: task.errorCode,
          message: task.errorMessage,
        }
      : null,
    result: task.results,
  };
}

export async function pollTask(input: z.infer<typeof pollTaskInputSchema>) {
  const parsed = pollTaskInputSchema.parse(input);
  const task = await getTaskRecord(parsed.taskId);

  assertTaskBelongsToWorkspace(task, parsed.workspaceId);

  const node = await getTaskNode(task.id, task.nodeId as string);

  if (task.taskType !== "video") {
    throw new ApiError(400, "TASK_POLL_UNSUPPORTED", "Polling is currently supported for video tasks only.");
  }

  if (!task.providerTaskId) {
    throw new ApiError(409, "PROVIDER_TASK_ID_MISSING", "Video task has not been submitted to provider yet.");
  }

  const providerStatus = await getVideoStatusWithCloubic(task.providerTaskId);
  const pollCount = (task.pollCount ?? 0) + 1;

  if (providerStatus.status === "completed") {
    const finishedAt = new Date();
    const outputSnapshot = {
      taskId: task.id,
      outputType: "video",
      content: providerStatus.videoUrl ?? "",
      structuredData: {
        videoUrl: providerStatus.videoUrl,
        progress: providerStatus.progress,
      },
      generatedAt: finishedAt.toISOString(),
    };

    await db.transaction(async (tx) => {
      await tx.insert(taskResults).values({
        taskId: task.id,
        workspaceId: task.workspaceId,
        resultType: "video",
        contentText: providerStatus.videoUrl,
        meta: {
          provider: providerStatus.provider,
          providerTaskId: providerStatus.providerTaskId,
          progress: providerStatus.progress,
        },
      });

      await tx
        .update(generationTasks)
        .set({
          status: "succeeded",
          responsePayload: {
            ...(task.responsePayload as Record<string, unknown> | null),
            poll: providerStatus.rawResponse,
            videoUrl: providerStatus.videoUrl,
            progress: providerStatus.progress,
          },
          pollCount,
          nextPollAt: null,
          finishedAt,
          updatedAt: finishedAt,
          errorCode: null,
          errorMessage: null,
        })
        .where(eq(generationTasks.id, task.id));

      await tx
        .update(canvasNodes)
        .set({
          status: "succeeded",
          outputSnapshot,
          updatedAt: finishedAt,
        })
        .where(eq(canvasNodes.id, node.id));
    });

    return {
      taskId: task.id,
      status: "succeeded" as const,
      providerTaskId: task.providerTaskId,
      nextPollAt: null,
    };
  }

  if (providerStatus.status === "failed") {
    await persistTaskFailure(task.id, node.id, "VIDEO_TASK_FAILED", "Video generation failed.");

    return {
      taskId: task.id,
      status: "failed" as const,
      providerTaskId: task.providerTaskId,
      nextPollAt: null,
    };
  }

  const updatedAt = new Date();
  const nextPollAt = getNextPollAt();

  await db.transaction(async (tx) => {
    await tx
      .update(generationTasks)
      .set({
        status: "processing",
        responsePayload: {
          ...(task.responsePayload as Record<string, unknown> | null),
          poll: providerStatus.rawResponse,
          progress: providerStatus.progress,
        },
        pollCount,
        nextPollAt,
        updatedAt,
      })
      .where(eq(generationTasks.id, task.id));

    await tx
      .update(canvasNodes)
      .set({
        status: "processing",
        updatedAt,
      })
      .where(eq(canvasNodes.id, node.id));
  });

  await updateNodeRunRecord(task.nodeRunId, {
    taskId: task.id,
    status: "processing",
    resultType: null,
    contentText: null,
    assetId: null,
    resultMeta: {
      ...(task.responsePayload as Record<string, unknown> | null),
      poll: providerStatus.rawResponse,
      progress: providerStatus.progress,
    },
    errorCode: null,
    errorMessage: null,
  });

  return {
    taskId: task.id,
    status: "processing" as const,
    providerTaskId: task.providerTaskId,
    nextPollAt: nextPollAt.toISOString(),
  };
}

export async function retryTask(input: z.infer<typeof retryTaskInputSchema>) {
  const parsed = retryTaskInputSchema.parse(input);
  const task = await getTaskRecord(parsed.taskId);
  assertTaskBelongsToWorkspace(task, parsed.workspaceId);

  if (task.status === "processing" || task.status === "queued") {
    throw new ApiError(409, "TASK_RETRY_CONFLICT", "Task is already running.");
  }

  if (task.status === "succeeded") {
    throw new ApiError(409, "TASK_RETRY_CONFLICT", "Succeeded task does not need retry.");
  }

  const nodeId = task.nodeId as string | null;

  if (!nodeId) {
    throw new ApiError(409, "TASK_RETRY_CONFLICT", "Task is not bound to a canvas node.");
  }

  await getTaskNode(task.id, nodeId);

  const updatedAt = new Date();

  await db.transaction(async (tx) => {
    await tx
      .delete(taskResults)
      .where(
        and(
          eq(taskResults.taskId, task.id),
          eq(taskResults.workspaceId, task.workspaceId),
        ),
      );

    await tx
      .update(generationTasks)
      .set({
        status: "queued",
        providerTaskId: null,
        responsePayload: null,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        nextPollAt: null,
        pollCount: 0,
        retryCount: (task.retryCount ?? 0) + 1,
        updatedAt,
      })
      .where(eq(generationTasks.id, task.id));

    await tx
      .update(canvasNodes)
      .set({
        status: "queued",
        outputSnapshot: null,
        updatedAt,
      })
      .where(eq(canvasNodes.id, nodeId));
  });

  await updateNodeRunRecord(task.nodeRunId, {
    taskId: task.id,
    status: "queued",
    resultType: null,
    contentText: null,
    assetId: null,
    resultMeta: {},
    errorCode: null,
    errorMessage: null,
    startedAt: null,
    finishedAt: null,
  });

  await executeTask(task.id);

  const latestTask = await getTaskRecord(task.id);

  return {
    taskId: latestTask.id,
    status: latestTask.status,
    retryCount: latestTask.retryCount,
    providerTaskId: latestTask.providerTaskId,
  };
}

export async function listTasks(input: z.infer<typeof listTasksInputSchema>) {
  const parsed = listTasksInputSchema.parse(input);
  const limit = parsed.limit ?? 50;

  return db
    .select({
      id: generationTasks.id,
      requestId: generationTasks.requestId,
      taskType: generationTasks.taskType,
      provider: generationTasks.provider,
      model: generationTasks.model,
      status: generationTasks.status,
      providerTaskId: generationTasks.providerTaskId,
      errorCode: generationTasks.errorCode,
      errorMessage: generationTasks.errorMessage,
      retryCount: generationTasks.retryCount,
      pollCount: generationTasks.pollCount,
      nextPollAt: generationTasks.nextPollAt,
      startedAt: generationTasks.startedAt,
      finishedAt: generationTasks.finishedAt,
      createdAt: generationTasks.createdAt,
      updatedAt: generationTasks.updatedAt,
      canvasId: generationTasks.canvasId,
      nodeId: generationTasks.nodeId,
      nodeTitle: canvasNodes.title,
      canvasName: canvases.name,
    })
    .from(generationTasks)
    .leftJoin(canvasNodes, eq(canvasNodes.id, generationTasks.nodeId))
    .leftJoin(canvases, eq(canvases.id, generationTasks.canvasId))
    .where(
      and(
        eq(generationTasks.workspaceId, parsed.workspaceId),
        parsed.status ? eq(generationTasks.status, parsed.status) : undefined,
        parsed.taskType ? eq(generationTasks.taskType, parsed.taskType) : undefined,
        parsed.canvasId ? eq(generationTasks.canvasId, parsed.canvasId) : undefined,
        parsed.nodeId ? eq(generationTasks.nodeId, parsed.nodeId) : undefined,
      ),
    )
    .orderBy(desc(generationTasks.createdAt))
    .limit(limit);
}

export async function runNodeBatch(input: z.infer<typeof runNodeBatchInputSchema>) {
  const parsed = runNodeBatchInputSchema.parse(input);
  const uniqueNodeIds = uniqueStrings(parsed.nodeIds);
  const selectedNodes = await getCanvasNodesByIds(parsed.workspaceId, parsed.canvasId, uniqueNodeIds);

  if (selectedNodes.length !== uniqueNodeIds.length) {
    throw new ApiError(404, "NODE_NOT_FOUND", "部分选中节点不存在或不属于当前画布。");
  }

  const nodeSummaries = selectedNodes.map((node) => ({
    id: node.id,
    title: node.title,
    type: node.type,
  }));
  const selectedEdges = await getCanvasEdgesForNodes(parsed.workspaceId, parsed.canvasId, uniqueNodeIds);
  const sortedNodes = sortNodesForBatchRun(nodeSummaries, selectedEdges);
  const totalNodeRunCount = sortedNodes.length * parsed.runCount;
  const mode = sortedNodes.length === 1 ? "single_node" : "group";
  const [batchRun] = await db
    .insert(nodeRunBatches)
    .values({
      workspaceId: parsed.workspaceId,
      canvasId: parsed.canvasId,
      createdBy: parsed.actorUserId,
      mode,
      status: "processing",
      requestedRunCount: parsed.runCount,
      totalNodeRunCount,
      selectedNodesJson: sortedNodes,
    })
    .returning();

  const items = [];

  for (let runIndex = 1; runIndex <= parsed.runCount; runIndex += 1) {
    for (const node of sortedNodes) {
      const task = await runNode({
        workspaceId: parsed.workspaceId,
        canvasId: parsed.canvasId,
        nodeId: node.id,
        actorUserId: parsed.actorUserId,
        requestId: createBatchRunRequestId(batchRun.id, runIndex, node.id),
        useUpstreamOutputs: true,
        mergeStrategy: "merge_all",
        overrideSettings: {},
        batchRunId: batchRun.id,
        batchRunIndex: runIndex,
      });

      items.push({
        nodeId: node.id,
        nodeTitle: node.title,
        taskId: task.taskId,
        status: task.status,
        runIndex,
      });
    }
  }

  await refreshNodeRunBatchSummary(batchRun.id);

  const [latestBatchRun] = await db
    .select()
    .from(nodeRunBatches)
    .where(eq(nodeRunBatches.id, batchRun.id))
    .limit(1);

  return {
    id: batchRun.id,
    mode,
    runCount: parsed.runCount,
    nodeCount: sortedNodes.length,
    status: latestBatchRun?.status ?? "processing",
    totalNodeRunCount,
    items,
  };
}

export async function listNodeRunBatches(input: z.infer<typeof listNodeRunBatchesInputSchema>) {
  const parsed = listNodeRunBatchesInputSchema.parse(input);
  const limit = parsed.limit ?? 20;

  return db
    .select()
    .from(nodeRunBatches)
    .where(
      and(
        eq(nodeRunBatches.workspaceId, parsed.workspaceId),
        parsed.canvasId ? eq(nodeRunBatches.canvasId, parsed.canvasId) : undefined,
      ),
    )
    .orderBy(desc(nodeRunBatches.createdAt))
    .limit(limit);
}

export async function getNodeRunBatch(input: z.infer<typeof getNodeRunBatchInputSchema>) {
  const parsed = getNodeRunBatchInputSchema.parse(input);
  const [batchRun] = await db
    .select()
    .from(nodeRunBatches)
    .where(
      and(
        eq(nodeRunBatches.id, parsed.batchRunId),
        eq(nodeRunBatches.workspaceId, parsed.workspaceId),
      ),
    )
    .limit(1);

  if (!batchRun) {
    throw new ApiError(404, "BATCH_RUN_NOT_FOUND", "批量运行记录不存在。");
  }

  const runs = await db
    .select({
      id: nodeRuns.id,
      nodeId: nodeRuns.nodeId,
      taskId: nodeRuns.taskId,
      requestId: nodeRuns.requestId,
      runIndex: nodeRuns.runIndex,
      nodeType: nodeRuns.nodeType,
      nodeTitle: nodeRuns.nodeTitle,
      status: nodeRuns.status,
      resultType: nodeRuns.resultType,
      contentText: nodeRuns.contentText,
      assetId: nodeRuns.assetId,
      resultMeta: nodeRuns.resultMeta,
      errorCode: nodeRuns.errorCode,
      errorMessage: nodeRuns.errorMessage,
      startedAt: nodeRuns.startedAt,
      finishedAt: nodeRuns.finishedAt,
      createdAt: nodeRuns.createdAt,
      assetFileName: assets.fileName,
      assetFileUrl: assets.fileUrl,
      assetMimeType: assets.mimeType,
    })
    .from(nodeRuns)
    .leftJoin(assets, eq(assets.id, nodeRuns.assetId))
    .where(
      and(
        eq(nodeRuns.workspaceId, parsed.workspaceId),
        eq(nodeRuns.batchRunId, parsed.batchRunId),
      ),
    )
    .orderBy(asc(nodeRuns.runIndex), asc(nodeRuns.createdAt));

  return {
    ...batchRun,
    runs,
  };
}

export async function pollDueVideoTasks(input: z.infer<typeof pollDueTasksInputSchema> = {}) {
  const parsed = pollDueTasksInputSchema.parse(input);
  const limit = parsed.limit ?? env.mediaPollBatchSize;
  const now = new Date();
  const dueTasks = await db
    .select({
      id: generationTasks.id,
      workspaceId: generationTasks.workspaceId,
    })
    .from(generationTasks)
    .where(
      and(
        eq(generationTasks.taskType, "video"),
        eq(generationTasks.status, "processing"),
        lte(generationTasks.nextPollAt, now),
      ),
    )
    .orderBy(asc(generationTasks.nextPollAt))
    .limit(limit);

  const results = await Promise.all(
    dueTasks.map(async (task) => {
      try {
        const result = await pollTask({
          workspaceId: task.workspaceId,
          taskId: task.id,
        });

        return {
          taskId: task.id,
          ok: true,
          status: result.status,
          nextPollAt: result.nextPollAt,
        };
      } catch (error) {
        return {
          taskId: task.id,
          ok: false,
          status: "failed",
          nextPollAt: null,
          error: error instanceof Error ? error.message : "Unknown poll error.",
        };
      }
    }),
  );

  return {
    scannedAt: now.toISOString(),
    limit,
    total: dueTasks.length,
    items: results,
  };
}

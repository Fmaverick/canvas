import { readFileSync } from "node:fs";
import path from "node:path";

import { and, asc, desc, eq, inArray, isNull, lte, or } from "drizzle-orm";
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
  existingNodeRunId: z.uuid().optional(),
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

function isTerminalNodeRunStatus(status: string | null | undefined) {
  return status === "succeeded" || status === "failed";
}

function normalizeRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
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
  if (sourceType === "image" && targetType === "storyboard") {
    return "prompt" as const;
  }

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
    "如果上游存在图片节点，请优先使用这些图片节点中的文本描述来提炼稳定人物、场景和关键资产，并写入 suggestedAssetNames 与 suggestedAssets，命名保持一致。",
    `模板文件：${templateFile}`,
    "模板内容：",
    template,
    "创意简报：",
    brief,
  ].join("\n\n");
}

function normalizeNodeResourceRefIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())))
    : [];
}

function normalizeNodeResourceRefs(
  resourceRefs: unknown,
): {
  subjectIds: string[];
  sceneIds: string[];
  instructionPresetIds: string[];
  assetIds: string[];
} {
  const record = resourceRefs && typeof resourceRefs === "object" ? (resourceRefs as Record<string, unknown>) : {};

  return {
    subjectIds: normalizeNodeResourceRefIds(record.subjectIds),
    sceneIds: normalizeNodeResourceRefIds(record.sceneIds),
    instructionPresetIds: normalizeNodeResourceRefIds(record.instructionPresetIds),
    assetIds: normalizeNodeResourceRefIds(record.assetIds),
  };
}

function normalizeVideoReferenceImageLabel(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  const label = path.parse(value).name.replace(/[_-]+/g, " ").trim();

  return label.length > 0 ? label : undefined;
}

function resolveVideoReferenceAssetLabel(
  asset: {
    fileName: string;
    ownerType?: string;
    ownerId?: string;
  },
  libraryItemNameMap: Map<string, string>,
  fallbackContextLabels: string[],
) {
  if (asset.ownerType === "library_item" && asset.ownerId) {
    const ownerLabel = libraryItemNameMap.get(asset.ownerId);

    if (ownerLabel) {
      return ownerLabel;
    }
  }

  if (fallbackContextLabels.length === 1) {
    return fallbackContextLabels[0];
  }

  return normalizeVideoReferenceImageLabel(asset.fileName);
}

function createVideoReferenceOrderMaps(input: {
  subjectIds: string[];
  sceneIds: string[];
  libraryItemNameMap: Map<string, string>;
}) {
  const orderedLibraryItemIds = uniqueStrings([...input.subjectIds, ...input.sceneIds]);
  const libraryItemPriorityMap = new Map(orderedLibraryItemIds.map((id, index) => [id, index]));
  const labelPriorityMap = new Map(
    orderedLibraryItemIds
      .map((id, index) => {
        const label = input.libraryItemNameMap.get(id);

        return label ? [label, index] : null;
      })
      .filter((entry): entry is [string, number] => Boolean(entry)),
  );

  return {
    libraryItemPriorityMap,
    labelPriorityMap,
  };
}

function sortVideoReferenceAssetsByContext<
  T extends {
    ownerType?: string;
    ownerId?: string;
    label?: string;
  },
>(items: T[], orderMaps: ReturnType<typeof createVideoReferenceOrderMaps>) {
  return items
    .map((item, index) => ({
      item,
      index,
      priority:
        item.ownerType === "library_item" && item.ownerId && orderMaps.libraryItemPriorityMap.has(item.ownerId)
          ? (orderMaps.libraryItemPriorityMap.get(item.ownerId) ?? Number.MAX_SAFE_INTEGER)
          : item.label && orderMaps.labelPriorityMap.has(item.label)
            ? (orderMaps.labelPriorityMap.get(item.label) ?? Number.MAX_SAFE_INTEGER)
            : Number.MAX_SAFE_INTEGER,
    }))
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

function buildVideoReferenceImageEntries(input: {
  firstFrameAsset?: { fileUrl: string; fileName: string; label?: string };
  lastFrameAsset?: { fileUrl: string; fileName: string; label?: string };
  explicitReferenceAssets: Array<{ fileUrl: string; fileName: string; label?: string }>;
  unassignedReferenceAssets: Array<{ fileUrl: string; fileName: string; label?: string }>;
  upstreamReferenceImages: Array<{ url: string; label?: string }>;
  mergedReferenceImages: string[];
}) {
  const entries: Array<{ url: string; label?: string }> = [];
  const seen = new Set<string>();

  const appendEntry = (url: string | undefined, label?: string) => {
    if (!url || seen.has(url)) {
      return;
    }

    seen.add(url);
    entries.push({
      url,
      ...(label ? { label } : {}),
    });
  };

  appendEntry(input.firstFrameAsset?.fileUrl, input.firstFrameAsset?.label);

  for (const asset of input.explicitReferenceAssets) {
    appendEntry(asset.fileUrl, asset.label);
  }

  for (const asset of input.unassignedReferenceAssets) {
    appendEntry(asset.fileUrl, asset.label);
  }

  for (const image of input.upstreamReferenceImages) {
    appendEntry(image.url, image.label);
  }

  for (const imageUrl of input.mergedReferenceImages) {
    appendEntry(imageUrl);
  }

  appendEntry(input.lastFrameAsset?.fileUrl, input.lastFrameAsset?.label);

  return entries;
}

async function getUpstreamImagePromptContextMap(
  workspaceId: string,
  nodes: Array<{
    id: string;
    type: string;
    title: string;
    promptInput: string | null;
    resourceRefs: unknown;
  }>,
) {
  const imageNodes = nodes.filter((node) => node.type === "image");

  if (imageNodes.length === 0) {
    return new Map<string, string>();
  }

  const normalizedRefsByNode = new Map(
    imageNodes.map((node) => [node.id, normalizeNodeResourceRefs(node.resourceRefs)]),
  );
  const libraryItemIds = Array.from(
    new Set(
      imageNodes.flatMap((node) => {
        const refs = normalizedRefsByNode.get(node.id);

        return refs ? [...refs.subjectIds, ...refs.sceneIds] : [];
      }),
    ),
  );
  const libraryItemNameMap = new Map<string, string>();

  if (libraryItemIds.length > 0) {
    const libraryItemRecords = await db
      .select({
        id: libraryItems.id,
        name: libraryItems.name,
      })
      .from(libraryItems)
      .where(and(eq(libraryItems.workspaceId, workspaceId), inArray(libraryItems.id, libraryItemIds)));

    for (const record of libraryItemRecords) {
      libraryItemNameMap.set(record.id, record.name);
    }
  }

  return new Map(
    imageNodes.map((node) => {
      const refs = normalizedRefsByNode.get(node.id) ?? {
        subjectIds: [],
        sceneIds: [],
        instructionPresetIds: [],
        assetIds: [],
      };
      const subjectNames = refs.subjectIds
        .map((id) => libraryItemNameMap.get(id))
        .filter((value): value is string => Boolean(value));
      const sceneNames = refs.sceneIds
        .map((id) => libraryItemNameMap.get(id))
        .filter((value): value is string => Boolean(value));
      const summary = [
        node.title.trim().length > 0 ? `图片节点：${node.title.trim()}` : null,
        node.promptInput?.trim() ? `图片描述：${node.promptInput.trim()}` : null,
        subjectNames.length > 0 ? `关联主体：${subjectNames.join("、")}` : null,
        sceneNames.length > 0 ? `关联场景：${sceneNames.join("、")}` : null,
        refs.assetIds.length > 0 ? `关联图片资产数：${refs.assetIds.length}` : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n");

      return [node.id, summary];
    }),
  );
}

function resolveUpstreamPromptContent(
  upstreamNode: {
    type: string;
    title: string;
    promptInput: string | null;
    outputSnapshot: unknown;
  },
  targetType: string,
  imagePromptContext?: string | null,
) {
  if (upstreamNode.type === "image" && targetType === "storyboard") {
    return imagePromptContext?.trim() || upstreamNode.promptInput?.trim() || upstreamNode.title.trim() || null;
  }

  return normalizeOutputContent(upstreamNode.outputSnapshot as Record<string, unknown> | null);
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

function buildOutputSnapshotFromNodeRun(run: {
  taskId: string | null;
  resultType: string | null;
  contentText: string | null;
  assetId: string | null;
  resultMeta: Record<string, unknown> | null;
  assetFileUrl: string | null;
  assetMimeType: string | null;
  finishedAt: Date | null;
}) {
  const resultMeta = normalizeRecord(run.resultMeta);
  const assetFileUrl = typeof run.assetFileUrl === "string" && run.assetFileUrl.trim().length > 0 ? run.assetFileUrl : null;
  const generatedAt = (run.finishedAt ?? new Date()).toISOString();

  if (run.resultType === "image") {
    const imageUrl =
      assetFileUrl ??
      (typeof resultMeta.imageUrl === "string" && resultMeta.imageUrl.trim().length > 0 ? resultMeta.imageUrl : null) ??
      (typeof run.contentText === "string" && run.contentText.trim().length > 0 ? run.contentText : null);

    if (!imageUrl) {
      return null;
    }

    return {
      taskId: run.taskId ?? undefined,
      outputType: "image",
      content: imageUrl,
      assets: run.assetId
        ? [
            {
              assetId: run.assetId,
              assetType: "image",
              url: imageUrl,
              mimeType: run.assetMimeType ?? undefined,
            },
          ]
        : undefined,
      structuredData: {
        ...resultMeta,
        imageUrl,
        assetId: run.assetId ?? resultMeta.assetId ?? undefined,
      },
      generatedAt,
    };
  }

  if (run.resultType === "video") {
    const videoUrl =
      assetFileUrl ??
      (typeof resultMeta.videoUrl === "string" && resultMeta.videoUrl.trim().length > 0 ? resultMeta.videoUrl : null) ??
      (typeof run.contentText === "string" && run.contentText.trim().length > 0 ? run.contentText : null);

    if (!videoUrl) {
      return null;
    }

    return {
      taskId: run.taskId ?? undefined,
      outputType: "video",
      content: videoUrl,
      assets: run.assetId
        ? [
            {
              assetId: run.assetId,
              assetType: "video",
              url: videoUrl,
              mimeType: run.assetMimeType ?? undefined,
            },
          ]
        : undefined,
      structuredData: {
        ...resultMeta,
        videoUrl,
        assetId: run.assetId ?? resultMeta.assetId ?? undefined,
      },
      generatedAt,
    };
  }

  if (run.resultType === "audio") {
    const audioUrl =
      assetFileUrl ??
      (typeof resultMeta.audioUrl === "string" && resultMeta.audioUrl.trim().length > 0 ? resultMeta.audioUrl : null) ??
      (typeof run.contentText === "string" && run.contentText.trim().length > 0 ? run.contentText : null);

    if (!audioUrl) {
      return null;
    }

    return {
      taskId: run.taskId ?? undefined,
      outputType: "audio",
      content: audioUrl,
      assets: run.assetId
        ? [
            {
              assetId: run.assetId,
              assetType: "audio",
              url: audioUrl,
              mimeType: run.assetMimeType ?? undefined,
            },
          ]
        : undefined,
      structuredData: {
        ...resultMeta,
        audioUrl,
        assetId: run.assetId ?? resultMeta.assetId ?? undefined,
      },
      generatedAt,
    };
  }

  if (run.resultType === "json" || run.resultType === "text") {
    const content = typeof run.contentText === "string" ? run.contentText : "";
    const structuredData =
      resultMeta.structuredData && typeof resultMeta.structuredData === "object" && !Array.isArray(resultMeta.structuredData)
        ? (resultMeta.structuredData as Record<string, unknown>)
        : undefined;

    if (content.trim().length === 0 && !structuredData) {
      return null;
    }

    return {
      taskId: run.taskId ?? undefined,
      outputType: run.resultType === "json" ? "json" : "text",
      content,
      structuredData,
      generatedAt,
    };
  }

  return null;
}

async function getUpstreamNodesForExecution(
  input: Pick<
    z.infer<typeof runNodeInputSchema>,
    "workspaceId" | "canvasId" | "batchRunId" | "batchRunIndex"
  >,
  upstreamNodeIds: string[],
) {
  const upstreamNodes = await getUpstreamNodes(input.workspaceId, input.canvasId, upstreamNodeIds);

  if (!input.batchRunId || !input.batchRunIndex || upstreamNodes.length === 0) {
    return upstreamNodes;
  }

  const batchNodeRuns = await db
    .select({
      nodeId: nodeRuns.nodeId,
      taskId: nodeRuns.taskId,
      status: nodeRuns.status,
      resultType: nodeRuns.resultType,
      contentText: nodeRuns.contentText,
      assetId: nodeRuns.assetId,
      resultMeta: nodeRuns.resultMeta,
      errorCode: nodeRuns.errorCode,
      errorMessage: nodeRuns.errorMessage,
      finishedAt: nodeRuns.finishedAt,
      assetFileUrl: assets.fileUrl,
      assetMimeType: assets.mimeType,
    })
    .from(nodeRuns)
    .leftJoin(assets, eq(assets.id, nodeRuns.assetId))
    .where(
      and(
        eq(nodeRuns.workspaceId, input.workspaceId),
        eq(nodeRuns.batchRunId, input.batchRunId),
        eq(nodeRuns.runIndex, input.batchRunIndex),
        inArray(nodeRuns.nodeId, upstreamNodeIds),
      ),
    );

  const batchNodeRunMap = new Map(batchNodeRuns.map((run) => [run.nodeId, run]));

  return upstreamNodes.map((node) => {
    const batchNodeRun = batchNodeRunMap.get(node.id);

    if (!batchNodeRun) {
      return node;
    }

    return {
      ...node,
      status: batchNodeRun.status,
      outputSnapshot: buildOutputSnapshotFromNodeRun(batchNodeRun),
    };
  });
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
      ownerType: assets.ownerType,
      ownerId: assets.ownerId,
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
  upstreamNodes: Awaited<ReturnType<typeof getUpstreamNodesForExecution>>,
  referenceAssets: Awaited<ReturnType<typeof getNodeReferenceAssets>>,
  input: z.infer<typeof runNodeInputSchema>,
) {
  for (const upstreamNode of upstreamNodes) {
    if (upstreamNode.status === "failed") {
      throw new ApiError(409, "UPSTREAM_NODE_FAILED", "An upstream node has failed and blocks execution.");
    }
  }

  const upstreamReferenceAssetMap = await getNodeReferenceAssetMap(input.workspaceId, upstreamNodes);
  const upstreamImagePromptContextMap =
    node.type === "storyboard" ? await getUpstreamImagePromptContextMap(input.workspaceId, upstreamNodes) : new Map<string, string>();
  const upstreamOutputs = upstreamNodes
    .map((upstreamNode) => {
      const fallbackReferenceImageUrl = upstreamReferenceAssetMap.get(upstreamNode.id)?.[0]?.fileUrl;

      return {
        nodeId: upstreamNode.id,
        type: upstreamNode.type,
        title: upstreamNode.title,
        content: resolveUpstreamPromptContent(upstreamNode, node.type, upstreamImagePromptContextMap.get(upstreamNode.id)),
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
  const upstreamReferenceImages = referenceImageUpstreamOutputs.flatMap((output) =>
    output.imageUrl
      ? [
          {
            url: output.imageUrl,
            ...(output.title.trim() ? { label: output.title.trim() } : {}),
          },
        ]
      : [],
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
  const normalizedNodeRefs = normalizeNodeResourceRefs(node.resourceRefs);
  const libraryItemIds = uniqueStrings([
    ...normalizedNodeRefs.subjectIds,
    ...normalizedNodeRefs.sceneIds,
    ...referenceAssets
      .filter((asset) => asset.ownerType === "library_item")
      .map((asset) => asset.ownerId),
  ]);
  const libraryItemNameMap = new Map<string, string>();

  if (libraryItemIds.length > 0) {
    const libraryItemRecords = await db
      .select({
        id: libraryItems.id,
        name: libraryItems.name,
      })
      .from(libraryItems)
      .where(and(eq(libraryItems.workspaceId, input.workspaceId), inArray(libraryItems.id, libraryItemIds)));

    for (const record of libraryItemRecords) {
      libraryItemNameMap.set(record.id, record.name);
    }
  }

  const fallbackContextLabels = uniqueStrings([
    ...normalizedNodeRefs.subjectIds.map((id) => libraryItemNameMap.get(id)).filter((value): value is string => Boolean(value)),
    ...normalizedNodeRefs.sceneIds.map((id) => libraryItemNameMap.get(id)).filter((value): value is string => Boolean(value)),
  ]);
  const referenceOrderMaps = createVideoReferenceOrderMaps({
    subjectIds: normalizedNodeRefs.subjectIds,
    sceneIds: normalizedNodeRefs.sceneIds,
    libraryItemNameMap,
  });
  const referenceAssetMap = new Map(referenceAssets.map((asset) => [asset.id, asset]));
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
  const explicitReferenceImageAssets = explicitReferenceAssetIds
    .map((assetId) => referenceAssetMap.get(assetId))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
  const unassignedReferenceImageAssets = referenceAssets
    .filter((asset) => !managedVideoAssetIds.includes(asset.id))
    .filter((asset) => Boolean(asset.fileUrl));
  const mergedReferenceImages = ((mergedSettings.referenceImages as unknown[]) ?? []).filter(
    (imageUrl): imageUrl is string => typeof imageUrl === "string",
  );
  const referenceImages = uniqueStrings([
    ...(node.type === "video"
      ? [...explicitReferenceImageAssets, ...unassignedReferenceImageAssets].map((asset) => asset.fileUrl)
      : referenceAssets.map((asset) => asset.fileUrl)),
    ...upstreamReferenceImages.map((image) => image.url),
    ...mergedReferenceImages,
  ]);
  const firstFrameAsset = firstFrameAssetId ? referenceAssetMap.get(firstFrameAssetId) : undefined;
  const lastFrameAsset = lastFrameAssetId ? referenceAssetMap.get(lastFrameAssetId) : undefined;
  const firstFrameImageUrl =
    firstFrameAsset?.fileUrl ??
    (node.type === "video" ? referenceImages[0] : undefined);
  const lastFrameImageUrl = lastFrameAsset?.fileUrl;
  const shotPrompts = uniqueStrings(
    ((mergedSettings.shotPrompts as unknown[]) ?? []).filter((item): item is string => typeof item === "string"),
  );
  const labeledFirstFrameAsset = firstFrameAsset
    ? {
        ...firstFrameAsset,
        label: resolveVideoReferenceAssetLabel(firstFrameAsset, libraryItemNameMap, fallbackContextLabels),
      }
    : undefined;
  const labeledLastFrameAsset = lastFrameAsset
    ? {
        ...lastFrameAsset,
        label: resolveVideoReferenceAssetLabel(lastFrameAsset, libraryItemNameMap, fallbackContextLabels),
      }
    : undefined;
  const labeledExplicitReferenceAssets = explicitReferenceImageAssets.map((asset) => ({
    ...asset,
    label: resolveVideoReferenceAssetLabel(asset, libraryItemNameMap, fallbackContextLabels),
  }));
  const labeledUnassignedReferenceAssets = unassignedReferenceImageAssets.map((asset) => ({
    ...asset,
    label: resolveVideoReferenceAssetLabel(asset, libraryItemNameMap, fallbackContextLabels),
  }));
  const orderedExplicitReferenceAssets = sortVideoReferenceAssetsByContext(
    labeledExplicitReferenceAssets,
    referenceOrderMaps,
  );
  const orderedUnassignedReferenceAssets = sortVideoReferenceAssetsByContext(
    labeledUnassignedReferenceAssets,
    referenceOrderMaps,
  );
  const orderedUpstreamReferenceImages = sortVideoReferenceAssetsByContext(upstreamReferenceImages, referenceOrderMaps);
  const referenceImageEntries =
    node.type === "video"
      ? buildVideoReferenceImageEntries({
          firstFrameAsset: labeledFirstFrameAsset,
          lastFrameAsset: labeledLastFrameAsset,
          explicitReferenceAssets: orderedExplicitReferenceAssets,
          unassignedReferenceAssets: orderedUnassignedReferenceAssets,
          upstreamReferenceImages: orderedUpstreamReferenceImages,
          mergedReferenceImages,
        })
      : [];

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
            referenceImageEntries,
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

async function getNodeRunRecord(nodeRunId: string) {
  const [nodeRun] = await db
    .select()
    .from(nodeRuns)
    .where(eq(nodeRuns.id, nodeRunId))
    .limit(1);

  if (!nodeRun) {
    throw new ApiError(404, "NODE_RUN_NOT_FOUND", "节点运行记录不存在。");
  }

  return nodeRun;
}

async function getBatchRunRecord(batchRunId: string) {
  const [batchRun] = await db
    .select()
    .from(nodeRunBatches)
    .where(eq(nodeRunBatches.id, batchRunId))
    .limit(1);

  if (!batchRun) {
    throw new ApiError(404, "BATCH_RUN_NOT_FOUND", "批量运行记录不存在。");
  }

  return batchRun;
}

async function getSelectedEdgesForBatchRun(batchRun: Awaited<ReturnType<typeof getBatchRunRecord>>) {
  const nodeIds = batchRun.selectedNodesJson.map((node) => node.id);

  return getCanvasEdgesForNodes(batchRun.workspaceId, batchRun.canvasId, nodeIds);
}

async function triggerBatchRunProgress(batchRunId: string, runIndex: number) {
  const batchRun = await getBatchRunRecord(batchRunId);
  const selectedNodes = batchRun.selectedNodesJson;
  const selectedNodeIds = selectedNodes.map((node) => node.id);
  const selectedEdges = await getSelectedEdgesForBatchRun(batchRun);
  const batchNodeRuns = await db
    .select()
    .from(nodeRuns)
    .where(
      and(
        eq(nodeRuns.workspaceId, batchRun.workspaceId),
        eq(nodeRuns.batchRunId, batchRun.id),
        eq(nodeRuns.runIndex, runIndex),
      ),
    );
  const nodeRunMap = new Map(batchNodeRuns.map((nodeRun) => [nodeRun.nodeId, nodeRun]));
  const incomingMap = new Map<string, string[]>(
    selectedNodeIds.map((nodeId) => [
      nodeId,
      selectedEdges.filter((edge) => edge.targetNodeId === nodeId).map((edge) => edge.sourceNodeId),
    ]),
  );
  const blockedNodeRuns = selectedNodes
    .map((node) => {
      const nodeRun = nodeRunMap.get(node.id);

      if (!nodeRun || nodeRun.taskId || isTerminalNodeRunStatus(nodeRun.status) || nodeRun.status === "launching") {
        return null;
      }

      const dependencyNodeIds = incomingMap.get(node.id) ?? [];

      if (dependencyNodeIds.length === 0) {
        return null;
      }

      const dependencyRuns = dependencyNodeIds.map((dependencyNodeId) => nodeRunMap.get(dependencyNodeId)).filter(Boolean);

      if (dependencyRuns.length !== dependencyNodeIds.length) {
        return null;
      }

      if (dependencyRuns.some((dependencyRun) => dependencyRun?.status === "failed")) {
        return nodeRun;
      }

      return null;
    })
    .filter((nodeRun): nodeRun is NonNullable<typeof nodeRun> => Boolean(nodeRun));

  for (const blockedNodeRun of blockedNodeRuns) {
    await updateNodeRunRecord(blockedNodeRun.id, {
      taskId: blockedNodeRun.taskId,
      status: "failed",
      resultType: blockedNodeRun.resultType,
      contentText: blockedNodeRun.contentText,
      assetId: blockedNodeRun.assetId,
      resultMeta: normalizeRecord(blockedNodeRun.resultMeta),
      errorCode: "UPSTREAM_NODE_FAILED",
      errorMessage: "批量链路中的上游节点失败，当前节点已被阻断。",
      startedAt: blockedNodeRun.startedAt,
      finishedAt: new Date(),
    });
  }

  const refreshedBatchNodeRuns = await db
    .select()
    .from(nodeRuns)
    .where(
      and(
        eq(nodeRuns.workspaceId, batchRun.workspaceId),
        eq(nodeRuns.batchRunId, batchRun.id),
        eq(nodeRuns.runIndex, runIndex),
      ),
    );
  const refreshedNodeRunMap = new Map(refreshedBatchNodeRuns.map((nodeRun) => [nodeRun.nodeId, nodeRun]));
  const readyNodeRuns = selectedNodes
    .map((node) => {
      const nodeRun = refreshedNodeRunMap.get(node.id);

      if (!nodeRun || nodeRun.taskId || isTerminalNodeRunStatus(nodeRun.status) || nodeRun.status === "launching") {
        return null;
      }

      const dependencyNodeIds = incomingMap.get(node.id) ?? [];

      if (dependencyNodeIds.length === 0) {
        return nodeRun;
      }

      const dependencyRuns = dependencyNodeIds.map((dependencyNodeId) => refreshedNodeRunMap.get(dependencyNodeId)).filter(Boolean);

      if (dependencyRuns.length !== dependencyNodeIds.length) {
        return null;
      }

      if (dependencyRuns.some((dependencyRun) => dependencyRun?.status !== "succeeded")) {
        return null;
      }

      return nodeRun;
    })
    .filter((nodeRun): nodeRun is NonNullable<typeof nodeRun> => Boolean(nodeRun));

  await Promise.all(readyNodeRuns.map((nodeRun) => launchBatchNodeRun(nodeRun.id)));
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
      runIndex: nodeRuns.runIndex,
    })
    .from(nodeRuns)
    .where(eq(nodeRuns.id, nodeRunId))
    .limit(1);

  if (record?.batchRunId) {
    await refreshNodeRunBatchSummary(record.batchRunId);

    if (record.runIndex && isTerminalNodeRunStatus(payload.status)) {
      await triggerBatchRunProgress(record.batchRunId, record.runIndex);
    }
  }
}

async function launchBatchNodeRun(nodeRunId: string) {
  const claimedAt = new Date();
  const [claimedNodeRun] = await db
    .update(nodeRuns)
    .set({
      status: "launching",
      updatedAt: claimedAt,
    })
    .where(and(eq(nodeRuns.id, nodeRunId), isNull(nodeRuns.taskId), eq(nodeRuns.status, "queued")))
    .returning();

  if (!claimedNodeRun) {
    return null;
  }

  try {
    const batchRun =
      claimedNodeRun.batchRunId && claimedNodeRun.runIndex ? await getBatchRunRecord(claimedNodeRun.batchRunId) : null;

    return await runNode({
      workspaceId: claimedNodeRun.workspaceId,
      canvasId: claimedNodeRun.canvasId,
      nodeId: claimedNodeRun.nodeId,
      actorUserId: batchRun?.createdBy ?? claimedNodeRun.workspaceId,
      requestId: claimedNodeRun.requestId,
      useUpstreamOutputs: true,
      mergeStrategy: "merge_all",
      overrideSettings: {},
      batchRunId: claimedNodeRun.batchRunId ?? undefined,
      batchRunIndex: claimedNodeRun.runIndex ?? undefined,
      existingNodeRunId: claimedNodeRun.id,
    });
  } catch (error) {
    await updateNodeRunRecord(claimedNodeRun.id, {
      taskId: null,
      status: "failed",
      resultType: null,
      contentText: null,
      assetId: null,
      resultMeta: {},
      errorCode: error instanceof ApiError ? error.code : "BATCH_NODE_RUN_FAILED",
      errorMessage: error instanceof Error ? error.message : "批量链路节点启动失败。",
      startedAt: null,
      finishedAt: new Date(),
    });

    return null;
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

async function getTaskNode(nodeId: string) {
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
  const node = await getTaskNode(task.nodeId as string);
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

  const existingNodeRun = parsed.existingNodeRunId ? await getNodeRunRecord(parsed.existingNodeRunId) : null;

  if (existingNodeRun) {
    if (
      existingNodeRun.workspaceId !== parsed.workspaceId ||
      existingNodeRun.canvasId !== parsed.canvasId ||
      existingNodeRun.nodeId !== parsed.nodeId
    ) {
      throw new ApiError(409, "NODE_RUN_INVALID", "节点运行记录与当前执行请求不匹配。");
    }
  }

  const node = await assertNodeForRun(parsed.workspaceId, parsed.canvasId, parsed.nodeId);
  const incomingEdges = await getIncomingEdges(parsed.workspaceId, parsed.canvasId, parsed.nodeId);
  const upstreamNodeIds = await resolveSelectedUpstreamNodeIds(parsed, incomingEdges);
  const upstreamNodes = await getUpstreamNodesForExecution(parsed, upstreamNodeIds);
  const referenceAssets = await getNodeReferenceAssets(node);
  const requestPayload = await buildExecutionPayload(node, upstreamNodes, referenceAssets, parsed);

  const createdTask = await db.transaction(async (tx) => {
    const nodeRun = existingNodeRun
      ? existingNodeRun
      : (
          await tx
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
            .returning()
        )[0];
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
      .update(nodeRuns)
      .set({
        taskId: task.id,
        status: "queued",
        updatedAt: new Date(),
      })
      .where(eq(nodeRuns.id, nodeRun.id));

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

  const node = await getTaskNode(task.nodeId as string);

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

    await updateNodeRunRecord(task.nodeRunId, {
      taskId: task.id,
      status: "succeeded",
      resultType: "video",
      contentText: providerStatus.videoUrl ?? null,
      assetId: null,
      resultMeta: {
        ...(task.responsePayload as Record<string, unknown> | null),
        poll: providerStatus.rawResponse,
        videoUrl: providerStatus.videoUrl,
        progress: providerStatus.progress,
      },
      errorCode: null,
      errorMessage: null,
      finishedAt,
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

  await getTaskNode(nodeId);

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
  const plannedNodeRuns = Array.from({ length: parsed.runCount }, (_, index) => index + 1).flatMap((runIndex) =>
    sortedNodes.map((node) => ({
      workspaceId: parsed.workspaceId,
      canvasId: parsed.canvasId,
      nodeId: node.id,
      batchRunId: batchRun.id,
      requestId: createBatchRunRequestId(batchRun.id, runIndex, node.id),
      runIndex,
      nodeType: node.type,
      nodeTitle: node.title,
      status: "queued",
    })),
  );

  await db.insert(nodeRuns).values(plannedNodeRuns);
  await refreshNodeRunBatchSummary(batchRun.id);
  await Promise.all(Array.from({ length: parsed.runCount }, (_, index) => triggerBatchRunProgress(batchRun.id, index + 1)));

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
    items: plannedNodeRuns.map((nodeRun) => ({
      nodeId: nodeRun.nodeId,
      nodeTitle: nodeRun.nodeTitle,
      taskId: null,
      status: nodeRun.status,
      runIndex: nodeRun.runIndex,
    })),
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  BatchRunResultsPanel,
  CombinationNodePanel,
  ExpandedTextEditor,
  getReferenceAssetDownloadName,
  ImageNodePanel,
  InputNodePanel,
  StoryboardNodePanel,
  TextNodePanel,
  VideoNodePanel,
} from "@/components/canvas/infinite-canvas-board-panels";
import { InfiniteCanvasBoardCreatePanel } from "@/components/canvas/infinite-canvas-board-create-panel";
import { InfiniteCanvasBoardNodeCard } from "@/components/canvas/infinite-canvas-board-node-card";
import {
  completeUpload,
  bindCanvasBatchRunResultNode,
  createUploadPresign,
  fetchCanvasBatchRunDetail,
  fetchCanvasRuntime,
  patchCanvasGraph,
  retryCanvasBatchRunItem,
  runCanvasNode,
  runCanvasNodeBatch,
  subscribeCanvasRuntime,
  type CanvasGraphMutationResult,
  type CanvasGraphNodePatch,
  type CanvasGraphOperation,
  type CanvasRuntimeSnapshot,
} from "@/components/canvas/infinite-canvas-board.api";
import {
  canCanvasNodeRun,
  createInitialCanvasNodeOutputSnapshot,
  DEFAULT_STORYBOARD_NODE_SETTINGS,
  DEFAULT_VIDEO_NODE_SETTINGS,
  GRID_MAJOR_SIZE,
  GRID_MINOR_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  TEXT_GENERATE_COOLDOWN_MS,
  getBatchResultNodeBatchRunId,
  getBatchResultLinkedBatchRunId,
  getCanvasConnectionLabel,
  getCanvasConnectionSemantic,
  getDefaultCanvasNodeSettings,
  getCanvasNodeDimensions,
  getCanvasNodeGroupId,
  getImageNodeOutputSource,
  getManagedVideoAssetIds,
  getPersistedVideoNodeSettings,
  getReferenceAssetById,
  getStoryboardRawShots,
  getStoryboardShotAssetNames,
  getStoryboardShots,
  getStoryboardTotalDuration,
  getTextNodeContent,
  getVideoNodeOutputSource,
  inferImageExtension,
  inferVideoExtension,
  isFormFieldTarget,
  normalizeResourceRefs,
  normalizeStoryboardNodeSettings,
  normalizeVideoSettingsByModel,
  normalizeVideoNodeSettings,
  quickCreateOptions,
  serializeStoryboardNodeSettings,
  serializeVideoNodeSettings,
  setCanvasNodeGroupId,
  triggerDownload,
  type CanvasBatchRunDetail,
  type CanvasBatchRunSummary,
  type CanvasBatchRunResultIndex,
  type CanvasNode,
  type CanvasBatchRunResult,
  type CanvasNodeReferenceAsset,
  type CanvasNodeResourceRefs,
  type StoryboardShot,
  type CanvasNodeType,
  type InstructionPresetOption,
  type InfiniteCanvasBoardProps,
  type LibraryItemOption,
  type StoryboardNodeSettings,
} from "@/components/canvas/infinite-canvas-board.shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PROMPT_ASSET_MENTION_REGEX = /@\[([^\]]+)\]\{asset:([0-9a-f-]+)\}/gi;
const BATCH_RESULT_PAGE_SIZE = 4;

type BatchRunDetailStatusFilter = "all" | "succeeded" | "failed";

function getPromptMentionAssetIds(prompt: string | null | undefined) {
  if (!prompt) {
    return [];
  }

  const assetIds: string[] = [];

  for (const match of prompt.matchAll(PROMPT_ASSET_MENTION_REGEX)) {
    const assetId = match[2]?.trim();

    if (assetId && !assetIds.includes(assetId)) {
      assetIds.push(assetId);
    }
  }

  return assetIds;
}

function mergePromptMentionAssetIds(resourceRefs: CanvasNodeResourceRefs, prompt: string | null | undefined) {
  return {
    ...resourceRefs,
    assetIds: Array.from(new Set([...resourceRefs.assetIds, ...getPromptMentionAssetIds(prompt)])),
  };
}

function getPromptContextAssets(
  node: CanvasNode | null,
  subjects: LibraryItemOption[],
  scenes: LibraryItemOption[],
) {
  if (!node) {
    return [];
  }

  const resourceRefs = normalizeResourceRefs(node.resourceRefs);
  const libraryItems = [
    ...subjects.filter((item) => resourceRefs.subjectIds.includes(item.id)),
    ...scenes.filter((item) => resourceRefs.sceneIds.includes(item.id)),
  ];
  const assetMap = new Map<string, CanvasNodeReferenceAsset>();

  for (const asset of node.referenceAssets ?? []) {
    assetMap.set(asset.id, asset);
  }

  for (const item of libraryItems) {
    for (const asset of item.assets ?? []) {
      if (!assetMap.has(asset.id)) {
        assetMap.set(asset.id, asset);
      }
    }
  }

  return Array.from(assetMap.values());
}

function getBaseNameFromFileName(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, "").trim() || "未命名资源";
}

function inferLibraryPresetFromText(sourceText: string) {
  const normalized = sourceText.trim().toLowerCase();
  const includes = (keywords: string[]) => keywords.some((keyword) => normalized.includes(keyword));
  const sceneKeywords = ["scene", "场景", "室内", "户外", "背景", "空间", "客厅", "studio", "outdoor", "indoor"];
  const modelKeywords = ["模特", "model", "person", "人物", "女生", "男生", "人像"];
  const accessoryKeywords = ["配饰", "耳环", "项链", "戒指", "包", "帽", "眼镜", "首饰", "accessory"];
  const apparelKeywords = ["服装", "上衣", "裤", "裙", "穿搭", "卫衣", "外套", "衬衫", "shoe", "shoes"];
  const whiteBgKeywords = ["白底", "white", "whitebg", "白背景"];
  const ecommerceKeywords = ["电商", "ecommerce", "商品", "product", "详情页"];
  const outdoorKeywords = ["户外", "outdoor", "街拍", "草地", "公园", "海边"];
  const indoorKeywords = ["室内", "indoor", "棚拍", "studio", "摄影棚", "客厅"];

  const kind: "subject" | "scene" = includes(sceneKeywords) ? "scene" : "subject";
  const entityType =
    kind === "scene"
      ? includes(outdoorKeywords)
        ? "outdoor"
        : "studio"
      : includes(modelKeywords)
        ? "model"
        : includes(accessoryKeywords)
          ? "accessory"
          : "product";

  const recommendedTags = Array.from(
    new Set(
      [
        includes(modelKeywords) ? "模特" : null,
        includes(accessoryKeywords) ? "配饰" : null,
        includes(apparelKeywords) ? "服装" : null,
        includes(whiteBgKeywords) ? "白底" : null,
        includes(ecommerceKeywords) ? "电商" : null,
        kind === "scene" && includes(outdoorKeywords) ? "户外" : null,
        kind === "scene" && includes(indoorKeywords) ? "室内" : null,
        kind === "scene" && !includes(outdoorKeywords) && !includes(indoorKeywords) ? "场景" : null,
        kind === "subject" && !includes(modelKeywords) && !includes(accessoryKeywords) ? "商品主体" : null,
      ].filter((tag): tag is string => Boolean(tag)),
    ),
  );

  return {
    kind,
    entityType,
    recommendedTags,
  };
}

function getNodePositionsFromNodes(nodes: CanvasNode[]) {
  return Object.fromEntries(
    nodes.map((node) => [
      node.id,
      {
        x: Number.parseFloat(node.positionX || "0"),
        y: Number.parseFloat(node.positionY || "0"),
      },
    ]),
  ) as Record<string, { x: number; y: number }>;
}

function clampWheelDelta(delta: number, limit: number) {
  return Math.max(-limit, Math.min(limit, delta));
}

function hasExceededPointerThreshold(start: { x: number; y: number }, current: { x: number; y: number }, threshold = 5) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

function areNodePositionsEqual(
  left: Record<string, { x: number; y: number }>,
  right: Record<string, { x: number; y: number }>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return rightKeys.every((nodeId) => left[nodeId]?.x === right[nodeId]?.x && left[nodeId]?.y === right[nodeId]?.y);
}

export function InfiniteCanvasBoard({
  workspaceId,
  canEdit,
  canGenerate,
  canvasVersion: initialCanvasVersion,
  nodes: initialNodes,
  edges: initialEdges,
  tasks: initialTasks,
  batchRuns: initialBatchRuns,
  canvasId,
  subjects,
  scenes,
  instructionPresets,
}: InfiniteCanvasBoardProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);
  const videoFirstFrameInputRef = useRef<HTMLInputElement | null>(null);
  const videoLastFrameInputRef = useRef<HTMLInputElement | null>(null);
  const videoReferenceInputRef = useRef<HTMLInputElement | null>(null);
  const videoPreviewRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const canvasVersionRef = useRef(initialCanvasVersion);
  const mutationQueueRef = useRef(Promise.resolve<CanvasGraphMutationResult | null>(null));
  const selectedNodeDraftPatchRef = useRef<CanvasGraphNodePatch | null>(null);
  const effectiveSelectedNodeIdRef = useRef<string | null>(null);
  const previousBatchRunIdsRef = useRef(initialBatchRuns.map((batchRun) => batchRun.id));
  const autoBoundBatchRunIdsRef = useRef<Record<string, string>>({});
  const runtimeStreamRetryTimeoutRef = useRef<number | null>(null);
  const runtimeStreamErrorCountRef = useRef(0);

  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [tasks, setTasks] = useState(initialTasks);
  const [batchRuns, setBatchRuns] = useState(initialBatchRuns);
  const [batchRunDetailsById, setBatchRunDetailsById] = useState<Record<string, CanvasBatchRunDetail>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialNodes[0]?.id ?? null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(initialNodes[0]?.id ? [initialNodes[0].id] : []);
  const [isCreateOpen, setIsCreateOpen] = useState(initialNodes.length === 0);
  const [quickType, setQuickType] = useState<CanvasNodeType>("text");
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [savingNodeId, setSavingNodeId] = useState<string | null>(null);
  const [imagePreviewSizes, setImagePreviewSizes] = useState<Record<string, { width: number; height: number }>>({});
  const [draftPrompt, setDraftPrompt] = useState("");
  const [draftStoryboardSettings, setDraftStoryboardSettings] = useState<StoryboardNodeSettings>(DEFAULT_STORYBOARD_NODE_SETTINGS);
  const [selectedStoryboardShotIndex, setSelectedStoryboardShotIndex] = useState(0);
  const [draftStoryboardShot, setDraftStoryboardShot] = useState<StoryboardShot | null>(null);
  const [draftImagePrompt, setDraftImagePrompt] = useState("");
  const [draftVideoPrompt, setDraftVideoPrompt] = useState("");
  const [draftVideoSettings, setDraftVideoSettings] = useState(DEFAULT_VIDEO_NODE_SETTINGS);
  const [draftVideoModelKey, setDraftVideoModelKey] = useState("");
  const [draftResourceRefs, setDraftResourceRefs] = useState<CanvasNodeResourceRefs>(() => normalizeResourceRefs(initialNodes[0]?.resourceRefs));
  const [expandedTextContent, setExpandedTextContent] = useState("");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isSavingStoryboardShot, setIsSavingStoryboardShot] = useState(false);
  const [isSavingImagePrompt, setIsSavingImagePrompt] = useState(false);
  const [isSavingVideoPrompt, setIsSavingVideoPrompt] = useState(false);
  const [isUploadingReferenceImages, setIsUploadingReferenceImages] = useState(false);
  const [isUploadingVideoImages, setIsUploadingVideoImages] = useState(false);
  const [isCreatingStoryboardVideoNode, setIsCreatingStoryboardVideoNode] = useState(false);
  const [generatingTextNodeId, setGeneratingTextNodeId] = useState<string | null>(null);
  const [generatingStoryboardNodeId, setGeneratingStoryboardNodeId] = useState<string | null>(null);
  const [generatingImageNodeId, setGeneratingImageNodeId] = useState<string | null>(null);
  const [generatingVideoNodeId, setGeneratingVideoNodeId] = useState<string | null>(null);
  const [editingTextNodeTitleId, setEditingTextNodeTitleId] = useState<string | null>(null);
  const [editingTextNodeTitle, setEditingTextNodeTitle] = useState("");
  const [isSavingTextNodeTitle, setIsSavingTextNodeTitle] = useState(false);
  const [textGenerateCooldown, setTextGenerateCooldown] = useState<{ nodeId: string | null; expiresAt: number }>({
    nodeId: null,
    expiresAt: 0,
  });
  const [isExpandedEditorOpen, setIsExpandedEditorOpen] = useState(false);
  const [isCanvasDragOver, setIsCanvasDragOver] = useState(false);
  const [pendingDroppedImages, setPendingDroppedImages] = useState<File[]>([]);
  const [pendingDropPosition, setPendingDropPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDropImportDialogOpen, setIsDropImportDialogOpen] = useState(false);
  const [dropImportKind, setDropImportKind] = useState<"subject" | "scene">("subject");
  const [dropImportEntityType, setDropImportEntityType] = useState("product");
  const [dropImportTags, setDropImportTags] = useState("");
  const [isProcessingDropImport, setIsProcessingDropImport] = useState(false);
  const [isSaveResultDialogOpen, setIsSaveResultDialogOpen] = useState(false);
  const [saveResultKind, setSaveResultKind] = useState<"subject" | "scene">("subject");
  const [saveResultEntityType, setSaveResultEntityType] = useState("product");
  const [saveResultName, setSaveResultName] = useState("");
  const [saveResultTags, setSaveResultTags] = useState("");
  const [isSavingResultToLibrary, setIsSavingResultToLibrary] = useState(false);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [playingVideoNodeId, setPlayingVideoNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingConnectionSourceId, setPendingConnectionSourceId] = useState<string | null>(null);
  const [pendingConnectionPointer, setPendingConnectionPointer] = useState<{ x: number; y: number } | null>(null);
  const [batchRunCount, setBatchRunCount] = useState(1);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [isBatchResultsOpen, setIsBatchResultsOpen] = useState(initialBatchRuns.length > 0);
  const [isBatchRunDetailLoading, setIsBatchRunDetailLoading] = useState(false);
  const [selectedBatchRunId, setSelectedBatchRunId] = useState<string | null>(initialBatchRuns[0]?.id ?? null);
  const [batchPreviewPage, setBatchPreviewPage] = useState(1);
  const [batchRunDetailQueryById, setBatchRunDetailQueryById] = useState<
    Record<string, { page: number; status: BatchRunDetailStatusFilter }>
  >({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
  const [canvasSaveState, setCanvasSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [runtimeSyncState, setRuntimeSyncState] = useState<"connecting" | "live" | "reconnecting" | "degraded">(
    "connecting",
  );
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const apiContext = useMemo(() => ({ canvasId, workspaceId }), [canvasId, workspaceId]);
  const getBatchRunDetailQuery = useCallback(
    (batchRunId: string | null | undefined) =>
      (batchRunId ? batchRunDetailQueryById[batchRunId] : null) ?? {
        page: 1,
        status: "all" as BatchRunDetailStatusFilter,
      },
    [batchRunDetailQueryById],
  );
  const setBatchRunDetailQuery = useCallback(
    (
      batchRunId: string,
      patch:
        | Partial<{ page: number; status: BatchRunDetailStatusFilter }>
        | ((current: { page: number; status: BatchRunDetailStatusFilter }) => {
            page: number;
            status: BatchRunDetailStatusFilter;
          }),
    ) => {
      setBatchRunDetailQueryById((current) => {
        const previous = current[batchRunId] ?? { page: 1, status: "all" as BatchRunDetailStatusFilter };
        const next = typeof patch === "function" ? patch(previous) : { ...previous, ...patch };

        return {
          ...current,
          [batchRunId]: {
            page: Math.max(1, next.page),
            status: next.status,
          },
        };
      });
    },
    [],
  );
  const getBatchRunDetailRequestOptions = useCallback(
    (
      batchRun: CanvasBatchRunSummary | null | undefined,
      query: { page: number; status: BatchRunDetailStatusFilter },
    ) =>
      batchRun?.combinationPlanSummary
        ? {
            itemLimit: BATCH_RESULT_PAGE_SIZE,
            itemOffset: (query.page - 1) * BATCH_RESULT_PAGE_SIZE,
            itemStatus:
              query.status === "all"
                ? undefined
                : (query.status === "succeeded" ? "succeeded" : "failed") as "succeeded" | "failed",
          }
        : undefined,
    [],
  );
  const isStructuredValueEqual = useCallback((left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right), []);
  const applyNodePatchToLocal = useCallback((node: CanvasNode, patch: CanvasGraphNodePatch): CanvasNode => {
    const nextNode: CanvasNode = { ...node };

    if (patch.title !== undefined) {
      nextNode.title = patch.title;
    }

    if (patch.promptInput !== undefined) {
      nextNode.promptInput = patch.promptInput;
    }

    if (patch.outputSnapshot !== undefined) {
      nextNode.outputSnapshot = patch.outputSnapshot;
    }

    if (patch.modelKey !== undefined) {
      nextNode.modelKey = patch.modelKey;
    }

    if (patch.settingsJson !== undefined) {
      nextNode.settingsJson = patch.settingsJson;
    }

    if (patch.resourceRefs !== undefined) {
      nextNode.resourceRefs = patch.resourceRefs;
    }

    if (patch.status !== undefined) {
      nextNode.status = patch.status;
    }

    if (patch.positionX !== undefined) {
      nextNode.positionX = String(patch.positionX);
    }

    if (patch.positionY !== undefined) {
      nextNode.positionY = String(patch.positionY);
    }

    return nextNode;
  }, []);
  const applyGraphMutationResult = useCallback((result: CanvasGraphMutationResult) => {
    canvasVersionRef.current = result.canvasVersion;

    if (result.deletedNodeIds.length > 0) {
      const deletedNodeIdSet = new Set(result.deletedNodeIds);
      setNodes((current) => current.filter((node) => !deletedNodeIdSet.has(node.id)));
      setSelectedNodeIds((current) => current.filter((nodeId) => !deletedNodeIdSet.has(nodeId)));
      setSelectedNodeId((current) => (current && deletedNodeIdSet.has(current) ? null : current));
    }

    if (result.deletedEdgeIds.length > 0) {
      const deletedEdgeIdSet = new Set(result.deletedEdgeIds);
      setEdges((current) => current.filter((edge) => !deletedEdgeIdSet.has(edge.id)));
      setSelectedEdgeId((current) => (current && deletedEdgeIdSet.has(current) ? null : current));
    }

    if (result.nodes.length > 0) {
      setNodes((current) => {
        const nodeMap = new Map(current.map((node) => [node.id, node]));

        for (const node of result.nodes) {
          nodeMap.set(node.id, {
            ...node,
            resourceRefs: normalizeResourceRefs(node.resourceRefs),
          });
        }

        return Array.from(nodeMap.values());
      });
    }

    if (result.edges.length > 0) {
      setEdges((current) => {
        const edgeMap = new Map(current.map((edge) => [edge.id, edge]));

        for (const edge of result.edges) {
          edgeMap.set(edge.id, edge);
        }

        return Array.from(edgeMap.values());
      });
    }
  }, []);
  const runGraphMutation = useCallback(
    async (
      operations: CanvasGraphOperation[],
      fallbackMessage: string,
      options?: {
        successMessage?: string;
        errorMessage?: string;
        onSuccess?: (result: CanvasGraphMutationResult) => void;
      },
    ) => {
      const execute = async () => {
        try {
          const result = await patchCanvasGraph(
            apiContext,
            {
              baseVersion: canvasVersionRef.current,
              operations,
            },
            fallbackMessage,
          );

          applyGraphMutationResult(result);
          options?.onSuccess?.(result);

          if (options?.successMessage) {
            toast.success(options.successMessage);
          }

          return result;
        } catch (error) {
          const normalizedError = error as Error & { code?: string };

          if (normalizedError.code === "CANVAS_VERSION_CONFLICT") {
            toast.error("画布已在其他请求中更新，正在刷新最新状态。");
            router.refresh();
          }

          throw error;
        }
      };

      const task = mutationQueueRef.current.then(execute, execute);
      mutationQueueRef.current = task.then(() => null, () => null);

      return task;
    },
    [apiContext, applyGraphMutationResult, router],
  );
  const saveNodePatch = useCallback(
    async (
      nodeId: string,
      patch: CanvasGraphNodePatch,
      fallbackMessage: string,
      options?: {
        successMessage?: string;
        errorMessage?: string;
      },
    ) => {
      setNodes((current) => current.map((node) => (node.id === nodeId ? applyNodePatchToLocal(node, patch) : node)));

      return runGraphMutation(
        [
          {
            type: "update_node",
            nodeId,
            patch,
          },
        ],
        fallbackMessage,
        options,
      );
    },
    [applyNodePatchToLocal, runGraphMutation],
  );
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const incomingNodeIdsByTarget = useMemo(() => {
    const nextMap = new Map<string, string[]>();

    for (const edge of edges) {
      const incomingNodeIds = nextMap.get(edge.targetNodeId) ?? [];
      incomingNodeIds.push(edge.sourceNodeId);
      nextMap.set(edge.targetNodeId, incomingNodeIds);
    }

    return nextMap;
  }, [edges]);
  const buildNodeSettingsPayload = useCallback(
    (node: CanvasNode, settingsJson: Record<string, unknown> | null) =>
      setCanvasNodeGroupId(settingsJson, getCanvasNodeGroupId(node.settingsJson)),
    [],
  );
  const nodeGroupIdByNode = useMemo(
    () => new Map(nodes.map((node) => [node.id, getCanvasNodeGroupId(node.settingsJson)])),
    [nodes],
  );
  const groupNodeIdsMap = useMemo(() => {
    const nextGroups = new Map<string, string[]>();

    for (const node of nodes) {
      const groupId = getCanvasNodeGroupId(node.settingsJson);

      if (!groupId) {
        continue;
      }

      const memberIds = nextGroups.get(groupId) ?? [];
      memberIds.push(node.id);
      nextGroups.set(groupId, memberIds);
    }

    return nextGroups;
  }, [nodes]);

  const latestTaskByNode = useMemo(() => {
    const taskMap = new Map<string, (typeof tasks)[number]>();

    for (const task of tasks) {
      if (task.nodeId && !taskMap.has(task.nodeId)) {
        taskMap.set(task.nodeId, task);
      }
    }

    return taskMap;
  }, [tasks]);

  const nodeCountByType = useMemo(() => {
    return nodes.reduce<Record<string, number>>((accumulator, node) => {
      accumulator[node.type] = (accumulator[node.type] ?? 0) + 1;

      return accumulator;
    }, {});
  }, [nodes]);

  const nodePositionMap = useMemo(() => {
    return new Map(
      nodes.map((node) => [
        node.id,
        {
          x: nodePositions[node.id]?.x ?? Number.parseFloat(node.positionX || "0"),
          y: nodePositions[node.id]?.y ?? Number.parseFloat(node.positionY || "0"),
        },
      ]),
    );
  }, [nodePositions, nodes]);
  const pendingConnectionSourceNode = pendingConnectionSourceId ? nodeById.get(pendingConnectionSourceId) ?? null : null;
  const autoBatchRunnableNodeIds = useMemo(() => {
    const result = new Set<string>();

    for (const node of nodes) {
      if (!canCanvasNodeRun(node.type)) {
        continue;
      }

      const visited = new Set<string>();
      const queue = [...(incomingNodeIdsByTarget.get(node.id) ?? [])];

      while (queue.length > 0) {
        const currentNodeId = queue.shift();

        if (!currentNodeId || visited.has(currentNodeId)) {
          continue;
        }

        visited.add(currentNodeId);

        const currentNode = nodeById.get(currentNodeId);

        if (!currentNode) {
          continue;
        }

        if (currentNode.type === "combination") {
          result.add(node.id);
          break;
        }

        const nextIncomingNodeIds = incomingNodeIdsByTarget.get(currentNodeId) ?? [];
        queue.push(...nextIncomingNodeIds);
      }
    }

    return result;
  }, [incomingNodeIdsByTarget, nodeById, nodes]);
  const effectiveSelectedNodeIds = useMemo(
    () =>
      Array.from(new Set(selectedNodeIds)).filter((nodeId) =>
        nodes.some((node) => node.id === nodeId),
      ),
    [nodes, selectedNodeIds],
  );
  const effectiveSelectedNodeId =
    (selectedNodeId && nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId : null) ??
    effectiveSelectedNodeIds[0] ??
    null;
  const selectedNode = nodes.find((node) => node.id === effectiveSelectedNodeId) ?? null;
  const selectedNodeAutoBatchEnabled = selectedNode ? autoBatchRunnableNodeIds.has(selectedNode.id) : false;
  const selectedNodeDraftIdentity = selectedNode ? `${selectedNode.id}:${selectedNode.type}` : null;
  const selectedBatchResultRunId =
    selectedNode?.type === "batch_result" ? getBatchResultLinkedBatchRunId(selectedNode, batchRuns) : null;
  const selectedNodeDraftPatch = useMemo((): CanvasGraphNodePatch | null => {
    if (!selectedNode) {
      return null;
    }

    if (selectedNode.type === "text") {
      return selectedNode.promptInput !== draftPrompt ? { promptInput: draftPrompt } : null;
    }

    if (selectedNode.type === "storyboard") {
      const nextPatch: CanvasGraphNodePatch = {};
      const nextSettingsJson = buildNodeSettingsPayload(selectedNode, serializeStoryboardNodeSettings(draftStoryboardSettings));

      if (selectedNode.promptInput !== draftPrompt) {
        nextPatch.promptInput = draftPrompt;
      }

      if (!isStructuredValueEqual(selectedNode.settingsJson ?? null, nextSettingsJson ?? null)) {
        nextPatch.settingsJson = nextSettingsJson;
      }

      return Object.keys(nextPatch).length > 0 ? nextPatch : null;
    }

    if (selectedNode.type === "image") {
      const nextResourceRefs = mergePromptMentionAssetIds(draftResourceRefs, draftImagePrompt);

      if (selectedNode.promptInput !== draftImagePrompt || !isStructuredValueEqual(normalizeResourceRefs(selectedNode.resourceRefs), nextResourceRefs)) {
        return {
          promptInput: draftImagePrompt,
          resourceRefs: nextResourceRefs,
        };
      }

      return null;
    }

    if (selectedNode.type === "video") {
      const persistedSettings = getPersistedVideoNodeSettings(normalizeVideoSettingsByModel(draftVideoSettings, draftVideoModelKey));
      const nextSettingsJson = buildNodeSettingsPayload(selectedNode, {
        generationMode: persistedSettings.generationMode,
        duration: persistedSettings.durationSec,
        durationSec: persistedSettings.durationSec,
        size: persistedSettings.size,
        motionStrength: persistedSettings.motionStrength,
        withAudio: persistedSettings.withAudio,
        firstFrameAssetId: persistedSettings.firstFrameAssetId,
        lastFrameAssetId: persistedSettings.lastFrameAssetId,
        referenceAssetIds: persistedSettings.referenceAssetIds,
        shotPrompts: persistedSettings.shotPrompts,
      });
      const nextResourceRefs = mergePromptMentionAssetIds(
        {
        subjectIds: draftResourceRefs.subjectIds,
        sceneIds: draftResourceRefs.sceneIds,
        instructionPresetIds: draftResourceRefs.instructionPresetIds,
        assetIds: getManagedVideoAssetIds(draftVideoSettings),
        },
        draftVideoPrompt,
      );
      const nextPatch: CanvasGraphNodePatch = {};

      if (selectedNode.promptInput !== draftVideoPrompt) {
        nextPatch.promptInput = draftVideoPrompt;
      }

      if ((selectedNode.modelKey ?? "") !== draftVideoModelKey.trim()) {
        nextPatch.modelKey = draftVideoModelKey.trim() || null;
      }

      if (!isStructuredValueEqual(normalizeResourceRefs(selectedNode.resourceRefs), nextResourceRefs)) {
        nextPatch.resourceRefs = nextResourceRefs;
      }

      if (!isStructuredValueEqual(selectedNode.settingsJson ?? null, nextSettingsJson ?? null)) {
        nextPatch.settingsJson = nextSettingsJson;
      }

      return Object.keys(nextPatch).length > 0 ? nextPatch : null;
    }

    return null;
  }, [
    buildNodeSettingsPayload,
    draftImagePrompt,
    draftPrompt,
    draftResourceRefs,
    draftStoryboardSettings,
    draftVideoModelKey,
    draftVideoPrompt,
    draftVideoSettings,
    isStructuredValueEqual,
    selectedNode,
  ]);
  selectedNodeDraftPatchRef.current = selectedNodeDraftPatch;
  effectiveSelectedNodeIdRef.current = effectiveSelectedNodeId;
  const applyRuntimeSnapshot = useCallback(
    (snapshot: CanvasRuntimeSnapshot) => {
      const draftPatch = selectedNodeDraftPatchRef.current;
      const selectedNodeId = effectiveSelectedNodeIdRef.current;

      canvasVersionRef.current = snapshot.canvasVersion;

      setNodes(
        snapshot.nodes.map((node) => {
          const normalizedNode = {
            ...node,
            resourceRefs: normalizeResourceRefs(node.resourceRefs),
          };

          if (draftPatch && node.id === selectedNodeId) {
            const patchedNode = applyNodePatchToLocal(normalizedNode, draftPatch);

            return {
              ...patchedNode,
              resourceRefs: normalizeResourceRefs(patchedNode.resourceRefs),
            };
          }

          return normalizedNode;
        }),
      );
      setTasks(snapshot.tasks);
      setBatchRuns(snapshot.batchRuns);
    },
    [applyNodePatchToLocal],
  );
  const refreshCanvasRuntime = useCallback(
    async (fallbackMessage = "画布运行态刷新失败。") => {
      const snapshot = await fetchCanvasRuntime(apiContext, fallbackMessage);
      applyRuntimeSnapshot(snapshot);

      return snapshot;
    },
    [apiContext, applyRuntimeSnapshot],
  );
  const canvasSaveStatusLabel =
    canvasSaveState === "saving"
      ? "保存中"
      : canvasSaveState === "unsaved"
        ? "未保存"
        : canvasSaveState === "error"
          ? "保存失败"
          : "已保存";
  const runtimeSyncStatusLabel =
    runtimeSyncState === "live"
      ? "运行态已连接"
      : runtimeSyncState === "reconnecting"
        ? "运行态重连中"
        : runtimeSyncState === "degraded"
          ? "运行态降级刷新"
          : "运行态连接中";
  const runtimeSyncStatusTone =
    runtimeSyncState === "live"
      ? "bg-emerald-50 text-emerald-700"
      : runtimeSyncState === "degraded"
        ? "bg-amber-50 text-amber-700"
        : "bg-muted text-foreground";
  const hasUnsavedCanvasChanges = selectedNodeDraftPatch !== null;
  const selectedNodes = effectiveSelectedNodeIds
    .map((nodeId) => nodeById.get(nodeId))
    .filter((node): node is CanvasNode => Boolean(node));
  const selectedNodeTitles = selectedNodes.map((node) => node.title);
  const selectedGroupIds = Array.from(
    new Set(
      effectiveSelectedNodeIds
        .map((nodeId) => nodeGroupIdByNode.get(nodeId))
        .filter((groupId): groupId is string => typeof groupId === "string"),
    ),
  );
  const groupedSelectionId = selectedGroupIds.length === 1 ? selectedGroupIds[0] : null;
  const groupedSelectionNodeIds = groupedSelectionId ? groupNodeIdsMap.get(groupedSelectionId) ?? [] : [];
  const hasGroupedSelection =
    Boolean(groupedSelectionId) && groupedSelectionNodeIds.every((nodeId) => effectiveSelectedNodeIds.includes(nodeId));
  const hasActiveCanvasTasks =
    tasks.some((task) => task.status === "queued" || task.status === "processing") ||
    batchRuns.some((batchRun) => batchRun.status === "processing");
  const matchingBatchRuns = useMemo(() => {
    if (effectiveSelectedNodeIds.length === 0) {
      return batchRuns;
    }

    const selectedNodeIdSet = new Set(effectiveSelectedNodeIds);

    return batchRuns.filter((batchRun) => batchRun.selectedNodesJson.some((node) => selectedNodeIdSet.has(node.id)));
  }, [batchRuns, effectiveSelectedNodeIds]);
  const isBatchRunSelectionFiltered = effectiveSelectedNodeIds.length > 0 && matchingBatchRuns.length > 0;
  const visibleBatchRuns = isBatchRunSelectionFiltered ? matchingBatchRuns : batchRuns;
  const activeBatchRun =
    visibleBatchRuns.find((batchRun) => batchRun.id === selectedBatchRunId) ?? visibleBatchRuns[0] ?? null;
  const activeBatchRunDetail = activeBatchRun ? batchRunDetailsById[activeBatchRun.id] ?? null : null;
  const activeBatchRunQuery = getBatchRunDetailQuery(activeBatchRun?.id);
  const activeBatchRunPreviewItems = useMemo<CanvasBatchRunResult[]>(() => {
    if (!activeBatchRun) {
      return [];
    }

    if (activeBatchRunDetail?.itemsPage) {
      return [];
    }

    const activeRuns = activeBatchRunDetail?.runs ?? [];

    if (!isBatchRunSelectionFiltered) {
      return activeRuns;
    }

    const selectedNodeIdSet = new Set(effectiveSelectedNodeIds);
    const filteredRuns = activeRuns.filter((run) => selectedNodeIdSet.has(run.nodeId));

    return filteredRuns.length > 0 ? filteredRuns : activeRuns;
  }, [activeBatchRun, activeBatchRunDetail, effectiveSelectedNodeIds, isBatchRunSelectionFiltered]);
  const batchPreviewTotalPages = useMemo(() => {
    if (activeBatchRunDetail?.itemsPage) {
      return Math.max(1, Math.ceil(activeBatchRunDetail.itemsPage.total / BATCH_RESULT_PAGE_SIZE));
    }

    return Math.max(1, Math.ceil(activeBatchRunPreviewItems.length / BATCH_RESULT_PAGE_SIZE));
  }, [activeBatchRunDetail, activeBatchRunPreviewItems.length]);
  const paginatedBatchPreviewItems = useMemo<CanvasBatchRunResult[]>(() => {
    if (activeBatchRunDetail?.itemsPage) {
      return [];
    }

    const currentPage = Math.min(batchPreviewPage, batchPreviewTotalPages);
    const startIndex = (currentPage - 1) * BATCH_RESULT_PAGE_SIZE;

    return activeBatchRunPreviewItems.slice(startIndex, startIndex + BATCH_RESULT_PAGE_SIZE);
  }, [activeBatchRunDetail, activeBatchRunPreviewItems, batchPreviewPage, batchPreviewTotalPages]);
  const hasRunningSelectedNode = selectedNodes.some((node) => {
    const latestTask = latestTaskByNode.get(node.id);

    return latestTask?.status === "queued" || latestTask?.status === "processing";
  });
  const selectedTask = selectedNode ? latestTaskByNode.get(selectedNode.id) ?? null : null;
  const normalizedSelectionRect = useMemo(() => {
    if (!selectionRect) {
      return null;
    }

    const left = Math.min(selectionRect.startX, selectionRect.currentX);
    const right = Math.max(selectionRect.startX, selectionRect.currentX);
    const top = Math.min(selectionRect.startY, selectionRect.currentY);
    const bottom = Math.max(selectionRect.startY, selectionRect.currentY);

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    };
  }, [selectionRect]);
  const isTextNodeSelected = selectedNode?.type === "text";
  const isStoryboardNodeSelected = selectedNode?.type === "storyboard";
  const isImageNodeSelected = selectedNode?.type === "image";
  const isVideoNodeSelected = selectedNode?.type === "video";
  const isInputNodeSelected = selectedNode?.type === "input";
  const isCombinationNodeSelected = selectedNode?.type === "combination";
  const isTextNodeTaskActive = selectedTask?.status === "queued" || selectedTask?.status === "processing";
  const isStoryboardNodeTaskActive = selectedTask?.status === "queued" || selectedTask?.status === "processing";
  const isImageNodeTaskActive = selectedTask?.status === "queued" || selectedTask?.status === "processing";
  const isVideoNodeTaskActive = selectedTask?.status === "queued" || selectedTask?.status === "processing";
  const isSelectedTextNodeGenerating = selectedNode?.id === generatingTextNodeId;
  const isSelectedStoryboardNodeGenerating = selectedNode?.id === generatingStoryboardNodeId;
  const isSelectedImageNodeGenerating = selectedNode?.id === generatingImageNodeId;
  const isSelectedVideoNodeGenerating = selectedNode?.id === generatingVideoNodeId;
  const isSelectedTextNodeCoolingDown =
    selectedNode?.id === textGenerateCooldown.nodeId && Date.now() < textGenerateCooldown.expiresAt;
  const selectedImageOutputSource = isImageNodeSelected ? getImageNodeOutputSource(selectedNode.outputSnapshot) : null;
  const selectedVideoOutputSource = isVideoNodeSelected ? getVideoNodeOutputSource(selectedNode.outputSnapshot) : null;
  const selectedStoryboardRawShots = useMemo(
    () => (isStoryboardNodeSelected ? getStoryboardRawShots(selectedNode.outputSnapshot) : []),
    [isStoryboardNodeSelected, selectedNode],
  );
  const selectedStoryboardShots = useMemo(
    () => (isStoryboardNodeSelected ? getStoryboardShots(selectedNode.outputSnapshot) : []),
    [isStoryboardNodeSelected, selectedNode],
  );
  const selectedStoryboardTotalDurationSec = useMemo(
    () => (isStoryboardNodeSelected ? getStoryboardTotalDuration(selectedNode.outputSnapshot) : 0),
    [isStoryboardNodeSelected, selectedNode],
  );
  const getIncomingImageNodes = useCallback(
    (targetNodeId: string) =>
      edges
        .filter((edge) => edge.targetNodeId === targetNodeId)
        .sort((left, right) => left.priority - right.priority)
        .map((edge) => nodeById.get(edge.sourceNodeId))
        .filter((node): node is CanvasNode => Boolean(node && node.type === "image")),
    [edges, nodeById],
  );
  const selectedStoryboardImageNodes = useMemo(
    () => (selectedNode && selectedNode.type === "storyboard" ? getIncomingImageNodes(selectedNode.id) : []),
    [getIncomingImageNodes, selectedNode],
  );
  const activeStoryboardShotIndex =
    selectedStoryboardShots.length > 0
      ? Math.min(selectedStoryboardShots.length - 1, Math.max(0, selectedStoryboardShotIndex))
      : 0;
  const visibleVideoSettings = getPersistedVideoNodeSettings(normalizeVideoSettingsByModel(draftVideoSettings, draftVideoModelKey));
  const selectedVideoFirstFrameAsset = isVideoNodeSelected
    ? getReferenceAssetById(selectedNode.referenceAssets, visibleVideoSettings.firstFrameAssetId)
    : null;
  const selectedVideoLastFrameAsset = isVideoNodeSelected
    ? getReferenceAssetById(selectedNode.referenceAssets, visibleVideoSettings.lastFrameAssetId)
    : null;
  const selectedVideoReferenceAssets = isVideoNodeSelected
    ? visibleVideoSettings.referenceAssetIds
        .map((assetId) => getReferenceAssetById(selectedNode.referenceAssets, assetId))
        .filter((asset): asset is CanvasNodeReferenceAsset => Boolean(asset))
    : [];
  const selectedNodePromptAssets = useMemo(
    () => getPromptContextAssets(selectedNode, subjects, scenes),
    [scenes, selectedNode, subjects],
  );

  useEffect(() => {
    const nextNodePositions = getNodePositionsFromNodes(nodes);

    setNodePositions((current) => (areNodePositionsEqual(current, nextNodePositions) ? current : nextNodePositions));
  }, [nodes]);

  useEffect(() => {
    if (!selectedEdgeId) {
      return;
    }

    if (!edges.some((edge) => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [edges, selectedEdgeId]);

  useEffect(() => {
    const validNodeIds = new Set(nodes.map((node) => node.id));

    setSelectedNodeIds((current) => current.filter((nodeId) => validNodeIds.has(nodeId)));

    if (selectedNodeId && !validNodeIds.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (visibleBatchRuns.length === 0) {
      setIsBatchResultsOpen(false);
      setSelectedBatchRunId(null);

      return;
    }

    if (!selectedBatchRunId || !visibleBatchRuns.some((batchRun) => batchRun.id === selectedBatchRunId)) {
      setSelectedBatchRunId(visibleBatchRuns[0].id);
    }
  }, [selectedBatchRunId, visibleBatchRuns]);

  useEffect(() => {
    if (!isBatchResultsOpen || !activeBatchRun) {
      return;
    }

    let cancelled = false;
    setIsBatchRunDetailLoading(true);

    void fetchCanvasBatchRunDetail(
      apiContext,
      activeBatchRun.id,
      activeBatchRun.combinationPlanSummary
        ? {
            itemLimit: BATCH_RESULT_PAGE_SIZE,
            itemOffset: (activeBatchRunQuery.page - 1) * BATCH_RESULT_PAGE_SIZE,
            itemStatus:
              activeBatchRunQuery.status === "all"
                ? undefined
                : activeBatchRunQuery.status === "succeeded"
                  ? "succeeded"
                  : "failed",
          }
        : undefined,
    )
      .then((detail) => {
        if (cancelled) {
          return;
        }

        setBatchRunDetailsById((current) => ({
          ...current,
          [detail.id]: detail,
        }));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        toast.error(error instanceof Error ? error.message : "批量运行详情加载失败。");
      })
      .finally(() => {
        if (!cancelled) {
          setIsBatchRunDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeBatchRun, activeBatchRunQuery.page, activeBatchRunQuery.status, apiContext, isBatchResultsOpen]);

  useEffect(() => {
    if (!selectedBatchResultRunId) {
      return;
    }

    let cancelled = false;
    const linkedBatchRun = batchRuns.find((batchRun) => batchRun.id === selectedBatchResultRunId) ?? null;
    const linkedQuery = getBatchRunDetailQuery(selectedBatchResultRunId);

    void fetchCanvasBatchRunDetail(
      apiContext,
      selectedBatchResultRunId,
      linkedBatchRun?.combinationPlanSummary
        ? {
            itemLimit: BATCH_RESULT_PAGE_SIZE,
            itemOffset: (linkedQuery.page - 1) * BATCH_RESULT_PAGE_SIZE,
            itemStatus:
              linkedQuery.status === "all"
                ? undefined
                : linkedQuery.status === "succeeded"
                  ? "succeeded"
                  : "failed",
          }
        : undefined,
    )
      .then((detail) => {
        if (cancelled) {
          return;
        }

        setBatchRunDetailsById((current) => ({
          ...current,
          [detail.id]: detail,
        }));
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("批量产出节点详情加载失败。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiContext, batchRuns, getBatchRunDetailQuery, selectedBatchResultRunId]);

  useEffect(() => {
    const batchResultNodes = nodes.filter((node) => node.type === "batch_result");

    if (batchResultNodes.length === 0 || batchRuns.length === 0) {
      return;
    }

    const legacyBindings = batchResultNodes.flatMap((node) => {
      const legacyBatchRunId = getBatchResultNodeBatchRunId(node.settingsJson);

      if (!legacyBatchRunId) {
        return [];
      }

      const batchRun = batchRuns.find((item) => item.id === legacyBatchRunId) ?? null;

      if (!batchRun || batchRun.resultNodeId || autoBoundBatchRunIdsRef.current[batchRun.id] === node.id) {
        return [];
      }

      return [{ batchRunId: batchRun.id, nodeId: node.id }];
    });

    if (legacyBindings.length === 0) {
      return;
    }

    for (const binding of legacyBindings) {
      autoBoundBatchRunIdsRef.current[binding.batchRunId] = binding.nodeId;

      void bindCanvasBatchRunResultNode(apiContext, binding.batchRunId, binding.nodeId)
        .then(() => {
          setBatchRuns((current) =>
            current.map((batchRun) =>
              batchRun.id === binding.batchRunId
                ? {
                    ...batchRun,
                    resultNodeId: binding.nodeId,
                  }
                : batchRun,
            ),
          );
        })
        .catch(() => {
          delete autoBoundBatchRunIdsRef.current[binding.batchRunId];
        });
    }
  }, [apiContext, batchRuns, nodes]);

  useEffect(() => {
    const previousBatchRunIds = previousBatchRunIdsRef.current;
    const nextBatchRunIds = batchRuns.map((batchRun) => batchRun.id);
    const hasNewBatchRun = nextBatchRunIds.some((batchRunId) => !previousBatchRunIds.includes(batchRunId));

    previousBatchRunIdsRef.current = nextBatchRunIds;

    if (hasNewBatchRun) {
      setIsBatchResultsOpen(true);
    }
  }, [batchRuns]);

  useEffect(() => {
    setBatchPreviewPage((currentPage) => Math.min(currentPage, batchPreviewTotalPages));
  }, [batchPreviewTotalPages]);

  useEffect(() => {
    setBatchPreviewPage(1);
  }, [selectedBatchRunId, effectiveSelectedNodeIds]);

  useEffect(() => {
    if (selectedNode?.type === "text") {
      setDraftPrompt(selectedNode.promptInput ?? "");
      setDraftStoryboardSettings(DEFAULT_STORYBOARD_NODE_SETTINGS);
      setSelectedStoryboardShotIndex(0);
      setDraftStoryboardShot(null);
      setDraftImagePrompt("");
      setDraftVideoPrompt("");
      setDraftVideoSettings(DEFAULT_VIDEO_NODE_SETTINGS);
      setDraftVideoModelKey("");
      setDraftResourceRefs(normalizeResourceRefs(selectedNode.resourceRefs));
      setExpandedTextContent(getTextNodeContent(selectedNode.outputSnapshot));

      return;
    }

    if (selectedNode?.type === "storyboard") {
      setDraftPrompt(selectedNode.promptInput ?? "");
      setDraftStoryboardSettings(normalizeStoryboardNodeSettings(selectedNode.settingsJson));
      setSelectedStoryboardShotIndex(0);
      setDraftImagePrompt("");
      setDraftVideoPrompt("");
      setDraftVideoSettings(DEFAULT_VIDEO_NODE_SETTINGS);
      setDraftVideoModelKey("");
      setDraftResourceRefs(normalizeResourceRefs(selectedNode.resourceRefs));
      setExpandedTextContent(getTextNodeContent(selectedNode.outputSnapshot));
      setIsExpandedEditorOpen(false);

      return;
    }

    if (selectedNode?.type === "image") {
      setDraftPrompt("");
      setDraftStoryboardSettings(DEFAULT_STORYBOARD_NODE_SETTINGS);
      setSelectedStoryboardShotIndex(0);
      setDraftStoryboardShot(null);
      setDraftImagePrompt(selectedNode.promptInput ?? "");
      setDraftVideoPrompt("");
      setDraftVideoSettings(DEFAULT_VIDEO_NODE_SETTINGS);
      setDraftVideoModelKey("");
      setDraftResourceRefs(normalizeResourceRefs(selectedNode.resourceRefs));
      setExpandedTextContent("");
      setIsExpandedEditorOpen(false);

      return;
    }

    if (selectedNode?.type === "video") {
      setDraftPrompt("");
      setDraftStoryboardSettings(DEFAULT_STORYBOARD_NODE_SETTINGS);
      setSelectedStoryboardShotIndex(0);
      setDraftStoryboardShot(null);
      setDraftImagePrompt("");
      setDraftVideoPrompt(selectedNode.promptInput ?? "");
      setDraftVideoSettings(normalizeVideoSettingsByModel(normalizeVideoNodeSettings(selectedNode.settingsJson), selectedNode.modelKey ?? ""));
      setDraftVideoModelKey(selectedNode.modelKey ?? "");
      setDraftResourceRefs(normalizeResourceRefs(selectedNode.resourceRefs));
      setExpandedTextContent("");
      setIsExpandedEditorOpen(false);

      return;
    }

    setDraftPrompt("");
    setDraftStoryboardSettings(DEFAULT_STORYBOARD_NODE_SETTINGS);
    setSelectedStoryboardShotIndex(0);
    setDraftStoryboardShot(null);
    setDraftImagePrompt("");
    setDraftVideoPrompt("");
    setDraftVideoSettings(DEFAULT_VIDEO_NODE_SETTINGS);
    setDraftVideoModelKey("");
    setDraftResourceRefs(normalizeResourceRefs(selectedNode?.resourceRefs));
    setExpandedTextContent("");
    setIsExpandedEditorOpen(false);
  }, [selectedNodeDraftIdentity]);

  const handleVideoModelKeyChange = useCallback((value: string) => {
    setDraftVideoModelKey(value);
    setDraftVideoSettings((current) => normalizeVideoSettingsByModel(current, value));
  }, []);

  useEffect(() => {
    if (isExpandedEditorOpen) {
      return;
    }

    if (selectedNode?.type === "text" || selectedNode?.type === "storyboard") {
      setExpandedTextContent(getTextNodeContent(selectedNode.outputSnapshot));
    }
  }, [isExpandedEditorOpen, selectedNode?.id, selectedNode?.outputSnapshot, selectedNode?.type]);

  useEffect(() => {
    applyRuntimeSnapshot({
      canvasVersion: initialCanvasVersion,
      nodes: initialNodes,
      tasks: initialTasks,
      batchRuns: initialBatchRuns,
    });
    setEdges(initialEdges);
    setBatchRunDetailsById({});
    setIsBatchRunDetailLoading(false);
    previousBatchRunIdsRef.current = initialBatchRuns.map((batchRun) => batchRun.id);
  }, [applyRuntimeSnapshot, initialBatchRuns, initialCanvasVersion, initialEdges, initialNodes, initialTasks]);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    let disposed = false;
    let unsubscribe: (() => void) | null = null;

    const connect = () => {
      if (runtimeStreamErrorCountRef.current === 0) {
        setRuntimeSyncState("connecting");
      }

      unsubscribe?.();
      unsubscribe = subscribeCanvasRuntime(apiContext, {
        onSnapshot: (snapshot) => {
          runtimeStreamErrorCountRef.current = 0;
          setRuntimeSyncState("live");
          applyRuntimeSnapshot(snapshot);
        },
        onError: (error) => {
          if (disposed) {
            return;
          }

          runtimeStreamErrorCountRef.current += 1;
          setRuntimeSyncState(runtimeStreamErrorCountRef.current >= 3 ? "degraded" : "reconnecting");
          void refreshCanvasRuntime("画布运行态临时刷新失败。").catch(() => undefined);

          if (runtimeStreamErrorCountRef.current === 1) {
            toast.error(error.message);
          }

          if (runtimeStreamRetryTimeoutRef.current !== null) {
            window.clearTimeout(runtimeStreamRetryTimeoutRef.current);
          }

          runtimeStreamRetryTimeoutRef.current = window.setTimeout(() => {
            if (!disposed) {
              connect();
            }
          }, Math.min(5000, runtimeStreamErrorCountRef.current * 1000));
        },
      });
    };

    connect();

    return () => {
      disposed = true;
      unsubscribe?.();

      if (runtimeStreamRetryTimeoutRef.current !== null) {
        window.clearTimeout(runtimeStreamRetryTimeoutRef.current);
        runtimeStreamRetryTimeoutRef.current = null;
      }
    };
  }, [apiContext, applyRuntimeSnapshot, isHydrated, refreshCanvasRuntime]);

  useEffect(() => {
    if (!isHydrated || !hasActiveCanvasTasks) {
      return;
    }

    const refreshRuntime = () => {
      if (document.visibilityState !== "visible" || isPanning || selectionRect) {
        return;
      }

      void refreshCanvasRuntime("任务状态兜底刷新失败。").catch(() => undefined);
    };
    const intervalMs = runtimeSyncState === "live" ? 15000 : 5000;
    const intervalId = window.setInterval(refreshRuntime, intervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshRuntime();
      }
    };

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hasActiveCanvasTasks, isHydrated, isPanning, refreshCanvasRuntime, runtimeSyncState, selectionRect]);

  const flushCanvasChanges = useCallback(async () => {
    if (!selectedNode || !selectedNodeDraftPatch) {
      setCanvasSaveState("saved");
      await mutationQueueRef.current;

      return true;
    }

    setCanvasSaveState("saving");

    let flushedSelectedNode = false;

    try {
      await saveNodePatch(selectedNode.id, selectedNodeDraftPatch, "节点保存失败。");
      setCanvasSaveState("saved");
      flushedSelectedNode = true;
    } catch {
      setCanvasSaveState("error");
    }

    await mutationQueueRef.current;

    return flushedSelectedNode;
  }, [saveNodePatch, selectedNode, selectedNodeDraftPatch]);
  const isSelectionStateEqual = useCallback(
    (nextSelectedNodeIds: string[], nextSelectedNodeId: string | null) =>
      nextSelectedNodeId === effectiveSelectedNodeId &&
      nextSelectedNodeIds.length === effectiveSelectedNodeIds.length &&
      nextSelectedNodeIds.every((nodeId) => effectiveSelectedNodeIds.includes(nodeId)),
    [effectiveSelectedNodeId, effectiveSelectedNodeIds],
  );
  const ensureSelectionChangeAllowed = useCallback(
    (nextSelectedNodeIds: string[], nextSelectedNodeId: string | null) => {
      if (isSelectionStateEqual(nextSelectedNodeIds, nextSelectedNodeId)) {
        return true;
      }

      if (hasUnsavedCanvasChanges) {
        toast.error("当前节点有未保存修改，请先保存画布。");
        return false;
      }

      return true;
    },
    [hasUnsavedCanvasChanges, isSelectionStateEqual],
  );

  useEffect(() => {
    if (canvasSaveState === "saving") {
      return;
    }

    setCanvasSaveState(selectedNodeDraftPatch ? "unsaved" : "saved");
  }, [canvasSaveState, selectedNodeDraftPatch]);

  useEffect(() => {
    if (!isStoryboardNodeSelected) {
      setDraftStoryboardShot(null);

      return;
    }

    setSelectedStoryboardShotIndex((current) =>
      selectedStoryboardShots.length > 0 ? Math.min(selectedStoryboardShots.length - 1, Math.max(0, current)) : 0,
    );
  }, [isStoryboardNodeSelected, selectedStoryboardShots.length]);

  useEffect(() => {
    if (!isStoryboardNodeSelected) {
      setDraftStoryboardShot(null);

      return;
    }

    const activeShot = selectedStoryboardShots[activeStoryboardShotIndex] ?? null;
    setDraftStoryboardShot(activeShot);
  }, [activeStoryboardShotIndex, isStoryboardNodeSelected, selectedStoryboardShots]);

  useEffect(() => {
    if (!editingTextNodeTitleId) {
      return;
    }

    const editingNode = nodes.find((node) => node.id === editingTextNodeTitleId);

    if (!editingNode) {
      setEditingTextNodeTitleId(null);
      setEditingTextNodeTitle("");

      return;
    }

    setEditingTextNodeTitle(editingNode.title);
  }, [editingTextNodeTitleId, nodes]);

  useEffect(() => {
    if (!textGenerateCooldown.nodeId) {
      return;
    }

    const remaining = textGenerateCooldown.expiresAt - Date.now();

    if (remaining <= 0) {
      setTextGenerateCooldown({ nodeId: null, expiresAt: 0 });

      return;
    }

    const timer = window.setTimeout(() => {
      setTextGenerateCooldown({ nodeId: null, expiresAt: 0 });
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [textGenerateCooldown]);

  useEffect(() => {
    function syncViewportSize() {
      if (!containerRef.current) {
        return;
      }

      setViewportSize({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }

    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);

    return () => window.removeEventListener("resize", syncViewportSize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isFormFieldTarget(event.target)) {
        return;
      }

      setIsSpacePressed(true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      setIsSpacePressed(false);
    };
    const handleBlur = () => {
      setIsSpacePressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const getWorldPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!containerRef.current) {
        return null;
      }

      const containerRect = containerRef.current.getBoundingClientRect();

      return {
        x: camera.x + (clientX - containerRect.left - viewportSize.width / 2) / zoom,
        y: camera.y + (clientY - containerRect.top - viewportSize.height / 2) / zoom,
      };
    },
    [camera.x, camera.y, viewportSize.height, viewportSize.width, zoom],
  );

  const getScreenPoint = useCallback(
    (worldX: number, worldY: number) => {
      return {
        x: viewportSize.width / 2 + (worldX - camera.x) * zoom,
        y: viewportSize.height / 2 + (worldY - camera.y) * zoom,
      };
    },
    [camera.x, camera.y, viewportSize.height, viewportSize.width, zoom],
  );

  const nodeWorldBounds = useMemo(() => {
    return new Map(
      nodes.map((node) => {
        const position = nodePositionMap.get(node.id) ?? {
          x: Number.parseFloat(node.positionX || "0"),
          y: Number.parseFloat(node.positionY || "0"),
        };
        const imagePreviewDimensions =
          imagePreviewSizes[node.id] ??
          (node.referenceAssets?.[0]?.width && node.referenceAssets?.[0]?.height
            ? {
                width: node.referenceAssets[0].width,
                height: node.referenceAssets[0].height,
              }
            : null);
        const dimensions = getCanvasNodeDimensions(node, imagePreviewDimensions);

        return [
          node.id,
          {
            left: position.x - dimensions.width / 2,
            right: position.x + dimensions.width / 2,
            top: position.y - dimensions.height / 2,
            bottom: position.y + dimensions.height / 2,
          },
        ];
      }),
    );
  }, [imagePreviewSizes, nodePositionMap, nodes]);

  const nodeScreenBounds = useMemo(() => {
    return new Map(
      Array.from(nodeWorldBounds.entries()).map(([nodeId, bounds]) => {
        const topLeft = getScreenPoint(bounds.left, bounds.top);
        const bottomRight = getScreenPoint(bounds.right, bounds.bottom);

        return [
          nodeId,
          {
            left: topLeft.x,
            right: bottomRight.x,
            top: topLeft.y,
            bottom: bottomRight.y,
          },
        ];
      }),
    );
  }, [getScreenPoint, nodeWorldBounds]);
  const getGroupedWorldBounds = useCallback(
    (nodeIds: string[]) => {
      const groupedBounds = nodeIds
        .map((nodeId) => nodeWorldBounds.get(nodeId))
        .filter((bounds): bounds is NonNullable<typeof nodeWorldBounds extends Map<string, infer TValue> ? TValue : never> =>
          Boolean(bounds),
        );

      if (groupedBounds.length === 0) {
        return null;
      }

      return groupedBounds.reduce(
        (accumulator, bounds) => ({
          left: Math.min(accumulator.left, bounds.left),
          right: Math.max(accumulator.right, bounds.right),
          top: Math.min(accumulator.top, bounds.top),
          bottom: Math.max(accumulator.bottom, bounds.bottom),
        }),
        {
          left: groupedBounds[0].left,
          right: groupedBounds[0].right,
          top: groupedBounds[0].top,
          bottom: groupedBounds[0].bottom,
        },
      );
    },
    [nodeWorldBounds],
  );
  const groupLayouts = useMemo(() => {
    return Array.from(groupNodeIdsMap.entries())
      .map(([groupId, nodeIds]) => {
        if (nodeIds.length < 2) {
          return null;
        }

        const worldBounds = getGroupedWorldBounds(nodeIds);

        if (!worldBounds) {
          return null;
        }

        const padding = 36 / zoom;
        const topLeft = getScreenPoint(worldBounds.left - padding, worldBounds.top - padding);
        const bottomRight = getScreenPoint(worldBounds.right + padding, worldBounds.bottom + padding);

        return {
          id: groupId,
          nodeIds,
          left: topLeft.x,
          top: topLeft.y,
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y,
          isFullySelected: nodeIds.every((nodeId) => effectiveSelectedNodeIds.includes(nodeId)),
        };
      })
      .filter((group): group is NonNullable<typeof group> => Boolean(group));
  }, [effectiveSelectedNodeIds, getGroupedWorldBounds, getScreenPoint, groupNodeIdsMap, zoom]);

  const getLocalScreenPoint = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) {
      return null;
    }

    const containerRect = containerRef.current.getBoundingClientRect();

    return {
      x: clientX - containerRect.left,
      y: clientY - containerRect.top,
    };
  }, []);
  const getViewportCenterClientPoint = useCallback(() => {
    if (!containerRef.current) {
      return null;
    }

    const containerRect = containerRef.current.getBoundingClientRect();

    return {
      x: containerRect.left + viewportSize.width / 2,
      y: containerRect.top + viewportSize.height / 2,
    };
  }, [viewportSize.height, viewportSize.width]);

  const updateZoom = useCallback(
    (nextZoom: number, clientX?: number, clientY?: number) => {
      const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));

      if (!containerRef.current || clampedZoom === zoom) {
        setZoom(clampedZoom);

        return;
      }

      if (typeof clientX === "number" && typeof clientY === "number") {
        const containerRect = containerRef.current.getBoundingClientRect();
        const anchorX = clientX - containerRect.left - viewportSize.width / 2;
        const anchorY = clientY - containerRect.top - viewportSize.height / 2;
        const worldX = camera.x + anchorX / zoom;
        const worldY = camera.y + anchorY / zoom;

        setCamera({
          x: worldX - anchorX / clampedZoom,
          y: worldY - anchorY / clampedZoom,
        });
      }

      setZoom(clampedZoom);
    },
    [camera.x, camera.y, viewportSize.height, viewportSize.width, zoom],
  );

  const handleCanvasWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault();

      if (event.ctrlKey || event.metaKey) {
        const nextZoom = zoom * Math.exp(-clampWheelDelta(event.deltaY, 120) * 0.0018);

        updateZoom(nextZoom, event.clientX, event.clientY);

        return;
      }

      setCamera((current) => ({
        x: current.x + clampWheelDelta(event.deltaX, 80) / zoom,
        y: current.y + clampWheelDelta(event.deltaY, 80) / zoom,
      }));
    },
    [updateZoom, zoom],
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const preventGestureDefault = (event: Event) => {
      event.preventDefault();
    };

    container.addEventListener("wheel", handleCanvasWheel, { passive: false });
    container.addEventListener("gesturestart", preventGestureDefault);
    container.addEventListener("gesturechange", preventGestureDefault);
    container.addEventListener("gestureend", preventGestureDefault);

    return () => {
      container.removeEventListener("wheel", handleCanvasWheel);
      container.removeEventListener("gesturestart", preventGestureDefault);
      container.removeEventListener("gesturechange", preventGestureDefault);
      container.removeEventListener("gestureend", preventGestureDefault);
    };
  }, [handleCanvasWheel]);

  const syncImagePreviewSize = useCallback((nodeId: string, width: number, height: number) => {
    if (width <= 0 || height <= 0) {
      return;
    }

    setImagePreviewSizes((current) => {
      const existing = current[nodeId];

      if (existing && existing.width === width && existing.height === height) {
        return current;
      }

      return {
        ...current,
        [nodeId]: { width, height },
      };
    });
  }, []);

  const persistNodePositions = useCallback(
    async (updates: Array<{ nodeId: string; x: number; y: number }>) => {
      if (updates.length === 0) {
        return;
      }

      setSavingNodeId(updates.length === 1 ? updates[0].nodeId : "group");

      try {
        await runGraphMutation(
          [
            {
              type: "move_nodes",
              updates: updates.map(({ nodeId, x, y }) => ({
                nodeId,
                positionX: Math.round(x),
                positionY: Math.round(y),
              })),
            },
          ],
          "节点位置保存失败。",
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "节点位置保存失败。");
      } finally {
        setSavingNodeId(null);
      }
    },
    [runGraphMutation],
  );
  const persistNodePosition = useCallback(
    async (nodeId: string, x: number, y: number) => {
      await persistNodePositions([{ nodeId, x, y }]);
    },
    [persistNodePositions],
  );
  const updateNodeGroupAssignments = useCallback(
    async (
      updates: Array<{ nodeId: string; groupId: string | null }>,
      successMessage: string,
      fallbackMessage = "节点组合保存失败。",
    ) => {
      const dedupedUpdates = Array.from(new Map(updates.map((update) => [update.nodeId, update.groupId])).entries())
        .map(([nodeId, groupId]) => {
          const targetNode = nodeById.get(nodeId);

          return targetNode ? { node: targetNode, groupId } : null;
        })
        .filter((item): item is { node: CanvasNode; groupId: string | null } => Boolean(item));

      if (dedupedUpdates.length === 0) {
        return false;
      }

      try {
        const groupIdByNodeId = new Map(dedupedUpdates.map(({ node, groupId }) => [node.id, groupId]));

        setNodes((current) =>
          current.map((node) =>
            groupIdByNodeId.has(node.id)
              ? applyNodePatchToLocal(node, {
                  settingsJson: setCanvasNodeGroupId(node.settingsJson ?? {}, groupIdByNodeId.get(node.id) ?? null),
                })
              : node,
          ),
        );
        await runGraphMutation(
          dedupedUpdates.map(({ node, groupId }) => ({
            type: "update_node" as const,
            nodeId: node.id,
            patch: {
              settingsJson: setCanvasNodeGroupId(node.settingsJson ?? {}, groupId),
            },
          })),
          fallbackMessage,
          {
            successMessage,
          },
        );

        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : fallbackMessage);

        return false;
      }
    },
    [applyNodePatchToLocal, nodeById, runGraphMutation],
  );

  const clearPendingConnection = useCallback(() => {
    setPendingConnectionSourceId(null);
    setPendingConnectionPointer(null);
  }, []);

  const isCanvasInteractiveTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest("[data-canvas-node-id], [data-canvas-edge='true']"));
  }, []);

  const handleSelectNode = useCallback(
    async (nodeId: string, options?: { additive: boolean }) => {
      setSelectedEdgeId(null);

      if (options?.additive) {
        const isSelected = effectiveSelectedNodeIds.includes(nodeId);
        const nextSelectedNodeIds = isSelected
          ? effectiveSelectedNodeIds.filter((currentNodeId) => currentNodeId !== nodeId)
          : [...effectiveSelectedNodeIds, nodeId];
        const nextSelectedNodeId = isSelected ? nextSelectedNodeIds[nextSelectedNodeIds.length - 1] ?? null : nodeId;

        if (!ensureSelectionChangeAllowed(nextSelectedNodeIds, nextSelectedNodeId)) {
          return;
        }

        setSelectedNodeIds(nextSelectedNodeIds);
        setSelectedNodeId(nextSelectedNodeId);

        return;
      }

      if (!ensureSelectionChangeAllowed([nodeId], nodeId)) {
        return;
      }

      setSelectedNodeIds([nodeId]);
      setSelectedNodeId(nodeId);
    },
    [effectiveSelectedNodeIds, ensureSelectionChangeAllowed],
  );
  const handleSelectGroup = useCallback(
    async (groupId: string) => {
      const memberIds = groupNodeIdsMap.get(groupId) ?? [];

      if (memberIds.length === 0) {
        return;
      }

      const nextSelectedNodeId = memberIds[memberIds.length - 1] ?? null;

      if (!ensureSelectionChangeAllowed(memberIds, nextSelectedNodeId)) {
        return;
      }

      setSelectedEdgeId(null);
      setSelectedNodeIds(memberIds);
      setSelectedNodeId(nextSelectedNodeId);
    },
    [ensureSelectionChangeAllowed, groupNodeIdsMap],
  );
  const handleGroupSelectedNodes = useCallback(async () => {
    if (!canEdit || effectiveSelectedNodeIds.length < 2) {
      return;
    }

    const nextGroupId = `group-${crypto.randomUUID()}`;
    const nextUpdates: Array<{ nodeId: string; groupId: string | null }> = effectiveSelectedNodeIds.map((nodeId) => ({
      nodeId,
      groupId: nextGroupId,
    }));

    for (const groupId of selectedGroupIds) {
      const remainingMemberIds = (groupNodeIdsMap.get(groupId) ?? []).filter(
        (nodeId) => !effectiveSelectedNodeIds.includes(nodeId),
      );

      if (remainingMemberIds.length < 2) {
        nextUpdates.push(...remainingMemberIds.map((nodeId) => ({ nodeId, groupId: null })));
      }
    }

    const applied = await updateNodeGroupAssignments(nextUpdates, "已创建组合，拖动组合标签即可整体移动。");

    if (applied) {
      setSelectedNodeIds(effectiveSelectedNodeIds);
      setSelectedNodeId(effectiveSelectedNodeIds[effectiveSelectedNodeIds.length - 1] ?? null);
    }
  }, [canEdit, effectiveSelectedNodeIds, groupNodeIdsMap, selectedGroupIds, updateNodeGroupAssignments]);
  const handleUngroupSelectedNodes = useCallback(async () => {
    const groupedNodeIds = effectiveSelectedNodeIds.filter((nodeId) => nodeGroupIdByNode.get(nodeId));

    if (groupedNodeIds.length === 0) {
      return;
    }

    const nextUpdates: Array<{ nodeId: string; groupId: string | null }> = groupedNodeIds.map((nodeId) => ({
      nodeId,
      groupId: null,
    }));
    const affectedGroupIds = Array.from(
      new Set(groupedNodeIds.map((nodeId) => nodeGroupIdByNode.get(nodeId)).filter((groupId): groupId is string => Boolean(groupId))),
    );

    for (const groupId of affectedGroupIds) {
      const remainingMemberIds = (groupNodeIdsMap.get(groupId) ?? []).filter((nodeId) => !groupedNodeIds.includes(nodeId));

      if (remainingMemberIds.length < 2) {
        nextUpdates.push(...remainingMemberIds.map((nodeId) => ({ nodeId, groupId: null })));
      }
    }

    await updateNodeGroupAssignments(
      nextUpdates,
      groupedNodeIds.length === 1 ? "节点已移出组合。" : "组合已解散。",
    );
  }, [effectiveSelectedNodeIds, groupNodeIdsMap, nodeGroupIdByNode, updateNodeGroupAssignments]);
  const maybeRemoveNodeFromGroup = useCallback(
    async (nodeId: string, groupId: string, finalPosition: { x: number; y: number }) => {
      const remainingMemberIds = (groupNodeIdsMap.get(groupId) ?? []).filter((memberId) => memberId !== nodeId);

      if (remainingMemberIds.length === 0) {
        await updateNodeGroupAssignments([{ nodeId, groupId: null }], "节点已移出组合。");

        return;
      }

      const remainingBounds = getGroupedWorldBounds(remainingMemberIds);

      if (!remainingBounds) {
        return;
      }

      const detachPadding = 24;
      const isOutsideGroup =
        finalPosition.x < remainingBounds.left - detachPadding ||
        finalPosition.x > remainingBounds.right + detachPadding ||
        finalPosition.y < remainingBounds.top - detachPadding ||
        finalPosition.y > remainingBounds.bottom + detachPadding;

      if (!isOutsideGroup) {
        return;
      }

      const nextUpdates: Array<{ nodeId: string; groupId: string | null }> = [{ nodeId, groupId: null }];

      if (remainingMemberIds.length === 1) {
        nextUpdates.push({ nodeId: remainingMemberIds[0], groupId: null });
      }

      await updateNodeGroupAssignments(
        nextUpdates,
        remainingMemberIds.length === 1 ? "组合已自动解散。" : "节点已移出组合。",
      );
    },
    [getGroupedWorldBounds, groupNodeIdsMap, updateNodeGroupAssignments],
  );
  const startGroupDrag = useCallback(
    async (groupId: string, clientX: number, clientY: number) => {
      if (!canEdit) {
        return;
      }

      const origin = getWorldPoint(clientX, clientY);
      const memberIds = (groupNodeIdsMap.get(groupId) ?? []).filter((nodeId) => nodePositionMap.has(nodeId));

      if (!origin || memberIds.length < 2) {
        return;
      }

      const initialPositions = Object.fromEntries(
        memberIds.map((nodeId) => {
          const position = nodePositionMap.get(nodeId) ?? { x: 0, y: 0 };

          return [nodeId, position];
        }),
      ) as Record<string, { x: number; y: number }>;

      const nextSelectedNodeId = memberIds[memberIds.length - 1] ?? null;

      if (!ensureSelectionChangeAllowed(memberIds, nextSelectedNodeId)) {
        return;
      }

      setSelectedEdgeId(null);
      setSelectedNodeIds(memberIds);
      setSelectedNodeId(nextSelectedNodeId);
      let moved = false;
      const pointerOrigin = { x: clientX, y: clientY };
      let animationFrameId: number | null = null;
      let pendingPositions: Record<string, { x: number; y: number }> | null = null;

      const flushPendingPositions = () => {
        animationFrameId = null;

        if (!pendingPositions) {
          return;
        }

        const nextPositions = pendingPositions;
        pendingPositions = null;

        setNodePositions((current) => ({
          ...current,
          ...nextPositions,
        }));
      };

      const handlePointerMove = (event: PointerEvent) => {
        if (!moved && !hasExceededPointerThreshold(pointerOrigin, { x: event.clientX, y: event.clientY })) {
          return;
        }

        const nextPoint = getWorldPoint(event.clientX, event.clientY);

        if (!nextPoint) {
          return;
        }

        moved = true;
        const deltaX = nextPoint.x - origin.x;
        const deltaY = nextPoint.y - origin.y;
        pendingPositions = Object.fromEntries(
          memberIds.map((nodeId) => {
            const initialPosition = initialPositions[nodeId];

            return [
              nodeId,
              {
                x: initialPosition.x + deltaX,
                y: initialPosition.y + deltaY,
              },
            ];
          }),
        ) as Record<string, { x: number; y: number }>;

        if (animationFrameId === null) {
          animationFrameId = window.requestAnimationFrame(flushPendingPositions);
        }
      };

      const handlePointerUp = async (event: PointerEvent) => {
        const nextPoint = getWorldPoint(event.clientX, event.clientY);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);

        if (animationFrameId !== null) {
          window.cancelAnimationFrame(animationFrameId);
          flushPendingPositions();
        }

        if (!nextPoint || !moved) {
          return;
        }

        const deltaX = nextPoint.x - origin.x;
        const deltaY = nextPoint.y - origin.y;
        const updates = memberIds.map((nodeId) => ({
          nodeId,
          x: initialPositions[nodeId].x + deltaX,
          y: initialPositions[nodeId].y + deltaY,
        }));

        setNodePositions((current) => ({
          ...current,
          ...Object.fromEntries(updates.map(({ nodeId, x, y }) => [nodeId, { x, y }])),
        }));
        await persistNodePositions(updates);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [canEdit, ensureSelectionChangeAllowed, getWorldPoint, groupNodeIdsMap, nodePositionMap, persistNodePositions],
  );

  const startBatchRunForNodes = useCallback(async (selectedRunnableNodes: CanvasNode[], runCount: number) => {
    setIsBatchRunning(true);

    try {
      const result = await runCanvasNodeBatch(
        apiContext,
        {
          nodeIds: selectedRunnableNodes.map((node) => node.id),
          runCount,
        },
        "批量运行失败。",
      );
      const batchRunId = typeof result.batch_run_id === "string" ? result.batch_run_id : null;
      const resolvedRunCount = typeof result.run_count === "number" ? result.run_count : runCount;

      if (batchRunId && canEdit) {
        const selectedSourceNodes = selectedRunnableNodes;

        if (selectedSourceNodes.length > 0) {
          const selectedSourceIdSet = new Set(selectedSourceNodes.map((node) => node.id));
          const terminalNodes = selectedSourceNodes.filter(
            (node) => !edges.some((edge) => edge.sourceNodeId === node.id && selectedSourceIdSet.has(edge.targetNodeId)),
          );
          const anchorNodes = terminalNodes.length > 0 ? terminalNodes : selectedSourceNodes;
          const anchorPositions = anchorNodes.map((node) => ({
            x: Number.parseFloat(node.positionX || "0"),
            y: Number.parseFloat(node.positionY || "0"),
          }));
          const averageY = anchorPositions.reduce((sum, point) => sum + point.y, 0) / anchorPositions.length;
          const rightMostX = Math.max(...anchorPositions.map((point) => point.x));
          const clientId = `batch-result-${crypto.randomUUID()}`;
          const batchResultEdgeOperations: CanvasGraphOperation[] = anchorNodes.map((node, index) => ({
            type: "create_edge",
            edge: {
              sourceNodeId: node.id,
              targetNodeId: clientId,
              mergeMode: index === 0 ? "previous_only" : "merge_all",
              priority: index,
            },
          }));
          const graphMutationResult = await runGraphMutation(
            [
              {
                type: "create_node",
                clientId,
                node: {
                  type: "batch_result",
                  title: anchorNodes.length === 1 ? `${anchorNodes[0].title} · 批量产出` : "批量产出",
                  promptInput: "",
                  outputSnapshot: {
                    outputType: "json",
                    structuredData: {
                      batchRunId,
                      runCount: resolvedRunCount,
                      sourceNodeIds: selectedSourceNodes.map((node) => node.id),
                      terminalNodeIds: anchorNodes.map((node) => node.id),
                    },
                    generatedAt: new Date().toISOString(),
                  },
                  settingsJson: {
                    batchRunId,
                    sourceMode: selectedSourceNodes.length === 1 ? "single_node" : "group",
                    sourceNodeIds: selectedSourceNodes.map((node) => node.id),
                    terminalNodeIds: anchorNodes.map((node) => node.id),
                  },
                  resourceRefs: {
                    subjectIds: [],
                    sceneIds: [],
                    instructionPresetIds: [],
                    assetIds: [],
                  },
                  positionX: Math.round(rightMostX + 420),
                  positionY: Math.round(averageY),
                },
              },
              ...batchResultEdgeOperations,
            ],
            "批量产出节点创建失败。",
          );
          const createdBatchResultNodeId =
            graphMutationResult.operationResults.find((item) => item.type === "create_node" && item.clientId === clientId)?.nodeId ??
            null;

          if (createdBatchResultNodeId) {
            await bindCanvasBatchRunResultNode(apiContext, batchRunId, createdBatchResultNodeId);
            setSelectedNodeIds([createdBatchResultNodeId]);
            setSelectedNodeId(createdBatchResultNodeId);
          }
        }
      }

      if (batchRunId) {
        setSelectedBatchRunId(batchRunId);
        setIsBatchResultsOpen(true);
        const detail = await fetchCanvasBatchRunDetail(apiContext, batchRunId);
        setBatchRunDetailsById((current) => ({
          ...current,
          [detail.id]: detail,
        }));
      }

      toast.success(
        `已触发 ${result.node_count ?? selectedRunnableNodes.length} 个节点，共 ${resolvedRunCount} 轮批量运行。`,
      );
      await refreshCanvasRuntime("批量运行状态刷新失败。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量运行失败。");
    } finally {
      setIsBatchRunning(false);
    }
  }, [
    apiContext,
    canEdit,
    edges,
    refreshCanvasRuntime,
    runGraphMutation,
  ]);
  const handleRunSelectedNodes = useCallback(async () => {
    if (!canGenerate) {
      return;
    }

    if (effectiveSelectedNodeIds.length === 0) {
      toast.error("请先选中至少一个节点。");

      return;
    }

    if (hasRunningSelectedNode) {
      toast.error("所选节点中仍有运行中的任务，请稍后再试。");

      return;
    }

    if (hasUnsavedCanvasChanges) {
      toast.error("批量运行前请先保存画布。");

      return;
    }

    const selectedRunnableNodes = nodes.filter(
      (node) => effectiveSelectedNodeIds.includes(node.id) && canCanvasNodeRun(node.type),
    );

    if (selectedRunnableNodes.length !== effectiveSelectedNodeIds.length) {
      toast.error("当前批量运行仅支持文本、分镜、图片和视频节点。");

      return;
    }

    await startBatchRunForNodes(selectedRunnableNodes, batchRunCount);
  }, [
    batchRunCount,
    canGenerate,
    effectiveSelectedNodeIds,
    hasRunningSelectedNode,
    hasUnsavedCanvasChanges,
    nodes,
    startBatchRunForNodes,
  ]);
  const triggerNodeExecution = useCallback(
    async (node: CanvasNode, options: { requestPrefix: string; fallbackMessage: string; singleRunSuccessMessage: string }) => {
      if (autoBatchRunnableNodeIds.has(node.id)) {
        if (hasUnsavedCanvasChanges) {
          toast.error("批量运行前请先保存画布。");
          return false;
        }

        await startBatchRunForNodes([node], 1);
        return true;
      }

      await runCanvasNode(apiContext, node.id, `${options.requestPrefix}-${crypto.randomUUID()}`, options.fallbackMessage);
      await refreshCanvasRuntime("任务状态刷新失败。");
      toast.success(options.singleRunSuccessMessage);
      return false;
    },
    [apiContext, autoBatchRunnableNodeIds, hasUnsavedCanvasChanges, refreshCanvasRuntime, startBatchRunForNodes],
  );
  const handleExtractBatchResultToStandaloneNode = useCallback(
    async (batchResultNodeId: string, run: CanvasBatchRunResult | CanvasBatchRunResultIndex) => {
      if (!canEdit || (!run.assetFileUrl && !run.contentText)) {
        return;
      }

      const batchResultNode = nodeById.get(batchResultNodeId);

      if (!batchResultNode) {
        toast.error("批量产出节点不存在。");

        return;
      }

      const sourceNode = nodeById.get(run.nodeId) ?? null;
      const basePosition = nodePositionMap.get(batchResultNodeId) ?? {
        x: Number.parseFloat(batchResultNode.positionX || "0"),
        y: Number.parseFloat(batchResultNode.positionY || "0"),
      };
      const resultMeta =
        run.resultMeta && typeof run.resultMeta === "object" && !Array.isArray(run.resultMeta) ? run.resultMeta : {};
      const extractedNodeType: CanvasNode["type"] =
        run.assetMimeType?.startsWith("image/") || run.resultType === "image"
          ? "image"
          : run.assetMimeType?.startsWith("audio/") || run.resultType === "audio"
            ? "audio"
            : run.assetMimeType?.startsWith("video/") || run.resultType === "video"
              ? "video"
              : "text";
      const clientId = `extract-batch-result-${crypto.randomUUID()}`;
      const generatedAtSource = run.finishedAt ?? run.createdAt;
      const generatedAt =
        generatedAtSource instanceof Date
          ? generatedAtSource.toISOString()
          : typeof generatedAtSource === "string" && generatedAtSource.trim().length > 0
            ? generatedAtSource
            : new Date().toISOString();
      const outputSnapshot = {
        taskId: run.taskId ?? undefined,
        outputType: extractedNodeType === "text" ? (run.resultType === "json" ? "json" : "text") : extractedNodeType,
        content: run.assetFileUrl ?? run.contentText ?? "",
        assets: run.assetId && run.assetFileUrl
          ? [
              {
                assetId: run.assetId,
                assetType: extractedNodeType,
                url: run.assetFileUrl,
                mimeType: run.assetMimeType ?? undefined,
              },
            ]
          : undefined,
        structuredData: {
          ...resultMeta,
          assetUrl: run.assetFileUrl ?? undefined,
          assetId: run.assetId ?? (typeof resultMeta.assetId === "string" ? resultMeta.assetId : undefined),
        },
        generatedAt,
      };

      try {
        const result = await runGraphMutation(
          [
            {
              type: "create_node",
              clientId,
              node: {
                type: extractedNodeType,
                title: `${sourceNode?.title || run.nodeTitle || "结果"} · ${run.runIndex ? `第 ${run.runIndex} 轮` : "提取结果"}`,
                promptInput: sourceNode?.promptInput ?? "",
                outputSnapshot,
                modelKey: sourceNode?.modelKey ?? undefined,
                settingsJson:
                  sourceNode?.type === extractedNodeType
                    ? sourceNode.settingsJson ?? {}
                    : getDefaultCanvasNodeSettings(extractedNodeType),
                resourceRefs: sourceNode?.resourceRefs ?? {
                  subjectIds: [],
                  sceneIds: [],
                  instructionPresetIds: [],
                  assetIds: [],
                },
                positionX: Math.round(basePosition.x + 400),
                positionY: Math.round(basePosition.y + ((run.runIndex ?? 1) - 1) * 28),
              },
            },
          ],
          "提取独立视频节点失败。",
        );
        const createdNodeId =
          result.operationResults.find((item) => item.type === "create_node" && item.clientId === clientId)?.nodeId ?? null;

        if (!createdNodeId) {
          throw new Error("结果节点创建成功，但未返回节点 ID。");
        }

        await saveNodePatch(createdNodeId, { status: "succeeded" }, "独立视频节点状态更新失败。");
        setSelectedNodeIds([createdNodeId]);
        setSelectedNodeId(createdNodeId);
        toast.success(`已提取${run.nodeTitle || "结果"}为独立节点。`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "提取独立结果节点失败。");
      }
    },
    [canEdit, nodeById, nodePositionMap, runGraphMutation, saveNodePatch],
  );
  const handleRetryBatchRunItem = useCallback(
    async (batchRunId: string, itemId: string) => {
      try {
        await retryCanvasBatchRunItem(apiContext, batchRunId, itemId);
        toast.success("已加入单实例重试。");
        await refreshCanvasRuntime();
        const batchRun = batchRuns.find((item) => item.id === batchRunId) ?? null;
        const query = getBatchRunDetailQuery(batchRunId);
        const detail = await fetchCanvasBatchRunDetail(
          apiContext,
          batchRunId,
          getBatchRunDetailRequestOptions(batchRun, query),
        );

        setBatchRunDetailsById((current) => ({
          ...current,
          [batchRunId]: detail,
        }));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "单实例重试失败。");
      }
    },
    [apiContext, batchRuns, getBatchRunDetailQuery, getBatchRunDetailRequestOptions, refreshCanvasRuntime],
  );
  const handleSaveCanvas = useCallback(async () => {
    const saved = await flushCanvasChanges();

    if (saved) {
      toast.success("画布已保存。");
      return;
    }

    if (!hasUnsavedCanvasChanges) {
      toast.success("当前没有需要保存的修改。");
      return;
    }

    toast.error("画布保存失败。");
  }, [flushCanvasChanges, hasUnsavedCanvasChanges]);

  const startMarqueeSelection = useCallback(
    (clientX: number, clientY: number, additive: boolean) => {
      const origin = getLocalScreenPoint(clientX, clientY);

      if (!origin) {
        return;
      }

      setSelectionRect({
        startX: origin.x,
        startY: origin.y,
        currentX: origin.x,
        currentY: origin.y,
      });

      const handlePointerMove = (event: PointerEvent) => {
        const nextPoint = getLocalScreenPoint(event.clientX, event.clientY);

        if (!nextPoint) {
          return;
        }

        setSelectionRect({
          startX: origin.x,
          startY: origin.y,
          currentX: nextPoint.x,
          currentY: nextPoint.y,
        });
      };

      const handlePointerUp = (event: PointerEvent) => {
        const nextPoint = getLocalScreenPoint(event.clientX, event.clientY) ?? origin;
        const left = Math.min(origin.x, nextPoint.x);
        const right = Math.max(origin.x, nextPoint.x);
        const top = Math.min(origin.y, nextPoint.y);
        const bottom = Math.max(origin.y, nextPoint.y);
        const width = right - left;
        const height = bottom - top;

        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        setSelectionRect(null);

        if (width < 6 && height < 6) {
          if (!additive) {
            setSelectedNodeIds([]);
            setSelectedNodeId(null);
          }

          return;
        }

        const matchedNodeIds = nodes
          .filter((node) => {
            const bounds = nodeScreenBounds.get(node.id);

            if (!bounds) {
              return false;
            }

            return !(bounds.right < left || bounds.left > right || bounds.bottom < top || bounds.top > bottom);
          })
          .map((node) => node.id);

        if (additive) {
          const nextSelectedNodeIds = Array.from(new Set([...effectiveSelectedNodeIds, ...matchedNodeIds]));
          setSelectedNodeIds(nextSelectedNodeIds);
          setSelectedNodeId(matchedNodeIds[matchedNodeIds.length - 1] ?? effectiveSelectedNodeId);

          return;
        }

        setSelectedNodeIds(matchedNodeIds);
        setSelectedNodeId(matchedNodeIds[matchedNodeIds.length - 1] ?? null);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [effectiveSelectedNodeId, effectiveSelectedNodeIds, getLocalScreenPoint, nodeScreenBounds, nodes],
  );

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      const deletingNode = nodes.find((node) => node.id === nodeId);

      if (!deletingNode) {
        return;
      }

      const nextSelectedNodeId =
        effectiveSelectedNodeId === nodeId ? nodes.find((node) => node.id !== nodeId)?.id ?? null : effectiveSelectedNodeId;

      setDeletingNodeId(nodeId);

      try {
        const operations: CanvasGraphOperation[] = [
          {
            type: "delete_node",
            nodeId,
          },
        ];
        const deletedGroupId = getCanvasNodeGroupId(deletingNode.settingsJson);

        if (deletedGroupId) {
          const remainingGroupNodeIds = (groupNodeIdsMap.get(deletedGroupId) ?? []).filter((memberId) => memberId !== nodeId);

          if (remainingGroupNodeIds.length === 1) {
            const remainingNode = nodeById.get(remainingGroupNodeIds[0]);

            if (remainingNode) {
              operations.push({
                type: "update_node",
                nodeId: remainingNode.id,
                patch: {
                  settingsJson: setCanvasNodeGroupId(remainingNode.settingsJson ?? {}, null),
                },
              });
            }
          }
        }

        await runGraphMutation(operations, "节点删除失败。");

        setSelectedNodeId(nextSelectedNodeId);
        setSelectedNodeIds((current) => {
          const nextNodeIds = current.filter((currentNodeId) => currentNodeId !== nodeId);

          return nextSelectedNodeId && !nextNodeIds.includes(nextSelectedNodeId)
            ? [...nextNodeIds, nextSelectedNodeId]
            : nextNodeIds;
        });

        if (effectiveSelectedNodeId === nodeId) {
          setIsExpandedEditorOpen(false);
        }

        if (editingTextNodeTitleId === nodeId) {
          setEditingTextNodeTitleId(null);
          setEditingTextNodeTitle("");
        }

        setNodePositions((current) => {
          const nextPositions = { ...current };
          delete nextPositions[nodeId];

          return nextPositions;
        });
        setImagePreviewSizes((current) => {
          const nextSizes = { ...current };
          delete nextSizes[nodeId];

          return nextSizes;
        });

        if (nodes.length === 1) {
          setIsCreateOpen(true);
        }

        toast.success("节点已删除，关联边已一并清理。");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "节点删除失败。");
      } finally {
        setDeletingNodeId(null);
      }
    },
    [editingTextNodeTitleId, effectiveSelectedNodeId, groupNodeIdsMap, nodeById, nodes, runGraphMutation],
  );

  const handleStartConnection = useCallback(
    async (nodeId: string) => {
      if (!canEdit) {
        return;
      }

      if (pendingConnectionSourceId === nodeId) {
        clearPendingConnection();

        return;
      }

      const nodePosition = nodePositionMap.get(nodeId);

      if (!nodePosition) {
        return;
      }

      if (!ensureSelectionChangeAllowed([nodeId], nodeId)) {
        return;
      }

      setSelectedNodeIds([nodeId]);
      setSelectedNodeId(nodeId);
      setPendingConnectionSourceId(nodeId);
      setPendingConnectionPointer(getScreenPoint(nodePosition.x, nodePosition.y));
    },
    [canEdit, clearPendingConnection, ensureSelectionChangeAllowed, getScreenPoint, nodePositionMap, pendingConnectionSourceId],
  );

  const handleCompleteConnection = useCallback(
    async (targetNodeId: string) => {
      if (!pendingConnectionSourceId || pendingConnectionSourceId === targetNodeId) {
        clearPendingConnection();

        return;
      }

      const sourceNode = nodeById.get(pendingConnectionSourceId);
      const targetNode = nodeById.get(targetNodeId);

      if (!sourceNode || !targetNode) {
        clearPendingConnection();

        return;
      }

      const semantic = getCanvasConnectionSemantic(sourceNode.type, targetNode.type);

      if (!semantic) {
        toast.error("当前支持 输入源→组合、组合→生成节点、生成节点→批量产出，以及既有的文本/分镜/图片链路。");
        clearPendingConnection();

        return;
      }

      try {
        await runGraphMutation(
          [
            {
              type: "create_edge",
              edge: {
                sourceNodeId: sourceNode.id,
                targetNodeId: targetNode.id,
                mergeMode: "merge_all",
                priority: edges.filter((edge) => edge.targetNodeId === targetNodeId).length,
              },
            },
          ],
          "创建连线失败。",
          {
            successMessage: `${sourceNode.title} 已连接到 ${targetNode.title}，会自动作为${getCanvasConnectionLabel(sourceNode.type, targetNode.type)}。`,
          },
        );
        clearPendingConnection();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "创建连线失败。");
        clearPendingConnection();
      }
    },
    [clearPendingConnection, edges, nodeById, pendingConnectionSourceId, runGraphMutation],
  );

  const handleDeleteEdge = useCallback(
    async (edgeId: string) => {
      try {
        await runGraphMutation(
          [
            {
              type: "delete_edge",
              edgeId,
            },
          ],
          "删除连线失败。",
        );
        setSelectedEdgeId((current) => (current === edgeId ? null : current));
        toast.success("连线已删除。");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "删除连线失败。");
      }
    },
    [runGraphMutation],
  );

  useEffect(() => {
    if (!canEdit) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isFormFieldTarget(event.target)) {
        return;
      }

      if (event.key === "Escape" && pendingConnectionSourceId) {
        event.preventDefault();
        clearPendingConnection();

        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      if (selectedEdgeId) {
        event.preventDefault();
        void handleDeleteEdge(selectedEdgeId);

        return;
      }

      if (!selectedNode) {
        return;
      }

      event.preventDefault();
      void handleDeleteNode(selectedNode.id);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canEdit, clearPendingConnection, handleDeleteEdge, handleDeleteNode, pendingConnectionSourceId, selectedEdgeId, selectedNode]);

  function getNextCreatePosition() {
    const stackOffset = nodes.length % 5;

    return {
      x: camera.x + stackOffset * 36,
      y: camera.y + stackOffset * 28,
    };
  }

  async function createNodeAtPosition(type: CanvasNodeType, x: number, y: number) {
    try {
      const option = quickCreateOptions.find((item) => item.value === type);
      const nextNodeIndex = (nodeCountByType[type] ?? 0) + 1;
      const clientId = `create-${crypto.randomUUID()}`;
      const result = await runGraphMutation(
        [
          {
            type: "create_node",
            clientId,
            node: {
              type,
              title: `${option?.label ?? type}节点 ${nextNodeIndex}`,
              promptInput: "",
              outputSnapshot: createInitialCanvasNodeOutputSnapshot(type),
              settingsJson: getDefaultCanvasNodeSettings(type),
              positionX: Math.round(x),
              positionY: Math.round(y),
            },
          },
        ],
        "拖入创建节点失败。",
      );
      const createdNode = result.operationResults.find((item) => item.type === "create_node" && item.clientId === clientId);

      toast.success("节点已拖入画布。");
      if (createdNode?.nodeId) {
        setSelectedNodeIds([createdNode.nodeId]);
        setSelectedNodeId(createdNode.nodeId);
      }
      setQuickType(type);
      setIsCreateOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "拖入创建节点失败。");
    }
  }

  function buildPromptFromLibraryItem(item: LibraryItemOption) {
    return [item.name, item.description, item.promptHints, item.tags.length ? `标签：${item.tags.join("、")}` : null]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join("\n");
  }

  function buildPromptFromInstructionPreset(item: InstructionPresetOption) {
    return [item.promptTemplate, item.negativePrompt ? `Negative Prompt: ${item.negativePrompt}` : null]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join("\n\n");
  }

  function buildStoryboardVideoPrompt(sourceNode: CanvasNode, storyboardShots: StoryboardShot[]) {
    const shotDescriptions = storyboardShots.map((shot) =>
      [
        `Shot ${shot.sequence}`,
        shot.sceneLabel,
        shot.description || shot.videoPrompt,
        getStoryboardShotAssetNames(shot).length > 0 ? `Assets: ${getStoryboardShotAssetNames(shot).join(", ")}` : null,
      ]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(" · "),
    );

    return [sourceNode.promptInput?.trim() ?? "", ...shotDescriptions]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join("\n\n");
  }

  function buildStoryboardVideoSettings(storyboardShots: StoryboardShot[]) {
    const shotPrompts = storyboardShots
      .map((shot) => shot.videoPrompt || shot.description)
      .filter((value): value is string => Boolean(value && value.trim()));
    const totalDuration = storyboardShots.reduce((sum, shot) => sum + (shot.duration ?? 0), 0);

    return {
      ...DEFAULT_VIDEO_NODE_SETTINGS,
      generationMode: "smart_storyboard" as const,
      durationSec: Math.min(30, Math.max(1, totalDuration || Math.max(1, storyboardShots.length * 5))),
      shotPrompts,
    };
  }

  function buildSingleShotVideoPrompt(sourceNode: CanvasNode, shot: StoryboardShot) {
    return [
      sourceNode.promptInput?.trim() ?? "",
      `Shot ${shot.sequence}`,
      shot.sceneLabel,
      shot.description,
      shot.videoPrompt,
      getStoryboardShotAssetNames(shot).length > 0 ? `Assets: ${getStoryboardShotAssetNames(shot).join(", ")}` : null,
      shot.dialogue ? `Dialogue: ${shot.dialogue}` : null,
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .join("\n\n");
  }

  function buildSingleShotVideoSettings(shot: StoryboardShot) {
    return {
      ...DEFAULT_VIDEO_NODE_SETTINGS,
      generationMode: "smart_storyboard" as const,
      durationSec: Math.min(30, Math.max(1, shot.duration ?? 5)),
      shotPrompts: [shot.videoPrompt || shot.description].filter((value): value is string => Boolean(value && value.trim())),
    };
  }

  function connectStoryboardImagesToVideoNode(targetNodeId: string, imageNodes: CanvasNode[]) {
    const edgeOperations: CanvasGraphOperation[] = [];

    for (const [index, imageNode] of imageNodes.entries()) {
      edgeOperations.push({
        type: "create_edge",
        edge: {
          sourceNodeId: imageNode.id,
          targetNodeId,
          mergeMode: "merge_all",
          priority: index,
        },
      });
    }

    return edgeOperations;
  }

  async function saveCurrentStoryboardShot() {
    if (!selectedNode || selectedNode.type !== "storyboard" || !draftStoryboardShot) {
      return;
    }

    const rawShots = selectedStoryboardRawShots;
    const targetShot = rawShots[activeStoryboardShotIndex];

    if (!targetShot) {
      toast.error("当前 Shot 不存在，无法保存。");

      return;
    }

    setIsSavingStoryboardShot(true);

    try {
      const structuredDataSource =
        selectedNode.outputSnapshot?.structuredData && typeof selectedNode.outputSnapshot.structuredData === "object"
          ? (selectedNode.outputSnapshot.structuredData as Record<string, unknown>)
          : {};
      const nextShots = rawShots.map((shot, index) =>
        index === activeStoryboardShotIndex
          ? {
              ...shot,
              sequence: draftStoryboardShot.sequence,
              sceneLabel: draftStoryboardShot.sceneLabel,
              duration: draftStoryboardShot.duration,
              description: draftStoryboardShot.description,
              videoPrompt: draftStoryboardShot.videoPrompt,
              emotion: draftStoryboardShot.emotion,
              camera: draftStoryboardShot.camera,
              size: draftStoryboardShot.size,
              dialogue: draftStoryboardShot.dialogue,
            }
          : shot,
      );
      const nextStructuredData = {
        ...structuredDataSource,
        shots: nextShots,
      };
      const nextContent = JSON.stringify(nextStructuredData, null, 2);

      await saveNodePatch(
        selectedNode.id,
        {
          outputSnapshot: {
            ...(selectedNode.outputSnapshot ?? {}),
            outputType: "json",
            content: nextContent,
            structuredData: nextStructuredData,
          },
        },
        "当前 Shot 保存失败。",
      );

      setExpandedTextContent(nextContent);
      toast.success(`Shot ${draftStoryboardShot.sequence} 已保存。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "当前 Shot 保存失败。");
    } finally {
      setIsSavingStoryboardShot(false);
    }
  }

  async function createStoryboardShotVideoNode(autoRun: boolean) {
    if (!selectedNode || selectedNode.type !== "storyboard" || !draftStoryboardShot) {
      return;
    }

    setIsCreatingStoryboardVideoNode(true);

    try {
      const basePosition = nodePositionMap.get(selectedNode.id) ?? {
        x: Number.parseFloat(selectedNode.positionX || "0"),
        y: Number.parseFloat(selectedNode.positionY || "0"),
      };
      const connectedImageNodes = getIncomingImageNodes(selectedNode.id);
      const clientId = `storyboard-shot-video-${crypto.randomUUID()}`;
      const result = await runGraphMutation(
        [
          {
            type: "create_node",
            clientId,
            node: {
              type: "video",
              title: `${selectedNode.title} · Shot ${draftStoryboardShot.sequence}`,
              promptInput: buildSingleShotVideoPrompt(selectedNode, draftStoryboardShot),
              settingsJson: serializeVideoNodeSettings(buildSingleShotVideoSettings(draftStoryboardShot)),
              resourceRefs: normalizeResourceRefs(selectedNode.resourceRefs),
              positionX: Math.round(basePosition.x + 360),
              positionY: Math.round(basePosition.y + activeStoryboardShotIndex * 48),
            },
          },
          ...connectStoryboardImagesToVideoNode(clientId, connectedImageNodes),
        ],
        autoRun ? "当前 Shot 视频生成失败。" : "当前 Shot 视频节点创建失败。",
      );
      const createdNodeId =
        result.operationResults.find((item) => item.type === "create_node" && item.clientId === clientId)?.nodeId ?? null;

      if (!createdNodeId) {
        throw new Error("Shot 视频节点创建成功，但未返回节点 ID。");
      }

      if (autoRun) {
        await runCanvasNode(apiContext, createdNodeId, `storyboard-shot-video-run-${crypto.randomUUID()}`, "当前 Shot 视频生成失败。");
        await refreshCanvasRuntime("当前 Shot 视频状态刷新失败。");
      }

      setSelectedNodeIds([createdNodeId]);
      setSelectedNodeId(createdNodeId);
      toast.success(
        autoRun
          ? `Shot ${draftStoryboardShot.sequence} 视频已提交生成${connectedImageNodes.length > 0 ? `，并自动接入 ${connectedImageNodes.length} 个图片节点。` : "。"}`
          : `Shot ${draftStoryboardShot.sequence} 视频节点已创建${connectedImageNodes.length > 0 ? `，并自动接入 ${connectedImageNodes.length} 个图片节点。` : "。"}`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : autoRun ? "当前 Shot 视频生成失败。" : "当前 Shot 视频节点创建失败。",
      );
    } finally {
      setIsCreatingStoryboardVideoNode(false);
    }
  }

  async function createStoryboardVideoNode(autoRun: boolean) {
    if (!selectedNode || selectedNode.type !== "storyboard") {
      return;
    }

    const storyboardShots = getStoryboardShots(selectedNode.outputSnapshot);

    if (storyboardShots.length === 0) {
      toast.error("请先生成分镜结果，再创建视频节点。");

      return;
    }

    setIsCreatingStoryboardVideoNode(true);

    try {
      const basePosition = nodePositionMap.get(selectedNode.id) ?? {
        x: Number.parseFloat(selectedNode.positionX || "0"),
        y: Number.parseFloat(selectedNode.positionY || "0"),
      };
      const connectedImageNodes = getIncomingImageNodes(selectedNode.id);
      const videoSettings = buildStoryboardVideoSettings(storyboardShots);
      const clientId = `storyboard-video-${crypto.randomUUID()}`;
      const result = await runGraphMutation(
        [
          {
            type: "create_node",
            clientId,
            node: {
              type: "video",
              title: `${selectedNode.title} · 分镜视频`,
              promptInput: buildStoryboardVideoPrompt(selectedNode, storyboardShots),
              settingsJson: serializeVideoNodeSettings(videoSettings),
              resourceRefs: normalizeResourceRefs(selectedNode.resourceRefs),
              positionX: Math.round(basePosition.x + 360),
              positionY: Math.round(basePosition.y),
            },
          },
          ...connectStoryboardImagesToVideoNode(clientId, connectedImageNodes),
        ],
        autoRun ? "分镜视频创建失败。" : "视频节点创建失败。",
      );
      const createdNodeId =
        result.operationResults.find((item) => item.type === "create_node" && item.clientId === clientId)?.nodeId ?? null;

      if (!createdNodeId) {
        throw new Error("视频节点创建成功，但未返回节点 ID。");
      }

      if (autoRun) {
        await runCanvasNode(apiContext, createdNodeId, `storyboard-video-run-${crypto.randomUUID()}`, "分镜视频生成失败。");
        await refreshCanvasRuntime("分镜视频状态刷新失败。");
      }

      setSelectedNodeIds([createdNodeId]);
      setSelectedNodeId(createdNodeId);
      toast.success(
        autoRun
          ? `已创建视频节点并提交分镜视频生成${connectedImageNodes.length > 0 ? `，自动接入 ${connectedImageNodes.length} 个图片节点。` : "。"}`
          : `已从分镜创建视频节点${connectedImageNodes.length > 0 ? `，自动接入 ${connectedImageNodes.length} 个图片节点。` : "。"}`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : autoRun ? "分镜视频生成失败。" : "视频节点创建失败。");
    } finally {
      setIsCreatingStoryboardVideoNode(false);
    }
  }

  async function createAllStoryboardShotVideoNodes() {
    if (!selectedNode || selectedNode.type !== "storyboard") {
      return;
    }

    const storyboardShots = getStoryboardShots(selectedNode.outputSnapshot);

    if (storyboardShots.length === 0) {
      toast.error("请先生成分镜结果，再创建视频节点。");

      return;
    }

    setIsCreatingStoryboardVideoNode(true);

    try {
      const basePosition = nodePositionMap.get(selectedNode.id) ?? {
        x: Number.parseFloat(selectedNode.positionX || "0"),
        y: Number.parseFloat(selectedNode.positionY || "0"),
      };
      const connectedImageNodes = getIncomingImageNodes(selectedNode.id);
      const nodeClientIds = storyboardShots.map(() => `storyboard-shot-${crypto.randomUUID()}`);
      const operations: CanvasGraphOperation[] = [];

      storyboardShots.forEach((shot, index) => {
        const clientId = nodeClientIds[index];
        operations.push({
          type: "create_node",
          clientId,
          node: {
            type: "video",
            title: `${selectedNode.title} · Shot ${shot.sequence}`,
            promptInput: buildSingleShotVideoPrompt(selectedNode, shot),
            settingsJson: serializeVideoNodeSettings(buildSingleShotVideoSettings(shot)),
            resourceRefs: normalizeResourceRefs(selectedNode.resourceRefs),
            positionX: Math.round(basePosition.x + 360),
            positionY: Math.round(basePosition.y + index * 220),
          },
        });
        operations.push(...connectStoryboardImagesToVideoNode(clientId, connectedImageNodes));
      });

      const result = await runGraphMutation(operations, "一键创建 Shot 视频节点失败。");
      const createdNodeIds = nodeClientIds
        .map((clientId) => result.operationResults.find((item) => item.type === "create_node" && item.clientId === clientId)?.nodeId)
        .filter((nodeId): nodeId is string => typeof nodeId === "string");

      setSelectedNodeIds(createdNodeIds);
      setSelectedNodeId(createdNodeIds[0] ?? null);
      toast.success(
        `已创建 ${createdNodeIds.length} 个 Shot 视频节点${connectedImageNodes.length > 0 ? `，每个节点都自动接入了 ${connectedImageNodes.length} 个图片节点。` : "。"}`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "一键创建 Shot 视频节点失败。");
    } finally {
      setIsCreatingStoryboardVideoNode(false);
    }
  }

  async function createNodeFromResource(
    source: LibraryItemOption | InstructionPresetOption,
    resourceType: "subject" | "scene" | "instruction",
    nodeType: Exclude<CanvasNodeType, "audio">,
    selectedAssetId?: string | null,
    explicitPosition?: { x: number; y: number },
  ) {
    if (!canEdit) {
      return;
    }

    const nextPosition = explicitPosition ?? getNextCreatePosition();
    const option = quickCreateOptions.find((item) => item.value === nodeType);
    const instructionContent =
      resourceType === "instruction" ? buildPromptFromInstructionPreset(source as InstructionPresetOption) : null;
    const promptInput =
      resourceType === "instruction"
        ? nodeType === "text"
          ? ""
          : instructionContent ?? ""
        : buildPromptFromLibraryItem(source as LibraryItemOption);
    const outputSnapshot =
      resourceType === "instruction" && nodeType === "text"
        ? {
            type: "text",
            content: instructionContent ?? "",
          }
        : undefined;
    const selectedLibraryItemAssetIds =
      resourceType === "instruction"
        ? []
        : Array.from(
            new Set([
              ...(((selectedAssetId ? [selectedAssetId] : []) as string[])),
              ...(((source as LibraryItemOption).assets ?? []).map((asset) => asset.id)),
            ]),
          );
    const resourceRefs: CanvasNodeResourceRefs = {
      subjectIds: resourceType === "subject" ? [source.id] : [],
      sceneIds: resourceType === "scene" ? [source.id] : [],
      instructionPresetIds: resourceType === "instruction" ? [source.id] : [],
      assetIds: selectedLibraryItemAssetIds,
    };

    try {
      const clientId = `resource-node-${crypto.randomUUID()}`;
      const result = await runGraphMutation(
        [
          {
            type: "create_node",
            clientId,
            node: {
              type: nodeType,
              title: `${source.name} · ${option?.label ?? nodeType}`,
              promptInput,
              outputSnapshot,
              resourceRefs,
              positionX: Math.round(nextPosition.x),
              positionY: Math.round(nextPosition.y),
            },
          },
        ],
        "资源节点创建失败。",
      );
      const createdNodeId =
        result.operationResults.find((item) => item.type === "create_node" && item.clientId === clientId)?.nodeId ?? null;

      toast.success("资源已作为节点加入画布。");
      if (createdNodeId) {
        setSelectedNodeIds([createdNodeId]);
        setSelectedNodeId(createdNodeId);
      }
      setIsCreateOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "资源节点创建失败。");
    }
  }

  async function readImageDimensions(file: File) {
    return new Promise<{ width: number; height: number }>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new window.Image();

      image.onload = () => {
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
        URL.revokeObjectURL(objectUrl);
      };
      image.onerror = () => {
        reject(new Error("图片尺寸读取失败。"));
        URL.revokeObjectURL(objectUrl);
      };
      image.src = objectUrl;
    });
  }

  async function parseClientApiResponse<T>(response: Response, fallbackMessage: string) {
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error?.message ?? fallbackMessage);
    }

    return payload.data as T;
  }

  async function createLibraryItemRecord(params: {
    kind: "subject" | "scene";
    entityType: string;
    name: string;
    tags: string[];
  }) {
    return parseClientApiResponse<LibraryItemOption>(
      await fetch("/api/library-items", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          workspaceId,
          kind: params.kind,
          entityType: params.entityType,
          name: params.name,
          tags: params.tags,
          description: "",
          promptHints: "",
          profileMeta: {},
        }),
      }),
      "资源创建失败。",
    );
  }

  async function uploadImageToLibraryItem(itemId: string, file: File) {
    const { width, height } = await readImageDimensions(file);
    const uploadTicket = await createUploadPresign(workspaceId, {
      fileName: file.name,
      mimeType: file.type,
      ownerType: "library_item",
      ownerId: itemId,
    });

    const uploadResponse = await fetch(uploadTicket.uploadUrl, {
      method: "PUT",
      headers: uploadTicket.headers,
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`文件上传失败：${file.name}`);
    }

    return completeUpload(workspaceId, {
      fileName: file.name,
      mimeType: file.type,
      ownerType: "library_item",
      ownerId: itemId,
      storageKey: uploadTicket.storageKey,
      fileSize: file.size,
      width,
      height,
    });
  }

  async function updateLibraryItemCover(itemId: string, coverAssetId: string) {
    return parseClientApiResponse<LibraryItemOption>(
      await fetch(`/api/library-items/${itemId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          workspaceId,
          coverAssetId,
        }),
      }),
      "资源封面更新失败。",
    );
  }

  async function createLibraryAssetFromSourceUrl(params: {
    ownerId: string;
    fileName: string;
    sourceUrl: string;
    mimeType?: string | null;
  }) {
    return parseClientApiResponse<CanvasNodeReferenceAsset>(
      await fetch("/api/assets/generated", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          workspaceId,
          ownerType: "library_item",
          ownerId: params.ownerId,
          fileName: params.fileName,
          sourceUrl: params.sourceUrl,
          mimeType: params.mimeType ?? undefined,
        }),
      }),
      "生成资源资产失败。",
    );
  }

  async function createImageNodeForDroppedFile(file: File, position: { x: number; y: number }) {
    const clientId = `dropped-image-${crypto.randomUUID()}`;
    const result = await runGraphMutation(
      [
        {
          type: "create_node",
          clientId,
          node: {
            type: "image",
            title: `${getBaseNameFromFileName(file.name)} · 图片`,
            promptInput: "",
            resourceRefs: {
              subjectIds: [],
              sceneIds: [],
              instructionPresetIds: [],
              assetIds: [],
            },
            positionX: Math.round(position.x),
            positionY: Math.round(position.y),
          },
        },
      ],
      "图片节点创建失败。",
    );
    const createdNodeId =
      result.operationResults.find((item) => item.type === "create_node" && item.clientId === clientId)?.nodeId ?? null;

    if (!createdNodeId) {
      throw new Error("图片节点创建失败。");
    }

    const uploadTicket = await createUploadPresign(workspaceId, {
      fileName: file.name,
      mimeType: file.type,
      ownerType: "canvas_node",
      ownerId: createdNodeId,
    });
    const uploadResponse = await fetch(uploadTicket.uploadUrl, {
      method: "PUT",
      headers: uploadTicket.headers,
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(`文件上传失败：${file.name}`);
    }

    const { width, height } = await readImageDimensions(file);
    const uploadedAsset = await completeUpload(workspaceId, {
      fileName: file.name,
      mimeType: file.type,
      ownerType: "canvas_node",
      ownerId: createdNodeId,
      storageKey: uploadTicket.storageKey,
      fileSize: file.size,
      width,
      height,
    });

    await saveNodePatch(
      createdNodeId,
      {
        resourceRefs: {
          subjectIds: [],
          sceneIds: [],
          instructionPresetIds: [],
          assetIds: [uploadedAsset.id],
        },
      },
      "节点图片引用保存失败。",
    );

    return createdNodeId;
  }

  async function createNodesFromDroppedFiles(files: File[], startPosition: { x: number; y: number }) {
    let lastCreatedNodeId: string | null = null;

    for (const [index, file] of files.entries()) {
      const createdNodeId = await createImageNodeForDroppedFile(file, {
        x: startPosition.x + index * 48,
        y: startPosition.y + index * 48,
      });
      lastCreatedNodeId = createdNodeId;
    }

    if (lastCreatedNodeId) {
      setSelectedNodeIds([lastCreatedNodeId]);
      setSelectedNodeId(lastCreatedNodeId);
    }
  }

  async function importDroppedFilesToLibraryAndCreateNodes(files: File[], startPosition: { x: number; y: number }) {
    const tags = Array.from(
      new Set(
        dropImportTags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );

    for (const [index, file] of files.entries()) {
      const createdItem = await createLibraryItemRecord({
        kind: dropImportKind,
        entityType: dropImportEntityType.trim() || (dropImportKind === "subject" ? "product" : "studio"),
        name: getBaseNameFromFileName(file.name),
        tags,
      });
      const uploadedAsset = await uploadImageToLibraryItem(createdItem.id, file);
      const updatedItem = await updateLibraryItemCover(createdItem.id, uploadedAsset.id);

      await createNodeFromResource(updatedItem, dropImportKind, "image", uploadedAsset.id, {
        x: startPosition.x + index * 48,
        y: startPosition.y + index * 48,
      });
    }
  }

  async function saveCurrentImageResultToLibrary() {
    if (!selectedNode || selectedNode.type !== "image") {
      return;
    }

    const imageUrl = getImageNodeOutputSource(selectedNode.outputSnapshot);

    if (!imageUrl) {
      toast.error("当前图片节点还没有可沉淀的结果。");

      return;
    }

    setIsSavingResultToLibrary(true);

    try {
      const tags = Array.from(
        new Set(
          saveResultTags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      );
      const createdItem = await createLibraryItemRecord({
        kind: saveResultKind,
        entityType: saveResultEntityType.trim() || (saveResultKind === "subject" ? "product" : "studio"),
        name: saveResultName.trim() || `${selectedNode.title} 资源`,
        tags,
      });
      const generatedAsset = await createLibraryAssetFromSourceUrl({
        ownerId: createdItem.id,
        fileName: saveResultName.trim() || `${selectedNode.title}-result`,
        sourceUrl: imageUrl,
      });

      await updateLibraryItemCover(createdItem.id, generatedAsset.id);
      toast.success("当前结果已沉淀为资源。");
      setIsSaveResultDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "资源沉淀失败。");
    } finally {
      setIsSavingResultToLibrary(false);
    }
  }

  function openSaveResultDialog() {
    if (!selectedNode || selectedNode.type !== "image") {
      return;
    }

    const inferred = inferLibraryPresetFromText(`${selectedNode.title} ${selectedNode.promptInput ?? ""}`);

    setSaveResultKind(inferred.kind);
    setSaveResultEntityType(inferred.entityType);
    setSaveResultTags(inferred.recommendedTags.join(", "));
    setSaveResultName(`${selectedNode.title} 资源`);
    setIsSaveResultDialogOpen(true);
  }

  async function uploadImagesToNode(targetNode: CanvasNode, imageFiles: File[]) {
    const nextAssetIds = new Set(targetNode.resourceRefs?.assetIds ?? []);
    const uploadedAssetIds: string[] = [];

    for (const file of imageFiles) {
      const { width, height } = await readImageDimensions(file);
      const uploadTicket = await createUploadPresign(workspaceId, {
        fileName: file.name,
        mimeType: file.type,
        ownerType: "canvas_node",
        ownerId: targetNode.id,
      });

      const uploadResponse = await fetch(uploadTicket.uploadUrl, {
        method: "PUT",
        headers: uploadTicket.headers,
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`文件上传失败：${file.name}`);
      }

      const uploadedAsset = await completeUpload(workspaceId, {
        fileName: file.name,
        mimeType: file.type,
        ownerType: "canvas_node",
        ownerId: targetNode.id,
        storageKey: uploadTicket.storageKey,
        fileSize: file.size,
        width,
        height,
      });

      nextAssetIds.add(uploadedAsset.id);
      uploadedAssetIds.push(uploadedAsset.id);
    }

    return {
      uploadedAssetIds,
      nextAssetIds: Array.from(nextAssetIds),
    };
  }

  async function uploadReferenceImages(files: FileList | null) {
    if (!files || !selectedNode || selectedNode.type !== "image") {
      return;
    }

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      toast.error("请选择图片文件。");

      return;
    }

    setIsUploadingReferenceImages(true);

    try {
      const { nextAssetIds } = await uploadImagesToNode(
        {
          ...selectedNode,
          resourceRefs: draftResourceRefs,
        },
        imageFiles,
      );
      const nextResourceRefs = {
        ...draftResourceRefs,
        assetIds: nextAssetIds,
      };

      setDraftResourceRefs(nextResourceRefs);

      await saveNodePatch(selectedNode.id, { resourceRefs: nextResourceRefs }, "节点引用图片保存失败。");

      if (imageUploadInputRef.current) {
        imageUploadInputRef.current.value = "";
      }

      toast.success(`已上传 ${imageFiles.length} 张参考图。`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "参考图上传失败。");
    } finally {
      setIsUploadingReferenceImages(false);
    }
  }

  async function removeReferenceImage(assetId: string) {
    if (!selectedNode || selectedNode.type !== "image") {
      return;
    }

    setIsUploadingReferenceImages(true);

    try {
      const nextResourceRefs = {
        ...draftResourceRefs,
        assetIds: draftResourceRefs.assetIds.filter((id) => id !== assetId),
      };

      setDraftResourceRefs(nextResourceRefs);
      await saveNodePatch(selectedNode.id, { resourceRefs: nextResourceRefs }, "移除参考图失败。");

      toast.success("参考图已移除。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除参考图失败。");
    } finally {
      setIsUploadingReferenceImages(false);
    }
  }

  async function uploadVideoImages(role: "first_frame" | "last_frame" | "reference", files: FileList | null) {
    if (!files || !selectedNode || selectedNode.type !== "video") {
      return;
    }

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      toast.error("请选择图片文件。");

      return;
    }

    setIsUploadingVideoImages(true);

    try {
      const filesToUpload = role === "reference" ? imageFiles : imageFiles.slice(0, 1);
      const { uploadedAssetIds } = await uploadImagesToNode(selectedNode, filesToUpload);
      const nextSettings = {
        ...draftVideoSettings,
        referenceAssetIds: [...draftVideoSettings.referenceAssetIds],
        shotPrompts: [...draftVideoSettings.shotPrompts],
      };

      if (role === "first_frame") {
        nextSettings.firstFrameAssetId = uploadedAssetIds[0] ?? nextSettings.firstFrameAssetId;
      }

      if (role === "last_frame") {
        nextSettings.lastFrameAssetId = uploadedAssetIds[0] ?? nextSettings.lastFrameAssetId;
      }

      if (role === "reference") {
        nextSettings.referenceAssetIds = Array.from(new Set([...nextSettings.referenceAssetIds, ...uploadedAssetIds]));
      }

      const persistedSettings = getPersistedVideoNodeSettings(normalizeVideoSettingsByModel(nextSettings, draftVideoModelKey));
      const managedAssetIds = getManagedVideoAssetIds(nextSettings);
      const nextResourceRefs = {
        ...draftResourceRefs,
        assetIds: managedAssetIds,
      };

      setDraftResourceRefs(nextResourceRefs);

      await saveNodePatch(
        selectedNode.id,
        {
          resourceRefs: nextResourceRefs,
          settingsJson: buildNodeSettingsPayload(selectedNode, {
            generationMode: persistedSettings.generationMode,
            duration: persistedSettings.durationSec,
            durationSec: persistedSettings.durationSec,
            size: persistedSettings.size,
            motionStrength: persistedSettings.motionStrength,
            withAudio: persistedSettings.withAudio,
            firstFrameAssetId: persistedSettings.firstFrameAssetId,
            lastFrameAssetId: persistedSettings.lastFrameAssetId,
            referenceAssetIds: persistedSettings.referenceAssetIds,
            shotPrompts: persistedSettings.shotPrompts,
          }),
        },
        "视频节点参考图保存失败。",
      );

      if (role === "first_frame" && videoFirstFrameInputRef.current) {
        videoFirstFrameInputRef.current.value = "";
      }

      if (role === "last_frame" && videoLastFrameInputRef.current) {
        videoLastFrameInputRef.current.value = "";
      }

      if (role === "reference" && videoReferenceInputRef.current) {
        videoReferenceInputRef.current.value = "";
      }

      toast.success(
        role === "reference"
          ? `已上传 ${uploadedAssetIds.length} 张视频参考图。`
          : role === "first_frame"
            ? "首帧参考已更新。"
            : "末帧参考已更新。",
      );
      setDraftVideoSettings(persistedSettings);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "视频节点参考图保存失败。");
    } finally {
      setIsUploadingVideoImages(false);
    }
  }

  async function removeVideoAsset(assetId: string) {
    if (!selectedNode || selectedNode.type !== "video") {
      return;
    }

    setIsUploadingVideoImages(true);

    try {
      const nextSettings = {
        ...draftVideoSettings,
        referenceAssetIds: draftVideoSettings.referenceAssetIds.filter((id) => id !== assetId),
        shotPrompts: [...draftVideoSettings.shotPrompts],
        firstFrameAssetId: draftVideoSettings.firstFrameAssetId === assetId ? null : draftVideoSettings.firstFrameAssetId,
        lastFrameAssetId: draftVideoSettings.lastFrameAssetId === assetId ? null : draftVideoSettings.lastFrameAssetId,
      };
      const persistedSettings = getPersistedVideoNodeSettings(normalizeVideoSettingsByModel(nextSettings, draftVideoModelKey));
      const usedAssetIds = getManagedVideoAssetIds(nextSettings);
      const nextResourceRefs = {
        ...draftResourceRefs,
        assetIds: usedAssetIds,
      };

      setDraftResourceRefs(nextResourceRefs);

      await saveNodePatch(
        selectedNode.id,
        {
          resourceRefs: nextResourceRefs,
          settingsJson: buildNodeSettingsPayload(selectedNode, {
            generationMode: persistedSettings.generationMode,
            duration: persistedSettings.durationSec,
            durationSec: persistedSettings.durationSec,
            size: persistedSettings.size,
            motionStrength: persistedSettings.motionStrength,
            withAudio: persistedSettings.withAudio,
            firstFrameAssetId: persistedSettings.firstFrameAssetId,
            lastFrameAssetId: persistedSettings.lastFrameAssetId,
            referenceAssetIds: persistedSettings.referenceAssetIds,
            shotPrompts: persistedSettings.shotPrompts,
          }),
        },
        "移除视频参考图失败。",
      );

      toast.success("视频参考图已移除。");
      setDraftVideoSettings(persistedSettings);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除视频参考图失败。");
    } finally {
      setIsUploadingVideoImages(false);
    }
  }

  async function saveTextNodePrompt() {
    if (!selectedNode || selectedNode.type !== "text") {
      return;
    }

    setIsSavingPrompt(true);

    try {
      await saveNodePatch(selectedNode.id, { promptInput: draftPrompt }, "文本节点内容保存失败。");
      toast.success("文本节点内容已保存。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "文本节点更新失败。");
    } finally {
      setIsSavingPrompt(false);
    }
  }

  async function saveStoryboardNodePrompt() {
    if (!selectedNode || selectedNode.type !== "storyboard") {
      return;
    }

    setIsSavingPrompt(true);

    try {
      await saveNodePatch(
        selectedNode.id,
        {
          promptInput: draftPrompt,
          resourceRefs: mergePromptMentionAssetIds(draftResourceRefs, draftPrompt),
          settingsJson: buildNodeSettingsPayload(selectedNode, serializeStoryboardNodeSettings(draftStoryboardSettings)),
        },
        "分镜节点配置保存失败。",
      );
      toast.success("分镜节点配置已保存。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "分镜节点配置保存失败。");
    } finally {
      setIsSavingPrompt(false);
    }
  }

  async function triggerTextNodeGeneration() {
    if (!selectedNode || selectedNode.type !== "text") {
      return;
    }

    if (isSelectedTextNodeGenerating || isSelectedTextNodeCoolingDown || isTextNodeTaskActive) {
      return;
    }

    setGeneratingTextNodeId(selectedNode.id);

    try {
      await saveNodePatch(selectedNode.id, { promptInput: draftPrompt }, "文本提示词保存失败。");
      const isBatch = await triggerNodeExecution(selectedNode, {
        requestPrefix: "text-node-run",
        fallbackMessage: "AI 生成失败。",
        singleRunSuccessMessage: "已提交 AI 生成请求。",
      });
      if (isBatch) {
        toast.success("检测到组合输入，已自动切换为批量运行。");
      }

      setTextGenerateCooldown({
        nodeId: selectedNode.id,
        expiresAt: Date.now() + TEXT_GENERATE_COOLDOWN_MS,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "AI 生成失败。");
    } finally {
      setGeneratingTextNodeId((current) => (current === selectedNode.id ? null : current));
    }
  }

  async function triggerStoryboardNodeGeneration() {
    if (!selectedNode || selectedNode.type !== "storyboard") {
      return;
    }

    if (isSelectedStoryboardNodeGenerating || isStoryboardNodeTaskActive) {
      return;
    }

    setGeneratingStoryboardNodeId(selectedNode.id);

    try {
      await saveNodePatch(
        selectedNode.id,
        {
          promptInput: draftPrompt,
          resourceRefs: mergePromptMentionAssetIds(draftResourceRefs, draftPrompt),
          settingsJson: buildNodeSettingsPayload(selectedNode, serializeStoryboardNodeSettings(draftStoryboardSettings)),
        },
        "分镜节点配置保存失败。",
      );
      const isBatch = await triggerNodeExecution(selectedNode, {
        requestPrefix: "storyboard-node-run",
        fallbackMessage: "分镜生成失败。",
        singleRunSuccessMessage: "已提交分镜生成请求。",
      });
      if (isBatch) {
        toast.success("检测到组合输入，已自动切换为批量运行。");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "分镜生成失败。");
    } finally {
      setGeneratingStoryboardNodeId((current) => (current === selectedNode.id ? null : current));
    }
  }

  async function saveImageNodePrompt() {
    if (!selectedNode || selectedNode.type !== "image") {
      return;
    }

    setIsSavingImagePrompt(true);

    try {
      await saveNodePatch(
        selectedNode.id,
        {
          promptInput: draftImagePrompt,
          resourceRefs: mergePromptMentionAssetIds(draftResourceRefs, draftImagePrompt),
        },
        "图片节点提示词保存失败。",
      );
      toast.success("图片节点提示词已保存。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片节点提示词保存失败。");
    } finally {
      setIsSavingImagePrompt(false);
    }
  }

  async function triggerImageNodeGeneration() {
    if (!selectedNode || selectedNode.type !== "image") {
      return;
    }

    if (isSelectedImageNodeGenerating || isImageNodeTaskActive) {
      return;
    }

    setGeneratingImageNodeId(selectedNode.id);

    try {
      await saveNodePatch(
        selectedNode.id,
        {
          promptInput: draftImagePrompt,
          resourceRefs: mergePromptMentionAssetIds(draftResourceRefs, draftImagePrompt),
        },
        "图片提示词保存失败。",
      );
      const isBatch = await triggerNodeExecution(selectedNode, {
        requestPrefix: "image-node-run",
        fallbackMessage: "图片生成失败。",
        singleRunSuccessMessage: "已提交图片生成请求。",
      });
      if (isBatch) {
        toast.success("检测到组合输入，已自动切换为批量运行。");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片生成失败。");
    } finally {
      setGeneratingImageNodeId((current) => (current === selectedNode.id ? null : current));
    }
  }

  function downloadSelectedImage() {
    if (!selectedNode || selectedNode.type !== "image" || !selectedImageOutputSource) {
      return;
    }

    triggerDownload(
      selectedImageOutputSource,
      `${selectedNode.title || "image-node-output"}.${inferImageExtension(selectedImageOutputSource)}`,
    );
  }

  function linkPromptAsset(asset: CanvasNodeReferenceAsset) {
    setDraftResourceRefs((current) => ({
      ...current,
      assetIds: Array.from(new Set([...current.assetIds, asset.id])),
    }));
  }

  async function saveVideoNodePrompt() {
    if (!selectedNode || selectedNode.type !== "video") {
      return;
    }

    setIsSavingVideoPrompt(true);

    try {
      const persistedSettings = getPersistedVideoNodeSettings(normalizeVideoSettingsByModel(draftVideoSettings, draftVideoModelKey));

      await saveNodePatch(
        selectedNode.id,
        {
          modelKey: draftVideoModelKey.trim() || null,
          promptInput: draftVideoPrompt,
          resourceRefs: mergePromptMentionAssetIds({
            subjectIds: draftResourceRefs.subjectIds,
            sceneIds: draftResourceRefs.sceneIds,
            instructionPresetIds: draftResourceRefs.instructionPresetIds,
            assetIds: getManagedVideoAssetIds(draftVideoSettings),
          }, draftVideoPrompt),
          settingsJson: buildNodeSettingsPayload(selectedNode, {
            generationMode: persistedSettings.generationMode,
            duration: persistedSettings.durationSec,
            durationSec: persistedSettings.durationSec,
            size: persistedSettings.size,
            motionStrength: persistedSettings.motionStrength,
            withAudio: persistedSettings.withAudio,
            firstFrameAssetId: persistedSettings.firstFrameAssetId,
            lastFrameAssetId: persistedSettings.lastFrameAssetId,
            referenceAssetIds: persistedSettings.referenceAssetIds,
            shotPrompts: persistedSettings.shotPrompts,
          }),
        },
        "视频节点提示词保存失败。",
      );

      toast.success("视频节点配置已保存。");
      setDraftVideoSettings(persistedSettings);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "视频节点配置保存失败。");
    } finally {
      setIsSavingVideoPrompt(false);
    }
  }

  async function triggerVideoNodeGeneration() {
    if (!selectedNode || selectedNode.type !== "video") {
      return;
    }

    if (isSelectedVideoNodeGenerating || isVideoNodeTaskActive) {
      return;
    }

    setGeneratingVideoNodeId(selectedNode.id);

    try {
      const persistedSettings = getPersistedVideoNodeSettings(normalizeVideoSettingsByModel(draftVideoSettings, draftVideoModelKey));

      await saveNodePatch(
        selectedNode.id,
        {
          modelKey: draftVideoModelKey.trim() || null,
          promptInput: draftVideoPrompt,
          resourceRefs: mergePromptMentionAssetIds({
            subjectIds: draftResourceRefs.subjectIds,
            sceneIds: draftResourceRefs.sceneIds,
            instructionPresetIds: draftResourceRefs.instructionPresetIds,
            assetIds: getManagedVideoAssetIds(draftVideoSettings),
          }, draftVideoPrompt),
          settingsJson: buildNodeSettingsPayload(selectedNode, {
            generationMode: persistedSettings.generationMode,
            duration: persistedSettings.durationSec,
            durationSec: persistedSettings.durationSec,
            size: persistedSettings.size,
            motionStrength: persistedSettings.motionStrength,
            withAudio: persistedSettings.withAudio,
            firstFrameAssetId: persistedSettings.firstFrameAssetId,
            lastFrameAssetId: persistedSettings.lastFrameAssetId,
            referenceAssetIds: persistedSettings.referenceAssetIds,
            shotPrompts: persistedSettings.shotPrompts,
          }),
        },
        "视频提示词保存失败。",
      );
      const isBatch = await triggerNodeExecution(selectedNode, {
        requestPrefix: "video-node-run",
        fallbackMessage: "视频生成失败。",
        singleRunSuccessMessage: "已提交视频生成请求。",
      });
      if (isBatch) {
        toast.success("检测到组合输入，已自动切换为批量运行。");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "视频生成失败。");
    } finally {
      setGeneratingVideoNodeId((current) => (current === selectedNode.id ? null : current));
    }
  }

  function downloadSelectedVideo() {
    if (!selectedNode || selectedNode.type !== "video" || !selectedVideoOutputSource) {
      return;
    }

    triggerDownload(
      selectedVideoOutputSource,
      `${selectedNode.title || "video-node-output"}.${inferVideoExtension(selectedVideoOutputSource)}`,
    );
  }

  function inferBatchRunExtension(run: CanvasBatchRunResult) {
    if (run.assetFileName && run.assetFileName.includes(".")) {
      return run.assetFileName.split(".").pop() ?? "bin";
    }

    if (run.assetMimeType?.startsWith("image/") && run.assetFileUrl) {
      return inferImageExtension(run.assetFileUrl, run.assetMimeType);
    }

    if (run.assetMimeType?.startsWith("video/") && run.assetFileUrl) {
      return inferVideoExtension(run.assetFileUrl, run.assetMimeType);
    }

    if (run.assetMimeType?.startsWith("audio/")) {
      return run.assetMimeType.split("/")[1] ?? "mp3";
    }

    if (run.resultType === "json") {
      return "json";
    }

    if (run.resultType === "text") {
      return "txt";
    }

    return "bin";
  }

  function downloadBatchRunResult(run: CanvasBatchRunResult) {
    const safeNodeTitle = run.nodeTitle.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ") || "result";
    const runSuffix = `run-${String(run.runIndex ?? 0).padStart(2, "0")}`;
    const extension = inferBatchRunExtension(run);

    if (run.assetFileUrl) {
      triggerDownload(run.assetFileUrl, `${safeNodeTitle}-${runSuffix}.${extension}`);

      return;
    }

    if (typeof run.contentText !== "string" || run.contentText.length === 0) {
      return;
    }

    const blob = new Blob([run.contentText], { type: run.resultType === "json" ? "application/json" : "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);

    triggerDownload(objectUrl, `${safeNodeTitle}-${runSuffix}.${extension}`);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  async function startVideoNodePreview(nodeId: string) {
    const nextVideo = videoPreviewRefs.current[nodeId];

    if (!nextVideo) {
      return;
    }

    if (playingVideoNodeId && playingVideoNodeId !== nodeId) {
      const currentVideo = videoPreviewRefs.current[playingVideoNodeId];

      if (currentVideo) {
        currentVideo.pause();
        currentVideo.currentTime = 0;
      }
    }

    nextVideo.currentTime = 0;

    try {
      await nextVideo.play();
      setPlayingVideoNodeId(nodeId);
    } catch {
      toast.error("视频播放失败。");
    }
  }

  function stopVideoNodePreview(nodeId: string) {
    const videoElement = videoPreviewRefs.current[nodeId];

    if (!videoElement) {
      return;
    }

    videoElement.pause();
    videoElement.currentTime = 0;
    setPlayingVideoNodeId((current) => (current === nodeId ? null : current));
  }

  async function saveExpandedTextContent() {
    if (!selectedNode || (selectedNode.type !== "text" && selectedNode.type !== "storyboard")) {
      return;
    }

    setIsSavingPrompt(true);

    try {
      await saveNodePatch(
        selectedNode.id,
        {
          outputSnapshot: {
            type: selectedNode.type === "storyboard" ? "json" : "text",
            content: expandedTextContent,
          },
        },
        selectedNode.type === "storyboard" ? "分镜节点内容保存失败。" : "文本节点内容保存失败。",
      );

      toast.success(selectedNode.type === "storyboard" ? "分镜节点内容已保存。" : "文本节点正文已保存。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : selectedNode.type === "storyboard" ? "分镜节点内容保存失败。" : "文本节点内容保存失败。");
    } finally {
      setIsSavingPrompt(false);
    }
  }

  async function saveTextNodeTitle(nodeId: string) {
    const nextTitle = editingTextNodeTitle.trim();

    if (!nextTitle) {
      setEditingTextNodeTitleId(null);
      setEditingTextNodeTitle("");

      return;
    }

    setIsSavingTextNodeTitle(true);

    try {
      await saveNodePatch(nodeId, { title: nextTitle }, "节点标题保存失败。");
      setEditingTextNodeTitleId(null);
      setEditingTextNodeTitle("");
      toast.success("节点标题已保存。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "节点标题保存失败。");
    } finally {
      setIsSavingTextNodeTitle(false);
    }
  }

  async function startNodeDrag(nodeId: string, clientX: number, clientY: number) {
    if (!canEdit) {
      setSelectedNodeIds([nodeId]);
      setSelectedNodeId(nodeId);

      return;
    }

    const boardPoint = getWorldPoint(clientX, clientY);
    const position = nodePositionMap.get(nodeId);

    if (!boardPoint || !position) {
      return;
    }

    if (!ensureSelectionChangeAllowed([nodeId], nodeId)) {
      return;
    }

    setSelectedNodeIds([nodeId]);
    setSelectedNodeId(nodeId);
    const sourceGroupId = nodeGroupIdByNode.get(nodeId) ?? null;
    const offsetX = boardPoint.x - position.x;
    const offsetY = boardPoint.y - position.y;
    let moved = false;
    const pointerOrigin = { x: clientX, y: clientY };
    let animationFrameId: number | null = null;
    let pendingPosition: { x: number; y: number } | null = null;

    const flushPendingPosition = () => {
      animationFrameId = null;

      if (!pendingPosition) {
        return;
      }

      const nextPosition = pendingPosition;
      pendingPosition = null;

      setNodePositions((current) => ({
        ...current,
        [nodeId]: nextPosition,
      }));
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!moved && !hasExceededPointerThreshold(pointerOrigin, { x: event.clientX, y: event.clientY })) {
        return;
      }

      const nextBoardPoint = getWorldPoint(event.clientX, event.clientY);

      if (!nextBoardPoint) {
        return;
      }

      moved = true;
      pendingPosition = {
        x: nextBoardPoint.x - offsetX,
        y: nextBoardPoint.y - offsetY,
      };

      if (animationFrameId === null) {
        animationFrameId = window.requestAnimationFrame(flushPendingPosition);
      }
    };

    const handlePointerUp = async (event: PointerEvent) => {
      const nextBoardPoint = getWorldPoint(event.clientX, event.clientY);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        flushPendingPosition();
      }

      if (!nextBoardPoint || !moved) {
        return;
      }

      const finalX = nextBoardPoint.x - offsetX;
      const finalY = nextBoardPoint.y - offsetY;

      setNodePositions((current) => ({
        ...current,
        [nodeId]: {
          x: finalX,
          y: finalY,
        },
      }));

      await persistNodePosition(nodeId, finalX, finalY);

      if (sourceGroupId) {
        await maybeRemoveNodeFromGroup(nodeId, sourceGroupId, {
          x: finalX,
          y: finalY,
        });
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function startCanvasPan(clientX: number, clientY: number) {
    const initialCamera = { ...camera };
    const origin = { x: clientX, y: clientY };
    let didPan = false;

    const handlePointerMove = (event: PointerEvent) => {
      if (!didPan && !hasExceededPointerThreshold(origin, { x: event.clientX, y: event.clientY })) {
        return;
      }

      if (!didPan) {
        didPan = true;
        setIsPanning(true);
      }

      setCamera({
        x: initialCamera.x - (event.clientX - origin.x) / zoom,
        y: initialCamera.y - (event.clientY - origin.y) / zoom,
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      if (didPan) {
        setIsPanning(false);
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <div className="relative h-screen overflow-hidden overscroll-none bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.06),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_22%)]" />

      {isHydrated ? (
        <InfiniteCanvasBoardCreatePanel
          canvasId={canvasId}
          canEdit={canEdit}
          canGenerate={canGenerate}
          canSaveCanvas={canEdit}
          batchRunCount={batchRunCount}
          canvasSaveStatusLabel={canvasSaveStatusLabel}
          edgeCount={edges.length}
          hasGroupedSelection={hasGroupedSelection}
          hasSelectedNode={Boolean(selectedNode)}
          isBatchRunning={isBatchRunning}
          isSavingCanvas={canvasSaveState === "saving"}
          instructionPresets={instructionPresets}
          isCreateOpen={isCreateOpen}
          nodeCount={nodes.length}
          onBatchRunCountChange={(value) => {
            const nextValue = Number.isFinite(value) ? Math.max(1, Math.min(50, Math.round(value))) : 1;

            setBatchRunCount(nextValue);
          }}
          onCreateInstructionNode={(instructionPreset) => {
            void createNodeFromResource(instructionPreset, "instruction", "text");
          }}
          onCreateSceneNode={(scene, selectedAssetId) => {
            void createNodeFromResource(scene, "scene", "image", selectedAssetId);
          }}
          onCreateSubjectNode={(subject, selectedAssetId) => {
            void createNodeFromResource(subject, "subject", "image", selectedAssetId);
          }}
          onGroupSelectedNodes={() => {
            void handleGroupSelectedNodes();
          }}
          onSelectQuickType={setQuickType}
          onRunSelectedNodes={() => {
            void handleRunSelectedNodes();
          }}
          onSaveCanvas={() => {
            void handleSaveCanvas();
          }}
          onToggleCreateOpen={() => setIsCreateOpen((value) => !value)}
          onUngroupSelectedNodes={() => {
            void handleUngroupSelectedNodes();
          }}
          onZoomIn={() => {
            const center = getViewportCenterClientPoint();

            updateZoom(zoom * 1.12, center?.x, center?.y);
          }}
          onZoomOut={() => {
            const center = getViewportCenterClientPoint();

            updateZoom(zoom / 1.12, center?.x, center?.y);
          }}
          quickType={quickType}
          runtimeSyncStatusLabel={runtimeSyncStatusLabel}
          runtimeSyncStatusTone={runtimeSyncStatusTone}
          scenes={scenes}
          selectedNodeCount={effectiveSelectedNodeIds.length}
          selectedNodeTitles={selectedNodeTitles}
          subjects={subjects}
          taskCount={tasks.length}
          workspaceId={workspaceId}
          zoomLabel={`${Math.round(zoom * 100)}%`}
        />
      ) : null}

      <div
        ref={containerRef}
        className={cn(
          "relative h-full overflow-hidden overscroll-none",
          selectionRect ? "cursor-crosshair" : isPanning ? "cursor-grabbing" : "cursor-grab",
        )}
        onDragLeave={() => setIsCanvasDragOver(false)}
        onDragOver={(event) => {
          if (!canEdit) {
            return;
          }

          if (
            event.dataTransfer.types.includes("application/x-canvas-node-type") ||
            event.dataTransfer.types.includes("application/x-canvas-library-item") ||
            Array.from(event.dataTransfer.items).some((item) => item.kind === "file" && item.type.startsWith("image/"))
          ) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setIsCanvasDragOver(true);
          }
        }}
        onDrop={(event) => {
          if (!canEdit) {
            return;
          }

          const draggedType = event.dataTransfer.getData("application/x-canvas-node-type") as CanvasNodeType | "";
          const draggedLibraryItem = event.dataTransfer.getData("application/x-canvas-library-item");
          const droppedImageFiles = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith("image/"));

          if (!draggedType && !draggedLibraryItem && droppedImageFiles.length === 0) {
            return;
          }

          event.preventDefault();
          setIsCanvasDragOver(false);
          const point = getWorldPoint(event.clientX, event.clientY);

          if (!point) {
            return;
          }

          if (draggedType) {
            void createNodeAtPosition(draggedType, point.x, point.y);

            return;
          }

          if (droppedImageFiles.length > 0) {
            const inferred = inferLibraryPresetFromText(droppedImageFiles[0]?.name ?? "");

            setPendingDroppedImages(droppedImageFiles);
            setPendingDropPosition(point);
            setDropImportKind(inferred.kind);
            setDropImportEntityType(inferred.entityType);
            setDropImportTags(inferred.recommendedTags.join(", "));
            setIsDropImportDialogOpen(true);

            return;
          }

          try {
            const parsed = JSON.parse(draggedLibraryItem) as {
              id?: string;
              kind?: string;
            };

            if (!parsed?.id || (parsed.kind !== "subject" && parsed.kind !== "scene")) {
              return;
            }

            const source =
              parsed.kind === "subject"
                ? subjects.find((item) => item.id === parsed.id) ?? null
                : scenes.find((item) => item.id === parsed.id) ?? null;

            if (!source) {
              return;
            }

            void createNodeFromResource(source, parsed.kind, "image", source.coverAssetId ?? source.assets?.[0]?.id ?? null, point);
          } catch {
            return;
          }
        }}
        onPointerMove={(event) => {
          if (!pendingConnectionSourceId) {
            return;
          }

          const pointer = getLocalScreenPoint(event.clientX, event.clientY);

          if (!pointer) {
            return;
          }

          setPendingConnectionPointer(pointer);
        }}
        onPointerDown={(event) => {
          if (isCanvasInteractiveTarget(event.target)) {
            return;
          }

          if (isBatchResultsOpen) {
            setIsBatchResultsOpen(false);
          }

          setSelectedEdgeId(null);
          setIsExpandedEditorOpen(false);
          setEditingTextNodeTitleId(null);
          setEditingTextNodeTitle("");

          if (pendingConnectionSourceId) {
            clearPendingConnection();
          }

          if (event.altKey || event.button === 1 || isSpacePressed) {
            setSelectedNodeId(null);
            setSelectedNodeIds([]);
            startCanvasPan(event.clientX, event.clientY);

            return;
          }

          startMarqueeSelection(event.clientX, event.clientY, event.metaKey || event.ctrlKey || event.shiftKey);
        }}
      >
        <div
          className={cn("absolute inset-0 transition", isCanvasDragOver ? "ring-2 ring-primary/30 ring-inset" : undefined)}
          style={{
            backgroundImage:
              "radial-gradient(rgba(59,130,246,0.16) 0.55px, transparent 0.9px), linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)",
            backgroundSize: `${GRID_MINOR_SIZE * zoom}px ${GRID_MINOR_SIZE * zoom}px, ${GRID_MAJOR_SIZE * zoom}px ${GRID_MAJOR_SIZE * zoom}px, ${GRID_MAJOR_SIZE * zoom}px ${GRID_MAJOR_SIZE * zoom}px`,
            backgroundPosition: `${viewportSize.width / 2 - camera.x * zoom}px ${viewportSize.height / 2 - camera.y * zoom}px, ${viewportSize.width / 2 - camera.x * zoom}px ${viewportSize.height / 2 - camera.y * zoom}px, ${viewportSize.width / 2 - camera.x * zoom}px ${viewportSize.height / 2 - camera.y * zoom}px`,
            backgroundColor: "#f8fafc",
          }}
        >
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute top-0 h-full border-l border-dashed border-primary/10"
              style={{ left: `${viewportSize.width / 2 - camera.x * zoom}px` }}
            />
            <div
              className="absolute left-0 w-full border-t border-dashed border-primary/10"
              style={{ top: `${viewportSize.height / 2 - camera.y * zoom}px` }}
            />
          </div>

          <svg className="absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="edgeGradient" x1="0%" x2="100%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(59,130,246,0.42)" />
                <stop offset="100%" stopColor="rgba(14,165,233,0.26)" />
              </linearGradient>
            </defs>
            {edges.map((edge) => {
              const sourcePoint = nodePositionMap.get(edge.sourceNodeId);
              const targetPoint = nodePositionMap.get(edge.targetNodeId);
              const sourceNode = nodeById.get(edge.sourceNodeId);
              const targetNode = nodeById.get(edge.targetNodeId);

              if (!sourcePoint || !targetPoint || !sourceNode || !targetNode) {
                return null;
              }

              const sourceScreen = getScreenPoint(sourcePoint.x, sourcePoint.y);
              const targetScreen = getScreenPoint(targetPoint.x, targetPoint.y);
              const midX = (sourceScreen.x + targetScreen.x) / 2;
              const midY = (sourceScreen.y + targetScreen.y) / 2 - 10;
              const edgeLabel = getCanvasConnectionLabel(sourceNode.type, targetNode.type);
              const isSelectedEdge = selectedEdgeId === edge.id;
              const edgeLabelWidth = edgeLabel.length * 12 + (isSelectedEdge ? 56 : 24);
              const controlOffset = Math.max(72, Math.min(180, Math.abs(targetScreen.x - sourceScreen.x) * 0.28));
              const edgePath = `M ${sourceScreen.x} ${sourceScreen.y} C ${sourceScreen.x + controlOffset} ${sourceScreen.y}, ${targetScreen.x - controlOffset} ${targetScreen.y}, ${targetScreen.x} ${targetScreen.y}`;

              return (
                <g key={edge.id}>
                  <path
                    data-canvas-edge="true"
                    d={edgePath}
                    fill="transparent"
                    stroke={isSelectedEdge ? "rgba(37,99,235,0.92)" : "url(#edgeGradient)"}
                    strokeWidth={isSelectedEdge ? "4" : "2.5"}
                  />
                  <path
                    data-canvas-edge="true"
                    d={edgePath}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth="20"
                    onClick={() => {
                      setSelectedNodeId(null);
                      setSelectedNodeIds([]);
                      setSelectedEdgeId(edge.id);
                    }}
                  />
                  <g
                    data-canvas-edge="true"
                    className={cn(canEdit ? "cursor-pointer" : undefined)}
                    onClick={() => {
                      setSelectedNodeId(null);
                      setSelectedNodeIds([]);
                      setSelectedEdgeId(edge.id);
                    }}
                  >
                    <rect
                      fill={isSelectedEdge ? "rgba(239,246,255,0.98)" : "rgba(248,250,252,0.95)"}
                      height="22"
                      rx="11"
                      width={edgeLabelWidth}
                      x={midX - edgeLabelWidth / 2}
                      y={midY - 15}
                    />
                    <text fill="rgba(71,85,105,0.9)" fontSize="11" textAnchor="middle" x={midX} y={midY}>
                      {edgeLabel}
                    </text>
                    {isSelectedEdge ? (
                      <g
                        className={cn(canEdit ? "cursor-pointer" : undefined)}
                        onClick={(event) => {
                          event.stopPropagation();

                          if (!canEdit) {
                            return;
                          }

                          void handleDeleteEdge(edge.id);
                        }}
                      >
                        <circle cx={midX + edgeLabelWidth / 2 - 16} cy={midY - 3} fill="rgba(37,99,235,0.12)" r="9" />
                        <text fill="rgba(37,99,235,0.96)" fontSize="13" fontWeight="700" textAnchor="middle" x={midX + edgeLabelWidth / 2 - 16} y={midY + 1}>
                          ×
                        </text>
                      </g>
                    ) : null}
                  </g>
                </g>
              );
            })}
            {pendingConnectionSourceNode && pendingConnectionPointer ? (() => {
              const sourcePoint = nodePositionMap.get(pendingConnectionSourceNode.id);

              if (!sourcePoint) {
                return null;
              }

              const sourceScreen = getScreenPoint(sourcePoint.x, sourcePoint.y);
              const previewPath = `M ${sourceScreen.x} ${sourceScreen.y} C ${sourceScreen.x + 120 * zoom} ${sourceScreen.y}, ${pendingConnectionPointer.x - 120 * zoom} ${pendingConnectionPointer.y}, ${pendingConnectionPointer.x} ${pendingConnectionPointer.y}`;

              return (
                <path
                  d={previewPath}
                  fill="transparent"
                  stroke="rgba(59,130,246,0.7)"
                  strokeDasharray="8 8"
                  strokeWidth="2.5"
                />
              );
            })() : null}
          </svg>

          {nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-full border bg-background px-5 py-2 text-sm text-muted-foreground shadow-sm">
                <span>从左侧把节点拖进画布，或使用添加面板创建第一个节点</span>
              </div>
            </div>
          ) : null}

          {isCanvasDragOver ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-full border border-primary/30 bg-background px-5 py-2 text-sm text-foreground shadow-sm">
                松手后在当前位置创建节点
              </div>
            </div>
          ) : null}

          {normalizedSelectionRect ? (
            <div
              className="pointer-events-none absolute z-10 border border-primary/50 bg-primary/10"
              style={{
                left: normalizedSelectionRect.left,
                top: normalizedSelectionRect.top,
                width: normalizedSelectionRect.width,
                height: normalizedSelectionRect.height,
              }}
            />
          ) : null}

          {groupLayouts.map((group) => (
            <div
              key={group.id}
              className={cn(
                "pointer-events-none absolute rounded-[32px] border-2 bg-sky-100/20",
                group.isFullySelected ? "border-sky-500/70 shadow-[0_0_0_8px_rgba(14,165,233,0.08)]" : "border-sky-300/70",
              )}
              style={{
                left: group.left,
                top: group.top,
                width: group.width,
                height: group.height,
              }}
            >
              <div className="pointer-events-auto absolute left-4 top-4 flex items-center gap-2">
                <button
                  className={cn(
                    "rounded-full border bg-background/96 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-background",
                    canEdit ? "cursor-grab active:cursor-grabbing" : undefined,
                  )}
                  type="button"
                  onClick={() => handleSelectGroup(group.id)}
                  onPointerDown={(event) => {
                    if (event.button !== 0) {
                      return;
                    }

                    event.stopPropagation();
                    startGroupDrag(group.id, event.clientX, event.clientY);
                  }}
                >
                  {`组合 · ${group.nodeIds.length} 个节点`}
                </button>
                {canEdit ? (
                  <button
                    className="rounded-full border bg-background/96 px-2.5 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-background"
                    type="button"
                    onClick={() => {
                      setSelectedNodeIds(group.nodeIds);
                      setSelectedNodeId(group.nodeIds[group.nodeIds.length - 1] ?? null);
                      void updateNodeGroupAssignments(
                        group.nodeIds.map((nodeId) => ({ nodeId, groupId: null })),
                        "组合已解散。",
                      );
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    解散
                  </button>
                ) : null}
              </div>
            </div>
          ))}

          {pendingConnectionSourceNode ? (
            <div className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2">
              <div className="rounded-full border border-primary/20 bg-background/96 px-4 py-2 text-xs text-foreground shadow-sm">
                从 {pendingConnectionSourceNode.title} 发起连线：兼容节点会高亮，点击目标节点即可完成连接，按 Esc 取消
              </div>
            </div>
          ) : null}

          {selectedEdgeId ? (
            <div className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2">
              <div className="rounded-full border border-sky-200 bg-background/96 px-4 py-2 text-xs text-foreground shadow-sm">
                已选中连线，可按 Delete / Backspace 删除，或点击标签右侧 × 删除
              </div>
            </div>
          ) : null}

          {nodes.map((node) => {
            const latestTask = latestTaskByNode.get(node.id) ?? null;
            const position = nodePositionMap.get(node.id);
            const pendingConnectionLabel =
              pendingConnectionSourceNode && pendingConnectionSourceNode.id !== node.id
                ? getCanvasConnectionLabel(pendingConnectionSourceNode.type, node.type)
                : null;
            const canAcceptPendingConnection = Boolean(
              pendingConnectionSourceNode &&
                pendingConnectionSourceNode.id !== node.id &&
                getCanvasConnectionSemantic(pendingConnectionSourceNode.type, node.type),
            );
            const linkedBatchRunId = node.type === "batch_result" ? getBatchResultLinkedBatchRunId(node, batchRuns) : null;
            const linkedBatchRun = linkedBatchRunId ? batchRuns.find((batchRun) => batchRun.id === linkedBatchRunId) ?? null : null;
            const linkedBatchRunDetail = linkedBatchRunId ? batchRunDetailsById[linkedBatchRunId] ?? null : null;
            const linkedBatchRunQuery = getBatchRunDetailQuery(linkedBatchRunId);
            const linkedBatchRunTotalPages = linkedBatchRunDetail?.itemsPage
              ? Math.max(1, Math.ceil(linkedBatchRunDetail.itemsPage.total / BATCH_RESULT_PAGE_SIZE))
              : 1;

            if (!position) {
              return null;
            }

            const screenPoint = getScreenPoint(position.x, position.y);
            const imagePreviewDimensions =
              imagePreviewSizes[node.id] ??
              (node.referenceAssets?.[0]?.width && node.referenceAssets?.[0]?.height
                ? {
                    width: node.referenceAssets[0].width,
                    height: node.referenceAssets[0].height,
                  }
                : null);

            return (
              <InfiniteCanvasBoardNodeCard
                key={node.id}
                activeStoryboardShotIndex={node.id === effectiveSelectedNodeId ? activeStoryboardShotIndex : 0}
                canEdit={canEdit}
                canGenerate={canGenerate}
                canvasId={canvasId}
                deletingNodeId={deletingNodeId}
                editingTextNodeTitle={editingTextNodeTitle}
                editingTextNodeTitleId={editingTextNodeTitleId}
                effectiveSelectedNodeId={effectiveSelectedNodeId}
                imagePreviewDimensions={imagePreviewDimensions}
                isCoolingDown={textGenerateCooldown.nodeId === node.id && Date.now() < textGenerateCooldown.expiresAt}
                isSelected={effectiveSelectedNodeIds.includes(node.id)}
                isSavingTextNodeTitle={isSavingTextNodeTitle}
                linkedBatchRun={linkedBatchRun}
                linkedBatchRunDetail={linkedBatchRunDetail}
                isBatchResultDetailLoading={isBatchRunDetailLoading && linkedBatchRunDetail == null}
                latestTask={latestTask}
                node={node}
                batchResultFilter={linkedBatchRunQuery.status}
                batchResultPage={linkedBatchRunQuery.page}
                batchResultTotalPages={linkedBatchRunTotalPages}
                onBatchResultFilterChange={(filter) => {
                  if (!linkedBatchRunId) {
                    return;
                  }

                  setBatchRunDetailQuery(linkedBatchRunId, {
                    page: 1,
                    status: filter,
                  });
                }}
                onBatchResultPageChange={(page) => {
                  if (!linkedBatchRunId) {
                    return;
                  }

                  setBatchRunDetailQuery(linkedBatchRunId, {
                    page,
                  });
                }}
                onRetryBatchResultItem={(itemId) => {
                  if (!linkedBatchRunId) {
                    return;
                  }

                  void handleRetryBatchRunItem(linkedBatchRunId, itemId);
                }}
                onExtractBatchResultToStandaloneNode={handleExtractBatchResultToStandaloneNode}
                canAcceptPendingConnection={canAcceptPendingConnection}
                isPendingConnectionTarget={canAcceptPendingConnection}
                onCancelEditingTitle={() => {
                  setEditingTextNodeTitleId(null);
                  setEditingTextNodeTitle("");
                }}
                onClearPlayingVideoNode={(nodeId) =>
                  setPlayingVideoNodeId((current) => (current === nodeId ? null : current))
                }
                onCompleteConnection={(nodeId) => {
                  void handleCompleteConnection(nodeId);
                }}
                onDeleteNode={(nodeId) => {
                  void handleDeleteNode(nodeId);
                }}
                onOpenTextEditor={() => setIsExpandedEditorOpen(true)}
                hasCombinationContext={autoBatchRunnableNodeIds.has(node.id)}
                onRunNode={async (nodeId) => {
                  const targetNode = nodeById.get(nodeId);
                  if (!targetNode) return;
                  await triggerNodeExecution(targetNode, {
                    requestPrefix: "canvas-node-run",
                    fallbackMessage: "节点运行失败。",
                    singleRunSuccessMessage: "节点运行已触发。",
                  });
                }}
                onRegisterVideoElement={(nodeId, element) => {
                  videoPreviewRefs.current[nodeId] = element;
                }}
                onRuntimeChanged={async () => {
                  await refreshCanvasRuntime("任务状态刷新失败。");
                }}
                onSaveTitle={(nodeId) => {
                  void saveTextNodeTitle(nodeId);
                }}
                onSelectStoryboardShot={(nodeId, shotIndex) => {
                  setSelectedNodeIds([nodeId]);
                  setSelectedNodeId(nodeId);
                  setSelectedStoryboardShotIndex(shotIndex);
                }}
                onSelectNode={handleSelectNode}
                onStartDrag={startNodeDrag}
                onStartEditingTitle={(nodeId, title) => {
                  setEditingTextNodeTitleId(nodeId);
                  setEditingTextNodeTitle(title);
                }}
                onStartConnection={handleStartConnection}
                onStartVideoPreview={(nodeId) => {
                  void startVideoNodePreview(nodeId);
                }}
                onStopVideoPreview={stopVideoNodePreview}
                onSyncImagePreviewSize={syncImagePreviewSize}
                onTitleChange={setEditingTextNodeTitle}
                pendingConnectionLabel={pendingConnectionLabel}
                pendingConnectionSourceId={pendingConnectionSourceId}
                playingVideoNodeId={playingVideoNodeId}
                savingNodeId={savingNodeId}
                screenPoint={screenPoint}
                workspaceId={workspaceId}
                zoom={zoom}
              />
            );
          })}
        </div>
      </div>

      {selectedNode && isTextNodeSelected ? (
        <TextNodePanel
          canGenerate={canGenerate}
          generateLabel={selectedNodeAutoBatchEnabled ? "批量生成内容" : undefined}
          draftPrompt={draftPrompt}
          isCoolingDown={isSelectedTextNodeCoolingDown}
          isGenerating={isSelectedTextNodeGenerating}
          isSavingPrompt={isSavingPrompt}
          isTaskActive={isTextNodeTaskActive}
          onGenerate={() => {
            void triggerTextNodeGeneration();
          }}
          onOpenExpandedEditor={() => setIsExpandedEditorOpen(true)}
          onPromptChange={setDraftPrompt}
          onSavePrompt={() => {
            void saveTextNodePrompt();
          }}
          selectedNode={selectedNode}
        />
      ) : null}

      {selectedNode && isInputNodeSelected ? (
        <InputNodePanel
          canvasId={canvasId}
          canEdit={canEdit}
          instructionPresets={instructionPresets}
          scenes={scenes}
          selectedNode={selectedNode}
          subjects={subjects}
          workspaceId={workspaceId}
          onRefreshRuntime={refreshCanvasRuntime}
        />
      ) : null}

      {selectedNode && isCombinationNodeSelected ? (
        <CombinationNodePanel
          canvasId={canvasId}
          canEdit={canEdit}
          selectedNode={selectedNode}
          workspaceId={workspaceId}
          onRefreshRuntime={refreshCanvasRuntime}
        />
      ) : null}

      {selectedNode && isStoryboardNodeSelected ? (
        <StoryboardNodePanel
          activeShotDraft={draftStoryboardShot}
          activeShotIndex={activeStoryboardShotIndex}
          availablePromptAssets={selectedNodePromptAssets}
          canEdit={canEdit}
          canGenerate={canGenerate}
          generateLabel={selectedNodeAutoBatchEnabled ? "批量生成分镜" : undefined}
          draftPrompt={draftPrompt}
          draftSettings={draftStoryboardSettings}
          isGenerating={isSelectedStoryboardNodeGenerating}
          isCreatingVideoNode={isCreatingStoryboardVideoNode}
          isSavingPrompt={isSavingPrompt}
          isSavingShot={isSavingStoryboardShot}
          isTaskActive={isStoryboardNodeTaskActive}
          linkedImageCount={selectedStoryboardImageNodes.length}
          onActiveShotChange={setSelectedStoryboardShotIndex}
          onActiveShotDraftChange={(updater) => setDraftStoryboardShot((current) => updater(current))}
          onCreateAllShotVideoNodes={() => {
            void createAllStoryboardShotVideoNodes();
          }}
          onCreateCurrentShotVideoNode={() => {
            void createStoryboardShotVideoNode(false);
          }}
          onCreateVideoNode={() => {
            void createStoryboardVideoNode(false);
          }}
          onGenerate={() => {
            void triggerStoryboardNodeGeneration();
          }}
          onGenerateCurrentShotVideo={() => {
            void createStoryboardShotVideoNode(true);
          }}
          onGenerateVideo={() => {
            void createStoryboardVideoNode(true);
          }}
          onLinkPromptAsset={linkPromptAsset}
          onPromptChange={setDraftPrompt}
          onSavePrompt={() => {
            void saveStoryboardNodePrompt();
          }}
          onSaveShot={() => {
            void saveCurrentStoryboardShot();
          }}
          onSettingsChange={(updater) => setDraftStoryboardSettings((current) => updater(current))}
          selectedNode={selectedNode}
          storyboardShots={selectedStoryboardShots}
          storyboardTotalDurationSec={selectedStoryboardTotalDurationSec}
        />
      ) : null}

      {selectedNode && isImageNodeSelected ? (
        <ImageNodePanel
          availablePromptAssets={selectedNodePromptAssets}
          canEdit={canEdit}
          canGenerate={canGenerate}
          generateLabel={selectedNodeAutoBatchEnabled ? "批量生成图片" : undefined}
          draftImagePrompt={draftImagePrompt}
          imageUploadInputRef={imageUploadInputRef}
          isGenerating={isSelectedImageNodeGenerating}
          isSavingImagePrompt={isSavingImagePrompt}
          isTaskActive={isImageNodeTaskActive}
          isUploadingReferenceImages={isUploadingReferenceImages}
          onDownloadImage={downloadSelectedImage}
          onSaveToLibrary={openSaveResultDialog}
          onDownloadReferenceAsset={(asset) => {
            triggerDownload(asset.fileUrl, getReferenceAssetDownloadName(asset));
          }}
          onGenerate={() => {
            void triggerImageNodeGeneration();
          }}
          onLinkPromptAsset={linkPromptAsset}
          onPromptChange={setDraftImagePrompt}
          onRemoveReferenceImage={(assetId) => {
            void removeReferenceImage(assetId);
          }}
          onSavePrompt={() => {
            void saveImageNodePrompt();
          }}
          onUploadReferenceImages={(files) => {
            void uploadReferenceImages(files);
          }}
          selectedImageOutputSource={selectedImageOutputSource}
          selectedNode={selectedNode}
        />
      ) : null}

      {selectedNode && isVideoNodeSelected ? (
        <VideoNodePanel
          availablePromptAssets={selectedNodePromptAssets}
          canEdit={canEdit}
          canGenerate={canGenerate}
          generateLabel={selectedNodeAutoBatchEnabled ? "批量生成视频" : undefined}
          draftVideoModelKey={draftVideoModelKey}
          draftVideoPrompt={draftVideoPrompt}
          draftVideoSettings={draftVideoSettings}
          isGenerating={isSelectedVideoNodeGenerating}
          isSavingVideoPrompt={isSavingVideoPrompt}
          isTaskActive={isVideoNodeTaskActive}
          isUploadingVideoImages={isUploadingVideoImages}
          onDownloadVideo={downloadSelectedVideo}
          onGenerate={() => {
            void triggerVideoNodeGeneration();
          }}
          onLinkPromptAsset={linkPromptAsset}
          onModelKeyChange={handleVideoModelKeyChange}
          onPromptChange={setDraftVideoPrompt}
          onRemoveVideoAsset={(assetId) => {
            void removeVideoAsset(assetId);
          }}
          onSavePrompt={() => {
            void saveVideoNodePrompt();
          }}
          onSettingsChange={(updater) => setDraftVideoSettings((current) => updater(current))}
          onUploadVideoImages={(role, files) => {
            void uploadVideoImages(role, files);
          }}
          selectedNode={selectedNode}
          selectedVideoFirstFrameAsset={selectedVideoFirstFrameAsset}
          selectedVideoLastFrameAsset={selectedVideoLastFrameAsset}
          selectedVideoOutputSource={selectedVideoOutputSource}
          selectedVideoReferenceAssets={selectedVideoReferenceAssets}
          videoFirstFrameInputRef={videoFirstFrameInputRef}
          videoLastFrameInputRef={videoLastFrameInputRef}
          videoReferenceInputRef={videoReferenceInputRef}
        />
      ) : null}

      {visibleBatchRuns.length > 0 && isBatchResultsOpen ? (
        <BatchRunResultsPanel
          activeBatchRunId={activeBatchRun?.id ?? null}
          activeBatchRunDetail={activeBatchRunDetail}
          batchRuns={visibleBatchRuns}
          canvasId={canvasId}
          currentFilter={activeBatchRunQuery.status}
          currentPage={Math.min(activeBatchRun?.combinationPlanSummary ? activeBatchRunQuery.page : batchPreviewPage, batchPreviewTotalPages)}
          filteredBySelection={isBatchRunSelectionFiltered}
          isLoadingRuns={isBatchRunDetailLoading && !activeBatchRunDetail}
          onChangeFilter={(filter) => {
            if (!activeBatchRun) {
              return;
            }

            setBatchRunDetailQuery(activeBatchRun.id, {
              page: 1,
              status: filter,
            });
          }}
          onClose={() => setIsBatchResultsOpen(false)}
          onDownloadRun={downloadBatchRunResult}
          onExtractResult={handleExtractBatchResultToStandaloneNode}
          onNextPage={() => {
            if (!activeBatchRun) {
              return;
            }

            if (activeBatchRun.combinationPlanSummary) {
              setBatchRunDetailQuery(activeBatchRun.id, (current) => ({
                ...current,
                page: Math.min(batchPreviewTotalPages, current.page + 1),
              }));

              return;
            }

            setBatchPreviewPage((currentPage) => Math.min(batchPreviewTotalPages, currentPage + 1));
          }}
          onPreviousPage={() => {
            if (!activeBatchRun) {
              return;
            }

            if (activeBatchRun.combinationPlanSummary) {
              setBatchRunDetailQuery(activeBatchRun.id, (current) => ({
                ...current,
                page: Math.max(1, current.page - 1),
              }));

              return;
            }

            setBatchPreviewPage((currentPage) => Math.max(1, currentPage - 1));
          }}
          onRetryItem={(batchRunId, itemId) => {
            void handleRetryBatchRunItem(batchRunId, itemId);
          }}
          onSelectBatchRun={(batchRunId) => {
            setSelectedBatchRunId(batchRunId);
            setBatchPreviewPage(1);
          }}
          paginatedRuns={activeBatchRunDetail?.itemsPage ? [] : paginatedBatchPreviewItems}
          selectedNodeCount={effectiveSelectedNodeIds.length}
          totalPages={batchPreviewTotalPages}
          workspaceId={workspaceId}
        />
      ) : null}

      {batchRuns.length > 0 && !isBatchResultsOpen ? (
        <div className="pointer-events-none absolute bottom-6 right-6 z-20 flex justify-end">
          <div className="pointer-events-auto">
            <button
              className="inline-flex h-10 items-center rounded-xl border border-border bg-background/96 px-4 text-sm font-medium text-foreground shadow-lg backdrop-blur transition hover:bg-muted"
              type="button"
              onClick={() => setIsBatchResultsOpen(true)}
            >
              查看批量结果
            </button>
          </div>
        </div>
      ) : null}

      {selectedNode && (isTextNodeSelected || isStoryboardNodeSelected) && isExpandedEditorOpen ? (
        <ExpandedTextEditor
          expandedTextContent={expandedTextContent}
          isSavingPrompt={isSavingPrompt}
          onClose={() => setIsExpandedEditorOpen(false)}
          onContentChange={setExpandedTextContent}
          onSave={() => {
            void saveExpandedTextContent();
          }}
          selectedNode={selectedNode}
        />
      ) : null}

      <Dialog open={isDropImportDialogOpen} onOpenChange={setIsDropImportDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>导入拖入图片</DialogTitle>
            <DialogDescription>你可以只把图片作为节点加入当前画布，或者先入库再自动生成对应图片节点。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              当前共拖入 {pendingDroppedImages.length} 张图片
            </div>
            <div className="rounded-2xl border border-dashed bg-background px-4 py-3 text-sm text-muted-foreground">
              已根据文件名自动推荐资源类型、`entityType` 和标签，你可以在确认前继续调整。
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span>入库类型</span>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={dropImportKind}
                  onChange={(event) => {
                    const nextKind = event.target.value === "scene" ? "scene" : "subject";
                    setDropImportKind(nextKind);
                    setDropImportEntityType(nextKind === "subject" ? "product" : "studio");
                  }}
                >
                  <option value="subject">主体资源</option>
                  <option value="scene">场景资源</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span>类型</span>
                <Input value={dropImportEntityType} onChange={(event) => setDropImportEntityType(event.target.value)} />
              </label>
            </div>
            <label className="space-y-2 text-sm">
              <span>统一标签</span>
              <Input placeholder="多个标签用逗号分隔" value={dropImportTags} onChange={(event) => setDropImportTags(event.target.value)} />
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDropImportDialogOpen(false)}>
              取消
            </Button>
            <Button
              disabled={isProcessingDropImport || pendingDroppedImages.length === 0 || !pendingDropPosition}
              variant="outline"
              onClick={() => {
                if (!pendingDropPosition) {
                  return;
                }

                setIsProcessingDropImport(true);
                void createNodesFromDroppedFiles(pendingDroppedImages, pendingDropPosition)
                  .then(() => {
                    toast.success("图片已作为节点加入画布。");
                    setIsDropImportDialogOpen(false);
                    setPendingDroppedImages([]);
                    setPendingDropPosition(null);
                  })
                  .catch((error) => {
                    toast.error(error instanceof Error ? error.message : "拖入图片创建节点失败。");
                  })
                  .finally(() => setIsProcessingDropImport(false));
              }}
            >
              仅生成节点
            </Button>
            <Button
              disabled={isProcessingDropImport || pendingDroppedImages.length === 0 || !pendingDropPosition}
              onClick={() => {
                if (!pendingDropPosition) {
                  return;
                }

                setIsProcessingDropImport(true);
                void importDroppedFilesToLibraryAndCreateNodes(pendingDroppedImages, pendingDropPosition)
                  .then(() => {
                    toast.success("图片已入库并生成节点。");
                    setIsDropImportDialogOpen(false);
                    setPendingDroppedImages([]);
                    setPendingDropPosition(null);
                  })
                  .catch((error) => {
                    toast.error(error instanceof Error ? error.message : "图片入库并生成节点失败。");
                  })
                  .finally(() => setIsProcessingDropImport(false));
              }}
            >
              入库并生成节点
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isSaveResultDialogOpen} onOpenChange={setIsSaveResultDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>沉淀为资源</DialogTitle>
            <DialogDescription>把当前图片节点结果保存到资源库，并作为主体或场景资源复用。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-2xl border border-dashed bg-background px-4 py-3 text-sm text-muted-foreground">
              已根据当前节点标题和提示词自动推荐资源类型、`entityType` 和标签，你可以在保存前修改。
            </div>
            <label className="space-y-2 text-sm">
              <span>资源名称</span>
              <Input value={saveResultName} onChange={(event) => setSaveResultName(event.target.value)} />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span>资源类型</span>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={saveResultKind}
                  onChange={(event) => {
                    const nextKind = event.target.value === "scene" ? "scene" : "subject";
                    setSaveResultKind(nextKind);
                    setSaveResultEntityType(nextKind === "subject" ? "product" : "studio");
                  }}
                >
                  <option value="subject">主体资源</option>
                  <option value="scene">场景资源</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span>类型</span>
                <Input value={saveResultEntityType} onChange={(event) => setSaveResultEntityType(event.target.value)} />
              </label>
            </div>
            <label className="space-y-2 text-sm">
              <span>标签</span>
              <Input value={saveResultTags} onChange={(event) => setSaveResultTags(event.target.value)} />
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveResultDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={isSavingResultToLibrary || saveResultName.trim().length === 0} onClick={() => void saveCurrentImageResultToLibrary()}>
              {isSavingResultToLibrary ? "保存中..." : "保存到资源库"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

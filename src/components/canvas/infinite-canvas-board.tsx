"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  ExpandedTextEditor,
  getReferenceAssetDownloadName,
  ImageNodePanel,
  StoryboardNodePanel,
  TextNodePanel,
  VideoNodePanel,
} from "@/components/canvas/infinite-canvas-board-panels";
import { InfiniteCanvasBoardCreatePanel } from "@/components/canvas/infinite-canvas-board-create-panel";
import { InfiniteCanvasBoardNodeCard } from "@/components/canvas/infinite-canvas-board-node-card";
import {
  completeUpload,
  createCanvasEdge,
  createCanvasNode,
  createUploadPresign,
  deleteCanvasEdge,
  deleteCanvasNode,
  patchCanvasNode,
  runCanvasNode,
  runCanvasNodeBatch,
} from "@/components/canvas/infinite-canvas-board.api";
import {
  DEFAULT_STORYBOARD_NODE_SETTINGS,
  DEFAULT_VIDEO_NODE_SETTINGS,
  GRID_MAJOR_SIZE,
  GRID_MINOR_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  TEXT_GENERATE_COOLDOWN_MS,
  getCanvasConnectionLabel,
  getCanvasConnectionSemantic,
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
  normalizeVideoNodeSettings,
  quickCreateOptions,
  serializeStoryboardNodeSettings,
  serializeVideoNodeSettings,
  setCanvasNodeGroupId,
  triggerDownload,
  type CanvasNode,
  type CanvasNodeReferenceAsset,
  type CanvasNodeResourceRefs,
  type StoryboardShot,
  type CanvasNodeType,
  type InstructionPresetOption,
  type InfiniteCanvasBoardProps,
  type LibraryItemOption,
  type StoryboardNodeSettings,
} from "@/components/canvas/infinite-canvas-board.shared";
import { cn } from "@/lib/utils";

export function InfiniteCanvasBoard({
  workspaceId,
  canEdit,
  canGenerate,
  nodes,
  edges,
  tasks,
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

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodes[0]?.id ?? null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>(nodes[0]?.id ? [nodes[0].id] : []);
  const [isCreateOpen, setIsCreateOpen] = useState(nodes.length === 0);
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
  const [draftResourceRefs, setDraftResourceRefs] = useState<CanvasNodeResourceRefs>(() => normalizeResourceRefs(nodes[0]?.resourceRefs));
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
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [playingVideoNodeId, setPlayingVideoNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pendingConnectionSourceId, setPendingConnectionSourceId] = useState<string | null>(null);
  const [pendingConnectionPointer, setPendingConnectionPointer] = useState<{ x: number; y: number } | null>(null);
  const [batchRunCount, setBatchRunCount] = useState(1);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  const apiContext = useMemo(() => ({ canvasId, workspaceId }), [canvasId, workspaceId]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
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
  const visibleVideoSettings = getPersistedVideoNodeSettings(draftVideoSettings);
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

  useEffect(() => {
    setNodePositions(
      Object.fromEntries(
        nodes.map((node) => [
          node.id,
          {
            x: Number.parseFloat(node.positionX || "0"),
            y: Number.parseFloat(node.positionY || "0"),
          },
        ]),
      ),
    );
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
    if (selectedNode?.type === "text") {
      setDraftPrompt(selectedNode.promptInput ?? "");
      setDraftStoryboardSettings(DEFAULT_STORYBOARD_NODE_SETTINGS);
      setSelectedStoryboardShotIndex(0);
      setDraftStoryboardShot(null);
      setDraftImagePrompt("");
      setDraftVideoPrompt("");
      setDraftVideoSettings(DEFAULT_VIDEO_NODE_SETTINGS);
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
      setDraftVideoSettings(normalizeVideoNodeSettings(selectedNode.settingsJson));
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
    setDraftResourceRefs(normalizeResourceRefs(selectedNode?.resourceRefs));
    setExpandedTextContent("");
    setIsExpandedEditorOpen(false);
  }, [selectedNode]);

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

        const padding = 36;
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
  }, [effectiveSelectedNodeIds, getGroupedWorldBounds, getScreenPoint, groupNodeIdsMap]);

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
        await Promise.all(
          updates.map(({ nodeId, x, y }) =>
            patchCanvasNode(
              apiContext,
              nodeId,
              {
                positionX: Math.round(x),
                positionY: Math.round(y),
              },
              "节点位置保存失败。",
            ),
          ),
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "节点位置保存失败。");
      } finally {
        setSavingNodeId(null);
      }
    },
    [apiContext],
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
        await Promise.all(
          dedupedUpdates.map(({ node, groupId }) =>
            patchCanvasNode(
              apiContext,
              node.id,
              {
                settingsJson: setCanvasNodeGroupId(node.settingsJson, groupId),
              },
              fallbackMessage,
            ),
          ),
        );
        toast.success(successMessage);
        router.refresh();

        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : fallbackMessage);

        return false;
      }
    },
    [apiContext, nodeById, router],
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
    (nodeId: string, options?: { additive: boolean }) => {
      setSelectedEdgeId(null);

      if (options?.additive) {
        const isSelected = effectiveSelectedNodeIds.includes(nodeId);
        const nextSelectedNodeIds = isSelected
          ? effectiveSelectedNodeIds.filter((currentNodeId) => currentNodeId !== nodeId)
          : [...effectiveSelectedNodeIds, nodeId];

        setSelectedNodeIds(nextSelectedNodeIds);
        setSelectedNodeId(isSelected ? nextSelectedNodeIds[nextSelectedNodeIds.length - 1] ?? null : nodeId);

        return;
      }

      setSelectedNodeIds([nodeId]);
      setSelectedNodeId(nodeId);
    },
    [effectiveSelectedNodeIds],
  );
  const handleSelectGroup = useCallback(
    (groupId: string) => {
      const memberIds = groupNodeIdsMap.get(groupId) ?? [];

      if (memberIds.length === 0) {
        return;
      }

      setSelectedEdgeId(null);
      setSelectedNodeIds(memberIds);
      setSelectedNodeId(memberIds[memberIds.length - 1] ?? null);
    },
    [groupNodeIdsMap],
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
    (groupId: string, clientX: number, clientY: number) => {
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

      handleSelectGroup(groupId);
      let moved = false;

      const handlePointerMove = (event: PointerEvent) => {
        const nextPoint = getWorldPoint(event.clientX, event.clientY);

        if (!nextPoint) {
          return;
        }

        moved = true;
        const deltaX = nextPoint.x - origin.x;
        const deltaY = nextPoint.y - origin.y;

        setNodePositions((current) => {
          const nextPositions = { ...current };

          for (const nodeId of memberIds) {
            const initialPosition = initialPositions[nodeId];
            nextPositions[nodeId] = {
              x: initialPosition.x + deltaX,
              y: initialPosition.y + deltaY,
            };
          }

          return nextPositions;
        });
      };

      const handlePointerUp = async (event: PointerEvent) => {
        const nextPoint = getWorldPoint(event.clientX, event.clientY);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);

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
    [canEdit, getWorldPoint, groupNodeIdsMap, handleSelectGroup, nodePositionMap, persistNodePositions],
  );

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

    setIsBatchRunning(true);

    try {
      const result = await runCanvasNodeBatch(
        apiContext,
        {
          nodeIds: effectiveSelectedNodeIds,
          runCount: batchRunCount,
        },
        "批量运行失败。",
      );

      toast.success(
        `已触发 ${result.node_count ?? effectiveSelectedNodeIds.length} 个节点，共 ${result.run_count ?? batchRunCount} 轮批量运行。`,
      );
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量运行失败。");
    } finally {
      setIsBatchRunning(false);
    }
  }, [apiContext, batchRunCount, canGenerate, effectiveSelectedNodeIds, hasRunningSelectedNode, router]);

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

        if (width < 4 && height < 4) {
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
        await deleteCanvasNode(apiContext, nodeId, "节点删除失败。");
        const deletedGroupId = getCanvasNodeGroupId(deletingNode.settingsJson);

        if (deletedGroupId) {
          const remainingGroupNodeIds = (groupNodeIdsMap.get(deletedGroupId) ?? []).filter((memberId) => memberId !== nodeId);

          if (remainingGroupNodeIds.length === 1) {
            const remainingNode = nodeById.get(remainingGroupNodeIds[0]);

            if (remainingNode) {
              await patchCanvasNode(
                apiContext,
                remainingNode.id,
                {
                  settingsJson: setCanvasNodeGroupId(remainingNode.settingsJson, null),
                },
                "节点组合保存失败。",
              );
            }
          }
        }

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
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "节点删除失败。");
      } finally {
        setDeletingNodeId(null);
      }
    },
    [apiContext, editingTextNodeTitleId, effectiveSelectedNodeId, groupNodeIdsMap, nodeById, nodes, router],
  );

  const handleStartConnection = useCallback(
    (nodeId: string) => {
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

      setSelectedNodeIds([nodeId]);
      setSelectedNodeId(nodeId);
      setPendingConnectionSourceId(nodeId);
      setPendingConnectionPointer(getScreenPoint(nodePosition.x, nodePosition.y));
    },
    [canEdit, clearPendingConnection, getScreenPoint, nodePositionMap, pendingConnectionSourceId],
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
        toast.error("当前仅支持 文本/分镜→文本/分镜/图片/视频，图片→分镜/图片/视频。");
        clearPendingConnection();

        return;
      }

      try {
        await createCanvasEdge(
          apiContext,
          {
            sourceNodeId: sourceNode.id,
            targetNodeId: targetNode.id,
            mergeMode: "merge_all",
            priority: edges.filter((edge) => edge.targetNodeId === targetNodeId).length,
          },
          "创建连线失败。",
        );

        toast.success(`${sourceNode.title} 已连接到 ${targetNode.title}，会自动作为${getCanvasConnectionLabel(sourceNode.type, targetNode.type)}。`);
        clearPendingConnection();
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "创建连线失败。");
        clearPendingConnection();
      }
    },
    [apiContext, clearPendingConnection, edges, nodeById, pendingConnectionSourceId, router],
  );

  const handleDeleteEdge = useCallback(
    async (edgeId: string) => {
      try {
        await deleteCanvasEdge(apiContext, edgeId, "删除连线失败。");
        setSelectedEdgeId((current) => (current === edgeId ? null : current));
        toast.success("连线已删除。");
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "删除连线失败。");
      }
    },
    [apiContext, router],
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

      const createdNode = await createCanvasNode(
        apiContext,
        {
          type,
          title: `${option?.label ?? type}节点 ${nextNodeIndex}`,
          promptInput: "",
          settingsJson: type === "storyboard" ? serializeStoryboardNodeSettings(DEFAULT_STORYBOARD_NODE_SETTINGS) : undefined,
          positionX: Math.round(x),
          positionY: Math.round(y),
        },
        "拖入创建节点失败。",
      );

      toast.success("节点已拖入画布。");
      if (typeof createdNode.id === "string") {
        setSelectedNodeIds([createdNode.id]);
        setSelectedNodeId(createdNode.id);
      }
      setQuickType(type);
      setIsCreateOpen(false);
      router.refresh();
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
      generationMode: "multi_shot" as const,
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
      generationMode: "multi_shot" as const,
      durationSec: Math.min(30, Math.max(1, shot.duration ?? 5)),
      shotPrompts: [shot.videoPrompt || shot.description].filter((value): value is string => Boolean(value && value.trim())),
    };
  }

  async function connectStoryboardSourceNodesToVideoNode(
    storyboardNode: CanvasNode,
    targetNodeId: string,
    imageNodes: CanvasNode[],
    errorMessage: string,
  ) {
    await createCanvasEdge(
      apiContext,
      {
        sourceNodeId: storyboardNode.id,
        targetNodeId,
        mergeMode: "merge_all",
        priority: 0,
      },
      errorMessage,
    );

    for (const [index, imageNode] of imageNodes.entries()) {
      await createCanvasEdge(
        apiContext,
        {
          sourceNodeId: imageNode.id,
          targetNodeId,
          mergeMode: "merge_all",
          priority: index + 1,
        },
        errorMessage,
      );
    }
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

      await patchCanvasNode(
        apiContext,
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
      router.refresh();
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
      const baseX = Number.parseFloat(selectedNode.positionX || "0");
      const baseY = Number.parseFloat(selectedNode.positionY || "0");
      const connectedImageNodes = getIncomingImageNodes(selectedNode.id);
      const createdNode = await createCanvasNode(
        apiContext,
        {
          type: "video",
          title: `${selectedNode.title} · Shot ${draftStoryboardShot.sequence}`,
          promptInput: buildSingleShotVideoPrompt(selectedNode, draftStoryboardShot),
          settingsJson: serializeVideoNodeSettings(buildSingleShotVideoSettings(draftStoryboardShot)),
          resourceRefs: normalizeResourceRefs(selectedNode.resourceRefs),
          positionX: Math.round(baseX + 360),
          positionY: Math.round(baseY + activeStoryboardShotIndex * 48),
        },
        autoRun ? "当前 Shot 视频生成失败。" : "当前 Shot 视频节点创建失败。",
      );

      const createdNodeId = typeof createdNode.id === "string" ? createdNode.id : null;

      if (!createdNodeId) {
        throw new Error("Shot 视频节点创建成功，但未返回节点 ID。");
      }

      await connectStoryboardSourceNodesToVideoNode(selectedNode, createdNodeId, connectedImageNodes, "当前 Shot 视频连线创建失败。");

      if (autoRun) {
        await runCanvasNode(apiContext, createdNodeId, `storyboard-shot-video-run-${crypto.randomUUID()}`, "当前 Shot 视频生成失败。");
      }

      setSelectedNodeIds([createdNodeId]);
      setSelectedNodeId(createdNodeId);
      toast.success(
        autoRun
          ? `Shot ${draftStoryboardShot.sequence} 视频已提交生成${connectedImageNodes.length > 0 ? `，并自动接入 ${connectedImageNodes.length} 个图片节点。` : "。"}`
          : `Shot ${draftStoryboardShot.sequence} 视频节点已创建${connectedImageNodes.length > 0 ? `，并自动接入 ${connectedImageNodes.length} 个图片节点。` : "。"}`
      );
      router.refresh();
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
      const baseX = Number.parseFloat(selectedNode.positionX || "0");
      const baseY = Number.parseFloat(selectedNode.positionY || "0");
      const connectedImageNodes = getIncomingImageNodes(selectedNode.id);
      const videoSettings = buildStoryboardVideoSettings(storyboardShots);
      const createdNode = await createCanvasNode(
        apiContext,
        {
          type: "video",
          title: `${selectedNode.title} · 分镜视频`,
          promptInput: buildStoryboardVideoPrompt(selectedNode, storyboardShots),
          settingsJson: serializeVideoNodeSettings(videoSettings),
          resourceRefs: normalizeResourceRefs(selectedNode.resourceRefs),
          positionX: Math.round(baseX + 360),
          positionY: Math.round(baseY),
        },
        autoRun ? "分镜视频创建失败。" : "视频节点创建失败。",
      );

      const createdNodeId = typeof createdNode.id === "string" ? createdNode.id : null;

      if (!createdNodeId) {
        throw new Error("视频节点创建成功，但未返回节点 ID。");
      }

      await connectStoryboardSourceNodesToVideoNode(selectedNode, createdNodeId, connectedImageNodes, "分镜视频连线创建失败。");

      if (autoRun) {
        await runCanvasNode(apiContext, createdNodeId, `storyboard-video-run-${crypto.randomUUID()}`, "分镜视频生成失败。");
      }

      setSelectedNodeIds([createdNodeId]);
      setSelectedNodeId(createdNodeId);
      toast.success(
        autoRun
          ? `已创建视频节点并提交分镜视频生成${connectedImageNodes.length > 0 ? `，自动接入 ${connectedImageNodes.length} 个图片节点。` : "。"}`
          : `已从分镜创建视频节点${connectedImageNodes.length > 0 ? `，自动接入 ${connectedImageNodes.length} 个图片节点。` : "。"}`
      );
      router.refresh();
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
      const baseX = Number.parseFloat(selectedNode.positionX || "0");
      const baseY = Number.parseFloat(selectedNode.positionY || "0");
      const connectedImageNodes = getIncomingImageNodes(selectedNode.id);
      const createdNodeIds: string[] = [];

      for (const [index, shot] of storyboardShots.entries()) {
        const createdNode = await createCanvasNode(
          apiContext,
          {
            type: "video",
            title: `${selectedNode.title} · Shot ${shot.sequence}`,
            promptInput: buildSingleShotVideoPrompt(selectedNode, shot),
            settingsJson: serializeVideoNodeSettings(buildSingleShotVideoSettings(shot)),
            resourceRefs: normalizeResourceRefs(selectedNode.resourceRefs),
            positionX: Math.round(baseX + 360),
            positionY: Math.round(baseY + index * 220),
          },
          `Shot ${shot.sequence} 视频节点创建失败。`,
        );

        if (typeof createdNode.id !== "string") {
          throw new Error(`Shot ${shot.sequence} 视频节点创建成功，但未返回节点 ID。`);
        }

        await connectStoryboardSourceNodesToVideoNode(selectedNode, createdNode.id, connectedImageNodes, `Shot ${shot.sequence} 视频连线创建失败。`);
        createdNodeIds.push(createdNode.id);
      }

      setSelectedNodeIds(createdNodeIds);
      setSelectedNodeId(createdNodeIds[0] ?? null);
      toast.success(
        `已创建 ${createdNodeIds.length} 个 Shot 视频节点${connectedImageNodes.length > 0 ? `，每个节点都自动接入了 ${connectedImageNodes.length} 个图片节点。` : "。"}`
      );
      router.refresh();
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
  ) {
    if (!canEdit) {
      return;
    }

    const nextPosition = getNextCreatePosition();
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
      const createdNode = await createCanvasNode(
        apiContext,
        {
          type: nodeType,
          title: `${source.name} · ${option?.label ?? nodeType}`,
          promptInput,
          outputSnapshot,
          resourceRefs,
          positionX: Math.round(nextPosition.x),
          positionY: Math.round(nextPosition.y),
        },
        "资源节点创建失败。",
      );

      toast.success("资源已作为节点加入画布。");
      if (typeof createdNode.id === "string") {
        setSelectedNodeIds([createdNode.id]);
        setSelectedNodeId(createdNode.id);
      }
      setIsCreateOpen(false);
      router.refresh();
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

      await patchCanvasNode(
        apiContext,
        selectedNode.id,
        {
          resourceRefs: nextResourceRefs,
        },
        "节点引用图片保存失败。",
      );

      if (imageUploadInputRef.current) {
        imageUploadInputRef.current.value = "";
      }

      toast.success(`已上传 ${imageFiles.length} 张参考图。`);
      router.refresh();
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
      await patchCanvasNode(
        apiContext,
        selectedNode.id,
        {
          resourceRefs: nextResourceRefs,
        },
        "移除参考图失败。",
      );

      toast.success("参考图已移除。");
      router.refresh();
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

      const persistedSettings = getPersistedVideoNodeSettings(nextSettings);
      const managedAssetIds = getManagedVideoAssetIds(nextSettings);
      const nextResourceRefs = {
        ...draftResourceRefs,
        assetIds: managedAssetIds,
      };

      setDraftResourceRefs(nextResourceRefs);

      await patchCanvasNode(
        apiContext,
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
      router.refresh();
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
      const persistedSettings = getPersistedVideoNodeSettings(nextSettings);
      const usedAssetIds = getManagedVideoAssetIds(nextSettings);
      const nextResourceRefs = {
        ...draftResourceRefs,
        assetIds: usedAssetIds,
      };

      setDraftResourceRefs(nextResourceRefs);

      await patchCanvasNode(
        apiContext,
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
      router.refresh();
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
      await patchCanvasNode(apiContext, selectedNode.id, { promptInput: draftPrompt }, "文本节点内容保存失败。");
      toast.success("文本节点内容已保存。");
      router.refresh();
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
      await patchCanvasNode(
        apiContext,
        selectedNode.id,
        {
          promptInput: draftPrompt,
          settingsJson: buildNodeSettingsPayload(selectedNode, serializeStoryboardNodeSettings(draftStoryboardSettings)),
        },
        "分镜节点配置保存失败。",
      );
      toast.success("分镜节点配置已保存。");
      router.refresh();
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
      await patchCanvasNode(apiContext, selectedNode.id, { promptInput: draftPrompt }, "文本提示词保存失败。");
      await runCanvasNode(apiContext, selectedNode.id, `text-node-run-${crypto.randomUUID()}`, "AI 生成失败。");

      setTextGenerateCooldown({
        nodeId: selectedNode.id,
        expiresAt: Date.now() + TEXT_GENERATE_COOLDOWN_MS,
      });
      toast.success("已提交 AI 生成请求。");
      router.refresh();
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
      await patchCanvasNode(
        apiContext,
        selectedNode.id,
        {
          promptInput: draftPrompt,
          settingsJson: buildNodeSettingsPayload(selectedNode, serializeStoryboardNodeSettings(draftStoryboardSettings)),
        },
        "分镜节点配置保存失败。",
      );
      await runCanvasNode(apiContext, selectedNode.id, `storyboard-node-run-${crypto.randomUUID()}`, "分镜生成失败。");

      toast.success("已提交分镜生成请求。");
      router.refresh();
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
      await patchCanvasNode(apiContext, selectedNode.id, { promptInput: draftImagePrompt }, "图片节点提示词保存失败。");
      toast.success("图片节点提示词已保存。");
      router.refresh();
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
      await patchCanvasNode(apiContext, selectedNode.id, { promptInput: draftImagePrompt }, "图片提示词保存失败。");
      await runCanvasNode(apiContext, selectedNode.id, `image-node-run-${crypto.randomUUID()}`, "图片生成失败。");

      toast.success("已提交图片生成请求。");
      router.refresh();
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

  async function saveVideoNodePrompt() {
    if (!selectedNode || selectedNode.type !== "video") {
      return;
    }

    setIsSavingVideoPrompt(true);

    try {
      const persistedSettings = getPersistedVideoNodeSettings(draftVideoSettings);

      await patchCanvasNode(
        apiContext,
        selectedNode.id,
        {
          promptInput: draftVideoPrompt,
          resourceRefs: {
            subjectIds: draftResourceRefs.subjectIds,
            sceneIds: draftResourceRefs.sceneIds,
            instructionPresetIds: draftResourceRefs.instructionPresetIds,
            assetIds: getManagedVideoAssetIds(draftVideoSettings),
          },
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
      router.refresh();
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
      const persistedSettings = getPersistedVideoNodeSettings(draftVideoSettings);

      await patchCanvasNode(
        apiContext,
        selectedNode.id,
        {
          promptInput: draftVideoPrompt,
          resourceRefs: {
            subjectIds: draftResourceRefs.subjectIds,
            sceneIds: draftResourceRefs.sceneIds,
            instructionPresetIds: draftResourceRefs.instructionPresetIds,
            assetIds: getManagedVideoAssetIds(draftVideoSettings),
          },
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
      await runCanvasNode(apiContext, selectedNode.id, `video-node-run-${crypto.randomUUID()}`, "视频生成失败。");

      toast.success("已提交视频生成请求。");
      router.refresh();
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
      await patchCanvasNode(
        apiContext,
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
      router.refresh();
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
      await patchCanvasNode(apiContext, nodeId, { title: nextTitle }, "节点标题保存失败。");
      setEditingTextNodeTitleId(null);
      setEditingTextNodeTitle("");
      toast.success("节点标题已保存。");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "节点标题保存失败。");
    } finally {
      setIsSavingTextNodeTitle(false);
    }
  }

  function startNodeDrag(nodeId: string, clientX: number, clientY: number) {
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

    setSelectedNodeIds([nodeId]);
    setSelectedNodeId(nodeId);
    const sourceGroupId = nodeGroupIdByNode.get(nodeId) ?? null;
    const offsetX = boardPoint.x - position.x;
    const offsetY = boardPoint.y - position.y;
    let moved = false;

    const handlePointerMove = (event: PointerEvent) => {
      const nextBoardPoint = getWorldPoint(event.clientX, event.clientY);

      if (!nextBoardPoint) {
        return;
      }

      moved = true;
      setNodePositions((current) => ({
        ...current,
        [nodeId]: {
          x: nextBoardPoint.x - offsetX,
          y: nextBoardPoint.y - offsetY,
        },
      }));
    };

    const handlePointerUp = async (event: PointerEvent) => {
      const nextBoardPoint = getWorldPoint(event.clientX, event.clientY);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);

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
    setIsPanning(true);

    const handlePointerMove = (event: PointerEvent) => {
      setCamera({
        x: initialCamera.x - (event.clientX - origin.x) / zoom,
        y: initialCamera.y - (event.clientY - origin.y) / zoom,
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      setIsPanning(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <div className="relative h-screen overflow-hidden overscroll-none bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.06),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_22%)]" />

      <InfiniteCanvasBoardCreatePanel
        canEdit={canEdit}
        canGenerate={canGenerate}
        batchRunCount={batchRunCount}
        edgeCount={edges.length}
        hasGroupedSelection={hasGroupedSelection}
        hasSelectedNode={Boolean(selectedNode)}
        isBatchRunning={isBatchRunning}
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
        onToggleCreateOpen={() => setIsCreateOpen((value) => !value)}
        onUngroupSelectedNodes={() => {
          void handleUngroupSelectedNodes();
        }}
        onZoomIn={() => updateZoom(zoom + 0.1)}
        onZoomOut={() => updateZoom(zoom - 0.1)}
        quickType={quickType}
        scenes={scenes}
        selectedNodeCount={effectiveSelectedNodeIds.length}
        selectedNodeTitles={selectedNodeTitles}
        subjects={subjects}
        taskCount={tasks.length}
        workspaceId={workspaceId}
        zoomLabel={`${Math.round(zoom * 100)}%`}
      />

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

          if (event.dataTransfer.types.includes("application/x-canvas-node-type")) {
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

          if (!draggedType) {
            return;
          }

          event.preventDefault();
          setIsCanvasDragOver(false);
          const point = getWorldPoint(event.clientX, event.clientY);

          if (!point) {
            return;
          }

          void createNodeAtPosition(draggedType, point.x, point.y);
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

          setSelectedEdgeId(null);
          setIsExpandedEditorOpen(false);
          setEditingTextNodeTitleId(null);
          setEditingTextNodeTitle("");

          if (pendingConnectionSourceId) {
            clearPendingConnection();
          }

          if (event.altKey || event.button === 1) {
            setSelectedNodeId(null);
            setSelectedNodeIds([]);
            startCanvasPan(event.clientX, event.clientY);

            return;
          }

          startMarqueeSelection(event.clientX, event.clientY, event.metaKey || event.ctrlKey || event.shiftKey);
        }}
        onWheel={(event) => {
          event.preventDefault();

          if (event.ctrlKey || event.metaKey) {
            updateZoom(zoom - event.deltaY * 0.0015, event.clientX, event.clientY);

            return;
          }

          setCamera((current) => ({
            x: current.x + event.deltaX / zoom,
            y: current.y + event.deltaY / zoom,
          }));
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
              style={{ left: `${viewportSize.width / 2 - camera.x}px` }}
            />
            <div
              className="absolute left-0 w-full border-t border-dashed border-primary/10"
              style={{ top: `${viewportSize.height / 2 - camera.y}px` }}
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
              const edgePath = `M ${sourceScreen.x} ${sourceScreen.y} C ${sourceScreen.x + 120 * zoom} ${sourceScreen.y}, ${targetScreen.x - 120 * zoom} ${targetScreen.y}, ${targetScreen.x} ${targetScreen.y}`;

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
                latestTask={latestTask}
                node={node}
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
                onRegisterVideoElement={(nodeId, element) => {
                  videoPreviewRefs.current[nodeId] = element;
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

      {selectedNode && isStoryboardNodeSelected ? (
        <StoryboardNodePanel
          activeShotDraft={draftStoryboardShot}
          activeShotIndex={activeStoryboardShotIndex}
          canEdit={canEdit}
          canGenerate={canGenerate}
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
          canEdit={canEdit}
          canGenerate={canGenerate}
          draftImagePrompt={draftImagePrompt}
          imageUploadInputRef={imageUploadInputRef}
          isGenerating={isSelectedImageNodeGenerating}
          isSavingImagePrompt={isSavingImagePrompt}
          isTaskActive={isImageNodeTaskActive}
          isUploadingReferenceImages={isUploadingReferenceImages}
          onDownloadImage={downloadSelectedImage}
          onDownloadReferenceAsset={(asset) => {
            triggerDownload(asset.fileUrl, getReferenceAssetDownloadName(asset));
          }}
          onGenerate={() => {
            void triggerImageNodeGeneration();
          }}
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
          canEdit={canEdit}
          canGenerate={canGenerate}
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
    </div>
  );
}

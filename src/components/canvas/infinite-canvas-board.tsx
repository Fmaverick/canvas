"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ExpandedTextEditor, getReferenceAssetDownloadName, ImageNodePanel, TextNodePanel, VideoNodePanel } from "@/components/canvas/infinite-canvas-board-panels";
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
} from "@/components/canvas/infinite-canvas-board.api";
import {
  DEFAULT_VIDEO_NODE_SETTINGS,
  GRID_MAJOR_SIZE,
  GRID_MINOR_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  TEXT_GENERATE_COOLDOWN_MS,
  getCanvasConnectionLabel,
  getCanvasConnectionSemantic,
  getImageNodeOutputSource,
  getManagedVideoAssetIds,
  getPersistedVideoNodeSettings,
  getReferenceAssetById,
  getTextNodeContent,
  getVideoNodeOutputSource,
  inferImageExtension,
  inferVideoExtension,
  isFormFieldTarget,
  normalizeResourceRefs,
  normalizeVideoNodeSettings,
  quickCreateOptions,
  triggerDownload,
  type CanvasNode,
  type CanvasNodeReferenceAsset,
  type CanvasNodeResourceRefs,
  type CanvasNodeType,
  type InstructionPresetOption,
  type InfiniteCanvasBoardProps,
  type LibraryItemOption,
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
  const [draftImagePrompt, setDraftImagePrompt] = useState("");
  const [draftVideoPrompt, setDraftVideoPrompt] = useState("");
  const [draftVideoSettings, setDraftVideoSettings] = useState(DEFAULT_VIDEO_NODE_SETTINGS);
  const [draftResourceRefs, setDraftResourceRefs] = useState<CanvasNodeResourceRefs>(() => normalizeResourceRefs(nodes[0]?.resourceRefs));
  const [expandedTextContent, setExpandedTextContent] = useState("");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [isSavingImagePrompt, setIsSavingImagePrompt] = useState(false);
  const [isSavingVideoPrompt, setIsSavingVideoPrompt] = useState(false);
  const [isUploadingReferenceImages, setIsUploadingReferenceImages] = useState(false);
  const [isUploadingVideoImages, setIsUploadingVideoImages] = useState(false);
  const [generatingTextNodeId, setGeneratingTextNodeId] = useState<string | null>(null);
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

  const apiContext = useMemo(() => ({ canvasId, workspaceId }), [canvasId, workspaceId]);
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

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

  const effectiveSelectedNodeId = nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId : (nodes[0]?.id ?? null);
  const selectedNode = nodes.find((node) => node.id === effectiveSelectedNodeId) ?? null;
  const selectedTask = selectedNode ? latestTaskByNode.get(selectedNode.id) ?? null : null;
  const isTextNodeSelected = selectedNode?.type === "text";
  const isImageNodeSelected = selectedNode?.type === "image";
  const isVideoNodeSelected = selectedNode?.type === "video";
  const isTextNodeTaskActive = selectedTask?.status === "queued" || selectedTask?.status === "processing";
  const isImageNodeTaskActive = selectedTask?.status === "queued" || selectedTask?.status === "processing";
  const isVideoNodeTaskActive = selectedTask?.status === "queued" || selectedTask?.status === "processing";
  const isSelectedTextNodeGenerating = selectedNode?.id === generatingTextNodeId;
  const isSelectedImageNodeGenerating = selectedNode?.id === generatingImageNodeId;
  const isSelectedVideoNodeGenerating = selectedNode?.id === generatingVideoNodeId;
  const isSelectedTextNodeCoolingDown =
    selectedNode?.id === textGenerateCooldown.nodeId && Date.now() < textGenerateCooldown.expiresAt;
  const selectedImageOutputSource = isImageNodeSelected ? getImageNodeOutputSource(selectedNode.outputSnapshot) : null;
  const selectedVideoOutputSource = isVideoNodeSelected ? getVideoNodeOutputSource(selectedNode.outputSnapshot) : null;
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
    if (selectedNode?.type === "text") {
      setDraftPrompt(selectedNode.promptInput ?? "");
      setDraftImagePrompt("");
      setDraftVideoPrompt("");
      setDraftVideoSettings(DEFAULT_VIDEO_NODE_SETTINGS);
      setDraftResourceRefs(normalizeResourceRefs(selectedNode.resourceRefs));
      setExpandedTextContent(getTextNodeContent(selectedNode.outputSnapshot));

      return;
    }

    if (selectedNode?.type === "image") {
      setDraftPrompt("");
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
      setDraftImagePrompt("");
      setDraftVideoPrompt(selectedNode.promptInput ?? "");
      setDraftVideoSettings(normalizeVideoNodeSettings(selectedNode.settingsJson));
      setDraftResourceRefs(normalizeResourceRefs(selectedNode.resourceRefs));
      setExpandedTextContent("");
      setIsExpandedEditorOpen(false);

      return;
    }

    setDraftPrompt("");
    setDraftImagePrompt("");
    setDraftVideoPrompt("");
    setDraftVideoSettings(DEFAULT_VIDEO_NODE_SETTINGS);
    setDraftResourceRefs(normalizeResourceRefs(selectedNode?.resourceRefs));
    setExpandedTextContent("");
    setIsExpandedEditorOpen(false);
  }, [selectedNode]);

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

  const persistNodePosition = useCallback(
    async (nodeId: string, x: number, y: number) => {
      setSavingNodeId(nodeId);

      try {
        await patchCanvasNode(
          apiContext,
          nodeId,
          {
            positionX: Math.round(x),
            positionY: Math.round(y),
          },
          "节点位置保存失败。",
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "节点位置保存失败。");
      } finally {
        setSavingNodeId(null);
      }
    },
    [apiContext],
  );

  const clearPendingConnection = useCallback(() => {
    setPendingConnectionSourceId(null);
    setPendingConnectionPointer(null);
  }, []);

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
        setSelectedNodeId(nextSelectedNodeId);

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
    [apiContext, editingTextNodeTitleId, effectiveSelectedNodeId, nodes, router],
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
        toast.error("当前仅支持 文本→文本/图片/视频，图片→图片/视频。");
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
          positionX: Math.round(x),
          positionY: Math.round(y),
        },
        "拖入创建节点失败。",
      );

      toast.success("节点已拖入画布。");
      if (typeof createdNode.id === "string") {
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

  async function createNodeFromResource(
    source: LibraryItemOption | InstructionPresetOption,
    resourceType: "subject" | "scene" | "instruction",
    nodeType: Exclude<CanvasNodeType, "audio">,
  ) {
    if (!canEdit) {
      return;
    }

    const nextPosition = getNextCreatePosition();
    const option = quickCreateOptions.find((item) => item.value === nodeType);
    const promptInput =
      resourceType === "instruction"
        ? buildPromptFromInstructionPreset(source as InstructionPresetOption)
        : buildPromptFromLibraryItem(source as LibraryItemOption);
    const resourceRefs: CanvasNodeResourceRefs = {
      subjectIds: resourceType === "subject" ? [source.id] : [],
      sceneIds: resourceType === "scene" ? [source.id] : [],
      instructionPresetIds: resourceType === "instruction" ? [source.id] : [],
      assetIds: [],
    };

    try {
      const createdNode = await createCanvasNode(
        apiContext,
        {
          type: nodeType,
          title: `${source.name} · ${option?.label ?? nodeType}`,
          promptInput,
          resourceRefs,
          positionX: Math.round(nextPosition.x),
          positionY: Math.round(nextPosition.y),
        },
        "资源节点创建失败。",
      );

      toast.success("资源已作为节点加入画布。");
      if (typeof createdNode.id === "string") {
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
          settingsJson: {
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
          },
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
          settingsJson: {
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
          },
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
          settingsJson: {
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
          },
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
          settingsJson: {
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
          },
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
    if (!selectedNode || selectedNode.type !== "text") {
      return;
    }

    setIsSavingPrompt(true);

    try {
      await patchCanvasNode(
        apiContext,
        selectedNode.id,
        {
          outputSnapshot: {
            type: "text",
            content: expandedTextContent,
          },
        },
        "文本节点内容保存失败。",
      );

      toast.success("文本节点正文已保存。");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "文本节点内容保存失败。");
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
      setSelectedNodeId(nodeId);

      return;
    }

    const boardPoint = getWorldPoint(clientX, clientY);
    const position = nodePositionMap.get(nodeId);

    if (!boardPoint || !position) {
      return;
    }

    setSelectedNodeId(nodeId);
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
        edgeCount={edges.length}
        hasSelectedNode={Boolean(selectedNode)}
        instructionPresets={instructionPresets}
        isCreateOpen={isCreateOpen}
        nodeCount={nodes.length}
        onCloseCreateOpen={() => setIsCreateOpen(false)}
        onCreateInstructionNode={(instructionPreset, nodeType) => {
          void createNodeFromResource(instructionPreset, "instruction", nodeType);
        }}
        onCreateSceneNode={(scene, nodeType) => {
          void createNodeFromResource(scene, "scene", nodeType);
        }}
        onCreateSubjectNode={(subject, nodeType) => {
          void createNodeFromResource(subject, "subject", nodeType);
        }}
        onSelectQuickType={setQuickType}
        onToggleCreateOpen={() => setIsCreateOpen((value) => !value)}
        onZoomIn={() => updateZoom(zoom + 0.1)}
        onZoomOut={() => updateZoom(zoom - 0.1)}
        quickType={quickType}
        scenes={scenes}
        subjects={subjects}
        taskCount={tasks.length}
        workspaceId={workspaceId}
        zoomLabel={`${Math.round(zoom * 100)}%`}
      />

      <div
        ref={containerRef}
        className={cn("relative h-full overflow-hidden overscroll-none", isPanning ? "cursor-grabbing" : "cursor-grab")}
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
          if (event.target !== event.currentTarget) {
            return;
          }

          setSelectedNodeId(null);
          setSelectedEdgeId(null);
          setIsExpandedEditorOpen(false);
          setEditingTextNodeTitleId(null);
          setEditingTextNodeTitle("");

          if (pendingConnectionSourceId) {
            clearPendingConnection();
          }

          startCanvasPan(event.clientX, event.clientY);
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
                    d={edgePath}
                    fill="transparent"
                    stroke={isSelectedEdge ? "rgba(37,99,235,0.92)" : "url(#edgeGradient)"}
                    strokeWidth={isSelectedEdge ? "4" : "2.5"}
                  />
                  <path
                    d={edgePath}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth="20"
                    onClick={() => {
                      setSelectedNodeId(null);
                      setSelectedEdgeId(edge.id);
                    }}
                  />
                  <g
                    className={cn(canEdit ? "cursor-pointer" : undefined)}
                    onClick={() => {
                      setSelectedNodeId(null);
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
                canEdit={canEdit}
                canGenerate={canGenerate}
                canvasId={canvasId}
                deletingNodeId={deletingNodeId}
                editingTextNodeTitle={editingTextNodeTitle}
                editingTextNodeTitleId={editingTextNodeTitleId}
                effectiveSelectedNodeId={effectiveSelectedNodeId}
                imagePreviewDimensions={imagePreviewDimensions}
                isCoolingDown={textGenerateCooldown.nodeId === node.id && Date.now() < textGenerateCooldown.expiresAt}
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
                onSelectNode={setSelectedNodeId}
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

      {selectedNode && isTextNodeSelected && isExpandedEditorOpen ? (
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

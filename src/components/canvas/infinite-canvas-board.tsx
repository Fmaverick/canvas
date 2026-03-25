"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Clapperboard, Download, Expand, ImageIcon, Play, Plus, ScanSearch, Sparkles, Square, Trash2, Type, Upload, Video, X } from "lucide-react";
import { toast } from "sonner";

import { CanvasTaskActions } from "@/components/canvas/canvas-task-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type CanvasNodeReferenceAsset = {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  width: number | null;
  height: number | null;
};

type CanvasNode = {
  id: string;
  type: string;
  title: string;
  status: string;
  modelKey: string | null;
  promptInput: string | null;
  positionX: string;
  positionY: string;
  outputSnapshot: Record<string, unknown> | null;
  settingsJson: Record<string, unknown> | null;
  resourceRefs: {
    productIds?: string[];
    modelProfileIds?: string[];
    assetIds?: string[];
  } | null;
  referenceAssets?: CanvasNodeReferenceAsset[];
};

type CanvasEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  mergeMode: string;
  priority: number;
};

type CanvasTask = {
  id: string;
  taskType: string;
  status: string;
  nodeId: string | null;
  nodeTitle: string | null;
  canvasName: string | null;
  retryCount: number;
  pollCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  nextPollAt: string | Date | null;
  createdAt: string | Date;
  finishedAt: string | Date | null;
};

type InfiniteCanvasBoardProps = {
  workspaceId: string;
  canEdit: boolean;
  canGenerate: boolean;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  tasks: CanvasTask[];
  canvasId: string;
};

const statusBadgeVariant = {
  idle: "outline",
  queued: "secondary",
  processing: "secondary",
  succeeded: "default",
  failed: "destructive",
} as const;

const GRID_MINOR_SIZE = 28;
const GRID_MAJOR_SIZE = 140;
const NODE_WIDTH = 248;
const NODE_HEIGHT = 132;
const TEXT_NODE_SIZE = 220;
const IMAGE_NODE_MIN_WIDTH = 180;
const IMAGE_NODE_MAX_WIDTH = 320;
const IMAGE_NODE_MIN_HEIGHT = 140;
const IMAGE_NODE_MAX_HEIGHT = 320;
const VIDEO_NODE_WIDTH = 300;
const VIDEO_NODE_HEIGHT = 180;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.8;
const TEXT_GENERATE_COOLDOWN_MS = 4000;

type VideoGenerationMode = "reference" | "first_last" | "multi_shot";

type VideoNodeSettings = {
  generationMode: VideoGenerationMode;
  durationSec: number;
  resolution: "720p" | "1080p";
  motionStrength: number;
  withAudio: boolean;
  firstFrameAssetId: string | null;
  lastFrameAssetId: string | null;
  referenceAssetIds: string[];
  shotPrompts: string[];
};

const DEFAULT_VIDEO_NODE_SETTINGS: VideoNodeSettings = {
  generationMode: "reference",
  durationSec: 5,
  resolution: "720p",
  motionStrength: 50,
  withAudio: false,
  firstFrameAssetId: null,
  lastFrameAssetId: null,
  referenceAssetIds: [],
  shotPrompts: [],
};

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()),
    ),
  );
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeVideoNodeSettings(settingsJson: Record<string, unknown> | null | undefined): VideoNodeSettings {
  const generationMode =
    settingsJson?.generationMode === "first_last" || settingsJson?.generationMode === "multi_shot"
      ? settingsJson.generationMode
      : "reference";
  const durationCandidate =
    typeof settingsJson?.durationSec === "number"
      ? settingsJson.durationSec
      : typeof settingsJson?.duration === "number"
        ? settingsJson.duration
        : DEFAULT_VIDEO_NODE_SETTINGS.durationSec;
  const motionStrengthCandidate =
    typeof settingsJson?.motionStrength === "number"
      ? settingsJson.motionStrength
      : DEFAULT_VIDEO_NODE_SETTINGS.motionStrength;
  const resolution = settingsJson?.resolution === "1080p" ? "1080p" : "720p";

  return {
    generationMode,
    durationSec: clampNumber(Math.round(durationCandidate), 1, 30),
    resolution,
    motionStrength: clampNumber(Math.round(motionStrengthCandidate), 1, 100),
    withAudio: Boolean(settingsJson?.withAudio),
    firstFrameAssetId: typeof settingsJson?.firstFrameAssetId === "string" ? settingsJson.firstFrameAssetId : null,
    lastFrameAssetId: typeof settingsJson?.lastFrameAssetId === "string" ? settingsJson.lastFrameAssetId : null,
    referenceAssetIds: normalizeStringList(settingsJson?.referenceAssetIds),
    shotPrompts: normalizeStringList(settingsJson?.shotPrompts),
  };
}

function serializeVideoNodeSettings(settings: VideoNodeSettings) {
  return {
    generationMode: settings.generationMode,
    duration: settings.durationSec,
    durationSec: settings.durationSec,
    resolution: settings.resolution,
    motionStrength: settings.motionStrength,
    withAudio: settings.withAudio,
    firstFrameAssetId: settings.firstFrameAssetId,
    lastFrameAssetId: settings.lastFrameAssetId,
    referenceAssetIds: settings.referenceAssetIds,
    shotPrompts: settings.shotPrompts,
  };
}

function getReferenceAssetById(referenceAssets: CanvasNodeReferenceAsset[] | undefined, assetId: string | null | undefined) {
  if (!assetId) {
    return null;
  }

  return referenceAssets?.find((asset) => asset.id === assetId) ?? null;
}

function getTextNodeContent(outputSnapshot: Record<string, unknown> | null) {
  if (!outputSnapshot) {
    return "";
  }

  return typeof outputSnapshot.content === "string" ? outputSnapshot.content : "";
}

function getImageNodeOutputSource(outputSnapshot: Record<string, unknown> | null) {
  if (!outputSnapshot) {
    return null;
  }

  const structuredData =
    outputSnapshot.structuredData && typeof outputSnapshot.structuredData === "object"
      ? (outputSnapshot.structuredData as Record<string, unknown>)
      : null;
  const candidates = [structuredData?.imageUrl, structuredData?.dataUri, structuredData?.url, outputSnapshot.content];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      continue;
    }

    const markdownMatch = candidate.match(/!\[[^\]]*]\(([^)]+)\)/);

    if (markdownMatch?.[1]) {
      return markdownMatch[1];
    }

    if (candidate.startsWith("data:image/") || /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getImageNodePreview(
  outputSnapshot: Record<string, unknown> | null,
  referenceAssets: CanvasNodeReferenceAsset[] | undefined,
) {
  return getImageNodeOutputSource(outputSnapshot) ?? referenceAssets?.[0]?.fileUrl ?? null;
}

function getVideoNodeOutputSource(outputSnapshot: Record<string, unknown> | null) {
  if (!outputSnapshot) {
    return null;
  }

  const structuredData =
    outputSnapshot.structuredData && typeof outputSnapshot.structuredData === "object"
      ? (outputSnapshot.structuredData as Record<string, unknown>)
      : null;
  const candidates = [structuredData?.videoUrl, structuredData?.url, outputSnapshot.content];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim().length === 0) {
      continue;
    }

    if (/^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  return null;
}

function inferImageExtension(source: string, mimeType?: string | null) {
  if (mimeType?.includes("/")) {
    return mimeType.split("/")[1] || "png";
  }

  const dataMatch = source.match(/^data:image\/([^;]+)/i);

  if (dataMatch?.[1]) {
    return dataMatch[1];
  }

  const urlMatch = source.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/);

  return urlMatch?.[1] ?? "png";
}

function inferVideoExtension(source: string, mimeType?: string | null) {
  if (mimeType?.includes("/")) {
    return mimeType.split("/")[1] || "mp4";
  }

  const urlMatch = source.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/);

  return urlMatch?.[1] ?? "mp4";
}

function isFormFieldTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function triggerDownload(source: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = source;
  anchor.download = fileName;
  anchor.rel = "noreferrer";
  anchor.target = "_blank";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function getImageNodeSize(dimensions?: { width: number; height: number } | null) {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return {
      width: NODE_WIDTH,
      height: 220,
    };
  }

  const aspectRatio = dimensions.width / dimensions.height;

  if (aspectRatio >= 1) {
    const width = Math.min(IMAGE_NODE_MAX_WIDTH, Math.max(IMAGE_NODE_MIN_WIDTH, 220 * aspectRatio));
    const height = Math.min(IMAGE_NODE_MAX_HEIGHT, Math.max(IMAGE_NODE_MIN_HEIGHT, width / aspectRatio));

    return {
      width,
      height,
    };
  }

  const height = Math.min(IMAGE_NODE_MAX_HEIGHT, Math.max(IMAGE_NODE_MIN_HEIGHT, 220 / aspectRatio));
  const width = Math.min(IMAGE_NODE_MAX_WIDTH, Math.max(IMAGE_NODE_MIN_WIDTH, height * aspectRatio));

  return {
    width,
    height,
  };
}

export function InfiniteCanvasBoard({
  workspaceId,
  canEdit,
  canGenerate,
  nodes,
  edges,
  tasks,
  canvasId,
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
  const [quickType, setQuickType] = useState<"text" | "image" | "video" | "audio">("text");
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
  const [draftVideoSettings, setDraftVideoSettings] = useState<VideoNodeSettings>(DEFAULT_VIDEO_NODE_SETTINGS);
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
  const [textGenerateCooldown, setTextGenerateCooldown] = useState<{
    nodeId: string | null;
    expiresAt: number;
  }>({
    nodeId: null,
    expiresAt: 0,
  });
  const [isExpandedEditorOpen, setIsExpandedEditorOpen] = useState(false);
  const [isCanvasDragOver, setIsCanvasDragOver] = useState(false);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [playingVideoNodeId, setPlayingVideoNodeId] = useState<string | null>(null);

  const latestTaskByNode = useMemo(() => {
    const taskMap = new Map<string, CanvasTask>();

    for (const task of tasks) {
      if (task.nodeId && !taskMap.has(task.nodeId)) {
        taskMap.set(task.nodeId, task);
      }
    }

    return taskMap;
  }, [tasks]);

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

  const effectiveSelectedNodeId = nodes.some((node) => node.id === selectedNodeId) ? selectedNodeId : (nodes[0]?.id ?? null);
  const selectedNode = nodes.find((node) => node.id === effectiveSelectedNodeId) ?? null;
  const selectedTask = selectedNode ? latestTaskByNode.get(selectedNode.id) : null;
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
  const selectedVideoSettings = isVideoNodeSelected
    ? normalizeVideoNodeSettings(selectedNode.settingsJson)
    : DEFAULT_VIDEO_NODE_SETTINGS;
  const selectedVideoFirstFrameAsset = isVideoNodeSelected
    ? getReferenceAssetById(selectedNode.referenceAssets, selectedVideoSettings.firstFrameAssetId)
    : null;
  const selectedVideoLastFrameAsset = isVideoNodeSelected
    ? getReferenceAssetById(selectedNode.referenceAssets, selectedVideoSettings.lastFrameAssetId)
    : null;
  const selectedVideoReferenceAssets = isVideoNodeSelected
    ? selectedVideoSettings.referenceAssetIds
        .map((assetId) => getReferenceAssetById(selectedNode.referenceAssets, assetId))
        .filter((asset): asset is CanvasNodeReferenceAsset => Boolean(asset))
    : [];

  const deleteNodeById = useCallback(async (nodeId: string) => {
    const deletingNode = nodes.find((node) => node.id === nodeId);

    if (!deletingNode) {
      return;
    }

    const nextSelectedNodeId =
      effectiveSelectedNodeId === nodeId ? nodes.find((node) => node.id !== nodeId)?.id ?? null : effectiveSelectedNodeId;

    setDeletingNodeId(nodeId);

    try {
      const response = await fetch(`/api/canvases/${canvasId}/nodes/${nodeId}`, {
        method: "DELETE",
        headers: {
          "x-workspace-id": workspaceId,
        },
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "节点删除失败。");
      }

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
  }, [canvasId, editingTextNodeTitleId, effectiveSelectedNodeId, nodes, router, workspaceId]);

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
    if (selectedNode?.type === "text") {
      setDraftPrompt(selectedNode.promptInput ?? "");
      setDraftImagePrompt("");
      setDraftVideoPrompt("");
      setDraftVideoSettings(DEFAULT_VIDEO_NODE_SETTINGS);
      setExpandedTextContent(getTextNodeContent(selectedNode.outputSnapshot));

      return;
    }

    if (selectedNode?.type === "image") {
      setDraftPrompt("");
      setDraftImagePrompt(selectedNode.promptInput ?? "");
      setDraftVideoPrompt("");
      setDraftVideoSettings(DEFAULT_VIDEO_NODE_SETTINGS);
      setExpandedTextContent("");
      setIsExpandedEditorOpen(false);

      return;
    }

    if (selectedNode?.type === "video") {
      setDraftPrompt("");
      setDraftImagePrompt("");
      setDraftVideoPrompt(selectedNode.promptInput ?? "");
      setDraftVideoSettings(normalizeVideoNodeSettings(selectedNode.settingsJson));
      setExpandedTextContent("");
      setIsExpandedEditorOpen(false);

      return;
    }

    setDraftPrompt("");
    setDraftImagePrompt("");
    setDraftVideoPrompt("");
    setDraftVideoSettings(DEFAULT_VIDEO_NODE_SETTINGS);
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
      setTextGenerateCooldown({
        nodeId: null,
        expiresAt: 0,
      });

      return;
    }

    const timer = window.setTimeout(() => {
      setTextGenerateCooldown({
        nodeId: null,
        expiresAt: 0,
      });
    }, remaining);

    return () => window.clearTimeout(timer);
  }, [textGenerateCooldown]);

  useEffect(() => {
    if (!canEdit || !selectedNode) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isFormFieldTarget(event.target)) {
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }

      event.preventDefault();
      void deleteNodeById(selectedNode.id);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canEdit, deleteNodeById, selectedNode]);

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

    return () => {
      window.removeEventListener("resize", syncViewportSize);
    };
  }, []);

  const quickCreateOptions = [
    {
      label: "文本",
      value: "text" as const,
      icon: Type,
      tint: "from-slate-100 to-slate-50",
      lightTint: "from-slate-100 to-slate-50",
      description: "文案、脚本、标题",
    },
    {
      label: "图片",
      value: "image" as const,
      icon: ImageIcon,
      tint: "from-amber-100 to-lime-50",
      lightTint: "from-amber-100 to-lime-50",
      description: "主视觉、海报、KV",
    },
    {
      label: "视频",
      value: "video" as const,
      icon: Video,
      tint: "from-rose-100 to-fuchsia-50",
      lightTint: "from-rose-100 to-fuchsia-50",
      description: "短视频、镜头生成",
    },
    {
      label: "音频",
      value: "audio" as const,
      icon: AudioLines,
      tint: "from-emerald-100 to-cyan-50",
      lightTint: "from-emerald-100 to-cyan-50",
      description: "配音、音频草案",
    },
  ];
  const nodeCountByType = useMemo(() => {
    return nodes.reduce<Record<string, number>>((accumulator, node) => {
      accumulator[node.type] = (accumulator[node.type] ?? 0) + 1;

      return accumulator;
    }, {});
  }, [nodes]);

  function getWorldPoint(clientX: number, clientY: number) {
    if (!containerRef.current) {
      return null;
    }

    const containerRect = containerRef.current.getBoundingClientRect();

    return {
      x: camera.x + (clientX - containerRect.left - viewportSize.width / 2) / zoom,
      y: camera.y + (clientY - containerRect.top - viewportSize.height / 2) / zoom,
    };
  }

  function getScreenPoint(worldX: number, worldY: number) {
    return {
      x: viewportSize.width / 2 + (worldX - camera.x) * zoom,
      y: viewportSize.height / 2 + (worldY - camera.y) * zoom,
    };
  }

  function clampZoom(value: number) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  }

  function updateZoom(nextZoom: number, clientX?: number, clientY?: number) {
    const clampedZoom = clampZoom(nextZoom);

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
  }

  function syncImagePreviewSize(nodeId: string, width: number, height: number) {
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
        [nodeId]: {
          width,
          height,
        },
      };
    });
  }

  async function persistNodePosition(nodeId: string, x: number, y: number) {
    setSavingNodeId(nodeId);

    try {
      const response = await fetch(`/api/canvases/${canvasId}/nodes/${nodeId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          positionX: Math.round(x),
          positionY: Math.round(y),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "节点位置保存失败。");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "节点位置保存失败。");
    } finally {
      setSavingNodeId(null);
    }
  }

  async function createNodeAtPosition(type: "text" | "image" | "video" | "audio", x: number, y: number) {
    try {
      const option = quickCreateOptions.find((item) => item.value === type);
      const nextNodeIndex = (nodeCountByType[type] ?? 0) + 1;
      const response = await fetch(`/api/canvases/${canvasId}/nodes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          type,
          title: `${option?.label ?? type}节点 ${nextNodeIndex}`,
          promptInput: "",
          positionX: Math.round(x),
          positionY: Math.round(y),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "拖入创建节点失败。");
      }

      toast.success("节点已拖入画布。");
      setQuickType(type);
      setIsCreateOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "拖入创建节点失败。");
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

  async function uploadReferenceImages(files: FileList | null) {
    if (!files || files.length === 0 || !selectedNode || selectedNode.type !== "image") {
      return;
    }

    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      toast.error("请选择图片文件。");

      return;
    }

    setIsUploadingReferenceImages(true);

    try {
      const { nextAssetIds } = await uploadImagesToNode(selectedNode, imageFiles);

      const patchResponse = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          resourceRefs: {
            productIds: selectedNode.resourceRefs?.productIds ?? [],
            modelProfileIds: selectedNode.resourceRefs?.modelProfileIds ?? [],
            assetIds: Array.from(nextAssetIds),
          },
        }),
      });
      const patchResult = await patchResponse.json();

      if (!patchResponse.ok) {
        throw new Error(patchResult?.error?.message ?? "节点引用图片保存失败。");
      }

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

  async function uploadImagesToNode(targetNode: CanvasNode, imageFiles: File[]) {
    const nextAssetIds = new Set(targetNode.resourceRefs?.assetIds ?? []);
    const uploadedAssetIds: string[] = [];

    for (const file of imageFiles) {
      const { width, height } = await readImageDimensions(file);
      const presignResponse = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          ownerType: "canvas_node",
          ownerId: targetNode.id,
        }),
      });
      const presignResult = await presignResponse.json();

      if (!presignResponse.ok) {
        throw new Error(presignResult?.error?.message ?? "上传凭证获取失败。");
      }

      const uploadTicket = presignResult.data as {
        uploadUrl: string;
        storageKey: string;
        headers?: Record<string, string>;
      };
      const uploadResponse = await fetch(uploadTicket.uploadUrl, {
        method: "PUT",
        headers: uploadTicket.headers,
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`文件上传失败：${file.name}`);
      }

      const completeResponse = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          ownerType: "canvas_node",
          ownerId: targetNode.id,
          storageKey: uploadTicket.storageKey,
          fileSize: file.size,
          width,
          height,
        }),
      });
      const completeResult = await completeResponse.json();

      if (!completeResponse.ok) {
        throw new Error(completeResult?.error?.message ?? "上传文件登记失败。");
      }

      nextAssetIds.add(completeResult.data.id);
      uploadedAssetIds.push(completeResult.data.id);
    }

    return {
      uploadedAssetIds,
      nextAssetIds: Array.from(nextAssetIds),
    };
  }

  async function removeReferenceImage(assetId: string) {
    if (!selectedNode || selectedNode.type !== "image") {
      return;
    }

    setIsUploadingReferenceImages(true);

    try {
      const response = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          resourceRefs: {
            productIds: selectedNode.resourceRefs?.productIds ?? [],
            modelProfileIds: selectedNode.resourceRefs?.modelProfileIds ?? [],
            assetIds: (selectedNode.resourceRefs?.assetIds ?? []).filter((id) => id !== assetId),
          },
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "移除参考图失败。");
      }

      toast.success("参考图已移除。");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "移除参考图失败。");
    } finally {
      setIsUploadingReferenceImages(false);
    }
  }

  async function uploadVideoImages(role: "first_frame" | "last_frame" | "reference", files: FileList | null) {
    if (!files || files.length === 0 || !selectedNode || selectedNode.type !== "video") {
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
      const { uploadedAssetIds, nextAssetIds } = await uploadImagesToNode(selectedNode, filesToUpload);
      const nextSettings = normalizeVideoNodeSettings(selectedNode.settingsJson);

      if (role === "first_frame") {
        nextSettings.firstFrameAssetId = uploadedAssetIds[0] ?? nextSettings.firstFrameAssetId;
      }

      if (role === "last_frame") {
        nextSettings.lastFrameAssetId = uploadedAssetIds[0] ?? nextSettings.lastFrameAssetId;
      }

      if (role === "reference") {
        nextSettings.referenceAssetIds = Array.from(new Set([...nextSettings.referenceAssetIds, ...uploadedAssetIds]));
      }

      const response = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          resourceRefs: {
            productIds: selectedNode.resourceRefs?.productIds ?? [],
            modelProfileIds: selectedNode.resourceRefs?.modelProfileIds ?? [],
            assetIds: nextAssetIds,
          },
          settingsJson: serializeVideoNodeSettings(nextSettings),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "视频节点参考图保存失败。");
      }

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
      const nextSettings = normalizeVideoNodeSettings(selectedNode.settingsJson);

      if (nextSettings.firstFrameAssetId === assetId) {
        nextSettings.firstFrameAssetId = null;
      }

      if (nextSettings.lastFrameAssetId === assetId) {
        nextSettings.lastFrameAssetId = null;
      }

      nextSettings.referenceAssetIds = nextSettings.referenceAssetIds.filter((id) => id !== assetId);

      const usedAssetIds = Array.from(
        new Set(
          [nextSettings.firstFrameAssetId, nextSettings.lastFrameAssetId, ...nextSettings.referenceAssetIds].filter(
            (id): id is string => typeof id === "string" && id.length > 0,
          ),
        ),
      );
      const response = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          resourceRefs: {
            productIds: selectedNode.resourceRefs?.productIds ?? [],
            modelProfileIds: selectedNode.resourceRefs?.modelProfileIds ?? [],
            assetIds: usedAssetIds,
          },
          settingsJson: serializeVideoNodeSettings(nextSettings),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "移除视频参考图失败。");
      }

      toast.success("视频参考图已移除。");
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
      const updateResponse = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          promptInput: draftPrompt,
        }),
      });
      const updateResult = await updateResponse.json();

      if (!updateResponse.ok) {
        throw new Error(updateResult?.error?.message ?? "文本节点内容保存失败。");
      }

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
      const updateResponse = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          promptInput: draftPrompt,
        }),
      });
      const updateResult = await updateResponse.json();

      if (!updateResponse.ok) {
        throw new Error(updateResult?.error?.message ?? "文本提示词保存失败。");
      }

      const runResponse = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          request_id: `text-node-run-${crypto.randomUUID()}`,
          useUpstreamOutputs: true,
        }),
      });
      const runResult = await runResponse.json();

      if (!runResponse.ok) {
        throw new Error(runResult?.error?.message ?? "AI 生成失败。");
      }

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
      const response = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          promptInput: draftImagePrompt,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "图片节点提示词保存失败。");
      }

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
      const updateResponse = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          promptInput: draftImagePrompt,
        }),
      });
      const updateResult = await updateResponse.json();

      if (!updateResponse.ok) {
        throw new Error(updateResult?.error?.message ?? "图片提示词保存失败。");
      }

      const runResponse = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          request_id: `image-node-run-${crypto.randomUUID()}`,
          useUpstreamOutputs: true,
        }),
      });
      const runResult = await runResponse.json();

      if (!runResponse.ok) {
        throw new Error(runResult?.error?.message ?? "图片生成失败。");
      }

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
      const response = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          promptInput: draftVideoPrompt,
          settingsJson: serializeVideoNodeSettings(draftVideoSettings),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "视频节点提示词保存失败。");
      }

      toast.success("视频节点配置已保存。");
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
      const updateResponse = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          promptInput: draftVideoPrompt,
          settingsJson: serializeVideoNodeSettings(draftVideoSettings),
        }),
      });
      const updateResult = await updateResponse.json();

      if (!updateResponse.ok) {
        throw new Error(updateResult?.error?.message ?? "视频提示词保存失败。");
      }

      const runResponse = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          request_id: `video-node-run-${crypto.randomUUID()}`,
          useUpstreamOutputs: true,
        }),
      });
      const runResult = await runResponse.json();

      if (!runResponse.ok) {
        throw new Error(runResult?.error?.message ?? "视频生成失败。");
      }

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
      const response = await fetch(`/api/canvases/${canvasId}/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          outputSnapshot: {
            type: "text",
            content: expandedTextContent,
          },
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "文本节点内容保存失败。");
      }

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
      const response = await fetch(`/api/canvases/${canvasId}/nodes/${nodeId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          title: nextTitle,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "文本节点标题保存失败。");
      }

      setEditingTextNodeTitleId(null);
      setEditingTextNodeTitle("");
      toast.success("文本节点标题已保存。");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "文本节点标题保存失败。");
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
    <div className="relative h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.06),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.08),transparent_22%)]" />

      <div className="absolute left-5 top-5 z-20 flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 shadow-sm">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-medium">Canvas Studio</span>
        </div>
        <div className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          无限画布 / 节点运行 / 任务回写
        </div>
      </div>

      <div className="absolute right-5 top-5 z-20 flex items-center gap-2">
        <Link
          className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted"
          href={`/tasks?workspaceId=${workspaceId}`}
        >
          查看任务中心
        </Link>
        <button
          className="rounded-full border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm transition hover:bg-muted"
          type="button"
          onClick={() => setIsCreateOpen((value) => !value)}
        >
          {isCreateOpen ? "隐藏添加面板" : "添加节点"}
        </button>
      </div>

      <div className="absolute left-5 top-24 z-20 flex flex-col gap-2">
        <button
          className="flex size-11 items-center justify-center rounded-2xl border bg-background text-foreground shadow-sm transition hover:bg-muted"
          type="button"
          onClick={() => setIsCreateOpen((value) => !value)}
        >
          <Plus className="size-5" />
        </button>
        <button className="flex size-11 items-center justify-center rounded-2xl border bg-background text-muted-foreground shadow-sm">
          <ScanSearch className="size-4" />
        </button>
        <button className="flex size-11 items-center justify-center rounded-2xl border bg-background text-muted-foreground shadow-sm">
          <Clapperboard className="size-4" />
        </button>
      </div>

      {canEdit && isCreateOpen ? (
        <div className="absolute left-20 top-24 z-20 w-[320px] rounded-[24px] border bg-background p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">添加节点</p>
              <p className="text-xs text-muted-foreground">不要求用户先填坐标，直接拖进画布即可落点创建。</p>
            </div>
            <button
              className="rounded-full border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted"
              type="button"
              onClick={() => setIsCreateOpen(false)}
            >
              关闭
            </button>
          </div>

          <div className="space-y-2">
            {quickCreateOptions.map((option) => {
              const Icon = option.icon;

              return (
                <button
                  key={option.value}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition",
                    quickType === option.value
                      ? "border-primary/30 bg-primary/5 text-foreground"
                      : "bg-background text-foreground hover:bg-muted",
                  )}
                  draggable
                  type="button"
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/x-canvas-node-type", option.value);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => setQuickType(option.value)}
                >
                    <div className={cn("rounded-xl bg-gradient-to-br p-2 text-foreground", option.lightTint)}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-5 left-5 z-20 flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm">
        <span>节点 {nodes.length}</span>
        <span>·</span>
        <span>边 {edges.length}</span>
        <span>·</span>
        <span>任务 {tasks.length}</span>
        {canEdit && selectedNode ? (
          <><span>·</span><span>Delete 删除已选</span></>
        ) : null}
        <span>·</span>
        <button
          className="rounded-md border px-1.5 py-0.5 text-[11px] transition hover:bg-muted"
          type="button"
          onClick={() => updateZoom(zoom - 0.1)}
        >
          -
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          className="rounded-md border px-1.5 py-0.5 text-[11px] transition hover:bg-muted"
          type="button"
          onClick={() => updateZoom(zoom + 0.1)}
        >
          +
        </button>
      </div>

      <div
        ref={containerRef}
        className={cn("relative h-full overflow-hidden", isPanning ? "cursor-grabbing" : "cursor-grab")}
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

          const draggedType = event.dataTransfer.getData("application/x-canvas-node-type") as
            | "text"
            | "image"
            | "video"
            | "audio"
            | "";

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
        onWheel={(event) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            updateZoom(zoom - event.deltaY * 0.0015, event.clientX, event.clientY);

            return;
          }

          setCamera((current) => ({
            x: current.x + event.deltaX / zoom,
            y: current.y + event.deltaY / zoom,
          }));
        }}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }

          startCanvasPan(event.clientX, event.clientY);
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

          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            <defs>
              <linearGradient id="edgeGradient" x1="0%" x2="100%" y1="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(59,130,246,0.42)" />
                <stop offset="100%" stopColor="rgba(14,165,233,0.26)" />
              </linearGradient>
            </defs>
            {edges.map((edge) => {
              const sourcePoint = nodePositionMap.get(edge.sourceNodeId);
              const targetPoint = nodePositionMap.get(edge.targetNodeId);

              if (!sourcePoint || !targetPoint) {
                return null;
              }

              const sourceScreen = getScreenPoint(sourcePoint.x, sourcePoint.y);
              const targetScreen = getScreenPoint(targetPoint.x, targetPoint.y);

              return (
                <g key={edge.id}>
                  <path
                    d={`M ${sourceScreen.x} ${sourceScreen.y} C ${sourceScreen.x + 120 * zoom} ${sourceScreen.y}, ${targetScreen.x - 120 * zoom} ${targetScreen.y}, ${targetScreen.x} ${targetScreen.y}`}
                    fill="transparent"
                    stroke="url(#edgeGradient)"
                    strokeWidth="2.5"
                  />
                  <text
                    fill="rgba(100,116,139,0.82)"
                    fontSize="11"
                    textAnchor="middle"
                    x={(sourceScreen.x + targetScreen.x) / 2}
                    y={(sourceScreen.y + targetScreen.y) / 2 - 10}
                  >
                    {edge.mergeMode}
                  </text>
                </g>
              );
            })}
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

          {nodes.map((node) => {
            const latestTask = latestTaskByNode.get(node.id);
            const position = nodePositionMap.get(node.id);
            const optionTint = quickCreateOptions.find((option) => option.value === node.type)?.tint ?? "from-slate-100 to-slate-50";
            const isTextNode = node.type === "text";
            const isImageNode = node.type === "image";
            const isVideoNode = node.type === "video";
            const imagePreview = node.type === "image" ? getImageNodePreview(node.outputSnapshot, node.referenceAssets) : null;
            const videoSettings = isVideoNode ? normalizeVideoNodeSettings(node.settingsJson) : DEFAULT_VIDEO_NODE_SETTINGS;
            const videoOutputSource = isVideoNode ? getVideoNodeOutputSource(node.outputSnapshot) : null;
            const videoFirstFrameAsset = isVideoNode
              ? getReferenceAssetById(node.referenceAssets, videoSettings.firstFrameAssetId)
              : null;
            const videoReferenceAsset = isVideoNode
              ? getReferenceAssetById(node.referenceAssets, videoSettings.referenceAssetIds[0] ?? null)
              : null;
            const videoLastFrameAsset = isVideoNode
              ? getReferenceAssetById(node.referenceAssets, videoSettings.lastFrameAssetId)
              : null;
            const videoPreviewAsset = videoFirstFrameAsset ?? videoReferenceAsset ?? videoLastFrameAsset;
            const imagePreviewDimensions =
              imagePreviewSizes[node.id] ??
              (node.referenceAssets?.[0]?.width && node.referenceAssets?.[0]?.height
                ? {
                    width: node.referenceAssets[0].width,
                    height: node.referenceAssets[0].height,
                  }
                : null);
            const imageNodeSize = getImageNodeSize(imagePreviewDimensions);
            const isTextNodeGenerating =
              isTextNode &&
              (latestTask?.status === "queued" ||
                latestTask?.status === "processing" ||
                (textGenerateCooldown.nodeId === node.id && Date.now() < textGenerateCooldown.expiresAt));
            const isEditingTitle = editingTextNodeTitleId === node.id;

            if (!position) {
              return null;
            }

            const screenPoint = getScreenPoint(position.x, position.y);

              return (
                <div
                  key={node.id}
                  aria-label={node.title}
                  className={cn(
                    "group absolute rounded-2xl border border-border/80 p-4 text-left text-foreground shadow-[0_18px_40px_rgba(15,23,42,0.10)] backdrop-blur transition hover:shadow-[0_20px_50px_rgba(15,23,42,0.16)]",
                    isTextNode || isImageNode || isVideoNode ? "overflow-visible" : "overflow-hidden",
                    effectiveSelectedNodeId === node.id ? "ring-2 ring-primary/50" : undefined,
                    canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                  )}
                  role="button"
                  style={{
                    left: `${screenPoint.x}px`,
                    top: `${screenPoint.y}px`,
                    width: `${isTextNode ? TEXT_NODE_SIZE : isImageNode ? imageNodeSize.width : isVideoNode ? VIDEO_NODE_WIDTH : NODE_WIDTH}px`,
                    minHeight: `${isTextNode ? TEXT_NODE_SIZE : isImageNode ? imageNodeSize.height : isVideoNode ? VIDEO_NODE_HEIGHT : NODE_HEIGHT}px`,
                    transform: `translate(-50%, -50%) scale(${zoom})`,
                    transformOrigin: "center center",
                  }}
                  tabIndex={0}
                  onDoubleClick={() => {
                    setSelectedNodeId(node.id);

                    if (isTextNode) {
                      setIsExpandedEditorOpen(true);
                    }
                  }}
                  onPointerDown={(event) => startNodeDrag(node.id, event.clientX, event.clientY)}
                >
                  {isTextNode ? (
                    <>
                      <div
                        className="absolute -top-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setEditingTextNodeTitleId(node.id);
                          setEditingTextNodeTitle(node.title);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <div className="rounded-full bg-background px-3 py-1 text-sm font-medium shadow-sm">
                          {isEditingTitle ? (
                            <Input
                              autoFocus
                              className="h-7 min-w-40 border-0 bg-transparent px-0 text-center text-sm shadow-none focus-visible:ring-0"
                              value={editingTextNodeTitle}
                              onBlur={() => saveTextNodeTitle(node.id)}
                              onChange={(event) => setEditingTextNodeTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void saveTextNodeTitle(node.id);
                                }

                                if (event.key === "Escape") {
                                  setEditingTextNodeTitleId(null);
                                  setEditingTextNodeTitle("");
                                }
                              }}
                            />
                          ) : (
                            <span>{node.title}</span>
                          )}
                        </div>
                        {canEdit ? (
                          <button
                            aria-label={`删除${node.title}`}
                            className="inline-flex size-8 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-destructive"
                            disabled={deletingNodeId === node.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteNodeById(node.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                        {isTextNodeGenerating ? (
                          <div className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
                            生成中
                          </div>
                        ) : null}
                        {isSavingTextNodeTitle && isEditingTitle ? (
                          <div className="rounded-full border bg-background px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
                            保存中
                          </div>
                        ) : null}
                      </div>

                      <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-border/80 bg-background shadow-[0_18px_40px_rgba(15,23,42,0.10)] transition hover:shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
                        <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90", optionTint)} />
                        <div className="absolute inset-0 bg-white/62" />
                        <div className="relative flex h-full flex-col p-5">
                          <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                            {getTextNodeContent(node.outputSnapshot) || "双击后直接写内容"}
                          </p>
                          <div className="mt-auto pt-4 text-xs text-muted-foreground">双击节点可放大编辑正文</div>
                        </div>
                      </div>
                    </>
                  ) : isImageNode ? (
                    <>
                      <div
                        className="absolute -top-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 text-foreground"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setEditingTextNodeTitleId(node.id);
                          setEditingTextNodeTitle(node.title);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <div className="rounded-full bg-background px-3 py-1 text-sm font-medium shadow-sm">
                          {isEditingTitle ? (
                            <Input
                              autoFocus
                              className="h-7 min-w-40 border-0 bg-transparent px-0 text-center text-sm shadow-none focus-visible:ring-0"
                              value={editingTextNodeTitle}
                              onBlur={() => saveTextNodeTitle(node.id)}
                              onChange={(event) => setEditingTextNodeTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void saveTextNodeTitle(node.id);
                                }

                                if (event.key === "Escape") {
                                  setEditingTextNodeTitleId(null);
                                  setEditingTextNodeTitle("");
                                }
                              }}
                            />
                          ) : (
                            <span>{node.title}</span>
                          )}
                        </div>
                        {canEdit ? (
                          <button
                            aria-label={`删除${node.title}`}
                            className="inline-flex size-8 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-destructive"
                            disabled={deletingNodeId === node.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteNodeById(node.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                        {latestTask?.status === "queued" || latestTask?.status === "processing" ? (
                          <div className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
                            生成中
                          </div>
                        ) : null}
                        {isSavingTextNodeTitle && isEditingTitle ? (
                          <div className="rounded-full border bg-background px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
                            保存中
                          </div>
                        ) : null}
                      </div>

                      <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-border/80 bg-background shadow-[0_18px_40px_rgba(15,23,42,0.10)] transition hover:shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
                        <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90", optionTint)} />
                        <div className="absolute inset-0 bg-white/24" />
                        {imagePreview ? (
                          <div className="relative h-full w-full">
                            <img
                              alt={node.title}
                              className="h-full w-full object-cover"
                              draggable={false}
                              src={imagePreview}
                              onLoad={(event) =>
                                syncImagePreviewSize(
                                  node.id,
                                  event.currentTarget.naturalWidth,
                                  event.currentTarget.naturalHeight,
                                )
                              }
                            />
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.14),transparent_55%)]">
                            <div className="rounded-full bg-background/80 p-2 shadow-sm">
                              <ImageIcon className="size-4 text-muted-foreground" />
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  ) : isVideoNode ? (
                    <>
                      <div
                        className="absolute -top-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 text-foreground"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setEditingTextNodeTitleId(node.id);
                          setEditingTextNodeTitle(node.title);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <div className="rounded-full bg-background px-3 py-1 text-sm font-medium shadow-sm">
                          {isEditingTitle ? (
                            <Input
                              autoFocus
                              className="h-7 min-w-40 border-0 bg-transparent px-0 text-center text-sm shadow-none focus-visible:ring-0"
                              value={editingTextNodeTitle}
                              onBlur={() => saveTextNodeTitle(node.id)}
                              onChange={(event) => setEditingTextNodeTitle(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void saveTextNodeTitle(node.id);
                                }

                                if (event.key === "Escape") {
                                  setEditingTextNodeTitleId(null);
                                  setEditingTextNodeTitle("");
                                }
                              }}
                            />
                          ) : (
                            <span>{node.title}</span>
                          )}
                        </div>
                        {canEdit ? (
                          <button
                            aria-label={`删除${node.title}`}
                            className="inline-flex size-8 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-destructive"
                            disabled={deletingNodeId === node.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteNodeById(node.id);
                            }}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        ) : null}
                        {latestTask?.status === "queued" || latestTask?.status === "processing" ? (
                          <div className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
                            生成中
                          </div>
                        ) : null}
                        {isSavingTextNodeTitle && isEditingTitle ? (
                          <div className="rounded-full border bg-background px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
                            保存中
                          </div>
                        ) : null}
                      </div>

                      <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-border/80 bg-background shadow-[0_18px_40px_rgba(15,23,42,0.10)] transition hover:shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
                        <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90", optionTint)} />
                        <div className="absolute inset-0 bg-white/24" />
                        {videoOutputSource ? (
                          <div className="relative h-full w-full">
                            <video
                              ref={(element) => {
                                videoPreviewRefs.current[node.id] = element;
                              }}
                              className="h-full w-full object-cover"
                              playsInline
                              preload="metadata"
                              src={videoOutputSource}
                              onEnded={() => setPlayingVideoNodeId((current) => (current === node.id ? null : current))}
                              onPause={() => {
                                const element = videoPreviewRefs.current[node.id];

                                if (!element || element.ended) {
                                  return;
                                }

                                setPlayingVideoNodeId((current) => (current === node.id ? null : current));
                              }}
                              onPointerDown={(event) => event.stopPropagation()}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-background/45 via-transparent to-transparent" />
                            {playingVideoNodeId === node.id ? (
                              <button
                                aria-label={`结束${node.title}播放`}
                                className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-full bg-background/88 text-foreground shadow-sm transition hover:bg-background"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void stopVideoNodePreview(node.id);
                                }}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                <Square className="size-4 fill-current" />
                              </button>
                            ) : (
                              <button
                                aria-label={`播放${node.title}`}
                                className="absolute inset-0 flex items-center justify-center"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void startVideoNodePreview(node.id);
                                }}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                <span className="inline-flex size-14 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg transition hover:scale-105">
                                  <Play className="ml-1 size-6 fill-current" />
                                </span>
                              </button>
                            )}
                          </div>
                        ) : videoPreviewAsset ? (
                          <div className="relative h-full w-full">
                            <img alt={node.title} className="h-full w-full object-cover" draggable={false} src={videoPreviewAsset.fileUrl} />
                            <div className="absolute inset-0 flex items-center justify-center bg-background/10">
                              <span className="inline-flex size-14 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg">
                                <Play className="ml-1 size-6" />
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(244,63,94,0.16),transparent_55%)]">
                            <div className="rounded-full bg-background/80 p-2 shadow-sm">
                              <Video className="size-4 text-muted-foreground" />
                            </div>
                          </div>
                        )}
                        <div
                          className={cn(
                            "pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 transition-opacity duration-200",
                            playingVideoNodeId === node.id ? "opacity-0" : "opacity-0 group-hover:opacity-100",
                          )}
                        >
                          <div className="rounded-full bg-background/88 px-2.5 py-1 text-[11px] text-foreground shadow-sm">
                            {videoSettings.generationMode === "first_last"
                              ? "首尾帧"
                              : videoSettings.generationMode === "multi_shot"
                                ? "多镜头"
                                : "参考生成"}
                          </div>
                          <div className="rounded-full bg-background/88 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
                            {videoSettings.durationSec}s · {videoSettings.resolution}
                          </div>
                          <div className="rounded-full bg-background/88 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
                            {videoSettings.withAudio ? "带声音" : "静音视频"}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90", optionTint)} />
                      <div className="absolute inset-0 bg-white/55" />
                      <div className="relative">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{node.type}</Badge>
                          <Badge variant={statusBadgeVariant[node.status as keyof typeof statusBadgeVariant] ?? "outline"}>
                            {node.status}
                          </Badge>
                          {savingNodeId === node.id ? <Badge variant="ghost">saving</Badge> : null}
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-foreground">{node.title}</p>
                          {canEdit ? (
                            <button
                              aria-label={`删除${node.title}`}
                              className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border bg-background/90 text-muted-foreground shadow-sm transition hover:text-destructive"
                              disabled={deletingNodeId === node.id}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteNodeById(node.id);
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {node.promptInput?.trim() || "当前节点还没有 prompt。"}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {latestTask ? `task ${latestTask.status} · retry ${latestTask.retryCount}` : "尚未运行"}
                        </p>
                        {effectiveSelectedNodeId === node.id ? (
                          <div
                            className="mt-3 flex flex-wrap items-center gap-2"
                            onPointerDown={(event) => event.stopPropagation()}
                          >
                            {canGenerate ? (
                              <CanvasTaskActions
                                canvasId={canvasId}
                                nodeId={node.id}
                                taskId={latestTask?.id}
                                taskStatus={latestTask?.status}
                                taskType={node.type}
                                workspaceId={workspaceId}
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              );
          })}
        </div>
      </div>

      {isTextNodeSelected ? (
        <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
          <div className="w-full max-w-4xl rounded-[24px] border bg-background/96 p-3 shadow-lg">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{selectedNode.title}</p>
                <p className="text-xs text-muted-foreground">这里是给 AI 的输入区，生成结果会填进文本节点内容。</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" type="button" variant="outline" onClick={() => setIsExpandedEditorOpen(true)}>
                  <Expand className="mr-1 size-4" />
                  放大输入
                </Button>
              </div>
            </div>

            <Textarea
              className="min-h-28 resize-none rounded-2xl border-0 bg-muted/40 shadow-none focus-visible:ring-2"
              placeholder="写下你想让 AI 生成的故事、场景、角色设定或文本指令…"
              value={draftPrompt}
              onChange={(event) => setDraftPrompt(event.target.value)}
            />

            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                双击文本节点可直接编辑正文内容；这里则是给 AI 的提示输入
                {isTextNodeTaskActive ? " · 当前正在生成中" : isSelectedTextNodeCoolingDown ? " · 已提交生成，请稍候" : "。"}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <Button disabled={isSavingPrompt} size="sm" type="button" variant="outline" onClick={() => saveTextNodePrompt()}>
                  {isSavingPrompt ? "保存中..." : "保存提示词"}
                </Button>
                <Button
                  disabled={isSavingPrompt || isSelectedTextNodeGenerating || isSelectedTextNodeCoolingDown || isTextNodeTaskActive || !canGenerate}
                  size="sm"
                  type="button"
                  onClick={() => triggerTextNodeGeneration()}
                >
                  {isSelectedTextNodeGenerating
                    ? "提交中..."
                    : isTextNodeTaskActive
                      ? "生成中..."
                      : isSelectedTextNodeCoolingDown
                        ? "已提交"
                        : "AI 生成内容"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isImageNodeSelected ? (
        <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
          <div className="w-full max-w-5xl rounded-[24px] border bg-background/96 p-3 shadow-lg">
            <input
              ref={imageUploadInputRef}
              accept="image/*"
              className="hidden"
              multiple
              type="file"
              onChange={(event) => void uploadReferenceImages(event.target.files)}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedNode.title}</p>
                  <p className="text-xs text-muted-foreground">这里是给 AI 的输入区，可直接出图，也可结合参考图重绘。</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    disabled={!canEdit || isUploadingReferenceImages}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => imageUploadInputRef.current?.click()}
                  >
                    <Upload className="mr-1 size-4" />
                    {isUploadingReferenceImages ? "上传中..." : "上传图片"}
                  </Button>
                  <Button
                    disabled={!selectedImageOutputSource}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => downloadSelectedImage()}
                  >
                    <Download className="mr-1 size-4" />
                    下载图片
                  </Button>
                </div>
              </div>

              <Textarea
                className="min-h-28 resize-none rounded-2xl border-0 bg-muted/35 shadow-none focus-visible:ring-2"
                placeholder="描述你想生成的画面风格、主体、场景，也可以先上传参考图再做图生图"
                value={draftImagePrompt}
                onChange={(event) => setDraftImagePrompt(event.target.value)}
              />

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {(selectedNode.referenceAssets?.length ?? 0) > 0
                    ? `已关联 ${selectedNode.referenceAssets?.length ?? 0} 张参考图`
                    : "当前没有参考图，直接按提示词出图"}
                  {selectedImageOutputSource ? " · 结果会直接显示在节点上。" : "。"}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    disabled={isSavingImagePrompt || !canEdit}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => saveImageNodePrompt()}
                  >
                    {isSavingImagePrompt ? "保存中..." : "保存提示词"}
                  </Button>
                  <Button
                    disabled={isSavingImagePrompt || isSelectedImageNodeGenerating || isImageNodeTaskActive || !canGenerate}
                    size="sm"
                    type="button"
                    onClick={() => triggerImageNodeGeneration()}
                  >
                    {isSelectedImageNodeGenerating ? "提交中..." : isImageNodeTaskActive ? "生成中..." : "AI 生成图片"}
                  </Button>
                </div>
              </div>

              {selectedNode.referenceAssets?.length ? (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {selectedNode.referenceAssets.map((asset) => (
                    <div key={asset.id} className="relative shrink-0">
                      <button
                        className="block h-16 w-16 overflow-hidden rounded-xl border bg-background shadow-sm transition hover:opacity-90"
                        type="button"
                        onClick={() =>
                          triggerDownload(
                            asset.fileUrl,
                            `${asset.fileName.replace(/\.[^.]+$/, "")}.${inferImageExtension(asset.fileUrl, asset.mimeType)}`,
                          )
                        }
                      >
                        <img alt={asset.fileName} className="h-full w-full object-cover" src={asset.fileUrl} />
                      </button>
                      <button
                        aria-label="移除参考图"
                        className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-foreground"
                        disabled={!canEdit || isUploadingReferenceImages}
                        type="button"
                        onClick={() => removeReferenceImage(asset.id)}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isVideoNodeSelected ? (
        <div className="absolute inset-x-0 bottom-6 z-20 flex justify-center px-6">
          <div className="w-full max-w-6xl rounded-[24px] border bg-background/96 p-3 shadow-lg">
            <input
              ref={videoFirstFrameInputRef}
              accept="image/*"
              className="hidden"
              type="file"
              onChange={(event) => void uploadVideoImages("first_frame", event.target.files)}
            />
            <input
              ref={videoLastFrameInputRef}
              accept="image/*"
              className="hidden"
              type="file"
              onChange={(event) => void uploadVideoImages("last_frame", event.target.files)}
            />
            <input
              ref={videoReferenceInputRef}
              accept="image/*"
              className="hidden"
              multiple
              type="file"
              onChange={(event) => void uploadVideoImages("reference", event.target.files)}
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{selectedNode.title}</p>
                  <p className="text-xs text-muted-foreground">支持首尾帧视频、多镜头模式与参考生成，交互风格和图片节点保持一致。</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    disabled={!canEdit || isUploadingVideoImages}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (draftVideoSettings.generationMode === "first_last") {
                        videoFirstFrameInputRef.current?.click();

                        return;
                      }

                      videoReferenceInputRef.current?.click();
                    }}
                  >
                    <Upload className="mr-1 size-4" />
                    {isUploadingVideoImages ? "上传中..." : "上传参考"}
                  </Button>
                  <Button
                    disabled={!selectedVideoOutputSource}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => downloadSelectedVideo()}
                  >
                    <Download className="mr-1 size-4" />
                    下载视频
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                <Textarea
                  className="min-h-32 resize-none rounded-2xl border-0 bg-muted/35 shadow-none focus-visible:ring-2"
                  placeholder="描述视频内容、镜头语言、运动方式、主体和节奏，也可以结合首尾帧或参考图生成"
                  value={draftVideoPrompt}
                  onChange={(event) => setDraftVideoPrompt(event.target.value)}
                />

                <div className="grid gap-3 rounded-2xl bg-muted/25 p-3 md:grid-cols-2">
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>生成模式</span>
                    <select
                      className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
                      value={draftVideoSettings.generationMode}
                      onChange={(event) =>
                        setDraftVideoSettings((current) => ({
                          ...current,
                          generationMode: event.target.value as VideoGenerationMode,
                        }))
                      }
                    >
                      <option value="reference">参考生成</option>
                      <option value="first_last">首尾帧视频</option>
                      <option value="multi_shot">多镜头模式</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>分辨率</span>
                    <select
                      className="flex h-9 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring"
                      value={draftVideoSettings.resolution}
                      onChange={(event) =>
                        setDraftVideoSettings((current) => ({
                          ...current,
                          resolution: event.target.value === "1080p" ? "1080p" : "720p",
                        }))
                      }
                    >
                      <option value="720p">720p</option>
                      <option value="1080p">1080p</option>
                    </select>
                  </label>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <span>声音</span>
                    <Button
                      className="w-full justify-center"
                      size="sm"
                      type="button"
                      variant={draftVideoSettings.withAudio ? "default" : "outline"}
                      onClick={() =>
                        setDraftVideoSettings((current) => ({
                          ...current,
                          withAudio: !current.withAudio,
                        }))
                      }
                    >
                      {draftVideoSettings.withAudio ? "生成带声音视频" : "生成静音视频"}
                    </Button>
                  </div>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>时长（秒）</span>
                    <Input
                      max={30}
                      min={1}
                      type="number"
                      value={draftVideoSettings.durationSec}
                      onChange={(event) =>
                        setDraftVideoSettings((current) => ({
                          ...current,
                          durationSec: clampNumber(Number(event.target.value) || DEFAULT_VIDEO_NODE_SETTINGS.durationSec, 1, 30),
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1 text-xs text-muted-foreground">
                    <span>运动强度（1-100）</span>
                    <Input
                      max={100}
                      min={1}
                      type="number"
                      value={draftVideoSettings.motionStrength}
                      onChange={(event) =>
                        setDraftVideoSettings((current) => ({
                          ...current,
                          motionStrength: clampNumber(Number(event.target.value) || DEFAULT_VIDEO_NODE_SETTINGS.motionStrength, 1, 100),
                        }))
                      }
                    />
                  </label>
                </div>
              </div>

              {draftVideoSettings.generationMode === "multi_shot" ? (
                <Textarea
                  className="min-h-24 resize-none rounded-2xl border-0 bg-muted/30 shadow-none focus-visible:ring-2"
                  placeholder={"一行一个镜头，例如：\n镜头 1：产品从暗处转入主光，缓慢推进\n镜头 2：特写展示材质与细节\n镜头 3：人物上手使用并收尾定格"}
                  value={draftVideoSettings.shotPrompts.join("\n")}
                  onChange={(event) =>
                    setDraftVideoSettings((current) => ({
                      ...current,
                      shotPrompts: event.target.value
                        .split("\n")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {draftVideoSettings.generationMode === "first_last"
                    ? `${selectedVideoFirstFrameAsset ? "已设置首帧" : "未设置首帧"} · ${selectedVideoLastFrameAsset ? "已设置末帧" : "未设置末帧"}`
                    : draftVideoSettings.generationMode === "multi_shot"
                      ? `已配置 ${draftVideoSettings.shotPrompts.length} 个镜头`
                      : `已关联 ${selectedVideoReferenceAssets.length} 张参考图`}
                  {draftVideoSettings.withAudio ? " · 将请求带声音视频" : " · 当前请求静音视频"}
                  {selectedVideoOutputSource ? " · 结果会直接显示在视频节点上。" : "。"}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    disabled={isSavingVideoPrompt || !canEdit}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => saveVideoNodePrompt()}
                  >
                    {isSavingVideoPrompt ? "保存中..." : "保存配置"}
                  </Button>
                  <Button
                    disabled={isSavingVideoPrompt || isSelectedVideoNodeGenerating || isVideoNodeTaskActive || !canGenerate}
                    size="sm"
                    type="button"
                    onClick={() => triggerVideoNodeGeneration()}
                  >
                    {isSelectedVideoNodeGenerating ? "提交中..." : isVideoNodeTaskActive ? "生成中..." : "AI 生成视频"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                <div className="rounded-2xl border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">首帧</p>
                    <Button
                      disabled={!canEdit || isUploadingVideoImages}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => videoFirstFrameInputRef.current?.click()}
                    >
                      上传
                    </Button>
                  </div>
                  {selectedVideoFirstFrameAsset ? (
                    <div className="relative h-24 overflow-hidden rounded-xl border">
                      <img alt={selectedVideoFirstFrameAsset.fileName} className="h-full w-full object-cover" src={selectedVideoFirstFrameAsset.fileUrl} />
                      <button
                        aria-label="移除首帧"
                        className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-foreground"
                        disabled={!canEdit || isUploadingVideoImages}
                        type="button"
                        onClick={() => removeVideoAsset(selectedVideoFirstFrameAsset.id)}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">上传首帧参考</div>
                  )}
                </div>

                <div className="rounded-2xl border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">末帧</p>
                    <Button
                      disabled={!canEdit || isUploadingVideoImages}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => videoLastFrameInputRef.current?.click()}
                    >
                      上传
                    </Button>
                  </div>
                  {selectedVideoLastFrameAsset ? (
                    <div className="relative h-24 overflow-hidden rounded-xl border">
                      <img alt={selectedVideoLastFrameAsset.fileName} className="h-full w-full object-cover" src={selectedVideoLastFrameAsset.fileUrl} />
                      <button
                        aria-label="移除末帧"
                        className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-foreground"
                        disabled={!canEdit || isUploadingVideoImages}
                        type="button"
                        onClick={() => removeVideoAsset(selectedVideoLastFrameAsset.id)}
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">上传末帧参考</div>
                  )}
                </div>

                <div className="rounded-2xl border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-foreground">参考图</p>
                    <Button
                      disabled={!canEdit || isUploadingVideoImages}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => videoReferenceInputRef.current?.click()}
                    >
                      上传
                    </Button>
                  </div>
                  {selectedVideoReferenceAssets.length ? (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {selectedVideoReferenceAssets.map((asset) => (
                        <div key={asset.id} className="relative shrink-0">
                          <img alt={asset.fileName} className="h-16 w-16 rounded-xl border object-cover" src={asset.fileUrl} />
                          <button
                            aria-label="移除参考图"
                            className="absolute -right-1 -top-1 inline-flex size-5 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition hover:text-foreground"
                            disabled={!canEdit || isUploadingVideoImages}
                            type="button"
                            onClick={() => removeVideoAsset(asset.id)}
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-24 items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground">上传参考图做视频参考生成</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isTextNodeSelected && isExpandedEditorOpen ? (
        <div className="absolute inset-0 z-30 overflow-y-auto bg-background/70 p-6 backdrop-blur-sm">
          <div className="mx-auto my-6 flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
            <div className="flex max-h-[calc(100vh-4rem)] w-full flex-col rounded-[32px] border bg-background p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold">{selectedNode.title}</p>
                <p className="text-sm text-muted-foreground">这里是文本节点正文编辑区，双击节点后直接进入，用于手工编辑最终内容。</p>
              </div>
              <Button size="sm" type="button" variant="outline" onClick={() => setIsExpandedEditorOpen(false)}>
                关闭
              </Button>
            </div>

            <Textarea
              className="min-h-[48vh] flex-1 overflow-y-auto resize-none rounded-[28px] text-lg leading-8"
              placeholder="输入内容…"
              value={expandedTextContent}
              onChange={(event) => setExpandedTextContent(event.target.value)}
            />

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">这里保存的是文本节点正文，不是 AI 提示词。</p>
              <div className="flex items-center gap-2">
                <Button disabled={isSavingPrompt} type="button" variant="outline" onClick={() => saveExpandedTextContent()}>
                  {isSavingPrompt ? "保存中..." : "保存内容"}
                </Button>
              </div>
            </div>
          </div>
        </div>
        </div>
      ) : null}

    </div>
  );
}

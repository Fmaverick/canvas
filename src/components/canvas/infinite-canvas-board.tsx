"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, Clapperboard, Expand, ImageIcon, Plus, ScanSearch, Sparkles, Type, Video } from "lucide-react";
import { toast } from "sonner";

import { CanvasTaskActions } from "@/components/canvas/canvas-task-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 1.8;
const TEXT_GENERATE_COOLDOWN_MS = 4000;

function getTextNodeContent(outputSnapshot: Record<string, unknown> | null) {
  if (!outputSnapshot) {
    return "";
  }

  return typeof outputSnapshot.content === "string" ? outputSnapshot.content : "";
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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(nodes[0]?.id ?? null);
  const [isCreateOpen, setIsCreateOpen] = useState(nodes.length === 0);
  const [quickType, setQuickType] = useState<"text" | "image" | "video" | "audio">("text");
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [savingNodeId, setSavingNodeId] = useState<string | null>(null);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [expandedTextContent, setExpandedTextContent] = useState("");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [generatingTextNodeId, setGeneratingTextNodeId] = useState<string | null>(null);
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
  const isTextNodeTaskActive = selectedTask?.status === "queued" || selectedTask?.status === "processing";
  const isSelectedTextNodeGenerating = selectedNode?.id === generatingTextNodeId;
  const isSelectedTextNodeCoolingDown =
    selectedNode?.id === textGenerateCooldown.nodeId && Date.now() < textGenerateCooldown.expiresAt;

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
      setExpandedTextContent(getTextNodeContent(selectedNode.outputSnapshot));

      return;
    }

    setDraftPrompt("");
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
                    "absolute rounded-2xl border border-border/80 p-4 text-left text-foreground shadow-[0_18px_40px_rgba(15,23,42,0.10)] backdrop-blur transition hover:shadow-[0_20px_50px_rgba(15,23,42,0.16)]",
                    isTextNode ? "overflow-visible" : "overflow-hidden",
                    isTextNode ? "overflow-visible" : "overflow-hidden",
                    effectiveSelectedNodeId === node.id ? "ring-2 ring-primary/50" : undefined,
                    canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                  )}
                  role="button"
                  style={{
                    left: `${screenPoint.x}px`,
                    top: `${screenPoint.y}px`,
                    width: `${isTextNode ? TEXT_NODE_SIZE : NODE_WIDTH}px`,
                    minHeight: `${isTextNode ? TEXT_NODE_SIZE : NODE_HEIGHT}px`,
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
                        className="absolute -top-10 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2"
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
                        <p className="font-medium text-foreground">{node.title}</p>
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
              <Button size="sm" type="button" variant="outline" onClick={() => setIsExpandedEditorOpen(true)}>
                <Expand className="mr-1 size-4" />
                放大输入
              </Button>
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

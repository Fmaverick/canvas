"use client";

import { memo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Clapperboard, ImageIcon, Play, Square, Trash2, Video } from "lucide-react";

import { CanvasTaskActions } from "@/components/canvas/canvas-task-actions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  canCanvasNodeReceiveConnection,
  canCanvasNodeStartConnection,
  getStoryboardPreviewText,
  getStoryboardShots,
  getStoryboardShotCount,
  getStoryboardTotalDuration,
  DEFAULT_VIDEO_NODE_SETTINGS,
  STORYBOARD_NODE_HEIGHT,
  STORYBOARD_NODE_WIDTH,
  TEXT_NODE_SIZE,
  VIDEO_NODE_HEIGHT,
  VIDEO_NODE_WIDTH,
  getImageNodePreview,
  getImageNodeSize,
  getReferenceAssetById,
  getTextNodeContent,
  getVideoNodeOutputSource,
  normalizeStoryboardNodeSettings,
  normalizeVideoNodeSettings,
  quickCreateOptions,
  statusBadgeVariant,
  type CanvasNode,
  type CanvasTask,
} from "@/components/canvas/infinite-canvas-board.shared";

type InfiniteCanvasBoardNodeCardProps = {
  canvasId: string;
  workspaceId: string;
  canEdit: boolean;
  canGenerate: boolean;
  node: CanvasNode;
  latestTask?: CanvasTask | null;
  effectiveSelectedNodeId: string | null;
  isSelected: boolean;
  screenPoint: { x: number; y: number };
  zoom: number;
  imagePreviewDimensions?: { width: number; height: number } | null;
  savingNodeId: string | null;
  deletingNodeId: string | null;
  editingTextNodeTitleId: string | null;
  editingTextNodeTitle: string;
  isSavingTextNodeTitle: boolean;
  playingVideoNodeId: string | null;
  isCoolingDown: boolean;
  pendingConnectionSourceId: string | null;
  pendingConnectionLabel: string | null;
  canAcceptPendingConnection: boolean;
  isPendingConnectionTarget: boolean;
  onRegisterVideoElement: (nodeId: string, element: HTMLVideoElement | null) => void;
  onSelectNode: (nodeId: string, options?: { additive: boolean }) => void;
  onOpenTextEditor: () => void;
  onStartDrag: (nodeId: string, clientX: number, clientY: number) => void;
  onDeleteNode: (nodeId: string) => void;
  onStartEditingTitle: (nodeId: string, title: string) => void;
  onTitleChange: (value: string) => void;
  onSaveTitle: (nodeId: string) => void;
  onCancelEditingTitle: () => void;
  onSyncImagePreviewSize: (nodeId: string, width: number, height: number) => void;
  onStartVideoPreview: (nodeId: string) => void;
  onStopVideoPreview: (nodeId: string) => void;
  onClearPlayingVideoNode: (nodeId: string) => void;
  onStartConnection: (nodeId: string) => void;
  onCompleteConnection: (nodeId: string) => void;
  onRuntimeChanged?: () => Promise<void> | void;
  activeStoryboardShotIndex?: number;
  onSelectStoryboardShot?: (nodeId: string, shotIndex: number) => void;
};

type NodeFloatingTitleBarProps = {
  canEdit: boolean;
  node: CanvasNode;
  deletingNodeId: string | null;
  isEditingTitle: boolean;
  editingTextNodeTitle: string;
  isSavingTextNodeTitle: boolean;
  extraStatus?: ReactNode;
  onDeleteNode: (nodeId: string) => void;
  onStartEditingTitle: (nodeId: string, title: string) => void;
  onTitleChange: (value: string) => void;
  onSaveTitle: (nodeId: string) => void;
  onCancelEditingTitle: () => void;
};

function NodeFloatingTitleBar({
  canEdit,
  node,
  deletingNodeId,
  isEditingTitle,
  editingTextNodeTitle,
  isSavingTextNodeTitle,
  extraStatus,
  onDeleteNode,
  onStartEditingTitle,
  onTitleChange,
  onSaveTitle,
  onCancelEditingTitle,
}: NodeFloatingTitleBarProps) {
  return (
    <div
      className="absolute -top-10 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 text-foreground"
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStartEditingTitle(node.id, node.title);
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="rounded-full bg-background px-3 py-1 text-sm font-medium shadow-sm">
        {isEditingTitle ? (
          <Input
            autoFocus
            className="h-7 min-w-40 border-0 bg-transparent px-0 text-center text-sm shadow-none focus-visible:ring-0"
            value={editingTextNodeTitle}
            onBlur={() => onSaveTitle(node.id)}
            onChange={(event) => onTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSaveTitle(node.id);
              }

              if (event.key === "Escape") {
                onCancelEditingTitle();
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
            onDeleteNode(node.id);
          }}
        >
          <Trash2 className="size-4" />
        </button>
      ) : null}
      {extraStatus}
      {isSavingTextNodeTitle && isEditingTitle ? (
        <div className="rounded-full border bg-background px-2 py-1 text-[11px] text-muted-foreground shadow-sm">
          保存中
        </div>
      ) : null}
    </div>
  );
}

type ConnectionHandleProps = {
  direction: "incoming" | "outgoing";
  zoom: number;
  isActive: boolean;
  isAvailable: boolean;
  label: string;
  onClick: () => void;
};

function ConnectionHandle({ direction, zoom, isActive, isAvailable, label, onClick }: ConnectionHandleProps) {
  const isIncoming = direction === "incoming";
  const handleScale = zoom < 1 ? Math.min(1.65, 1 / Math.max(zoom, 0.45)) : 1;

  return (
    <button
      aria-label={label}
      className={cn(
        "absolute top-1/2 z-30 inline-flex h-10 w-10 touch-manipulation items-center justify-center rounded-full border bg-background/96 text-[11px] font-semibold text-muted-foreground shadow-md transition",
        isIncoming ? "-left-5" : "-right-5",
        isAvailable ? "hover:border-primary/50 hover:text-primary" : "cursor-not-allowed opacity-45",
        isActive ? "border-primary bg-primary text-primary-foreground opacity-100" : undefined,
      )}
      disabled={!isAvailable}
      style={{ transform: `translateY(-50%) scale(${handleScale})` }}
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {isIncoming ? "入" : "出"}
    </button>
  );
}

function InfiniteCanvasBoardNodeCardComponent({
  canvasId,
  workspaceId,
  canEdit,
  canGenerate,
  node,
  latestTask,
  effectiveSelectedNodeId,
  isSelected,
  screenPoint,
  zoom,
  imagePreviewDimensions,
  savingNodeId,
  deletingNodeId,
  editingTextNodeTitleId,
  editingTextNodeTitle,
  isSavingTextNodeTitle,
  playingVideoNodeId,
  isCoolingDown,
  pendingConnectionSourceId,
  pendingConnectionLabel,
  canAcceptPendingConnection,
  isPendingConnectionTarget,
  onRegisterVideoElement,
  onSelectNode,
  onOpenTextEditor,
  onStartDrag,
  onDeleteNode,
  onStartEditingTitle,
  onTitleChange,
  onSaveTitle,
  onCancelEditingTitle,
  onSyncImagePreviewSize,
  onStartVideoPreview,
  onStopVideoPreview,
  onClearPlayingVideoNode,
  onStartConnection,
  onCompleteConnection,
  onRuntimeChanged,
  activeStoryboardShotIndex = 0,
  onSelectStoryboardShot,
}: InfiniteCanvasBoardNodeCardProps) {
  const optionTint = quickCreateOptions.find((option) => option.value === node.type)?.tint ?? "from-slate-100 to-slate-50";
  const isTextNode = node.type === "text";
  const isStoryboardNode = node.type === "storyboard";
  const isImageNode = node.type === "image";
  const isVideoNode = node.type === "video";
  const canStartConnection = canEdit && canCanvasNodeStartConnection(node.type);
  const canReceiveConnection = canEdit && canCanvasNodeReceiveConnection(node.type);
  const imagePreview = isImageNode ? getImageNodePreview(node.outputSnapshot, node.referenceAssets) : null;
  const videoSettings = isVideoNode ? normalizeVideoNodeSettings(node.settingsJson) : DEFAULT_VIDEO_NODE_SETTINGS;
  const videoOutputSource = isVideoNode ? getVideoNodeOutputSource(node.outputSnapshot) : null;
  const videoFirstFrameAsset = isVideoNode ? getReferenceAssetById(node.referenceAssets, videoSettings.firstFrameAssetId) : null;
  const videoReferenceAsset = isVideoNode
    ? getReferenceAssetById(node.referenceAssets, videoSettings.referenceAssetIds[0] ?? null)
    : null;
  const videoLastFrameAsset = isVideoNode ? getReferenceAssetById(node.referenceAssets, videoSettings.lastFrameAssetId) : null;
  const videoPreviewAsset = videoFirstFrameAsset ?? videoReferenceAsset ?? videoLastFrameAsset;
  const imageNodeSize = getImageNodeSize(imagePreviewDimensions);
  const storyboardSettings = isStoryboardNode ? normalizeStoryboardNodeSettings(node.settingsJson) : null;
  const storyboardPreview = isStoryboardNode ? getStoryboardPreviewText(node.outputSnapshot) : "";
  const storyboardShots = isStoryboardNode ? getStoryboardShots(node.outputSnapshot) : [];
  const storyboardShotCount = isStoryboardNode ? getStoryboardShotCount(node.outputSnapshot) : 0;
  const storyboardTotalDuration = isStoryboardNode ? getStoryboardTotalDuration(node.outputSnapshot) : 0;
  const storyboardActiveShot =
    storyboardShots.length > 0
      ? storyboardShots[Math.min(storyboardShots.length - 1, Math.max(0, activeStoryboardShotIndex))]
      : null;
  const isTextLikeNodeGenerating =
    (isTextNode || isStoryboardNode) &&
    (latestTask?.status === "queued" || latestTask?.status === "processing" || (isTextNode && isCoolingDown));
  const isEditingTitle = editingTextNodeTitleId === node.id;
  const isPendingSource = pendingConnectionSourceId === node.id;
  const isConnectionMode = Boolean(pendingConnectionSourceId);

  return (
    <div
      aria-label={node.title}
      data-canvas-node-id={node.id}
      className={cn(
        "group absolute rounded-2xl border border-border/80 p-4 text-left text-foreground shadow-[0_18px_40px_rgba(15,23,42,0.10)] backdrop-blur transition hover:shadow-[0_20px_50px_rgba(15,23,42,0.16)]",
        isTextNode || isStoryboardNode || isImageNode || isVideoNode ? "overflow-visible" : "overflow-hidden",
        isSelected ? "ring-2 ring-primary/50" : undefined,
        effectiveSelectedNodeId === node.id ? "shadow-[0_0_0_6px_rgba(59,130,246,0.12)]" : undefined,
        isPendingSource ? "ring-2 ring-primary/60" : undefined,
        isPendingConnectionTarget ? "ring-2 ring-emerald-500/60 shadow-[0_0_0_10px_rgba(16,185,129,0.08)]" : undefined,
        isConnectionMode && !isPendingSource && !isPendingConnectionTarget ? "opacity-70" : undefined,
        canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isConnectionMode ? "cursor-pointer" : undefined,
      )}
      role="button"
      style={{
        left: `${screenPoint.x}px`,
        top: `${screenPoint.y}px`,
        width: `${isTextNode ? TEXT_NODE_SIZE : isStoryboardNode ? STORYBOARD_NODE_WIDTH : isImageNode ? imageNodeSize.width : isVideoNode ? VIDEO_NODE_WIDTH : 248}px`,
        minHeight: `${isTextNode ? TEXT_NODE_SIZE : isStoryboardNode ? STORYBOARD_NODE_HEIGHT : isImageNode ? imageNodeSize.height : isVideoNode ? VIDEO_NODE_HEIGHT : 132}px`,
        transform: `translate(-50%, -50%) scale(${zoom})`,
        transformOrigin: "center center",
      }}
      tabIndex={0}
      onDoubleClick={(event) => {
        onSelectNode(node.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey });

        if (isTextNode || isStoryboardNode) {
          onOpenTextEditor();
        }
      }}
      onClick={(event) => {
        onSelectNode(node.id, { additive: event.metaKey || event.ctrlKey || event.shiftKey });

        if (canAcceptPendingConnection) {
          onCompleteConnection(node.id);
        }
      }}
      onPointerDown={(event) => {
        if (isConnectionMode) {
          event.stopPropagation();

          return;
        }

        onStartDrag(node.id, event.clientX, event.clientY);
      }}
    >
      {canReceiveConnection ? (
        <ConnectionHandle
          direction="incoming"
          zoom={zoom}
          isActive={canAcceptPendingConnection}
          isAvailable={Boolean(pendingConnectionSourceId && canAcceptPendingConnection)}
          label={
            pendingConnectionSourceId
              ? canAcceptPendingConnection
                ? `${node.title}接收${pendingConnectionLabel ?? "连线"}`
                : `${node.title}当前不支持该连线`
              : `请先选择一个上游节点`
          }
          onClick={() => {
            if (pendingConnectionSourceId) {
              onCompleteConnection(node.id);
            }
          }}
        />
      ) : null}

      {canStartConnection ? (
        <ConnectionHandle
          direction="outgoing"
          zoom={zoom}
          isActive={isPendingSource}
          isAvailable
          label={isPendingSource ? `取消从${node.title}发出的连线` : `从${node.title}发起连线`}
          onClick={() => onStartConnection(node.id)}
        />
      ) : null}

      {isPendingConnectionTarget ? (
        <div className="pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm">
          点击连接{pendingConnectionLabel ? ` · ${pendingConnectionLabel}` : ""}
        </div>
      ) : null}

      {isTextNode ? (
        <>
          <NodeFloatingTitleBar
            canEdit={canEdit}
            deletingNodeId={deletingNodeId}
            editingTextNodeTitle={editingTextNodeTitle}
            extraStatus={
              isTextLikeNodeGenerating ? (
                <div className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
                  生成中
                </div>
              ) : null
            }
            isEditingTitle={isEditingTitle}
            isSavingTextNodeTitle={isSavingTextNodeTitle}
            node={node}
            onCancelEditingTitle={onCancelEditingTitle}
            onDeleteNode={onDeleteNode}
            onSaveTitle={onSaveTitle}
            onStartEditingTitle={onStartEditingTitle}
            onTitleChange={onTitleChange}
          />

          <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-border/80 bg-background shadow-[0_18px_40px_rgba(15,23,42,0.10)] transition hover:shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90", optionTint)} />
            <div className="absolute inset-0 bg-white/62" />
            <div className="relative flex h-full flex-col p-5">
              <p className="line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                {isStoryboardNode ? storyboardPreview || "生成后会在这里显示分镜 JSON 摘要" : getTextNodeContent(node.outputSnapshot) || "双击后直接写内容"}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
                <span>{isStoryboardNode ? "双击节点可查看或编辑 JSON 输出" : "双击节点可放大编辑正文"}</span>
                {isStoryboardNode ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-1 text-[11px] text-foreground shadow-sm">
                    <Clapperboard className="size-3" />
                    {storyboardShotCount > 0 ? `${storyboardShotCount} 镜头` : `${storyboardSettings?.shotCount ?? 0} 镜头目标`}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </>
      ) : isStoryboardNode ? (
        <>
          <NodeFloatingTitleBar
            canEdit={canEdit}
            deletingNodeId={deletingNodeId}
            editingTextNodeTitle={editingTextNodeTitle}
            extraStatus={
              isTextLikeNodeGenerating ? (
                <div className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
                  生成中
                </div>
              ) : null
            }
            isEditingTitle={isEditingTitle}
            isSavingTextNodeTitle={isSavingTextNodeTitle}
            node={node}
            onCancelEditingTitle={onCancelEditingTitle}
            onDeleteNode={onDeleteNode}
            onSaveTitle={onSaveTitle}
            onStartEditingTitle={onStartEditingTitle}
            onTitleChange={onTitleChange}
          />

          <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-border/80 bg-background shadow-[0_18px_40px_rgba(15,23,42,0.10)] transition hover:shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90", optionTint)} />
            <div className="absolute inset-0 bg-white/72" />
            <div className="relative flex h-full flex-col p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm">
                    <Clapperboard className="size-3" />
                    分镜预览
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {storyboardPreview || "生成后会在节点上直接预览镜头卡片。"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="rounded-full bg-background/88 px-2.5 py-1 text-[11px] text-foreground shadow-sm">
                    {storyboardSettings?.generationMode === "standard" ? "标准分镜" : "智能分镜"}
                  </div>
                  <div className="rounded-full bg-background/88 px-2.5 py-1 text-[11px] text-foreground shadow-sm">
                    {storyboardShotCount > 0 ? `${storyboardShotCount} 镜头` : `${storyboardSettings?.shotCount ?? 0} 镜头目标`}
                  </div>
                  <div className="rounded-full bg-background/88 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
                    {storyboardTotalDuration > 0 ? `${storyboardTotalDuration}s` : "待生成"}
                  </div>
                </div>
              </div>

              {storyboardShots.length > 0 ? (
                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      className="inline-flex size-8 items-center justify-center rounded-full border bg-background/80 text-muted-foreground shadow-sm transition hover:text-foreground disabled:opacity-40"
                      disabled={activeStoryboardShotIndex <= 0}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectStoryboardShot?.(node.id, Math.max(0, activeStoryboardShotIndex - 1));
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <div className="min-w-0 flex-1 rounded-full border bg-background/80 px-3 py-1.5 text-center text-[11px] text-muted-foreground shadow-sm">
                      {storyboardActiveShot ? `当前预览 Shot ${storyboardActiveShot.sequence}` : "当前预览"}
                    </div>
                    <button
                      className="inline-flex size-8 items-center justify-center rounded-full border bg-background/80 text-muted-foreground shadow-sm transition hover:text-foreground disabled:opacity-40"
                      disabled={activeStoryboardShotIndex >= storyboardShots.length - 1}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectStoryboardShot?.(node.id, Math.min(storyboardShots.length - 1, activeStoryboardShotIndex + 1));
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>

                  {storyboardActiveShot ? (
                    <div className="flex flex-1 flex-col rounded-[22px] border border-border/70 bg-background/82 p-4 shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                          Shot {storyboardActiveShot.sequence}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {[
                            storyboardActiveShot.size,
                            storyboardActiveShot.camera,
                            storyboardActiveShot.duration ? `${storyboardActiveShot.duration}s` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "未标注"}
                        </span>
                      </div>
                      <p className="line-clamp-1 text-sm font-medium text-foreground">
                        {storyboardActiveShot.sceneLabel || "未命名场景"}
                      </p>
                      <p className="mt-2 line-clamp-5 text-xs leading-5 text-muted-foreground">
                        {storyboardActiveShot.description || storyboardActiveShot.videoPrompt || "暂无镜头描述"}
                      </p>
                      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                        {storyboardActiveShot.camera ? (
                          <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                            {storyboardActiveShot.camera}
                          </span>
                        ) : null}
                        {storyboardActiveShot.emotion ? (
                          <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                            {storyboardActiveShot.emotion}
                          </span>
                        ) : null}
                        {storyboardActiveShot.dialogue ? (
                          <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">对白</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-1.5 overflow-hidden">
                    {storyboardShots.map((shot, index) => (
                      <button
                        key={`${node.id}-shot-indicator-${shot.sequence}`}
                        className={cn(
                          "min-w-0 flex-1 rounded-full border px-2 py-1 text-[10px] transition",
                          index === activeStoryboardShotIndex
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background/72 text-muted-foreground hover:text-foreground",
                        )}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectStoryboardShot?.(node.id, index);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <span className="block truncate">S{shot.sequence}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-border/70 bg-background/55 p-6 text-center text-sm text-muted-foreground">
                  先生成分镜，节点本体会直接展示镜头卡片预览
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>双击节点可查看或编辑 JSON 输出</span>
                <span>{latestTask ? `task ${latestTask.status}` : "尚未运行"}</span>
              </div>
            </div>
          </div>
        </>
      ) : isImageNode ? (
        <>
          <NodeFloatingTitleBar
            canEdit={canEdit}
            deletingNodeId={deletingNodeId}
            editingTextNodeTitle={editingTextNodeTitle}
            extraStatus={
              latestTask?.status === "queued" || latestTask?.status === "processing" ? (
                <div className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
                  生成中
                </div>
              ) : null
            }
            isEditingTitle={isEditingTitle}
            isSavingTextNodeTitle={isSavingTextNodeTitle}
            node={node}
            onCancelEditingTitle={onCancelEditingTitle}
            onDeleteNode={onDeleteNode}
            onSaveTitle={onSaveTitle}
            onStartEditingTitle={onStartEditingTitle}
            onTitleChange={onTitleChange}
          />

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
                    onSyncImagePreviewSize(node.id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
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
          <NodeFloatingTitleBar
            canEdit={canEdit}
            deletingNodeId={deletingNodeId}
            editingTextNodeTitle={editingTextNodeTitle}
            extraStatus={
              latestTask?.status === "queued" || latestTask?.status === "processing" ? (
                <div className="rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground shadow-sm">
                  生成中
                </div>
              ) : null
            }
            isEditingTitle={isEditingTitle}
            isSavingTextNodeTitle={isSavingTextNodeTitle}
            node={node}
            onCancelEditingTitle={onCancelEditingTitle}
            onDeleteNode={onDeleteNode}
            onSaveTitle={onSaveTitle}
            onStartEditingTitle={onStartEditingTitle}
            onTitleChange={onTitleChange}
          />

          <div className="absolute inset-0 overflow-hidden rounded-[28px] border border-border/80 bg-background shadow-[0_18px_40px_rgba(15,23,42,0.10)] transition hover:shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
            <div className={cn("absolute inset-0 bg-gradient-to-br opacity-90", optionTint)} />
            <div className="absolute inset-0 bg-white/24" />
            {videoOutputSource ? (
              <div className="relative h-full w-full">
                <video
                  ref={(element) => {
                    onRegisterVideoElement(node.id, element);
                  }}
                  className="h-full w-full object-cover"
                  playsInline
                  preload="metadata"
                  src={videoOutputSource}
                  onEnded={() => onClearPlayingVideoNode(node.id)}
                  onPause={(event) => {
                    if (event.currentTarget.ended) {
                      return;
                    }

                    onClearPlayingVideoNode(node.id);
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
                      onStopVideoPreview(node.id);
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
                      onStartVideoPreview(node.id);
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
                  : videoSettings.generationMode === "smart_storyboard"
                    ? "智能分镜"
                  : videoSettings.generationMode === "multi_shot"
                    ? "自定义多镜头"
                    : "参考生成"}
              </div>
              <div className="rounded-full bg-background/88 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
                {videoSettings.durationSec}s · {videoSettings.size}
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
                    onDeleteNode(node.id);
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
              <div className="mt-3 flex flex-wrap items-center gap-2" onPointerDown={(event) => event.stopPropagation()}>
                {canGenerate ? (
                  <CanvasTaskActions
                    canvasId={canvasId}
                    nodeId={node.id}
                    onRuntimeChanged={onRuntimeChanged}
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
}

function areNodeCardPropsEqual(
  previousProps: InfiniteCanvasBoardNodeCardProps,
  nextProps: InfiniteCanvasBoardNodeCardProps,
) {
  const previousImagePreviewDimensions = previousProps.imagePreviewDimensions;
  const nextImagePreviewDimensions = nextProps.imagePreviewDimensions;

  return (
    previousProps.canvasId === nextProps.canvasId &&
    previousProps.workspaceId === nextProps.workspaceId &&
    previousProps.canEdit === nextProps.canEdit &&
    previousProps.canGenerate === nextProps.canGenerate &&
    previousProps.node === nextProps.node &&
    previousProps.latestTask === nextProps.latestTask &&
    previousProps.effectiveSelectedNodeId === nextProps.effectiveSelectedNodeId &&
    previousProps.isSelected === nextProps.isSelected &&
    previousProps.screenPoint.x === nextProps.screenPoint.x &&
    previousProps.screenPoint.y === nextProps.screenPoint.y &&
    previousProps.zoom === nextProps.zoom &&
    (previousImagePreviewDimensions === nextImagePreviewDimensions ||
      (previousImagePreviewDimensions?.width === nextImagePreviewDimensions?.width &&
        previousImagePreviewDimensions?.height === nextImagePreviewDimensions?.height)) &&
    previousProps.savingNodeId === nextProps.savingNodeId &&
    previousProps.deletingNodeId === nextProps.deletingNodeId &&
    previousProps.editingTextNodeTitleId === nextProps.editingTextNodeTitleId &&
    previousProps.editingTextNodeTitle === nextProps.editingTextNodeTitle &&
    previousProps.isSavingTextNodeTitle === nextProps.isSavingTextNodeTitle &&
    previousProps.playingVideoNodeId === nextProps.playingVideoNodeId &&
    previousProps.isCoolingDown === nextProps.isCoolingDown &&
    previousProps.pendingConnectionSourceId === nextProps.pendingConnectionSourceId &&
    previousProps.pendingConnectionLabel === nextProps.pendingConnectionLabel &&
    previousProps.canAcceptPendingConnection === nextProps.canAcceptPendingConnection &&
    previousProps.isPendingConnectionTarget === nextProps.isPendingConnectionTarget &&
    previousProps.activeStoryboardShotIndex === nextProps.activeStoryboardShotIndex
  );
}

export const InfiniteCanvasBoardNodeCard = memo(InfiniteCanvasBoardNodeCardComponent, areNodeCardPropsEqual);

"use client";

import { useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Boxes,
  Clapperboard,
  ImageIcon,
  MessageSquare,
  Plus,
  ScanSearch,
  Sparkles,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  type CanvasNodeReferenceAsset,
  quickCreateOptions,
  type CanvasNodeType,
  type InstructionPresetOption,
  type LibraryItemOption,
} from "@/components/canvas/infinite-canvas-board.shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ResourceModalKind = "subject" | "scene" | "instruction";

type InfiniteCanvasBoardCreatePanelProps = {
  canEdit: boolean;
  canGenerate: boolean;
  canSaveCanvas: boolean;
  isCreateOpen: boolean;
  isSavingCanvas: boolean;
  quickType: CanvasNodeType;
  canvasSaveStatusLabel: string;
  runtimeSyncStatusLabel: string;
  runtimeSyncStatusTone: string;
  workspaceId: string;
  nodeCount: number;
  edgeCount: number;
  taskCount: number;
  zoomLabel: string;
  hasSelectedNode: boolean;
  selectedNodeCount: number;
  selectedNodeTitles: string[];
  hasGroupedSelection: boolean;
  batchRunCount: number;
  isBatchRunning: boolean;
  subjects: LibraryItemOption[];
  scenes: LibraryItemOption[];
  instructionPresets: InstructionPresetOption[];
  onToggleCreateOpen: () => void;
  onSelectQuickType: (type: CanvasNodeType) => void;
  onCreateSubjectNode: (subject: LibraryItemOption, selectedAssetId: string | null) => void;
  onCreateSceneNode: (scene: LibraryItemOption, selectedAssetId: string | null) => void;
  onCreateInstructionNode: (instructionPreset: InstructionPresetOption) => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onBatchRunCountChange: (value: number) => void;
  onGroupSelectedNodes: () => void;
  onRunSelectedNodes: () => void;
  onSaveCanvas: () => void;
  onUngroupSelectedNodes: () => void;
};

type ResourceLauncherCardProps = {
  title: string;
  count: number;
  icon: LucideIcon;
  accentClassName: string;
  onClick: () => void;
};

function ResourceLauncherCard({
  title,
  count,
  icon: Icon,
  accentClassName,
  onClick,
}: ResourceLauncherCardProps) {
  return (
    <button
      className="group relative flex size-14 items-center justify-center rounded-2xl border bg-background text-left transition hover:border-primary/30 hover:bg-muted/30"
      type="button"
      title={title}
      onClick={onClick}
    >
      <div className={cn("flex size-8 items-center justify-center rounded-xl bg-gradient-to-br text-foreground", accentClassName)}>
        <Icon className="size-4" />
      </div>
      {count > 0 ? (
        <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
      <span className="sr-only">{title}</span>
    </button>
  );
}

type ResourcePickerDialogProps<TResource> = {
  open: boolean;
  title: string;
  description: string;
  emptyMessage: string;
  nodeLabel: string;
  icon: LucideIcon;
  accentClassName: string;
  items: TResource[];
  selectedId: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onSelect: (id: string) => void;
  getKey: (item: TResource) => string;
  getTitle: (item: TResource) => string;
  getSubtitle: (item: TResource) => string;
  selectedAssetId?: string | null;
  onSelectAsset?: (assetId: string) => void;
  getAssets?: (item: TResource) => CanvasNodeReferenceAsset[];
  getCoverAssetId?: (item: TResource) => string | null | undefined;
  headerAccessory?: ReactNode;
};

function ResourcePickerDialog<TResource>({
  open,
  title,
  description,
  emptyMessage,
  nodeLabel,
  icon: Icon,
  accentClassName,
  items,
  selectedId,
  onClose,
  onConfirm,
  onSelect,
  getKey,
  getTitle,
  getSubtitle,
  selectedAssetId,
  onSelectAsset,
  getAssets,
  getCoverAssetId,
  headerAccessory,
}: ResourcePickerDialogProps<TResource>) {
  const selectedItem = selectedId ? items.find((item) => getKey(item) === selectedId) ?? null : null;
  const selectedAssets = selectedItem && getAssets ? getAssets(selectedItem) : [];

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-[28px] p-0 sm:max-w-2xl" showCloseButton={false}>
        <div className={cn("border-b bg-gradient-to-br px-5 py-4", accentClassName)}>
          <div className="flex items-start justify-between gap-4">
            <DialogHeader className="gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl border border-black/5 bg-background/80 shadow-sm">
                  <Icon className="size-4" />
                </div>
                <div>
                  <DialogTitle>{title}</DialogTitle>
                  <DialogDescription className="mt-1 max-w-xl text-xs leading-5">{description}</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <button
              className="rounded-full border border-black/5 bg-background/80 p-2 text-muted-foreground transition hover:bg-background"
              type="button"
              onClick={onClose}
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-full border border-black/5 bg-background/80 px-2.5 py-1 text-foreground">
              {items.length > 0 ? `${items.length} 个资源可选` : "暂无可选资源"}
            </span>
            <span className="rounded-full border border-black/5 bg-background/80 px-2.5 py-1 text-muted-foreground">{nodeLabel}</span>
            {headerAccessory}
          </div>
        </div>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
          {items.length ? (
            items.map((item) => {
              const itemId = getKey(item);
              const isSelected = selectedId === itemId;

              return (
                <button
                  key={itemId}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left transition",
                    isSelected ? "border-primary/40 bg-primary/5 shadow-sm" : "bg-background hover:border-primary/20 hover:bg-muted/30",
                  )}
                  type="button"
                  onClick={() => onSelect(itemId)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium text-foreground">{getTitle(item)}</p>
                      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{getSubtitle(item)}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                        isSelected ? "border-primary/20 bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground",
                      )}
                    >
                      {isSelected ? "已选中" : "点击选择"}
                    </span>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed bg-muted/20 px-4 py-12 text-center text-sm text-muted-foreground">{emptyMessage}</div>
          )}

          {selectedItem && getAssets && onSelectAsset ? (
            <div className="rounded-2xl border bg-muted/15 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">默认使用图片</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedAssets.length > 0
                      ? "首张会直接作为节点预览，其他图片会一并作为参考图带入节点。"
                      : "当前资源还没有图片，加入画布后只会带入文字信息。"}
                  </p>
                </div>
                {selectedAssets.length > 0 ? (
                  <span className="rounded-full border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
                    共 {selectedAssets.length} 张
                  </span>
                ) : null}
              </div>

              {selectedAssets.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {selectedAssets.map((asset) => {
                    const isAssetSelected = selectedAssetId === asset.id;
                    const isCoverAsset = getCoverAssetId?.(selectedItem) === asset.id;

                    return (
                      <button
                        key={asset.id}
                        className={cn(
                          "overflow-hidden rounded-2xl border bg-background text-left transition",
                          isAssetSelected ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/30",
                        )}
                        type="button"
                        onClick={() => onSelectAsset(asset.id)}
                      >
                        <div className="relative aspect-square w-full bg-muted/30">
                          <Image alt={asset.fileName} className="object-cover" fill sizes="160px" src={asset.fileUrl} />
                        </div>
                        <div className="space-y-1 p-2">
                          <p className="truncate text-[11px] font-medium text-foreground">{asset.fileName}</p>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            {isCoverAsset ? <span className="rounded-full border px-1.5 py-0.5">封面</span> : null}
                            <span className="rounded-full border px-1.5 py-0.5">{isAssetSelected ? "当前预览" : "可选"}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-muted/20 px-5 py-4">
          <p className="text-xs text-muted-foreground">选择一个资源后，会直接在当前画布插入对应节点。</p>
          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border bg-background px-3 py-2 text-sm text-foreground transition hover:bg-muted"
              type="button"
              onClick={onClose}
            >
              取消
            </button>
            <button
              className="rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedId || items.length === 0}
              type="button"
              onClick={onConfirm}
            >
              添加为{nodeLabel}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getLibraryItemSubtitle(item: LibraryItemOption) {
  return [item.entityType, item.description, item.promptHints, item.tags.slice(0, 2).join(" · ")].filter(Boolean).join(" · ");
}

function getInstructionSubtitle(item: InstructionPresetOption) {
  return [item.scope, item.description, item.tags.slice(0, 2).join(" · ")].filter(Boolean).join(" · ");
}

export function InfiniteCanvasBoardCreatePanel({
  canEdit,
  canGenerate,
  canSaveCanvas,
  isCreateOpen,
  isSavingCanvas,
  quickType,
  canvasSaveStatusLabel,
  runtimeSyncStatusLabel,
  runtimeSyncStatusTone,
  workspaceId,
  nodeCount,
  edgeCount,
  taskCount,
  zoomLabel,
  hasSelectedNode,
  selectedNodeCount,
  selectedNodeTitles,
  hasGroupedSelection,
  batchRunCount,
  isBatchRunning,
  subjects,
  scenes,
  instructionPresets,
  onToggleCreateOpen,
  onSelectQuickType,
  onCreateSubjectNode,
  onCreateSceneNode,
  onCreateInstructionNode,
  onZoomOut,
  onZoomIn,
  onBatchRunCountChange,
  onGroupSelectedNodes,
  onRunSelectedNodes,
  onSaveCanvas,
  onUngroupSelectedNodes,
}: InfiniteCanvasBoardCreatePanelProps) {
  const [activeResourceModal, setActiveResourceModal] = useState<ResourceModalKind | null>(null);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);
  const [selectedResourceAssetId, setSelectedResourceAssetId] = useState<string | null>(null);
  const [subjectPickerFilter, setSubjectPickerFilter] = useState<"all" | "model" | "product">("all");
  const filteredSubjects = useMemo(() => {
    if (subjectPickerFilter === "all") {
      return subjects;
    }

    if (subjectPickerFilter === "model") {
      return subjects.filter((item) => item.entityType === "model" || item.entityType === "person");
    }

    return subjects.filter((item) => item.entityType !== "model" && item.entityType !== "person");
  }, [subjectPickerFilter, subjects]);

  function resolveDefaultAssetId(item: LibraryItemOption | undefined) {
    if (!item) {
      return null;
    }

    return item.coverAssetId ?? item.assets?.[0]?.id ?? null;
  }

  function openResourceModal(kind: ResourceModalKind) {
    const firstResource =
      kind === "subject"
        ? filteredSubjects[0] ?? subjects[0]
        : kind === "scene"
          ? scenes[0]
          : instructionPresets[0];
    const firstResourceId = firstResource?.id ?? null;

    if (kind === "subject") {
      setSubjectPickerFilter("all");
    }

    setActiveResourceModal(kind);
    setSelectedResourceId(firstResourceId);
    setSelectedResourceAssetId(kind === "instruction" ? null : resolveDefaultAssetId(firstResource as LibraryItemOption | undefined));
  }

  function closeResourceModal() {
    setActiveResourceModal(null);
    setSelectedResourceId(null);
    setSelectedResourceAssetId(null);
  }

  function confirmResourceSelection() {
    if (!selectedResourceId) {
      return;
    }

    if (activeResourceModal === "subject") {
      const selectedSubject = subjects.find((item) => item.id === selectedResourceId);

      if (selectedSubject) {
        onCreateSubjectNode(selectedSubject, selectedResourceAssetId);
        closeResourceModal();
      }

      return;
    }

    if (activeResourceModal === "scene") {
      const selectedScene = scenes.find((item) => item.id === selectedResourceId);

      if (selectedScene) {
        onCreateSceneNode(selectedScene, selectedResourceAssetId);
        closeResourceModal();
      }

      return;
    }

    if (activeResourceModal === "instruction") {
      const selectedInstruction = instructionPresets.find((item) => item.id === selectedResourceId);

      if (selectedInstruction) {
        onCreateInstructionNode(selectedInstruction);
        closeResourceModal();
      }
    }
  }

  return (
    <>
      <div className="absolute left-5 top-5 z-20 flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 shadow-sm">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-medium">Canvas Studio</span>
        </div>
        <div className="rounded-full border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          无限画布 / 节点运行 / 任务回写
        </div>
      </div>

      <div className="absolute right-5 top-5 z-20 flex items-start gap-2">
        {canEdit ? (
          <div className="rounded-[20px] border bg-background px-3 py-2 shadow-sm">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-foreground">画布 {canvasSaveStatusLabel}</div>
              <div className={cn("rounded-full px-2.5 py-1 text-[11px]", runtimeSyncStatusTone)}>{runtimeSyncStatusLabel}</div>
              <button
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  canSaveCanvas && !isSavingCanvas
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "cursor-not-allowed bg-muted text-muted-foreground",
                )}
                disabled={!canSaveCanvas || isSavingCanvas}
                type="button"
                onClick={onSaveCanvas}
              >
                {isSavingCanvas ? "保存中" : "保存画布"}
              </button>
            </div>
          </div>
        ) : null}
        {canGenerate ? (
          <div className="rounded-[20px] border bg-background px-3 py-2 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-foreground">
                已选 {selectedNodeCount} 个节点
              </div>
              <div className="flex items-center gap-2 rounded-full border px-2 py-1">
                <span className="text-[11px] text-muted-foreground">次数</span>
                <input
                  className="w-14 bg-transparent text-center text-xs text-foreground outline-none"
                  max={50}
                  min={1}
                  type="number"
                  value={batchRunCount}
                  onChange={(event) => onBatchRunCountChange(Number(event.target.value))}
                />
              </div>
              <button
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  selectedNodeCount > 0 && !isBatchRunning
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "cursor-not-allowed bg-muted text-muted-foreground",
                )}
                disabled={selectedNodeCount === 0 || isBatchRunning}
                type="button"
                onClick={onRunSelectedNodes}
              >
                {isBatchRunning ? "批量运行中" : "批量运行"}
              </button>
            </div>
            <div className="mt-2 max-w-[320px] text-[11px] leading-5 text-muted-foreground">
              {selectedNodeCount > 0
                ? `${selectedNodeTitles.slice(0, 3).join("、")}${selectedNodeTitles.length > 3 ? ` 等 ${selectedNodeTitles.length} 个节点` : ""}`
                : "单击节点直接选中，⌘ / Ctrl / Shift 点击可追加成组批量运行。"}
            </div>
          </div>
        ) : null}
        {canEdit && selectedNodeCount > 1 ? (
          <button
            className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted"
            type="button"
            onClick={onGroupSelectedNodes}
          >
            组合选中
          </button>
        ) : null}
        {canEdit && hasGroupedSelection ? (
          <button
            className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted"
            type="button"
            onClick={onUngroupSelectedNodes}
          >
            解散组合
          </button>
        ) : null}
        <Link
          className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted"
          href={`/tasks?workspaceId=${workspaceId}`}
        >
          查看任务中心
        </Link>
        <button
          className="rounded-full border bg-background px-3 py-1.5 text-xs text-foreground shadow-sm transition hover:bg-muted"
          type="button"
          onClick={onToggleCreateOpen}
        >
          {isCreateOpen ? "隐藏添加面板" : "添加节点"}
        </button>
      </div>

      <div className="absolute left-5 top-24 z-20 flex flex-col gap-2">
        <button
          className="flex size-11 items-center justify-center rounded-2xl border bg-background text-foreground shadow-sm transition hover:bg-muted"
          type="button"
          onClick={onToggleCreateOpen}
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
        <div className="absolute left-20 top-24 z-20 w-[360px] rounded-[24px] border bg-background p-4 shadow-xl">
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="flex flex-wrap gap-2">
              {quickCreateOptions.map((option) => {
                const Icon = option.icon;

                return (
                  <button
                    key={option.value}
                    className={cn(
                      "flex size-14 items-center justify-center rounded-2xl border transition",
                      quickType === option.value
                        ? "border-primary/30 bg-primary/5 text-foreground"
                        : "bg-background text-foreground hover:bg-muted",
                    )}
                    draggable
                    title={option.label}
                    type="button"
                    onDragStart={(event) => {
                      event.dataTransfer.setData("application/x-canvas-node-type", option.value);
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onSelectQuickType(option.value)}
                  >
                    <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-foreground", option.lightTint)}>
                      <Icon className="size-3.5" />
                    </div>
                    <span className="sr-only">{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              <ResourceLauncherCard
                accentClassName="from-sky-100 via-sky-50 to-white"
                count={subjects.length}
                icon={Boxes}
                title="主体入画布"
                onClick={() => openResourceModal("subject")}
              />

              <ResourceLauncherCard
                accentClassName="from-violet-100 via-fuchsia-50 to-white"
                count={scenes.length}
                icon={ImageIcon}
                title="场景入画布"
                onClick={() => openResourceModal("scene")}
              />

              <ResourceLauncherCard
                accentClassName="from-amber-100 via-orange-50 to-white"
                count={instructionPresets.length}
                icon={MessageSquare}
                title="指令入画布"
                onClick={() => openResourceModal("instruction")}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ResourcePickerDialog
        accentClassName="from-sky-100 via-sky-50 to-white"
        description="产品主体、人物主体、IP 主体都可以直接带入画布，创建为图片节点。"
        emptyMessage="当前 workspace 还没有主体资源。"
        getKey={(item) => item.id}
        getSubtitle={getLibraryItemSubtitle}
        getTitle={(item) => item.name}
        icon={Boxes}
        items={filteredSubjects}
        nodeLabel="图片节点"
        open={activeResourceModal === "subject"}
        selectedId={selectedResourceId}
        title="选择主体资源"
        headerAccessory={
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: "全部主体" },
              { key: "model", label: "模特主体" },
              { key: "product", label: "商品主体" },
            ].map((option) => (
              <button
                key={option.key}
                className={cn(
                  "rounded-full border border-black/5 bg-background/80 px-2.5 py-1 text-muted-foreground transition hover:text-foreground",
                  subjectPickerFilter === option.key ? "text-foreground shadow-sm" : undefined,
                )}
                type="button"
                onClick={() => {
                  setSubjectPickerFilter(option.key as "all" | "model" | "product");
                  const nextItems =
                    option.key === "all"
                      ? subjects
                      : option.key === "model"
                        ? subjects.filter((item) => item.entityType === "model" || item.entityType === "person")
                        : subjects.filter((item) => item.entityType !== "model" && item.entityType !== "person");
                  const nextSubject = nextItems[0] ?? null;

                  setSelectedResourceId(nextSubject?.id ?? null);
                  setSelectedResourceAssetId(resolveDefaultAssetId(nextSubject));
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
        onClose={closeResourceModal}
        onConfirm={confirmResourceSelection}
        onSelect={(resourceId) => {
          const selectedSubject = filteredSubjects.find((item) => item.id === resourceId) ?? subjects.find((item) => item.id === resourceId);

          setSelectedResourceId(resourceId);
          setSelectedResourceAssetId(resolveDefaultAssetId(selectedSubject));
        }}
        selectedAssetId={selectedResourceAssetId}
        onSelectAsset={setSelectedResourceAssetId}
        getAssets={(item) => item.assets ?? []}
        getCoverAssetId={(item) => item.coverAssetId}
      />

      <ResourcePickerDialog
        accentClassName="from-violet-100 via-fuchsia-50 to-white"
        description="把棚景、环境和布光信息直接带入画布，创建为图片节点。"
        emptyMessage="当前 workspace 还没有场景资源。"
        getKey={(item) => item.id}
        getSubtitle={getLibraryItemSubtitle}
        getTitle={(item) => item.name}
        icon={ImageIcon}
        items={scenes}
        nodeLabel="图片节点"
        open={activeResourceModal === "scene"}
        selectedId={selectedResourceId}
        title="选择场景资源"
        onClose={closeResourceModal}
        onConfirm={confirmResourceSelection}
        onSelect={(resourceId) => {
          const selectedScene = scenes.find((item) => item.id === resourceId);

          setSelectedResourceId(resourceId);
          setSelectedResourceAssetId(resolveDefaultAssetId(selectedScene));
        }}
        selectedAssetId={selectedResourceAssetId}
        onSelectAsset={setSelectedResourceAssetId}
        getAssets={(item) => item.assets ?? []}
        getCoverAssetId={(item) => item.coverAssetId}
      />

      <ResourcePickerDialog
        accentClassName="from-amber-100 via-orange-50 to-white"
        description="把预制 Prompt 直接作为文本节点的起点放入画布。"
        emptyMessage="当前 workspace 还没有指令资源。"
        getKey={(item) => item.id}
        getSubtitle={getInstructionSubtitle}
        getTitle={(item) => item.name}
        icon={Type}
        items={instructionPresets}
        nodeLabel="文本节点"
        open={activeResourceModal === "instruction"}
        selectedId={selectedResourceId}
        title="选择指令资源"
        onClose={closeResourceModal}
        onConfirm={confirmResourceSelection}
        onSelect={setSelectedResourceId}
      />

      <div className="absolute bottom-5 left-5 z-20 flex items-center gap-2 rounded-full border bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm">
        <span>节点 {nodeCount}</span>
        <span>·</span>
        <span>边 {edgeCount}</span>
        <span>·</span>
        <span>任务 {taskCount}</span>
        {canEdit && hasSelectedNode ? (
          <>
            <span>·</span>
            <span>Delete 删除已选</span>
          </>
        ) : null}
        {selectedNodeCount > 1 ? (
          <>
            <span>·</span>
            <span>{hasGroupedSelection ? "可拖组合框整体移动" : `待组合 ${selectedNodeCount}`}</span>
          </>
        ) : null}
        {hasGroupedSelection ? (
          <>
            <span>·</span>
            <span>拖节点出框可移出组合</span>
          </>
        ) : null}
        <span>·</span>
        <button
          className="rounded-md border px-1.5 py-0.5 text-[11px] transition hover:bg-muted"
          type="button"
          onClick={onZoomOut}
        >
          -
        </button>
        <span>{zoomLabel}</span>
        <button
          className="rounded-md border px-1.5 py-0.5 text-[11px] transition hover:bg-muted"
          type="button"
          onClick={onZoomIn}
        >
          +
        </button>
      </div>
    </>
  );
}

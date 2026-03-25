"use client";

import Link from "next/link";
import { Clapperboard, Plus, ScanSearch, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  quickCreateOptions,
  type CanvasNodeType,
  type InstructionPresetOption,
  type LibraryItemOption,
} from "@/components/canvas/infinite-canvas-board.shared";

type ResourceNodeType = "text" | "image" | "video";

type InfiniteCanvasBoardCreatePanelProps = {
  canEdit: boolean;
  isCreateOpen: boolean;
  quickType: CanvasNodeType;
  workspaceId: string;
  nodeCount: number;
  edgeCount: number;
  taskCount: number;
  zoomLabel: string;
  hasSelectedNode: boolean;
  subjects: LibraryItemOption[];
  scenes: LibraryItemOption[];
  instructionPresets: InstructionPresetOption[];
  onToggleCreateOpen: () => void;
  onCloseCreateOpen: () => void;
  onSelectQuickType: (type: CanvasNodeType) => void;
  onCreateSubjectNode: (subject: LibraryItemOption, nodeType: ResourceNodeType) => void;
  onCreateSceneNode: (scene: LibraryItemOption, nodeType: ResourceNodeType) => void;
  onCreateInstructionNode: (instructionPreset: InstructionPresetOption, nodeType: ResourceNodeType) => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
};

type ResourceCreateSectionProps<TResource> = {
  title: string;
  description: string;
  items: TResource[];
  emptyMessage: string;
  getKey: (item: TResource) => string;
  getTitle: (item: TResource) => string;
  getSubtitle: (item: TResource) => string;
  onCreate: (item: TResource, nodeType: ResourceNodeType) => void;
};

function ResourceCreateSection<TResource>({
  title,
  description,
  items,
  emptyMessage,
  getKey,
  getTitle,
  getSubtitle,
  onCreate,
}: ResourceCreateSectionProps<TResource>) {
  return (
    <div className="space-y-2 rounded-2xl border bg-muted/20 p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {items.length ? (
        <div className="grid gap-2">
          {items.map((item) => (
            <div key={getKey(item)} className="rounded-xl border bg-background p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">{getTitle(item)}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{getSubtitle(item)}</p>
              </div>
              <div className="mt-3 flex gap-2">
                {(["text", "image", "video"] as const).map((nodeType) => (
                  <button
                    key={nodeType}
                    className="rounded-lg border px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
                    type="button"
                    onClick={() => onCreate(item, nodeType)}
                  >
                    {nodeType === "text" ? "文本节点" : nodeType === "image" ? "图片节点" : "视频节点"}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{emptyMessage}</div>
      )}
    </div>
  );
}

export function InfiniteCanvasBoardCreatePanel({
  canEdit,
  isCreateOpen,
  quickType,
  workspaceId,
  nodeCount,
  edgeCount,
  taskCount,
  zoomLabel,
  hasSelectedNode,
  subjects,
  scenes,
  instructionPresets,
  onToggleCreateOpen,
  onCloseCreateOpen,
  onSelectQuickType,
  onCreateSubjectNode,
  onCreateSceneNode,
  onCreateInstructionNode,
  onZoomOut,
  onZoomIn,
}: InfiniteCanvasBoardCreatePanelProps) {
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
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">添加节点</p>
              <p className="text-xs text-muted-foreground">基础节点可拖入创建，资源也可以直接变成文本、图片、视频节点进入画布。</p>
            </div>
            <button
              className="rounded-full border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted"
              type="button"
              onClick={onCloseCreateOpen}
            >
              关闭
            </button>
          </div>

          <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
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
                    onClick={() => onSelectQuickType(option.value)}
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

            <ResourceCreateSection
              description="产品主体、人物主体、IP 主体都可以直接变成画布节点。"
              emptyMessage="当前 workspace 还没有主体资源。"
              getKey={(item) => item.id}
              getSubtitle={(item) =>
                [item.entityType, item.description, item.promptHints, item.tags.slice(0, 2).join(" · ")]
                  .filter(Boolean)
                  .join(" · ")
              }
              getTitle={(item) => item.name}
              items={subjects}
              title="主体入画布"
              onCreate={onCreateSubjectNode}
            />

            <ResourceCreateSection
              description="把棚景、环境和布光信息直接变成场景节点。"
              emptyMessage="当前 workspace 还没有场景资源。"
              getKey={(item) => item.id}
              getSubtitle={(item) =>
                [item.entityType, item.description, item.promptHints, item.tags.slice(0, 2).join(" · ")]
                  .filter(Boolean)
                  .join(" · ")
              }
              getTitle={(item) => item.name}
              items={scenes}
              title="场景入画布"
              onCreate={onCreateSceneNode}
            />

            <ResourceCreateSection
              description="把预制 Prompt 直接作为节点起点放到画布里。"
              emptyMessage="当前 workspace 还没有指令资源。"
              getKey={(item) => item.id}
              getSubtitle={(item) => [item.scope, item.description, item.tags.slice(0, 2).join(" · ")].filter(Boolean).join(" · ")}
              getTitle={(item) => item.name}
              items={instructionPresets}
              title="指令入画布"
              onCreate={onCreateInstructionNode}
            />
          </div>
        </div>
      ) : null}

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

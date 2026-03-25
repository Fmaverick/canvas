"use client";

import Link from "next/link";
import { Clapperboard, Plus, ScanSearch, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import { quickCreateOptions, type CanvasNodeType } from "@/components/canvas/infinite-canvas-board.shared";

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
  onToggleCreateOpen: () => void;
  onCloseCreateOpen: () => void;
  onSelectQuickType: (type: CanvasNodeType) => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
};

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
  onToggleCreateOpen,
  onCloseCreateOpen,
  onSelectQuickType,
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
        <div className="absolute left-20 top-24 z-20 w-[320px] rounded-[24px] border bg-background p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">添加节点</p>
              <p className="text-xs text-muted-foreground">不要求用户先填坐标，直接拖进画布即可落点创建。</p>
            </div>
            <button
              className="rounded-full border px-2 py-1 text-xs text-muted-foreground transition hover:bg-muted"
              type="button"
              onClick={onCloseCreateOpen}
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

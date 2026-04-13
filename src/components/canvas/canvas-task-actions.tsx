"use client";

import { useState } from "react";
import { toast } from "sonner";

import { canCanvasNodeRun } from "@/components/canvas/infinite-canvas-board.shared";
import { Button } from "@/components/ui/button";

type CanvasTaskActionsProps = {
  workspaceId: string;
  canvasId: string;
  nodeId: string;
  taskId?: string | null;
  taskStatus?: string | null;
  taskType: string;
  onRuntimeChanged?: () => Promise<void> | void;
  onRun?: () => Promise<void> | void;
  runLabel?: string;
};

function createRequestId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function CanvasTaskActions({
  workspaceId,
  canvasId,
  nodeId,
  taskId,
  taskStatus,
  taskType,
  onRuntimeChanged,
  onRun,
  runLabel,
}: CanvasTaskActionsProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const canRunNode = canCanvasNodeRun(taskType);

  async function runNode() {
    setIsRunning(true);

    try {
      if (onRun) {
        await onRun();
        return;
      }

      const response = await fetch(`/api/canvases/${canvasId}/nodes/${nodeId}/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify({
          request_id: createRequestId("canvas-node-run"),
          useUpstreamOutputs: true,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "节点运行失败。");
      }

      toast.success("节点运行已触发。");
      await onRuntimeChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "节点运行失败。");
    } finally {
      setIsRunning(false);
    }
  }

  async function retryTask() {
    if (!taskId) {
      return;
    }

    setIsRetrying(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}/retry`, {
        method: "POST",
        headers: {
          "x-workspace-id": workspaceId,
        },
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "任务重试失败。");
      }

      toast.success("任务已重新提交。");
      await onRuntimeChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务重试失败。");
    } finally {
      setIsRetrying(false);
    }
  }

  async function pollTask() {
    if (!taskId) {
      return;
    }

    setIsPolling(true);

    try {
      const response = await fetch(`/api/tasks/${taskId}/poll`, {
        method: "POST",
        headers: {
          "x-workspace-id": workspaceId,
        },
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error?.message ?? "任务轮询失败。");
      }

      toast.success("任务状态已刷新。");
      await onRuntimeChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "任务轮询失败。");
    } finally {
      setIsPolling(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={!canRunNode || isRunning} size="sm" type="button" variant="default" onClick={runNode}>
        {isRunning ? "运行中..." : (runLabel ?? "运行节点")}
      </Button>
      {taskId && taskStatus === "failed" ? (
        <Button disabled={isRetrying} size="sm" type="button" variant="outline" onClick={retryTask}>
          {isRetrying ? "重试中..." : "重试任务"}
        </Button>
      ) : null}
      {taskId && taskType === "video" && (taskStatus === "processing" || taskStatus === "queued") ? (
        <Button disabled={isPolling} size="sm" type="button" variant="outline" onClick={pollTask}>
          {isPolling ? "轮询中..." : "刷新视频状态"}
        </Button>
      ) : null}
    </div>
  );
}

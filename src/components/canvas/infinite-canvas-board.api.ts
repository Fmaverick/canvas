import type {
  CanvasBatchRunDetail,
  CanvasBatchRunSummary,
  CanvasEdge,
  CanvasNode,
  CanvasNodeResourceRefs,
  CanvasInputSourceType,
  CanvasCombinationMode,
  CanvasNodeType,
  CanvasTask,
} from "@/components/canvas/infinite-canvas-board.shared";

type CanvasBoardApiContext = {
  canvasId: string;
  workspaceId: string;
};

type UploadTicket = {
  uploadUrl: string;
  storageKey: string;
  headers?: Record<string, string>;
};

type ApiEnvelope<T> = {
  data: T;
  error?: {
    code?: string;
    message?: string;
  };
};

function createApiError(
  message: string,
  options?: {
    code?: string;
    status?: number;
  },
) {
  const error = new Error(message) as Error & {
    code?: string;
    status?: number;
  };
  error.code = options?.code;
  error.status = options?.status;

  return error;
}

async function requestApi(input: RequestInfo | URL, init: RequestInit, fallbackMessage: string) {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }

    throw createApiError(fallbackMessage);
  }
}

async function parseApiEnvelope<T>(response: Response, fallbackMessage: string) {
  const result = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok) {
    throw createApiError(result?.error?.message ?? fallbackMessage, {
      code: result?.error?.code,
      status: response.status,
    });
  }

  return result.data;
}

function getWorkspaceHeaders(workspaceId: string, includeJsonContentType = true) {
  return {
    ...(includeJsonContentType ? { "content-type": "application/json" } : {}),
    "x-workspace-id": workspaceId,
  };
}

export async function deleteCanvasNode(
  context: CanvasBoardApiContext,
  nodeId: string,
  fallbackMessage = "节点删除失败。",
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/nodes/${nodeId}`,
    {
    method: "DELETE",
    headers: getWorkspaceHeaders(context.workspaceId, false),
    },
    fallbackMessage,
  );

  await parseApiEnvelope(response, fallbackMessage);
}

export async function patchCanvasNode(
  context: CanvasBoardApiContext,
  nodeId: string,
  payload: Record<string, unknown>,
  fallbackMessage: string,
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/nodes/${nodeId}`,
    {
    method: "PATCH",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify(payload),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<Record<string, unknown>>(response, fallbackMessage);
}

export type CanvasGraphNodePatch = {
  title?: string;
  promptInput?: string | null;
  outputSnapshot?: Record<string, unknown> | null;
  modelKey?: string | null;
  settingsJson?: Record<string, unknown> | null;
  resourceRefs?: CanvasNodeResourceRefs;
  positionX?: number;
  positionY?: number;
  status?: "idle" | "queued" | "processing" | "succeeded" | "failed";
};

export type CanvasGraphCreateNodePayload = {
  type: CanvasNodeType;
  title: string;
  promptInput?: string;
  outputSnapshot?: Record<string, unknown> | null;
  modelKey?: string;
  settingsJson?: Record<string, unknown>;
  resourceRefs?: CanvasNodeResourceRefs;
  positionX?: number;
  positionY?: number;
};

export type CanvasGraphCreateEdgePayload = {
  sourceNodeId: string;
  targetNodeId: string;
  mergeMode: "previous_only" | "merge_all" | "custom";
  priority?: number;
};

export type CanvasGraphOperation =
  | {
      type: "move_nodes";
      updates: Array<{
        nodeId: string;
        positionX: number;
        positionY: number;
      }>;
    }
  | {
      type: "update_node";
      nodeId: string;
      patch: CanvasGraphNodePatch;
    }
  | {
      type: "create_node";
      clientId?: string;
      node: CanvasGraphCreateNodePayload;
    }
  | {
      type: "delete_node";
      nodeId: string;
    }
  | {
      type: "create_edge";
      edge: CanvasGraphCreateEdgePayload;
    }
  | {
      type: "delete_edge";
      edgeId: string;
    };

export type CanvasGraphMutationResult = {
  canvasVersion: number;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  deletedNodeIds: string[];
  deletedEdgeIds: string[];
  operationResults: Array<{
    type: string;
    clientId: string | null;
    nodeId: string | null;
    edgeId: string | null;
  }>;
};

export type CanvasRuntimeSnapshot = {
  canvasVersion: number;
  nodes: CanvasNode[];
  tasks: CanvasTask[];
  batchRuns: CanvasBatchRunSummary[];
};

export async function patchCanvasGraph(
  context: CanvasBoardApiContext,
  payload: {
    baseVersion: number;
    operations: CanvasGraphOperation[];
  },
  fallbackMessage: string,
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/graph`,
    {
    method: "PATCH",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify({
      baseVersion: payload.baseVersion,
      operations: payload.operations,
    }),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasGraphMutationResult>(response, fallbackMessage);
}

export async function fetchCanvasRuntime(
  context: CanvasBoardApiContext,
  fallbackMessage = "画布运行态刷新失败。",
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/runtime`,
    {
    method: "GET",
    headers: getWorkspaceHeaders(context.workspaceId, false),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasRuntimeSnapshot>(response, fallbackMessage);
}

export async function fetchCanvasBatchRunDetail(
  context: CanvasBoardApiContext,
  batchRunId: string,
  options?: {
    itemLimit?: number;
    itemOffset?: number;
    itemStatus?: "draft" | "queued" | "running" | "succeeded" | "failed" | "paused" | "canceled";
  },
  fallbackMessage = "批量运行详情加载失败。",
) {
  const searchParams = new URLSearchParams();

  if (typeof options?.itemLimit === "number") {
    searchParams.set("item_limit", String(options.itemLimit));
  }

  if (typeof options?.itemOffset === "number") {
    searchParams.set("item_offset", String(options.itemOffset));
  }

  if (options?.itemStatus) {
    searchParams.set("item_status", options.itemStatus);
  }

  const response = await requestApi(
    `/api/tasks/batch-runs/${batchRunId}${searchParams.size > 0 ? `?${searchParams.toString()}` : ""}`,
    {
    method: "GET",
    headers: getWorkspaceHeaders(context.workspaceId, false),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasBatchRunDetail>(response, fallbackMessage);
}

export async function retryCanvasBatchRunItem(
  context: CanvasBoardApiContext,
  batchRunId: string,
  itemId: string,
  fallbackMessage = "组合实例重试失败。",
) {
  const response = await requestApi(
    `/api/tasks/batch-runs/${batchRunId}/items/${itemId}/retry`,
    {
      method: "POST",
      headers: getWorkspaceHeaders(context.workspaceId),
      body: JSON.stringify({}),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<{ batchRunId: string; combinationItemId: string; status: string }>(response, fallbackMessage);
}

export async function bindCanvasBatchRunResultNode(
  context: CanvasBoardApiContext,
  batchRunId: string,
  resultNodeId: string,
  fallbackMessage = "批量产出节点绑定失败。",
) {
  const response = await requestApi(
    `/api/tasks/batch-runs/${batchRunId}`,
    {
      method: "PATCH",
      headers: getWorkspaceHeaders(context.workspaceId),
      body: JSON.stringify({
        result_node_id: resultNodeId,
      }),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<{ batch_run_id: string; result_node_id: string | null }>(response, fallbackMessage);
}

export type CanvasInputNodeItem = {
  id: string;
  stable_key: string;
  source_type: CanvasInputSourceType;
  label: string;
  content_text: string | null;
  asset_id: string | null;
  enabled: boolean;
  sort_order: number;
  source_ref: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
  asset: {
    id: string;
    asset_type: string;
    file_name: string;
    file_url: string;
    mime_type: string;
    width: number | null;
    height: number | null;
    duration_ms: number | null;
  } | null;
  created_at: string;
  updated_at: string;
};

export type CanvasInputNodeItemsResponse = {
  node_id: string;
  summary: Record<string, unknown> | null;
  items: CanvasInputNodeItem[];
};

export async function fetchCanvasInputNodeItems(
  context: CanvasBoardApiContext,
  nodeId: string,
  fallbackMessage = "输入源加载失败。",
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/nodes/${nodeId}/input-items`,
    {
      method: "GET",
      headers: getWorkspaceHeaders(context.workspaceId, false),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasInputNodeItemsResponse>(response, fallbackMessage);
}

export async function saveCanvasInputNodeItems(
  context: CanvasBoardApiContext,
  nodeId: string,
  payload: {
    items: Array<{
      sourceType: CanvasInputSourceType;
      displayLabel: string;
      contentText?: string | null;
      assetId?: string | null;
      enabled: boolean;
      sourceRefJson?: Record<string, unknown>;
    }>;
  },
  fallbackMessage = "输入源保存失败。",
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/nodes/${nodeId}/input-items`,
    {
      method: "PUT",
      headers: getWorkspaceHeaders(context.workspaceId),
      body: JSON.stringify(payload),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasInputNodeItemsResponse>(response, fallbackMessage);
}

export async function reorderCanvasInputNodeItems(
  context: CanvasBoardApiContext,
  nodeId: string,
  payload: {
    itemIds: string[];
  },
  fallbackMessage = "输入源排序失败。",
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/nodes/${nodeId}/input-items/reorder`,
    {
      method: "PATCH",
      headers: getWorkspaceHeaders(context.workspaceId),
      body: JSON.stringify(payload),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasInputNodeItemsResponse>(response, fallbackMessage);
}

export async function setCanvasInputNodeItemEnabled(
  context: CanvasBoardApiContext,
  nodeId: string,
  itemId: string,
  payload: {
    enabled: boolean;
  },
  fallbackMessage = "输入项更新失败。",
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/nodes/${nodeId}/input-items/${itemId}`,
    {
      method: "PATCH",
      headers: getWorkspaceHeaders(context.workspaceId),
      body: JSON.stringify(payload),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<{ item_id: string; enabled: boolean }>(response, fallbackMessage);
}

export type CanvasCombinationPlanPreview = {
  mode: CanvasCombinationMode;
  anchor_input_node_id: string | null;
  input_source_count: number;
  estimated_combination_count: number;
  governance_action: string | null;
  governance_signals: string[];
  sources: Array<{
    input_node_id: string;
    input_node_title: string;
    source_type: CanvasInputSourceType;
    total_items: number;
    enabled_items: number;
  }>;
  samples: Array<{
    id: string;
    label: string;
    bindings: Array<{
      inputNodeId: string;
      itemId: string;
      itemLabel: string;
      sourceType: CanvasInputSourceType;
    }>;
  }>;
  sample_labels: string[];
  max_expandable_combination_count: number;
};

export async function previewCanvasCombinationPlan(
  context: CanvasBoardApiContext,
  nodeId: string,
  payload: {
    mode: CanvasCombinationMode;
    anchorInputNodeId?: string | null;
    sampleSize?: number;
  },
  fallbackMessage = "组合预估失败。",
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/nodes/${nodeId}/combination-preview`,
    {
      method: "POST",
      headers: getWorkspaceHeaders(context.workspaceId),
      body: JSON.stringify(payload),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasCombinationPlanPreview>(response, fallbackMessage);
}

export type CanvasCombinationPlanApiDetail = {
  id: string;
  canvas_id: string;
  combination_node_id: string;
  combination_node_title: string | null;
  batch_run_id: string | null;
  mode: CanvasCombinationMode;
  status: string;
  governance_action: string | null;
  governance_signals: string[];
  input_node_ids: string[];
  estimated_combination_count: number;
  total_item_count: number;
  completed_item_count: number;
  succeeded_item_count: number;
  failed_item_count: number;
  total_shard_count: number;
  completed_shard_count: number;
  succeeded_shard_count: number;
  failed_shard_count: number;
  started_at: string | null;
  finished_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export async function createCanvasCombinationPlan(
  context: CanvasBoardApiContext,
  nodeId: string,
  payload: {
    mode: CanvasCombinationMode;
    anchorInputNodeId?: string | null;
    sampleSize?: number;
    shardSize?: number;
  },
  fallbackMessage = "创建组合计划失败。",
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/nodes/${nodeId}/combination-plans`,
    {
      method: "POST",
      headers: getWorkspaceHeaders(context.workspaceId),
      body: JSON.stringify(payload),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasCombinationPlanApiDetail>(response, fallbackMessage);
}

export async function runCanvasCombinationPlan(
  context: CanvasBoardApiContext,
  planId: string,
  payload?: {
    allowHighCost?: boolean;
  },
  fallbackMessage = "启动组合计划失败。",
) {
  const response = await requestApi(
    `/api/combination-plans/${planId}/run`,
    {
      method: "POST",
      headers: getWorkspaceHeaders(context.workspaceId),
      body: JSON.stringify(payload ?? {}),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasCombinationPlanApiDetail>(response, fallbackMessage);
}

export async function pauseCanvasCombinationPlan(
  context: CanvasBoardApiContext,
  planId: string,
  fallbackMessage = "暂停组合计划失败。",
) {
  const response = await requestApi(
    `/api/combination-plans/${planId}/pause`,
    {
      method: "POST",
      headers: getWorkspaceHeaders(context.workspaceId),
      body: JSON.stringify({}),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasCombinationPlanApiDetail>(response, fallbackMessage);
}

export async function resumeCanvasCombinationPlan(
  context: CanvasBoardApiContext,
  planId: string,
  payload?: {
    allowHighCost?: boolean;
  },
  fallbackMessage = "恢复组合计划失败。",
) {
  const response = await requestApi(
    `/api/combination-plans/${planId}/resume`,
    {
      method: "POST",
      headers: getWorkspaceHeaders(context.workspaceId),
      body: JSON.stringify(payload ?? {}),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasCombinationPlanApiDetail>(response, fallbackMessage);
}

export async function cancelCanvasCombinationPlan(
  context: CanvasBoardApiContext,
  planId: string,
  fallbackMessage = "取消组合计划失败。",
) {
  const response = await requestApi(
    `/api/combination-plans/${planId}/cancel`,
    {
      method: "POST",
      headers: getWorkspaceHeaders(context.workspaceId),
      body: JSON.stringify({}),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasCombinationPlanApiDetail>(response, fallbackMessage);
}

export function subscribeCanvasRuntime(
  context: CanvasBoardApiContext,
  handlers: {
    onSnapshot: (snapshot: CanvasRuntimeSnapshot) => void;
    onError?: (error: Error) => void;
  },
) {
  const abortController = new AbortController();
  const textDecoder = new TextDecoder();
  let closed = false;

  const processSseMessage = (message: string) => {
    const lines = message
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
    const dataLine = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");

    if (!dataLine) {
      return;
    }

    const payload = JSON.parse(dataLine) as CanvasRuntimeSnapshot | { message?: string };

    if (eventName === "snapshot") {
      handlers.onSnapshot(payload as CanvasRuntimeSnapshot);

      return;
    }

    if (eventName === "error") {
      handlers.onError?.(new Error((payload as { message?: string }).message ?? "画布运行态订阅失败。"));
    }
  };

  const connect = async () => {
    try {
      const response = await requestApi(
        `/api/canvases/${context.canvasId}/runtime/events`,
        {
        method: "GET",
        headers: getWorkspaceHeaders(context.workspaceId, false),
        cache: "no-store",
        signal: abortController.signal,
        },
        "画布运行态连接失败，正在重连。",
      );

      if (!response.ok) {
        await parseApiEnvelope(response, "画布运行态订阅失败。");

        return;
      }

      if (!response.body) {
        throw new Error("画布运行态事件流不可用。");
      }

      const reader = response.body.getReader();
      let buffer = "";

      while (!closed) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += textDecoder.decode(value, { stream: true });

        while (buffer.includes("\n\n")) {
          const separatorIndex = buffer.indexOf("\n\n");
          const rawMessage = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);

          if (rawMessage.trim()) {
            processSseMessage(rawMessage);
          }
        }
      }

      if (!closed) {
        handlers.onError?.(new Error("画布运行态连接已断开。"));
      }
    } catch (error) {
      if (!closed && !(error instanceof DOMException && error.name === "AbortError")) {
        handlers.onError?.(error instanceof Error ? error : new Error("画布运行态订阅失败。"));
      }
    }
  };

  void connect();

  return () => {
    closed = true;
    abortController.abort();
  };
}

export async function createCanvasNode(
  context: CanvasBoardApiContext,
  payload: Record<string, unknown>,
  fallbackMessage = "创建节点失败。",
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/nodes`,
    {
    method: "POST",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify(payload),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<Record<string, unknown>>(response, fallbackMessage);
}

export async function createCanvasEdge(
  context: CanvasBoardApiContext,
  payload: Record<string, unknown>,
  fallbackMessage = "创建连线失败。",
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/edges`,
    {
    method: "POST",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify(payload),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<Record<string, unknown>>(response, fallbackMessage);
}

export async function deleteCanvasEdge(
  context: CanvasBoardApiContext,
  edgeId: string,
  fallbackMessage = "删除连线失败。",
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/edges/${edgeId}`,
    {
    method: "DELETE",
    headers: getWorkspaceHeaders(context.workspaceId, false),
    },
    fallbackMessage,
  );

  await parseApiEnvelope(response, fallbackMessage);
}

export async function runCanvasNode(
  context: CanvasBoardApiContext,
  nodeId: string,
  requestId: string,
  fallbackMessage: string,
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/nodes/${nodeId}/run`,
    {
    method: "POST",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify({
      request_id: requestId,
      useUpstreamOutputs: true,
    }),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<Record<string, unknown>>(response, fallbackMessage);
}

export async function runCanvasNodeBatch(
  context: CanvasBoardApiContext,
  payload: {
    nodeIds: string[];
    runCount: number;
  },
  fallbackMessage: string,
) {
  const response = await requestApi(
    `/api/canvases/${context.canvasId}/batch-runs`,
    {
    method: "POST",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify({
      node_ids: payload.nodeIds,
      run_count: payload.runCount,
    }),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<Record<string, unknown>>(response, fallbackMessage);
}

export async function createUploadPresign(
  workspaceId: string,
  payload: Record<string, unknown>,
  fallbackMessage = "上传凭证获取失败。",
) {
  const response = await requestApi(
    "/api/uploads/presign",
    {
    method: "POST",
    headers: getWorkspaceHeaders(workspaceId),
    body: JSON.stringify(payload),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<UploadTicket>(response, fallbackMessage);
}

export async function completeUpload(
  workspaceId: string,
  payload: Record<string, unknown>,
  fallbackMessage = "上传文件登记失败。",
) {
  const response = await requestApi(
    "/api/uploads/complete",
    {
    method: "POST",
    headers: getWorkspaceHeaders(workspaceId),
    body: JSON.stringify(payload),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<{ id: string }>(response, fallbackMessage);
}

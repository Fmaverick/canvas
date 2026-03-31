import type {
  CanvasBatchRunDetail,
  CanvasBatchRunSummary,
  CanvasEdge,
  CanvasNode,
  CanvasNodeResourceRefs,
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
  fallbackMessage = "批量运行详情加载失败。",
) {
  const response = await requestApi(
    `/api/tasks/batch-runs/${batchRunId}`,
    {
    method: "GET",
    headers: getWorkspaceHeaders(context.workspaceId, false),
    },
    fallbackMessage,
  );

  return parseApiEnvelope<CanvasBatchRunDetail>(response, fallbackMessage);
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

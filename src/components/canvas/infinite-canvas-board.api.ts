import type {
  CanvasBatchRunDetail,
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

async function parseApiEnvelope<T>(response: Response, fallbackMessage: string) {
  const result = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok) {
    const error = new Error(result?.error?.message ?? fallbackMessage) as Error & {
      code?: string;
      status?: number;
    };
    error.code = result?.error?.code;
    error.status = response.status;

    throw error;
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
  const response = await fetch(`/api/canvases/${context.canvasId}/nodes/${nodeId}`, {
    method: "DELETE",
    headers: getWorkspaceHeaders(context.workspaceId, false),
  });

  await parseApiEnvelope(response, fallbackMessage);
}

export async function patchCanvasNode(
  context: CanvasBoardApiContext,
  nodeId: string,
  payload: Record<string, unknown>,
  fallbackMessage: string,
) {
  const response = await fetch(`/api/canvases/${context.canvasId}/nodes/${nodeId}`, {
    method: "PATCH",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify(payload),
  });

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
  batchRuns: CanvasBatchRunDetail[];
};

export async function patchCanvasGraph(
  context: CanvasBoardApiContext,
  payload: {
    baseVersion: number;
    operations: CanvasGraphOperation[];
  },
  fallbackMessage: string,
) {
  const response = await fetch(`/api/canvases/${context.canvasId}/graph`, {
    method: "PATCH",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify({
      baseVersion: payload.baseVersion,
      operations: payload.operations,
    }),
  });

  return parseApiEnvelope<CanvasGraphMutationResult>(response, fallbackMessage);
}

export async function fetchCanvasRuntime(
  context: CanvasBoardApiContext,
  fallbackMessage = "画布运行态刷新失败。",
) {
  const response = await fetch(`/api/canvases/${context.canvasId}/runtime`, {
    method: "GET",
    headers: getWorkspaceHeaders(context.workspaceId, false),
  });

  return parseApiEnvelope<CanvasRuntimeSnapshot>(response, fallbackMessage);
}

export async function createCanvasNode(
  context: CanvasBoardApiContext,
  payload: Record<string, unknown>,
  fallbackMessage = "创建节点失败。",
) {
  const response = await fetch(`/api/canvases/${context.canvasId}/nodes`, {
    method: "POST",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify(payload),
  });

  return parseApiEnvelope<Record<string, unknown>>(response, fallbackMessage);
}

export async function createCanvasEdge(
  context: CanvasBoardApiContext,
  payload: Record<string, unknown>,
  fallbackMessage = "创建连线失败。",
) {
  const response = await fetch(`/api/canvases/${context.canvasId}/edges`, {
    method: "POST",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify(payload),
  });

  return parseApiEnvelope<Record<string, unknown>>(response, fallbackMessage);
}

export async function deleteCanvasEdge(
  context: CanvasBoardApiContext,
  edgeId: string,
  fallbackMessage = "删除连线失败。",
) {
  const response = await fetch(`/api/canvases/${context.canvasId}/edges/${edgeId}`, {
    method: "DELETE",
    headers: getWorkspaceHeaders(context.workspaceId, false),
  });

  await parseApiEnvelope(response, fallbackMessage);
}

export async function runCanvasNode(
  context: CanvasBoardApiContext,
  nodeId: string,
  requestId: string,
  fallbackMessage: string,
) {
  const response = await fetch(`/api/canvases/${context.canvasId}/nodes/${nodeId}/run`, {
    method: "POST",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify({
      request_id: requestId,
      useUpstreamOutputs: true,
    }),
  });

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
  const response = await fetch(`/api/canvases/${context.canvasId}/batch-runs`, {
    method: "POST",
    headers: getWorkspaceHeaders(context.workspaceId),
    body: JSON.stringify({
      node_ids: payload.nodeIds,
      run_count: payload.runCount,
    }),
  });

  return parseApiEnvelope<Record<string, unknown>>(response, fallbackMessage);
}

export async function createUploadPresign(
  workspaceId: string,
  payload: Record<string, unknown>,
  fallbackMessage = "上传凭证获取失败。",
) {
  const response = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: getWorkspaceHeaders(workspaceId),
    body: JSON.stringify(payload),
  });

  return parseApiEnvelope<UploadTicket>(response, fallbackMessage);
}

export async function completeUpload(
  workspaceId: string,
  payload: Record<string, unknown>,
  fallbackMessage = "上传文件登记失败。",
) {
  const response = await fetch("/api/uploads/complete", {
    method: "POST",
    headers: getWorkspaceHeaders(workspaceId),
    body: JSON.stringify(payload),
  });

  return parseApiEnvelope<{ id: string }>(response, fallbackMessage);
}

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
    message?: string;
  };
};

async function parseApiEnvelope<T>(response: Response, fallbackMessage: string) {
  const result = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok) {
    throw new Error(result?.error?.message ?? fallbackMessage);
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

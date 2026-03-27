import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { getCanvasDetail, getCanvasDetailInputSchema } from "@/application/services/canvas-service";
import {
  listNodeRunBatches,
  listNodeRunBatchesInputSchema,
  listTasks,
  listTasksInputSchema,
} from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
  }>;
};

export async function getCanvasRuntimeSnapshot(workspaceId: string, canvasId: string) {
  const [canvas, tasks, batchRuns] = await Promise.all([
    getCanvasDetail(
      getCanvasDetailInputSchema.parse({
        workspaceId,
        canvasId,
      }),
    ),
    listTasks(
      listTasksInputSchema.parse({
        workspaceId,
        canvasId,
        limit: 50,
      }),
    ),
    listNodeRunBatches(
      listNodeRunBatchesInputSchema.parse({
        workspaceId,
        canvasId,
        limit: 12,
      }),
    ),
  ]);

  return {
    canvasVersion: canvas.version,
    nodes: canvas.nodes,
    tasks,
    batchRuns,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { canvasId } = await context.params;
    const snapshot = await getCanvasRuntimeSnapshot(workspaceId, canvasId);

    return jsonSuccess(
      snapshot,
      requestId,
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

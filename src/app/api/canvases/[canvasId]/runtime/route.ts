import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { getCanvasDetail, getCanvasDetailInputSchema } from "@/application/services/canvas-service";
import {
  getNodeRunBatch,
  getNodeRunBatchInputSchema,
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

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { canvasId } = await context.params;
    const [canvas, tasks, batchRunSummaries] = await Promise.all([
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
    const batchRuns = await Promise.all(
      batchRunSummaries.map((batchRun) =>
        getNodeRunBatch(
          getNodeRunBatchInputSchema.parse({
            workspaceId,
            batchRunId: batchRun.id,
          }),
        ),
      ),
    );

    return jsonSuccess(
      {
        canvasVersion: canvas.version,
        nodes: canvas.nodes,
        tasks,
        batchRuns,
      },
      requestId,
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

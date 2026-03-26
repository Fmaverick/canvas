import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { runNodeBatch, runNodeBatchInputSchema } from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, null, "generate");
    const { canvasId } = await context.params;
    const body = await request.json();
    const batchRun = await runNodeBatch(
      runNodeBatchInputSchema.parse({
        ...body,
        actorUserId: currentUser.user.id,
        workspaceId,
        canvasId,
        nodeIds: body.nodeIds ?? body.node_ids,
        runCount: body.runCount ?? body.run_count,
      }),
    );

    return jsonSuccess(
      {
        batch_run_id: batchRun.id,
        status: batchRun.status,
        run_count: batchRun.runCount,
        node_count: batchRun.nodeCount,
        total_node_run_count: batchRun.totalNodeRunCount,
        items: batchRun.items,
      },
      requestId,
      201,
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { bindNodeRunBatchResultNode, getNodeRunBatch } from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";
import { z } from "zod";

type RouteContext = {
  params: Promise<{
    batchRunId: string;
  }>;
};

const querySchema = z.object({
  itemLimit: z.coerce.number().int().positive().max(100).optional(),
  itemOffset: z.coerce.number().int().min(0).optional(),
  itemStatus: z.enum(["draft", "queued", "running", "succeeded", "failed", "paused", "canceled"]).optional(),
});

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { batchRunId } = await context.params;
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      itemLimit: searchParams.get("item_limit") ?? undefined,
      itemOffset: searchParams.get("item_offset") ?? undefined,
      itemStatus: searchParams.get("item_status") ?? undefined,
    });
    const batchRun = await getNodeRunBatch({
      workspaceId,
      batchRunId,
      ...query,
    });

    return jsonSuccess(batchRun, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { batchRunId } = await context.params;
    const body = await request.json();
    const batchRun = await bindNodeRunBatchResultNode({
      workspaceId,
      batchRunId,
      resultNodeId: body.resultNodeId ?? body.result_node_id,
    });

    return jsonSuccess(
      {
        batch_run_id: batchRun.id,
        result_node_id: batchRun.resultNodeId,
      },
      requestId,
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

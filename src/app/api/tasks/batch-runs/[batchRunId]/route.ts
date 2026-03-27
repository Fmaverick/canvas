import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { getNodeRunBatch } from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    batchRunId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { batchRunId } = await context.params;
    const batchRun = await getNodeRunBatch({
      workspaceId,
      batchRunId,
    });

    return jsonSuccess(batchRun, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

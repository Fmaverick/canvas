import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { retryBatchRunCombinationItem, retryBatchRunCombinationItemInputSchema } from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    batchRunId: string;
    itemId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "generate");
    const { batchRunId, itemId } = await context.params;
    const result = await retryBatchRunCombinationItem(
      retryBatchRunCombinationItemInputSchema.parse({
        workspaceId,
        batchRunId,
        combinationItemId: itemId,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

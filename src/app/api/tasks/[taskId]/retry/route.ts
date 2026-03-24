import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { retryTask, retryTaskInputSchema } from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "generate");
    const { taskId } = await context.params;
    const result = await retryTask(
      retryTaskInputSchema.parse({
        workspaceId,
        taskId,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

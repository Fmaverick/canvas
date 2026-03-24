import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { getTaskInputSchema, getTaskStatus } from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { taskId } = await context.params;
    const taskStatus = await getTaskStatus(
      getTaskInputSchema.parse({
        workspaceId,
        taskId,
      }),
    );

    return jsonSuccess(taskStatus, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

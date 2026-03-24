import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { runNode, runNodeInputSchema } from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
    nodeId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "generate");
    const { canvasId, nodeId } = await context.params;
    const body = await request.json();
    const payload = runNodeInputSchema.parse({
      ...body,
      workspaceId,
      canvasId,
      nodeId,
      requestId: body.requestId ?? body.request_id ?? requestId,
    });
    const task = await runNode(payload);

    return jsonSuccess(
      {
        task_id: task.taskId,
        status: task.status,
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

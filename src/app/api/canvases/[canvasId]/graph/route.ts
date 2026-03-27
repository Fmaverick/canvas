import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { patchCanvasGraph, patchCanvasGraphInputSchema } from "@/application/services/canvas-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { canvasId } = await context.params;
    const result = await patchCanvasGraph(
      patchCanvasGraphInputSchema.parse({
        ...body,
        workspaceId,
        canvasId,
        actorId: currentUser?.user.id,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

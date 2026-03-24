import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { deleteEdge, deleteEdgeInputSchema } from "@/application/services/canvas-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
    edgeId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { canvasId, edgeId } = await context.params;
    const edge = await deleteEdge(
      deleteEdgeInputSchema.parse({
        workspaceId,
        canvasId,
        edgeId,
      }),
    );

    return jsonSuccess(edge, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

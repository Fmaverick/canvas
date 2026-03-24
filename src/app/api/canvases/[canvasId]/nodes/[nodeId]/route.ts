import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  deleteNode,
  deleteNodeInputSchema,
  updateNode,
  updateNodeInputSchema,
} from "@/application/services/canvas-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
    nodeId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { canvasId, nodeId } = await context.params;
    const payload = updateNodeInputSchema.parse({
      ...(await request.json()),
      workspaceId,
      canvasId,
      nodeId,
    });
    const node = await updateNode(payload);

    return jsonSuccess(node, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { canvasId, nodeId } = await context.params;
    const node = await deleteNode(
      deleteNodeInputSchema.parse({
        workspaceId,
        canvasId,
        nodeId,
      }),
    );

    return jsonSuccess(node, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

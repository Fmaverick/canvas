import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { createNode, createNodeInputSchema } from "@/application/services/canvas-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, body?.workspaceId, "edit");
    const { canvasId } = await context.params;
    const payload = createNodeInputSchema.parse({
      ...body,
      workspaceId,
      canvasId,
      createdBy: body?.createdBy ?? currentUser?.user.id,
    });
    const node = await createNode(payload);

    return jsonSuccess(node, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { createEdge, createEdgeInputSchema } from "@/application/services/canvas-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { canvasId } = await context.params;
    const payload = createEdgeInputSchema.parse({
      ...(await request.json()),
      workspaceId,
      canvasId,
    });
    const edge = await createEdge(payload);

    return jsonSuccess(edge, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

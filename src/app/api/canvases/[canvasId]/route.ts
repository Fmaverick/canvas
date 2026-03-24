import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { getCanvasDetail, getCanvasDetailInputSchema } from "@/application/services/canvas-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    canvasId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { canvasId } = await context.params;
    const canvas = await getCanvasDetail(
      getCanvasDetailInputSchema.parse({
        workspaceId,
        canvasId,
      }),
    );

    return jsonSuccess(canvas, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

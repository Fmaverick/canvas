import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  estimateCombinationPlan,
  estimateCombinationPlanInputSchema,
} from "@/application/services/combination-service";
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
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { canvasId, nodeId } = await context.params;
    const body = await request.json();
    const result = await estimateCombinationPlan(
      estimateCombinationPlanInputSchema.parse({
        workspaceId,
        canvasId,
        nodeId,
        mode: body.mode,
        anchorInputNodeId: body.anchorInputNodeId ?? body.anchor_input_node_id,
        sampleSize: body.sampleSize ?? body.sample_size,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

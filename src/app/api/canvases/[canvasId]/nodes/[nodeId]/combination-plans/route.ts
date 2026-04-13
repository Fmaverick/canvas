import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  createCombinationPlan,
  createCombinationPlanInputSchema,
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
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, null, "generate");
    const { canvasId, nodeId } = await context.params;
    const body = await request.json();
    const result = await createCombinationPlan(
      createCombinationPlanInputSchema.parse({
        workspaceId,
        canvasId,
        nodeId,
        actorUserId: currentUser.user.id,
        mode: body.mode,
        anchorInputNodeId: body.anchorInputNodeId ?? body.anchor_input_node_id,
        sampleSize: body.sampleSize ?? body.sample_size,
        shardSize: body.shardSize ?? body.shard_size,
      }),
    );

    return jsonSuccess(result, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

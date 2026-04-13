import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  changeCombinationPlanStatusInputSchema,
  pauseCombinationPlan,
} from "@/application/services/combination-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    planId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, null, "generate");
    const { planId } = await context.params;
    const result = await pauseCombinationPlan(
      changeCombinationPlanStatusInputSchema.parse({
        workspaceId,
        planId,
        actorUserId: currentUser.user.id,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

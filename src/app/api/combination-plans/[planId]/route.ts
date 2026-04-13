import { z } from "zod";

import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { getCombinationPlan, getCombinationPlanInputSchema } from "@/application/services/combination-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

const querySchema = z.object({
  itemLimit: z.coerce.number().int().positive().max(100).optional(),
  itemOffset: z.coerce.number().int().min(0).optional(),
  shardLimit: z.coerce.number().int().positive().max(100).optional(),
  shardOffset: z.coerce.number().int().min(0).optional(),
});

type RouteContext = {
  params: Promise<{
    planId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { planId } = await context.params;
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      itemLimit: searchParams.get("item_limit") ?? undefined,
      itemOffset: searchParams.get("item_offset") ?? undefined,
      shardLimit: searchParams.get("shard_limit") ?? undefined,
      shardOffset: searchParams.get("shard_offset") ?? undefined,
    });
    const result = await getCombinationPlan(
      getCombinationPlanInputSchema.parse({
        workspaceId,
        planId,
        ...query,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

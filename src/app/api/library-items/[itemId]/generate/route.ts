import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { runLibraryItemImageGeneration, runLibraryItemImageGenerationInputSchema } from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, body?.workspaceId, "generate");
    const { itemId } = await context.params;
    const result = await runLibraryItemImageGeneration(
      runLibraryItemImageGenerationInputSchema.parse({
        ...body,
        workspaceId,
        actorUserId: currentUser.user.id,
        itemId,
        requestId: body?.requestId ?? body?.request_id ?? requestId,
      }),
    );

    return jsonSuccess(result, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

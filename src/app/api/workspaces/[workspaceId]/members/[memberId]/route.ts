import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import {
  removeWorkspaceMember,
  removeWorkspaceMemberInputSchema,
  updateWorkspaceMemberRole,
  updateWorkspaceMemberRoleInputSchema,
} from "@/application/services/workspace-member-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    memberId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const currentUser = await getCurrentUserFromRequest(request);
    const { workspaceId, memberId } = await context.params;
    const payload = updateWorkspaceMemberRoleInputSchema.parse({
      ...(await request.json()),
      workspaceId,
      memberId,
      actorUserId: currentUser.user.id,
    });
    const member = await updateWorkspaceMemberRole(payload);

    return jsonSuccess(member, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const currentUser = await getCurrentUserFromRequest(request);
    const { workspaceId, memberId } = await context.params;
    const member = await removeWorkspaceMember(
      removeWorkspaceMemberInputSchema.parse({
        workspaceId,
        memberId,
        actorUserId: currentUser.user.id,
      }),
    );

    return jsonSuccess(member, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

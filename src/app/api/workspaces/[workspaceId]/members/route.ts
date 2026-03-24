import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import {
  inviteWorkspaceMember,
  inviteWorkspaceMemberInputSchema,
  listWorkspaceMembers,
  listWorkspaceMembersInputSchema,
} from "@/application/services/workspace-member-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const currentUser = await getCurrentUserFromRequest(request);
    const { workspaceId } = await context.params;
    const members = await listWorkspaceMembers(
      listWorkspaceMembersInputSchema.parse({
        workspaceId,
        actorUserId: currentUser.user.id,
      }),
    );

    return jsonSuccess(members, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const currentUser = await getCurrentUserFromRequest(request);
    const { workspaceId } = await context.params;
    const payload = inviteWorkspaceMemberInputSchema.parse({
      ...(await request.json()),
      workspaceId,
      actorUserId: currentUser.user.id,
    });
    const member = await inviteWorkspaceMember(payload);

    return jsonSuccess(member, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

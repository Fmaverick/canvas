import { z } from "zod";

import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import {
  createWorkspace,
  createWorkspaceInputSchema,
  listWorkspaces,
  listWorkspacesInputSchema,
} from "@/application/services/workspace-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

const workspaceQuerySchema = z.object({
  userId: z.uuid().optional(),
});

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { searchParams } = new URL(request.url);
    const userIdFromQuery = searchParams.get("user_id") ?? undefined;
    const currentUser = !userIdFromQuery ? await getCurrentUserFromRequest(request).catch(() => null) : null;
    const query = workspaceQuerySchema.parse({
      userId: userIdFromQuery ?? currentUser?.user.id,
    });
    const items = await listWorkspaces(listWorkspacesInputSchema.parse(query));

    return jsonSuccess(items, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const currentUser = !body?.ownerId ? await getCurrentUserFromRequest(request).catch(() => null) : null;
    const payload = createWorkspaceInputSchema.parse({
      ...body,
      ownerId: body?.ownerId ?? currentUser?.user.id,
    });
    const workspace = await createWorkspace(payload);

    return jsonSuccess(workspace, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  createInstructionPreset,
  createInstructionPresetInputSchema,
  listInstructionPresets,
} from "@/application/services/instruction-preset-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const items = await listInstructionPresets({
      workspaceId,
      userId: currentUser.user.id,
    });

    return jsonSuccess(items, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, body?.workspaceId, "edit");
    const payload = createInstructionPresetInputSchema.parse({
      ...body,
      workspaceId,
      createdBy: body?.createdBy ?? currentUser?.user.id,
    });
    const item = await createInstructionPreset(payload);

    return jsonSuccess(item, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

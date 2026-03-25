import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  deleteInstructionPreset,
  deleteInstructionPresetInputSchema,
  updateInstructionPreset,
  updateInstructionPresetInputSchema,
} from "@/application/services/instruction-preset-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    presetId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, body?.workspaceId, "edit");
    const { presetId } = await context.params;
    const preset = await updateInstructionPreset(
      updateInstructionPresetInputSchema.parse({
        ...body,
        workspaceId,
        actorUserId: currentUser.user.id,
        presetId,
      }),
    );

    return jsonSuccess(preset, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId, currentUser } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { presetId } = await context.params;
    const preset = await deleteInstructionPreset(
      deleteInstructionPresetInputSchema.parse({
        workspaceId,
        actorUserId: currentUser.user.id,
        presetId,
      }),
    );

    return jsonSuccess(preset, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

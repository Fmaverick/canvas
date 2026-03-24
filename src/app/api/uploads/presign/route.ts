import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  createUploadTicket,
  createUploadTicketInputSchema,
} from "@/application/services/asset-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const { workspaceId } = await resolveWorkspaceContextFromRequest(
      request,
      body?.workspaceId,
      "edit",
    );
    const payload = createUploadTicketInputSchema.parse({
      ...body,
      workspaceId,
    });
    const uploadTicket = await createUploadTicket(payload);

    return jsonSuccess(uploadTicket, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

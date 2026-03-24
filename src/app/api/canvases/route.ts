import {
  createCanvas,
  createCanvasInputSchema,
  listCanvases,
} from "@/application/services/canvas-service";
import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const items = await listCanvases({ workspaceId });

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
    const payload = createCanvasInputSchema.parse({
      ...body,
      workspaceId,
      createdBy: body?.createdBy ?? currentUser?.user.id,
    });
    const canvas = await createCanvas(payload);

    return jsonSuccess(canvas, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

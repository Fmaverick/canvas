import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  deleteLibraryItem,
  deleteLibraryItemInputSchema,
  getLibraryItemById,
  updateLibraryItem,
  updateLibraryItemInputSchema,
} from "@/application/services/library-item-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, body?.workspaceId, "edit");
    const { itemId } = await context.params;
    const item = await updateLibraryItem(
      updateLibraryItemInputSchema.parse({
        ...body,
        workspaceId,
        itemId,
      }),
    );

    return jsonSuccess(item, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { itemId } = await context.params;
    const item = await getLibraryItemById(workspaceId, itemId);

    return jsonSuccess(item, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "edit");
    const { itemId } = await context.params;
    const item = await deleteLibraryItem(
      deleteLibraryItemInputSchema.parse({
        workspaceId,
        itemId,
      }),
    );

    return jsonSuccess(item, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

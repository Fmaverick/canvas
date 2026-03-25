import { z } from "zod";

import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  createLibraryItem,
  createLibraryItemInputSchema,
  libraryItemKindSchema,
  listLibraryItems,
} from "@/application/services/library-item-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

const libraryItemQuerySchema = z.object({
  kind: libraryItemKindSchema,
  keyword: z.string().trim().optional(),
  tag: z.string().trim().optional(),
});

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { searchParams } = new URL(request.url);
    const query = libraryItemQuerySchema.parse({
      kind: searchParams.get("kind") ?? undefined,
      keyword: searchParams.get("keyword") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
    });
    const items = await listLibraryItems({
      workspaceId,
      ...query,
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
    const payload = createLibraryItemInputSchema.parse({
      ...body,
      workspaceId,
      createdBy: body?.createdBy ?? currentUser?.user.id,
    });
    const item = await createLibraryItem(payload);

    return jsonSuccess(item, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

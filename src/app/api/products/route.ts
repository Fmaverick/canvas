import { z } from "zod";

import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import {
  createProduct,
  createProductInputSchema,
  listProducts,
} from "@/application/services/product-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

const productQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  tag: z.string().trim().optional(),
});

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { searchParams } = new URL(request.url);
    const query = productQuerySchema.parse({
      keyword: searchParams.get("keyword") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
    });
    const items = await listProducts({
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
    const payload = createProductInputSchema.parse({
      ...body,
      workspaceId,
      createdBy: body?.createdBy ?? currentUser?.user.id,
    });
    const product = await createProduct(payload);

    return jsonSuccess(product, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

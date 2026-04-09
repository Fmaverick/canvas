import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { createGeneratedAsset, createGeneratedAssetInputSchema } from "@/application/services/asset-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json();
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, body?.workspaceId, "edit");
    const asset = await createGeneratedAsset(
      createGeneratedAssetInputSchema.parse({
        ...body,
        workspaceId,
      }),
    );

    return jsonSuccess(asset, requestId, 201);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

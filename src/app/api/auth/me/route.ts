import { getCurrentUserFromRequest } from "@/application/services/auth-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const result = await getCurrentUserFromRequest(request);

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

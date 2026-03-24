import { logoutUser } from "@/application/services/auth-service";
import { clearSessionCookie } from "@/lib/auth";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const result = await logoutUser(request);
    const response = jsonSuccess(result, requestId);

    return clearSessionCookie(response);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

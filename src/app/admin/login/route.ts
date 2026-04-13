import { z } from "zod";

import { ApiError, getRequestId, jsonError } from "@/lib/api";
import {
  createAdminSessionCookie,
  createAdminSessionToken,
  isAdminPasswordEnabled,
  verifyAdminPassword,
} from "@/lib/gateway-admin";

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const passwordEnabled = isAdminPasswordEnabled();

    if (!passwordEnabled) {
      throw new ApiError(503, "ADMIN_PASSWORD_NOT_CONFIGURED", "ADMIN_PASSWORD or ADMIN_PASSWORD_HASH is not configured.");
    }

    const payload = loginSchema.parse(await request.json());

    if (!verifyAdminPassword(payload.password)) {
      throw new ApiError(401, "UNAUTHORIZED", "Invalid admin password.");
    }

    const token = createAdminSessionToken();
    const response = Response.json({
      ok: true,
      passwordEnabled: true,
      request_id: requestId,
    });
    response.headers.set("Set-Cookie", createAdminSessionCookie(token));
    return response;
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

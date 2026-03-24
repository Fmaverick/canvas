import { registerUser, registerInputSchema } from "@/application/services/auth-service";
import { attachSessionCookie } from "@/lib/auth";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const payload = registerInputSchema.parse(await request.json());
    const result = await registerUser(payload);
    const response = jsonSuccess(
      {
        user: result.user,
        workspaces: result.workspaces,
      },
      requestId,
      201,
    );

    return attachSessionCookie(response, result.session.token, result.session.expiresAt);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

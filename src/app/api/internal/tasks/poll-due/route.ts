import { pollDueTasksInputSchema, pollDueVideoTasks } from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess, requireInternalAccess } from "@/lib/api";

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    requireInternalAccess(request);
    const body = await request.json().catch(() => ({}));
    const result = await pollDueVideoTasks(
      pollDueTasksInputSchema.parse({
        limit: body?.limit,
      }),
    );

    return jsonSuccess(result, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

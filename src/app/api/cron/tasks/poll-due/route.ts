import { pollDueTasksInputSchema, pollDueVideoTasks } from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess, requireCronAccess } from "@/lib/api";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    requireCronAccess(request);
    const { searchParams } = new URL(request.url);
    const result = await pollDueVideoTasks(
      pollDueTasksInputSchema.parse({
        limit: 50,
      }),
    );

    return jsonSuccess(
      {
        trigger: "vercel-cron",
        ...result,
      },
      requestId,
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

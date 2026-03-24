import { z } from "zod";

import { resolveWorkspaceContextFromRequest } from "@/application/services/auth-service";
import { listTasks, listTasksInputSchema } from "@/application/services/task-service";
import { getRequestId, jsonError, jsonSuccess } from "@/lib/api";

const taskQuerySchema = z.object({
  status: z.enum(["queued", "processing", "succeeded", "failed", "canceled"]).optional(),
  taskType: z.enum(["text", "image", "video", "audio"]).optional(),
  canvasId: z.uuid().optional(),
  nodeId: z.uuid().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const { workspaceId } = await resolveWorkspaceContextFromRequest(request, null, "view");
    const { searchParams } = new URL(request.url);
    const query = taskQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      taskType: searchParams.get("task_type") ?? undefined,
      canvasId: searchParams.get("canvas_id") ?? undefined,
      nodeId: searchParams.get("node_id") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });
    const tasks = await listTasks(
      listTasksInputSchema.parse({
        workspaceId,
        ...query,
      }),
    );

    return jsonSuccess(tasks, requestId);
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

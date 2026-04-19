import { ApiError, getRequestId, jsonError } from "@/lib/api";
import { getVideoStatusWithSeedance20 } from "@/infrastructure/ai/seedance20-client";
import { assertGatewayClientKey } from "@/lib/gateway-client-keys";
import { getGatewayTask, updateGatewayTask } from "@/lib/gateway-task-store";

type RouteContext = {
  params: Promise<{
    taskId: string;
  }>;
};

function requireGatewayApiKey(request: Request) {
  const clientKey = request.headers.get("x-gateway-api-key");

  if (!assertGatewayClientKey(clientKey)) {
    throw new ApiError(401, "UNAUTHORIZED", "缺少或无效的 gateway api key");
  }
}

function normalizePolledStatus(status: "pending" | "processing" | "completed" | "failed") {
  if (status === "completed") {
    return "succeeded";
  }

  if (status === "failed") {
    return "failed";
  }

  return status === "processing" ? "processing" : "queued";
}

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request);

  try {
    requireGatewayApiKey(request);
    const { taskId } = await context.params;
    const task = getGatewayTask(taskId);

    if (!task) {
      throw new ApiError(404, "TASK_NOT_FOUND", `Task ${taskId} not found.`);
    }

    const canPollProvider =
      task.provider === "volcengine" && task.providerTaskId && task.status !== "succeeded" && task.status !== "failed";

    if (canPollProvider) {
      const statusResult = await getVideoStatusWithSeedance20(task.providerTaskId);
      updateGatewayTask(task.id, {
        status: normalizePolledStatus(statusResult.status),
        output: statusResult.output,
        providerTask: statusResult.metadata ?? {},
      });
    }

    const latest = getGatewayTask(taskId)!;

    return Response.json({
      task: {
        id: latest.id,
        status: latest.status,
        modality: latest.modality,
        model: latest.model,
        provider: latest.provider,
        output: latest.output,
        providerTask: latest.providerTask,
        providerTaskId: latest.providerTaskId,
        error: latest.error,
      },
      request_id: requestId,
    });
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

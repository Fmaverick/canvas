import { z } from "zod";

import { ApiError, getRequestId, jsonError } from "@/lib/api";
import { generateImageWithVolcengine } from "@/infrastructure/ai/volcengine-image-client";
import { generateVideoWithSeedance20 } from "@/infrastructure/ai/seedance20-client";
import { assertGatewayClientKey } from "@/lib/gateway-client-keys";
import { createGatewayVideoTask } from "@/lib/gateway-task-store";
import { assertModelEnabled } from "@/lib/gateway-provider-registry";

const gatewayPayloadSchema = z.object({
  modality: z.enum(["llm", "image", "video"]),
  model: z.string().min(1),
  operation: z.string().optional(),
  prompt: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .optional(),
  assets: z
    .array(
      z.object({
        kind: z.literal("image"),
        url: z.string().optional(),
        filePath: z.string().optional(),
        role: z.enum(["reference", "first_frame", "last_frame"]).optional(),
        label: z.string().optional(),
      }),
    )
    .optional(),
  content: z
    .array(
      z.union([
        z.object({
          type: z.literal("text"),
          text: z.string().min(1),
        }),
        z.object({
          type: z.literal("image_url"),
          image_url: z.object({
            url: z.string().min(1),
          }),
          role: z.string().optional(),
        }),
        z.object({
          type: z.literal("video_url"),
          video_url: z.object({
            url: z.string().min(1),
          }),
          role: z.string().optional(),
        }),
        z.object({
          type: z.literal("audio_url"),
          audio_url: z.object({
            url: z.string().min(1),
          }),
          role: z.string().optional(),
        }),
      ]),
    )
    .optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});

function requireGatewayApiKey(request: Request) {
  const clientKey = request.headers.get("x-gateway-api-key");

  if (!assertGatewayClientKey(clientKey)) {
    throw new ApiError(401, "UNAUTHORIZED", "缺少或无效的 gateway api key");
  }
}

function handleLlmRequest(payload: z.infer<typeof gatewayPayloadSchema>) {
  if (!payload.messages || payload.messages.length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "messages is required for llm modality.");
  }

  const lastUserMessage =
    [...payload.messages].reverse().find((message) => message.role === "user")?.content ?? payload.messages.at(-1)?.content ?? "";

  return {
    requestId: crypto.randomUUID(),
    modality: "llm",
    model: payload.model,
    provider: "mock",
    output: {
      text: `echo:${lastUserMessage}`,
      message: {
        role: "assistant",
        content: `echo:${lastUserMessage}`,
      },
    },
    metadata: {},
  };
}

function normalizeGatewayVideoTaskStatus(status: "pending" | "processing" | "completed" | "failed") {
  if (status === "completed") {
    return "processing";
  }

  if (status === "failed") {
    return "failed";
  }

  return status === "processing" ? "processing" : "queued";
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    requireGatewayApiKey(request);
    const payload = gatewayPayloadSchema.parse(await request.json());

    if (payload.modality === "llm") {
      return Response.json(handleLlmRequest(payload));
    }

    if (payload.modality === "image") {
      if (!payload.prompt || payload.prompt.trim().length === 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "prompt is required for image modality.");
      }

      const provider = "volcengine";
      assertModelEnabled({
        modelId: payload.model,
        provider,
        modality: "image",
      });

      const output = await generateImageWithVolcengine({
        prompt: payload.prompt,
        model: payload.model,
        settings: {
          ...(payload.settings ?? {}),
          ...(payload.operation ? { operation: payload.operation } : {}),
        },
        assets: payload.assets,
      });

      return Response.json({
        requestId,
        modality: "image",
        model: output.model,
        provider: output.provider,
        output: output.output,
        metadata: {
          size: output.size,
          responseFormat: output.responseFormat,
          trace: output.trace ?? {},
        },
      });
    }

    const hasTextContent =
      Array.isArray(payload.content) && payload.content.some((item) => item.type === "text" && item.text.trim().length > 0);

    if ((!payload.prompt || payload.prompt.trim().length === 0) && !hasTextContent) {
      throw new ApiError(400, "VALIDATION_ERROR", "prompt or content(text) is required for video modality.");
    }

    const provider = "volcengine";
    assertModelEnabled({
      modelId: payload.model,
      provider,
      modality: "video",
    });

    const submitResult = await generateVideoWithSeedance20({
      prompt: payload.prompt,
      model: payload.model,
      settings: payload.settings,
      assets: payload.assets,
      content: payload.content,
    });
    const task = createGatewayVideoTask({
      model: submitResult.model,
      provider: submitResult.provider,
      providerTaskId: submitResult.providerTaskId,
      status: normalizeGatewayVideoTaskStatus(submitResult.status),
      providerTask: {},
    });

    return Response.json(
      {
        requestId,
        modality: "video",
        model: payload.model,
        provider: submitResult.provider,
        task: {
          id: task.id,
          status: task.status,
          modality: task.modality,
          model: task.model,
        },
      },
      { status: 202 },
    );
  } catch (error) {
    return jsonError(error, requestId);
  }
}

export const runtime = "nodejs";

export const preferredRegion = "auto";

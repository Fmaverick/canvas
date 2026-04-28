import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { requestArtsApiJson } from "@/infrastructure/ai/arts-api-client";

type GatewayVideoAsset = {
  kind: "image";
  url?: string;
  filePath?: string;
  role?: "reference" | "first_frame" | "last_frame";
  label?: string;
};

type GatewayVideoSubmitInput = {
  prompt: string;
  model: string;
  settings?: Record<string, unknown>;
  assets?: GatewayVideoAsset[];
};

type GatewayVideoSubmitOutput = {
  provider: string;
  model: string;
  providerTaskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  rawResponse: unknown;
};

type GatewayVideoStatusOutput = {
  provider: string;
  providerTaskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  progress?: number;
  output?: Array<{
    kind: "url";
    url: string;
    mimeType?: string;
    width?: number;
    height?: number;
    durationMs?: number;
  }>;
  rawResponse: unknown;
};

function toNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getGatewayConfig() {
  const baseUrl = toNonEmptyString(env.artsApiBaseUrl ?? env.gatewayBaseUrl);
  const clientKey = toNonEmptyString(env.artsApiKey ?? env.gatewayClientKey);

  if (!baseUrl || !clientKey) {
    throw new ApiError(
      503,
      "PROVIDER_UNAVAILABLE",
      "External gateway is not configured. Set ARTS_API_BASE_URL and ARTS_API_KEY.",
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    clientKey,
  };
}

async function requestGateway(path: string, init: RequestInit) {
  const { baseUrl, clientKey } = getGatewayConfig();
  return requestArtsApiJson({
    ...init,
    baseUrl,
    apiKey: clientKey,
    path,
    mapProviderError: (status, payload) => {
      const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
      const errorRecord =
        record?.error && typeof record.error === "object" ? (record.error as Record<string, unknown>) : null;

      return new ApiError(
        status,
        toNonEmptyString(errorRecord?.code) ?? "PROVIDER_UNAVAILABLE",
        toNonEmptyString(errorRecord?.message) ?? `Gateway request failed with status ${status}.`,
      );
    },
    mapTransportError: (error) =>
      new ApiError(503, "PROVIDER_UNAVAILABLE", error instanceof Error ? error.message : "Gateway request failed."),
  });
}

function normalizeGatewayStatus(value: unknown): "pending" | "processing" | "completed" | "failed" {
  const status = toNonEmptyString(value)?.toLowerCase();

  if (!status || status === "queued") {
    return "pending";
  }

  if (status === "processing" || status === "running" || status === "dispatched") {
    return "processing";
  }

  if (status === "succeeded" || status === "completed" || status === "done") {
    return "completed";
  }

  if (status === "failed" || status === "error" || status === "canceled") {
    return "failed";
  }

  return "pending";
}

function normalizeOutput(rawOutput: unknown) {
  const items = Array.isArray(rawOutput) ? rawOutput : [];

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      const url =
        toNonEmptyString(record.url) ??
        toNonEmptyString(record.videoUrl) ??
        toNonEmptyString(record.video_url) ??
        toNonEmptyString(record.fileUrl);

      if (!url) {
        return null;
      }

      return {
        kind: "url" as const,
        url,
        ...(toNonEmptyString(record.mimeType) ? { mimeType: toNonEmptyString(record.mimeType) } : {}),
        ...(toFiniteNumber(record.width) !== undefined ? { width: toFiniteNumber(record.width) } : {}),
        ...(toFiniteNumber(record.height) !== undefined ? { height: toFiniteNumber(record.height) } : {}),
        ...(toFiniteNumber(record.durationMs) !== undefined
          ? { durationMs: toFiniteNumber(record.durationMs) }
          : toFiniteNumber(record.duration_ms) !== undefined
            ? { durationMs: toFiniteNumber(record.duration_ms) }
            : {}),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export async function submitVideoThroughGateway(input: GatewayVideoSubmitInput): Promise<GatewayVideoSubmitOutput> {
  const explicitOperation = toNonEmptyString(input.settings?.operation);
  const inferredOperation = !explicitOperation && (input.assets ?? []).some((asset) => asset.kind === "image" && Boolean(asset.url || asset.filePath))
    ? "image-to-video"
    : undefined;

  const payload = await requestGateway("/v1/gateway", {
    method: "POST",
    body: JSON.stringify({
      modality: "video",
      model: input.model,
      prompt: input.prompt,
      operation: explicitOperation ?? inferredOperation,
      assets: input.assets ?? [],
      settings: input.settings ?? {},
    }),
  });

  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const task = record.task && typeof record.task === "object" ? (record.task as Record<string, unknown>) : {};
  const provider = toNonEmptyString(record.provider) ?? toNonEmptyString(task.provider) ?? "gateway";
  const providerTaskId = toNonEmptyString(task.id);

  if (!providerTaskId) {
    throw new ApiError(502, "TASK_EXECUTION_FAILED", "Gateway response missing task.id.");
  }

  return {
    provider,
    model: toNonEmptyString(task.model) ?? toNonEmptyString(record.model) ?? input.model,
    providerTaskId,
    status: normalizeGatewayStatus(task.status),
    rawResponse: payload,
  };
}

export async function getVideoStatusThroughGateway(providerTaskId: string): Promise<GatewayVideoStatusOutput> {
  const payload = await requestGateway(`/v1/tasks/${providerTaskId}`, {
    method: "GET",
  });

  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const task = record.task && typeof record.task === "object" ? (record.task as Record<string, unknown>) : {};
  const normalizedOutput = normalizeOutput(task.output);
  const firstOutput = normalizedOutput[0];

  return {
    provider: toNonEmptyString(task.provider) ?? "gateway",
    providerTaskId: toNonEmptyString(task.id) ?? providerTaskId,
    status: normalizeGatewayStatus(task.status),
    videoUrl: firstOutput?.url,
    progress: toFiniteNumber(task.progress),
    output: normalizedOutput,
    rawResponse: payload,
  };
}

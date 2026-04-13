import { ApiError } from "@/lib/api";
import { assertProviderAvailable } from "@/lib/gateway-provider-registry";

type StandardVideoAsset = {
  kind: "image";
  url?: string;
  filePath?: string;
  role?: "reference" | "first_frame" | "last_frame";
  label?: string;
};

type GenerateVideoInput = {
  prompt: string;
  model?: string;
  settings?: Record<string, unknown>;
  assets?: StandardVideoAsset[];
};

type GenerateVideoOutput = {
  provider: "seedance2.0";
  model: string;
  providerTaskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  trace?: {
    jobId?: string;
    traceId?: string;
    keyId?: string;
  };
  rawResponse: unknown;
};

type VideoOutputItem = {
  kind: "url";
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

type VideoStatusOutput = {
  provider: "seedance2.0";
  providerTaskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  output: VideoOutputItem[];
  videoUrl?: string;
  progress?: number;
  trace?: {
    jobId?: string;
    traceId?: string;
    keyId?: string;
  };
  rawResponse: unknown;
};

type CancelVideoOutput = {
  provider: "seedance2.0";
  providerTaskId: string;
  status: "canceled" | "processing";
  rawResponse: unknown;
};

type NormalizedReferenceAsset = {
  url: string;
  label?: string;
  role: "reference" | "first_frame" | "last_frame";
};

const SEEDANCE_PROVIDER = "seedance2.0";
const SUPPORTED_MODELS = new Set(["seedance-2.0"]);
const MAX_REFERENCE_IMAGES = 10;
const MOCK_PROVIDER_BASE_URL_PREFIX = "mock://seedance";
const MOCK_SEEDANCE_GLOBAL_KEY = "__seedance20_mock_provider__";

type MockSeedanceTask = {
  id: string;
  pollCount: number;
};

function toString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function isValidReferenceUrl(value: string) {
  return /^https?:\/\//i.test(value) || /^data:image\//i.test(value);
}

function mapSeedanceStatus(value: unknown): "pending" | "processing" | "completed" | "failed" {
  const status = toString(value)?.toLowerCase() ?? "pending";

  if (status === "succeeded" || status === "completed" || status === "done") {
    return "completed";
  }

  if (status === "failed" || status === "error") {
    return "failed";
  }

  if (status === "processing" || status === "running" || status === "in_progress") {
    return "processing";
  }

  return "pending";
}

function pickTraceMeta(raw: unknown) {
  const record = toRecord(raw);
  const dataRecord = toRecord(record?.data);
  const traceId = toString(record?.traceId) ?? toString(record?.trace_id) ?? toString(dataRecord?.traceId);
  const jobId = toString(record?.jobId) ?? toString(record?.job_id) ?? toString(dataRecord?.jobId);
  const keyId = toString(record?.keyId) ?? toString(record?.key_id) ?? toString(dataRecord?.keyId);

  return {
    ...(jobId ? { jobId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(keyId ? { keyId } : {}),
  };
}

function normalizeVideoOutputItems(raw: unknown): VideoOutputItem[] {
  const responseRecord = toRecord(raw);
  const dataRecord = toRecord(responseRecord?.data);
  const rawOutputList = Array.isArray(dataRecord?.output)
    ? dataRecord.output
    : Array.isArray(responseRecord?.output)
      ? responseRecord.output
      : [];
  const normalized: VideoOutputItem[] = [];
  const seen = new Set<string>();

  for (const item of rawOutputList) {
    const outputRecord = toRecord(item);

    if (!outputRecord) {
      continue;
    }

    const rawKind = toString(outputRecord.kind)?.toLowerCase();
    const candidateUrl =
      toString(outputRecord.url) ??
      toString(outputRecord.videoUrl) ??
      toString(outputRecord.video_url) ??
      toString(outputRecord.fileUrl) ??
      toString(outputRecord.file_url);

    if (!candidateUrl) {
      continue;
    }

    if (rawKind && rawKind !== "video" && rawKind !== "url") {
      continue;
    }

    if (seen.has(candidateUrl)) {
      continue;
    }

    seen.add(candidateUrl);
    normalized.push({
      kind: "url",
      url: candidateUrl,
      ...(toString(outputRecord.mimeType) ?? toString(outputRecord.mime_type)
        ? { mimeType: toString(outputRecord.mimeType) ?? toString(outputRecord.mime_type) }
        : {}),
      ...(toNumber(outputRecord.width) !== undefined ? { width: toNumber(outputRecord.width) } : {}),
      ...(toNumber(outputRecord.height) !== undefined ? { height: toNumber(outputRecord.height) } : {}),
      ...(toNumber(outputRecord.durationMs) ?? toNumber(outputRecord.duration_ms)
        ? { durationMs: toNumber(outputRecord.durationMs) ?? toNumber(outputRecord.duration_ms) }
        : {}),
    });
  }

  return normalized;
}

function mapProviderError(status: number, body: unknown, fallbackMessage: string): ApiError {
  const payload = toRecord(body);
  const providerError = toRecord(payload?.error);
  const providerCode =
    toString(providerError?.code) ??
    toString(payload?.code) ??
    toString(providerError?.type) ??
    toString(payload?.type) ??
    "";
  const message =
    toString(providerError?.message) ??
    toString(payload?.message) ??
    fallbackMessage;
  const normalizedCode = providerCode.toUpperCase();

  if (normalizedCode.includes("MODEL") || normalizedCode.includes("UNSUPPORTED_MODEL")) {
    return new ApiError(409, "MODEL_NOT_ENABLED", message);
  }

  if (status === 400 || status === 422 || normalizedCode.includes("INVALID") || normalizedCode.includes("VALIDATION")) {
    return new ApiError(400, "VALIDATION_ERROR", message);
  }

  if (status === 401 || status === 403 || status === 429 || status >= 500) {
    return new ApiError(503, "PROVIDER_UNAVAILABLE", message);
  }

  return new ApiError(502, "TASK_EXECUTION_FAILED", message);
}

function normalizeReferenceAssets(input: GenerateVideoInput) {
  const settings = input.settings ?? {};
  const seen = new Set<string>();
  const normalized: NormalizedReferenceAsset[] = [];

  const pushAsset = (asset: {
    url?: string;
    label?: string;
    role?: "reference" | "first_frame" | "last_frame";
  }) => {
    const rawUrl = toString(asset.url);

    if (!rawUrl) {
      return;
    }

    if (!isValidReferenceUrl(rawUrl)) {
      throw new ApiError(400, "VALIDATION_ERROR", `Invalid reference image url: ${rawUrl}`);
    }

    const key = `${asset.role ?? "reference"}::${rawUrl}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push({
      url: rawUrl,
      role: asset.role ?? "reference",
      ...(asset.label ? { label: asset.label } : {}),
    });
  };

  for (const asset of input.assets ?? []) {
    if (asset.kind !== "image") {
      continue;
    }

    pushAsset({
      url: toString(asset.url) ?? toString(asset.filePath),
      label: toString(asset.label),
      role: asset.role ?? "reference",
    });
  }

  const firstFrameImageUrl = toString(settings.firstFrameImageUrl) ?? toString(settings.imageUrl);
  const lastFrameImageUrl = toString(settings.lastFrameImageUrl);

  if (firstFrameImageUrl) {
    pushAsset({
      url: firstFrameImageUrl,
      role: "first_frame",
    });
  }

  if (lastFrameImageUrl) {
    pushAsset({
      url: lastFrameImageUrl,
      role: "last_frame",
    });
  }

  if (Array.isArray(settings.referenceImages)) {
    for (const imageUrl of settings.referenceImages) {
      pushAsset({
        url: toString(imageUrl),
        role: "reference",
      });
    }
  }

  if (Array.isArray(settings.referenceImageEntries)) {
    for (const entry of settings.referenceImageEntries) {
      const record = toRecord(entry);
      pushAsset({
        url: toString(record?.url) ?? toString(record?.imageUrl) ?? toString(record?.image_url),
        label: toString(record?.label),
        role: "reference",
      });
    }
  }

  if (normalized.length > MAX_REFERENCE_IMAGES) {
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `Reference image count exceeds ${MAX_REFERENCE_IMAGES}.`,
    );
  }

  return normalized;
}

function resolveOperation(settings: Record<string, unknown>, referenceAssets: NormalizedReferenceAsset[]) {
  const explicitOperation = toString(settings.operation)?.toLowerCase();
  const hasReferenceImage = referenceAssets.some((asset) => asset.role === "reference");

  if (explicitOperation === "image-to-video" || explicitOperation === "image_to_video") {
    if (!hasReferenceImage) {
      throw new ApiError(400, "VALIDATION_ERROR", "operation=image-to-video requires at least one reference image.");
    }

    return "image-to-video";
  }

  return hasReferenceImage ? "image-to-video" : "generate";
}

function buildRequestBody(input: GenerateVideoInput, model: string) {
  const settings = input.settings ?? {};
  const referenceAssets = normalizeReferenceAssets(input);
  const operation = resolveOperation(settings, referenceAssets);
  const durationSec = toNumber(settings.durationSec) ?? toNumber(settings.duration);
  const resolution = toString(settings.resolution) ?? toString(settings.size);

  return {
    operation,
    body: {
      model,
      prompt: input.prompt,
      ...(typeof durationSec === "number" ? { durationSec } : {}),
      ...(resolution ? { resolution } : {}),
      assets: referenceAssets.map((asset) => ({
        kind: "image",
        url: asset.url,
        role: asset.role,
        ...(asset.label ? { label: asset.label } : {}),
      })),
      settings: {
        ...(settings ?? {}),
        referenceImageCount: referenceAssets.length,
      },
    },
  };
}

export const __seedance20TestUtils = {
  normalizeReferenceAssets,
  resolveOperation,
  buildRequestBody,
  normalizeVideoOutputItems,
  pickTraceMeta,
};

function getMockSeedanceTaskState() {
  const globalRef = globalThis as typeof globalThis & {
    [MOCK_SEEDANCE_GLOBAL_KEY]?: Map<string, MockSeedanceTask>;
  };

  if (!globalRef[MOCK_SEEDANCE_GLOBAL_KEY]) {
    globalRef[MOCK_SEEDANCE_GLOBAL_KEY] = new Map<string, MockSeedanceTask>();
  }

  return globalRef[MOCK_SEEDANCE_GLOBAL_KEY]!;
}

function isMockSeedanceBaseUrl(baseUrl: string) {
  return baseUrl.toLowerCase().startsWith(MOCK_PROVIDER_BASE_URL_PREFIX);
}

function requestMockSeedance(path: string, method: string) {
  const tasks = getMockSeedanceTaskState();

  if (path === "/video/generations" && method === "POST") {
    const id = `mock-provider-task-${crypto.randomUUID()}`;
    tasks.set(id, {
      id,
      pollCount: 0,
    });

    return {
      id,
      status: "pending",
      data: {
        id,
        traceId: `trace-${id}`,
        keyId: "seedance2-key-1",
      },
    };
  }

  if (path.startsWith("/video/generations/") && method === "GET") {
    const providerTaskId = path.replace("/video/generations/", "");
    const task = tasks.get(providerTaskId);

    if (!task) {
      return {
        id: providerTaskId,
        status: "failed",
      };
    }

    task.pollCount += 1;
    tasks.set(providerTaskId, task);

    if (task.pollCount < 2) {
      return {
        id: providerTaskId,
        status: "processing",
        data: {
          progress: 60,
          traceId: `trace-${providerTaskId}`,
          keyId: "seedance2-key-1",
        },
      };
    }

    return {
      id: providerTaskId,
      status: "completed",
      data: {
        progress: 100,
        traceId: `trace-${providerTaskId}`,
        keyId: "seedance2-key-1",
        output: [
          {
            kind: "video",
            url: `https://mock.seedance.local/${providerTaskId}.mp4`,
            mime_type: "video/mp4",
            width: 1280,
            height: 720,
            duration_ms: 5000,
          },
        ],
      },
    };
  }

  if (path.endsWith("/cancel") && method === "POST") {
    return {
      status: "canceled",
    };
  }

  return {
    status: "failed",
  };
}

async function requestSeedance(
  path: string,
  init: RequestInit & {
    key: string;
    baseUrl: string;
  },
) {
  if (isMockSeedanceBaseUrl(init.baseUrl)) {
    return requestMockSeedance(path, (init.method ?? "GET").toUpperCase());
  }

  let response: Response;

  try {
    response = await fetch(`${init.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${init.key}`,
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    throw new ApiError(
      503,
      "PROVIDER_UNAVAILABLE",
      error instanceof Error ? error.message : "Seedance provider request failed.",
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw mapProviderError(response.status, payload, `Seedance request failed with status ${response.status}.`);
  }

  return payload;
}

function resolveSeedanceModel(inputModel?: string) {
  const model = toString(inputModel) ?? "seedance-2.0";

  if (!SUPPORTED_MODELS.has(model)) {
    throw new ApiError(409, "MODEL_NOT_ENABLED", `Model ${model} is not enabled for seedance2.0.`);
  }

  return model;
}

export async function generateVideoWithSeedance20(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  const provider = assertProviderAvailable(SEEDANCE_PROVIDER);
  const key = provider.keys[0]?.value;
  const baseUrl = provider.baseUrl;

  if (!key || !baseUrl) {
    throw new ApiError(503, "PROVIDER_UNAVAILABLE", "Missing seedance2.0 provider key.");
  }

  const model = resolveSeedanceModel(input.model);
  const requestBody = buildRequestBody(input, model);
  const rawResponse = await requestSeedance("/video/generations", {
    method: "POST",
    key,
    baseUrl,
    body: JSON.stringify(requestBody.body),
  });
  const responseRecord = toRecord(rawResponse);
  const data = toRecord(responseRecord?.data);
  const providerTaskId = toString(responseRecord?.id) ?? toString(data?.id) ?? toString(data?.taskId) ?? toString(data?.task_id);
  const trace = pickTraceMeta(rawResponse);

  if (!providerTaskId) {
    throw new ApiError(502, "TASK_EXECUTION_FAILED", "Seedance response missing task id.");
  }

  return {
    provider: "seedance2.0",
    model,
    providerTaskId,
    status: mapSeedanceStatus(responseRecord?.status ?? data?.status),
    ...(Object.keys(trace).length > 0 ? { trace } : {}),
    rawResponse: {
      ...(responseRecord ?? {}),
      trace,
    },
  };
}

export async function getVideoStatusWithSeedance20(providerTaskId: string): Promise<VideoStatusOutput> {
  const provider = assertProviderAvailable(SEEDANCE_PROVIDER);
  const key = provider.keys[0]?.value;
  const baseUrl = provider.baseUrl;

  if (!key || !baseUrl) {
    throw new ApiError(503, "PROVIDER_UNAVAILABLE", "Missing seedance2.0 provider key.");
  }

  const rawResponse = await requestSeedance(`/video/generations/${providerTaskId}`, {
    method: "GET",
    key,
    baseUrl,
  });
  const responseRecord = toRecord(rawResponse);
  const data = toRecord(responseRecord?.data);
  const output = normalizeVideoOutputItems(rawResponse);
  const trace = pickTraceMeta(rawResponse);

  return {
    provider: "seedance2.0",
    providerTaskId,
    status: mapSeedanceStatus(responseRecord?.status ?? data?.status),
    output,
    videoUrl:
      output[0]?.url ??
      toString(data?.videoUrl) ??
      toString(data?.video_url) ??
      toString(responseRecord?.videoUrl) ??
      toString(responseRecord?.video_url),
    progress: toNumber(data?.progress) ?? toNumber(responseRecord?.progress),
    ...(Object.keys(trace).length > 0 ? { trace } : {}),
    rawResponse: {
      ...(responseRecord ?? {}),
      trace,
    },
  };
}

export async function cancelVideoWithSeedance20(providerTaskId: string): Promise<CancelVideoOutput> {
  const provider = assertProviderAvailable(SEEDANCE_PROVIDER);
  const key = provider.keys[0]?.value;
  const baseUrl = provider.baseUrl;

  if (!key || !baseUrl) {
    throw new ApiError(503, "PROVIDER_UNAVAILABLE", "Missing seedance2.0 provider key.");
  }

  const rawResponse = await requestSeedance(`/video/generations/${providerTaskId}/cancel`, {
    method: "POST",
    key,
    baseUrl,
  });
  const responseRecord = toRecord(rawResponse);
  const data = toRecord(responseRecord?.data);
  const status = toString(responseRecord?.status) ?? toString(data?.status);

  return {
    provider: "seedance2.0",
    providerTaskId,
    status: status === "canceled" ? "canceled" : "processing",
    rawResponse: {
      ...(responseRecord ?? {}),
      trace: pickTraceMeta(rawResponse),
    },
  };
}

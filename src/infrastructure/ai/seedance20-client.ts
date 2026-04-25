import { ApiError } from "@/lib/api";
import { getProviderRuntimeConfig } from "@/lib/gateway-provider-registry";

type StandardVideoAsset = {
  kind: "image";
  url?: string;
  filePath?: string;
  role?: "reference" | "first_frame" | "last_frame";
  label?: string;
};

type VolcengineContentItem =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image_url";
      image_url: {
        url: string;
      };
      role?: string;
    }
  | {
      type: "video_url";
      video_url: {
        url: string;
      };
      role?: string;
    }
  | {
      type: "audio_url";
      audio_url: {
        url: string;
      };
      role?: string;
    };

type GenerateVideoInput = {
  prompt?: string;
  model?: string;
  settings?: Record<string, unknown>;
  assets?: StandardVideoAsset[];
  content?: VolcengineContentItem[];
};

type VideoOutputItem = {
  kind: "url";
  url: string;
};

type GenerateVideoOutput = {
  provider: "volcengine";
  model: string;
  providerTaskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  rawResponse: unknown;
};

type VideoStatusOutput = {
  provider: "volcengine";
  providerTaskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  output: VideoOutputItem[];
  videoUrl?: string;
  progress?: number;
  metadata: Record<string, unknown>;
  rawResponse: unknown;
};

type CancelVideoOutput = {
  provider: "volcengine";
  providerTaskId: string;
  status: "canceled" | "processing";
  rawResponse: unknown;
};

const VOLCENGINE_PROVIDER = "volcengine";
const SUPPORTED_MODEL_KEYS = new Set(["seedance-2.0"]);
const MOCK_PROVIDER_BASE_URL_PREFIX = "mock://volcengine";
const MOCK_VOLCENGINE_GLOBAL_KEY = "__volcengine_seedance20_mock_provider__";
const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL_ID = "doubao-seedance-2-0-260128";

type MockVolcengineTask = {
  id: string;
  pollCount: number;
};

function toString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true" || normalized === "1") {
      return true;
    }

    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return undefined;
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function isValidReferenceUri(value: string) {
  return /^https?:\/\//i.test(value) || /^data:/i.test(value) || /^asset:\/\/.+/i.test(value);
}

function mapVolcengineTaskStatus(value: unknown): "pending" | "processing" | "completed" | "failed" {
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
    toString(payload?.error_msg) ??
    fallbackMessage;
  const normalizedCode = providerCode.toUpperCase();

  if (normalizedCode.includes("MODEL") || normalizedCode.includes("UNSUPPORTED_MODEL")) {
    return new ApiError(409, "MODEL_NOT_ENABLED", message);
  }

  if (
    status === 400 ||
    status === 422 ||
    normalizedCode.includes("INVALID") ||
    normalizedCode.includes("VALIDATION") ||
    normalizedCode.includes("BAD_REQUEST") ||
    normalizedCode.includes("PARAM")
  ) {
    return new ApiError(400, "VALIDATION_ERROR", message);
  }

  if (status === 401 || status === 403 || status === 429 || status >= 500) {
    return new ApiError(503, "PROVIDER_UNAVAILABLE", message);
  }

  return new ApiError(502, "TASK_EXECUTION_FAILED", message);
}

function resolveVolcengineVideoModelId(inputModel?: string) {
  const modelKey = toString(inputModel) ?? "seedance-2.0";

  if (!SUPPORTED_MODEL_KEYS.has(modelKey)) {
    throw new ApiError(409, "MODEL_NOT_ENABLED", `Model ${modelKey} is not enabled for volcengine.`);
  }

  return toString(process.env.VOLCENGINE_ARK_VIDEO_MODEL) ?? DEFAULT_MODEL_ID;
}

function resolveVolcengineArkRuntimeConfig() {
  const runtimeConfig = getProviderRuntimeConfig(VOLCENGINE_PROVIDER);
  const keyFromRuntime = runtimeConfig?.keys[0]?.value;
  const baseUrlFromRuntime = toString(runtimeConfig?.baseUrl);

  const keyFromEnv =
    toString(process.env.VOLCENGINE_ARK_VIDEO_API_KEY) ??
    toString(process.env.VOLCENGINE_ARK_API_KEY);
  const baseUrlFromEnv = toString(process.env.VOLCENGINE_ARK_BASE_URL) ?? DEFAULT_BASE_URL;

  const key = keyFromEnv ?? keyFromRuntime;
  const baseUrl = baseUrlFromRuntime ?? baseUrlFromEnv;

  return { key, baseUrl };
}

function normalizeContent(input: GenerateVideoInput): VolcengineContentItem[] {
  const settings = input.settings ?? {};
  const seen = new Set<string>();
  const normalized: VolcengineContentItem[] = [];

  const pushItem = (item: VolcengineContentItem) => {
    const key = JSON.stringify(item);

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    normalized.push(item);
  };

  if (Array.isArray(input.content)) {
    for (const item of input.content) {
      const record = toRecord(item);
      const type = toString(record?.type);

      if (type === "text") {
        const text = toString(record?.text);
        if (!text) {
          throw new ApiError(400, "VALIDATION_ERROR", "content.text is required for type=text.");
        }
        pushItem({ type: "text", text });
        continue;
      }

      if (type === "image_url") {
        const imageUrl = toRecord(record?.image_url);
        const url = toString(imageUrl?.url);
        if (!url || !isValidReferenceUri(url)) {
          throw new ApiError(400, "VALIDATION_ERROR", "content.image_url.url must be a valid url or asset uri.");
        }
        pushItem({ type: "image_url", image_url: { url }, role: toString(record?.role) ?? "reference_image" });
        continue;
      }

      if (type === "video_url") {
        const videoUrl = toRecord(record?.video_url);
        const url = toString(videoUrl?.url);
        if (!url || !isValidReferenceUri(url)) {
          throw new ApiError(400, "VALIDATION_ERROR", "content.video_url.url must be a valid url or asset uri.");
        }
        pushItem({ type: "video_url", video_url: { url }, role: toString(record?.role) ?? "reference_video" });
        continue;
      }

      if (type === "audio_url") {
        const audioUrl = toRecord(record?.audio_url);
        const url = toString(audioUrl?.url);
        if (!url || !isValidReferenceUri(url)) {
          throw new ApiError(400, "VALIDATION_ERROR", "content.audio_url.url must be a valid url or asset uri.");
        }
        pushItem({ type: "audio_url", audio_url: { url }, role: toString(record?.role) ?? "reference_audio" });
        continue;
      }

      throw new ApiError(400, "VALIDATION_ERROR", `Unsupported content type: ${type ?? "unknown"}`);
    }
  }

  const promptText = toString(input.prompt);
  if (promptText) {
    pushItem({ type: "text", text: promptText });
  }

  const referenceImageUrls: Array<{ url: string; role?: string }> = [];

  for (const asset of input.assets ?? []) {
    const url = toString(asset.url) ?? toString(asset.filePath);
    if (!url) {
      continue;
    }
    if (!isValidReferenceUri(url)) {
      throw new ApiError(400, "VALIDATION_ERROR", `Invalid reference image uri: ${url}`);
    }
    referenceImageUrls.push({ url, role: "reference_image" });
  }

  const firstFrameUrl = toString(settings.firstFrameImageUrl) ?? toString(settings.imageUrl);
  const lastFrameUrl = toString(settings.lastFrameImageUrl);
  if (firstFrameUrl) {
    if (!isValidReferenceUri(firstFrameUrl)) {
      throw new ApiError(400, "VALIDATION_ERROR", `Invalid first frame uri: ${firstFrameUrl}`);
    }
    referenceImageUrls.push({ url: firstFrameUrl, role: "reference_image" });
  }
  if (lastFrameUrl) {
    if (!isValidReferenceUri(lastFrameUrl)) {
      throw new ApiError(400, "VALIDATION_ERROR", `Invalid last frame uri: ${lastFrameUrl}`);
    }
    referenceImageUrls.push({ url: lastFrameUrl, role: "reference_image" });
  }

  if (Array.isArray(settings.referenceImages)) {
    for (const imageUrl of settings.referenceImages) {
      const url = toString(imageUrl);
      if (!url) {
        continue;
      }
      if (!isValidReferenceUri(url)) {
        throw new ApiError(400, "VALIDATION_ERROR", `Invalid reference image uri: ${url}`);
      }
      referenceImageUrls.push({ url, role: "reference_image" });
    }
  }

  for (const entry of referenceImageUrls) {
    pushItem({ type: "image_url", image_url: { url: entry.url }, role: entry.role ?? "reference_image" });
  }

  const referenceVideoUrl =
    toString(settings.referenceVideoUrl) ?? toString(settings.reference_video_url) ?? toString(settings.videoUrl);
  if (referenceVideoUrl) {
    if (!isValidReferenceUri(referenceVideoUrl)) {
      throw new ApiError(400, "VALIDATION_ERROR", `Invalid reference video uri: ${referenceVideoUrl}`);
    }
    pushItem({ type: "video_url", video_url: { url: referenceVideoUrl }, role: "reference_video" });
  }

  const referenceAudioUrl =
    toString(settings.referenceAudioUrl) ?? toString(settings.reference_audio_url) ?? toString(settings.audioUrl);
  if (referenceAudioUrl) {
    if (!isValidReferenceUri(referenceAudioUrl)) {
      throw new ApiError(400, "VALIDATION_ERROR", `Invalid reference audio uri: ${referenceAudioUrl}`);
    }
    pushItem({ type: "audio_url", audio_url: { url: referenceAudioUrl }, role: "reference_audio" });
  }

  if (!normalized.some((item) => item.type === "text")) {
    throw new ApiError(400, "VALIDATION_ERROR", "Video request requires at least one text content item.");
  }

  return normalized;
}

function buildRequestBody(input: GenerateVideoInput) {
  const settings = input.settings ?? {};
  const modelId = resolveVolcengineVideoModelId(input.model);
  const content = normalizeContent(input);
  const generateAudio = toBoolean(settings.generate_audio ?? settings.generateAudio);
  const ratio = toString(settings.ratio) ?? toString(settings.size);
  const duration = toNumber(settings.duration);
  const watermark = toBoolean(settings.watermark);

  const body: Record<string, unknown> = {
    model: modelId,
    content,
  };

  if (generateAudio !== undefined) {
    body.generate_audio = generateAudio;
  }
  if (ratio) {
    body.ratio = ratio;
  }
  if (duration !== undefined) {
    body.duration = duration;
  }
  if (watermark !== undefined) {
    body.watermark = watermark;
  }

  return {
    modelId,
    body,
  };
}

export const __seedance20TestUtils = {
  buildRequestBody,
  mapProviderError,
  mapVolcengineTaskStatus,
  normalizeContent,
  resolveVolcengineArkRuntimeConfig,
  resolveVolcengineVideoModelId,
};

function getMockVolcengineTaskState() {
  const globalRef = globalThis as typeof globalThis & {
    [MOCK_VOLCENGINE_GLOBAL_KEY]?: Map<string, MockVolcengineTask>;
  };

  if (!globalRef[MOCK_VOLCENGINE_GLOBAL_KEY]) {
    globalRef[MOCK_VOLCENGINE_GLOBAL_KEY] = new Map<string, MockVolcengineTask>();
  }

  return globalRef[MOCK_VOLCENGINE_GLOBAL_KEY]!;
}

function isMockVolcengineBaseUrl(baseUrl: string) {
  return baseUrl.toLowerCase().startsWith(MOCK_PROVIDER_BASE_URL_PREFIX);
}

function requestMockVolcengine(path: string, method: string) {
  const tasks = getMockVolcengineTaskState();

  if (path === "/contents/generations/tasks" && method === "POST") {
    const id = `cgt-mock-${crypto.randomUUID()}`;
    tasks.set(id, {
      id,
      pollCount: 0,
    });

    return {
      id,
    };
  }

  if (path.startsWith("/contents/generations/tasks/") && method === "GET") {
    const providerTaskId = path.replace("/contents/generations/tasks/", "");
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
        updated_at: Math.floor(Date.now() / 1000),
      };
    }

    return {
      id: providerTaskId,
      model: DEFAULT_MODEL_ID,
      status: "succeeded",
      content: {
        video_url: `https://mock.volcengine.local/${providerTaskId}.mp4`,
      },
      usage: {
        total_tokens: 100,
      },
      created_at: Math.floor(Date.now() / 1000) - 5,
      updated_at: Math.floor(Date.now() / 1000),
      seed: 42,
      resolution: "720p",
      ratio: "16:9",
      duration: 5,
      framespersecond: 24,
      service_tier: "default",
      execution_expires_after: 172800,
      generate_audio: true,
      draft: false,
    };
  }

  return {
    status: "failed",
  };
}

async function requestVolcengine(
  path: string,
  init: RequestInit & {
    key: string;
    baseUrl: string;
  },
) {
  if (isMockVolcengineBaseUrl(init.baseUrl)) {
    return requestMockVolcengine(path, (init.method ?? "GET").toUpperCase());
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
      error instanceof Error ? error.message : "Volcengine provider request failed.",
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw mapProviderError(response.status, payload, `Volcengine request failed with status ${response.status}.`);
  }

  return payload;
}

export async function generateVideoWithSeedance20(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  const { key, baseUrl } = resolveVolcengineArkRuntimeConfig();

  if (!key || !baseUrl) {
    throw new ApiError(503, "PROVIDER_UNAVAILABLE", "Missing volcengine video provider key.");
  }

  const requestBody = buildRequestBody(input);
  const rawResponse = await requestVolcengine("/contents/generations/tasks", {
    method: "POST",
    key,
    baseUrl,
    body: JSON.stringify(requestBody.body),
  });
  const responseRecord = toRecord(rawResponse);
  const providerTaskId = toString(responseRecord?.id);

  if (!providerTaskId) {
    throw new ApiError(502, "TASK_EXECUTION_FAILED", "Volcengine response missing task id.");
  }

  return {
    provider: "volcengine",
    model: toString(input.model) ?? "seedance-2.0",
    providerTaskId,
    status: "pending",
    rawResponse,
  };
}

export async function getVideoStatusWithSeedance20(providerTaskId: string): Promise<VideoStatusOutput> {
  const { key, baseUrl } = resolveVolcengineArkRuntimeConfig();

  if (!key || !baseUrl) {
    throw new ApiError(503, "PROVIDER_UNAVAILABLE", "Missing volcengine video provider key.");
  }

  const rawResponse = await requestVolcengine(`/contents/generations/tasks/${providerTaskId}`, {
    method: "GET",
    key,
    baseUrl,
  });
  const responseRecord = toRecord(rawResponse);
  const contentRecord = toRecord(responseRecord?.content);
  const videoUrl = toString(contentRecord?.video_url);
  const output = videoUrl ? [{ kind: "url" as const, url: videoUrl }] : [];
  const metadata: Record<string, unknown> = {};

  const usage = toRecord(responseRecord?.usage);
  if (usage) {
    metadata.usage = usage;
  }

  const model = toString(responseRecord?.model);
  if (model) {
    metadata.modelId = model;
  }

  for (const keyName of [
    "created_at",
    "updated_at",
    "seed",
    "resolution",
    "ratio",
    "duration",
    "framespersecond",
    "service_tier",
    "execution_expires_after",
    "generate_audio",
    "draft",
  ]) {
    if (responseRecord && keyName in responseRecord) {
      metadata[keyName] = responseRecord[keyName];
    }
  }

  return {
    provider: "volcengine",
    providerTaskId,
    status: mapVolcengineTaskStatus(responseRecord?.status),
    output,
    ...(videoUrl ? { videoUrl } : {}),
    metadata,
    rawResponse,
  };
}

export async function cancelVideoWithSeedance20(providerTaskId: string): Promise<CancelVideoOutput> {
  return {
    provider: "volcengine",
    providerTaskId,
    status: "processing",
    rawResponse: null,
  };
}

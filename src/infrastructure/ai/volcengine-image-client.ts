import { ApiError } from "@/lib/api";

type StandardImageAsset = {
  kind: "image";
  url?: string;
  filePath?: string;
  role?: "reference" | "first_frame" | "last_frame";
  label?: string;
};

type GenerateImageInput = {
  prompt: string;
  model?: string;
  settings?: Record<string, unknown>;
  assets?: StandardImageAsset[];
};

type ImageOutputItem = {
  kind: "url";
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

type GenerateImageOutput = {
  provider: "volcengine";
  model: string;
  output: ImageOutputItem[];
  imageUrl?: string;
  size: "2K" | "4K";
  pixelString: string;
  aspectRatio: string;
  responseFormat: "url";
  trace?: {
    requestId?: string;
    traceId?: string;
    keyId?: string;
  };
  rawResponse: unknown;
};

const VOLCENGINE_PROVIDER = "volcengine";
const SUPPORTED_MODELS = new Set(["doubao-seedream-4-5-251128", "doubao-seedream-5-0-260128"]);
const SUPPORTED_SIZES = new Set(["2K", "4K"]);

const RESOLUTION_MAP: Record<string, Record<string, string>> = {
  "2K": {
    "1:1": "2048x2048",
    "4:3": "2304x1728",
    "3:4": "1728x2304",
    "16:9": "2848x1600",
    "9:16": "1600x2848",
    "3:2": "2496x1664",
    "2:3": "1664x2496",
    "21:9": "3136x1344",
  },
  "4K": {
    "1:1": "4096x4096",
    "3:4": "3520x4704",
    "4:3": "4704x3520",
    "16:9": "5504x3040",
    "9:16": "3040x5504",
    "2:3": "3328x4992",
    "3:2": "4992x3328",
    "21:9": "6240x2656",
  },
};

const DEFAULT_SIZE = "2K";
const DEFAULT_ASPECT_RATIO = "1:1";
const DEFAULT_RESPONSE_FORMAT = "url";
const DEFAULT_STREAM = false;
const DEFAULT_WATERMARK = false;
const MOCK_PROVIDER_BASE_URL_PREFIX = "mock://volcengine";
const DEFAULT_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL = "doubao-seedream-4-5-251128";

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

function resolveVolcengineModel(inputModel?: string) {
  const model = toString(inputModel) ?? toString(process.env.VOLCENGINE_ARK_IMAGE_MODEL) ?? DEFAULT_MODEL;

  if (!SUPPORTED_MODELS.has(model)) {
    throw new ApiError(409, "MODEL_NOT_ENABLED", `Model ${model} is not enabled for volcengine.`);
  }

  return model;
}

function resolveImageSize(settings: Record<string, unknown>) {
  const size =
    toString(settings.size) ??
    toString(settings.resolutionLevel) ??
    toString(settings.imageSize) ??
    toString(settings.image_size) ??
    DEFAULT_SIZE;
  const normalizedSize = size.toUpperCase() as "2K" | "4K";

  if (!SUPPORTED_SIZES.has(normalizedSize)) {
    throw new ApiError(400, "VALIDATION_ERROR", "分辨率等级仅支持 2K 或 4K。");
  }

  const aspectRatio =
    toString(settings.aspectRatio) ?? toString(settings.aspect_ratio) ?? DEFAULT_ASPECT_RATIO;

  const resolutionMapForSize = RESOLUTION_MAP[normalizedSize];
  const pixelString = resolutionMapForSize[aspectRatio];

  if (!pixelString) {
    throw new ApiError(400, "VALIDATION_ERROR", `不支持的宽高比: ${aspectRatio}。仅支持 1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9。`);
  }

  return {
    size: normalizedSize,
    pixelString,
    aspectRatio,
  };
}

function resolveResponseFormat(settings: Record<string, unknown>) {
  const responseFormat =
    toString(settings.responseFormat) ??
    toString(settings.response_format) ??
    toString(settings.outputFormat) ??
    toString(settings.output_format) ??
    DEFAULT_RESPONSE_FORMAT;

  return responseFormat;
}

function parseDimensions(value: unknown) {
  if (typeof value !== "string") {
    return {};
  }

  const match = value.trim().match(/^(\d+)\s*[xX]\s*(\d+)$/);

  if (!match) {
    return {};
  }

  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);

  return Number.isFinite(width) && Number.isFinite(height) ? { width, height } : {};
}

function pickTraceMeta(raw: unknown) {
  const record = toRecord(raw);
  const trace = toRecord(record?.trace);

  const requestId =
    toString(record?.requestId) ??
    toString(record?.request_id) ??
    toString(trace?.requestId) ??
    toString(trace?.request_id);
  const traceId = toString(record?.traceId) ?? toString(record?.trace_id) ?? toString(trace?.traceId);
  const keyId = toString(record?.keyId) ?? toString(record?.key_id) ?? toString(trace?.keyId);

  return {
    ...(requestId ? { requestId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(keyId ? { keyId } : {}),
  };
}

function normalizeImageOutputItems(raw: unknown): ImageOutputItem[] {
  const responseRecord = toRecord(raw);
  const rawItems = Array.isArray(responseRecord?.data) ? responseRecord.data : [];
  const normalized: ImageOutputItem[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    const outputRecord = toRecord(item);

    if (!outputRecord) {
      continue;
    }

    const url =
      toString(outputRecord.url) ??
      toString(outputRecord.imageUrl) ??
      toString(outputRecord.image_url) ??
      toString(outputRecord.fileUrl) ??
      toString(outputRecord.file_url);

    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    normalized.push({
      kind: "url",
      url,
      ...(toString(outputRecord.mimeType) ?? toString(outputRecord.mime_type)
        ? { mimeType: toString(outputRecord.mimeType) ?? toString(outputRecord.mime_type) }
        : {}),
      ...(toNumber(outputRecord.width) !== undefined ? { width: toNumber(outputRecord.width) } : {}),
      ...(toNumber(outputRecord.height) !== undefined ? { height: toNumber(outputRecord.height) } : {}),
      ...parseDimensions(outputRecord.size ?? outputRecord.resolution),
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
    toString(payload?.error_msg) ??
    fallbackMessage;
  const normalizedCode = providerCode.toUpperCase();

  if (normalizedCode.includes("MODEL") || normalizedCode.includes("UNSUPPORTED_MODEL")) {
    return new ApiError(409, "MODEL_NOT_ENABLED", message);
  }

  if (
    status === 408 ||
    status === 504 ||
    normalizedCode.includes("TIMEOUT") ||
    normalizedCode.includes("TIMED_OUT")
  ) {
    return new ApiError(504, "PROVIDER_TIMEOUT", message);
  }

  if (status === 429 || normalizedCode.includes("RATE_LIMIT") || normalizedCode.includes("TOO_MANY_REQUEST")) {
    return new ApiError(429, "PROVIDER_RATE_LIMITED", message);
  }

  if (
    status === 400 ||
    status === 422 ||
    normalizedCode.includes("INVALID") ||
    normalizedCode.includes("VALIDATION") ||
    normalizedCode.includes("BAD_REQUEST") ||
    normalizedCode.includes("PARAM")
  ) {
    return new ApiError(400, "PROVIDER_BAD_REQUEST", message);
  }

  if (status === 401 || status === 403 || status >= 500) {
    return new ApiError(503, "PROVIDER_UNAVAILABLE", message);
  }

  return new ApiError(502, "TASK_EXECUTION_FAILED", message);
}

function mapTransportError(error: unknown): ApiError {
  const message = error instanceof Error ? error.message : "Volcengine provider request failed.";
  const normalizedMessage = message.toLowerCase();
  const errorName = error instanceof Error ? error.name : "";

  if (
    errorName === "AbortError" ||
    errorName === "TimeoutError" ||
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("timeout")
  ) {
    return new ApiError(504, "PROVIDER_TIMEOUT", message);
  }

  return new ApiError(503, "PROVIDER_UNAVAILABLE", message);
}

function buildRequestBody(input: GenerateImageInput, model: string) {
  const settings = input.settings ?? {};
  const { size, pixelString, aspectRatio } = resolveImageSize(settings);
  const responseFormat = resolveResponseFormat(settings);
  const stream = toBoolean(settings.stream) ?? DEFAULT_STREAM;
  const watermark = toBoolean(settings.watermark) ?? DEFAULT_WATERMARK;

  const outputFormat =
    toString(settings.outputFormat) ?? toString(settings.output_format);
  const sequentialImageGeneration =
    toString(settings.sequentialImageGeneration) ??
    toString(settings.sequential_image_generation);

  const body: Record<string, unknown> = {
    model,
    prompt: input.prompt,
    response_format: responseFormat,
    size: pixelString,
    stream,
    watermark,
  };

  if (outputFormat) {
    body.output_format = outputFormat;
  }
  if (sequentialImageGeneration) {
    body.sequential_image_generation = sequentialImageGeneration;
  }

  if (input.assets && input.assets.length > 0) {
    const referenceImages = input.assets
      .filter((asset) => asset.role === "reference" && asset.url)
      .map((asset) => asset.url as string);
    if (referenceImages.length > 0) {
      body.image = referenceImages;
    }
  }

  if (settings.sequentialImageGenerationOptions || settings.sequential_image_generation_options) {
    body.sequential_image_generation_options =
      settings.sequentialImageGenerationOptions ?? settings.sequential_image_generation_options;
  }

  return {
    size,
    pixelString,
    aspectRatio,
    responseFormat,
    stream,
    watermark,
    body,
  };
}

export const __volcengineImageTestUtils = {
  buildRequestBody,
  mapProviderError,
  mapTransportError,
  normalizeImageOutputItems,
  pickTraceMeta,
  resolveImageSize,
  resolveResponseFormat,
};

function isMockVolcengineBaseUrl(baseUrl: string) {
  return baseUrl.toLowerCase().startsWith(MOCK_PROVIDER_BASE_URL_PREFIX);
}

function requestMockVolcengine(body: Record<string, unknown>) {
  const size = toString(body.size) ?? DEFAULT_SIZE;
  const dimensions = size === "4K" ? { width: 4096, height: 4096 } : { width: 2048, height: 2048 };

  return {
    created: Math.floor(Date.now() / 1000),
    request_id: `mock-request-${crypto.randomUUID()}`,
    trace: {
      keyId: "volcengine-key-1",
    },
    data: [
      {
        url: `https://mock.volcengine.local/${crypto.randomUUID()}.png`,
        size: `${dimensions.width}x${dimensions.height}`,
      },
    ],
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
    const parsedBody = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    return requestMockVolcengine(parsedBody);
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
    throw mapTransportError(error);
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

export async function generateImageWithVolcengine(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const key = toString(process.env.VOLCENGINE_ARK_IMAGE_API_KEY) ?? toString(process.env.VOLCENGINE_ARK_API_KEY);
  const baseUrl = toString(process.env.VOLCENGINE_ARK_BASE_URL) ?? DEFAULT_BASE_URL;
  const model = resolveVolcengineModel(input.model);

  if (!key) {
    throw new ApiError(503, "PROVIDER_UNAVAILABLE", "Missing volcengine image provider key.");
  }

  const requestBody = buildRequestBody(input, model);
  const rawResponse = await requestVolcengine("/images/generations", {
    method: "POST",
    key,
    baseUrl,
    body: JSON.stringify(requestBody.body),
  });
  const output = normalizeImageOutputItems(rawResponse);
  const trace = pickTraceMeta(rawResponse);

  if (output.length === 0) {
    throw new ApiError(502, "TASK_EXECUTION_FAILED", "Volcengine response does not contain image urls.");
  }

  return {
    provider: "volcengine",
    model,
    output,
    imageUrl: output[0]?.url,
    size: requestBody.size,
    pixelString: requestBody.pixelString,
    aspectRatio: requestBody.aspectRatio,
    responseFormat: requestBody.responseFormat as "url",
    ...(Object.keys(trace).length > 0 ? { trace } : {}),
    rawResponse: {
      ...(toRecord(rawResponse) ?? {}),
      trace,
    },
  };
}

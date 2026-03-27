import { env } from "@/lib/env";

type GenerateTextInput = {
  prompt: string;
  model?: string;
  settings?: Record<string, unknown>;
  referenceImages?: string[];
};

type GenerateTextOutput = {
  provider: "cloubic" | "mock";
  model: string;
  content: string;
  usage?: Record<string, unknown>;
  rawResponse: unknown;
};

type GenerateImageInput = {
  prompt: string;
  model?: string;
  settings?: Record<string, unknown>;
  referenceImages?: string[];
};

type GenerateImageOutput = {
  provider: "cloubic" | "mock";
  model: string;
  content: string;
  markdown: string;
  dataUri?: string;
  imageUrl?: string;
  usage?: Record<string, unknown>;
  rawResponse: unknown;
};

type GenerateVideoInput = {
  prompt: string;
  model?: string;
  settings?: Record<string, unknown>;
};

type GenerateVideoOutput = {
  provider: "cloubic" | "mock";
  model: string;
  providerTaskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  rawResponse: unknown;
};

type VideoStatusOutput = {
  provider: "cloubic" | "mock";
  providerTaskId: string;
  status: "pending" | "processing" | "completed" | "failed";
  videoUrl?: string;
  progress?: number;
  rawResponse: unknown;
};

function toNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => toString(item))
    .filter((item): item is string => typeof item === "string" && item.length > 0);
}

function normalizePotentialImageSource(value: string) {
  const trimmed = value.trim().replace(/^['"`]+|['"`]+$/g, "");

  if (trimmed.startsWith("data:image/")) {
    return trimmed.replace(/\s+/g, "");
  }

  return trimmed;
}

function encodeImageUrl(value: string) {
  const normalized = normalizePotentialImageSource(value);

  return normalized.startsWith("data:image/") ? normalized : encodeURI(normalized);
}

function normalizeImagePromptLabel(value: string | undefined, index: number) {
  if (!value) {
    return `image_${index + 1}`;
  }

  const normalized = value
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized : `image_${index + 1}`;
}

function normalizeVideoReferenceImageEntries(input: {
  imageUrl?: string;
  referenceImages: string[];
  lastFrameImageUrl?: string;
  referenceImageEntries?: unknown;
}) {
  const entries: Array<{ imageUrl: string; label?: string }> = [];
  const seen = new Set<string>();

  const appendEntry = (imageUrl: string | undefined, label?: string) => {
    if (!imageUrl) {
      return;
    }

    const normalizedUrl = encodeImageUrl(imageUrl);

    if (seen.has(normalizedUrl)) {
      return;
    }

    seen.add(normalizedUrl);
    entries.push({
      imageUrl: normalizedUrl,
      ...(label ? { label } : {}),
    });
  };

  if (Array.isArray(input.referenceImageEntries)) {
    for (const entry of input.referenceImageEntries) {
      if (typeof entry === "string") {
        appendEntry(entry);
        continue;
      }

      if (!entry || typeof entry !== "object") {
        continue;
      }

      const record = entry as Record<string, unknown>;
      appendEntry(
        toString(record.url) ?? toString(record.imageUrl) ?? toString(record.image_url),
        toString(record.label) ?? toString(record.name) ?? toString(record.fileName),
      );
    }
  }

  appendEntry(input.imageUrl);

  for (const referenceImage of input.referenceImages) {
    appendEntry(referenceImage);
  }

  appendEntry(input.lastFrameImageUrl);

  return entries;
}

function extractImageSourceFromString(value: string): string | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const directDataUriMatch = trimmed.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/);

  if (directDataUriMatch?.[0]) {
    return normalizePotentialImageSource(directDataUriMatch[0]);
  }

  const markdownMatches = [...trimmed.matchAll(/!?\[[^\]]*]\(([\s\S]*?)\)/g)];

  for (const match of markdownMatches) {
    const candidate = normalizePotentialImageSource(match[1] ?? "");

    if (candidate.startsWith("data:image/") || /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  const jsonUrlMatch = trimmed.match(/"(?:imageUrl|image_url|url|src|dataUri|data_uri)"\s*:\s*"([^"]+)"/i);

  if (jsonUrlMatch?.[1]) {
    return normalizePotentialImageSource(jsonUrlMatch[1]);
  }

  const genericUrlMatch = trimmed.match(/https?:\/\/[^\s)"']+/i);

  if (genericUrlMatch?.[0]) {
    return normalizePotentialImageSource(genericUrlMatch[0]);
  }

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return extractImageSourceFromUnknown(JSON.parse(trimmed));
    } catch {
      return undefined;
    }
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || trimmed.includes('\\"')) {
    try {
      const parsed = JSON.parse(trimmed);

      return typeof parsed === "string" ? extractImageSourceFromString(parsed) : extractImageSourceFromUnknown(parsed);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function extractImageSourceFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    return extractImageSourceFromString(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const source = extractImageSourceFromUnknown(item);

      if (source) {
        return source;
      }
    }

    return undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const preferredCandidates = [
    record.imageUrl,
    record.image_url,
    record.url,
    record.src,
    record.dataUri,
    record.data_uri,
    record.content,
    record.text,
    record.markdown,
    record.b64_json,
    record.image,
    record.imageUrlList,
  ];

  for (const candidate of preferredCandidates) {
    const source = extractImageSourceFromUnknown(candidate);

    if (source) {
      return source;
    }
  }

  for (const candidate of Object.values(record)) {
    const source = extractImageSourceFromUnknown(candidate);

    if (source) {
      return source;
    }
  }

  return undefined;
}

function extractImageSource(value: string, rawResponse?: unknown) {
  const directSource = extractImageSourceFromString(value);

  if (directSource) {
    return directSource;
  }

  return extractImageSourceFromUnknown(rawResponse);
}

function buildMockTextResponse(input: GenerateTextInput): GenerateTextOutput {
  const preview = input.prompt.trim().slice(0, 120);
  const content = preview.length > 0 ? `Mock response: ${preview}` : "Mock response: empty prompt";

  return {
    provider: "mock",
    model: input.model ?? env.cloubicTextModel,
    content,
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    rawResponse: {
      mocked: true,
      content,
      referenceImages: input.referenceImages ?? [],
    },
  };
}

function buildMockImageResponse(input: GenerateImageInput): GenerateImageOutput {
  const content = `![image](data:image/png;base64,bW9jay1pbWFnZS1mb3ItOiA${Buffer.from(input.prompt).toString("base64")})`;
  const imageSource = extractImageSource(content);
  const dataUri = imageSource?.startsWith("data:image/") ? imageSource : undefined;

  return {
    provider: "mock",
    model: input.model ?? env.cloubicImageModel,
    content,
    markdown: content,
    dataUri,
    imageUrl: imageSource?.startsWith("http") ? imageSource : undefined,
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    rawResponse: {
      mocked: true,
      content,
      referenceImages: input.referenceImages ?? [],
    },
  };
}

function buildMockVideoSubmitResponse(input: GenerateVideoInput): GenerateVideoOutput {
  const providerTaskId = `mock_video_${Math.random().toString(36).slice(2, 10)}`;
  const model = resolveVideoModel(input);

  return {
    provider: "mock",
    model,
    providerTaskId,
    status: "pending",
    rawResponse: {
      mocked: true,
      id: providerTaskId,
      status: "pending",
    },
  };
}

function buildMockVideoStatusResponse(providerTaskId: string): VideoStatusOutput {
  return {
    provider: "mock",
    providerTaskId,
    status: "completed",
    videoUrl: `https://mock.cloubic.local/videos/${providerTaskId}.mp4`,
    progress: 100,
    rawResponse: {
      mocked: true,
      id: providerTaskId,
      status: "completed",
      video_url: `https://mock.cloubic.local/videos/${providerTaskId}.mp4`,
      progress: 100,
    },
  };
}

function distributeShotDurations(totalDuration: number, shotCount: number) {
  if (shotCount <= 0) {
    return [];
  }

  const normalizedTotal = Math.max(shotCount, Math.round(totalDuration));
  const baseDuration = Math.floor(normalizedTotal / shotCount);
  let remaining = normalizedTotal % shotCount;

  return Array.from({ length: shotCount }, () => {
    const duration = baseDuration + (remaining > 0 ? 1 : 0);

    if (remaining > 0) {
      remaining -= 1;
    }

    return duration;
  });
}

function resolveVideoModel(input: GenerateVideoInput) {
  return (
    toString(input.model) ??
    toString(input.settings?.model) ??
    toString(input.settings?.videoModel) ??
    toString(input.settings?.video_model) ??
    toString(input.settings?.modelKey) ??
    env.cloubicVideoModel
  );
}

function isCloubicV3VideoModel(model: string) {
  return /\bkling[-_/ ]?v?3(?:\.0)?(?:\b|[-_/ ])/i.test(model);
}

async function postChatCompletion(payload: Record<string, unknown>) {
  if (!env.cloubicApiKey) {
    throw new Error("Missing CLOUBIC_API_KEY or AI_API_KEY.");
  }

  const response = await fetch(`${env.cloubicBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.cloubicApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `Cloubic request failed with status ${response.status}${errorBody ? `: ${errorBody}` : "."}`,
    );
  }

  return response.json();
}

async function requestCloubic(path: string, init: RequestInit) {
  if (!env.cloubicApiKey) {
    throw new Error("Missing CLOUBIC_API_KEY or AI_API_KEY.");
  }

  const response = await fetch(`${env.cloubicBaseUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.cloubicApiKey}`,
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `Cloubic request failed with status ${response.status}${errorBody ? `: ${errorBody}` : "."}`,
    );
  }

  return response.json();
}

export async function generateTextWithCloubic(input: GenerateTextInput): Promise<GenerateTextOutput> {
  if (!env.cloubicApiKey) {
    if (env.nodeEnv !== "production") {
      return buildMockTextResponse(input);
    }

    throw new Error("Missing CLOUBIC_API_KEY or AI_API_KEY.");
  }

  const temperature = toNumber(input.settings?.temperature);
  const systemPrompt =
    toString(input.settings?.systemPrompt) ?? toString(input.settings?.system) ?? "你是一个专业的内容创作助手。";
  const responseFormat = toString(input.settings?.responseFormat);
  const referenceImages = (input.referenceImages ?? []).filter((imageUrl) => typeof imageUrl === "string" && imageUrl.trim().length > 0);

  const rawResponse = await postChatCompletion({
    model: input.model ?? env.cloubicTextModel,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content:
          referenceImages.length > 0
            ? [
                {
                  type: "text",
                  text: input.prompt.trim() || "请结合参考图完成本次文本生成。",
                },
                ...referenceImages.map((imageUrl) => ({
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                  },
                })),
              ]
            : input.prompt,
      },
    ],
    temperature,
    response_format: responseFormat === "json" ? { type: "json_object" } : undefined,
  });
  const content = rawResponse?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Cloubic text response does not contain assistant content.");
  }

  return {
    provider: "cloubic",
    model: rawResponse?.model ?? input.model ?? env.cloubicTextModel,
    content: content.trim(),
    usage: rawResponse?.usage,
    rawResponse,
  };
}

export async function generateImageWithCloubic(input: GenerateImageInput): Promise<GenerateImageOutput> {
  if (!env.cloubicApiKey) {
    if (env.nodeEnv !== "production") {
      return buildMockImageResponse(input);
    }

    throw new Error("Missing CLOUBIC_API_KEY or AI_API_KEY.");
  }

  const referenceImages = (input.referenceImages ?? []).filter((imageUrl) => typeof imageUrl === "string" && imageUrl.trim().length > 0);
  const rawResponse = await postChatCompletion({
    model: input.model ?? env.cloubicImageModel,
    messages: [
      {
        role: "user",
        content:
          referenceImages.length > 0
            ? [
                {
                  type: "text",
                  text: input.prompt.trim() || "请基于参考图生成一张新图片。",
                },
                ...referenceImages.map((imageUrl) => ({
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                  },
                })),
              ]
            : input.prompt,
      },
    ],
    n: 1,
  });

  const content = rawResponse?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Cloubic image response does not contain assistant content.");
  }

  const markdown = content.trim();
  const imageSource = extractImageSource(markdown, rawResponse);
  const dataUri = imageSource?.startsWith("data:image/") ? imageSource : undefined;
  const imageUrl = imageSource?.startsWith("http") ? imageSource : undefined;

  return {
    provider: "cloubic",
    model: rawResponse?.model ?? input.model ?? env.cloubicImageModel,
    content: markdown,
    markdown,
    dataUri,
    imageUrl,
    usage: rawResponse?.usage,
    rawResponse,
  };
}

export async function generateVideoWithCloubic(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  if (!env.cloubicApiKey) {
    if (env.nodeEnv !== "production") {
      return buildMockVideoSubmitResponse(input);
    }

    throw new Error("Missing CLOUBIC_API_KEY or AI_API_KEY.");
  }

  const resolvedModel = resolveVideoModel(input);
  const metadataSettings = toRecord(input.settings?.metadata);
  const duration =
    toNumber(input.settings?.duration) ??
    toNumber(input.settings?.durationSec) ??
    toNumber(metadataSettings?.duration) ??
    5;
  const imageUrl =
    toString(input.settings?.firstFrameImageUrl) ??
    toString(input.settings?.imageUrl) ??
    toString(input.settings?.image_url) ??
    toString(metadataSettings?.image_url);
  const lastFrameImageUrl = toString(input.settings?.lastFrameImageUrl) ?? toString(metadataSettings?.last_frame_image_url);
  const size = toString(input.settings?.size) ?? toString(input.settings?.aspectRatio) ?? toString(metadataSettings?.aspect_ratio) ?? "9:16";
  const metadataGenerationMode = toString(metadataSettings?.generation_mode);
  const metadataMultiShot = toBoolean(metadataSettings?.multi_shot);
  const directShotPrompts = Array.isArray(input.settings?.shotPrompts)
    ? input.settings.shotPrompts.filter(
        (shotPrompt): shotPrompt is string => typeof shotPrompt === "string" && shotPrompt.trim().length > 0,
      )
    : [];
  const metadataShotPrompts = Array.isArray(metadataSettings?.multi_prompt)
    ? metadataSettings.multi_prompt
        .map((entry) => {
          const record = toRecord(entry);

          return toString(record?.prompt);
        })
        .filter((shotPrompt): shotPrompt is string => typeof shotPrompt === "string" && shotPrompt.length > 0)
    : [];
  const shotPrompts = directShotPrompts.length > 0 ? directShotPrompts : metadataShotPrompts;
  const generationModeCandidate = toString(input.settings?.generationMode) ?? metadataGenerationMode;
  const generationMode =
    generationModeCandidate === "first_last" || generationModeCandidate === "multi_shot"
      ? generationModeCandidate
      : shotPrompts.length > 0 || metadataMultiShot
        ? "multi_shot"
        : lastFrameImageUrl
          ? "first_last"
          : "reference";
  const motionStrength = toNumber(input.settings?.motionStrength) ?? toNumber(metadataSettings?.motion_strength);
  const withAudio =
    toBoolean(input.settings?.withAudio) ??
    (toString(input.settings?.sound) === "on" ? true : toString(input.settings?.sound) === "off" ? false : undefined) ??
    (toString(metadataSettings?.sound) === "on" ? true : toString(metadataSettings?.sound) === "off" ? false : undefined) ??
    false;
  const sound = withAudio ? "on" : "off";
  const referenceImages = [
    ...(Array.isArray(input.settings?.referenceImages)
      ? input.settings.referenceImages.filter(
          (referenceImage): referenceImage is string =>
            typeof referenceImage === "string" && referenceImage.trim().length > 0,
        )
      : []),
    ...toStringList(metadataSettings?.images),
  ];
  const imageEntries = normalizeVideoReferenceImageEntries({
    imageUrl,
    referenceImages,
    lastFrameImageUrl,
    referenceImageEntries: input.settings?.referenceImageEntries ?? metadataSettings?.image_list,
  });
  const primaryImageUrl = imageEntries[0]?.imageUrl;
  const promptSegments = [input.prompt.trim()];
  const hasImagePlaceholders = /<<<image_\d+>>>/.test(input.prompt);

  if (generationMode === "first_last") {
    promptSegments.push("生成模式：首尾帧视频。");
  }

  if (generationMode === "multi_shot" && shotPrompts.length > 0) {
    promptSegments.push(`多镜头脚本：\n${shotPrompts.map((shotPrompt, index) => `${index + 1}. ${shotPrompt}`).join("\n")}`);
  }

  if (!hasImagePlaceholders && imageEntries.length > 0) {
    promptSegments.push(
      `图像锚点：${imageEntries
        .map((entry, index) => `${normalizeImagePromptLabel(entry.label, index)}<<<image_${index + 1}>>>`)
        .join("，")}`,
    );
  }

  if (lastFrameImageUrl) {
    promptSegments.push("已提供末帧参考，请确保镜头收束到目标末帧。");
  }

  const prompt = promptSegments.filter(Boolean).join("\n\n");
  const multiPromptDurations = distributeShotDurations(duration, shotPrompts.length);
  const multiPrompt =
    generationMode === "multi_shot"
      ? shotPrompts.map((shotPrompt, index) => ({
          index: index + 1,
          prompt: shotPrompt,
          duration: multiPromptDurations[index] ?? 1,
        }))
      : [];
  const metadata: Record<string, unknown> = {
    ...(metadataSettings ?? {}),
    multi_shot: generationMode === "multi_shot",
    aspect_ratio: size,
    sound,
    generation_mode: generationMode,
    ...(imageEntries.length > 0
      ? {
          image_list: imageEntries.map((entry) => ({
            image_url: entry.imageUrl,
          })),
          images: imageEntries.map((entry) => entry.imageUrl),
        }
      : {}),
    ...(typeof motionStrength === "number" ? { motion_strength: motionStrength } : {}),
  };

  if (generationMode === "multi_shot") {
    metadata.shot_type = "customize";
    metadata.multi_prompt = multiPrompt;
  }

  if (generationMode === "first_last" && lastFrameImageUrl) {
    metadata.last_frame_image_url = encodeImageUrl(lastFrameImageUrl);
  }

  const requestBody: Record<string, unknown> = {
    model: resolvedModel,
    duration,
    ...(isCloubicV3VideoModel(resolvedModel) && primaryImageUrl ? { image_url: primaryImageUrl } : {}),
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };

  if (prompt) {
    requestBody.prompt = prompt;
  }

  console.info("[cloubic-video] request payload", {
    model: resolvedModel,
    requestBody,
  });

  const rawResponse = await requestCloubic("/video/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const providerTaskId =
    toString(rawResponse?.id) ??
    toString(rawResponse?.task_id) ??
    toString(rawResponse?.data?.task_id);

  if (!providerTaskId) {
    throw new Error("Cloubic video response does not contain a task id.");
  }

  const statusValue = toString(rawResponse?.status) ?? toString(rawResponse?.data?.status) ?? "pending";
  const status =
    statusValue === "processing" || statusValue === "completed" || statusValue === "failed"
      ? statusValue
      : statusValue === "queued" || statusValue === "pending"
        ? "pending"
      : "pending";

  return {
    provider: "cloubic",
    model: toString(rawResponse?.model) ?? resolvedModel,
    providerTaskId,
    status,
    rawResponse,
  };
}

export async function getVideoStatusWithCloubic(providerTaskId: string): Promise<VideoStatusOutput> {
  if (providerTaskId.startsWith("mock_video_")) {
    return buildMockVideoStatusResponse(providerTaskId);
  }

  if (!env.cloubicApiKey) {
    if (env.nodeEnv !== "production") {
      return buildMockVideoStatusResponse(providerTaskId);
    }

    throw new Error("Missing CLOUBIC_API_KEY or AI_API_KEY.");
  }

  const rawResponse = await requestCloubic(`/video/generations/${providerTaskId}`, {
    method: "GET",
  });

  const statusValue = toString(rawResponse?.status) ?? toString(rawResponse?.data?.status) ?? "pending";
  const status =
    statusValue === "completed" || statusValue === "succeeded"
      ? "completed"
      : statusValue === "failed"
        ? "failed"
      : statusValue === "processing"
        ? "processing"
        : statusValue === "queued"
          ? "pending"
        : "pending";

  return {
    provider: "cloubic",
    providerTaskId,
    status,
    videoUrl: toString(rawResponse?.video_url) ?? toString(rawResponse?.data?.video_url) ?? toString(rawResponse?.data?.url),
    progress: toNumber(rawResponse?.progress) ?? toNumber(rawResponse?.data?.progress),
    rawResponse,
  };
}

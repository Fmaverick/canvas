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

function normalizePotentialImageSource(value: string) {
  const trimmed = value.trim().replace(/^['"`]+|['"`]+$/g, "");

  if (trimmed.startsWith("data:image/")) {
    return trimmed.replace(/\s+/g, "");
  }

  return trimmed;
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

  return {
    provider: "mock",
    model: input.model ?? env.cloubicVideoModel,
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

  const duration = toNumber(input.settings?.duration) ?? toNumber(input.settings?.durationSec) ?? 5;
  const imageUrl =
    toString(input.settings?.firstFrameImageUrl) ??
    toString(input.settings?.imageUrl) ??
    toString(input.settings?.image_url);
  const lastFrameImageUrl = toString(input.settings?.lastFrameImageUrl);
  const size = toString(input.settings?.size) ?? "9:16";
  const generationMode = toString(input.settings?.generationMode) ?? "reference";
  const motionStrength = toNumber(input.settings?.motionStrength);
  const withAudio = Boolean(input.settings?.withAudio);
  const sound = withAudio ? "on" : "off";
  const referenceImages = Array.isArray(input.settings?.referenceImages)
    ? input.settings.referenceImages.filter(
        (imageUrl): imageUrl is string => typeof imageUrl === "string" && imageUrl.trim().length > 0,
      )
    : [];
  const shotPrompts = Array.isArray(input.settings?.shotPrompts)
    ? input.settings.shotPrompts.filter(
        (shotPrompt): shotPrompt is string => typeof shotPrompt === "string" && shotPrompt.trim().length > 0,
      )
    : [];
  const promptSegments = [input.prompt.trim()];

  if (generationMode === "first_last") {
    promptSegments.push("生成模式：首尾帧视频。");
  }

  if (generationMode === "multi_shot" && shotPrompts.length > 0) {
    promptSegments.push(`多镜头脚本：\n${shotPrompts.map((shotPrompt, index) => `${index + 1}. ${shotPrompt}`).join("\n")}`);
  }

  if (referenceImages.length > 0) {
    promptSegments.push(`参考图数量：${referenceImages.length}。`);
  }

  if (lastFrameImageUrl) {
    promptSegments.push("已提供末帧参考，请确保镜头收束到目标末帧。");
  }

  const prompt = promptSegments.filter(Boolean).join("\n\n");
  const images = Array.from(new Set([imageUrl, ...referenceImages].filter((value): value is string => Boolean(value))));
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
    multi_shot: generationMode === "multi_shot",
    sound,
    generation_mode: generationMode,
    ...(typeof motionStrength === "number" ? { motion_strength: motionStrength } : {}),
  };

  if (generationMode === "multi_shot") {
    metadata.shot_type = "customize";
    metadata.multi_prompt = multiPrompt;
  }

  if (generationMode === "first_last" && lastFrameImageUrl) {
    metadata.last_frame_image_url = lastFrameImageUrl;
  }

  const requestBody: Record<string, unknown> = {
    model: input.model ?? env.cloubicVideoModel,
    duration,
    size,
    metadata,
  };

  if (generationMode === "multi_shot") {
    if (prompt) {
      requestBody.prompt = prompt;
    }

    if (imageUrl) {
      requestBody.image = imageUrl;
    }
  } else if (generationMode === "first_last") {
    if (prompt) {
      requestBody.prompt = prompt;
    }

    if (imageUrl) {
      requestBody.image = imageUrl;
    }
  } else {
    if (prompt) {
      requestBody.prompt = prompt;
    }

    if (images.length > 0) {
      requestBody.images = images;
    }
  }

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
    model: input.model ?? env.cloubicVideoModel,
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

import { env } from "@/lib/env";

type GenerateTextInput = {
  prompt: string;
  model?: string;
  settings?: Record<string, unknown>;
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

function extractImageSource(value: string) {
  const markdownMatch = value.match(/!\[[^\]]*]\(([^)]+)\)/);

  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const directMatch = value.match(/(data:image\/[^\s)]+|https?:\/\/[^\s)]+\.(?:png|jpg|jpeg|webp|gif|bmp|svg)(?:\?[^\s)]*)?)/i);

  return directMatch?.[1];
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

  const rawResponse = await postChatCompletion({
    model: input.model ?? env.cloubicTextModel,
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: input.prompt,
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
  const imageSource = extractImageSource(markdown);
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
  const resolution = toString(input.settings?.resolution);
  const generationMode = toString(input.settings?.generationMode) ?? "reference";
  const motionStrength = toNumber(input.settings?.motionStrength);
  const withAudio = Boolean(input.settings?.withAudio);
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
  const rawResponse = await requestCloubic("/video/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model ?? env.cloubicVideoModel,
      prompt,
      duration,
      image_url: imageUrl,
      images,
      reference_images: referenceImages,
      first_frame_image_url: imageUrl,
      last_frame_image_url: lastFrameImageUrl,
      with_audio: withAudio,
      enable_audio: withAudio,
      metadata: {
        ...(images.length > 0 ? { images } : {}),
        reference_images: referenceImages,
        first_frame_image_url: imageUrl,
        with_audio: withAudio,
        enable_audio: withAudio,
        generation_mode: generationMode,
        resolution,
        motion_strength: motionStrength,
        shot_prompts: shotPrompts,
        last_frame_image_url: lastFrameImageUrl,
      },
    }),
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

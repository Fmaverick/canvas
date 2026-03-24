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
};

type GenerateImageOutput = {
  provider: "cloubic" | "mock";
  model: string;
  content: string;
  markdown: string;
  dataUri?: string;
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
  const dataUri = content.match(/\((data:image\/[^)]+)\)/)?.[1];

  return {
    provider: "mock",
    model: input.model ?? env.cloubicImageModel,
    content,
    markdown: content,
    dataUri,
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

  const rawResponse = await postChatCompletion({
    model: input.model ?? env.cloubicImageModel,
    messages: [
      {
        role: "user",
        content: input.prompt,
      },
    ],
    n: 1,
  });

  const content = rawResponse?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Cloubic image response does not contain assistant content.");
  }

  const markdown = content.trim();
  const dataUri = markdown.match(/\((data:image\/[^)]+)\)/)?.[1];

  return {
    provider: "cloubic",
    model: rawResponse?.model ?? input.model ?? env.cloubicImageModel,
    content: markdown,
    markdown,
    dataUri,
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

  const duration = toNumber(input.settings?.duration) ?? 5;
  const imageUrl = toString(input.settings?.imageUrl) ?? toString(input.settings?.image_url);
  const rawResponse = await requestCloubic("/video/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model ?? env.cloubicVideoModel,
      prompt: input.prompt,
      duration,
      image_url: imageUrl,
      metadata: imageUrl ? { images: [imageUrl] } : undefined,
    }),
  });

  const providerTaskId =
    toString(rawResponse?.id) ??
    toString(rawResponse?.task_id) ??
    toString(rawResponse?.data?.task_id);

  if (!providerTaskId) {
    throw new Error("Cloubic video response does not contain a task id.");
  }

  const statusValue = toString(rawResponse?.status) ?? "pending";
  const status =
    statusValue === "processing" || statusValue === "completed" || statusValue === "failed"
      ? statusValue
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

  const statusValue = toString(rawResponse?.status) ?? "pending";
  const status =
    statusValue === "completed" || statusValue === "failed"
      ? statusValue
      : statusValue === "processing"
        ? "processing"
        : "pending";

  return {
    provider: "cloubic",
    providerTaskId,
    status,
    videoUrl: toString(rawResponse?.video_url),
    progress: toNumber(rawResponse?.progress),
    rawResponse,
  };
}

type UnifiedImageOutputItem = {
  kind: "url";
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

type ImageTraceMeta = {
  requestId?: string;
  traceId?: string;
  keyId?: string;
};

type GeneratedImageAsset = {
  id: string;
  fileUrl: string;
  storageKey: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
};

type BuildUnifiedImageArtifactsInput = {
  taskId: string;
  provider: string;
  model: string;
  markdown: string;
  dataUri?: string;
  sourceImageUrl?: string | null;
  referenceImages: string[];
  usage?: Record<string, unknown>;
  responseFormat?: string;
  size?: string;
  trace?: ImageTraceMeta;
  rawResponse: unknown;
  providerOutput?: unknown;
  asset: GeneratedImageAsset;
  generatedAt: string;
};

function toNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function toFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function normalizeUnifiedImageOutput(rawOutput: unknown, fallbackUrl?: string | null): UnifiedImageOutputItem[] {
  const rawItems = Array.isArray(rawOutput) ? rawOutput : [];
  const normalized: UnifiedImageOutputItem[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    const record = toRecord(item);

    if (!record) {
      continue;
    }

    const url =
      toNonEmptyString(record.url) ??
      toNonEmptyString(record.imageUrl) ??
      toNonEmptyString(record.image_url) ??
      toNonEmptyString(record.fileUrl) ??
      toNonEmptyString(record.file_url);

    if (!url || seen.has(url)) {
      continue;
    }

    seen.add(url);
    normalized.push({
      kind: "url",
      url,
      ...(toNonEmptyString(record.mimeType) ?? toNonEmptyString(record.mime_type)
        ? { mimeType: toNonEmptyString(record.mimeType) ?? toNonEmptyString(record.mime_type) }
        : {}),
      ...(toFiniteNumber(record.width) !== undefined ? { width: toFiniteNumber(record.width) } : {}),
      ...(toFiniteNumber(record.height) !== undefined ? { height: toFiniteNumber(record.height) } : {}),
    });
  }

  const normalizedFallbackUrl = toNonEmptyString(fallbackUrl);

  if (normalized.length === 0 && normalizedFallbackUrl) {
    normalized.push({
      kind: "url",
      url: normalizedFallbackUrl,
    });
  }

  return normalized;
}

export function extractImageTraceMeta(raw: unknown): ImageTraceMeta | null {
  const record = toRecord(raw);
  const traceRecord =
    record?.trace && typeof record.trace === "object" && !Array.isArray(record.trace)
      ? (record.trace as Record<string, unknown>)
      : record;
  const requestId = toNonEmptyString(traceRecord?.requestId) ?? toNonEmptyString(traceRecord?.request_id);
  const traceId = toNonEmptyString(traceRecord?.traceId) ?? toNonEmptyString(traceRecord?.trace_id);
  const keyId = toNonEmptyString(traceRecord?.keyId) ?? toNonEmptyString(traceRecord?.key_id);

  if (!requestId && !traceId && !keyId) {
    return null;
  }

  return {
    ...(requestId ? { requestId } : {}),
    ...(traceId ? { traceId } : {}),
    ...(keyId ? { keyId } : {}),
  };
}

export function buildUnifiedImageArtifacts(input: BuildUnifiedImageArtifactsInput) {
  const normalizedProviderOutput = normalizeUnifiedImageOutput(input.providerOutput, input.sourceImageUrl ?? input.dataUri ?? null);
  const providerTrace = extractImageTraceMeta(input.trace);
  const primaryProviderOutput = normalizedProviderOutput[0];
  const output = normalizeUnifiedImageOutput(
    [
      {
        kind: "url",
        url: input.asset.fileUrl,
        mimeType: input.asset.mimeType ?? primaryProviderOutput?.mimeType,
        width: input.asset.width ?? primaryProviderOutput?.width,
        height: input.asset.height ?? primaryProviderOutput?.height,
      },
    ],
    input.asset.fileUrl,
  );
  const primaryOutput = output[0];

  const sharedPayload = {
    provider: input.provider,
    model: input.model,
    markdown: input.markdown,
    ...(input.dataUri ? { dataUri: input.dataUri } : {}),
    imageUrl: input.asset.fileUrl,
    ...(input.sourceImageUrl ? { sourceImageUrl: input.sourceImageUrl } : {}),
    assetId: input.asset.id,
    storageKey: input.asset.storageKey,
    referenceImages: input.referenceImages,
    output,
    ...(normalizedProviderOutput.length > 0 ? { providerOutput: normalizedProviderOutput } : {}),
    ...(input.usage ? { usage: input.usage } : {}),
    ...(input.size ? { size: input.size } : {}),
    ...(input.responseFormat ? { responseFormat: input.responseFormat } : {}),
    ...(providerTrace ? { trace: providerTrace } : {}),
  };

  return {
    output,
    providerOutput: normalizedProviderOutput,
    trace: providerTrace,
    outputSnapshot: {
      taskId: input.taskId,
      outputType: "image",
      content: input.asset.fileUrl,
      assets: primaryOutput
        ? [
            {
              assetId: input.asset.id,
              assetType: "image",
              url: primaryOutput.url,
              ...(primaryOutput.mimeType ? { mimeType: primaryOutput.mimeType } : {}),
              ...(primaryOutput.width !== undefined ? { width: primaryOutput.width } : {}),
              ...(primaryOutput.height !== undefined ? { height: primaryOutput.height } : {}),
            },
          ]
        : undefined,
      structuredData: sharedPayload,
      generatedAt: input.generatedAt,
    },
    taskResultMeta: sharedPayload,
    responsePayload: {
      ...sharedPayload,
      rawResponse: input.rawResponse,
    },
    nodeRunResultMeta: sharedPayload,
  };
}

import { ApiError } from "@/lib/api";

type ArtsApiQueryValue = string | number | boolean | null | undefined;

type RequestArtsApiJsonInput = Omit<RequestInit, "body" | "headers" | "method"> & {
  baseUrl: string;
  apiKey: string;
  path: string;
  method?: string;
  query?: Record<string, ArtsApiQueryValue>;
  headers?: HeadersInit;
  body?: BodyInit | Record<string, unknown> | unknown;
  mapProviderError?: (status: number, body: unknown, fallbackMessage: string) => ApiError;
  mapTransportError?: (error: unknown) => ApiError;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function normalizePath(path: string) {
  if (path.length === 0) {
    return "";
  }

  return path.startsWith("/") ? path : `/${path}`;
}

function isBodyInit(value: unknown): value is BodyInit {
  return (
    typeof value === "string" ||
    value instanceof Blob ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof FormData ||
    value instanceof URLSearchParams ||
    value instanceof ReadableStream
  );
}

export function buildArtsApiUrl(baseUrl: string, path: string, query?: Record<string, ArtsApiQueryValue>) {
  const url = new URL(`${normalizeBaseUrl(baseUrl)}${normalizePath(path)}`);

  for (const [key, value] of Object.entries(query ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    if (value === undefined || value === null) {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

async function parseResponsePayload(response: Response) {
  const text = await response.text();

  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function requestArtsApiJson<ResultType = unknown>({
  baseUrl,
  apiKey,
  path,
  method = "GET",
  query,
  headers,
  body,
  mapProviderError,
  mapTransportError,
  ...init
}: RequestArtsApiJsonInput): Promise<ResultType> {
  const normalizedHeaders = new Headers(headers);
  normalizedHeaders.set("authorization", `Bearer ${apiKey}`);

  let requestBody: BodyInit | undefined;

  if (body !== undefined) {
    if (isBodyInit(body)) {
      requestBody = body;
    } else {
      requestBody = JSON.stringify(body);
    }

    if (!normalizedHeaders.has("content-type")) {
      normalizedHeaders.set("content-type", "application/json");
    }
  }

  let response: Response;

  try {
    response = await fetch(buildArtsApiUrl(baseUrl, path, query), {
      ...init,
      method,
      headers: normalizedHeaders,
      body: requestBody,
    });
  } catch (error) {
    if (mapTransportError) {
      throw mapTransportError(error);
    }

    throw new ApiError(
      503,
      "PROVIDER_UNAVAILABLE",
      error instanceof Error ? error.message : "ArtsAPI request failed.",
    );
  }

  const payload = await parseResponsePayload(response);

  if (!response.ok) {
    const fallbackMessage = `ArtsAPI request failed with status ${response.status}.`;

    if (mapProviderError) {
      throw mapProviderError(response.status, payload, fallbackMessage);
    }

    throw new ApiError(
      response.status >= 500 ? 503 : 502,
      "PROVIDER_UNAVAILABLE",
      typeof payload === "string" && payload.trim().length > 0 ? payload : fallbackMessage,
    );
  }

  return payload as ResultType;
}

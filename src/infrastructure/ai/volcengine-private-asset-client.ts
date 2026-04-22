import { createHash, createHmac } from "node:crypto";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

const DEFAULT_REGION = "cn-beijing";
const DEFAULT_SERVICE = "ark";
const DEFAULT_VERSION = "2024-01-01";
const DEFAULT_GROUP_TYPE = "AIGC";
const SIGNED_HEADERS = "content-type;host;x-content-sha256;x-date";
const CONTENT_TYPE = "application/json";

type CreateAssetGroupInput = {
  name: string;
  description?: string;
  projectName?: string;
};

type CreateAssetInput = {
  groupId: string;
  url: string;
  name?: string;
  assetType: "Image" | "Video" | "Audio";
  projectName?: string;
};

type GetAssetInput = {
  id: string;
  projectName?: string;
};

type VolcengineAssetApiMetadata = {
  requestId?: string;
  action?: string;
};

type CreateAssetGroupOutput = VolcengineAssetApiMetadata & {
  id: string;
};

type CreateAssetOutput = VolcengineAssetApiMetadata & {
  id: string;
};

type GetAssetOutput = VolcengineAssetApiMetadata & {
  id: string;
  name?: string;
  url?: string;
  assetType?: string;
  groupId?: string;
  status?: "Active" | "Processing" | "Failed";
  projectName?: string;
  error?: {
    code?: string;
    message?: string;
  };
  rawResponse: unknown;
};

type VolcenginePrivateAssetConfig = {
  accessKey: string;
  secretKey: string;
  baseUrl: string;
  host: string;
  region: string;
  service: string;
  projectName: string;
};

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function sha256Hex(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function encodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function formatXDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function buildCanonicalQuery(query: Record<string, string>) {
  return Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function buildAuthorizationHeader(params: {
  method: string;
  pathname: string;
  query: Record<string, string>;
  bodyText: string;
  host: string;
  accessKey: string;
  secretKey: string;
  region: string;
  service: string;
  now: Date;
}) {
  const xDate = formatXDate(params.now);
  const shortDate = xDate.slice(0, 8);
  const contentSha256 = sha256Hex(params.bodyText);
  const canonicalQuery = buildCanonicalQuery(params.query);
  const canonicalHeaders = [
    `content-type:${CONTENT_TYPE}`,
    `host:${params.host}`,
    `x-content-sha256:${contentSha256}`,
    `x-date:${xDate}`,
    "",
  ].join("\n");
  const canonicalRequest = [
    params.method.toUpperCase(),
    params.pathname,
    canonicalQuery,
    canonicalHeaders,
    SIGNED_HEADERS,
    contentSha256,
  ].join("\n");
  const credentialScope = `${shortDate}/${params.region}/${params.service}/request`;
  const stringToSign = ["HMAC-SHA256", xDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmacSha256(
    hmacSha256(hmacSha256(hmacSha256(Buffer.from(params.secretKey, "utf8"), shortDate), params.region), params.service),
    "request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = [
    "HMAC-SHA256",
    `Credential=${params.accessKey}/${credentialScope},`,
    `SignedHeaders=${SIGNED_HEADERS},`,
    `Signature=${signature}`,
  ].join(" ");

  return {
    authorization,
    xDate,
    contentSha256,
    canonicalRequest,
    stringToSign,
  };
}

function resolvePrivateAssetConfig(): VolcenginePrivateAssetConfig {
  const accessKey = env.volcengineArkAssetAccessKey;
  const secretKey = env.volcengineArkAssetSecretKey;
  const projectName = env.volcengineArkAssetProjectName;
  const baseUrlValue = env.volcengineArkAssetBaseUrl;

  if (!accessKey || !secretKey) {
    throw new ApiError(503, "VOLCENGINE_SYNC_CONFIG_MISSING", "缺少火山私域素材库 AK/SK 配置。");
  }

  if (!projectName) {
    throw new ApiError(503, "VOLCENGINE_SYNC_CONFIG_MISSING", "缺少火山私域素材库 ProjectName 配置。");
  }

  if (!baseUrlValue) {
    throw new ApiError(503, "VOLCENGINE_SYNC_CONFIG_MISSING", "缺少火山私域素材库 Base URL 配置。");
  }

  const baseUrl = new URL(baseUrlValue);

  return {
    accessKey,
    secretKey,
    baseUrl: baseUrl.origin,
    host: baseUrl.host,
    region: DEFAULT_REGION,
    service: DEFAULT_SERVICE,
    projectName,
  };
}

function extractProviderError(status: number, body: unknown) {
  const payload = toRecord(body);
  const responseMetadata = toRecord(payload?.ResponseMetadata);
  const metadataError = toRecord(responseMetadata?.Error);
  const payloadError = toRecord(payload?.error);
  const code = toString(metadataError?.Code) ?? toString(payloadError?.code) ?? toString(payload?.code);
  const message =
    toString(metadataError?.Message) ??
    toString(payloadError?.message) ??
    toString(payload?.message) ??
    `Volcengine private asset request failed with status ${status}.`;
  const requestId = toString(responseMetadata?.RequestId);

  return {
    code,
    message: requestId ? `${message} (request_id=${requestId})` : message,
    requestId,
  };
}

async function requestVolcenginePrivateAssetApi<ResultType>(action: string, body: Record<string, unknown>): Promise<{ result: ResultType; metadata: VolcengineAssetApiMetadata; rawResponse: unknown }> {
  const config = resolvePrivateAssetConfig();
  const now = new Date();
  const method = "POST";
  const pathname = "/";
  const query = {
    Action: action,
    Version: DEFAULT_VERSION,
  };
  const bodyText = JSON.stringify(body);
  const signature = buildAuthorizationHeader({
    method,
    pathname,
    query,
    bodyText,
    host: config.host,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
    region: config.region,
    service: config.service,
    now,
  });
  const url = `${config.baseUrl}/?${buildCanonicalQuery(query)}`;

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        authorization: signature.authorization,
        "content-type": CONTENT_TYPE,
        host: config.host,
        "x-content-sha256": signature.contentSha256,
        "x-date": signature.xDate,
      },
      body: bodyText,
    });
  } catch (error) {
    throw new ApiError(
      503,
      "VOLCENGINE_SYNC_REMOTE_FAILED",
      error instanceof Error ? error.message : "火山私域素材接口请求失败。",
    );
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const errorInfo = extractProviderError(response.status, payload);
  const responseMetadata = toRecord(toRecord(payload)?.ResponseMetadata);

  if (!response.ok) {
    throw new ApiError(502, "VOLCENGINE_SYNC_REMOTE_FAILED", errorInfo.message);
  }

  if (toRecord(responseMetadata?.Error)) {
    throw new ApiError(502, "VOLCENGINE_SYNC_REMOTE_FAILED", errorInfo.message);
  }

  const result = toRecord(toRecord(payload)?.Result);

  if (!result) {
    throw new ApiError(502, "VOLCENGINE_SYNC_REMOTE_FAILED", `火山 ${action} 响应缺少 Result。`);
  }

  return {
    result: result as ResultType,
    metadata: {
      requestId: toString(responseMetadata?.RequestId),
      action: toString(responseMetadata?.Action),
    },
    rawResponse: payload,
  };
}

export async function createVolcengineAssetGroup(input: CreateAssetGroupInput): Promise<CreateAssetGroupOutput> {
  const config = resolvePrivateAssetConfig();
  const { result, metadata } = await requestVolcenginePrivateAssetApi<{ Id?: unknown }>("CreateAssetGroup", {
    Name: input.name,
    Description: input.description,
    GroupType: DEFAULT_GROUP_TYPE,
    ProjectName: input.projectName ?? config.projectName,
  });
  const id = toString(result.Id);

  if (!id) {
    throw new ApiError(502, "VOLCENGINE_SYNC_REMOTE_FAILED", "火山 CreateAssetGroup 响应缺少素材组 ID。");
  }

  return {
    ...metadata,
    id,
  };
}

export async function createVolcengineAsset(input: CreateAssetInput): Promise<CreateAssetOutput> {
  const config = resolvePrivateAssetConfig();
  const { result, metadata } = await requestVolcenginePrivateAssetApi<{ Id?: unknown }>("CreateAsset", {
    GroupId: input.groupId,
    URL: input.url,
    Name: input.name,
    AssetType: input.assetType,
    ProjectName: input.projectName ?? config.projectName,
  });
  const id = toString(result.Id);

  if (!id) {
    throw new ApiError(502, "VOLCENGINE_SYNC_REMOTE_FAILED", "火山 CreateAsset 响应缺少素材 ID。");
  }

  return {
    ...metadata,
    id,
  };
}

export async function getVolcengineAsset(input: GetAssetInput): Promise<GetAssetOutput> {
  const config = resolvePrivateAssetConfig();
  const { result, metadata, rawResponse } = await requestVolcenginePrivateAssetApi<Record<string, unknown>>("GetAsset", {
    Id: input.id,
    ProjectName: input.projectName ?? config.projectName,
  });
  const errorRecord = toRecord(result.Error);

  return {
    ...metadata,
    id: toString(result.Id) ?? input.id,
    name: toString(result.Name),
    url: toString(result.URL),
    assetType: toString(result.AssetType),
    groupId: toString(result.GroupId),
    status: toString(result.Status) as GetAssetOutput["status"],
    projectName: toString(result.ProjectName),
    error: errorRecord
      ? {
          code: toString(errorRecord.Code),
          message: toString(errorRecord.Message),
        }
      : undefined,
    rawResponse,
  };
}

export const __volcenginePrivateAssetTestUtils = {
  buildAuthorizationHeader,
  buildCanonicalQuery,
  encodeRfc3986,
  formatXDate,
  sha256Hex,
};

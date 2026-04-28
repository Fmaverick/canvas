import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { requestArtsApiJson } from "@/infrastructure/ai/arts-api-client";

const DEFAULT_VERSION = "2024-01-01";
const DEFAULT_GROUP_TYPE = "AIGC";

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
  apiKey: string;
  baseUrl: string;
  projectName: string;
};

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function toString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveAssetBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/api\/v3\/?$/i, "/api").replace(/\/+$/, "");
}

function resolvePrivateAssetConfig(): VolcenginePrivateAssetConfig {
  const apiKey = env.artsApiKey;
  const projectName = env.artsAssetProjectName;
  const baseUrlValue = env.artsApiBaseUrl;

  if (!apiKey) {
    throw new ApiError(503, "VOLCENGINE_SYNC_CONFIG_MISSING", "缺少火山私域素材库 Bearer Key 配置。");
  }

  if (!projectName) {
    throw new ApiError(503, "VOLCENGINE_SYNC_CONFIG_MISSING", "缺少火山私域素材库 ProjectName 配置。");
  }

  if (!baseUrlValue) {
    throw new ApiError(503, "VOLCENGINE_SYNC_CONFIG_MISSING", "缺少火山私域素材库 Base URL 配置。");
  }

  return {
    apiKey,
    baseUrl: resolveAssetBaseUrl(baseUrlValue),
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
  const payload = await requestArtsApiJson({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    path: "",
    method: "POST",
    query: {
      Action: action,
      Version: DEFAULT_VERSION,
    },
    body,
    mapProviderError: (status, responseBody) => {
      const errorInfo = extractProviderError(status, responseBody);

      return new ApiError(502, "VOLCENGINE_SYNC_REMOTE_FAILED", errorInfo.message);
    },
    mapTransportError: (error) =>
      new ApiError(
        503,
        "VOLCENGINE_SYNC_REMOTE_FAILED",
        error instanceof Error ? error.message : "火山私域素材接口请求失败。",
      ),
  });
  const errorInfo = extractProviderError(200, payload);
  const responseMetadata = toRecord(toRecord(payload)?.ResponseMetadata);

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

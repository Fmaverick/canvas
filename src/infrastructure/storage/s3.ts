import { randomUUID } from "node:crypto";

import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

const storageConfig = {
  endpoint: env.storageEndpoint,
  bucket: env.storageBucket,
  accessKeyId: env.storageAccessKey,
  secretAccessKey: env.storageSecretKey,
  region: env.storageRegion,
  publicUrl: env.storagePublicUrl,
  forcePathStyle: env.storageForcePathStyle,
  presignExpiresSeconds: env.storagePresignExpiresSeconds,
};

function requireStorageConfig() {
  if (!storageConfig.endpoint) {
    throw new ApiError(500, "STORAGE_NOT_CONFIGURED", "Missing STORAGE_ENDPOINT.");
  }

  if (!storageConfig.bucket) {
    throw new ApiError(500, "STORAGE_NOT_CONFIGURED", "Missing STORAGE_BUCKET.");
  }

  if (!storageConfig.accessKeyId || !storageConfig.secretAccessKey) {
    throw new ApiError(500, "STORAGE_NOT_CONFIGURED", "Missing storage credentials.");
  }

  return {
    endpoint: storageConfig.endpoint,
    bucket: storageConfig.bucket,
    accessKeyId: storageConfig.accessKeyId,
    secretAccessKey: storageConfig.secretAccessKey,
    region: storageConfig.region,
    publicUrl: storageConfig.publicUrl,
    forcePathStyle: storageConfig.forcePathStyle,
    presignExpiresSeconds: storageConfig.presignExpiresSeconds,
  };
}

function createClient() {
  const config = requireStorageConfig();

  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

function sanitizeFileName(fileName: string) {
  return fileName
    .trim()
    .normalize("NFKC")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function normalizeKeySegment(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function buildPublicUrl(storageKey: string) {
  const config = requireStorageConfig();
  const normalizedKey = storageKey.split("/").map(encodeURIComponent).join("/");

  if (config.publicUrl) {
    const baseUrl = config.publicUrl.replace(/\/+$/g, "");
    return `${baseUrl}/${normalizedKey}`;
  }

  const endpointUrl = new URL(config.endpoint);
  const basePath = endpointUrl.pathname.replace(/\/+$/g, "");

  if (config.forcePathStyle) {
    return `${endpointUrl.origin}${basePath}/${encodeURIComponent(config.bucket)}/${normalizedKey}`;
  }

  return `${endpointUrl.protocol}//${encodeURIComponent(config.bucket)}.${endpointUrl.host}${basePath}/${normalizedKey}`;
}

export function createStorageKey(params: {
  workspaceId: string;
  ownerType: string;
  ownerId: string;
  fileName: string;
}) {
  const safeFileName = sanitizeFileName(params.fileName) || "file";
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return [
    normalizeKeySegment(params.workspaceId),
    normalizeKeySegment(params.ownerType),
    normalizeKeySegment(params.ownerId),
    year,
    month,
    `${randomUUID()}-${safeFileName}`,
  ].join("/");
}

export async function createPresignedUploadUrl(params: {
  storageKey: string;
  mimeType: string;
}) {
  const config = requireStorageConfig();
  const client = createClient();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: params.storageKey,
    ContentType: params.mimeType,
  });
  const url = await getSignedUrl(client, command, {
    expiresIn: config.presignExpiresSeconds,
  });

  return {
    bucket: config.bucket,
    storageKey: params.storageKey,
    uploadUrl: url,
    publicUrl: buildPublicUrl(params.storageKey),
    expiresIn: config.presignExpiresSeconds,
    method: "PUT" as const,
    headers: {
      "content-type": params.mimeType,
    },
  };
}

export async function getStoredObjectMetadata(storageKey: string) {
  const config = requireStorageConfig();
  const client = createClient();
  const result = await client.send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: storageKey,
    }),
  );

  return {
    storageKey,
    fileUrl: buildPublicUrl(storageKey),
    fileSize: result.ContentLength ?? null,
    mimeType: result.ContentType ?? null,
    eTag: result.ETag?.replaceAll('"', "") ?? null,
    lastModified: result.LastModified ?? null,
  };
}

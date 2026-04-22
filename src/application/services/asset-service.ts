import { randomUUID } from "node:crypto";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { assets } from "@/infrastructure/db/schema";
import {
  createClient,
  createPresignedUploadUrl,
  createStorageKey,
  deleteStoredObject,
  getStoredObjectMetadata,
  getPublicUrlForStorageKey,
} from "@/infrastructure/storage/s3";
import { detectImageDimensions } from "@/lib/image-dimensions";
import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";

const ownerTypeSchema = z.enum([
  "product",
  "model_profile",
  "library_item",
  "instruction_preset",
  "canvas_node",
  "task_result",
]);
const assetTypeSchema = z.enum(["image", "video", "audio", "document"]);
export const volcengineSyncStatusSchema = z.enum(["not_synced", "processing", "active", "failed", "skipped"]);
export type VolcengineSyncStatus = z.infer<typeof volcengineSyncStatusSchema>;
export type AssetRow = Omit<typeof assets.$inferSelect, "volcengineSyncStatus"> & {
  volcengineSyncStatus: VolcengineSyncStatus;
};
export type SerializedAssetRow = AssetRow & {
  volcengineSync: ReturnType<typeof buildVolcengineSyncSummary>;
};

const uploadMetaSchema = z.record(z.string(), z.unknown()).default({});
const assetOwnerInputSchema = z.object({
  workspaceId: z.uuid(),
  ownerType: ownerTypeSchema,
  ownerId: z.uuid(),
});
const assetOwnersInputSchema = z.object({
  workspaceId: z.uuid(),
  ownerType: ownerTypeSchema,
  ownerIds: z.array(z.uuid()).default([]),
});
const deleteAssetInputSchema = z.object({
  workspaceId: z.uuid(),
  assetId: z.uuid(),
  ownerType: ownerTypeSchema.optional(),
  ownerId: z.uuid().optional(),
});
export const updateAssetVolcengineSyncStateInputSchema = z.object({
  workspaceId: z.uuid(),
  assetId: z.uuid(),
  volcengineAssetId: z.string().trim().nullable().optional(),
  volcengineAssetGroupId: z.string().trim().nullable().optional(),
  volcengineProjectName: z.string().trim().nullable().optional(),
  volcengineSyncStatus: volcengineSyncStatusSchema,
  volcengineLastSyncedAt: z.date().nullable().optional(),
  volcengineLastSyncErrorCode: z.string().trim().nullable().optional(),
  volcengineLastSyncError: z.string().trim().nullable().optional(),
});

export const createUploadTicketInputSchema = z.object({
  workspaceId: z.uuid(),
  fileName: z.string().trim().min(1, "File name is required."),
  mimeType: z.string().trim().min(1, "MIME type is required."),
  ownerType: ownerTypeSchema,
  ownerId: z.uuid(),
});

export const completeUploadInputSchema = z.object({
  workspaceId: z.uuid(),
  fileName: z.string().trim().min(1, "File name is required."),
  mimeType: z.string().trim().min(1, "MIME type is required."),
  ownerType: ownerTypeSchema,
  ownerId: z.uuid(),
  storageKey: z.string().trim().min(1, "Storage key is required."),
  fileSize: z.coerce.number().int().positive().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  durationMs: z.coerce.number().int().positive().optional(),
  checksum: z.string().trim().optional(),
  meta: uploadMetaSchema,
});

export const createGeneratedAssetInputSchema = z.object({
  workspaceId: z.uuid(),
  ownerType: ownerTypeSchema,
  ownerId: z.uuid(),
  fileName: z.string().trim().min(1, "File name is required."),
  sourceUrl: z.string().trim().optional(),
  dataUri: z.string().trim().optional(),
  mimeType: z.string().trim().optional(),
  width: z.coerce.number().int().positive().optional(),
  height: z.coerce.number().int().positive().optional(),
  meta: uploadMetaSchema,
});

function inferAssetType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();

  if (normalized.startsWith("image/")) {
    return assetTypeSchema.enum.image;
  }

  if (normalized.startsWith("video/")) {
    return assetTypeSchema.enum.video;
  }

  if (normalized.startsWith("audio/")) {
    return assetTypeSchema.enum.audio;
  }

  return assetTypeSchema.enum.document;
}

async function findAssetByStorageKey(workspaceId: string, storageKey: string) {
  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.workspaceId, workspaceId), eq(assets.storageKey, storageKey)))
    .limit(1);

  return asset ?? null;
}

async function findAssetById(workspaceId: string, assetId: string) {
  const [asset] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.workspaceId, workspaceId), eq(assets.id, assetId)))
    .limit(1);

  return asset ?? null;
}

function normalizeAssetRow(asset: typeof assets.$inferSelect): AssetRow {
  return {
    ...asset,
    volcengineSyncStatus: volcengineSyncStatusSchema.parse(asset.volcengineSyncStatus),
  };
}

function buildVolcengineSyncSummary(asset: AssetRow) {
  return {
    sync_status: asset.volcengineSyncStatus,
    volcengine_asset_id: asset.volcengineAssetId,
    volcengine_asset_group_id: asset.volcengineAssetGroupId,
    volcengine_project_name: asset.volcengineProjectName,
    last_synced_at: asset.volcengineLastSyncedAt,
    last_sync_error_code: asset.volcengineLastSyncErrorCode,
    last_sync_error: asset.volcengineLastSyncError,
  };
}

function serializeAsset(asset: typeof assets.$inferSelect): SerializedAssetRow {
  const normalizedAsset = normalizeAssetRow(asset);

  return {
    ...normalizedAsset,
    volcengineSync: buildVolcengineSyncSummary(normalizedAsset),
  };
}

export async function listAssetsByOwner(input: z.infer<typeof assetOwnerInputSchema>) {
  const parsed = assetOwnerInputSchema.parse(input);

  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.workspaceId, parsed.workspaceId), eq(assets.ownerType, parsed.ownerType), eq(assets.ownerId, parsed.ownerId)))
    .orderBy(asc(assets.createdAt));

  return rows.map(serializeAsset);
}

export async function listAssetsByOwners(input: z.infer<typeof assetOwnersInputSchema>) {
  const parsed = assetOwnersInputSchema.parse(input);

  if (parsed.ownerIds.length === 0) {
    return [];
  }

  const rows = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.workspaceId, parsed.workspaceId),
        eq(assets.ownerType, parsed.ownerType),
        inArray(assets.ownerId, parsed.ownerIds),
      ),
    )
    .orderBy(asc(assets.createdAt));

  return rows.map(serializeAsset);
}

export async function createUploadTicket(input: z.infer<typeof createUploadTicketInputSchema>) {
  const parsed = createUploadTicketInputSchema.parse(input);
  const storageKey = createStorageKey({
    workspaceId: parsed.workspaceId,
    ownerType: parsed.ownerType,
    ownerId: parsed.ownerId,
    fileName: parsed.fileName,
  });
  const presignedUpload = await createPresignedUploadUrl({
    storageKey,
    mimeType: parsed.mimeType,
  });

  return {
    ownerType: parsed.ownerType,
    ownerId: parsed.ownerId,
    assetType: inferAssetType(parsed.mimeType),
    fileName: parsed.fileName,
    mimeType: parsed.mimeType,
    ...presignedUpload,
  };
}

export async function completeUpload(input: z.infer<typeof completeUploadInputSchema>) {
  const parsed = completeUploadInputSchema.parse(input);
  const existingAsset = await findAssetByStorageKey(parsed.workspaceId, parsed.storageKey);

  if (existingAsset) {
    return existingAsset;
  }

  let storedObject: Awaited<ReturnType<typeof getStoredObjectMetadata>>;

  try {
    storedObject = await getStoredObjectMetadata(parsed.storageKey);
  } catch {
    throw new ApiError(404, "UPLOADED_FILE_NOT_FOUND", "Uploaded file not found in object storage.");
  }

  if (parsed.fileSize && storedObject.fileSize && parsed.fileSize !== storedObject.fileSize) {
    throw new ApiError(409, "UPLOAD_SIZE_MISMATCH", "Uploaded file size does not match the stored object.");
  }

  const finalMimeType = storedObject.mimeType ?? parsed.mimeType;
  const [asset] = await db
    .insert(assets)
    .values({
      workspaceId: parsed.workspaceId,
      ownerType: parsed.ownerType,
      ownerId: parsed.ownerId,
      assetType: inferAssetType(finalMimeType),
      fileName: parsed.fileName,
      mimeType: finalMimeType,
      storageKey: parsed.storageKey,
      fileUrl: storedObject.fileUrl,
      fileSize: storedObject.fileSize ?? parsed.fileSize ?? null,
      width: parsed.width ?? null,
      height: parsed.height ?? null,
      durationMs: parsed.durationMs ?? null,
      checksum: parsed.checksum ?? storedObject.eTag,
      meta: parsed.meta,
    })
    .returning();

  return asset;
}

function parseDataUri(dataUri: string) {
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new ApiError(400, "INVALID_DATA_URI", "Unsupported generated image data URI.");
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function inferExtensionFromMimeType(mimeType: string) {
  const normalized = mimeType.trim().toLowerCase();

  if (normalized === "image/png") {
    return "png";
  }

  if (normalized === "image/webp") {
    return "webp";
  }

  if (normalized === "image/gif") {
    return "gif";
  }

  return "jpg";
}

async function uploadGeneratedAssetToStorage(params: {
  workspaceId: string;
  ownerType: z.infer<typeof ownerTypeSchema>;
  ownerId: string;
  fileName: string;
  mimeType?: string;
  sourceUrl?: string;
  dataUri?: string;
}) {
  let fileBuffer: Buffer;
  let mimeType = params.mimeType?.trim();

  if (params.dataUri) {
    const parsed = parseDataUri(params.dataUri);
    fileBuffer = parsed.buffer;
    mimeType = mimeType || parsed.mimeType;
  } else if (params.sourceUrl) {
    const response = await fetch(params.sourceUrl);

    if (!response.ok) {
      throw new ApiError(502, "GENERATED_IMAGE_FETCH_FAILED", "生成图片拉取失败。");
    }

    const arrayBuffer = await response.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
    mimeType = mimeType || response.headers.get("content-type") || "image/png";
  } else {
    throw new ApiError(400, "GENERATED_IMAGE_SOURCE_REQUIRED", "缺少生成图片来源。");
  }

  const resolvedMimeType = mimeType || "image/png";
  const extension = inferExtensionFromMimeType(resolvedMimeType);
  const storageKey = createStorageKey({
    workspaceId: params.workspaceId,
    ownerType: params.ownerType,
    ownerId: params.ownerId,
    fileName: `${params.fileName}.${extension}`,
  });
  const client = createClient();

  await client.send(
    new PutObjectCommand({
      Bucket: env.storageBucket,
      Key: storageKey,
      Body: fileBuffer,
      ContentType: resolvedMimeType,
    }),
  );

  return {
    storageKey,
    fileUrl: getPublicUrlForStorageKey(storageKey),
    fileSize: fileBuffer.byteLength,
    mimeType: resolvedMimeType,
    ...detectImageDimensions(fileBuffer, resolvedMimeType),
  };
}

export async function createGeneratedAsset(input: z.infer<typeof createGeneratedAssetInputSchema>) {
  const parsed = createGeneratedAssetInputSchema.parse(input);
  const uploadResult = await uploadGeneratedAssetToStorage({
    workspaceId: parsed.workspaceId,
    ownerType: parsed.ownerType,
    ownerId: parsed.ownerId,
    fileName: parsed.fileName || `generated-${randomUUID()}`,
    sourceUrl: parsed.sourceUrl,
    dataUri: parsed.dataUri,
    mimeType: parsed.mimeType,
  });

  const [asset] = await db
    .insert(assets)
    .values({
      workspaceId: parsed.workspaceId,
      ownerType: parsed.ownerType,
      ownerId: parsed.ownerId,
      assetType: "image",
      fileName: parsed.fileName,
      mimeType: uploadResult.mimeType,
      storageKey: uploadResult.storageKey,
      fileUrl: uploadResult.fileUrl,
      fileSize: uploadResult.fileSize,
      width: parsed.width ?? uploadResult.width ?? null,
      height: parsed.height ?? uploadResult.height ?? null,
      durationMs: null,
      checksum: null,
      meta: parsed.meta,
    })
    .returning();

  return asset;
}

export async function deleteAsset(input: z.infer<typeof deleteAssetInputSchema>) {
  const parsed = deleteAssetInputSchema.parse(input);
  const existingAsset = await findAssetById(parsed.workspaceId, parsed.assetId);

  if (!existingAsset) {
    throw new ApiError(404, "ASSET_NOT_FOUND", "资源不存在。");
  }

  if (parsed.ownerType && existingAsset.ownerType !== parsed.ownerType) {
    throw new ApiError(403, "ASSET_OWNER_MISMATCH", "资源归属不匹配。");
  }

  if (parsed.ownerId && existingAsset.ownerId !== parsed.ownerId) {
    throw new ApiError(403, "ASSET_OWNER_MISMATCH", "资源归属不匹配。");
  }

  await db.delete(assets).where(and(eq(assets.workspaceId, parsed.workspaceId), eq(assets.id, parsed.assetId)));

  try {
    await deleteStoredObject(existingAsset.storageKey);
  } catch {
    return existingAsset;
  }

  return existingAsset;
}

export async function getAssetById(input: { workspaceId: string; assetId: string }) {
  const asset = await findAssetById(input.workspaceId, input.assetId);

  if (!asset) {
    throw new ApiError(404, "ASSET_NOT_FOUND", "资源不存在。");
  }

  return serializeAsset(asset);
}

export async function updateAssetVolcengineSyncState(input: z.infer<typeof updateAssetVolcengineSyncStateInputSchema>) {
  const parsed = updateAssetVolcengineSyncStateInputSchema.parse(input);
  const existingAsset = await findAssetById(parsed.workspaceId, parsed.assetId);

  if (!existingAsset) {
    throw new ApiError(404, "ASSET_NOT_FOUND", "资源不存在。");
  }

  const [asset] = await db
    .update(assets)
    .set({
      volcengineAssetId: parsed.volcengineAssetId === undefined ? undefined : parsed.volcengineAssetId,
      volcengineAssetGroupId: parsed.volcengineAssetGroupId === undefined ? undefined : parsed.volcengineAssetGroupId,
      volcengineProjectName: parsed.volcengineProjectName === undefined ? undefined : parsed.volcengineProjectName,
      volcengineSyncStatus: parsed.volcengineSyncStatus,
      volcengineLastSyncedAt:
        parsed.volcengineLastSyncedAt === undefined ? undefined : parsed.volcengineLastSyncedAt,
      volcengineLastSyncErrorCode:
        parsed.volcengineLastSyncErrorCode === undefined ? undefined : parsed.volcengineLastSyncErrorCode,
      volcengineLastSyncError: parsed.volcengineLastSyncError === undefined ? undefined : parsed.volcengineLastSyncError,
    })
    .where(and(eq(assets.workspaceId, parsed.workspaceId), eq(assets.id, parsed.assetId)))
    .returning();

  return serializeAsset(asset);
}

export async function listAssetRowsByOwner(input: z.infer<typeof assetOwnerInputSchema>) {
  const parsed = assetOwnerInputSchema.parse(input);

  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.workspaceId, parsed.workspaceId), eq(assets.ownerType, parsed.ownerType), eq(assets.ownerId, parsed.ownerId)))
    .orderBy(asc(assets.createdAt));

  return rows.map(normalizeAssetRow);
}

export function getVolcengineSyncSummaryFromAssetRow(asset: typeof assets.$inferSelect) {
  return buildVolcengineSyncSummary(normalizeAssetRow(asset));
}

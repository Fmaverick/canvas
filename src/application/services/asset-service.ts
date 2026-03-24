import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { assets } from "@/infrastructure/db/schema";
import {
  createPresignedUploadUrl,
  createStorageKey,
  getStoredObjectMetadata,
} from "@/infrastructure/storage/s3";
import { ApiError } from "@/lib/api";

const ownerTypeSchema = z.enum(["product", "model_profile", "canvas_node", "task_result"]);
const assetTypeSchema = z.enum(["image", "video", "audio", "document"]);

const uploadMetaSchema = z.record(z.string(), z.unknown()).default({});

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

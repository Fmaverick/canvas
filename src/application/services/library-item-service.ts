import { and, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { assets, libraryItems } from "@/infrastructure/db/schema";
import { ApiError } from "@/lib/api";

const metadataSchema = z.record(z.string(), z.unknown());

export const libraryItemKindSchema = z.enum(["subject", "scene"]);

export const listLibraryItemsInputSchema = z.object({
  workspaceId: z.uuid(),
  kind: libraryItemKindSchema,
  keyword: z.string().trim().optional(),
  tag: z.string().trim().optional(),
  entityType: z.string().trim().optional(),
});

export const createLibraryItemInputSchema = z.object({
  workspaceId: z.uuid(),
  createdBy: z.uuid(),
  kind: libraryItemKindSchema,
  entityType: z.string().trim().optional(),
  name: z.string().min(1, "名称不能为空。"),
  description: z.string().trim().optional(),
  coverAssetId: z.uuid().optional(),
  promptHints: z.string().trim().optional(),
  profileMeta: metadataSchema.default({}),
  tags: z.array(z.string().trim()).default([]),
});

export const updateLibraryItemInputSchema = z.object({
  workspaceId: z.uuid(),
  itemId: z.uuid(),
  entityType: z.string().trim().nullable().optional(),
  name: z.string().min(1, "名称不能为空。").optional(),
  description: z.string().trim().nullable().optional(),
  coverAssetId: z.uuid().nullable().optional(),
  promptHints: z.string().trim().nullable().optional(),
  profileMeta: metadataSchema.optional(),
  tags: z.array(z.string().trim()).optional(),
});

export const deleteLibraryItemInputSchema = z.object({
  workspaceId: z.uuid(),
  itemId: z.uuid(),
});

export const updateLibraryItemVolcengineBindingInputSchema = z.object({
  workspaceId: z.uuid(),
  itemId: z.uuid(),
  volcengineAssetGroupId: z.string().trim().nullable().optional(),
  volcengineProjectName: z.string().trim().nullable().optional(),
});

async function assertLibraryItemExists(workspaceId: string, itemId: string) {
  const [item] = await db
    .select({
      id: libraryItems.id,
    })
    .from(libraryItems)
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.workspaceId, workspaceId)))
    .limit(1);

  if (!item) {
    throw new ApiError(404, "LIBRARY_ITEM_NOT_FOUND", "资源不存在。");
  }

  return item;
}

function libraryItemSelectShape() {
  return {
    id: libraryItems.id,
    workspaceId: libraryItems.workspaceId,
    kind: libraryItems.kind,
    entityType: libraryItems.entityType,
    name: libraryItems.name,
    description: libraryItems.description,
    coverAssetId: libraryItems.coverAssetId,
    coverAssetUrl: assets.fileUrl,
    promptHints: libraryItems.promptHints,
    profileMeta: libraryItems.profileMeta,
    tags: libraryItems.tags,
    volcengineAssetGroupId: libraryItems.volcengineAssetGroupId,
    volcengineProjectName: libraryItems.volcengineProjectName,
    status: libraryItems.status,
    createdBy: libraryItems.createdBy,
    createdAt: libraryItems.createdAt,
    updatedAt: libraryItems.updatedAt,
  };
}

type LibraryItemRow = {
  id: string;
  workspaceId: string;
  kind: string;
  entityType: string | null;
  name: string;
  description: string | null;
  coverAssetId: string | null;
  coverAssetUrl: string | null;
  promptHints: string | null;
  profileMeta: Record<string, unknown>;
  tags: string[];
  volcengineAssetGroupId: string | null;
  volcengineProjectName: string | null;
  status: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function serializeLibraryItem(item: LibraryItemRow) {
  return {
    ...item,
    volcengineSync: {
      volcengine_asset_group_id: item.volcengineAssetGroupId,
      volcengine_project_name: item.volcengineProjectName,
    },
  };
}

export async function getLibraryItemById(workspaceId: string, itemId: string) {
  const [item] = await db
    .select(libraryItemSelectShape())
    .from(libraryItems)
    .leftJoin(assets, eq(assets.id, libraryItems.coverAssetId))
    .where(and(eq(libraryItems.id, itemId), eq(libraryItems.workspaceId, workspaceId)))
    .limit(1);

  if (!item) {
    throw new ApiError(404, "LIBRARY_ITEM_NOT_FOUND", "资源不存在。");
  }

  return serializeLibraryItem(item);
}

export async function listLibraryItems(input: z.infer<typeof listLibraryItemsInputSchema>) {
  const parsed = listLibraryItemsInputSchema.parse(input);

  const rows = await db
    .select(libraryItemSelectShape())
    .from(libraryItems)
    .leftJoin(assets, eq(assets.id, libraryItems.coverAssetId))
    .where(
      and(
        eq(libraryItems.workspaceId, parsed.workspaceId),
        eq(libraryItems.kind, parsed.kind),
        eq(libraryItems.status, "active"),
        parsed.keyword ? ilike(libraryItems.name, `%${parsed.keyword}%`) : undefined,
        parsed.entityType ? eq(libraryItems.entityType, parsed.entityType) : undefined,
      ),
    )
    .orderBy(desc(libraryItems.updatedAt));

  if (!parsed.tag) {
    return rows.map(serializeLibraryItem);
  }

  const tag = parsed.tag;

  return rows.filter((item) => item.tags.includes(tag)).map(serializeLibraryItem);
}

export async function createLibraryItem(input: z.infer<typeof createLibraryItemInputSchema>) {
  const parsed = createLibraryItemInputSchema.parse(input);

  const [createdItem] = await db
    .insert(libraryItems)
    .values({
      workspaceId: parsed.workspaceId,
      createdBy: parsed.createdBy,
      kind: parsed.kind,
      entityType: parsed.entityType,
      name: parsed.name,
      description: parsed.description,
      coverAssetId: parsed.coverAssetId,
      promptHints: parsed.promptHints,
      profileMeta: parsed.profileMeta,
      tags: parsed.tags,
      status: "active",
    })
    .returning();

  return getLibraryItemById(parsed.workspaceId, createdItem.id);
}

export async function updateLibraryItem(input: z.infer<typeof updateLibraryItemInputSchema>) {
  const parsed = updateLibraryItemInputSchema.parse(input);
  await assertLibraryItemExists(parsed.workspaceId, parsed.itemId);

  await db
    .update(libraryItems)
    .set({
      entityType: parsed.entityType === undefined ? undefined : parsed.entityType,
      name: parsed.name,
      description: parsed.description === undefined ? undefined : parsed.description,
      coverAssetId: parsed.coverAssetId === undefined ? undefined : parsed.coverAssetId,
      promptHints: parsed.promptHints === undefined ? undefined : parsed.promptHints,
      profileMeta: parsed.profileMeta,
      tags: parsed.tags,
      updatedAt: new Date(),
    })
    .where(and(eq(libraryItems.id, parsed.itemId), eq(libraryItems.workspaceId, parsed.workspaceId)))
    .returning();

  return getLibraryItemById(parsed.workspaceId, parsed.itemId);
}

export async function deleteLibraryItem(input: z.infer<typeof deleteLibraryItemInputSchema>) {
  const parsed = deleteLibraryItemInputSchema.parse(input);
  await assertLibraryItemExists(parsed.workspaceId, parsed.itemId);

  const [item] = await db
    .delete(libraryItems)
    .where(and(eq(libraryItems.id, parsed.itemId), eq(libraryItems.workspaceId, parsed.workspaceId)))
    .returning();

  return item;
}

export async function updateLibraryItemVolcengineBinding(input: z.infer<typeof updateLibraryItemVolcengineBindingInputSchema>) {
  const parsed = updateLibraryItemVolcengineBindingInputSchema.parse(input);
  await assertLibraryItemExists(parsed.workspaceId, parsed.itemId);

  await db
    .update(libraryItems)
    .set({
      volcengineAssetGroupId:
        parsed.volcengineAssetGroupId === undefined ? undefined : parsed.volcengineAssetGroupId,
      volcengineProjectName: parsed.volcengineProjectName === undefined ? undefined : parsed.volcengineProjectName,
      updatedAt: new Date(),
    })
    .where(and(eq(libraryItems.id, parsed.itemId), eq(libraryItems.workspaceId, parsed.workspaceId)));

  return getLibraryItemById(parsed.workspaceId, parsed.itemId);
}

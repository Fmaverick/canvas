import { and, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { libraryItems } from "@/infrastructure/db/schema";

const metadataSchema = z.record(z.string(), z.unknown());

export const libraryItemKindSchema = z.enum(["subject", "scene"]);

export const listLibraryItemsInputSchema = z.object({
  workspaceId: z.uuid(),
  kind: libraryItemKindSchema,
  keyword: z.string().trim().optional(),
  tag: z.string().trim().optional(),
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

export async function listLibraryItems(input: z.infer<typeof listLibraryItemsInputSchema>) {
  const parsed = listLibraryItemsInputSchema.parse(input);

  const rows = await db
    .select()
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.workspaceId, parsed.workspaceId),
        eq(libraryItems.kind, parsed.kind),
        parsed.keyword ? ilike(libraryItems.name, `%${parsed.keyword}%`) : undefined,
      ),
    )
    .orderBy(desc(libraryItems.updatedAt));

  if (!parsed.tag) {
    return rows;
  }

  const tag = parsed.tag;

  return rows.filter((item) => item.tags.includes(tag));
}

export async function createLibraryItem(input: z.infer<typeof createLibraryItemInputSchema>) {
  const parsed = createLibraryItemInputSchema.parse(input);

  const [item] = await db
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

  return item;
}

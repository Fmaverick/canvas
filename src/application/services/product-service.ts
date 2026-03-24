import { and, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { products } from "@/infrastructure/db/schema";

const metadataSchema = z.record(z.string(), z.unknown());

export const listProductsInputSchema = z.object({
  workspaceId: z.uuid(),
  keyword: z.string().trim().optional(),
  tag: z.string().trim().optional(),
});

export const createProductInputSchema = z.object({
  workspaceId: z.uuid(),
  createdBy: z.uuid(),
  name: z.string().min(1, "Product name is required."),
  sku: z.string().trim().optional(),
  description: z.string().trim().optional(),
  category: z.string().trim().optional(),
  tags: z.array(z.string().trim()).default([]),
  styleMeta: metadataSchema.default({}),
  brandTone: z.string().trim().optional(),
  channelMeta: metadataSchema.default({}),
});

export async function listProducts(input: z.infer<typeof listProductsInputSchema>) {
  const parsed = listProductsInputSchema.parse(input);

  const rows = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.workspaceId, parsed.workspaceId),
        parsed.keyword ? ilike(products.name, `%${parsed.keyword}%`) : undefined,
      ),
    )
    .orderBy(desc(products.updatedAt));

  if (!parsed.tag) {
    return rows;
  }

  const tag = parsed.tag;

  return rows.filter((product) => product.tags.includes(tag));
}

export async function createProduct(input: z.infer<typeof createProductInputSchema>) {
  const parsed = createProductInputSchema.parse(input);

  const [product] = await db
    .insert(products)
    .values({
      workspaceId: parsed.workspaceId,
      createdBy: parsed.createdBy,
      name: parsed.name,
      sku: parsed.sku,
      description: parsed.description,
      category: parsed.category,
      tags: parsed.tags,
      styleMeta: parsed.styleMeta,
      brandTone: parsed.brandTone,
      channelMeta: parsed.channelMeta,
      status: "active",
    })
    .returning();

  return product;
}

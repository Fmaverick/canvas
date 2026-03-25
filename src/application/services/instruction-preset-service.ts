import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { instructionPresets } from "@/infrastructure/db/schema";

const metadataSchema = z.record(z.string(), z.unknown());

export const instructionPresetScopeSchema = z.enum(["personal", "workspace", "system"]);

export const listInstructionPresetsInputSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
});

export const createInstructionPresetInputSchema = z.object({
  workspaceId: z.uuid(),
  createdBy: z.uuid(),
  scope: instructionPresetScopeSchema,
  name: z.string().min(1, "名称不能为空。"),
  description: z.string().trim().optional(),
  promptTemplate: z.string().min(1, "预制 prompt 不能为空。"),
  negativePrompt: z.string().trim().optional(),
  variableSchema: metadataSchema.default({}),
  tags: z.array(z.string().trim()).default([]),
  isPublic: z.boolean().optional(),
});

export async function listInstructionPresets(input: z.infer<typeof listInstructionPresetsInputSchema>) {
  const parsed = listInstructionPresetsInputSchema.parse(input);

  return db
    .select()
    .from(instructionPresets)
    .where(
      and(
        eq(instructionPresets.status, "active"),
        or(
          and(
            eq(instructionPresets.scope, "workspace"),
            eq(instructionPresets.workspaceId, parsed.workspaceId),
          ),
          and(eq(instructionPresets.scope, "personal"), eq(instructionPresets.createdBy, parsed.userId)),
        ),
      ),
    )
    .orderBy(desc(instructionPresets.updatedAt));
}

export async function createInstructionPreset(input: z.infer<typeof createInstructionPresetInputSchema>) {
  const parsed = createInstructionPresetInputSchema.parse(input);

  const [preset] = await db
    .insert(instructionPresets)
    .values({
      workspaceId: parsed.scope === "workspace" ? parsed.workspaceId : null,
      createdBy: parsed.createdBy,
      scope: parsed.scope,
      name: parsed.name,
      description: parsed.description,
      promptTemplate: parsed.promptTemplate,
      negativePrompt: parsed.negativePrompt,
      variableSchema: parsed.variableSchema,
      tags: parsed.tags,
      isPublic: parsed.isPublic ?? parsed.scope === "workspace",
      status: "active",
    })
    .returning();

  return preset;
}

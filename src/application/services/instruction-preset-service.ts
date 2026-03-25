import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { instructionPresets } from "@/infrastructure/db/schema";
import { ApiError } from "@/lib/api";

const metadataSchema = z.record(z.string(), z.unknown());

export const instructionPresetScopeSchema = z.enum(["personal", "workspace", "system"]);
export const editableInstructionPresetScopeSchema = z.enum(["personal", "workspace"]);

export const listInstructionPresetsInputSchema = z.object({
  workspaceId: z.uuid(),
  userId: z.uuid(),
});

export const createInstructionPresetInputSchema = z.object({
  workspaceId: z.uuid(),
  createdBy: z.uuid(),
  scope: editableInstructionPresetScopeSchema,
  name: z.string().min(1, "名称不能为空。"),
  description: z.string().trim().optional(),
  promptTemplate: z.string().min(1, "预制 prompt 不能为空。"),
  negativePrompt: z.string().trim().optional(),
  variableSchema: metadataSchema.default({}),
  tags: z.array(z.string().trim()).default([]),
  isPublic: z.boolean().optional(),
});

export const updateInstructionPresetInputSchema = z.object({
  workspaceId: z.uuid(),
  actorUserId: z.uuid(),
  presetId: z.uuid(),
  scope: editableInstructionPresetScopeSchema.optional(),
  name: z.string().min(1, "名称不能为空。").optional(),
  description: z.string().trim().nullable().optional(),
  promptTemplate: z.string().min(1, "预制 prompt 不能为空。").optional(),
  negativePrompt: z.string().trim().nullable().optional(),
  variableSchema: metadataSchema.optional(),
  tags: z.array(z.string().trim()).optional(),
  isPublic: z.boolean().optional(),
});

export const deleteInstructionPresetInputSchema = z.object({
  workspaceId: z.uuid(),
  actorUserId: z.uuid(),
  presetId: z.uuid(),
});

async function assertInstructionPresetExists(workspaceId: string, actorUserId: string, presetId: string) {
  const [preset] = await db
    .select({
      id: instructionPresets.id,
      workspaceId: instructionPresets.workspaceId,
      scope: instructionPresets.scope,
      createdBy: instructionPresets.createdBy,
    })
    .from(instructionPresets)
    .where(eq(instructionPresets.id, presetId))
    .limit(1);

  if (!preset) {
    throw new ApiError(404, "INSTRUCTION_PRESET_NOT_FOUND", "指令不存在。");
  }

  const canAccessWorkspacePreset = preset.scope === "workspace" && preset.workspaceId === workspaceId;
  const canAccessPersonalPreset = preset.scope === "personal" && preset.createdBy === actorUserId;

  if (!canAccessWorkspacePreset && !canAccessPersonalPreset) {
    throw new ApiError(404, "INSTRUCTION_PRESET_NOT_FOUND", "指令不存在。");
  }

  return preset;
}

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

export async function updateInstructionPreset(input: z.infer<typeof updateInstructionPresetInputSchema>) {
  const parsed = updateInstructionPresetInputSchema.parse(input);
  const existingPreset = await assertInstructionPresetExists(parsed.workspaceId, parsed.actorUserId, parsed.presetId);

  const [preset] = await db
    .update(instructionPresets)
    .set({
      workspaceId:
        parsed.scope === undefined
          ? undefined
          : parsed.scope === "workspace"
            ? parsed.workspaceId
            : null,
      scope: parsed.scope,
      name: parsed.name,
      description: parsed.description === undefined ? undefined : parsed.description,
      promptTemplate: parsed.promptTemplate,
      negativePrompt: parsed.negativePrompt === undefined ? undefined : parsed.negativePrompt,
      variableSchema: parsed.variableSchema,
      tags: parsed.tags,
      isPublic: parsed.isPublic,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(instructionPresets.id, parsed.presetId),
        existingPreset.scope === "workspace"
          ? eq(instructionPresets.workspaceId, parsed.workspaceId)
          : and(isNull(instructionPresets.workspaceId), eq(instructionPresets.createdBy, parsed.actorUserId)),
      ),
    )
    .returning();

  return preset;
}

export async function deleteInstructionPreset(input: z.infer<typeof deleteInstructionPresetInputSchema>) {
  const parsed = deleteInstructionPresetInputSchema.parse(input);
  const existingPreset = await assertInstructionPresetExists(parsed.workspaceId, parsed.actorUserId, parsed.presetId);

  const [preset] = await db
    .delete(instructionPresets)
    .where(
      and(
        eq(instructionPresets.id, parsed.presetId),
        existingPreset.scope === "workspace"
          ? eq(instructionPresets.workspaceId, parsed.workspaceId)
          : and(isNull(instructionPresets.workspaceId), eq(instructionPresets.createdBy, parsed.actorUserId)),
      ),
    )
    .returning();

  return preset;
}

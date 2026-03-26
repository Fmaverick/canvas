import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { workspaceMembers, workspaces } from "@/infrastructure/db/schema";

export const listWorkspacesInputSchema = z.object({
  userId: z.uuid().optional(),
});

export const createWorkspaceInputSchema = z.object({
  name: z.string().min(1, "Workspace name is required."),
  type: z.enum(["personal", "team"]),
  ownerId: z.uuid(),
});

export async function listWorkspaces(input: z.infer<typeof listWorkspacesInputSchema>) {
  const parsed = listWorkspacesInputSchema.parse(input);

  if (!parsed.userId) {
    const rows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        type: workspaces.type,
        ownerId: workspaces.ownerId,
        status: workspaces.status,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt,
      })
      .from(workspaces)
      .orderBy(desc(workspaces.updatedAt));

    return rows.map((workspace) => ({
      ...workspace,
      role: null,
    }));
  }

  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      type: workspaces.type,
      ownerId: workspaces.ownerId,
      status: workspaces.status,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
      role: workspaceMembers.role,
    })
    .from(workspaces)
    .leftJoin(
      workspaceMembers,
      and(eq(workspaceMembers.workspaceId, workspaces.id), eq(workspaceMembers.userId, parsed.userId)),
    )
    .where(or(eq(workspaces.ownerId, parsed.userId), eq(workspaceMembers.userId, parsed.userId)))
    .orderBy(desc(workspaces.updatedAt));

  return rows.map(({ role, ...workspace }) => ({
    ...workspace,
    role: role ?? "owner",
  }));
}

export async function createWorkspace(input: z.infer<typeof createWorkspaceInputSchema>) {
  const parsed = createWorkspaceInputSchema.parse(input);

  return db.transaction(async (tx) => {
    const [workspace] = await tx
      .insert(workspaces)
      .values({
        name: parsed.name,
        type: parsed.type,
        ownerId: parsed.ownerId,
        status: "active",
      })
      .returning();

    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: parsed.ownerId,
      role: "owner",
      status: "active",
    });

    return {
      ...workspace,
      role: "owner",
    };
  });
}

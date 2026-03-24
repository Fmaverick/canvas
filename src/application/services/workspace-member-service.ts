import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { users, workspaceMembers, workspaces } from "@/infrastructure/db/schema";
import { ApiError } from "@/lib/api";

const memberRoleSchema = z.enum(["admin", "editor", "viewer"]);

export const listWorkspaceMembersInputSchema = z.object({
  workspaceId: z.uuid(),
  actorUserId: z.uuid(),
});

export const inviteWorkspaceMemberInputSchema = z.object({
  workspaceId: z.uuid(),
  actorUserId: z.uuid(),
  email: z.email(),
  role: memberRoleSchema,
});

export const updateWorkspaceMemberRoleInputSchema = z.object({
  workspaceId: z.uuid(),
  memberId: z.uuid(),
  actorUserId: z.uuid(),
  role: memberRoleSchema,
});

export const removeWorkspaceMemberInputSchema = z.object({
  workspaceId: z.uuid(),
  memberId: z.uuid(),
  actorUserId: z.uuid(),
});

async function getWorkspace(workspaceId: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new ApiError(404, "WORKSPACE_NOT_FOUND", "Workspace not found.");
  }

  return workspace;
}

async function getActorMembership(workspaceId: string, actorUserId: string) {
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, actorUserId),
      ),
    )
    .limit(1);

  return membership ?? null;
}

async function assertWorkspaceMemberAccess(workspaceId: string, actorUserId: string, requireManageMembers: boolean) {
  const workspace = await getWorkspace(workspaceId);

  if (workspace.type !== "team") {
    throw new ApiError(409, "WORKSPACE_MEMBER_UNSUPPORTED", "Member management is only supported for team workspaces.");
  }

  if (workspace.ownerId === actorUserId) {
    return {
      workspace,
      actorRole: "owner" as const,
    };
  }

  const membership = await getActorMembership(workspaceId, actorUserId);

  if (!membership || membership.status !== "active") {
    throw new ApiError(403, "WORKSPACE_FORBIDDEN", "You do not have access to this workspace.");
  }

  if (requireManageMembers && membership.role !== "admin") {
    throw new ApiError(403, "WORKSPACE_FORBIDDEN", "You do not have permission to manage workspace members.");
  }

  return {
    workspace,
    actorRole: membership.role,
  };
}

async function getMemberRecord(workspaceId: string, memberId: string) {
  const [member] = await db
    .select({
      id: workspaceMembers.id,
      workspaceId: workspaceMembers.workspaceId,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      status: workspaceMembers.status,
      invitedBy: workspaceMembers.invitedBy,
      createdAt: workspaceMembers.createdAt,
      updatedAt: workspaceMembers.updatedAt,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      userStatus: users.status,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.id, memberId),
      ),
    )
    .limit(1);

  if (!member) {
    throw new ApiError(404, "WORKSPACE_MEMBER_NOT_FOUND", "Workspace member not found.");
  }

  return member;
}

export async function listWorkspaceMembers(input: z.infer<typeof listWorkspaceMembersInputSchema>) {
  const parsed = listWorkspaceMembersInputSchema.parse(input);
  const { workspace } = await assertWorkspaceMemberAccess(parsed.workspaceId, parsed.actorUserId, false);
  const members = await db
    .select({
      id: workspaceMembers.id,
      workspaceId: workspaceMembers.workspaceId,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      status: workspaceMembers.status,
      invitedBy: workspaceMembers.invitedBy,
      createdAt: workspaceMembers.createdAt,
      updatedAt: workspaceMembers.updatedAt,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      userStatus: users.status,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, parsed.workspaceId));

  const owner = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      userStatus: users.status,
    })
    .from(users)
    .where(eq(users.id, workspace.ownerId))
    .limit(1);

  const ownerMember = owner[0]
    ? {
        id: `owner:${workspace.id}`,
        workspaceId: workspace.id,
        userId: owner[0].userId,
        role: "owner",
        status: "active",
        invitedBy: null,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        email: owner[0].email,
        name: owner[0].name,
        avatarUrl: owner[0].avatarUrl,
        userStatus: owner[0].userStatus,
      }
    : null;

  return ownerMember ? [ownerMember, ...members.filter((member) => member.userId !== ownerMember.userId)] : members;
}

export async function inviteWorkspaceMember(input: z.infer<typeof inviteWorkspaceMemberInputSchema>) {
  const parsed = inviteWorkspaceMemberInputSchema.parse(input);
  const { workspace } = await assertWorkspaceMemberAccess(parsed.workspaceId, parsed.actorUserId, true);
  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.email))
    .limit(1);

  if (!targetUser) {
    throw new ApiError(404, "USER_NOT_FOUND", "Target user not found.");
  }

  if (workspace.ownerId === targetUser.id) {
    throw new ApiError(409, "WORKSPACE_MEMBER_CONFLICT", "Workspace owner is already part of this workspace.");
  }

  const existingMembership = await getActorMembership(parsed.workspaceId, targetUser.id);

  if (existingMembership && existingMembership.status === "active") {
    throw new ApiError(409, "WORKSPACE_MEMBER_CONFLICT", "User is already an active member of this workspace.");
  }

  const [member] = existingMembership
    ? await db
        .update(workspaceMembers)
        .set({
          role: parsed.role,
          status: "active",
          invitedBy: parsed.actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(workspaceMembers.id, existingMembership.id))
        .returning()
    : await db
        .insert(workspaceMembers)
        .values({
          workspaceId: parsed.workspaceId,
          userId: targetUser.id,
          role: parsed.role,
          status: "active",
          invitedBy: parsed.actorUserId,
        })
        .returning();

  return {
    ...member,
    email: targetUser.email,
    name: targetUser.name,
    avatarUrl: targetUser.avatarUrl,
    userStatus: targetUser.status,
  };
}

export async function updateWorkspaceMemberRole(input: z.infer<typeof updateWorkspaceMemberRoleInputSchema>) {
  const parsed = updateWorkspaceMemberRoleInputSchema.parse(input);
  const { workspace } = await assertWorkspaceMemberAccess(parsed.workspaceId, parsed.actorUserId, true);
  const member = await getMemberRecord(parsed.workspaceId, parsed.memberId);

  if (member.userId === workspace.ownerId || member.role === "owner") {
    throw new ApiError(409, "WORKSPACE_MEMBER_CONFLICT", "Workspace owner role cannot be changed.");
  }

  const [updatedMember] = await db
    .update(workspaceMembers)
    .set({
      role: parsed.role,
      updatedAt: new Date(),
    })
    .where(eq(workspaceMembers.id, parsed.memberId))
    .returning();

  return {
    ...updatedMember,
    email: member.email,
    name: member.name,
    avatarUrl: member.avatarUrl,
    userStatus: member.userStatus,
  };
}

export async function removeWorkspaceMember(input: z.infer<typeof removeWorkspaceMemberInputSchema>) {
  const parsed = removeWorkspaceMemberInputSchema.parse(input);
  const { workspace } = await assertWorkspaceMemberAccess(parsed.workspaceId, parsed.actorUserId, true);
  const member = await getMemberRecord(parsed.workspaceId, parsed.memberId);

  if (member.userId === workspace.ownerId || member.role === "owner") {
    throw new ApiError(409, "WORKSPACE_MEMBER_CONFLICT", "Workspace owner cannot be removed.");
  }

  const [removedMember] = await db
    .update(workspaceMembers)
    .set({
      status: "removed",
      updatedAt: new Date(),
    })
    .where(eq(workspaceMembers.id, parsed.memberId))
    .returning();

  return {
    ...removedMember,
    email: member.email,
    name: member.name,
    avatarUrl: member.avatarUrl,
    userStatus: member.userStatus,
  };
}

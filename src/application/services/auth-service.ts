import { and, desc, eq, gt, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/infrastructure/db/client";
import { userSessions, users, workspaceMembers, workspaces } from "@/infrastructure/db/schema";
import {
  createSessionExpiry,
  createSessionToken,
  getSessionTokenFromRequest,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from "@/lib/auth";
import { ApiError } from "@/lib/api";

export const registerInputSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
  name: z.string().min(1, "Name is required."),
});

export const loginInputSchema = z.object({
  email: z.email(),
  password: z.string().min(1, "Password is required."),
});

async function listAccessibleWorkspaces(userId: string) {
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
    .leftJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(or(eq(workspaces.ownerId, userId), eq(workspaceMembers.userId, userId)))
    .orderBy(desc(workspaces.updatedAt));

  return rows.map(({ role, ...workspace }) => ({
    ...workspace,
    role: role ?? "owner",
  }));
}

async function createUserSession(userId: string) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = createSessionExpiry();

  await db.insert(userSessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return {
    token,
    expiresAt,
  };
}

async function getSessionRecordByToken(token: string) {
  const tokenHash = hashSessionToken(token);
  const [session] = await db
    .select()
    .from(userSessions)
    .where(and(eq(userSessions.tokenHash, tokenHash), gt(userSessions.expiresAt, new Date())))
    .limit(1);

  return session ?? null;
}

export async function registerUser(input: z.infer<typeof registerInputSchema>) {
  const parsed = registerInputSchema.parse(input);
  const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.email)).limit(1);

  if (existingUser.length > 0) {
    throw new ApiError(409, "EMAIL_ALREADY_EXISTS", "Email is already registered.");
  }

  const passwordHash = hashPassword(parsed.password);

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: parsed.email,
        passwordHash,
        name: parsed.name,
        status: "active",
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
        status: users.status,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    const [workspace] = await tx
      .insert(workspaces)
      .values({
        type: "personal",
        name: `${parsed.name} 的个人空间`,
        ownerId: user.id,
        status: "active",
      })
      .returning();

    await tx.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner",
      status: "active",
    });

    return {
      user,
      workspace,
    };
  });

  const session = await createUserSession(result.user.id);
  const workspaceList = await listAccessibleWorkspaces(result.user.id);

  return {
    user: result.user,
    workspaces: workspaceList,
    session,
  };
}

export async function loginUser(input: z.infer<typeof loginInputSchema>) {
  const parsed = loginInputSchema.parse(input);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, parsed.email))
    .limit(1);

  if (!user || !user.passwordHash || !verifyPassword(parsed.password, user.passwordHash)) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
  }

  if (user.status !== "active") {
    throw new ApiError(403, "USER_DISABLED", "User is disabled.");
  }

  const session = await createUserSession(user.id);
  const workspaceList = await listAccessibleWorkspaces(user.id);

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    workspaces: workspaceList,
    session,
  };
}

export async function getCurrentUserFromRequest(request: Request) {
  const token = getSessionTokenFromRequest(request);

  if (!token) {
    throw new ApiError(401, "UNAUTHENTICATED", "Authentication required.");
  }

  const session = await getSessionRecordByToken(token);

  if (!session) {
    throw new ApiError(401, "UNAUTHENTICATED", "Session is invalid or expired.");
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      status: users.status,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) {
    throw new ApiError(401, "UNAUTHENTICATED", "Session user not found.");
  }

  const workspaceList = await listAccessibleWorkspaces(user.id);

  return {
    user,
    workspaces: workspaceList,
    session: {
      id: session.id,
      expiresAt: session.expiresAt,
    },
  };
}

export async function getOptionalCurrentUserFromRequest(request: Request) {
  try {
    return await getCurrentUserFromRequest(request);
  } catch {
    return null;
  }
}

export type WorkspacePermission = "view" | "edit" | "generate" | "manage_members";

function hasWorkspacePermission(role: string, permission: WorkspacePermission) {
  if (role === "owner") {
    return true;
  }

  if (permission === "view") {
    return ["admin", "editor", "viewer"].includes(role);
  }

  if (permission === "manage_members") {
    return role === "admin";
  }

  return role === "admin" || role === "editor";
}

export async function resolveWorkspaceContextFromRequest(
  request: Request,
  explicitWorkspaceId?: string | null,
  permission: WorkspacePermission = "view",
) {
  const currentUser = await getCurrentUserFromRequest(request);
  const requestedWorkspaceId = explicitWorkspaceId ?? request.headers.get("x-workspace-id");
  const defaultWorkspace =
    currentUser.workspaces.find((workspace) => workspace.type === "personal") ?? currentUser.workspaces[0];
  const targetWorkspace = requestedWorkspaceId
    ? currentUser.workspaces.find((workspace) => workspace.id === requestedWorkspaceId)
    : defaultWorkspace;

  if (!targetWorkspace) {
    throw new ApiError(403, "WORKSPACE_FORBIDDEN", "You do not have access to this workspace.");
  }

  if (!hasWorkspacePermission(targetWorkspace.role, permission)) {
    throw new ApiError(403, "WORKSPACE_FORBIDDEN", "You do not have permission to perform this action.");
  }

  return {
    currentUser,
    workspaceId: targetWorkspace.id,
    workspaceRole: targetWorkspace.role,
    workspace: targetWorkspace,
  };
}

export async function logoutUser(request: Request) {
  const token = getSessionTokenFromRequest(request);

  if (!token) {
    return {
      loggedOut: true,
    };
  }

  const tokenHash = hashSessionToken(token);

  await db.delete(userSessions).where(eq(userSessions.tokenHash, tokenHash));

  return {
    loggedOut: true,
  };
}

import { createHash } from "node:crypto";

import { ApiError } from "@/lib/api";

const ADMIN_SESSION_COOKIE = "gateway_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const SESSION_GLOBAL_KEY = "__gateway_admin_sessions__";

type SessionState = {
  tokens: Set<string>;
};

function getSessionState() {
  const globalRef = globalThis as typeof globalThis & {
    [SESSION_GLOBAL_KEY]?: SessionState;
  };

  if (!globalRef[SESSION_GLOBAL_KEY]) {
    globalRef[SESSION_GLOBAL_KEY] = {
      tokens: new Set<string>(),
    };
  }

  return globalRef[SESSION_GLOBAL_KEY]!;
}

function parseCookieValue(cookieHeader: string | null, key: string) {
  if (!cookieHeader) {
    return null;
  }

  const items = cookieHeader.split(";");

  for (const item of items) {
    const [rawKey, ...rawValue] = item.trim().split("=");
    if (rawKey === key) {
      return rawValue.join("=").trim();
    }
  }

  return null;
}

export function isAdminPasswordEnabled() {
  return Boolean(process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD_HASH);
}

export function verifyAdminPassword(password: string) {
  const plainPassword = process.env.ADMIN_PASSWORD;
  if (plainPassword && password === plainPassword) {
    return true;
  }

  const hashedPassword = process.env.ADMIN_PASSWORD_HASH;
  if (hashedPassword) {
    const digest = createHash("sha256").update(password).digest("hex");
    return digest === hashedPassword;
  }

  return false;
}

export function createAdminSessionToken() {
  const token = crypto.randomUUID();
  getSessionState().tokens.add(token);
  return token;
}

export function createAdminSessionCookie(token: string) {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function requireAdminSession(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  const token = parseCookieValue(cookieHeader, ADMIN_SESSION_COOKIE);

  if (!token || !getSessionState().tokens.has(token)) {
    throw new ApiError(401, "UNAUTHORIZED", "Admin login required.");
  }

  return token;
}

import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";

const PASSWORD_PREFIX = "scrypt";
const SESSION_COOKIE_NAME = "canvas_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 30;

function encodeHex(value: Buffer) {
  return value.toString("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = scryptSync(password, salt, 64);

  return `${PASSWORD_PREFIX}$${encodeHex(salt)}$${encodeHex(derivedKey)}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [prefix, saltHex, hashHex] = passwordHash.split("$");

  if (prefix !== PASSWORD_PREFIX || !saltHex || !hashHex) {
    return false;
  }

  const derivedKey = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  const existingKey = Buffer.from(hashHex, "hex");

  return derivedKey.length === existingKey.length && timingSafeEqual(derivedKey, existingKey);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionExpiry() {
  return new Date(Date.now() + SESSION_DURATION_MS);
}

export function getSessionTokenFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie");

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(";").map((item) => item.trim());
  const sessionCookie = cookies.find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));

  if (!sessionCookie) {
    return null;
  }

  const token = sessionCookie.slice(SESSION_COOKIE_NAME.length + 1);

  return token.length > 0 ? token : null;
}

export function attachSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return response;
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });

  return response;
}

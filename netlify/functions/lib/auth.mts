import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { db } from "../../../db/index.js";
import { users, sessions } from "../../../db/schema.js";
import { eq, lt } from "drizzle-orm";
import type { Context } from "@netlify/functions";

const SESSION_COOKIE = "session_token";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const derived = await scrypt(password, salt);
  const expected = Buffer.from(hashHex, "hex");
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export function generateToken(): string {
  return randomBytes32();
}

function randomBytes32(): string {
  return randomBytes(32).toString("hex");
}

// Ensures a default admin account exists. Cheap no-op after first successful run.
export async function ensureSeedAdmin() {
  const existing = await db.select().from(users).where(eq(users.username, "admin")).limit(1);
  if (existing.length > 0) return;
  const passwordHash = await hashPassword("admin123");
  await db.insert(users).values({
    username: "admin",
    passwordHash,
    role: "admin",
    status: "approved",
    internetAccess: true,
  });
}

export async function createSession(userId: number): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ token, userId, expiresAt });
  // Best-effort cleanup of expired sessions.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).catch?.(() => {});
  return token;
}

export async function destroySession(token: string) {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export type SessionUser = {
  id: number;
  username: string;
  role: string;
  customRole: string | null;
  status: string;
  internetAccess: boolean;
};

export async function getSessionUser(context: Context): Promise<SessionUser | null> {
  const token = context.cookies.get(SESSION_COOKIE);
  if (!token) return null;
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      customRole: users.customRole,
      status: users.status,
      internetAccess: users.internetAccess,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, token))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt && new Date(row.expiresAt) < new Date()) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    customRole: row.customRole,
    status: row.status,
    internetAccess: row.internetAccess,
  };
}

export function setSessionCookie(context: Context, token: string) {
  // Netlify sets CONTEXT=dev for `netlify dev`, which serves over plain HTTP locally.
  // A Secure cookie would silently fail to be set/sent in that case, breaking local login.
  const isLocalDev = Netlify.env.get("CONTEXT") === "dev";
  context.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    path: "/",
    httpOnly: true,
    secure: !isLocalDev,
    sameSite: "Lax",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(context: Context) {
  context.cookies.delete(SESSION_COOKIE);
}

export function getSessionToken(context: Context): string | undefined {
  return context.cookies.get(SESSION_COOKIE);
}

export function isAdmin(user: SessionUser | null): boolean {
  return !!user && user.role === "admin";
}

export function isAdminOrMod(user: SessionUser | null): boolean {
  return !!user && (user.role === "admin" || user.role === "mod");
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

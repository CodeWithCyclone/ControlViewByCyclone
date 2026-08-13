import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { users, devices } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { hashPassword, ensureSeedAdmin, jsonResponse } from "./lib/auth.mts";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  await ensureSeedAdmin();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const fingerprint = String(body.fingerprint || "").trim();

  if (username.length < 3 || username.length > 64) {
    return jsonResponse({ error: "Username must be 3-64 characters" }, 422);
  }
  if (password.length < 6) {
    return jsonResponse({ error: "Password must be at least 6 characters" }, 422);
  }
  if (!fingerprint) {
    return jsonResponse({ error: "Missing device fingerprint" }, 422);
  }

  const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (existing.length > 0) {
    return jsonResponse({ error: "Username already taken" }, 409);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash, role: "user", status: "pending", internetAccess: true })
    .returning();

  // Attach/create the device record for this fingerprint, linked to the new user.
  const existingDevice = await db.select().from(devices).where(eq(devices.fingerprint, fingerprint)).limit(1);
  if (existingDevice.length > 0) {
    await db.update(devices).set({ userId: user.id }).where(eq(devices.fingerprint, fingerprint));
  } else {
    await db.insert(devices).values({ fingerprint, userId: user.id });
  }

  return jsonResponse({
    message: "Registration submitted. An admin must approve your account before you can log in.",
    status: "pending",
  });
};

export const config: Config = {
  path: "/api/register",
};

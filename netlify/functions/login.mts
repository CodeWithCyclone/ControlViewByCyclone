import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { users, devices } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import {
  verifyPassword,
  createSession,
  setSessionCookie,
  ensureSeedAdmin,
  jsonResponse,
} from "./lib/auth.mts";

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

  const rows = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const user = rows[0];
  if (!user) return jsonResponse({ error: "Invalid username or password" }, 401);

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return jsonResponse({ error: "Invalid username or password" }, 401);

  if (user.status === "pending") {
    return jsonResponse({ error: "Your account is pending admin approval." }, 403);
  }
  if (user.status === "rejected") {
    return jsonResponse({ error: "Your registration was rejected." }, 403);
  }

  const token = await createSession(user.id);
  setSessionCookie(context, token);

  // Track device: link to user, bump login count, update last active.
  if (fingerprint) {
    const existingDevice = await db.select().from(devices).where(eq(devices.fingerprint, fingerprint)).limit(1);
    if (existingDevice.length > 0) {
      await db
        .update(devices)
        .set({
          userId: user.id,
          loginCount: existingDevice[0].loginCount + 1,
          lastActiveAt: new Date(),
        })
        .where(eq(devices.fingerprint, fingerprint));
    } else {
      await db.insert(devices).values({
        fingerprint,
        userId: user.id,
        loginCount: 1,
        lastActiveAt: new Date(),
      });
    }
  }

  return jsonResponse({
    id: user.id,
    username: user.username,
    role: user.role,
    customRole: user.customRole,
    status: user.status,
    internetAccess: user.internetAccess,
  });
};

export const config: Config = {
  path: "/api/login",
};

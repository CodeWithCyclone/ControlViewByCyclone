import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { notifications, users } from "../../db/schema.js";
import { desc, eq } from "drizzle-orm";
import { getSessionUser, isAdminOrMod, jsonResponse } from "./lib/auth.mts";

// GET: list recent notifications sent (admin/mod)
// POST: send a broadcast (targetUserId omitted) or targeted (targetUserId set) notification.
//       Both admin and mod may send notifications per the reduced-permission spec.
export default async (req: Request, context: Context) => {
  const actor = await getSessionUser(context);
  if (!isAdminOrMod(actor)) return jsonResponse({ error: "Forbidden" }, 403);

  if (req.method === "GET") {
    const recent = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(50);
    return jsonResponse({ notifications: recent });
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    const message = String(body.message || "").trim();
    if (!message) return jsonResponse({ error: "Message is required" }, 422);

    let targetUserId: number | null = null;
    if (body.targetUserId !== undefined && body.targetUserId !== null && body.targetUserId !== "") {
      targetUserId = Number(body.targetUserId);
      const targetRows = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
      if (targetRows.length === 0) return jsonResponse({ error: "Target user not found" }, 404);
    }

    const [created] = await db
      .insert(notifications)
      .values({ message, targetUserId })
      .returning();

    return jsonResponse({ notification: created });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};

export const config: Config = {
  path: "/api/admin/notifications",
};

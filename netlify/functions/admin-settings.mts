import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { siteSettings } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { getSessionUser, isAdminOrMod, isAdmin, jsonResponse } from "./lib/auth.mts";

async function getOrCreateSettings() {
  const rows = await db.select().from(siteSettings).limit(1);
  if (rows.length > 0) return rows[0];
  const [created] = await db.insert(siteSettings).values({}).returning();
  return created;
}

// GET: read current settings (admin/mod)
// PATCH: update maintenance mode/notice and/or content (admin only for content injection;
//        mods may read but not change maintenance/content per reduced-permission requirement)
export default async (req: Request, context: Context) => {
  const actor = await getSessionUser(context);
  if (!isAdminOrMod(actor)) return jsonResponse({ error: "Forbidden" }, 403);

  if (req.method === "GET") {
    const settings = await getOrCreateSettings();
    return jsonResponse({ settings });
  }

  if (req.method === "PATCH") {
    if (!isAdmin(actor)) {
      return jsonResponse({ error: "Only admins can change maintenance mode or injected content" }, 403);
    }
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    await getOrCreateSettings();

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.maintenanceMode !== undefined) updates.maintenanceMode = Boolean(body.maintenanceMode);
    if (body.maintenanceNotice !== undefined) updates.maintenanceNotice = String(body.maintenanceNotice);
    if (body.contentType !== undefined) {
      const type = String(body.contentType);
      if (type !== "url" && type !== "html") return jsonResponse({ error: "contentType must be url or html" }, 422);
      updates.contentType = type;
    }
    if (body.contentPayload !== undefined) updates.contentPayload = String(body.contentPayload);

    const current = await getOrCreateSettings();
    const [updated] = await db
      .update(siteSettings)
      .set(updates)
      .where(eq(siteSettings.id, current.id))
      .returning();
    return jsonResponse({ settings: updated });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};

export const config: Config = {
  path: "/api/admin/settings",
};

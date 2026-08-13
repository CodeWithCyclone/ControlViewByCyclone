import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { devices, siteSettings, notifications, notificationReads } from "../../db/schema.js";
import { eq, isNull, or } from "drizzle-orm";
import { getSessionUser, jsonResponse } from "./lib/auth.mts";

const HEARTBEAT_INTERVAL_SECONDS = 15;

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const user = await getSessionUser(context);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const fingerprint = String(body.fingerprint || "").trim();

  // Update device active-time tracking if we know the device.
  if (fingerprint) {
    const rows = await db.select().from(devices).where(eq(devices.fingerprint, fingerprint)).limit(1);
    if (rows.length > 0) {
      const device = rows[0];
      await db
        .update(devices)
        .set({
          lastActiveAt: new Date(),
          totalActiveSeconds: device.totalActiveSeconds + HEARTBEAT_INTERVAL_SECONDS,
          userId: user ? user.id : device.userId,
        })
        .where(eq(devices.fingerprint, fingerprint));
    } else {
      await db.insert(devices).values({
        fingerprint,
        userId: user ? user.id : null,
        lastActiveAt: new Date(),
        totalActiveSeconds: 0,
      });
    }
  }

  // Not logged in: just report auth state, no content.
  if (!user) {
    return jsonResponse({ authenticated: false });
  }

  if (user.status !== "approved") {
    return jsonResponse({ authenticated: true, blocked: true, reason: "not_approved", status: user.status });
  }
  if (!user.internetAccess) {
    return jsonResponse({ authenticated: true, blocked: true, reason: "no_access" });
  }

  const settingsRows = await db.select().from(siteSettings).limit(1);
  const settings = settingsRows[0] || {
    maintenanceMode: false,
    maintenanceNotice: "",
    contentType: "url",
    contentPayload: "",
  };

  const isBypassAdmin = user.role === "admin";
  const inMaintenance = settings.maintenanceMode && !isBypassAdmin;

  // Fetch unread notifications targeted at this user or broadcast (targetUserId null).
  const now = new Date();
  const candidateNotifications = await db
    .select()
    .from(notifications)
    .where(or(eq(notifications.targetUserId, user.id), isNull(notifications.targetUserId)));

  const readRows = await db
    .select({ notificationId: notificationReads.notificationId })
    .from(notificationReads)
    .where(eq(notificationReads.userId, user.id));
  const readIds = new Set(readRows.map((r) => r.notificationId));

  const unread = candidateNotifications.filter((n) => {
    if (readIds.has(n.id)) return false;
    if (n.expiresAt && new Date(n.expiresAt) < now) return false;
    return true;
  });

  // Mark them as read now that we're delivering them.
  if (unread.length > 0) {
    await db.insert(notificationReads).values(
      unread.map((n) => ({ notificationId: n.id, userId: user.id }))
    );
  }

  return jsonResponse({
    authenticated: true,
    blocked: false,
    maintenanceMode: inMaintenance,
    maintenanceNotice: settings.maintenanceNotice,
    content: inMaintenance
      ? null
      : { type: settings.contentType, payload: settings.contentPayload },
    notifications: unread.map((n) => ({ id: n.id, message: n.message })),
    isAdmin: isBypassAdmin,
  });
};

export const config: Config = {
  path: "/api/heartbeat",
};

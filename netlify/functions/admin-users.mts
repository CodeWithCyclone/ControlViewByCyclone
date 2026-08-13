import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { users, devices } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { getSessionUser, isAdminOrMod, isAdmin, hashPassword, jsonResponse } from "./lib/auth.mts";

// GET: list all users with their device stats
// POST: create a new approved account directly (admin/mod)
// PATCH: update a user (approve/reject/toggle access/role change)
// DELETE: remove a user
export default async (req: Request, context: Context) => {
  const actor = await getSessionUser(context);
  if (!isAdminOrMod(actor)) return jsonResponse({ error: "Forbidden" }, 403);

  if (req.method === "GET") {
    const allUsers = await db.select().from(users);
    const allDevices = await db.select().from(devices);
    const byUser: Record<number, typeof allDevices> = {};
    for (const d of allDevices) {
      if (d.userId == null) continue;
      (byUser[d.userId] ||= []).push(d);
    }
    const result = allUsers.map((u) => {
      const userDevices = byUser[u.id] || [];
      const loginCount = userDevices.reduce((sum, d) => sum + d.loginCount, 0);
      const totalActiveSeconds = userDevices.reduce((sum, d) => sum + d.totalActiveSeconds, 0);
      const lastActiveAt = userDevices
        .map((d) => d.lastActiveAt)
        .filter(Boolean)
        .sort()
        .pop();
      return {
        id: u.id,
        username: u.username,
        role: u.role,
        customRole: u.customRole,
        status: u.status,
        internetAccess: u.internetAccess,
        createdAt: u.createdAt,
        loginCount,
        totalActiveSeconds,
        lastActiveAt: lastActiveAt || null,
        deviceCount: userDevices.length,
      };
    });
    return jsonResponse({ users: result });
  }

  if (req.method === "POST") {
    // Admin directly creates an approved account. Mods cannot create admin/mod accounts.
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const role = String(body.role || "user");
    const customRole = body.customRole ? String(body.customRole).trim() : null;

    if (username.length < 3 || password.length < 6) {
      return jsonResponse({ error: "Username (3+) and password (6+) required" }, 422);
    }
    if ((role === "admin" || role === "mod") && !isAdmin(actor)) {
      return jsonResponse({ error: "Only admins can assign admin/mod roles" }, 403);
    }

    const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existing.length > 0) return jsonResponse({ error: "Username already taken" }, 409);

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({ username, passwordHash, role, customRole, status: "approved", internetAccess: true })
      .returning();

    return jsonResponse({ user });
  }

  if (req.method === "PATCH") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }
    const id = Number(body.id);
    if (!id) return jsonResponse({ error: "Missing id" }, 400);

    const targetRows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    const target = targetRows[0];
    if (!target) return jsonResponse({ error: "User not found" }, 404);

    // Mods have reduced permissions: cannot manage admin or mod accounts, cannot change roles.
    const changingRole = body.role !== undefined && body.role !== target.role;
    const touchesPrivilegedAccount = target.role === "admin" || target.role === "mod";
    if (!isAdmin(actor)) {
      if (touchesPrivilegedAccount) return jsonResponse({ error: "Mods cannot manage admin/mod accounts" }, 403);
      if (changingRole) return jsonResponse({ error: "Mods cannot change roles" }, 403);
    }

    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) updates.status = String(body.status);
    if (body.internetAccess !== undefined) updates.internetAccess = Boolean(body.internetAccess);
    if (body.role !== undefined) updates.role = String(body.role);
    if (body.customRole !== undefined) updates.customRole = body.customRole ? String(body.customRole) : null;

    if (Object.keys(updates).length === 0) return jsonResponse({ error: "No changes provided" }, 400);

    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return jsonResponse({ user: updated });
  }

  if (req.method === "DELETE") {
    if (!isAdmin(actor)) return jsonResponse({ error: "Only admins can delete accounts" }, 403);
    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return jsonResponse({ error: "Missing id" }, 400);
    await db.delete(users).where(eq(users.id, id));
    return jsonResponse({ message: "Deleted" });
  }

  return jsonResponse({ error: "Method not allowed" }, 405);
};

export const config: Config = {
  path: "/api/admin/users",
};

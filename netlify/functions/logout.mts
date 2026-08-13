import type { Config, Context } from "@netlify/functions";
import { destroySession, getSessionToken, clearSessionCookie, jsonResponse } from "./lib/auth.mts";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const token = getSessionToken(context);
  if (token) await destroySession(token);
  clearSessionCookie(context);
  return jsonResponse({ message: "Logged out" });
};

export const config: Config = {
  path: "/api/logout",
};

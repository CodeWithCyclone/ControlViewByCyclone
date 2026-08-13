import type { Config, Context } from "@netlify/functions";
import { getSessionUser, jsonResponse } from "./lib/auth.mts";

export default async (req: Request, context: Context) => {
  const user = await getSessionUser(context);
  if (!user) return jsonResponse({ user: null }, 200);
  return jsonResponse({ user });
};

export const config: Config = {
  path: "/api/me",
};

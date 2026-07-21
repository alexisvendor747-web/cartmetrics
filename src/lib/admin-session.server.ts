import { useSession } from "@tanstack/react-start/server";

export type AdminSession = { userId?: string; unlockedAt?: number };

export function getAdminSessionConfig() {
  const password = process.env.ADMIN_SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET missing or too short");
  }
  return {
    password,
    name: "cm-admin",
    maxAge: 60 * 60 * 8, // 8h
    cookie: {
      httpOnly: true,
      secure: true,
      // SameSite=None so the admin session cookie is sent when the app
      // is loaded inside the Lovable editor preview iframe.
      sameSite: "none" as const,
      path: "/",
    },
  };
}

export async function getAdminSession() {
  return useSession<AdminSession>(getAdminSessionConfig());
}

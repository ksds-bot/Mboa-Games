import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { AuthScope } from "./client";

export async function createClient(scope: AuthScope = "player") {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Les variables publiques Supabase ne sont pas configurées.");
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookieOptions: {
      name: scope === "admin" ? "mboa-admin-auth-token" : "mboa-player-auth-token",
      path: scope === "admin" ? "/admin" : "/",
    },
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Le proxy renouvelle les cookies depuis les Server Components. */ }
      },
    },
  });
}

import { createBrowserClient } from "@supabase/ssr";

export type AuthScope = "player" | "admin";
const clients = new Map<AuthScope, ReturnType<typeof createBrowserClient>>();

function resolveScope(scope?: AuthScope): AuthScope {
  if (scope) return scope;
  if (typeof window === "undefined") return "player";
  const pathname = window.location.pathname;
  const next = new URLSearchParams(window.location.search).get("next");
  return pathname.startsWith("/admin") || (pathname === "/connexion" && next?.startsWith("/admin")) ? "admin" : "player";
}

export function createClient(scope?: AuthScope) {
  const resolvedScope = resolveScope(scope);
  const existing = clients.get(resolvedScope);
  if (existing) return existing;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Les variables publiques Supabase ne sont pas configurées.");
  const client = createBrowserClient(url, key, {
    isSingleton: false,
    cookieOptions: {
      name: resolvedScope === "admin" ? "mboa-admin-auth-token" : "mboa-player-auth-token",
      path: resolvedScope === "admin" ? "/admin" : "/",
    },
  });
  clients.set(resolvedScope, client);
  return client;
}

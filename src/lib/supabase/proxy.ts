import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });

  const pathname = request.nextUrl.pathname;
  const next = request.nextUrl.searchParams.get("next");
  const adminScope = pathname.startsWith("/admin") || (pathname === "/connexion" && next?.startsWith("/admin") === true);
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookieOptions: {
      name: adminScope ? "mboa-admin-auth-token" : "mboa-player-auth-token",
      path: adminScope ? "/admin" : "/",
    },
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => supabaseResponse.headers.set(name, value));
      },
    },
  });
  await supabase.auth.getClaims();
  supabaseResponse.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  supabaseResponse.headers.set("Vary", "Cookie");
  return supabaseResponse;
}

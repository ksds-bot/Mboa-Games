import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        supabaseResponse = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });

        Object.entries(headers).forEach(([name, value]) => {
          supabaseResponse.headers.set(name, value);
        });
      },
    },
  });

  // getClaims valide le JWT ; getSession ne doit pas servir à autoriser l'accès.
  await supabase.auth.getClaims();

  // Les réponses contenant des cookies d’authentification ne doivent jamais
  // être réutilisées par un cache partagé entre plusieurs visiteurs.
  const pathname = request.nextUrl.pathname;
  const isSensitiveRoute = pathname === "/connexion" || pathname === "/profil" || pathname.startsWith("/admin");
  if (isSensitiveRoute) {
    supabaseResponse.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
    supabaseResponse.headers.set("Vary", "Cookie");
  }

  return supabaseResponse;
}

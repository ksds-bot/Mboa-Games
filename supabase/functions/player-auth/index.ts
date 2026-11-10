import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publishableKeys = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
const publicKey = publishableKeys
  ? JSON.parse(publishableKeys).default
  : Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authClient = createClient(supabaseUrl, publicKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function allowedOrigin(origin: string) {
  if (origin === "https://mboa-games.vercel.app" || origin === "http://localhost:3000") return true;
  try {
    const host = new URL(origin).hostname;
    return host.startsWith("mboa-games-") && host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function json(body: Record<string, unknown>, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (!allowedOrigin(origin)) return new Response("Origin non autorisée.", { status: 403 });
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin",
    },
  });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405, origin);

  try {
    const body = await req.json();
    const action = body?.action;
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const pin = typeof body?.pin === "string" ? body.pin : "";
    if (!/^[a-z0-9_]{3,20}$/.test(username) || !/^\d{6}$/.test(pin)) {
      return json({ error: "Vérifie ton pseudo et ton code PIN à 6 chiffres." }, 400, origin);
    }

    if (action === "register") {
      if (body?.pinConfirmation !== pin) {
        return json({ error: "Les deux codes PIN ne correspondent pas." }, 400, origin);
      }
      const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const ip = req.headers.get("cf-connecting-ip") ?? forwardedFor ?? "unknown";
      const { data: canRegister, error: rateError } = await admin.rpc("mboa_take_auth_attempt", {
        p_key: `register:${ip}`,
      });
      if (rateError) throw rateError;
      if (!canRegister) return json({ error: "Trop de créations de comptes depuis cet appareil. Réessaie dans 30 minutes." }, 429, origin);

      const { data: existing, error: lookupError } = await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return json({ error: "Ce pseudo est déjà utilisé. Essaie-en un autre." }, 409, origin);

      const internalEmail = `${username}@players.mboa-games.invalid`;
      const internalPassword = `${pin}mB!`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: internalEmail,
        password: internalPassword,
        email_confirm: true,
        user_metadata: { username },
      });
      if (createError || !created.user) {
        if (createError?.message?.toLowerCase().includes("already")) {
          return json({ error: "Ce pseudo est déjà utilisé. Essaie-en un autre." }, 409, origin);
        }
        throw createError ?? new Error("Impossible de créer le compte.");
      }

      const { error: profileError } = await admin.from("profiles").insert({
        id: created.user.id,
        username,
        display_name: username,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        if (profileError.code === "23505") {
          return json({ error: "Ce pseudo est déjà utilisé. Essaie-en un autre." }, 409, origin);
        }
        throw profileError;
      }

      const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({
        email: internalEmail,
        password: internalPassword,
      });
      if (signInError || !signedIn.session) throw signInError ?? new Error("Connexion impossible après la création.");
      await admin.rpc("mboa_reset_auth_attempts", { p_key: `register:${ip}` });
      return json({ session: signedIn.session }, 200, origin);
    }

    if (action === "login") {
      const attemptKey = `login:${username}`;
      const { data: canLogin, error: rateError } = await admin.rpc("mboa_take_auth_attempt", {
        p_key: attemptKey,
      });
      if (rateError) throw rateError;
      if (!canLogin) return json({ error: "Trop d'essais. Réessaie dans 30 minutes." }, 429, origin);

      const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({
        email: `${username}@players.mboa-games.invalid`,
        password: `${pin}mB!`,
      });
      if (signInError || !signedIn.session) {
        return json({ error: "Pseudo ou code PIN incorrect." }, 401, origin);
      }
      await admin.rpc("mboa_reset_auth_attempts", { p_key: attemptKey });
      return json({ session: signedIn.session }, 200, origin);
    }

    return json({ error: "Action inconnue." }, 400, origin);
  } catch {
    return json({ error: "Une erreur est survenue. Réessaie dans un instant." }, 500, origin);
  }
});

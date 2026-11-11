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

  let stage = "request";
  try {
    const body = await req.json();
    const action = body?.action;
    const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
    const pin = typeof body?.pin === "string" ? body.pin : "";
    if (!/^[a-z0-9_]{3,20}$/.test(username) || !/^\d{6}$/.test(pin)) {
      return json({ error: "Vérifie ton pseudo et ton code PIN à 6 chiffres." }, 400, origin);
    }

    if (action === "change_admin_credentials") {
      const authorization = req.headers.get("authorization") ?? "";
      const accessToken = authorization.replace(/^Bearer\\s+/i, "");
      if (!accessToken) return json({ error: "Session requise." }, 401, origin);
      stage = "admin-credential-session";
      const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
      const currentUser = authData.user;
      if (authError || !currentUser) return json({ error: "Session expirée. Reconnecte-toi." }, 401, origin);
      stage = "admin-credential-role";
      const { data: role, error: roleError } = await admin.schema("private").from("admin_user_roles").select("role_key").eq("user_id", currentUser.id).eq("role_key", "super_admin").maybeSingle();
      if (roleError) throw roleError;
      if (!role) return json({ error: "Cette opération est réservée au super administrateur." }, 403, origin);
      stage = "admin-credential-profile";
      const { data: profile, error: profileError } = await admin.from("profiles").select("username,must_change_credentials").eq("id", currentUser.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.must_change_credentials) return json({ error: "La modification initiale est déjà effectuée." }, 409, origin);
      if (username === profile.username) return json({ error: "Choisis un nouveau pseudo différent de l’identifiant provisoire." }, 400, origin);
      stage = "admin-credential-username-check";
      const { data: existing, error: lookupError } = await admin.from("profiles").select("id").eq("username", username).neq("id", currentUser.id).maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return json({ error: "Ce pseudo est déjà utilisé. Choisis-en un autre." }, 409, origin);
      const { error: updateProfileError } = await admin.from("profiles").update({ username, display_name: username, must_change_credentials: false, updated_at: new Date().toISOString() }).eq("id", currentUser.id);
      if (updateProfileError) { if (updateProfileError.code === "23505") return json({ error: "Ce pseudo est déjà utilisé." }, 409, origin); throw updateProfileError; }
      stage = "admin-credential-auth";
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(currentUser.id, { email: username + "@players.mboa-games.invalid", password: pin + "mB!", user_metadata: { ...currentUser.user_metadata, username } });
      if (updateAuthError) { await admin.from("profiles").update({ username: profile.username, display_name: profile.username, must_change_credentials: true }).eq("id", currentUser.id); throw updateAuthError; }
      await admin.from("admin_audit_logs").insert({ actor_user_id: currentUser.id, target_user_id: currentUser.id, action: "admin.initial_credentials_changed", entity_type: "admin_account", entity_id: currentUser.id, details: { username_changed: true, pin_rotated: true } });
      const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({ email: username + "@players.mboa-games.invalid", password: pin + "mB!" });
      if (signInError || !signedIn.session) throw signInError ?? new Error("Reconnecte-toi avec tes nouveaux identifiants.");
      return json({ session: signedIn.session }, 200, origin);
    }

    if (action === "register") {
      if (body?.pinConfirmation !== pin) {
        return json({ error: "Les deux codes PIN ne correspondent pas." }, 400, origin);
      }
      const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
      const ip = req.headers.get("cf-connecting-ip") ?? forwardedFor ?? "unknown";
      stage = "register-rate-limit";
      const { data: canRegister, error: rateError } = await admin.rpc("mboa_take_auth_attempt", {
        p_key: `register:${ip}`,
      });
      if (rateError) throw rateError;
      if (!canRegister) return json({ error: "Trop de créations de comptes depuis cet appareil. Réessaie dans 30 minutes." }, 429, origin);

      stage = "register-username-check";
      const { data: existing, error: lookupError } = await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return json({ error: "Ce pseudo est déjà utilisé. Essaie-en un autre." }, 409, origin);

      const internalEmail = `${username}@players.mboa-games.invalid`;
      const internalPassword = `${pin}mB!`;
      stage = "register-auth-user";
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

      stage = "register-profile";
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

      stage = "register-session";
      const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({
        email: internalEmail,
        password: internalPassword,
      });
      if (signInError || !signedIn.session) throw signInError ?? new Error("Connexion impossible après la création.");
      return json({ session: signedIn.session }, 200, origin);
    }

    if (action === "login") {
      const attemptKey = `login:${username}`;
      stage = "login-rate-limit";
      const { data: canLogin, error: rateError } = await admin.rpc("mboa_take_auth_attempt", {
        p_key: attemptKey,
      });
      if (rateError) throw rateError;
      if (!canLogin) return json({ error: "Trop d'essais. Réessaie dans 30 minutes." }, 429, origin);

      stage = "login-password";
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
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[player-auth]", { stage, detail });
    return json({ error: "Une erreur est survenue. Réessaie dans un instant." }, 500, origin);
  }
});

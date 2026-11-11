"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type Mode = "register" | "login";

export default function ConnexionForm({ initialMode = "register", redirectTo = "/profil" }: { initialMode?: Mode; redirectTo?: "/profil" | "/admin" }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [pinConfirmation, setPinConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (redirectTo !== "/admin") return;
    void createClient().auth.signOut();
  }, [redirectTo]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
      setError("Ton pseudo doit contenir 3 à 20 lettres, chiffres ou _.");
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError("Ton code PIN doit contenir exactement 6 chiffres.");
      return;
    }
    if (mode === "register" && pin !== pinConfirmation) {
      setError("Les deux codes PIN ne correspondent pas.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { data, error: functionError } = await supabase.functions.invoke<{
        session: Session;
      }>("player-auth", {
        body: {
          action: mode,
          username: cleanUsername,
          pin,
          ...(mode === "register" ? { pinConfirmation } : {}),
        },
      });

      if (functionError) {
        const response = (functionError as { context?: Response }).context;
        if (response && typeof response.json === "function") {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error || "Connexion impossible. Réessaie.");
        }
        throw functionError;
      }
      if (!data?.session) throw new Error("La session n'a pas pu être créée.");

      const { error: sessionError } = await supabase.auth.setSession(data.session);
      if (sessionError) throw sessionError;
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue. Réessaie.");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setPin("");
    setPinConfirmation("");
  }

  return (
    <section className="auth-card">
      <div className="auth-choice-tabs" role="tablist" aria-label="Choisir un mode">
        {redirectTo !== "/admin" && <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "is-active" : ""} onClick={() => changeMode("register")}>Créer un compte</button>}
        <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "is-active" : ""} onClick={() => changeMode("login")}>Se connecter</button>
        {redirectTo !== "/admin" && <Link role="tab" href="/#jeux">Jouer en invité</Link>}
      </div>
      <div className="auth-card-icon">🎮</div>
      <p className="auth-kicker">{redirectTo === "/admin" ? "ACCÈS À L’ESPACE ADMINISTRATEUR" : "TON ESPACE JOUEUR"}</p>
      <h1>{redirectTo === "/admin" && mode === "login" ? "Connexion administrateur." : mode === "register" ? "Crée ton compte." : "Content de te revoir."}</h1>
      <p className="auth-description">
        {mode === "register"
          ? "Choisis un pseudo unique et un code PIN secret. Aucun e-mail ni numéro de téléphone demandé."
          : redirectTo === "/admin" ? "Connecte-toi avec ton compte administrateur. Les droits de ton compte seront vérifiés avant l’ouverture du tableau de bord." : "Entre ton pseudo et ton code PIN pour retrouver ton compte Mboa Games."}
      </p>

      <form className="auth-form" onSubmit={submit}>
        <label htmlFor="player-username">Ton pseudo</label>
        <input
          id="player-username"
          type="text"
          autoComplete="username"
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]{3,20}"
          placeholder="Ex. Mboa237"
          value={username}
          onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20))}
          required
        />

        <label htmlFor="player-pin">Code PIN à 6 chiffres</label>
        <input
          id="player-pin"
          className="auth-pin-input"
          type="password"
          inputMode="numeric"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          placeholder="••••••"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
          required
        />

        {mode === "register" && (
          <>
            <label htmlFor="player-pin-confirm">Confirme ton code PIN</label>
            <input
              id="player-pin-confirm"
              className="auth-pin-input"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              placeholder="Répète ton PIN"
              value={pinConfirmation}
              onChange={(event) => setPinConfirmation(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
            <p className="auth-hint">Garde ce PIN secret : il te permettra de te connecter depuis un autre téléphone.</p>
          </>
        )}

        <button className="auth-submit" type="submit" disabled={busy || username.trim().length < 3 || pin.length !== 6 || (mode === "register" && pinConfirmation.length !== 6)}>
          {busy ? "Patiente..." : mode === "register" ? "Créer mon compte" : "Me connecter"}
          <span aria-hidden="true">→</span>
        </button>
      </form>

      {error && <p className="auth-error" role="alert">{error}</p>}

      {redirectTo === "/admin" && <p className="auth-hint">Connexion indépendante requise. La session joueur déjà ouverte sur cet appareil sera fermée avant cette connexion.</p>}
      {redirectTo !== "/admin" && <button
        className="auth-mode-switch"
        type="button"
        onClick={() => changeMode(mode === "register" ? "login" : "register")}
        disabled={busy}
      >
        {mode === "register" ? "J'ai déjà un compte — Me connecter" : "Nouveau joueur ? Créer un compte"}
      </button>}

      {redirectTo !== "/admin" && <p className="auth-guest-link">Tu veux juste essayer ? <Link href="/#jeux">Jouer en invité sans créer de compte</Link></p>}
      <p className="auth-footnote">Ton PIN est confidentiel. Ne le partage avec personne, même avec un joueur ou un administrateur.</p>
    </section>
  );
}

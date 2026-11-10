"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UsernameSetup() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) {
      setError("Choisis 3 à 20 caractères : lettres sans accent, chiffres ou _.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      const { data: existing, error: lookupError } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", clean)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) {
        setError("Ce pseudo est déjà utilisé. Essaie-en un autre.");
        return;
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Ta session a expiré. Reconnecte-toi.");
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ username: clean, display_name: clean, updated_at: new Date().toISOString() })
        .eq("id", user.id);
      if (updateError) {
        if (updateError.code === "23505") {
          setError("Ce pseudo vient d'être pris par quelqu'un. Choisis-en un autre.");
          return;
        }
        throw updateError;
      }
      setNotice("Ton pseudo est confirmé. Bienvenue dans Mboa Games !");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'enregistrer ce pseudo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-card-icon">🎮</div>
      <p className="auth-kicker">DERNIÈRE ÉTAPE</p>
      <h1>Choisis ton pseudo.</h1>
      <p className="auth-description">C'est le nom que les autres joueurs verront dans les parties et les classements. Chaque pseudo est unique.</p>
      <form className="auth-form" onSubmit={saveUsername}>
        <label htmlFor="player-username">Ton pseudo</label>
        <input
          id="player-username"
          type="text"
          autoComplete="nickname"
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]{3,20}"
          placeholder="Ex. Mboa237"
          value={username}
          onChange={(event) => setUsername(event.target.value.replace(/[^A-Za-z0-9_]/g, "").slice(0, 20))}
          required
        />
        <p className="auth-hint">3 à 20 caractères · lettres, chiffres et _ · sans espace</p>
        <button className="auth-submit" type="submit" disabled={busy || username.trim().length < 3}>
          {busy ? "Vérification..." : "Confirmer mon pseudo"}
          <span aria-hidden="true">→</span>
        </button>
      </form>
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
    </section>
  );
}

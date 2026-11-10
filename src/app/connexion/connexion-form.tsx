"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ConnexionForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSent(false);
    try {
      const supabase = createClient();
      const redirectTo = new URL("/auth/callback?next=/profil", window.location.origin).toString();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
      });
      if (authError) throw authError;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le lien de connexion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-card-icon">🇨🇲</div>
      <p className="auth-kicker">TON ESPACE JOUEUR</p>
      <h1>Entre dans le game.</h1>
      <p className="auth-description">Connecte-toi avec ton adresse e-mail. Pas de mot de passe à retenir : on t'envoie un lien sécurisé.</p>
      <form className="auth-form" onSubmit={sendLink}>
        <label htmlFor="player-email">Adresse e-mail</label>
        <input
          id="player-email"
          type="email"
          autoComplete="email"
          placeholder="toi@exemple.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <button className="auth-submit" type="submit" disabled={busy}>
          {busy ? "Envoi..." : "Recevoir mon lien"}
          <span aria-hidden="true">→</span>
        </button>
      </form>
      {sent && <p className="auth-notice" role="status">Lien envoyé ! Ouvre le message reçu dans ta boîte mail pour te connecter à Mboa Games.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <p className="auth-footnote">En continuant, tu acceptes de jouer dans le respect des autres membres de la communauté.</p>
    </section>
  );
}

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ConnexionForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true },
      });
      if (authError) throw authError;
      setStep("code");
      setNotice("Code envoyé. Vérifie ta boîte mail et tes courriers indésirables.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (authError) throw authError;
      if (!data.user) throw new Error("La connexion n'a pas pu être confirmée.");
      const displayName = data.user.email?.split("@")[0]?.slice(0, 40) || "Joueur";
      const { error: profileError } = await supabase.from("profiles").upsert(
        { id: data.user.id, display_name: displayName },
        { onConflict: "id" },
      );
      if (profileError) throw profileError;
      router.replace("/profil");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Code invalide ou expiré.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-card-icon">🇨🇲</div>
      <p className="auth-kicker">TON ESPACE JOUEUR</p>
      <h1>{step === "email" ? "Entre dans le game." : "Encore une étape."}</h1>
      <p className="auth-description">
        {step === "email"
          ? "Connecte-toi avec ton adresse e-mail. Pas de mot de passe à retenir."
          : `Nous avons envoyé un code à ${email}. Saisis les 6 chiffres pour ouvrir ton compte.`}
      </p>
      {step === "email" ? (
        <form className="auth-form" onSubmit={sendCode}>
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
            {busy ? "Envoi..." : "Recevoir mon code"}
            <span aria-hidden="true">→</span>
          </button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={verifyCode}>
          <label htmlFor="player-code">Code de vérification</label>
          <input
            id="player-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />
          <button className="auth-submit" type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Vérification..." : "Valider et continuer"}
            <span aria-hidden="true">→</span>
          </button>
          <button className="auth-back" type="button" onClick={() => { setStep("email"); setCode(""); setNotice(""); setError(""); }}>
            Modifier l'adresse e-mail
          </button>
        </form>
      )}
      {notice && <p className="auth-notice" role="status">{notice}</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <p className="auth-footnote">En continuant, tu acceptes de jouer dans le respect des autres membres de la communauté.</p>
    </section>
  );
}

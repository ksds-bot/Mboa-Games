"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AdminCredentialForm({ currentUsername }: { currentUsername: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean) || clean === currentUsername) {
      setError("Choisis un nouveau pseudo de 3 à 20 caractères, différent de l’identifiant provisoire.");
      return;
    }
    if (!/^\d{6}$/.test(pin) || pin !== confirmPin) {
      setError("Le nouveau PIN doit contenir 6 chiffres identiques dans les deux champs.");
      return;
    }
    setBusy(true); setError("");
    try {
      const supabase = createClient();
      const { data, error: invokeError } = await supabase.functions.invoke<{ session: import("@supabase/supabase-js").Session }>("player-auth", {
        body: { action: "change_admin_credentials", username: clean, pin },
      });
      if (invokeError) {
        const response = (invokeError as { context?: Response }).context;
        const payload = response ? await response.json().catch(() => null) as { error?: string } | null : null;
        throw new Error(payload?.error || invokeError.message);
      }
      if (!data?.session) throw new Error("Les nouveaux identifiants sont enregistrés, mais la session n’a pas été renouvelée. Reconnecte-toi.");
      const { error: sessionError } = await supabase.auth.setSession(data.session);
      if (sessionError) throw sessionError;
      router.replace("/admin");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de sécuriser ce compte.");
    } finally { setBusy(false); }
  }

  return <section className="auth-card">
    <div className="auth-card-icon">🔐</div>
    <p className="auth-kicker">PREMIÈRE CONNEXION · SÉCURITÉ OBLIGATOIRE</p>
    <h1>Personnalise tes identifiants.</h1>
    <p className="auth-description">L’identifiant provisoire attribué au premier super administrateur ne doit plus être utilisé. Choisis maintenant un nouveau pseudo et un nouveau PIN secret. L’ancien pseudo et l’ancien PIN ne fonctionneront plus.</p>
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="new-admin-username">Nouveau pseudo administrateur</label>
      <input id="new-admin-username" value={username} onChange={e=>setUsername(e.target.value.replace(/[^A-Za-z0-9_]/g,"").slice(0,20))} minLength={3} maxLength={20} autoComplete="username" placeholder="Ton nouvel identifiant" required />
      <label htmlFor="new-admin-pin">Nouveau PIN secret à 6 chiffres</label>
      <input id="new-admin-pin" className="auth-pin-input" type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,"").slice(0,6))} minLength={6} maxLength={6} placeholder="••••••" required />
      <label htmlFor="confirm-admin-pin">Confirmer le nouveau PIN</label>
      <input id="confirm-admin-pin" className="auth-pin-input" type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,"").slice(0,6))} minLength={6} maxLength={6} placeholder="Répète le nouveau PIN" required />
      <p className="auth-hint">Ne réutilise pas ton PIN joueur. Ne partage jamais ton PIN administrateur.</p>
      <button className="auth-submit" type="submit" disabled={busy || username.length<3 || pin.length!==6 || confirmPin.length!==6}>{busy ? "Sécurisation…" : "Enregistrer mes nouveaux identifiants"}<span aria-hidden="true">→</span></button>
    </form>
    {error && <p className="auth-error" role="alert">{error}</p>}
  </section>;
}

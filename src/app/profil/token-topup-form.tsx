"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TopupConfig = { tokens_per_xaf: number; orange_money: string; mtn_momo: string };
type TopupRequest = { id: string; paid_amount_xaf: number; tokens_requested: number; provider: "orange_money"|"mtn_momo"; payment_reference: string; status: "pending"|"approved"|"rejected"; admin_note: string; created_at: string; reviewed_at: string|null };

const number = new Intl.NumberFormat("fr-FR");

export default function TokenTopupForm() {
  const supabase = useMemo(() => createClient(), []);
  const [config, setConfig] = useState<TopupConfig | null>(null);
  const [provider, setProvider] = useState<"orange_money" | "mtn_momo">("orange_money");
  const [amount, setAmount] = useState("1000");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requests, setRequests] = useState<TopupRequest[]>([]);

  useEffect(() => {
    let active = true;
    void supabase.rpc("mboa_my_token_topup_requests").then(({ data, error: rpcError }) => {
      if (active && !rpcError) setRequests((data ?? []) as TopupRequest[]);
    });
    void supabase.rpc("mboa_token_topup_config").then(({ data, error: rpcError }) => {
      if (!active) return;
      if (rpcError) setError("Impossible de charger les coordonnées de recharge pour le moment.");
      else setConfig(data as TopupConfig);
    });
    return () => { active = false; };
  }, [supabase]);

  const paid = Number(amount);
  const tokens = config && Number.isSafeInteger(paid) && paid > 0 ? paid * config.tokens_per_xaf : 0;
  const destination = provider === "orange_money" ? config?.orange_money : config?.mtn_momo;

  async function submit() {
    setError("");
    setNotice("");
    if (!Number.isSafeInteger(paid) || paid < 1 || tokens < 1 || tokens > 1000000) {
      setError("Montant invalide ou supérieur à la limite actuelle de 1 000 000 jetons.");
      return;
    }
    if (reference.trim().length < 4) {
      setError("Saisis la référence de la transaction reçue après le transfert.");
      return;
    }
    setBusy(true);
    const { error: rpcError } = await supabase.rpc("mboa_submit_token_topup_request", {
      p_paid_amount_xaf: paid,
      p_provider: provider,
      p_reference: reference.trim(),
    });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message || "La demande n’a pas pu être envoyée.");
      return;
    }
    setNotice("Demande envoyée ! Tes jetons seront crédités après vérification manuelle du paiement.");
    setReference("");
    const { data: history } = await supabase.rpc("mboa_my_token_topup_requests");
    if (history) setRequests(history as TopupRequest[]);
  }

  return (
    <section className="mt-6 rounded-2xl border border-[#d2f178]/20 bg-[#d2f178]/[.04] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl">➕</span>
        <div><h3 className="text-lg font-black">Recharger mes jetons</h3><p className="mt-1 text-sm leading-6 text-white/55">Paie directement l’administration par mobile money, puis envoie ta demande de vérification.</p></div>
      </div>
      {!config ? <p className="mt-4 text-sm text-white/45">{error || "Chargement des coordonnées…"}</p> : <>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-black/20 p-3"><p className="text-[11px] font-bold text-white/45">ORANGE MONEY</p><p className="mt-1 break-words font-black">{config.orange_money || "Non configuré"}</p></div>
          <div className="rounded-xl bg-black/20 p-3"><p className="text-[11px] font-bold text-white/45">MTN MOBILE MONEY</p><p className="mt-1 break-words font-black">{config.mtn_momo || "Non configuré"}</p></div>
        </div>
        <p className="mt-3 text-xs text-[#d2f178]">Taux actuel : 1 FCFA = {number.format(config.tokens_per_xaf)} jeton(s)</p>
        <label className="mt-4 block text-xs font-bold text-white/60">Opérateur utilisé</label>
        <select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm">
          <option value="orange_money">Orange Money</option><option value="mtn_momo">MTN Mobile Money</option>
        </select>
        <label className="mt-4 block text-xs font-bold text-white/60">Montant envoyé (FCFA)</label>
        <input type="number" min="1" max="100000000" step="1" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"/>
        <div className="mt-3 rounded-xl bg-black/20 p-3"><p className="text-xs text-white/45">Jetons estimés après validation</p><strong className="mt-1 block text-2xl font-black text-[#d2f178]">{number.format(tokens)} jetons</strong></div>
        <label className="mt-4 block text-xs font-bold text-white/60">Référence de transaction</label>
        <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="Référence affichée par Orange ou MTN" className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"/>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        {notice && <p role="status" className="mt-3 rounded-lg bg-[#d2f178]/10 p-3 text-sm text-[#e7f7c2]">{notice}</p>}
        <button disabled={busy || !destination || !Number.isSafeInteger(paid) || paid < 1 || tokens < 1 || tokens > 1000000 || reference.trim().length < 4} onClick={() => void submit()} className="mt-4 w-full rounded-xl bg-[#d2f178] px-4 py-3 font-black text-[#172219] disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Envoi…" : "J’ai effectué le paiement"}</button>
        <p className="mt-3 text-[11px] leading-5 text-white/40">N’envoie jamais ton code PIN ou ton mot de passe. La demande ne crédite pas immédiatement ton portefeuille : l’administration vérifie d’abord la transaction.</p>
        <div className="mt-6 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between gap-2"><h4 className="font-black">Mes demandes de recharge</h4><button type="button" onClick={() => { void supabase.rpc("mboa_my_token_topup_requests").then(({data}) => { if (data) setRequests(data as TopupRequest[]); }); }} className="text-xs font-bold text-[#d2f178]">Actualiser</button></div>
          {requests.length === 0 ? <p className="mt-3 text-xs text-white/40">Aucune demande envoyée pour le moment.</p> : <div className="mt-3 space-y-2">{requests.map((request) => <article key={request.id} className="rounded-xl bg-black/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{number.format(request.paid_amount_xaf)} FCFA · {number.format(request.tokens_requested)} jetons</strong><span className={"rounded-full px-2 py-1 text-[10px] font-black " + (request.status === "approved" ? "bg-emerald-300/10 text-emerald-200" : request.status === "rejected" ? "bg-red-300/10 text-red-200" : "bg-amber-300/10 text-amber-200")}>{request.status === "approved" ? "Validée" : request.status === "rejected" ? "Refusée" : "En attente"}</span></div>
            <p className="mt-1 text-[11px] text-white/45">{request.provider === "orange_money" ? "Orange Money" : "MTN MoMo"} · Réf. {request.payment_reference}</p>
            <p className="mt-1 text-[10px] text-white/35">{new Date(request.created_at).toLocaleString("fr-FR")}</p>
            {request.admin_note && <p className="mt-2 text-xs text-white/55">Note admin : {request.admin_note}</p>}
          </article>)}</div>}
        </div>
      </>}
    </section>
  );
}

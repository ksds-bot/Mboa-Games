"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Role = { key: string; label: string; description: string; permissions: string[] };
type Setting = { key: string; category: string; label: string; description: string; value: unknown; editable: boolean };
type Summary = { players: number; rooms: number; active_rooms: number; points_in_circulation: number; tokens_in_circulation: number };
type Snapshot = { roles: Role[]; permissions: string[]; roleCatalog: Role[]; summary: Summary; settings: Setting[] };
type Player = { id: string; username: string; displayName: string; createdAt: string; points: number; tokens: number; roles: string[] };
type Audit = { id: number; action: string; actor: string; targetUserId: string | null; entityType: string; entityId: string | null; details: Record<string, unknown>; createdAt: string };

const number = new Intl.NumberFormat("fr-FR");
const categoryLabels: Record<string, string> = { general: "Plateforme", games: "Jeux", wallet: "Points et jetons", payments: "Paiements" };

export default function AdminConsole() {
  const supabase = useMemo(() => createClient(), []);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("overview");
  const [selected, setSelected] = useState<Player | null>(null);
  const [asset, setAsset] = useState<"points" | "tokens">("tokens");
  const [amount, setAmount] = useState("100");
  const [reason, setReason] = useState("");
  const [paymentProvider, setPaymentProvider] = useState<"orange_money"|"mtn_momo"|"other">("orange_money");
  const [paymentReference, setPaymentReference] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutProvider, setPayoutProvider] = useState<"orange_money"|"mtn_momo"|"other">("orange_money");
  const [payoutGameType, setPayoutGameType] = useState("ludo");
  const [payoutRoomCode, setPayoutRoomCode] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [roleToAssign, setRoleToAssign] = useState("support_admin");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const has = useCallback((permission: string) => !!snapshot?.permissions?.includes("*") || !!snapshot?.permissions?.includes(permission), [snapshot]);

  const loadSnapshot = useCallback(async () => {
    const { data, error: rpcError } = await supabase.schema("private").rpc("admin_console_snapshot");
    if (rpcError) throw rpcError;
    setSnapshot(data as Snapshot);
  }, [supabase]);

  const loadPlayers = useCallback(async (query = search) => {
    const { data, error: rpcError } = await supabase.schema("private").rpc("admin_list_players", { p_search: query });
    if (rpcError) throw rpcError;
    setPlayers((data ?? []) as Player[]);
  }, [search, supabase]);

  const loadAudit = useCallback(async () => {
    const { data, error: rpcError } = await supabase.schema("private").rpc("admin_list_audit_logs", { p_limit: 60 });
    if (rpcError) throw rpcError;
    setAudit((data ?? []) as Audit[]);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await loadSnapshot();
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Accès administrateur refusé.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadSnapshot]);

  useEffect(() => {
    if (!snapshot) return;
    if (has("users.read")) void loadPlayers().catch((e) => setError(e.message));
    if (has("audit.read")) void loadAudit().catch((e) => setError(e.message));
  }, [snapshot, has, loadPlayers, loadAudit]);

  async function run(task: () => Promise<void>, success?: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await task();
      if (success) setNotice(success);
      await loadSnapshot();
      if (has("users.read")) await loadPlayers();
      if (has("audit.read")) await loadAudit();
      if (selected && has("users.read")) {
        const { data } = await supabase.schema("private").rpc("admin_list_players", { p_search: selected.username });
        const fresh = ((data ?? []) as Player[]).find((p) => p.id === selected.id);
        if (fresh) setSelected(fresh);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "L’opération a échoué.");
    } finally {
      setBusy(false);
    }
  }

  async function adjustBalance() {
    if (!selected) return;
    const parsed = Number(amount);
    if (!Number.isSafeInteger(parsed) || parsed === 0 || Math.abs(parsed) > 1000000) {
      setError("Entre un nombre entier entre -1 000 000 et 1 000 000, différent de zéro.");
      return;
    }
    if (reason.trim().length < 5) {
      setError("Précise un motif d’au moins 5 caractères pour garder une trace.");
      return;
    }
    if (asset === "tokens" && parsed > 0) {
      if (paymentReference.trim().length < 4) { setError("La référence du paiement Orange Money / MTN MoMo est obligatoire."); return; }
      await run(async () => {
        const { error: rpcError } = await supabase.schema("private").rpc("admin_credit_tokens_after_payment", {
          p_user_id: selected.id, p_amount: parsed, p_provider: paymentProvider,
          p_reference: paymentReference.trim(), p_note: reason.trim(),
        });
        if (rpcError) throw rpcError;
        setReason(""); setPaymentReference("");
      }, "Paiement vérifié : jetons crédités et opération auditée.");
      return;
    }
    await run(async () => {
      const { error: rpcError } = await supabase.schema("private").rpc("admin_adjust_balance", {
        p_user_id: selected.id, p_asset: asset, p_amount: parsed, p_reason: reason.trim(),
      });
      if (rpcError) throw rpcError;
      setReason("");
    }, parsed > 0 ? "Opération enregistrée dans le journal." : "Correction du solde enregistrée.");
  }

  async function recordPayout() {
    if (!selected) return;
    const parsed = Number(payoutAmount);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100000000) { setError("Entre un montant de paiement valide en FCFA."); return; }
    if (payoutReference.trim().length < 4) { setError("La référence du transfert au gagnant est obligatoire."); return; }
    await run(async () => {
      const { error: rpcError } = await supabase.schema("private").rpc("admin_record_manual_prize_payout", {
        p_user_id: selected.id, p_amount_xaf: parsed, p_provider: payoutProvider,
        p_reference: payoutReference.trim(), p_game_type: payoutGameType,
        p_room_code: payoutRoomCode.trim() || null, p_note: payoutNote.trim(),
      });
      if (rpcError) throw rpcError;
      setPayoutAmount(""); setPayoutReference(""); setPayoutRoomCode(""); setPayoutNote("");
    }, "Paiement manuel du gagnant enregistré et audité.");
  }

  async function saveSetting(setting: Setting, value: unknown) {
    await run(async () => {
      const { error: rpcError } = await supabase.schema("private").rpc("admin_update_setting", { p_key: setting.key, p_value: value });
      if (rpcError) throw rpcError;
    }, "Paramètre enregistré.");
  }

  async function setRole(player: Player, roleKey: string, enabled: boolean) {
    await run(async () => {
      const { error: rpcError } = await supabase.schema("private").rpc("admin_set_user_role", { p_user_id: player.id, p_role_key: roleKey, p_enabled: enabled });
      if (rpcError) throw rpcError;
    }, enabled ? "Rôle attribué." : "Rôle retiré.");
  }

  const settings = snapshot?.settings ?? [];
  const groupedSettings = useMemo(() => {
    const groups: Record<string, Setting[]> = {};
    for (const item of settings) (groups[item.category] ??= []).push(item);
    return groups;
  }, [settings]);

  if (loading) return <main className="min-h-screen bg-[#101a16] p-8 text-white"><p>Chargement de l’espace administrateur…</p></main>;

  if (!snapshot) return (
    <main className="min-h-screen bg-[#101a16] px-4 py-12 text-white">
      <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-[#1b2a22] p-8 text-center">
        <div className="text-4xl">🔐</div>
        <h1 className="mt-4 text-2xl font-black">Accès réservé à l’administration</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">{error || "Ce compte ne possède pas encore de rôle administrateur."}</p>
        <Link href="/profil" className="mt-6 inline-flex rounded-xl bg-[#d2f178] px-5 py-3 font-black text-[#172219]">Retour au profil</Link>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#101a16] px-3 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-xs font-black tracking-[.25em] text-[#d2f178]">MBOA GAMES · CONTRÔLE CENTRAL</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">Administration</h1><p className="mt-2 text-sm text-white/50">Gestion sécurisée des joueurs, soldes, jeux et paramètres.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/" className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white/75">⌂ Accueil</Link><Link href="/profil" className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-white/75">← Mon profil</Link></div>
        </header>

        <div className="mb-5 flex flex-wrap gap-2">
          {snapshot.roles.map((role) => <span key={role.key} className="rounded-full border border-[#d2f178]/25 bg-[#d2f178]/10 px-3 py-2 text-xs font-bold text-[#d2f178]">{role.label}</span>)}
        </div>

        <nav className="mb-6 flex flex-wrap gap-2" aria-label="Navigation administration">
          {[["overview","Vue d’ensemble"],["players","Joueurs & soldes"],["settings","Paramètres"],["audit","Journal"],["roles","Rôles"]].map(([key,label]) =>
            <button key={key} onClick={() => setTab(key)} className={"rounded-xl px-4 py-3 text-sm font-black " + (tab===key ? "bg-[#d2f178] text-[#172219]" : "border border-white/10 bg-white/[.04] text-white/65")}>{label}</button>
          )}
        </nav>

        {error && <div role="alert" className="mb-4 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>}
        {notice && <div role="status" className="mb-4 rounded-xl border border-[#d2f178]/25 bg-[#d2f178]/10 p-3 text-sm text-[#e7f7c2]">{notice}</div>}

        {tab === "overview" && (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Joueurs", snapshot.summary.players, "👥"],
              ["Salles créées", snapshot.summary.rooms, "🎮"],
              ["Parties en cours", snapshot.summary.active_rooms, "🟢"],
              ["Points en circulation", snapshot.summary.points_in_circulation, "⭐"],
              ["Jetons en circulation", snapshot.summary.tokens_in_circulation, "🪙"],
            ].map(([label,value,emoji]) => <article key={String(label)} className="rounded-2xl border border-white/10 bg-[#1b2a22] p-5"><span className="text-2xl">{emoji}</span><p className="mt-4 text-xs font-bold text-white/45">{label}</p><strong className="mt-1 block text-2xl font-black">{number.format(Number(value))}</strong></article>)}
            <article className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5 sm:col-span-2 xl:col-span-5"><strong className="text-amber-200">Paiements réels désactivés</strong><p className="mt-1 text-sm leading-6 text-white/55">Les dépôts, retraits et encaissements restent verrouillés jusqu’à l’intégration d’un prestataire, la vérification des webhooks et la validation de sécurité/réglementaire.</p></article>
          </section>
        )}

        {tab === "players" && (
          <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
            <div className="rounded-2xl border border-white/10 bg-[#1b2a22] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Comptes joueurs</h2><p className="mt-1 text-xs text-white/45">100 comptes maximum par recherche.</p></div><span className="text-xs text-white/40">{players.length} résultat(s)</span></div>
              <div className="mt-4 flex gap-2"><input value={search} onChange={(e)=>setSearch(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter")void run(()=>loadPlayers(search));}} placeholder="Rechercher un pseudo…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm outline-none focus:border-[#d2f178]"/><button disabled={busy} onClick={()=>void run(()=>loadPlayers(search))} className="rounded-xl bg-[#d2f178] px-4 text-sm font-black text-[#172219]">Chercher</button></div>
              <div className="mt-4 space-y-2">{players.map((player)=><button key={player.id} onClick={()=>setSelected(player)} className={"w-full rounded-xl border p-3 text-left "+(selected?.id===player.id?"border-[#d2f178]/60 bg-[#d2f178]/10":"border-white/5 bg-black/15 hover:bg-white/[.05]")}><div className="flex items-center justify-between gap-3"><strong className="truncate text-sm">{player.username}</strong><span className="text-[10px] text-white/35">{player.roles?.length?player.roles.join(", "):"Joueur"}</span></div><div className="mt-2 flex flex-wrap gap-3 text-[11px] text-white/55"><span>⭐ {number.format(player.points)}</span><span>🪙 {number.format(player.tokens)}</span></div></button>)}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#1b2a22] p-5">
              <h2 className="text-xl font-black">Opérations sur le compte</h2>
              {!selected ? <p className="mt-4 text-sm text-white/45">Sélectionne un joueur pour gérer ses points cadeaux ou ses jetons de courtoisie.</p> : <>
                <div className="mt-4 rounded-xl bg-black/20 p-4"><strong>{selected.username}</strong><p className="mt-1 break-all text-[10px] text-white/35">{selected.id}</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><span>Points : <b>{number.format(selected.points)}</b></span><span>Jetons : <b>{number.format(selected.tokens)}</b></span></div></div>
                {(has("wallet.points.adjust")||has("wallet.tokens.adjust")) ? <>
                  <label className="mt-4 block text-xs font-bold text-white/55">Actif à ajuster</label><select value={asset} onChange={(e)=>setAsset(e.target.value as "points"|"tokens")} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"><option value="points" disabled={!has("wallet.points.adjust")}>Points cadeaux</option><option value="tokens" disabled={!has("wallet.tokens.adjust")}>Jetons (crédit manuel après vérification)</option></select>
                  <label className="mt-4 block text-xs font-bold text-white/55">Quantité (+ pour offrir, − pour corriger)</label><input value={amount} onChange={(e)=>setAmount(e.target.value)} inputMode="numeric" className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"/>
                  {asset === "tokens" && Number(amount) > 0 && <>
                    <label className="mt-4 block text-xs font-bold text-white/55">Paiement reçu via</label>
                    <select value={paymentProvider} onChange={(e)=>setPaymentProvider(e.target.value as typeof paymentProvider)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"><option value="orange_money">Orange Money</option><option value="mtn_momo">MTN MoMo</option><option value="other">Autre</option></select>
                    <label className="mt-4 block text-xs font-bold text-white/55">Référence du paiement vérifié</label>
                    <input value={paymentReference} onChange={(e)=>setPaymentReference(e.target.value)} maxLength={120} placeholder="Référence de transaction" className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"/>
                  </>}
                  <label className="mt-4 block text-xs font-bold text-white/55">Motif / note obligatoire</label><textarea value={reason} onChange={(e)=>setReason(e.target.value)} maxLength={180} placeholder="Ex. paiement reçu et vérifié, correction…" className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"/>
                  <button disabled={busy||reason.trim().length<5||(asset==="tokens"&&Number(amount)>0&&paymentReference.trim().length<4)} onClick={()=>void adjustBalance()} className="mt-4 w-full rounded-xl bg-[#d2f178] px-4 py-3 font-black text-[#172219]">{busy?"Traitement…":"Valider l’opération"}</button>
                  <p className="mt-3 text-[11px] leading-5 text-white/40">Chaque mouvement est inscrit dans le portefeuille et le journal d’audit. Aucun solde d’argent réel n’est conservé dans le compte joueur.</p>
                </> : <p className="mt-4 text-sm text-white/45">Ton rôle ne permet pas d’ajuster les soldes.</p>}
              </>}
                {has("wallet.tokens.adjust") && <>
                  <div className="my-6 border-t border-white/10 pt-5">
                    <h3 className="font-black">Enregistrer le paiement d’un gagnant</h3>
                    <p className="mt-1 text-xs leading-5 text-white/45">Effectue d’abord le transfert Orange Money / MTN MoMo hors application, puis consigne sa référence ici. Aucun solde FCFA joueur n’est créé.</p>
                    <label className="mt-3 block text-xs font-bold text-white/55">Montant payé (FCFA)</label><input value={payoutAmount} onChange={(e)=>setPayoutAmount(e.target.value)} inputMode="numeric" className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"/>
                    <label className="mt-3 block text-xs font-bold text-white/55">Opérateur</label><select value={payoutProvider} onChange={(e)=>setPayoutProvider(e.target.value as typeof payoutProvider)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"><option value="orange_money">Orange Money</option><option value="mtn_momo">MTN MoMo</option><option value="other">Autre</option></select>
                    <label className="mt-3 block text-xs font-bold text-white/55">Référence du transfert</label><input value={payoutReference} onChange={(e)=>setPayoutReference(e.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"/>
                    <label className="mt-3 block text-xs font-bold text-white/55">Jeu</label><select value={payoutGameType} onChange={(e)=>setPayoutGameType(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"><option value="ludo">Ludo</option><option value="cartes">CHECK!</option><option value="des">Le 2 Dès</option><option value="damier">Damier</option><option value="quiz">Quiz 237</option><option value="adages">Adages</option></select>
                    <label className="mt-3 block text-xs font-bold text-white/55">Code de salle (facultatif)</label><input value={payoutRoomCode} onChange={(e)=>setPayoutRoomCode(e.target.value)} maxLength={20} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"/>
                    <label className="mt-3 block text-xs font-bold text-white/55">Note (facultatif)</label><textarea value={payoutNote} onChange={(e)=>setPayoutNote(e.target.value)} maxLength={180} className="mt-2 min-h-20 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm"/>
                    <button disabled={busy||Number(payoutAmount)<1||payoutReference.trim().length<4} onClick={()=>void recordPayout()} className="mt-4 w-full rounded-xl border border-[#d2f178]/30 bg-[#d2f178]/10 px-4 py-3 font-black text-[#d2f178]">Enregistrer le paiement effectué</button>
                  </div>
                </>}
            </div>
          </section>
        )}

        {tab === "settings" && (
          <section className="space-y-4">
            {Object.entries(groupedSettings).map(([category,items])=><div key={category} className="rounded-2xl border border-white/10 bg-[#1b2a22] p-5"><h2 className="text-lg font-black">{categoryLabels[category]??category}</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{items.map((setting)=><div key={setting.key} className="rounded-xl bg-black/15 p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{setting.label}</strong><p className="mt-1 text-xs leading-5 text-white/45">{setting.description}</p></div>{typeof setting.value==="boolean"?<button disabled={!setting.editable||busy||!(category==="games"?has("games.settings.manage"):category==="wallet"?has("wallet.settings.manage"):category==="payments"?has("payments.settings.manage"):has("settings.manage"))} onClick={()=>void saveSetting(setting,!setting.value)} className={"shrink-0 rounded-full px-3 py-2 text-xs font-black "+(setting.value?"bg-[#d2f178] text-[#172219]":"bg-white/10 text-white/60")}>{setting.value?"Activé":"Désactivé"}</button>:<div className="text-right"><strong className="text-sm">{String(setting.value)}</strong>{setting.editable&&<p className="mt-1 text-[10px] text-white/35">Valeur actuelle</p>}</div>}</div>{!setting.editable&&<p className="mt-3 text-[10px] font-bold text-amber-200/75">Verrouillé jusqu’à validation technique</p>}</div>)}</div></div>)}
          </section>
        )}

        {tab === "audit" && (
          <section className="rounded-2xl border border-white/10 bg-[#1b2a22] p-5"><h2 className="text-xl font-black">Journal des opérations</h2><p className="mt-1 text-xs text-white/45">Historique des cadeaux, corrections, changements de rôles et paramètres.</p>{has("audit.read")? <div className="mt-4 space-y-2">{audit.map((item)=><article key={item.id} className="rounded-xl bg-black/15 p-3"><div className="flex flex-wrap justify-between gap-2"><strong className="text-sm">{item.action}</strong><time className="text-[10px] text-white/40">{new Date(item.createdAt).toLocaleString("fr-FR")}</time></div><p className="mt-1 text-xs text-white/55">Par {item.actor} · {item.entityType} {item.entityId??""}</p><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-[10px] text-white/35">{JSON.stringify(item.details)}</pre></article>)}</div>:<p className="mt-4 text-sm text-white/45">Ton rôle ne permet pas de consulter le journal.</p>}</section>
        )}

        {tab === "roles" && (
          <section className="rounded-2xl border border-white/10 bg-[#1b2a22] p-5"><h2 className="text-xl font-black">Rôles et autorisations</h2><p className="mt-1 text-xs text-white/45">Les rôles sont contrôlés par la base de données. Un compte ne peut pas s’accorder de privilèges.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">{(snapshot.roleCatalog.length?snapshot.roleCatalog:snapshot.roles).map((role)=><article key={role.key} className="rounded-xl bg-black/15 p-4"><strong>{role.label}</strong><p className="mt-1 text-xs text-white/45">{role.description}</p><p className="mt-3 text-[10px] leading-5 text-white/35">{role.permissions.join(" · ")}</p></article>)}</div>
            {has("roles.manage") ? <div className="mt-6 rounded-xl border border-[#d2f178]/20 bg-[#d2f178]/[.04] p-4"><h3 className="font-black">Attribuer un rôle</h3><p className="mt-1 text-xs text-white/45">Choisis d’abord un joueur dans l’onglet Joueurs & soldes, puis sélectionne un rôle.</p>{selected&&<><p className="mt-3 text-sm">Compte sélectionné : <b>{selected.username}</b></p><select value={roleToAssign} onChange={(e)=>setRoleToAssign(e.target.value)} className="mt-3 w-full rounded-xl border border-white/10 bg-[#101a16] p-3 text-sm">{snapshot.roleCatalog.map((r)=><option key={r.key} value={r.key}>{r.label}</option>)}</select><div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void setRole(selected,roleToAssign,true)} className="rounded-xl bg-[#d2f178] px-4 py-3 text-sm font-black text-[#172219]">Attribuer</button><button disabled={busy} onClick={()=>void setRole(selected,roleToAssign,false)} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold">Retirer</button></div></>}</div>:<p className="mt-5 text-sm text-white/45">La gestion des rôles est réservée au super administrateur.</p>}
          </section>
        )}
        <footer className="mt-8 border-t border-white/10 pt-4 text-center text-[11px] text-white/30">Mboa Games · Console d’administration · Toutes les opérations sensibles sont journalisées</footer>
      </div>
    </main>
  );
}

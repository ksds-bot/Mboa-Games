"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Card, Suit } from "@/lib/check-engine";

type RoomPlayer = { userId: string; seat: number; ready: boolean; username: string };
type Room = { id: string; code: string; gameType: string; status: "waiting" | "playing" | "finished"; maxPlayers: number; hostId: string };
type CheckState = {
  players: Array<{ id: string; name: string; hand: Card[]; cardCount: number }>;
  drawPile: Card[];
  drawCount: number;
  discardPile: Card[];
  currentPlayerIndex: number;
  pendingDraw: number;
  chosenSuit: Suit | null;
  checkRequiredFor: string | null;
  status: "playing" | "finished";
  winnerId: string | null;
  turnNumber: number;
  lastAction: string;
  canPassAfterDraw?: boolean;
};
type Snapshot = { room: Room; players: RoomPlayer[] };
type RoomMessage = { id: string; userId: string; username: string; content: string; createdAt: string };
const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const SUIT_LABEL: Record<Suit, string> = { hearts: "Cœur", diamonds: "Carreau", clubs: "Trèfle", spades: "Pique" };
const SUIT_SYMBOL: Record<Suit, string> = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
const SUIT_COLOR: Record<Suit, string> = { hearts: "text-rose-600", diamonds: "text-rose-600", clubs: "text-slate-950", spades: "text-slate-950" };

function Face({ card, back = false }: { card?: Card; back?: boolean }) {
  if (back || !card) return <div className="grid h-[104px] w-[70px] place-items-center rounded-xl border border-white/30 bg-gradient-to-br from-[#d5e8a2] to-[#8baf49] text-3xl text-[#183022] shadow-lg">✦</div>;
  return <div className="flex h-[104px] w-[70px] shrink-0 flex-col justify-between rounded-xl border border-slate-200 bg-[#fffdf6] p-2 font-black shadow-lg">
    <span className={`text-sm leading-none ${SUIT_COLOR[card.suit]}`}>{card.rank}</span>
    <span className={`self-center text-3xl leading-none ${SUIT_COLOR[card.suit]}`}>{SUIT_SYMBOL[card.suit]}</span>
    <span className={`rotate-180 self-end text-sm leading-none ${SUIT_COLOR[card.suit]}`}>{card.rank}</span>
  </div>;
}

export default function CheckOnline({ onBack }: { onBack: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [game, setGame] = useState<CheckState | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [selectedAce, setSelectedAce] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("Crée une salle ou rejoins un ami avec son code.");

  const refreshChat = useCallback(async (code: string) => {
    const { data, error: chatError } = await supabase.rpc("mboa_chat_history", { p_code: code });
    if (chatError) throw chatError;
    setMessages((Array.isArray(data) ? [...data] : []).reverse() as RoomMessage[]);
  }, [supabase]);

  const refresh = useCallback(async (code: string) => {
    const { data, error: roomError } = await supabase.rpc("mboa_room_snapshot", { p_code: code });
    if (roomError) throw roomError;
    const next = data as Snapshot;
    setSnapshot(next);
    await refreshChat(code);
    if (next.room.status !== "waiting") {
      const { data: state, error: stateError } = await supabase.rpc("mboa_check_snapshot", { p_code: code });
      if (stateError) throw stateError;
      setGame(state as CheckState | null);
    } else {
      setGame(null);
    }
  }, [supabase, refreshChat]);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUserId(data.user?.id ?? "");
      setAuthReady(true);
    });
    return () => { alive = false; };
  }, [supabase]);

  useEffect(() => {
    if (!snapshot?.room.id) return;
    const roomId = snapshot.room.id;
    const code = snapshot.room.code;
    const channel = supabase.channel(`check-room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` }, () => { void refresh(code); })
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, () => { void refresh(code); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_sessions", filter: `room_id=eq.${roomId}` }, () => { void refresh(code); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, () => { void refreshChat(code); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [snapshot?.room.id, snapshot?.room.code, refresh, refreshChat, supabase]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await task(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Une erreur est survenue."); }
    finally { setBusy(false); }
  }

  async function createRoom() {
    await run(async () => {
      const { data, error: rpcError } = await supabase.rpc("mboa_create_room", { p_game_type: "cartes", p_max_players: 2 });
      if (rpcError) throw rpcError;
      await refresh((data as { code: string }).code);
      setNotice("Salle créée. Envoie le code à ton adversaire.");
    });
  }

  async function joinRoom() {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) { setError("Entre un code de salle valide."); return; }
    await run(async () => {
      const { data, error: rpcError } = await supabase.rpc("mboa_join_room", { p_code: code, p_game_type: "cartes" });
      if (rpcError) throw rpcError;
      await refresh((data as { code: string }).code);
      setNotice("Tu as rejoint la salle. Prépare-toi à jouer !");
    });
  }

  async function toggleReady() {
    if (!snapshot) return;
    await run(async () => {
      const me = snapshot.players.find((p) => p.userId === userId);
      const { error: rpcError } = await supabase.rpc("mboa_set_ready", { p_code: snapshot.room.code, p_ready: !me?.ready });
      if (rpcError) throw rpcError;
      await refresh(snapshot.room.code);
    });
  }

  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!snapshot || !content || busy) return;
    await run(async () => {
      const { error: rpcError } = await supabase.rpc("mboa_send_chat", { p_code: snapshot.room.code, p_body: content });
      if (rpcError) throw rpcError;
      setDraft("");
      await refreshChat(snapshot.room.code);
    });
  }

  async function startGame() {
    if (!snapshot) return;
    await run(async () => {
      const { error: rpcError } = await supabase.rpc("mboa_check_start", { p_code: snapshot.room.code });
      if (rpcError) throw rpcError;
      await refresh(snapshot.room.code);
      setNotice("La partie est lancée. Bonne chance !");
    });
  }

  async function action(type: "draw" | "pass" | "announce" | "finish" | "play", cardId?: string, chosenSuit?: Suit) {
    if (!snapshot) return;
    await run(async () => {
      const { data, error: rpcError } = await supabase.rpc("mboa_check_action", {
        p_code: snapshot.room.code,
        p_action: { type, ...(cardId ? { cardId } : {}), ...(chosenSuit ? { chosenSuit } : {}) },
      });
      if (rpcError) throw rpcError;
      setGame(data as CheckState);
      setSelectedAce(null);
      setNotice((data as CheckState).lastAction);
    });
  }

  const me = snapshot?.players.find((p) => p.userId === userId);
  const isHost = snapshot?.room.hostId === userId;
  const currentPlayer = game?.players[game.currentPlayerIndex];
  const myTurn = !!game && currentPlayer?.id === userId && game.status === "playing";
  const top = game?.discardPile[game.discardPile.length - 1];
  const myHand = game?.players.find((p) => p.id === userId)?.hand ?? [];
  const playable = (card: Card) => {
    if (!game || !top) return false;
    if (game.pendingDraw > 0) return card.rank === "2";
    if (card.rank === "A") return true;
    return card.suit === (game.chosenSuit ?? top.suit) || card.rank === top.rank;
  };
  const canStart = snapshot?.players.length === 2 && snapshot.players.every((p) => p.ready);

  if (!authReady) return <div className="mx-auto max-w-5xl p-8 text-white">Chargement…</div>;

  return <main className="mboa-app-surface min-h-screen bg-[#0c1713] px-3 py-5 text-white sm:px-6">
    <div className="mx-auto max-w-5xl">
      <button onClick={onBack} className="text-sm font-bold text-white/60 hover:text-white">← Retour au mode Mboma</button>
      <header className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[.25em] text-[#c8f169]">Mboa Games · Multijoueur</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">CHECK! à distance 🇨🇲</h1><p className="mt-1 text-sm text-white/55">Deux joueurs, deux appareils, une seule partie synchronisée.</p></div>
        <span className="rounded-full border border-[#c8f169]/20 bg-[#c8f169]/10 px-4 py-2 text-xs font-bold text-[#d7f89b]">Partie privée · 2 joueurs</span>
      </header>

      {!userId ? <section className="mt-7 rounded-3xl border border-white/10 bg-[#192722] p-6">
        <p className="text-white/70">Connecte-toi à ton compte pour créer une salle ou rejoindre ton adversaire.</p>
        <Link href="/connexion?mode=login" className="mt-4 inline-flex rounded-xl bg-[#c8f169] px-5 py-3 font-black text-[#102018]">Se connecter</Link>
      </section> : !snapshot ? <section className="mt-7 grid gap-4 rounded-3xl border border-white/10 bg-[#192722] p-6 sm:grid-cols-2">
        <div><h2 className="text-xl font-black">Créer une salle</h2><p className="mt-2 text-sm text-white/55">Tu seras l’hôte. Partage le code avec ton adversaire.</p><button disabled={busy} onClick={() => void createRoom()} className="mt-5 w-full rounded-xl bg-[#c8f169] px-5 py-3 font-black text-[#102018] disabled:opacity-50">{busy ? "Création…" : "Créer une salle privée"}</button></div>
        <div><h2 className="text-xl font-black">Rejoindre une salle</h2><p className="mt-2 text-sm text-white/55">Entre le code communiqué par l’hôte.</p><input value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} onKeyDown={(e) => { if (e.key === "Enter") void joinRoom(); }} placeholder="CODE DE SALLE" className="mt-4 w-full rounded-xl border border-white/15 bg-[#101b18] px-4 py-3 font-black tracking-[.2em] text-white outline-none focus:border-[#c8f169]/60"/><button disabled={busy} onClick={() => void joinRoom()} className="mt-3 w-full rounded-xl border border-white/15 px-5 py-3 font-black disabled:opacity-50">Rejoindre</button></div>
      </section> : <>
        <section className="mt-6 rounded-3xl border border-[#c8f169]/20 bg-[#192722] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-[#c8f169]">Code à partager</p><p className="mt-2 text-3xl font-black tracking-[.3em]">{snapshot.room.code}</p></div><button onClick={() => void navigator.clipboard.writeText(snapshot.room.code)} className="rounded-xl border border-white/15 px-4 py-2 text-xs font-bold">Copier le code</button></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">{snapshot.players.map((p) => <div key={p.userId} className="flex items-center justify-between rounded-xl bg-black/20 px-4 py-3"><span className="font-bold">{p.username}{p.userId === userId ? " (toi)" : ""}</span><span className={p.ready ? "text-xs font-black text-[#c8f169]" : "text-xs text-white/45"}>{p.ready ? "Prêt ✓" : "En attente"}</span></div>)}</div>
          {snapshot.room.status === "waiting" && <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => void toggleReady()} className="rounded-xl border border-[#c8f169]/35 bg-[#c8f169]/10 px-5 py-3 text-sm font-black text-[#d7f89b]">{me?.ready ? "Annuler ma préparation" : "Je suis prêt"}</button>{isHost && <button disabled={busy || !canStart} onClick={() => void startGame()} className="rounded-xl bg-[#c8f169] px-5 py-3 text-sm font-black text-[#102018]">Démarrer CHECK!</button>}</div>}
          {snapshot.room.status === "waiting" && <p className="mt-3 text-xs text-white/45">{snapshot.players.length < 2 ? "En attente du deuxième joueur." : !canStart ? "Les deux joueurs doivent être prêts." : "Tout le monde est prêt : lance la partie !"}</p>}
        </section>

        {game && <section className="mt-5 rounded-[2rem] border border-[#c8f169]/15 bg-[radial-gradient(ellipse_at_center,#24543b_0%,#153b2b_55%,#102b20_100%)] p-4 shadow-2xl sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-black text-white/50">TOUR {game.turnNumber}</p><h2 className="mt-1 text-xl font-black">{currentPlayer?.name ?? "Joueur"} {myTurn ? "· À toi !" : "· À son tour"}</h2></div><span className="rounded-full bg-black/20 px-4 py-2 text-xs font-bold">{game.drawCount} cartes dans la pioche</span></div>
          <div className="flex min-h-[190px] flex-wrap items-center justify-center gap-5 py-7"><button disabled={!myTurn || busy || (game.pendingDraw === 0 && myHand.some(playable))} onClick={() => void action("draw")} className="flex h-[104px] w-[70px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/40 bg-[#173b2b] text-3xl disabled:opacity-40"><span>🂠</span><span className="mt-1 text-[10px] font-black">PIOCHER</span></button>{top && <div className="text-center"><Face card={top}/><p className="mt-2 text-[10px] font-bold text-white/65">DÉFAUSSE</p></div>}{game.chosenSuit && <p className="rounded-xl bg-black/25 px-3 py-2 text-xs font-bold">Couleur demandée : {SUIT_LABEL[game.chosenSuit]}</p>}</div>
          {game.pendingDraw > 0 && <p className="mb-4 text-center text-sm font-black text-orange-200">Pénalité : +{game.pendingDraw} cartes · seul un 2 peut répondre</p>}
          <p className="rounded-2xl bg-black/20 p-3 text-center text-sm text-white/85" aria-live="polite">{game.lastAction}</p>
          {game.canPassAfterDraw && myTurn && <button disabled={busy} onClick={() => void action("pass")} className="mt-4 block w-full rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white/80 disabled:opacity-50">Passer mon tour</button>}
        </section>}

        {game && <section className="mt-5 rounded-3xl border border-white/10 bg-[#192722] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-white/45">TA MAIN</p><h2 className="text-xl font-black">{game.players.find(p => p.id === userId)?.name ?? "Joueur"} · {myHand.length} cartes</h2></div></div>
          <div className="mt-5 flex min-h-[115px] flex-wrap justify-center gap-2 sm:justify-start">{myHand.map(card => <button key={card.id} disabled={!myTurn || busy || !playable(card) || Boolean(game.checkRequiredFor)} onClick={() => card.rank === "A" ? setSelectedAce(card.id) : void action("play", card.id)} className={`rounded-xl transition ${playable(card) && myTurn ? "hover:-translate-y-2 hover:scale-105" : "opacity-40 grayscale"} ${selectedAce === card.id ? "ring-4 ring-[#c8f169]" : ""}`} aria-label={`${card.rank} de ${SUIT_LABEL[card.suit]}`}><Face card={card}/></button>)}</div>
          {selectedAce && <div className="mt-4 rounded-2xl border border-[#c8f169]/30 bg-black/20 p-4"><p className="text-sm font-bold">Choisis la couleur demandée :</p><div className="mt-3 flex flex-wrap gap-2">{SUITS.map(suit => <button key={suit} disabled={busy} onClick={() => void action("play", selectedAce, suit)} className="rounded-xl bg-white px-4 py-2 font-black text-slate-900">{SUIT_SYMBOL[suit]} {SUIT_LABEL[suit]}</button>)}</div></div>}
          {game.checkRequiredFor === userId && <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={() => void action("announce")} className="rounded-xl bg-[#c8f169] px-5 py-3 font-black text-[#101b18]">📣 ANNONCER CHECK !</button><button disabled={busy} onClick={() => void action("finish")} className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold">Oublier (piocher 2)</button></div>}
          {game.status === "finished" && <div className="mt-5 rounded-2xl border border-[#c8f169]/40 bg-[#c8f169]/10 p-5 text-center"><div className="text-4xl">🏆</div><h2 className="mt-2 text-2xl font-black">{game.winnerId === userId ? "Tu as gagné !" : "Ton adversaire a gagné !"}</h2><p className="mt-1 text-sm text-white/65">Partie terminée · {game.turnNumber} tours joués</p></div>}
        </section>}
      </>}

      {snapshot && <section className="mt-5 rounded-3xl border border-white/10 bg-[#192722] p-5">
        <h2 className="font-black">💬 Le coin des joueurs</h2>
        <div className="mt-3 flex max-h-56 flex-col gap-2 overflow-y-auto rounded-xl bg-black/20 p-3" aria-live="polite">
          {messages.length ? messages.map(message => <div key={message.id} className={`max-w-[90%] rounded-xl px-3 py-2 text-xs ${message.userId === userId ? "self-end bg-[#c8f169]/15 text-[#e8f7c5]" : "self-start bg-white/[.07] text-white/80"}`}><p className="mb-1 text-[10px] font-black text-[#c8f169]">{message.userId === userId ? "Toi" : message.username}</p><p className="break-words">{message.content}</p></div>) : <p className="py-5 text-center text-xs text-white/35">Les premiers messages apparaîtront ici 👋</p>}
        </div>
        <div className="mt-3 flex gap-2"><input value={draft} maxLength={180} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void sendMessage(); } }} placeholder="Écris un petit message…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0e1914] px-3 py-3 text-xs text-white outline-none focus:border-[#c8f169]/60"/><button disabled={busy || !draft.trim()} onClick={() => void sendMessage()} className="rounded-xl bg-[#c8f169] px-4 text-xs font-black text-[#102018] disabled:opacity-40">Envoyer</button></div>
        <div className="mt-3 flex flex-wrap gap-2">{["Ça chauffe ! 🔥","Ekié ! 😂","On est ensemble 🤝"].map(message => <button key={message} disabled={busy} onClick={() => void sendMessage(message)} className="rounded-full border border-white/10 px-3 py-2 text-[10px] text-white/60 hover:bg-white/5">{message}</button>)}</div>
      </section>}
      {notice && <p className="mt-5 text-center text-sm text-white/55" aria-live="polite">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
      <p className="mt-8 text-center text-xs text-white/35">Mboa Games · CHECK! multijoueur · Les cartes privées restent visibles uniquement par leur propriétaire.</p>
    </div>
  </main>;
}

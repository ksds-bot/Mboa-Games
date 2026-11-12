"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Check, Copy, DoorOpen, LoaderCircle, MessageCircle, Send, Users, Wifi } from "lucide-react";

type GameType = "ludo" | "cartes" | "des" | "damier" | "quiz" | "adages";
type RoomPlayer = { userId: string; seat: number; ready: boolean; username: string };
type RoomSnapshot = {
  room: { id: string; code: string; gameType: GameType; status: "waiting" | "playing" | "finished"; maxPlayers: number; hostId: string };
  players: RoomPlayer[];
};
type RoomMessage = { id: string; userId: string; username: string; content: string; createdAt: string };

const GAME_LABELS: Record<GameType, string> = {
  ludo: "Ludo", cartes: "CHECK!", des: "Le 2 Dès",
  damier: "Damier", quiz: "Quiz 237", adages: "Adages",
};

export default function GameRoomPanel({
  gameType,
  gameName,
  maxPlayers = 4,
}: {
  gameType: GameType;
  gameName?: string;
  maxPlayers?: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState("");
  const [authReady, setAuthReady] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const roomCode = snapshot?.room.code ?? "";
  const myPlayer = snapshot?.players.find((player) => player.userId === userId);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUserId(data.user?.id ?? "");
      setAuthReady(true);
    });
    return () => { alive = false; };
  }, [supabase]);

  const refreshRoom = useCallback(async (code: string) => {
    const [{ data: roomData, error: roomError }, { data: chatData, error: chatError }] = await Promise.all([
      supabase.rpc("mboa_room_snapshot", { p_code: code }),
      supabase.rpc("mboa_chat_history", { p_code: code }),
    ]);
    if (roomError) throw roomError;
    if (chatError) throw chatError;
    setSnapshot(roomData as RoomSnapshot);
    setMessages((Array.isArray(chatData) ? [...chatData] : []).reverse() as RoomMessage[]);
  }, [supabase]);

  const openRoom = useCallback(async (code: string) => {
    setBusy(true);
    setError("");
    try {
      await refreshRoom(code);
      setCodeInput(code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de charger cette salle.");
    } finally {
      setBusy(false);
    }
  }, [refreshRoom]);

  useEffect(() => {
    if (!snapshot?.room.id) return;
    const roomId = snapshot.room.id;
    const channel = supabase.channel(`mboa-room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` }, () => { void refreshRoom(roomCode); })
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, () => { void refreshRoom(roomCode); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, () => { void refreshRoom(roomCode); })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => {
      setConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [snapshot?.room.id, roomCode, supabase, refreshRoom]);

  async function createRoom() {
    setBusy(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("mboa_create_room", {
        p_game_type: gameType,
        p_max_players: maxPlayers,
      });
      if (rpcError) throw rpcError;
      const room = data as { code: string };
      await openRoom(room.code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de créer la salle.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) { setError("Entre un code de salle valide."); return; }
    setBusy(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("mboa_join_room", { p_code: code });
      if (rpcError) throw rpcError;
      const room = data as { gameType: GameType; code: string };
      if (room.gameType !== gameType) {
        throw new Error(`Ce code correspond au jeu ${GAME_LABELS[room.gameType] ?? room.gameType}, pas à ${gameName ?? GAME_LABELS[gameType]}.`);
      }
      await openRoom(room.code);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de rejoindre cette salle.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleReady() {
    if (!myPlayer || !roomCode) return;
    setBusy(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("mboa_set_ready", {
        p_code: roomCode,
        p_ready: !myPlayer.ready,
      });
      if (rpcError) throw rpcError;
      await refreshRoom(roomCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de modifier ton statut.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(value = draft) {
    const content = value.trim();
    if (!content || !roomCode || busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("mboa_send_chat", {
        p_code: roomCode,
        p_body: content,
      });
      if (rpcError) throw rpcError;
      setDraft("");
      await refreshRoom(roomCode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message non envoyé.");
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) {
    return <div className="my-6 rounded-2xl border border-white/10 bg-black/15 p-5 text-sm text-white/55"><LoaderCircle className="mr-2 inline animate-spin" size={16}/>Chargement des salles…</div>;
  }

  return (
    <section className="my-7 rounded-2xl border border-[#c8f169]/20 bg-[#17251e] p-4 text-white shadow-xl sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-[#c8f169]">Multijoueur Mboa</p>
          <h2 className="mt-1 text-xl font-black">Jouer à distance · {gameName ?? GAME_LABELS[gameType]}</h2>
          <p className="mt-1 text-xs text-white/50">Crée une salle privée ou rejoins tes amis avec leur code.</p>
        </div>
        {snapshot && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-[10px] font-bold text-white/65"><Wifi size={13} className={connected ? "text-[#c8f169]" : "text-amber-300"}/>{connected ? "Synchronisé" : "Connexion…"}</span>}
      </div>

      {!userId ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-4 text-sm text-white/70">
          Connecte-toi pour créer une salle ou rejoindre une partie à distance.
          <Link className="ml-2 font-black text-[#d7f89b] underline" href="/connexion?mode=login">Se connecter</Link>
        </div>
      ) : !snapshot ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="flex min-w-0 gap-2">
            <input
              aria-label="Code de salle"
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
              onKeyDown={(event) => { if (event.key === "Enter") void joinRoom(); }}
              placeholder="CODE DE SALLE"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0e1914] px-4 py-3 text-sm font-black tracking-[.2em] text-white outline-none focus:border-[#c8f169]/60"
            />
            <button type="button" disabled={busy} onClick={() => void joinRoom()} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-black hover:bg-white/5 disabled:opacity-50"><DoorOpen size={17}/></button>
          </div>
          <button type="button" disabled={busy} onClick={() => void createRoom()} className="rounded-xl bg-[#c8f169] px-5 py-3 text-sm font-black text-[#102018] hover:brightness-110 disabled:opacity-50">
            {busy ? <LoaderCircle className="mr-2 inline animate-spin" size={16}/> : <Users className="mr-2 inline" size={16}/>}Créer une salle
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
          <div className="rounded-xl border border-white/10 bg-black/15 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-[#c8f169]">Code à partager</span>
              <button type="button" onClick={() => { void navigator.clipboard.writeText(roomCode); setCopied(true); }} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-bold">{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? "Copié" : "Copier"}</button>
            </div>
            <p className="my-3 text-3xl font-black tracking-[.3em] text-white">{roomCode}</p>
            <div className="flex items-center justify-between text-xs text-white/55"><span>Joueurs</span><strong>{snapshot.players.length}/{snapshot.room.maxPlayers}</strong></div>
            <div className="mt-3 space-y-2">
              {snapshot.players.map((player) => (
                <div key={player.userId} className="flex items-center justify-between rounded-lg bg-white/[.05] px-3 py-2">
                  <span className="truncate text-sm font-bold">{player.username}{player.userId === userId ? " (toi)" : ""}</span>
                  <span className={player.ready ? "text-xs font-black text-[#c8f169]" : "text-xs text-white/40"}>{player.ready ? "Prêt ✓" : "En attente"}</span>
                </div>
              ))}
            </div>
            {snapshot.room.status === "waiting" && <button type="button" disabled={busy} onClick={() => void toggleReady()} className="mt-4 w-full rounded-xl border border-[#c8f169]/35 bg-[#c8f169]/10 px-4 py-3 text-sm font-black text-[#d7f89b] disabled:opacity-50">{myPlayer?.ready ? "Annuler ma préparation" : "Je suis prêt"}</button>}
            <button type="button" onClick={() => { setSnapshot(null); setMessages([]); setCodeInput(""); }} className="mt-3 w-full text-xs font-bold text-white/45 hover:text-white">Quitter l’affichage de la salle</button>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/15 p-4">
            <h3 className="flex items-center gap-2 font-black"><MessageCircle size={17} className="text-[#c8f169]"/>Le coin des joueurs</h3>
            <div className="mt-3 flex max-h-52 flex-col gap-2 overflow-y-auto rounded-lg bg-black/20 p-3" aria-live="polite">
              {messages.length ? messages.map((message) => (
                <div key={message.id} className={`max-w-[90%] rounded-xl px-3 py-2 text-xs ${message.userId === userId ? "self-end bg-[#c8f169]/15 text-[#e8f7c5]" : "self-start bg-white/[.07] text-white/80"}`}>
                  <p className="mb-1 text-[10px] font-black text-[#c8f169]">{message.userId === userId ? "Toi" : message.username}</p>
                  <p className="break-words">{message.content}</p>
                </div>
              )) : <p className="py-5 text-center text-xs text-white/35">Les premiers messages apparaîtront ici 👋</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <input value={draft} maxLength={180} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void sendMessage(); } }} placeholder="Écris un petit message…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0e1914] px-3 py-3 text-xs text-white outline-none focus:border-[#c8f169]/60"/>
              <button type="button" disabled={busy || !draft.trim()} onClick={() => void sendMessage()} className="rounded-xl bg-[#c8f169] px-3 text-[#102018] disabled:opacity-40"><Send size={16}/></button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{["Ça chauffe ! 🔥","Ekié ! 😂","On est ensemble 🤝"].map((message) => <button type="button" key={message} disabled={busy} onClick={() => void sendMessage(message)} className="rounded-full border border-white/10 px-2.5 py-1.5 text-[10px] text-white/60 hover:bg-white/5">{message}</button>)}</div>
          </div>
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">{error}</p>}
      <p className="mt-4 text-[10px] leading-5 text-white/35">Le salon, les joueurs et les messages sont synchronisés en direct. Le branchement des coups de jeu à distance se fait ensuite dans le moteur propre à chaque jeu ; on ne simule pas une partie distante avant que ses règles serveur soient prêtes.</p>
    </section>
  );
}

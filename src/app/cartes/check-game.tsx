"use client";

import { useEffect, useMemo, useState } from "react";
import SiteHeader from "@/components/site-header";
import CheckOnline from "./check-online";
import {
  SUITS, type Suit, type Card, type GameState,
  createGame, canPlayCard, playCard, drawCard, announceCheck, finishTurn,
} from "@/lib/check-engine";

const HUMAN = "human";
const BOT = "bot";
const suitLabel: Record<Suit, string> = { hearts: "Cœur", diamonds: "Carreau", clubs: "Trèfle", spades: "Pique" };
const suitSymbol: Record<Suit, string> = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
const suitColor: Record<Suit, string> = { hearts: "text-rose-600", diamonds: "text-rose-600", clubs: "text-slate-950", spades: "text-slate-950" };

function startGame() {
  return createGame({ players: [{ id: HUMAN, name: "Toi" }, { id: BOT, name: "L’ordinateur 🤖" }] });
}

function chooseBotCard(state: GameState, level: "facile" | "moyen" | "difficile"): Card | undefined {
  const bot = state.players.find((p) => p.id === BOT);
  if (!bot) return undefined;
  const valid = bot.hand.filter((card) => canPlayCard(state, card));
  if (!valid.length) return undefined;
  if (level === "facile") return valid[Math.floor(Math.random() * valid.length)];
  const suitCounts = SUITS.map((suit) => ({ suit, count: bot.hand.filter((c) => c.suit === suit).length }))
    .sort((a, b) => b.count - a.count);
  const preferredSuit = suitCounts[0]?.suit ?? "hearts";
  const score = (card: Card) => {
    let value = 0;
    if (card.rank === "2") value += level === "difficile" ? 9 : 7;
    if (card.rank === "8") value += level === "difficile" ? 7 : 5;
    if (card.rank === "J") value += level === "difficile" ? 8 : 5;
    if (card.rank === "A") value += level === "difficile" ? 6 : 4;
    if (card.suit === preferredSuit) value += 3;
    if (level === "difficile" && card.rank !== "2" && card.rank !== "8" && card.rank !== "J" && card.rank !== "A") value += 2;
    return value;
  };
  return [...valid].sort((a, b) => score(b) - score(a))[0];
}

function botChosenSuit(state: GameState): Suit {
  const hand = state.players.find((p) => p.id === BOT)?.hand ?? [];
  return [...SUITS].sort((a, b) =>
    hand.filter((c) => c.suit === b).length - hand.filter((c) => c.suit === a).length
  )[0];
}

function CardFace({ card, small = false }: { card: Card; small?: boolean }) {
  return (
    <div className={`relative flex shrink-0 flex-col justify-between rounded-xl border border-slate-200 bg-[#fffdf6] font-black shadow-lg ${small ? "h-[76px] w-[54px] p-1.5" : "h-[116px] w-[78px] p-2"}`}>
      <span className={`text-sm leading-none ${suitColor[card.suit]}`}>{card.rank}</span>
      <span className={`self-center leading-none ${suitColor[card.suit]} ${small ? "text-2xl" : "text-4xl"}`}>{suitSymbol[card.suit]}</span>
      <span className={`rotate-180 self-end text-sm leading-none ${suitColor[card.suit]}`}>{card.rank}</span>
    </div>
  );
}

export default function CheckGame() {
  const [game, setGame] = useState<GameState | null>(null);
  const [level, setLevel] = useState<"facile" | "moyen" | "difficile">("moyen");
  const [selectedAce, setSelectedAce] = useState<string | null>(null);
  const [mustDecideDraw, setMustDecideDraw] = useState(false);
  const [message, setMessage] = useState("Lance une partie gratuite contre l’ordinateur !");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"bot" | "online">("bot");

  const human = game?.players.find((p) => p.id === HUMAN);
  const bot = game?.players.find((p) => p.id === BOT);
  const top = game?.discardPile[game.discardPile.length - 1];
  const isHumanTurn = game?.status === "playing" && game.players[game.currentPlayerIndex]?.id === HUMAN;
  const playableIds = useMemo(() => new Set((human?.hand ?? []).filter((c) => game && canPlayCard(game, c)).map((c) => c.id)), [human?.hand, game]);

  const reset = () => {
    setGame(startGame());
    setSelectedAce(null);
    setMustDecideDraw(false);
    setMessage("À toi de jouer ! Pose une carte de même couleur ou de même valeur.");
  };

  const finishHumanTurn = (next: GameState) => {
    const finished = finishTurn(next, HUMAN);
    setGame(finished);
    setMustDecideDraw(false);
    setSelectedAce(null);
  };

  const playHumanCard = (card: Card, chosenSuit?: Suit) => {
    if (!game || !isHumanTurn || busy) return;
    try {
      const next = playCard(game, HUMAN, card.id, chosenSuit);
      setSelectedAce(null);
      setMustDecideDraw(false);
      if (next.checkRequiredFor === HUMAN) {
        setGame(next);
        setMessage("Il te reste une carte ! Annonce CHECK maintenant.");
      } else {
        const finished = next.status === "finished" ? next : finishTurn(next, HUMAN);
        setGame(finished);
        setMessage(finished.lastAction);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action impossible.");
    }
  };

  const drawForHuman = () => {
    if (!game || !isHumanTurn || busy) return;
    try {
      const next = drawCard(game, HUMAN);
      setGame(next);
      setSelectedAce(null);
      setMustDecideDraw(next.status === "playing" && next.players[next.currentPlayerIndex]?.id === HUMAN);
      setMessage(next.lastAction);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pioche impossible.");
    }
  };

  const announce = () => {
    if (!game) return;
    try {
      const next = announceCheck(game, HUMAN);
      finishHumanTurn(next);
      setMessage("CHECK annoncé ! Bien joué.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Annonce impossible.");
    }
  };

  const passAfterDraw = () => {
    if (!game || !mustDecideDraw) return;
    finishHumanTurn(game);
    setMessage("Tu passes ton tour.");
  };

  useEffect(() => {
    if (mode !== "bot" || !game || game.status !== "playing" || game.players[game.currentPlayerIndex]?.id !== BOT) return;
    const timer = window.setTimeout(() => {
      setBusy(true);
      setGame((current) => {
        if (!current || current.status !== "playing" || current.players[current.currentPlayerIndex]?.id !== BOT) return current;
        try {
          let next = current;
          let card = chooseBotCard(next, level);
          if (!card) {
            next = drawCard(next, BOT);
            if (next.status !== "playing" || next.players[next.currentPlayerIndex]?.id !== BOT) return next;
            card = chooseBotCard(next, level);
            if (!card) return finishTurn(next, BOT);
          }
          next = playCard(next, BOT, card.id, card.rank === "A" ? botChosenSuit(next) : undefined);
          if (next.checkRequiredFor === BOT) next = announceCheck(next, BOT);
          if (next.status !== "finished") next = finishTurn(next, BOT);
          return next;
        } catch {
          return current;
        } finally {
          setBusy(false);
        }
      });
    }, 750);
    return () => window.clearTimeout(timer);
  }, [game, level, mode]);

  const winner = game?.players.find((p) => p.id === game.winnerId);

  if (mode === "online") return <CheckOnline onBack={() => setMode("bot")} />;

  return (
    <>
    <SiteHeader active="cards" />
    <main className="mboa-app-surface min-h-screen bg-[#0c1713] px-3 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <a href="/" className="text-sm font-bold text-white/60 hover:text-white">← Retour à Mboa Games</a>
        <header className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[.25em] text-[#c8f169]">Mboa Games présente</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">CHECK! <span className="text-[#c8f169]">🇨🇲</span></h1><p className="mt-1 text-sm text-white/55">Le jeu est au village !</p></div>
          <div className="flex items-center gap-2 rounded-full border border-[#c8f169]/20 bg-[#c8f169]/10 px-4 py-2 text-xs font-bold text-[#d7f89b]">🎮 Partie gratuite · Test</div>
        </header>

        <div className="mt-5 flex flex-wrap gap-2"><button onClick={() => setMode("bot")} className="rounded-xl bg-[#c8f169] px-4 py-2 text-xs font-black text-[#102018]">🤖 Contre l’ordinateur</button><button onClick={() => setMode("online")} className="rounded-xl border border-[#c8f169]/35 bg-[#c8f169]/10 px-4 py-2 text-xs font-black text-[#d7f89b]">🌍 Jouer à distance</button></div>
        {!game ? (
          <section className="mt-8 rounded-3xl border border-white/10 bg-[#192722] p-6 sm:p-8">
            <div className="text-5xl">🃏</div><h2 className="mt-4 text-2xl font-black">Prêt à jouer ?</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">Affronte l’ordinateur, teste les cartes spéciales et essaie de vider ta main. Aucun compte, aucun point et aucun paiement requis.</p>
            <label className="mt-6 block text-sm font-bold text-white/75">Niveau de l’ordinateur</label>
            <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} className="mt-2 w-full max-w-xs rounded-xl border border-white/15 bg-[#101b18] px-4 py-3 text-white"><option value="facile">Facile</option><option value="moyen">Moyen</option><option value="difficile">Difficile</option></select>
            <button onClick={reset} className="mt-6 block rounded-xl bg-[#c8f169] px-6 py-3 font-black text-[#101b18] hover:bg-[#d7f89b]">Lancer une partie →</button>
          </section>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#192722] p-4">
              <div><p className="text-xs text-white/45">ORDINATEUR · {level.toUpperCase()}</p><p className="font-black">{bot?.name} <span className="ml-2 text-sm font-semibold text-white/50">{bot?.hand.length} cartes</span></p></div>
              <div className="flex -space-x-5">{Array.from({ length: Math.min(bot?.hand.length ?? 0, 5) }).map((_, i) => <div key={i} className="grid h-[54px] w-9 place-items-center rounded-lg border border-white/40 bg-gradient-to-br from-[#d5e8a2] to-[#8baf49] text-lg text-[#183022] shadow">✦</div>)}</div>
            </div>

            <section className="mt-4 rounded-[2rem] border border-[#c8f169]/15 bg-[radial-gradient(ellipse_at_center,#24543b_0%,#153b2b_55%,#102b20_100%)] p-4 shadow-2xl sm:p-8">
              <div className="flex items-center justify-between gap-3 text-xs font-bold text-white/65"><span>TABLE DE JEU</span><span>TOUR {game.turnNumber} · {game.direction === 1 ? "↻ Sens horaire" : "↺ Sens inverse"}</span></div>
              <div className="flex min-h-[190px] items-center justify-center gap-5 py-7">
                <button onClick={drawForHuman} disabled={!isHumanTurn || busy || mustDecideDraw || playableIds.size > 0} className="flex h-[116px] w-[78px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/40 bg-[#173b2b] text-3xl shadow-xl transition hover:scale-105 disabled:opacity-40"><span>🂠</span><span className="mt-1 text-[10px] font-black">PIOCHER</span><span className="text-[9px] text-white/50">{game.drawPile.length} restantes</span></button>
                {top && <div className="text-center"><CardFace card={top} /><p className="mt-2 text-[10px] font-bold text-white/65">DÉFAUSSE</p></div>}
                {game.chosenSuit && <div className="rounded-xl bg-black/25 px-3 py-2 text-xs font-bold">Couleur : {suitLabel[game.chosenSuit]} {suitSymbol[game.chosenSuit]}</div>}
              </div>
              {game.pendingDraw > 0 && <div className="mx-auto mb-4 w-fit rounded-full bg-orange-400/15 px-4 py-2 text-sm font-black text-orange-200">⚠️ Pénalité : +{game.pendingDraw} cartes · seul un 2 peut répondre</div>}
              <div className="rounded-2xl bg-black/20 p-3 text-center text-sm text-white/85" role="status">{busy ? "L’ordinateur réfléchit…" : message}</div>
            </section>

            <section className="mt-5 rounded-3xl border border-white/10 bg-[#192722] p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-white/45">TA MAIN</p><h2 className="text-xl font-black">À toi, {human?.name} ! <span className="text-sm text-[#c8f169]">{human?.hand.length} cartes</span></h2></div><button onClick={reset} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/5">↻ Nouvelle partie</button></div>
              <div className="mt-5 flex min-h-[132px] flex-wrap justify-center gap-2 sm:justify-start">
                {human?.hand.map((card) => {
                  const playable = playableIds.has(card.id);
                  return <button key={card.id} disabled={!isHumanTurn || busy || !playable || Boolean(game.checkRequiredFor)} onClick={() => card.rank === "A" ? setSelectedAce(card.id) : playHumanCard(card)} className={`rounded-xl transition ${playable && isHumanTurn ? "hover:-translate-y-2 hover:scale-105" : "opacity-45 grayscale"} ${selectedAce === card.id ? "ring-4 ring-[#c8f169]" : ""}`} aria-label={`${card.rank} de ${suitLabel[card.suit]}`}><CardFace card={card} /></button>;
                })}
              </div>
              {selectedAce && <div className="mt-4 rounded-2xl border border-[#c8f169]/30 bg-black/20 p-4"><p className="text-sm font-bold">Choisis la couleur demandée :</p><div className="mt-3 flex flex-wrap gap-2">{SUITS.map((suit) => <button key={suit} onClick={() => { const card = human?.hand.find((c) => c.id === selectedAce); if (card) playHumanCard(card, suit); }} className="rounded-xl bg-white px-4 py-2 font-black text-slate-900">{suitSymbol[suit]} {suitLabel[suit]}</button>)}</div></div>}
              {game.checkRequiredFor === HUMAN && <div className="mt-4 flex flex-wrap gap-2"><button onClick={announce} className="rounded-xl bg-[#c8f169] px-5 py-3 font-black text-[#101b18]">📣 ANNONCER CHECK !</button><button onClick={() => { try { finishHumanTurn(game); setMessage("Tu as oublié CHECK : pénalité de 2 cartes !"); } catch (e) { setMessage(e instanceof Error ? e.message : "Erreur"); } }} className="rounded-xl border border-white/20 px-4 py-3 text-sm font-bold">Oublier (test pénalité)</button></div>}
              {mustDecideDraw && <button onClick={passAfterDraw} className="mt-4 rounded-xl border border-white/20 px-4 py-3 text-sm font-bold">Passer mon tour</button>}
              {!isHumanTurn && game.status === "playing" && <p className="mt-4 text-sm font-bold text-[#c8f169]">L’ordinateur joue…</p>}
            </section>
            {winner && <section className="mt-5 rounded-3xl border border-[#c8f169]/40 bg-[#c8f169]/10 p-6 text-center"><div className="text-5xl">🏆</div><h2 className="mt-3 text-2xl font-black">{winner.id === HUMAN ? "Tu as gagné !" : "L’ordinateur a gagné !"}</h2><p className="mt-2 text-sm text-white/65">Partie terminée · {game.turnNumber} tours joués</p><button onClick={reset} className="mt-5 rounded-xl bg-[#c8f169] px-6 py-3 font-black text-[#101b18]">Rejouer</button></section>}
          </>
        )}
        <section className="mt-8 rounded-3xl border border-white/10 bg-[#192722] p-5 sm:p-6">
          <h2 className="text-lg font-black text-[#c8f169]">Règles rapides de CHECK!</h2>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-white/70 sm:grid-cols-2">
            <p><strong className="text-white">But :</strong> être le premier à poser toutes ses cartes. On joue une carte de même couleur ou de même valeur que la défausse.</p>
            <p><strong className="text-white">Pioche :</strong> si tu n’as aucune carte jouable, pioche. Si la carte tirée est jouable, tu peux la poser immédiatement.</p>
            <p><strong className="text-white">As :</strong> se pose sur toute carte hors pénalité et permet de choisir la couleur.</p>
            <p><strong className="text-white">2 :</strong> ajoute 2 cartes à la pénalité. Seul un autre 2 peut cumuler cette pénalité.</p>
            <p><strong className="text-white">8 :</strong> fait passer le joueur suivant ; à deux joueurs, tu rejoues.</p>
            <p><strong className="text-white">Valet :</strong> inverse le sens ; à deux joueurs, tu rejoues.</p>
            <p className="sm:col-span-2"><strong className="text-white">CHECK ! :</strong> quand tu poses ton avant-dernière carte, annonce CHECK pendant le même tour. Si tu oublies, tu pioches 2 cartes.</p>
          </div>
        </section>
        <p className="mt-8 text-center text-xs text-white/35">Mboa Games · Test gratuit · Aucun argent réel · 🇨🇲</p>
      </div>
    </main>
    </>
  );
}

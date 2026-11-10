"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Dices, RotateCcw, Trophy, Users, Hand } from "lucide-react";
import { evaluateThrows, type DiceThrow, validateDiceConfig } from "@/lib/des-engine";

type RollHistory = { round: number; player: string; dice: number[]; total: number; million: boolean; rollId: string };

const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function randomDieFace() {
  // Rejection sampling avoids modulo bias: every face has exactly the same chance.
  const limit = Math.floor(0x100000000 / 6) * 6;
  const value = new Uint32Array(1);
  do { window.crypto.getRandomValues(value); } while (value[0] >= limit);
  return (value[0] % 6) + 1;
}

function Die({ face, rolling, delay = 0 }: { face: number | null; rolling: boolean; delay?: number }) {
  return (
    <div className={`dice-shell ${rolling ? "dice-tumbling" : "dice-resting"}`} style={{ animationDelay: rolling ? `${delay}ms` : "0ms" }}>
      <div className="dice-face" aria-label={face ? `Dé : ${face}` : "Dé en attente"}>
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} className={face && PIPS[face].includes(index) ? "pip pip-visible" : "pip"} />
        ))}
      </div>
    </div>
  );
}

export default function DeuxDesGame() {
  const [diceCount, setDiceCount] = useState(2);
  const [playerCount, setPlayerCount] = useState(2);
  const [millionFace, setMillionFace] = useState(1);
  const [names, setNames] = useState<string[]>(["Joueur 1", "Joueur 2"]);
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(1);
  const [contenders, setContenders] = useState<number[]>([]);
  const [throws, setThrows] = useState<DiceThrow[]>([]);
  const [history, setHistory] = useState<RollHistory[]>([]);
  const [rollingPlayer, setRollingPlayer] = useState<number | null>(null);
  const [message, setMessage] = useState("Configure la table et lance la partie !");
  const [winner, setWinner] = useState<number | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const activePlayers = useMemo(
    () => started ? (contenders.length ? contenders : Array.from({ length: playerCount }, (_, i) => i)) : [],
    [started, contenders, playerCount],
  );
  const nextPlayer = activePlayers.find((index) => !throws.some((item) => item.playerIndex === index));
  const complete = activePlayers.length > 0 && throws.length === activePlayers.length;
  const turnPlayer = nextPlayer === undefined ? null : nextPlayer;

  function updatePlayerCount(count: number) {
    setPlayerCount(count);
    setNames((current) => Array.from({ length: count }, (_, i) => current[i] || `Joueur ${i + 1}`));
  }

  function newGame() {
    try {
      validateDiceConfig({ diceCount, playerCount, millionFace });
      setStarted(true);
      setRound(1);
      setContenders([]);
      setThrows([]);
      setHistory([]);
      setWinner(null);
      setRollingPlayer(null);
      setMessage("La partie commence. Passe le téléphone au premier joueur.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Configuration invalide.");
    }
  }

  function rollForPlayer(playerIndex: number) {
    if (rollingPlayer !== null || winner !== null || complete || !activePlayers.includes(playerIndex) || turnPlayer !== playerIndex) return;
    setRollingPlayer(playerIndex);
    setMessage(`🎲 ${names[playerIndex]} lance les dés…`);

    // The throw is generated locally at the instant the player launches.
    const dice = Array.from({ length: diceCount }, randomDieFace);
    const total = dice.reduce((sum, face) => sum + face, 0);
    const isMillion = dice.every((face) => face === millionFace);
    const rollId = window.crypto.randomUUID();

    window.setTimeout(() => {
      const item: DiceThrow = { playerIndex, dice, total, isMillion };
      setThrows((current) => [...current, item]);
      setHistory((current) => [...current, {
        round, player: names[playerIndex] || `Joueur ${playerIndex + 1}`,
        dice, total, million: isMillion, rollId,
      }]);
      setRollingPlayer(null);
      setMessage(isMillion
        ? `💥 MILLION ! ${names[playerIndex]} fait ${dice.join(" - ")} !`
        : `${names[playerIndex]} obtient ${total} points.`);
    }, 1050);
  }

  function resolveRound() {
    if (!complete) return;
    try {
      const result = evaluateThrows(throws, playerCount, diceCount, millionFace);
      if (result.winnerIndex !== null) {
        setWinner(result.winnerIndex);
        setMessage(`🏆 ${names[result.winnerIndex]} remporte la manche !`);
      } else {
        setContenders(result.contenders);
        setThrows([]);
        setRound((value) => value + 1);
        setMessage(result.million
          ? `Plusieurs Millions ! ${result.contenders.map((i) => names[i]).join(", ")} relancent entre eux.`
          : `Égalité à ${Math.max(...result.throws.map((item) => item.total))} ! Seuls les joueurs à égalité relancent.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de départager les joueurs.");
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    pointerStart.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>, playerIndex: number) {
    if (!pointerStart.current) return;
    const distance = Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y);
    pointerStart.current = null;
    if (distance > 24) {
      suppressClick.current = true;
      rollForPlayer(playerIndex);
    }
  }

  return (
    <main className="min-h-screen bg-[#101b18] px-4 py-5 text-white sm:px-6">
      <style jsx global>{`
        @keyframes dice-toss {
          0% { transform: translateY(0) rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(.9); }
          18% { transform: translateY(-34px) rotateX(180deg) rotateY(130deg) rotateZ(90deg) scale(1.08); }
          42% { transform: translateY(8px) rotateX(390deg) rotateY(280deg) rotateZ(210deg) scale(1.02); }
          66% { transform: translateY(-12px) rotateX(540deg) rotateY(430deg) rotateZ(300deg) scale(1.04); }
          84% { transform: translateY(3px) rotateX(680deg) rotateY(560deg) rotateZ(350deg) scale(1); }
          100% { transform: translateY(0) rotateX(720deg) rotateY(720deg) rotateZ(360deg) scale(1); }
        }
        .dice-shell { width: 64px; height: 64px; perspective: 500px; }
        .dice-face { width: 64px; height: 64px; display: grid; grid-template-columns: repeat(3,1fr); grid-template-rows: repeat(3,1fr); gap: 3px; padding: 9px; border-radius: 15px; background: linear-gradient(145deg,#fff,#dce4df); box-shadow: inset 0 2px 4px #ffffff, 0 7px 12px #0008; }
        .pip { border-radius: 50%; background: transparent; }
        .pip-visible { background: radial-gradient(circle at 35% 30%,#53645c,#101b18 70%); box-shadow: inset 0 1px 2px #0008; }
        .dice-tumbling { animation: dice-toss 1.05s cubic-bezier(.2,.75,.25,1) both; }
        .dice-resting { transform: rotate(-3deg); }
        @media (prefers-reduced-motion: reduce) { .dice-tumbling { animation-duration: .01ms; } }
      `}</style>
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/75 hover:bg-white/5"><ArrowLeft size={16} /> Accueil</Link>
          <span className="rounded-full border border-[#c8f169]/25 bg-[#c8f169]/10 px-3 py-1.5 text-xs font-black text-[#d7f89b]">MBOA GAMES 🇨🇲</span>
        </header>

        <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#1d3329] to-[#14231d] p-5 shadow-2xl sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-black uppercase tracking-[.25em] text-[#c8f169]">Le jeu de dés du 237</p><h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Le 2 Dès <span className="text-3xl">🎲</span></h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/60">Lance les dés toi-même : ils roulent à l’écran et révèlent leur face quand ils s’arrêtent.</p></div>
            <div className="rounded-2xl bg-[#c8f169]/10 p-4 text-[#d7f89b]"><Dices size={34} /></div>
          </div>

          {!started ? (
            <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_.9fr]">
              <div className="rounded-2xl border border-white/10 bg-black/15 p-5">
                <h2 className="text-lg font-black">Configuration de la table</h2>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <label className="text-sm font-semibold text-white/70">Nombre de dés
                    <select value={diceCount} onChange={(e) => setDiceCount(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101b18] px-3 py-3 text-white"><option value={2}>2 dés</option><option value={3}>3 dés</option><option value={4}>4 dés</option></select>
                  </label>
                  <label className="text-sm font-semibold text-white/70">Nombre de joueurs
                    <select value={playerCount} onChange={(e) => updatePlayerCount(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101b18] px-3 py-3 text-white">{Array.from({ length: 9 }, (_, i) => i + 2).map((count) => <option key={count} value={count}>{count} joueurs</option>)}</select>
                  </label>
                  <label className="col-span-2 text-sm font-semibold text-white/70">Le chiffre du Million
                    <select value={millionFace} onChange={(e) => setMillionFace(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101b18] px-3 py-3 text-white">{[1,2,3,4,5,6].map((face) => <option key={face} value={face}>{face} sur chaque dé ({diceCount} × {face})</option>)}</select>
                  </label>
                </div>
                <div className="mt-5"><p className="text-sm font-bold text-white/70">Noms des joueurs</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{names.slice(0, playerCount).map((name, index) => <input key={index} value={name} onChange={(e) => setNames((current) => current.map((value, i) => i === index ? e.target.value : value))} maxLength={24} aria-label={`Nom du joueur ${index + 1}`} className="w-full rounded-xl border border-white/10 bg-[#101b18] px-3 py-3 text-sm text-white outline-none focus:border-[#c8f169]/60" />)}</div></div>
                <button onClick={newGame} className="mt-6 w-full rounded-xl bg-[#c8f169] px-5 py-4 font-black text-[#101b18] transition hover:brightness-110">Créer la table et jouer <Dices className="ml-2 inline" size={18} /></button>
              </div>
              <aside className="rounded-2xl border border-[#c8f169]/15 bg-[#c8f169]/5 p-5">
                <h3 className="font-black">Règle du Million</h3><p className="mt-2 text-sm leading-6 text-white/65">Si un joueur obtient le chiffre choisi sur chacun des dés, il fait Million et remporte directement la manche. Si plusieurs joueurs font Million, ils relancent entre eux.</p>
                <div className="mt-6 flex items-center gap-3"><span className="text-4xl">💥</span><div><p className="font-black text-[#d7f89b]">{diceCount} × {millionFace}</p><p className="text-xs text-white/50">Million de cette table</p></div></div>
                <div className="mt-6 rounded-xl border border-white/10 bg-black/15 p-3 text-xs leading-5 text-white/50">Mode test gratuit. Les mises, paiements et retraits en argent réel ne sont pas activés.</div>
              </aside>
            </div>
          ) : (
            <>
              <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold">Manche {round}</span><span className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold">{diceCount} dés</span><span className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold">Million : {millionFace}</span></div>
                <button onClick={() => { setStarted(false); setWinner(null); setRollingPlayer(null); }} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/5"><RotateCcw className="mr-1 inline" size={14} /> Nouvelle table</button>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4" aria-live="polite">
                <p className="text-sm font-bold">{message}</p>
                {turnPlayer !== null && winner === null && <p className="mt-2 text-xs text-[#d7f89b]">Au tour de {names[turnPlayer]} · lance avec un geste ou touche le bouton.</p>}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activePlayers.map((index) => {
                  const item = throws.find((entry) => entry.playerIndex === index);
                  const isNext = turnPlayer === index && winner === null;
                  const isRolling = rollingPlayer === index;
                  return <article key={index} className={`rounded-2xl border p-4 ${isNext ? "border-[#c8f169]/60 bg-[#c8f169]/10" : "border-white/10 bg-black/15"}`}>
                    <div className="flex items-center justify-between gap-2"><p className="font-black">{names[index]}</p><span className="text-xs text-white/45">Joueur {index + 1}</span></div>
                    <div
                      className="my-5 flex min-h-20 touch-pan-y items-center justify-center gap-3 rounded-xl py-2"
                      onPointerDown={isNext && !isRolling ? handlePointerDown : undefined}
                      onPointerUp={isNext && !isRolling ? (event) => handlePointerUp(event, index) : undefined}
                    >
                      {Array.from({ length: diceCount }, (_, i) => <Die key={i} face={item?.dice[i] ?? null} rolling={isRolling} delay={i * 65} />)}
                    </div>
                    {item ? <div className="text-center"><p className="text-xl font-black text-[#d7f89b]">{item.isMillion ? "💥 MILLION !" : `${item.total} points`}</p><p className="mt-1 text-xs text-white/45">{item.dice.join(" · ")}</p></div> : <p className="text-center text-xs text-white/40">{isRolling ? "Les dés rebondissent…" : "Prêt à lancer"}</p>}
                    {isNext && !complete && <button disabled={rollingPlayer !== null} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } rollForPlayer(index); }} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#c8f169] px-4 py-3 font-black text-[#101b18] disabled:opacity-50"><Hand size={17} />{isRolling ? "Les dés roulent…" : "Lancer les dés"}</button>}
                  </article>;
                })}
              </div>
              {complete && winner === null && rollingPlayer === null && <button onClick={resolveRound} className="mt-5 w-full rounded-xl bg-[#ff895c] px-5 py-4 font-black text-[#24150f]">Comparer les résultats <Trophy className="ml-2 inline" size={18} /></button>}
              {winner !== null && <div className="mt-6 rounded-2xl border border-[#c8f169]/40 bg-[#c8f169]/10 p-6 text-center"><Trophy className="mx-auto text-[#d7f89b]" size={42} /><h2 className="mt-3 text-2xl font-black">{names[winner]} gagne !</h2><p className="mt-2 text-sm text-white/60">Bravo, le village a son champion !</p><button onClick={() => { setStarted(false); setWinner(null); }} className="mt-5 rounded-xl bg-[#c8f169] px-6 py-3 font-black text-[#101b18]">Rejouer</button></div>}
            </>
          )}
        </section>

        {started && <section className="mt-5 rounded-2xl border border-white/10 bg-[#192722] p-5"><div className="flex items-center gap-2"><Users size={18} className="text-[#c8f169]" /><h2 className="font-black">Historique des lancers</h2></div><div className="mt-3 space-y-2">{history.length === 0 ? <p className="text-sm text-white/45">Les lancers apparaîtront ici.</p> : history.map((item, index) => <div key={item.rollId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/15 px-3 py-2 text-sm"><span className="text-white/60">Manche {item.round} · {item.player}</span><span className="font-bold">{item.dice.join(" · ")} <span className="text-[#d7f89b]">= {item.million ? "MILLION" : item.total}</span></span></div>)}</div></section>}
        <p className="mt-7 text-center text-xs text-white/35">Mboa Games · Le 2 Dès · Lancer interactif sur ton appareil · 🇨🇲</p>
      </div>
    </main>
  );
}

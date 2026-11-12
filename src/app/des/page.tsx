"use client";

import Link from "next/link";
import SiteHeader from "@/components/site-header";
import GameRoomPanel from "@/components/game-room-panel";
import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Dices, RotateCcw, Trophy, Users, Hand } from "lucide-react";
import { evaluateThrows, type DiceThrow, validateDiceConfig } from "@/lib/des-engine";

type RollHistory = { round: number; player: string; dice: number[]; total: number; million: boolean; rollId: string };

const PIPS: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

function DiceFace({ value }: { value: number }) {
  return (
    <div className="cube-face">
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} className={PIPS[value].includes(index) ? "cube-pip cube-pip-on" : "cube-pip"} />
      ))}
    </div>
  );
}

function Die({ face, rolling, delay = 0 }: { face: number | null; rolling: boolean; delay?: number }) {
  const top = face ?? 1;
  const remaining = [1, 2, 3, 4, 5, 6].filter((value) => value !== top && value !== 7 - top);
  const faces = {
    front: remaining[0],
    back: 7 - remaining[0],
    right: remaining[1],
    left: 7 - remaining[1],
  };
  return (
    <div className={`die-stage ${rolling ? "die-stage-rolling" : "die-stage-resting"}`} aria-label={face ? `Dé : ${face}` : "Dé prêt"}>
      <div className="die-cube" style={{ animationDelay: rolling ? `${delay}ms` : "0ms" }}>
        <div className="cube-side cube-front"><DiceFace value={faces.front} /></div>
        <div className="cube-side cube-back"><DiceFace value={faces.back} /></div>
        <div className="cube-side cube-right"><DiceFace value={faces.right} /></div>
        <div className="cube-side cube-left"><DiceFace value={faces.left} /></div>
        <div className="cube-side cube-top"><DiceFace value={top} /></div>
        <div className="cube-side cube-bottom"><DiceFace value={7 - top} /></div>
      </div>
      <div className="die-shadow" />
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

  async function rollForPlayer(playerIndex: number) {
    if (rollingPlayer !== null || winner !== null || complete || !activePlayers.includes(playerIndex) || turnPlayer !== playerIndex) return;
    setRollingPlayer(playerIndex);
    setMessage(`🎲 ${names[playerIndex]} lance les dés…`);

    try {
      // Le serveur génère le résultat avec le générateur cryptographique de Node.js.
      const [response] = await Promise.all([
        fetch("/api/des/roll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ diceCount }),
          cache: "no-store",
        }),
        new Promise((resolve) => window.setTimeout(resolve, 1050)),
      ]);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Le lancer a échoué.");
      if (
        !Array.isArray(payload?.dice) ||
        payload.dice.length !== diceCount ||
        payload.dice.some((face: unknown) => !Number.isInteger(face) || (face as number) < 1 || (face as number) > 6) ||
        typeof payload?.rollId !== "string"
      ) {
        throw new Error("Le serveur a renvoyé un résultat de dés invalide.");
      }

      const dice: number[] = payload.dice;
      const total = dice.reduce((sum, face) => sum + face, 0);
      const isMillion = dice.every((face) => face === millionFace);
      const rollId: string = payload.rollId;
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
    } catch (error) {
      setRollingPlayer(null);
      setMessage(error instanceof Error ? error.message : "Impossible de lancer les dés. Réessaie.");
    }
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
    <>
    <SiteHeader active="dice" />
    <main className="min-h-screen bg-[#101b18] px-4 py-5 text-white sm:px-6">
      <style jsx global>{`
        @keyframes real-dice-roll {
          0% { transform: translate3d(0,0,0) rotateX(-24deg) rotateY(30deg) rotateZ(0deg); }
          12% { transform: translate3d(-18px,-34px,20px) rotateX(145deg) rotateY(190deg) rotateZ(100deg); }
          28% { transform: translate3d(24px,-12px,30px) rotateX(320deg) rotateY(390deg) rotateZ(230deg); }
          45% { transform: translate3d(-14px,8px,10px) rotateX(510deg) rotateY(590deg) rotateZ(360deg); }
          62% { transform: translate3d(10px,-12px,12px) rotateX(690deg) rotateY(760deg) rotateZ(500deg); }
          78% { transform: translate3d(-4px,4px,0) rotateX(825deg) rotateY(910deg) rotateZ(640deg); }
          90% { transform: translate3d(2px,-2px,0) rotateX(1050deg) rotateY(1130deg) rotateZ(720deg); }
          100% { transform: translate3d(0,0,0) rotateX(1056deg) rotateY(1110deg) rotateZ(720deg); }
        }
        .die-stage { position:relative; width:clamp(54px, 8vw, 72px); height:clamp(64px, 9vw, 82px); perspective:850px; display:grid; place-items:center; flex:0 1 auto; }
        .die-cube { --die-size:clamp(44px, 6.2vw, 60px); position:relative; width:var(--die-size); height:var(--die-size); transform-style:preserve-3d; transform:rotateX(-24deg) rotateY(30deg); }
        .cube-side { position:absolute; inset:0; width:100%; height:100%; padding:9%; border-radius:15%; background:linear-gradient(145deg,#fffef9 0%,#f4f0e5 42%,#d5d0c4 100%); border:1px solid #c9c2b3; box-shadow:inset 2px 2px 5px #fff, inset -3px -4px 7px #aaa496; backface-visibility:hidden; }
        .cube-front { transform:translateZ(calc(var(--die-size) / 2)); }
        .cube-back { transform:rotateY(180deg) translateZ(calc(var(--die-size) / 2)); }
        .cube-right { transform:rotateY(90deg) translateZ(calc(var(--die-size) / 2)); }
        .cube-left { transform:rotateY(-90deg) translateZ(calc(var(--die-size) / 2)); }
        .cube-top { transform:rotateX(90deg) translateZ(calc(var(--die-size) / 2)); }
        .cube-bottom { transform:rotateX(-90deg) translateZ(calc(var(--die-size) / 2)); }
        .cube-face { width:100%; height:100%; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); gap:5%; }
        .cube-pip { border-radius:50%; background:transparent; }
        .cube-pip-on { background:radial-gradient(circle at 32% 28%,#4a4a45 0%,#111 58%,#050505 100%); box-shadow:inset 1px 1px 2px #000, 0 1px 1px #fff9; }
        .die-shadow { position:absolute; width:68%; height:13%; left:16%; bottom:5%; border-radius:50%; background:#0009; filter:blur(7px); transform:scaleX(1.12); }
        .die-stage-rolling .die-cube { animation:real-dice-roll 1.15s cubic-bezier(.18,.72,.22,1) both; }
        .die-stage-rolling .die-shadow { animation:die-shadow-roll 1.15s ease-out both; }
        @keyframes die-shadow-roll { 0%{transform:scale(.6);opacity:.3;filter:blur(4px)} 30%{transform:scale(1.35);opacity:.9;filter:blur(10px)} 100%{transform:scale(1);opacity:.7;filter:blur(7px)} }
        .die-stage-resting .die-cube { transform:rotateX(-24deg) rotateY(30deg); }
        .dice-table-surface { position:relative; isolation:isolate; background-color:#123c2c; background-image:radial-gradient(ellipse at 50% 38%,#347454 0%,#20583e 38%,#123b2b 72%,#09271c 100%),repeating-linear-gradient(35deg,#ffffff08 0 1px,transparent 1px 4px); box-shadow:inset 0 0 55px #041b13, inset 0 3px 5px #ffffff24, 0 12px 24px #0008; border:10px solid #67452c; outline:2px solid #a77a4b; }
        @media (prefers-reduced-motion:reduce) { .die-stage-rolling .die-cube,.die-stage-rolling .die-shadow { animation-duration:.01ms; } }
      `}</style>
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/75 hover:bg-white/5"><ArrowLeft size={16} /> Accueil</Link>
          <span className="rounded-full border border-[#c8f169]/25 bg-[#c8f169]/10 px-3 py-1.5 text-xs font-black text-[#d7f89b]">MBOA GAMES 🇨🇲</span>
        </header>

        <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#1d3329] to-[#14231d] p-5 shadow-2xl sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-black uppercase tracking-[.25em] text-[#c8f169]">Le jeu de dés du 237</p><h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Le 2 Dès <span className="text-3xl">🎲</span></h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/60">Des dés en volume, un vrai tapis de jeu et un lancer qui rebondit avant de s’arrêter sur sa face.</p></div>
            <div className="rounded-2xl bg-[#c8f169]/10 p-4 text-[#d7f89b]"><Dices size={34} /></div>
          </div>

          <GameRoomPanel gameType="des" gameName="Le 2 Dès" maxPlayers={8} />
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
                <div className="mt-6 rounded-xl border border-white/10 bg-black/15 p-3 text-xs leading-5 text-white/50">Mode test gratuit : aucune mise d’argent réel, aucun paiement ni retrait ne sont activés.</div>
                <div className="mt-5 border-t border-white/10 pt-5">
                  <h3 className="font-black">Comment gagner ?</h3>
                  <ul className="mt-2 space-y-2 text-sm leading-6 text-white/65">
                    <li>• Chaque joueur lance à son tour le nombre de dés choisi.</li>
                    <li>• Sans Million, le total le plus élevé remporte la manche.</li>
                    <li>• En cas d’égalité, seuls les joueurs ex æquo relancent jusqu’à un gagnant unique.</li>
                    <li>• Un Million (le même chiffre sur tous les dés) remporte la manche. Plusieurs Millions se départagent entre eux.</li>
                  </ul>
                </div>
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
              <section className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[.2em] text-[#c8f169]">Table commune</p>
                    <h2 className="mt-1 text-xl font-black">{turnPlayer !== null && winner === null ? `Au lancer : ${names[turnPlayer]}` : winner !== null ? "Fin de la manche" : "Résultats de la manche"}</h2>
                    <p className="mt-1 text-xs text-white/45">Une seule table pour tous · chacun lance à son tour</p>
                  </div>
                  {turnPlayer !== null && winner === null && <span className="rounded-full bg-[#c8f169]/15 px-3 py-2 text-xs font-black text-[#d7f89b]">Joueur {turnPlayer + 1}</span>}
                </div>
                <div
                  className="dice-table-surface my-5 flex min-h-64 touch-pan-y items-center justify-center gap-4 overflow-hidden rounded-[1.5rem] px-5 py-10 sm:min-h-80 sm:gap-8 sm:px-10 sm:py-14"
                  onPointerDown={turnPlayer !== null && rollingPlayer === null && winner === null && !complete ? handlePointerDown : undefined}
                  onPointerUp={turnPlayer !== null && rollingPlayer === null && winner === null && !complete ? (event) => handlePointerUp(event, turnPlayer) : undefined}
                >
                  {Array.from({ length: diceCount }, (_, i) => <Die key={i} face={throws[throws.length - 1]?.dice[i] ?? null} rolling={rollingPlayer !== null} delay={i * 65} />)}
                </div>
                <div className="text-center">
                  {rollingPlayer !== null ? <p className="text-lg font-black text-[#d7f89b]">Les dés roulent pour {names[rollingPlayer]}…</p> : throws.length > 0 ? <><p className="text-xl font-black text-[#d7f89b]">{throws[throws.length - 1].isMillion ? "💥 MILLION !" : `${throws[throws.length - 1].total} points`}</p><p className="mt-1 text-xs text-white/45">Lancer de {names[throws[throws.length - 1].playerIndex]} · {throws[throws.length - 1].dice.join(" · ")}</p></> : <p className="text-sm text-white/45">Les dés attendent le premier lancer.</p>}
                </div>
                {turnPlayer !== null && winner === null && !complete && <button disabled={rollingPlayer !== null} onClick={() => rollForPlayer(turnPlayer)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#c8f169] px-4 py-4 font-black text-[#101b18] disabled:opacity-50"><Hand size={18} />{rollingPlayer !== null ? "Les dés roulent…" : `Lancer pour ${names[turnPlayer]}`}</button>}
                <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {activePlayers.map((index) => {
                    const result = throws.find((entry) => entry.playerIndex === index);
                    const isNext = turnPlayer === index && winner === null;
                    return <div key={index} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 ${isNext ? "border-[#c8f169]/50 bg-[#c8f169]/10" : "border-white/10 bg-black/15"}`}>
                      <div className="min-w-0"><p className="truncate text-sm font-bold">{names[index]}</p><p className="text-[11px] text-white/40">{result ? result.dice.join(" · ") : isNext ? "À lancer maintenant" : "En attente"}</p></div>
                      <span className={`shrink-0 text-sm font-black ${result ? "text-[#d7f89b]" : "text-white/35"}`}>{result ? result.isMillion ? "MILLION" : result.total : "—"}</span>
                    </div>;
                  })}
                </div>
              </section>
              {complete && winner === null && rollingPlayer === null && <button onClick={resolveRound} className="mt-5 w-full rounded-xl bg-[#ff895c] px-5 py-4 font-black text-[#24150f]">Comparer les résultats <Trophy className="ml-2 inline" size={18} /></button>}
              {winner !== null && <div className="mt-6 rounded-2xl border border-[#c8f169]/40 bg-[#c8f169]/10 p-6 text-center"><Trophy className="mx-auto text-[#d7f89b]" size={42} /><h2 className="mt-3 text-2xl font-black">{names[winner]} gagne !</h2><p className="mt-2 text-sm text-white/60">Bravo, le village a son champion !</p><button onClick={() => { setStarted(false); setWinner(null); }} className="mt-5 rounded-xl bg-[#c8f169] px-6 py-3 font-black text-[#101b18]">Rejouer</button></div>}
            </>
          )}
        </section>

        {started && <section className="mt-5 rounded-2xl border border-white/10 bg-[#192722] p-5"><div className="flex items-center gap-2"><Users size={18} className="text-[#c8f169]" /><h2 className="font-black">Historique des lancers</h2></div><div className="mt-3 space-y-2">{history.length === 0 ? <p className="text-sm text-white/45">Les lancers apparaîtront ici.</p> : history.map((item, index) => <div key={item.rollId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/15 px-3 py-2 text-sm"><span className="text-white/60">Manche {item.round} · {item.player}</span><span className="font-bold">{item.dice.join(" · ")} <span className="text-[#d7f89b]">= {item.million ? "MILLION" : item.total}</span></span></div>)}</div></section>}
        <p className="mt-7 text-center text-xs text-white/35">Mboa Games · Le 2 Dès · Lancer interactif sur ton appareil · 🇨🇲</p>
      </div>
    </main>
    </>
  );
}

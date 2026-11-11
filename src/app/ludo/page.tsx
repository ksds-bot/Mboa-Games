"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import SiteHeader from "@/components/site-header";
import { ArrowLeft, Dices, RotateCcw, Trophy, Users } from "lucide-react";
import { createLudoGame, getLegalTokenMoves, globalSquare, LUDO_PLAYERS, rollLudo, moveLudoToken, type LudoState } from "@/lib/ludo-engine";

const COLORS = ["#f05b55", "#55bd83", "#f0c94e", "#5d9eea"];
const HOME = [[105,105],[495,105],[495,495],[105,495]];
const LABELS = ["Rouge", "Vert", "Jaune", "Bleu"];

function pointFor(player: number, progress: number, tokenIndex: number): [number, number] {
  if (progress === -1 || progress === 57) {
    if (progress === 57) return [300 + (player === 0 || player === 3 ? -1 : 1) * (tokenIndex % 2 ? 13 : -13), 300 + (player < 2 ? -1 : 1) * (tokenIndex < 2 ? 13 : -13)];
    const [cx, cy] = HOME[player];
    const offsets = [[-23,-23],[23,-23],[-23,23],[23,23]];
    return [cx + offsets[tokenIndex][0], cy + offsets[tokenIndex][1]];
  }
  if (progress >= 51) {
    const angle = (-90 + player * 90) * Math.PI / 180;
    const radius = 172 - (progress - 51) * 24;
    return [300 + Math.cos(angle) * radius, 300 + Math.sin(angle) * radius];
  }
  const square = globalSquare(player, progress) ?? 0;
  const angle = (-90 + square * (360 / 52)) * Math.PI / 180;
  return [300 + Math.cos(angle) * 190, 300 + Math.sin(angle) * 190];
}

export default function LudoPage() {
  const [playerCount, setPlayerCount] = useState(4);
  const [names, setNames] = useState(["Joueur rouge", "Joueur vert", "Joueur jaune", "Joueur bleu"]);
  const [game, setGame] = useState<LudoState | null>(null);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState("Configure les joueurs et lance la partie.");
  const [lastRollId, setLastRollId] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  const legalMoves = useMemo(() => game?.lastRoll ? getLegalTokenMoves(game, game.lastRoll) : [], [game]);
  const activeName = game ? (names[game.currentPlayer] || LABELS[game.currentPlayer]) : "";
  const finishedCount = game?.tokens[game.currentPlayer].filter((p) => p === 57).length ?? 0;

  function startGame() {
    try {
      setGame(createLudoGame(playerCount));
      setHistory([]);
      setLastRollId("");
      setMessage("La partie commence ! Le joueur rouge ouvre le jeu.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Configuration invalide.");
    }
  }

  async function throwDie() {
    if (!game || rolling || game.winner !== null || game.lastRoll !== null) return;
    setRolling(true);
    setMessage(`🎲 ${names[game.currentPlayer]} lance le dé…`);
    try {
      const response = await fetch("/api/ludo/roll", { method: "POST", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !Number.isInteger(payload?.roll) || payload.roll < 1 || payload.roll > 6 || typeof payload.rollId !== "string") {
        throw new Error(payload?.error || "Le lancer du dé a échoué.");
      }
      await new Promise((resolve) => window.setTimeout(resolve, 750));
      setLastRollId(payload.rollId);
      const next = rollLudo(game, payload.roll);
      setGame(next);
      setHistory((items) => [`${names[game.currentPlayer]} : ${payload.roll}`, ...items].slice(0, 12));
      if (next.currentPlayer !== game.currentPlayer && next.lastRoll === null) {
        setMessage(payload.roll === 6 && game.consecutiveSixes === 2
          ? "Trois 6 de suite : le tour passe au joueur suivant."
          : `Aucun déplacement possible. Au tour de ${names[next.currentPlayer]}.`);
      } else if (next.lastRoll === null) {
        setMessage("Pas de pion déplaçable. Le 6 donne un nouveau lancer !");
      } else {
        setMessage(`${names[game.currentPlayer]} a obtenu ${payload.roll}. Choisis un pion lumineux.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible de lancer le dé.");
    } finally {
      setRolling(false);
    }
  }

  function chooseToken(tokenIndex: number) {
    if (!game || !legalMoves.includes(tokenIndex)) return;
    try {
      const previous = game;
      const moved = moveLudoToken(game, tokenIndex);
      setGame(moved);
      const captured = previous.tokens.some((row, index) => index !== previous.currentPlayer && row.some((p) => p >= 0 && p <= 50 && globalSquare(index, p) === globalSquare(previous.currentPlayer, previous.tokens[previous.currentPlayer][tokenIndex] === -1 ? 0 : previous.tokens[previous.currentPlayer][tokenIndex] + (previous.lastRoll ?? 0))));
      if (moved.winner !== null) {
        setMessage(`🏆 ${names[moved.winner]} remporte la partie ! Tous ses pions sont à la maison.`);
      } else if (captured) {
        setMessage(`💥 Capture ! ${names[previous.currentPlayer]} rejoue.`);
      } else if (moved.currentPlayer === previous.currentPlayer) {
        setMessage(previous.lastRoll === 6 ? "Bien joué ! Un 6 donne un tour supplémentaire." : "Tu as capturé un pion : tu rejoues.");
      } else {
        setMessage(`Au tour de ${names[moved.currentPlayer]}.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Déplacement impossible.");
    }
  }

  return (
    <>
      <SiteHeader active="ludo" />
      <main className="min-h-screen bg-[#101b18] px-3 py-5 text-white sm:px-6">
        <style jsx global>{`
          .ludo-panel{border:1px solid #ffffff18;background:linear-gradient(145deg,#1d3329,#14231d);border-radius:28px}
          .ludo-board{width:min(100%,590px);aspect-ratio:1;margin:auto;display:block;filter:drop-shadow(0 18px 28px #0007)}
          .ludo-action{border-radius:14px;padding:13px 18px;font-weight:900;background:#d1f36a;color:#142018}
          .ludo-action:disabled{opacity:.4;cursor:not-allowed}
          .ludo-token{cursor:pointer;stroke:#fff;stroke-width:2.5}
          .ludo-token:focus{outline:none;stroke:#d1f36a;stroke-width:6}
          .ludo-muted{color:#a6b1a7}
          @media(prefers-reduced-motion:no-preference){.ludo-die{animation:ludo-pop .65s ease-out}.ludo-token{transition:transform .2s,stroke-width .2s}.ludo-token:hover{stroke:#d1f36a;stroke-width:5}}
          @keyframes ludo-pop{0%{transform:rotate(0) scale(.7)}50%{transform:rotate(160deg) scale(1.2)}100%{transform:rotate(360deg) scale(1)}}
        `}</style>
        <div className="mx-auto max-w-6xl">
          <header className="flex items-center justify-between gap-3">
            <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/75"><ArrowLeft size={16}/> Accueil</Link>
            <span className="rounded-full border border-[#c8f169]/25 bg-[#c8f169]/10 px-3 py-1.5 text-xs font-black text-[#d7f89b]">MBOA GAMES 🇨🇲</span>
          </header>
          <section className="ludo-panel mt-6 p-5 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[.25em] text-[#c8f169]">Le classique du quartier</p><h1 className="mt-2 text-4xl font-black sm:text-5xl">Ludo 🎯</h1><p className="ludo-muted mt-3 max-w-xl text-sm leading-6">Fais sortir tes pions, avance au dé et ramène toute ton équipe à la maison avant les autres.</p></div>
              <div className="rounded-2xl bg-[#c8f169]/10 p-4 text-[#d7f89b]"><Dices size={34}/></div>
            </div>
            {!game ? (
              <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_.9fr]">
                <div className="rounded-2xl border border-white/10 bg-black/15 p-5">
                  <h2 className="text-lg font-black">Préparer la partie</h2>
                  <label className="mt-5 block text-sm font-semibold text-white/70">Nombre de joueurs
                    <select value={playerCount} onChange={(e)=>setPlayerCount(Number(e.target.value))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101b18] px-3 py-3 text-white">{[2,3,4].map((n)=><option key={n} value={n}>{n} joueurs</option>)}</select>
                  </label>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {Array.from({length:playerCount},(_,i)=><label key={i} className="text-sm font-semibold text-white/70">Joueur {i+1} · {LABELS[i]}
                      <input value={names[i]} maxLength={18} onChange={(e)=>setNames((old)=>old.map((v,j)=>j===i?e.target.value:v))} className="mt-2 w-full rounded-xl border border-white/10 bg-[#101b18] px-3 py-3 text-white" />
                    </label>)}
                  </div>
                  <button className="ludo-action mt-6 w-full" onClick={startGame}>Lancer la partie</button>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 p-5"><h2 className="font-black">Règles rapides</h2><ul className="ludo-muted mt-4 space-y-3 text-sm leading-6"><li>• 2 à 4 joueurs, chacun avec 4 pions.</li><li>• Il faut faire un 6 pour sortir un pion de la base.</li><li>• Un 6 donne un lancer supplémentaire.</li><li>• Une case sûre protège des captures.</li><li>• Capture un adversaire pour rejouer.</li><li>• Il faut le chiffre exact pour entrer à la maison.</li><li>• Trois 6 consécutifs font perdre le tour.</li></ul></div>
              </div>
            ) : (
              <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
                <div className="rounded-3xl border border-white/10 bg-[#0d1914] p-2 sm:p-4">
                  <svg className="ludo-board" viewBox="0 0 600 600" role="img" aria-label="Plateau de Ludo avec les pions des joueurs">
                    <rect x="8" y="8" width="584" height="584" rx="42" fill="#e7e4d6"/>
                    {HOME.map(([x,y],i)=><g key={i}><rect x={x-84} y={y-84} width="168" height="168" rx="25" fill={COLORS[i]} opacity=".95"/><rect x={x-56} y={y-56} width="112" height="112" rx="18" fill="#f7f4e9"/>{[[-23,-23],[23,-23],[-23,23],[23,23]].map(([dx,dy],j)=><circle key={j} cx={x+dx} cy={y+dy} r="13" fill={COLORS[i]} opacity=".85"/>)}</g>)}
                    <circle cx="300" cy="300" r="215" fill="none" stroke="#c7c3b3" strokeWidth="28"/>
                    {Array.from({length:52},(_,i)=>{const a=(-90+i*360/52)*Math.PI/180;const x=300+Math.cos(a)*190;const y=300+Math.sin(a)*190;const safe=[0,8,13,21,26,34,39,47].includes(i);return <circle key={i} cx={x} cy={y} r="9" fill={safe?"#b6a978":"#fffdf4"} stroke="#8c897d" strokeWidth="1.5"/>;})}
                    {LUDO_PLAYERS.map((p,i)=>{const a=(-90+p.start*360/52)*Math.PI/180;return <circle key={p.id} cx={300+Math.cos(a)*190} cy={300+Math.sin(a)*190} r="12" fill={COLORS[i]} stroke="#fff" strokeWidth="3"/>;})}
                    {LUDO_PLAYERS.map((p,i)=>Array.from({length:5},(_,j)=>{const a=(-90+i*90)*Math.PI/180;const r=172-j*24;return <circle key={p.id+"home"+j} cx={300+Math.cos(a)*r} cy={300+Math.sin(a)*r} r="8" fill={COLORS[i]} opacity=".9"/>;}))}
                    <path d="M300 242 L358 300 L300 358 L242 300 Z" fill="#f4f0e3" stroke="#aaa28e" strokeWidth="2"/>
                    <path d="M300 242 L300 300 L242 300 Z" fill={COLORS[0]}/><path d="M300 242 L358 300 L300 300 Z" fill={COLORS[1]}/><path d="M358 300 L300 358 L300 300 Z" fill={COLORS[2]}/><path d="M300 358 L242 300 L300 300 Z" fill={COLORS[3]}/>
                    {game.tokens.map((row,p)=>row.map((progress,t)=>{const [x,y]=pointFor(p,progress,t);const active=game.currentPlayer===p&&legalMoves.includes(t);return <g key={p+"-"+t} onClick={()=>chooseToken(t)} role="button" tabIndex={active?0:-1} aria-label={`Pion ${t+1} de ${names[p]}${active?" déplaçable":""}`}><circle className="ludo-token" cx={x} cy={y} r={active?15:11} fill={COLORS[p]} opacity={progress===-1?.75:1}/>{active&&<circle cx={x} cy={y} r="20" fill="none" stroke="#d1f36a" strokeWidth="3" strokeDasharray="4 4"/>}</g>;}))}
                  </svg>
                  <p className="ludo-muted px-3 pb-2 text-center text-xs">Les pions entourés de lumière peuvent être déplacés.</p>
                </div>
                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/15 p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-[#c8f169]">Au tour de</p>
                    <h2 className="mt-2 text-2xl font-black" style={{color:COLORS[game.currentPlayer]}}>{activeName}</h2>
                    <p className="ludo-muted mt-1 text-sm">{finishedCount}/4 pions à la maison</p>
                    <div className="mt-5 flex items-center gap-4">
                      <button className="ludo-action flex-1" onClick={throwDie} disabled={rolling||game.lastRoll!==null||game.winner!==null}>{rolling?"Le dé roule…":"Lancer le dé"}</button>
                      <div className="ludo-die grid h-16 w-16 place-items-center rounded-2xl border-2 border-[#d1f36a]/50 bg-[#f7f4e9] text-4xl font-black text-[#17251c]">{game.lastRoll??"🎲"}</div>
                    </div>
                    {legalMoves.length>0&&<p className="mt-4 text-sm font-bold text-[#d1f36a]">Choisis un pion parmi les {legalMoves.length} déplacement(s) possible(s).</p>}
                    {game.winner!==null&&<div className="mt-5 rounded-xl bg-[#d1f36a]/10 p-4 text-center"><Trophy className="mx-auto text-[#d1f36a]"/><strong className="mt-2 block text-xl">Victoire de {names[game.winner]} !</strong></div>}
                    <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm leading-6 text-white/75" aria-live="polite">{message}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/15 p-5"><h3 className="font-black">Les joueurs</h3><div className="mt-3 space-y-3">{Array.from({length:game.playerCount},(_,i)=><div key={i} className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full" style={{background:COLORS[i]}}/>{names[i]}</span><strong>{game.tokens[i].filter(p=>p===57).length}/4</strong></div>)}</div></div>
                  <div className="rounded-2xl border border-white/10 bg-black/15 p-5"><h3 className="font-black">Derniers lancers</h3><div className="ludo-muted mt-3 space-y-2 text-sm">{history.length?history.map((entry,i)=><p key={i}>{entry}</p>):<p>Aucun lancer pour le moment.</p>}</div></div>
                  <div className="flex flex-wrap gap-2"><button className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold" onClick={()=>{setGame(null);setMessage("Configure une nouvelle partie.");}}>Nouvelle partie</button><button className="rounded-xl border border-white/15 px-4 py-3 text-sm font-bold" onClick={()=>setMessage("Partie en cours. Passe le téléphone au joueur actif.")}><Users size={15} className="mr-2 inline"/>Passer le téléphone</button></div>
                </div>
              </div>
            )}
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5"><p className="ludo-muted text-xs">Mode local gratuit · Les mises et paiements ne sont pas activés.</p><button onClick={()=>{setGame(null);setHistory([]);setMessage("Configure les joueurs et lance la partie.");}} className="inline-flex items-center gap-2 text-sm font-bold text-[#d1f36a]"><RotateCcw size={15}/> Réinitialiser</button></div>
          </section>
        </div>
      </main>
    </>
  );
}

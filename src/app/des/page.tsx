"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Dices, RotateCcw, Trophy, Users } from "lucide-react";
import { evaluateThrows, type DiceThrow, validateDiceConfig } from "@/lib/des-engine";

const DIE = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

type RollResponse = { dice: number[]; total: number; rollId: string };

export default function DeuxDesGame() {
  const [diceCount, setDiceCount] = useState(2);
  const [playerCount, setPlayerCount] = useState(2);
  const [millionFace, setMillionFace] = useState(1);
  const [names, setNames] = useState<string[]>(["Joueur 1", "Joueur 2"]);
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(1);
  const [contenders, setContenders] = useState<number[]>([]);
  const [throws, setThrows] = useState<DiceThrow[]>([]);
  const [history, setHistory] = useState<Array<{ round: number; player: string; dice: number[]; total: number; million: boolean; rollId: string }>>([]);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState("Configure la table et lance la partie !");
  const [winner, setWinner] = useState<number | null>(null);
  const [rollError, setRollError] = useState("");

  const activePlayers = useMemo(() => started ? (contenders.length ? contenders : Array.from({ length: playerCount }, (_, i) => i)) : [], [started, contenders, playerCount]);
  const nextPlayer = activePlayers.find((index) => !throws.some((item) => item.playerIndex === index));
  const complete = activePlayers.length > 0 && throws.length === activePlayers.length;

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
      setRollError("");
      setMessage("La partie commence. Passe le téléphone au premier joueur.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Configuration invalide.");
    }
  }

  async function rollForPlayer(playerIndex: number) {
    if (rolling || winner !== null || complete || !activePlayers.includes(playerIndex)) return;
    setRolling(true);
    setRollError("");
    try {
      const response = await fetch("/api/des/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diceCount }),
        cache: "no-store",
      });
      const data = await response.json() as RollResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Lancer impossible.");
      const isMillion = data.dice.every((face) => face === millionFace);
      const item: DiceThrow = { playerIndex, dice: data.dice, total: data.total, isMillion };
      const updated = [...throws, item];
      setThrows(updated);
      setHistory((current) => [...current, {
        round, player: names[playerIndex] || `Joueur ${playerIndex + 1}`,
        dice: data.dice, total: data.total, million: isMillion, rollId: data.rollId,
      }]);
      setMessage(isMillion
        ? `💥 MILLION ! ${names[playerIndex]} fait ${data.dice.join(" - ")} !`
        : `${names[playerIndex]} obtient ${data.total} points.`);
    } catch (error) {
      setRollError(error instanceof Error ? error.message : "Erreur réseau.");
    } finally {
      setRolling(false);
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

  const turnPlayer = nextPlayer === undefined ? null : nextPlayer;
  const roundThrows = throws;

  return (
    <main className="min-h-screen bg-[#101b18] px-4 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/75 hover:bg-white/5"><ArrowLeft size={16} /> Accueil</Link>
          <span className="rounded-full border border-[#c8f169]/25 bg-[#c8f169]/10 px-3 py-1.5 text-xs font-black text-[#d7f89b]">MBOA GAMES 🇨🇲</span>
        </header>

        <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#1d3329] to-[#14231d] p-5 shadow-2xl sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-xs font-black uppercase tracking-[.25em] text-[#c8f169]">Le jeu de dés du 237</p><h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Le 2 Dès <span className="text-3xl">🎲</span></h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/60">Le plus gros score gagne. Un Million peut tout changer !</p></div>
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
                <button onClick={() => { setStarted(false); setWinner(null); }} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/5"><RotateCcw className="mr-1 inline" size={14} /> Nouvelle table</button>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4" aria-live="polite">
                <p className="text-sm font-bold">{message}</p>
                {turnPlayer !== null && winner === null && <p className="mt-2 text-xs text-[#d7f89b]">Au tour de {names[turnPlayer]} · passe le téléphone au joueur suivant.</p>}
                {rollError && <p className="mt-2 text-sm text-rose-300">{rollError}</p>}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activePlayers.map((index) => {
                  const item = roundThrows.find((entry) => entry.playerIndex === index);
                  const isNext = turnPlayer === index && winner === null;
                  return <article key={index} className={`rounded-2xl border p-4 ${isNext ? "border-[#c8f169]/60 bg-[#c8f169]/10" : "border-white/10 bg-black/15"}`}>
                    <div className="flex items-center justify-between gap-2"><p className="font-black">{names[index]}</p><span className="text-xs text-white/45">Joueur {index + 1}</span></div>
                    <div className="my-4 flex min-h-14 items-center justify-center gap-2">{item ? item.dice.map((face, i) => <span key={i} className="text-5xl leading-none drop-shadow-lg">{DIE[face]}</span>) : Array.from({ length: diceCount }, (_, i) => <span key={i} className={`grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/5 text-2xl ${rolling && isNext ? "animate-bounce" : ""}`}>⚄</span>)}</div>
                    {item ? <div className="text-center"><p className="text-xl font-black text-[#d7f89b]">{item.isMillion ? "💥 MILLION !" : `${item.total} points`}</p><p className="mt-1 text-xs text-white/45">{item.dice.join(" · ")}</p></div> : <p className="text-center text-xs text-white/40">En attente du lancer</p>}
                    {isNext && !complete && <button disabled={rolling} onClick={() => rollForPlayer(index)} className="mt-4 w-full rounded-xl bg-[#c8f169] px-4 py-3 font-black text-[#101b18] disabled:opacity-50">{rolling ? "Les dés roulent…" : "🎲 Lancer les dés"}</button>}
                  </article>;
                })}
              </div>
              {complete && winner === null && <button onClick={resolveRound} className="mt-5 w-full rounded-xl bg-[#ff895c] px-5 py-4 font-black text-[#24150f]">Comparer les résultats <Trophy className="ml-2 inline" size={18} /></button>}
              {winner !== null && <div className="mt-6 rounded-2xl border border-[#c8f169]/40 bg-[#c8f169]/10 p-6 text-center"><Trophy className="mx-auto text-[#d7f89b]" size={42} /><h2 className="mt-3 text-2xl font-black">{names[winner]} gagne !</h2><p className="mt-2 text-sm text-white/60">Bravo, le village a son champion !</p><button onClick={() => { setStarted(false); setWinner(null); }} className="mt-5 rounded-xl bg-[#c8f169] px-6 py-3 font-black text-[#101b18]">Rejouer</button></div>}
            </>
          )}
        </section>

        {started && <section className="mt-5 rounded-2xl border border-white/10 bg-[#192722] p-5"><div className="flex items-center gap-2"><Users size={18} className="text-[#c8f169]" /><h2 className="font-black">Historique des lancers</h2></div><div className="mt-3 space-y-2">{history.length === 0 ? <p className="text-sm text-white/45">Les lancers apparaîtront ici.</p> : history.map((item, index) => <div key={item.rollId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-black/15 px-3 py-2 text-sm"><span className="text-white/60">Manche {item.round} · {item.player}</span><span className="font-bold">{item.dice.join(" · ")} <span className="text-[#d7f89b]">= {item.million ? "MILLION" : item.total}</span></span></div>)}</div></section>}
        <p className="mt-7 text-center text-xs text-white/35">Mboa Games · Le 2 Dès · Lancers générés côté serveur · 🇨🇲</p>
      </div>
    </main>
  );
}

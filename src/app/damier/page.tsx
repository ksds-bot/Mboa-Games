"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, RotateCcw, Users, Crown, Lightbulb } from "lucide-react";
import SiteHeader from "@/components/site-header";

type Piece = 0 | 1 | 2 | 3 | 4;
type Player = 1 | 2;
type Move = { from: number; to: number; captures: number[]; path: number[] };
type Mode = "bot" | "local";
type HistoryEntry = { board: Piece[]; turn: Player };

const SIZE = 8;
const other = (player: Player): Player => player === 1 ? 2 : 1;
const owner = (piece: Piece): Player | 0 => piece === 1 || piece === 3 ? 1 : piece === 2 || piece === 4 ? 2 : 0;
const isKing = (piece: Piece) => piece === 3 || piece === 4;
const inside = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
const index = (r: number, c: number) => r * SIZE + c;
const row = (i: number) => Math.floor(i / SIZE);
const col = (i: number) => i % SIZE;

function initialBoard(): Piece[] {
  const board = Array<Piece>(64).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) board[index(r, c)] = 2;
  for (let r = 5; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) board[index(r, c)] = 1;
  return board;
}

function capturePaths(board: Piece[], from: number, player: Player, captured: number[] = [], path: number[] = []): Move[] {
  const piece = board[from];
  const r = row(from), c = col(from);
  const options: Move[] = [];
  const dirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
  for (const [dr, dc] of dirs) {
    if (isKing(piece)) {
      let rr = r + dr, cc = c + dc, enemy = -1;
      while (inside(rr, cc)) {
        const at = index(rr, cc);
        if (board[at] !== 0) {
          if (owner(board[at]) === player || enemy !== -1 || captured.includes(at)) break;
          enemy = at;
        } else if (enemy !== -1) {
          const next = board.slice();
          next[from] = 0;
          next[enemy] = 0;
          next[at] = piece;
          options.push(...capturePaths(next, at, player, [...captured, enemy], [...path, at]));
        }
        rr += dr; cc += dc;
      }
    } else {
      const er = r + dr, ec = c + dc, lr = r + dr * 2, lc = c + dc * 2;
      if (!inside(lr, lc) || !inside(er, ec)) continue;
      const enemy = index(er, ec), landing = index(lr, lc);
      if (owner(board[enemy]) === other(player) && board[landing] === 0 && !captured.includes(enemy)) {
        const next = board.slice();
        next[from] = 0;
        next[enemy] = 0;
        next[landing] = piece;
        options.push(...capturePaths(next, landing, player, [...captured, enemy], [...path, landing]));
      }
    }
  }
  return options.length ? options : captured.length ? [{ from: path.length ? path[0] === from ? from : -1 : from, to: from, captures: captured, path }] : [];
}

function legalMoves(board: Piece[], player: Player): Move[] {
  const captures: Move[] = [];
  for (let from = 0; from < 64; from++) {
    if (owner(board[from]) !== player) continue;
    const found = capturePaths(board, from, player);
    for (const move of found) if (move.captures.length) captures.push({ ...move, from });
  }
  if (captures.length) {
    const maximum = Math.max(...captures.map(move => move.captures.length));
    return captures.filter(move => move.captures.length === maximum);
  }
  const moves: Move[] = [];
  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (owner(piece) !== player) continue;
    const r = row(from), c = col(from);
    const dirs = isKing(piece) ? [-1, 1] : [player === 1 ? -1 : 1];
    for (const dr of dirs) for (const dc of [-1, 1]) {
      let rr = r + dr, cc = c + dc;
      while (inside(rr, cc) && board[index(rr, cc)] === 0) {
        moves.push({ from, to: index(rr, cc), captures: [], path: [index(rr, cc)] });
        if (!isKing(piece)) break;
        rr += dr; cc += dc;
      }
    }
  }
  return moves;
}

function applyMove(board: Piece[], move: Move): Piece[] {
  const next = board.slice();
  let piece = next[move.from];
  next[move.from] = 0;
  for (const captured of move.captures) next[captured] = 0;
  const targetRow = row(move.to);
  if (piece === 1 && targetRow === 0) piece = 3;
  if (piece === 2 && targetRow === 7) piece = 4;
  next[move.to] = piece;
  return next;
}

function countPieces(board: Piece[], player: Player) {
  return board.filter(piece => owner(piece) === player).length;
}

export default function DamierPage() {
  const [board, setBoard] = useState<Piece[]>(initialBoard);
  const [turn, setTurn] = useState<Player>(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("bot");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [message, setMessage] = useState("À toi de jouer. Sélectionne un pion vert.");
  const [thinking, setThinking] = useState(false);

  const moves = useMemo(() => legalMoves(board, turn), [board, turn]);
  const selectedMoves = useMemo(() => selected === null ? [] : moves.filter(move => move.from === selected), [moves, selected]);
  const winner = useMemo(() => {
    if (countPieces(board, 1) === 0 || legalMoves(board, 1).length === 0) return 2;
    if (countPieces(board, 2) === 0 || legalMoves(board, 2).length === 0) return 1;
    return 0;
  }, [board]);

  const restart = useCallback((nextMode: Mode = mode) => {
    setBoard(initialBoard());
    setTurn(1);
    setSelected(null);
    setMode(nextMode);
    setHistory([]);
    setThinking(false);
    setMessage("Nouvelle partie ! Les pions verts commencent.");
  }, [mode]);

  const play = useCallback((move: Move) => {
    setHistory(previous => [...previous, { board, turn }]);
    setBoard(applyMove(board, move));
    setSelected(null);
    setTurn(other(turn));
    setMessage(move.captures.length ? `Belle prise : ${move.captures.length} pion(s) capturé(s) !` : "Bien joué. À l'adversaire.");
  }, [board, turn]);

  const chooseSquare = (square: number) => {
    if (winner || thinking || (mode === "bot" && turn === 2)) return;
    const possible = selectedMoves.find(move => move.to === square);
    if (possible) { play(possible); return; }
    if (owner(board[square]) === turn) {
      setSelected(square);
      setMessage(moves.some(move => move.captures.length) ? "Prise obligatoire : choisis une case illuminée." : "Choisis la destination de ton pion.");
    } else setSelected(null);
  };

  useEffect(() => {
    if (mode !== "bot" || turn !== 2 || winner) return;
    setThinking(true);
    const timer = window.setTimeout(() => {
      const choices = legalMoves(board, 2).slice().sort((a, b) => b.captures.length - a.captures.length);
      if (choices[0]) {
        const move = choices[0];
        setHistory(previous => [...previous, { board, turn: 2 }]);
        setBoard(applyMove(board, move));
        setTurn(1);
        setMessage(move.captures.length ? `Mboma fait ${move.captures.length} prise(s). À toi !` : "Mboma a joué. À toi !");
      }
      setThinking(false);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [board, mode, turn, winner]);

  const undo = () => {
    if (!history.length || thinking) return;
    const stepsToUndo = mode === "bot" ? Math.min(2, history.length) : 1;
    const previous = history[history.length - stepsToUndo];
    setBoard(previous.board);
    setHistory(items => items.slice(0, -stepsToUndo));
    setTurn(previous.turn);
    setSelected(null);
    setMessage("Dernier coup annulé.");
  };

  const captureRequired = moves.some(move => move.captures.length > 0);
  const greenCount = countPieces(board, 1), redCount = countPieces(board, 2);

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#fff4ce_0%,#fffaf0_48%,#eef8ed_100%)] text-[#183c28]">
      <SiteHeader />
      <div className="mx-auto w-full max-w-6xl px-3 pb-12 pt-5 sm:px-6 sm:pt-8">
        <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-[#dce8dc] bg-white/80 px-4 py-2 text-sm font-bold text-[#42634b] transition hover:-translate-x-1 hover:border-[#e7bd35]">
          <ArrowLeft size={16}/> Retour aux jeux
        </Link>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_310px] lg:items-start">
          <section className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#e8f5e7] px-3 py-1 text-[11px] font-black tracking-[.16em] text-[#16834b]">♟️ LE CLASSIQUE DU VILLAGE</div>
                <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Damier <span className="text-[#e36b3c]">237</span></h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-[#64776a]">Anticipe, protège tes pions et prépare tes prises. Chaque coup compte !</p>
              </div>
              <div className="flex gap-2">
                <button onClick={undo} disabled={!history.length || thinking} className="rounded-full border border-[#dce8dc] bg-white px-3 py-2 text-xs font-bold text-[#42634b] transition hover:border-[#e7bd35] disabled:opacity-40"><RotateCcw size={14} className="mr-1 inline"/> Annuler</button>
                <button onClick={() => restart()} className="rounded-full bg-[#f4c542] px-4 py-2 text-xs font-black text-[#183c28] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#ffd85b]"><RotateCcw size={14} className="mr-1 inline"/> Rejouer</button>
              </div>
            </div>

            <div className="rounded-[28px] border border-[#e2e8d8] bg-white/85 p-2 shadow-[0_18px_55px_rgba(35,74,43,.12)] sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-2 px-1 sm:px-2">
                <div className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black ${turn === 1 ? "bg-[#e8f5e7] text-[#16834b]" : "bg-[#f5f0e4] text-[#64776a]"}`}>
                  <span className="h-3 w-3 rounded-full border-2 border-white bg-[#16834b] shadow"/> Vert · {greenCount}
                </div>
                <span className="text-[10px] font-black uppercase tracking-[.16em] text-[#91a092]">Tour {winner ? "terminé" : turn === 1 ? "des verts" : "des rouges"}</span>
                <div className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black ${turn === 2 ? "bg-[#fff0e9] text-[#c6532e]" : "bg-[#f5f0e4] text-[#64776a]"}`}>
                  Rouge · {redCount}<span className="h-3 w-3 rounded-full border-2 border-white bg-[#e36b3c] shadow"/>
                </div>
              </div>

              <div className="mx-auto grid w-full max-w-[620px] grid-cols-8 overflow-hidden rounded-xl border-[5px] border-[#9a6a3d] shadow-[inset_0_0_0_2px_rgba(255,255,255,.35),0_8px_24px_rgba(65,43,23,.16)] sm:rounded-2xl sm:border-[7px]">
                {board.map((piece, square) => {
                  const r = row(square), c = col(square);
                  const dark = (r + c) % 2 === 1;
                  const isSelected = selected === square;
                  const target = selectedMoves.some(move => move.to === square);
                  const canSelect = owner(piece) === turn && !(mode === "bot" && turn === 2);
                  return (
                    <button key={square} onClick={() => chooseSquare(square)} aria-label={`Ligne ${r + 1}, colonne ${c + 1}${piece ? owner(piece) === 1 ? ", pion vert" : ", pion rouge" : ""}`} className={`relative flex aspect-square min-w-0 items-center justify-center ${dark ? "bg-[#b77b47]" : "bg-[#f7e8c9]"} ${isSelected ? "z-10 ring-4 ring-inset ring-[#f4c542]" : ""} ${target ? "cursor-pointer" : canSelect ? "cursor-pointer" : "cursor-default"}`}>
                      {target && <span className="absolute h-[34%] w-[34%] rounded-full border-[3px] border-[#f8d34f] bg-[#fff5b7]/80 shadow-[0_0_14px_rgba(255,223,88,.9)] sm:border-4"/>}
                      {piece !== 0 && <span className={`relative flex h-[72%] w-[72%] items-center justify-center rounded-full border-[3px] shadow-[0_3px_5px_rgba(0,0,0,.3)] transition-transform ${owner(piece) === 1 ? "border-[#c9f3b6] bg-gradient-to-br from-[#37ad65] to-[#12643b]" : "border-[#ffd1bd] bg-gradient-to-br from-[#fa956b] to-[#bb432b]"} ${isSelected ? "scale-110" : canSelect ? "hover:scale-105" : ""}`}>
                          <span className="absolute inset-[3px] rounded-full border border-white/25"/>
                          {isKing(piece) && <Crown className="h-[48%] w-[48%] text-[#fff4c4] drop-shadow" strokeWidth={2.8}/>}
                        </span>}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] font-semibold text-[#829184] sm:px-2">
                <span>{captureRequired && !winner ? "⚡ Prise obligatoire" : "12 pions chacun · Dames volantes"}</span>
                <span>Plateau 8 × 8</span>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[24px] border border-[#dce8dc] bg-white p-5 shadow-[0_12px_35px_rgba(35,74,43,.07)]">
              <div className="flex items-center gap-2 text-sm font-black"><Bot className="text-[#16834b]" size={18}/> Mode de jeu</div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button onClick={() => restart("bot")} className={`rounded-xl border p-3 text-left transition ${mode === "bot" ? "border-[#16834b] bg-[#eaf6e9]" : "border-[#e3eae0] bg-[#fbfcf8] hover:border-[#b6cdb7]"}`}>
                  <Bot size={19} className="mb-2 text-[#16834b]"/><strong className="block text-xs">Vs Mboma</strong><span className="mt-1 block text-[10px] text-[#7c8d7e]">Solo contre l'IA</span>
                </button>
                <button onClick={() => restart("local")} className={`rounded-xl border p-3 text-left transition ${mode === "local" ? "border-[#16834b] bg-[#eaf6e9]" : "border-[#e3eae0] bg-[#fbfcf8] hover:border-[#b6cdb7]"}`}>
                  <Users size={19} className="mb-2 text-[#e36b3c]"/><strong className="block text-xs">À deux</strong><span className="mt-1 block text-[10px] text-[#7c8d7e]">Même appareil</span>
                </button>
              </div>
              <div className="mt-4 rounded-2xl bg-[#fff8e6] p-4">
                <div className="text-[10px] font-black uppercase tracking-[.15em] text-[#a36a1e]">État de la partie</div>
                <p className="mt-2 text-sm font-bold leading-6 text-[#49614b]">{winner ? winner === 1 ? "🏆 Les verts remportent la partie !" : "🏆 Les rouges remportent la partie !" : thinking ? "🤖 Mboma réfléchit à son prochain coup…" : message}</p>
              </div>
            </div>
            <div className="rounded-[24px] border border-[#dce8dc] bg-white p-5 shadow-[0_12px_35px_rgba(35,74,43,.07)]">
              <div className="flex items-center gap-2 text-sm font-black"><Lightbulb size={18} className="text-[#e3a51f]"/> Règles rapides</div>
              <ul className="mt-3 space-y-3 text-xs leading-5 text-[#64776a]">
                <li><b className="text-[#244c30]">Déplacement :</b> les pions avancent en diagonale d'une case.</li>
                <li><b className="text-[#244c30]">Prise :</b> sauter un pion adverse est obligatoire quand c'est possible.</li>
                <li><b className="text-[#244c30]">Rafle :</b> continue à prendre tant qu'une nouvelle prise est disponible.</li>
                <li><b className="text-[#244c30]">Dame :</b> atteint la dernière rangée pour devenir une dame volante.</li>
                <li><b className="text-[#244c30]">Victoire :</b> gagne en prenant tous les pions adverses ou en le bloquant.</li>
              </ul>
            </div>
            <Link href="/" className="block rounded-2xl border border-[#dce8dc] bg-[#f1f8ef] px-4 py-3 text-center text-xs font-black text-[#42634b] transition hover:bg-[#e5f2e3]">Découvrir les autres jeux →</Link>
          </aside>
        </div>
        <p className="mt-6 text-center text-[10px] leading-5 text-[#92a093]">Version locale jouable · Les salles et les coups à distance seront branchés dans une prochaine étape.</p>
      </div>
    </main>
  );
}

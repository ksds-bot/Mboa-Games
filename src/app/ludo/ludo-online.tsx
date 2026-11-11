"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Check, Copy, Crown, Dices, DoorOpen, LoaderCircle, LogIn, RefreshCw, ShieldCheck, Users, Wifi } from "lucide-react";

type Player = { userId: string; seat: number; ready: boolean; username: string };
type Room = { id: string; code: string; status: "waiting" | "playing" | "finished"; maxPlayers: number; hostId: string };
type Game = { playerOrder: string[]; tokens: number[][]; currentPlayer: number; lastRoll: number | null; consecutiveSixes: number; winner: number | null; turnNumber: number };
type Snapshot = { room: Room; players: Player[]; game: Game | null };
const COLORS = ["#ed5757", "#4bbd82", "#efc84a", "#5796e8"];
const COLOR_NAMES = ["Rouge", "Vert", "Jaune", "Bleu"];
const TRACK: [number, number][] = [
  [6,1],[6,2],[6,3],[6,4],[6,5],[5,6],[4,6],[3,6],[2,6],[1,6],[0,6],[0,7],[0,8],
  [1,8],[2,8],[3,8],[4,8],[5,8],[6,9],[6,10],[6,11],[6,12],[6,13],[6,14],[7,14],
  [8,14],[8,13],[8,12],[8,11],[8,10],[8,9],[9,8],[10,8],[11,8],[12,8],[13,8],[14,8],
  [14,7],[14,6],[13,6],[12,6],[11,6],[10,6],[9,6],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0],
  [7,0],[6,0],
];
const SAFE = new Set([0,8,13,21,26,34,39,47]);
const BASES = [
  { x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 9 }, { x: 0, y: 9 },
];
const HOME_LANES: [number, number][][] = [
  [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]],
  [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]],
  [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]],
  [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]],
];
const BASE_SPOTS: [number, number][][] = [
  [[1,1],[1,4],[4,1],[4,4]],
  [[1,10],[1,13],[4,10],[4,13]],
  [[10,10],[10,13],[13,10],[13,13]],
  [[10,1],[10,4],[13,1],[13,4]],
];

function cellCenter(row: number, col: number): [number, number] {
  return [20 + col * 40, 20 + row * 40];
}
function tokenPoint(player: number, progress: number, token: number): [number, number] {
  let point: [number, number];
  if (progress === -1) point = cellCenter(...BASE_SPOTS[player][token]);
  else if (progress >= 51) point = cellCenter(...HOME_LANES[player][Math.min(5, progress - 51)]);
  else point = cellCenter(...TRACK[(player * 13 + progress) % 52]);
  const offsets: [number,number][] = [[-5,-5],[5,-5],[-5,5],[5,5]];
  return [point[0] + offsets[token][0], point[1] + offsets[token][1]];
}
function canMove(game: Game, player: number, token: number, roll: number): boolean {
  const previous=game.tokens[player][token];
  if(previous===57 || (previous===-1 && roll!==6))return false;
  const next=previous===-1?0:previous+roll;
  if(previous>=0&&next>57)return false;
  for(let step=previous===-1?0:previous+1;step<=next&&step<=50;step++){
    const square=(player*13+step)%52;
    for(let owner=0;owner<game.playerOrder.length;owner++){
      let count=0;
      for(let other=0;other<4;other++){
        if(owner===player&&other===token)continue;
        const progress=game.tokens[owner][other];
        if(progress>=0&&progress<=50&&(owner*13+progress)%52===square)count++;
      }
      if(count>=2)return false;
    }
  }
  return true;
}
function legalMoves(game: Game): number[] {
  if (game.lastRoll === null) return [];
  return game.tokens[game.currentPlayer].flatMap((_,i)=>canMove(game,game.currentPlayer,i,game.lastRoll!)?[i]:[]);
}

function LudoBoard({ game, players, myTurn, onMove }: { game: Game; players: Player[]; myTurn: boolean; onMove: (index: number) => void }) {
  const moves = legalMoves(game);
  return (
    <div className="overflow-hidden rounded-[26px] border border-[#e5dfcc] bg-[#f4f0e4] p-2 shadow-[0_24px_70px_#07110b66] sm:p-4">
      <svg viewBox="0 0 600 600" className="block w-full" role="img" aria-label="Plateau de Ludo en croix, quatre bases et parcours de 52 cases">
        <rect x="0" y="0" width="600" height="600" rx="18" fill="#e7e2d2"/>
        {BASES.map((base,i)=><g key={"base"+i}>
          <rect x={base.x*40} y={base.y*40} width="240" height="240" rx="12" fill={COLORS[i]}/>
          <rect x={base.x*40+40} y={base.y*40+40} width="160" height="160" rx="12" fill="#faf8ef"/>
          {BASE_SPOTS[i].map(([r,c],j)=>{const [x,y]=cellCenter(r,c);return <circle key={j} cx={x} cy={y} r="16" fill={COLORS[i]} stroke="#fff" strokeWidth="5"/>;})}
        </g>)}
        {TRACK.map(([r,c],i)=>{const [x,y]=cellCenter(r,c);const playerStart=[0,13,26,39].indexOf(i);return <g key={"track"+i}>
          <rect x={c*40+1} y={r*40+1} width="38" height="38" fill={playerStart>=0?COLORS[playerStart]:"#fffdf7"} stroke="#c9c4b7" strokeWidth="1.5"/>
          {SAFE.has(i)&&<text x={x} y={y+7} fontSize="22" textAnchor="middle" fill="#a79b78">★</text>}
        </g>;})}
        {HOME_LANES.map((lane,i)=>lane.map(([r,c],j)=>{const [x,y]=cellCenter(r,c);return <rect key={"lane"+i+"-"+j} x={c*40+1} y={r*40+1} width="38" height="38" fill={COLORS[i]} opacity=".88" stroke="#c9c4b7" strokeWidth="1.5"/>;}))}
        <path d="M240 240 L360 240 L360 360 L240 360 Z" fill="#f8f5e9" stroke="#c9c4b7" strokeWidth="2"/>
        <path d="M240 240 L360 240 L300 300 Z" fill={COLORS[0]}/><path d="M360 240 L360 360 L300 300 Z" fill={COLORS[1]}/>
        <path d="M360 360 L240 360 L300 300 Z" fill={COLORS[2]}/><path d="M240 360 L240 240 L300 300 Z" fill={COLORS[3]}/>
        {game.tokens.slice(0,game.playerOrder.length).map((row,p)=>row.map((progress,t)=>{const [x,y]=tokenPoint(p,progress,t);const movable=myTurn&&p===game.currentPlayer&&moves.includes(t);return <g key={p+"-"+t} onClick={()=>movable&&onMove(t)} className={movable?"cursor-pointer":""} role={movable?"button":undefined} tabIndex={movable?0:undefined} aria-label={`Pion ${t+1}, ${COLOR_NAMES[p]}`} onKeyDown={(e)=>{if(movable&&(e.key==="Enter"||e.key===" "))onMove(t);}}>
          {movable&&<circle cx={x} cy={y} r="18" fill="none" stroke="#19251d" strokeWidth="3" strokeDasharray="4 4"/>}
          <circle cx={x} cy={y+3} r="13" fill="#000" opacity=".22"/>
          <circle className="ludo-pawn" cx={x} cy={y} r="12" fill={COLORS[p]} stroke="#fff" strokeWidth="3"/>
          <circle cx={x-3} cy={y-3} r="3" fill="#fff" opacity=".75"/>
        </g>;}))}
      </svg>
      <div className="flex flex-wrap justify-center gap-3 px-2 pb-2 text-[11px] font-extrabold uppercase tracking-wide text-[#586356]">
        {players.map((p,i)=><span key={p.userId} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{background:COLORS[i]}}/>{p.username}</span>)}
      </div>
    </div>
  );
}

export default function LudoOnline() {
  const supabase = useMemo(() => createClient(), []);
  const [userId,setUserId] = useState("");
  const [codeInput,setCodeInput] = useState("");
  const [roomCode,setRoomCode] = useState("");
  const [snapshot,setSnapshot] = useState<Snapshot|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("Crée une salle privée ou rejoins tes amis avec un code.");
  const [lastRoll,setLastRoll] = useState<number|null>(null);
  const [copied,setCopied] = useState(false);

  const refreshRoom = useCallback(async (code:string) => {
    const {data,error:rpcError} = await supabase.rpc("ludo_room_snapshot",{p_code:code});
    if(rpcError) throw rpcError;
    const next = data as unknown as Snapshot;
    setSnapshot(next);
    setRoomCode(next.room.code);
  },[supabase]);

  useEffect(()=>{
    let active = true;
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,session)=>{
      if(active)setUserId(session?.user?.id??"");
    });
    supabase.auth.getUser().then(({data,error:authError})=>{
      if(!active)return;
      if(authError){setError(authError.message);return;}
      setUserId(data.user?.id??"");
    });
    return ()=>{
      active=false;
      subscription.unsubscribe();
    };
  },[supabase]);

  useEffect(()=>{
    if(!snapshot?.room.id)return;
    const channel=supabase.channel("ludo-room-"+snapshot.room.id)
      .on("postgres_changes",{event:"*",schema:"public",table:"room_players",filter:"room_id=eq."+snapshot.room.id},()=>{void refreshRoom(snapshot.room.code).catch((e)=>setError(e.message));})
      .on("postgres_changes",{event:"*",schema:"public",table:"game_sessions",filter:"room_id=eq."+snapshot.room.id},()=>{void refreshRoom(snapshot.room.code).catch((e)=>setError(e.message));})
      .subscribe();
    return ()=>{void supabase.removeChannel(channel);};
  },[snapshot?.room.id,snapshot?.room.code,supabase,refreshRoom]);

  const run = async (task:()=>Promise<void>) => {
    setBusy(true);setError("");
    try{await task();}catch(e){
      const message = e && typeof e === "object" && "message" in e && typeof e.message === "string"
        ? e.message
        : e instanceof Error ? e.message : "Une erreur est survenue.";
      setError(message);
    }finally{setBusy(false);}
  };
  async function createRoom(){
    await run(async()=>{
      if(!userId)throw new Error("Connecte-toi pour jouer en ligne.");
      const {data,error:rpcError}=await supabase.rpc("ludo_create_room",{p_max_players:4});
      if(rpcError)throw rpcError;
      const result=data as {id:string;code:string};
      await refreshRoom(result.code);
      setNotice("Salle créée ! Envoie le code à tes amis.");
    });
  }
  async function joinRoom(){
    await run(async()=>{
      if(!userId)throw new Error("Connecte-toi pour jouer en ligne.");
      const clean=codeInput.trim().toUpperCase();
      if(!/^[A-Z0-9]{4,10}$/.test(clean))throw new Error("Entre un code de salle valide.");
      const {error:rpcError}=await supabase.rpc("ludo_join_room",{p_code:clean});
      if(rpcError)throw rpcError;
      await refreshRoom(clean);
      setNotice("Tu as rejoint la salle. Prépare-toi !");
    });
  }
  async function toggleReady(){
    if(!snapshot)return;
    await run(async()=>{
      const me=snapshot.players.find(p=>p.userId===userId);
      const {error:rpcError}=await supabase.rpc("ludo_set_ready",{p_code:roomCode,p_ready:!me?.ready});
      if(rpcError)throw rpcError;
      await refreshRoom(roomCode);
    });
  }
  async function startGame(){
    await run(async()=>{
      const {data,error:authError}=await supabase.auth.getUser();
      if(authError)throw authError;
      const currentUserId=data.user?.id??"";
      setUserId(currentUserId);
      if(!currentUserId)throw new Error("Ta session a expiré. Reconnecte-toi pour démarrer la partie.");
      if(snapshot?.room.hostId!==currentUserId)throw new Error("Ce compte n’est pas celui qui a créé la salle. Reconnecte-toi avec le compte de l’hôte.");
      const {error:rpcError}=await supabase.rpc("ludo_start_room",{p_code:roomCode});
      if(rpcError)throw rpcError;
      await refreshRoom(roomCode);
      setNotice("La partie est lancée. Bonne chance !");
    });
  }
  async function roll(){
    await run(async()=>{
      const {data,error:rpcError}=await supabase.rpc("ludo_roll",{p_code:roomCode});
      if(rpcError)throw rpcError;
      const result=data as {roll:number;state:Game};
      setLastRoll(result.roll);
      setSnapshot(old=>old?{...old,game:result.state}:old);
      if(result.state.lastRoll===null)setNotice(result.roll===6?"Six ! Tu peux relancer.":"Aucun déplacement possible : le tour passe.");
      else setNotice("Tu as obtenu "+result.roll+". Choisis un pion entouré.");
    });
  }
  async function move(index:number){
    await run(async()=>{
      const {data,error:rpcError}=await supabase.rpc("ludo_move",{p_code:roomCode,p_token_index:index});
      if(rpcError)throw rpcError;
      const result=data as {state:Game;captured:boolean;winner:boolean};
      setSnapshot(old=>old?{...old,game:result.state}:old);
      if(result.winner)setNotice("🏆 Victoire ! Tu as ramené tes quatre pions à la maison.");
      else if(result.captured)setNotice("💥 Capture ! Tu rejoues.");
      else setNotice("Pion déplacé. Le jeu passe au joueur suivant.");
    });
  }
  async function copyCode(){
    try{await navigator.clipboard.writeText(roomCode);setCopied(true);window.setTimeout(()=>setCopied(false),1800);}
    catch{setError("Copie impossible sur cet appareil. Note le code : "+roomCode);}
  }

  const room=snapshot?.room;
  const players=snapshot?.players??[];
  const game=snapshot?.game??null;
  const myPlayer=players.find(p=>p.userId===userId);
  const isHost=!!room&&room.hostId===userId;
  const myTurn=!!game&&game.winner===null&&game.playerOrder[game.currentPlayer]===userId;
  const moves=game?legalMoves(game):[];
  const readyToStart=players.length>=2&&players.every(p=>p.ready);
  const activeName=game?players.find(p=>p.userId===game.playerOrder[game.currentPlayer])?.username??"Joueur":"";

  return (
    <main className="min-h-screen bg-[#101a16] px-3 pb-10 pt-5 text-white sm:px-6">
      <style jsx global>{`
        .ludo-glass{background:linear-gradient(145deg,#1d3027,#14221c);border:1px solid #ffffff16;border-radius:28px;box-shadow:0 22px 70px #0004}
        .ludo-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;border-radius:15px;padding:14px 18px;font-weight:900;background:#d2f178;color:#172219;transition:transform .18s,filter .18s}
        .ludo-btn:hover:not(:disabled){filter:brightness(1.05);transform:translateY(-1px)}
        .ludo-btn:disabled{opacity:.42;cursor:not-allowed}
        .ludo-secondary{border:1px solid #ffffff25;background:#ffffff09;border-radius:14px;padding:12px 15px;font-weight:800}
        .ludo-input{width:100%;border:1px solid #ffffff24;background:#0d1712;border-radius:14px;padding:14px;color:white;outline:none}
        .ludo-input:focus{border-color:#d2f178;box-shadow:0 0 0 3px #d2f17822}\n        .ludo-pawn{transition:cx .28s ease,cy .28s ease}\n        .ludo-die{transition:transform .18s ease}
        @media(prefers-reduced-motion:no-preference){.ludo-die{animation:die-in .45s cubic-bezier(.2,.8,.2,1)}}
        @keyframes die-in{0%{transform:rotate(-25deg) scale(.5);opacity:.2}100%{transform:rotate(0) scale(1);opacity:1}}
      `}</style>
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-bold text-white/75"><ArrowLeft size={16}/> Accueil</Link>
          <span className="rounded-full border border-[#d2f178]/25 bg-[#d2f178]/10 px-3 py-2 text-[11px] font-black tracking-[.2em] text-[#d2f178]">MBOA GAMES · LUDO ONLINE</span>
        </header>
        <section className="ludo-glass p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-xs font-black tracking-[.25em] text-[#d2f178]">LE CLASSIQUE, ENTRE AMIS</p><h1 className="mt-2 text-4xl font-black sm:text-5xl">Ludo <span className="text-[#d2f178]">237</span></h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/60">Crée une salle privée, partage ton code et joue en direct avec tes amis, chacun sur son téléphone.</p></div>
            <div className="rounded-2xl bg-[#d2f178]/10 p-4 text-[#d2f178]"><Dices size={38}/></div>
          </div>
          {!userId?(
            <div className="mt-8 rounded-2xl border border-[#d2f178]/25 bg-[#d2f178]/[.06] p-6 text-center">
              <LogIn className="mx-auto mb-3 text-[#d2f178]" size={30}/><h2 className="text-xl font-black">Connecte-toi pour jouer en ligne</h2><p className="mx-auto mt-2 max-w-md text-sm text-white/60">Ton compte Mboa Games permet de retrouver ton siège et de synchroniser la partie sur tous les téléphones.</p><Link className="ludo-btn mt-5" href="/connexion?mode=login">Se connecter / Créer un compte</Link>
            </div>
          ):!room?(
            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/15 p-6"><span className="text-3xl">🏠</span><h2 className="mt-3 text-xl font-black">Créer une salle privée</h2><p className="mt-2 text-sm leading-6 text-white/55">Tu seras l’hôte. Invite jusqu’à trois amis avec un code unique.</p><button className="ludo-btn mt-6 w-full" disabled={busy} onClick={createRoom}>{busy?<LoaderCircle className="animate-spin"/>:<DoorOpen/>}Créer ma salle</button></div>
              <div className="rounded-2xl border border-white/10 bg-black/15 p-6"><span className="text-3xl">🤝</span><h2 className="mt-3 text-xl font-black">Rejoindre des amis</h2><p className="mt-2 text-sm leading-6 text-white/55">Entre le code que l’hôte t’a envoyé.</p><input className="ludo-input mt-5 text-center text-xl font-black uppercase tracking-[.35em]" placeholder="CODE" maxLength={10} value={codeInput} onChange={e=>setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""))}/><button className="ludo-btn mt-3 w-full" disabled={busy||codeInput.length<4} onClick={joinRoom}>Rejoindre la salle</button></div>
            </div>
          ):(
            <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
              <div className="space-y-4">
                {game?<LudoBoard game={game} players={players} myTurn={myTurn} onMove={move}/>:<div className="grid aspect-square place-items-center rounded-3xl border border-white/10 bg-[#0c1712] p-8 text-center"><div><Users size={42} className="mx-auto text-[#d2f178]"/><h2 className="mt-4 text-2xl font-black">Salle d’attente</h2><p className="mt-2 text-sm text-white/55">Le plateau apparaîtra au lancement de la partie.</p></div></div>}
                {game&&<div className="rounded-2xl border border-white/10 bg-black/15 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#d2f178]">Tour en cours</p><h2 className="mt-1 text-2xl font-black">{activeName}</h2><p className="mt-1 text-xs text-white/50">{myTurn?"C’est ton tour !": "En attente du coup de "+activeName}</p></div><div key={lastRoll??game.lastRoll??"idle"} className="ludo-die grid h-[68px] w-[68px] place-items-center rounded-2xl border-2 border-[#d2f178]/60 bg-[#f8f6ed] text-4xl font-black text-[#172219]">{lastRoll??game.lastRoll??"🎲"}</div></div>
                  <div className="mt-4 flex flex-wrap gap-2"><button className="ludo-btn flex-1" disabled={!myTurn||busy||game.lastRoll!==null||game.winner!==null} onClick={roll}><Dices size={18}/>Lancer le dé</button><span className="flex items-center rounded-xl bg-white/5 px-4 text-xs font-bold text-white/60">{moves.length?moves.length+" pion(s) à déplacer":myTurn&&game.lastRoll!==null?"Aucun coup possible":"Tour synchronisé"}</span></div>
                  {game.winner!==null&&<p className="mt-4 rounded-xl bg-[#d2f178]/10 p-4 text-center text-lg font-black text-[#d2f178]">🏆 {players.find(p=>p.userId===game.playerOrder[game.winner!])?.username} remporte la partie !</p>}
                </div>}
              </div>
              <aside className="space-y-4">
                <div className="rounded-2xl border border-[#d2f178]/25 bg-[#d2f178]/[.06] p-5">
                  <div className="flex items-center justify-between"><span className="text-xs font-black uppercase tracking-[.18em] text-[#d2f178]">Code de la salle</span><Wifi size={18} className="text-[#d2f178]"/></div>
                  <div className="mt-3 flex items-center justify-between gap-3"><strong className="text-3xl font-black tracking-[.3em]">{room.code}</strong><button className="ludo-secondary" onClick={copyCode}><Copy size={16}/>{copied?"Copié":"Copier"}</button></div>
                  <p className="mt-3 text-xs leading-5 text-white/55">Envoie ce code à tes amis. Ils doivent se connecter à leur compte Mboa Games pour entrer.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 p-5">
                  <div className="flex items-center justify-between"><h3 className="font-black">Joueurs · {players.length}/{room.maxPlayers}</h3><span className="text-[10px] font-black uppercase tracking-widest text-[#d2f178]">{room.status==="waiting"?"En attente":room.status==="playing"?"En direct":"Terminée"}</span></div>
                  <div className="mt-4 space-y-3">{players.map((p,i)=><div key={p.userId} className="flex items-center justify-between gap-3 rounded-xl bg-white/[.04] p-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black text-[#102018]" style={{background:COLORS[i]}}>{p.username.slice(0,1).toUpperCase()}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{p.username}{p.userId===userId?" (toi)":""}</p><p className="text-[10px] text-white/45">{i===0?"Rouge":COLOR_NAMES[i]} {p.userId===room.hostId?"· Hôte":""}</p></div></div><span className={p.ready?"text-[#d2f178]":"text-white/35"}>{p.ready?<Check size={19}/>: "Pas prêt"}</span></div>)}</div>
                  {room.status==="waiting"&&<><button className="ludo-secondary mt-4 w-full" disabled={busy} onClick={toggleReady}>{myPlayer?.ready?"Annuler ma préparation":"Je suis prêt"}</button>{isHost&&<button className="ludo-btn mt-3 w-full" disabled={busy||!readyToStart} onClick={startGame}><Crown size={17}/>Démarrer la partie</button>}<p className="mt-3 text-center text-[11px] text-white/45">{players.length<2?"Il faut au moins 2 joueurs.":!readyToStart?"Tous les joueurs doivent être prêts.":"Tout le monde est prêt !"}</p></>}
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 p-5"><h3 className="font-black">Règles de base</h3><ul className="mt-3 space-y-2 text-xs leading-5 text-white/55"><li>• 4 pions par joueur, 2 à 4 joueurs.</li><li>• Un 6 permet de sortir un pion et donne un tour bonus.</li><li>• Capture un pion adverse pour rejouer.</li><li>• Les cases sûres protègent tes pions ; deux pions forment un barrage.</li><li>• Il faut arriver à la maison avec le chiffre exact.</li><li>• Trois 6 consécutifs font perdre le tour.</li></ul></div>
                <button className="ludo-secondary w-full" onClick={()=>{setSnapshot(null);setRoomCode("");setLastRoll(null);setNotice("Tu as quitté l’affichage de cette salle.");}}><RefreshCw size={15} className="mr-2 inline"/>Masquer la salle</button>
              </aside>
            </div>
          )}
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-white/[.035] p-3 text-xs text-white/45"><ShieldCheck size={16} className="shrink-0 text-[#d2f178]"/>Les lancers et déplacements sont validés par le serveur et synchronisés entre les joueurs. Jeu gratuit : aucune mise ni paiement.</div>
          <p className="mt-4 text-center text-sm text-white/55" aria-live="polite">{notice}</p>
          {error&&<p role="alert" className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        </section>
        <p className="mt-5 text-center text-xs text-white/35">Mboa Games · Ludo multijoueur en ligne · Connexion en temps réel</p>
      </div>
    </main>
  );
}

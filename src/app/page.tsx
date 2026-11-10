"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, Crown, Gamepad2, Menu, Sparkles, Users, X, Zap } from "lucide-react";

const games = [
  { name: "Jeu de cartes", tag: "Le classique camerounais", emoji: "🃏", color: "from-[#c8f169]/25 to-emerald-500/10", status: "Priorité", players: "Solo ou multijoueur" },
  { name: "Le 2 Dès", tag: "Le Million du quartier", emoji: "🎲", color: "from-orange-400/25 to-rose-500/10", status: "Jouable en test", players: "2 à 10 joueurs", href: "/des" },
  { name: "Ludo", tag: "Le classique du quartier", emoji: "🎯", color: "from-orange-400/25 to-rose-500/10", status: "Bientôt disponible", players: "2 à 4 joueurs" },
  { name: "Damier", tag: "La stratégie avant tout", emoji: "♟️", color: "from-lime-300/20 to-emerald-500/10", status: "Bientôt disponible", players: "2 joueurs" },
  { name: "Quiz", tag: "Montre que tu connais le 237", emoji: "🧠", color: "from-sky-400/20 to-indigo-500/10", status: "Bientôt disponible", players: "1 à 8 joueurs" },
  { name: "Adages", tag: "Les paroles du village", emoji: "🗣️", color: "from-fuchsia-400/20 to-orange-400/10", status: "Bientôt disponible", players: "2 à 8 joueurs" },
];

export default function Home() {
  const [roomCode, setRoomCode] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");

  function joinRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(roomCode.trim().length >= 4
      ? "Les salons en ligne arrivent bientôt. Reste connecté !"
      : "Entre un code de salon valide (au moins 4 caractères).");
  }

  return (
    <main className="min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 -z-0 opacity-30" aria-hidden="true">
        <div className="absolute -left-40 top-40 h-96 w-96 rounded-full bg-emerald-500/20 blur-[120px]" />
        <div className="absolute -right-40 top-0 h-96 w-96 rounded-full bg-orange-500/15 blur-[120px]" />
      </div>

      <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Mboa Games accueil">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#c8f169] text-2xl text-[#101b18] shadow-lg shadow-lime-300/10">🎮</span>
          <span className="text-xl font-black tracking-tight">mboa<span className="text-[#c8f169]">games</span><span className="ml-1 text-xs">🇨🇲</span></span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-semibold text-[#b6c0b8] md:flex">
          <a className="transition hover:text-white" href="#jeux">Les jeux</a>
          <a className="transition hover:text-white" href="#comment">Comment ça marche</a>
          <a className="transition hover:text-white" href="#communaute">La communauté</a>
        </nav>
        <a href="#jeux" className="hidden rounded-full bg-[#c8f169] px-5 py-3 text-sm font-extrabold text-[#101b18] transition hover:scale-[1.03] md:inline-flex">Découvrir les jeux <ArrowRight size={16} className="ml-2" /></a>
        <button className="rounded-xl border border-white/10 p-2 md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Ouvrir le menu">{menuOpen ? <X /> : <Menu />}</button>
      </header>
      {menuOpen && <nav className="relative z-20 mx-5 grid gap-1 rounded-2xl border border-white/10 bg-[#192722] p-3 md:hidden"><a className="rounded-xl p-3" href="#jeux" onClick={() => setMenuOpen(false)}>Les jeux</a><a className="rounded-xl p-3" href="#comment" onClick={() => setMenuOpen(false)}>Comment ça marche</a><a className="rounded-xl p-3" href="#communaute" onClick={() => setMenuOpen(false)}>La communauté</a></nav>}

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-14 md:grid-cols-[1.05fr_.95fr] md:px-8 md:pb-28 md:pt-20">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c8f169]/25 bg-[#c8f169]/10 px-4 py-2 text-xs font-bold tracking-wide text-[#d7f89b]"><Sparkles size={14} /> LA PLATEFORME DE JEUX DU 237</div>
          <h1 className="max-w-3xl text-5xl font-black leading-[1.04] tracking-[-.055em] sm:text-6xl md:text-7xl">Le jeu est <span className="text-[#c8f169]">au village</span> !</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-[#b6c0b8]">Retrouve tes amis, défie la famille et célèbre nos classiques. Le terrain de jeu camerounais se retrouve ici.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="#jeux" className="inline-flex items-center justify-center rounded-full bg-[#c8f169] px-7 py-4 font-extrabold text-[#101b18] shadow-xl shadow-lime-300/10 transition hover:-translate-y-1">Jouer maintenant <ArrowRight className="ml-2" size={18} /></a>
            <a href="#comment" className="inline-flex items-center justify-center rounded-full border border-white/15 px-7 py-4 font-bold text-white transition hover:bg-white/5">Comment ça marche <ArrowDown className="ml-2" size={17} /></a>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-[#b6c0b8]"><span className="flex items-center gap-2"><Users size={16} className="text-[#c8f169]" /> Entre amis</span><span className="flex items-center gap-2"><Zap size={16} className="text-[#c8f169]" /> Simple et rapide</span><span className="flex items-center gap-2"><Crown size={16} className="text-[#c8f169]" /> Esprit 237</span></div>
        </div>

        <div className="relative mx-auto w-full max-w-lg">
          <div className="absolute -inset-5 rounded-[3rem] bg-gradient-to-br from-[#c8f169]/10 via-transparent to-orange-400/10 blur-2xl" />
          <div className="relative rotate-1 rounded-[2rem] border border-white/10 bg-[#192722] p-5 shadow-2xl shadow-black/30 sm:p-7">
            <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#b6c0b8]">Le coin des joueurs</p><h2 className="mt-1 text-2xl font-black">On joue ?</h2></div><span className="rounded-2xl bg-[#c8f169]/10 p-3 text-2xl">🇨🇲</span></div>
            <div className="my-6 grid grid-cols-2 gap-3">
              <div className="col-span-2 rounded-2xl border border-[#c8f169]/25 bg-gradient-to-r from-[#c8f169]/20 to-emerald-500/10 p-5"><div className="flex items-center justify-between"><div><span className="rounded-full bg-[#c8f169] px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#101b18]">Jeu prioritaire</span><p className="mt-3 text-xl font-black">Jeu de cartes camerounais</p><p className="mt-1 text-xs text-[#b6c0b8]">En solo contre l’ordinateur ou entre amis</p><Link href="/cartes" className="mt-4 inline-flex items-center rounded-full bg-[#c8f169] px-4 py-2 text-xs font-black text-[#101b18]">Entrer dans le jeu <ArrowRight size={14} className="ml-2" /></Link></div><span className="text-5xl">🃏</span></div></div>
              <Link href="/des" className="rounded-2xl border border-[#c8f169]/20 bg-gradient-to-br from-orange-400/20 to-rose-500/5 p-5 transition hover:-translate-y-1"><div className="text-4xl">🎲</div><p className="mt-4 font-black">Le 2 Dès</p><p className="mt-1 text-xs text-[#b6c0b8]">Le Million du quartier · Jouer</p></Link>
              <div className="rounded-2xl bg-gradient-to-br from-orange-400/20 to-rose-500/5 p-5"><div className="text-4xl">🎯</div><p className="mt-4 font-black">Ludo</p><p className="mt-1 text-xs text-[#b6c0b8]">Le roi des soirées</p></div>
              <div className="rounded-2xl bg-gradient-to-br from-lime-300/20 to-emerald-500/5 p-5"><div className="text-4xl">♟️</div><p className="mt-4 font-black">Damier</p><p className="mt-1 text-xs text-[#b6c0b8]">À toi de réfléchir</p></div>
              <div className="rounded-2xl bg-gradient-to-br from-sky-400/20 to-indigo-500/5 p-5"><div className="text-4xl">🧠</div><p className="mt-4 font-black">Quiz 237</p><p className="mt-1 text-xs text-[#b6c0b8]">Prouve tes talents</p></div>
              <div className="rounded-2xl bg-gradient-to-br from-fuchsia-400/20 to-orange-400/5 p-5"><div className="text-4xl">🗣️</div><p className="mt-4 font-black">Adages</p><p className="mt-1 text-xs text-[#b6c0b8]">La sagesse du pays</p></div>
            </div>
            <form onSubmit={joinRoom} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <label htmlFor="room" className="mb-2 block text-xs font-bold uppercase tracking-wider text-[#b6c0b8]">Tu as un code de salon ?</label>
              <div className="flex gap-2"><input id="room" value={roomCode} onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setNotice(""); }} placeholder="Ex : MBOA24" maxLength={10} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-bold uppercase tracking-widest text-white outline-none placeholder:font-normal placeholder:tracking-normal focus:border-[#c8f169]/60" /><button className="rounded-xl bg-[#c8f169] px-4 font-black text-[#101b18] transition hover:brightness-110" type="submit">OK</button></div>
              {notice && <p role="status" className="mt-3 text-xs text-[#d7f89b]">{notice}</p>}
            </form>
          </div>
          <div className="absolute -bottom-5 -left-5 -rotate-6 rounded-2xl bg-[#ff895c] px-4 py-3 text-sm font-black text-[#24150f] shadow-xl">Ambiance garantie ! 🔥</div>
        </div>
      </section>

      <section id="jeux" className="relative z-10 mx-auto max-w-7xl scroll-mt-8 px-5 py-16 md:px-8 md:py-20">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.22em] text-[#c8f169]">Choisis ton terrain</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Les jeux du moment</h2><p className="mt-3 text-[#b6c0b8]">Le jeu de cartes camerounais passe en tête, suivi de nos autres classiques.</p></div><span className="w-fit rounded-full border border-white/10 px-4 py-2 text-xs font-bold text-[#b6c0b8]">5 jeux au programme</span></div>
        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => <article key={game.name} className={`group rounded-3xl border border-white/10 bg-gradient-to-br ${game.color} p-6 transition duration-300 hover:-translate-y-1 hover:border-white/20`}><div className="flex items-start justify-between"><span className="grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-black/10 text-4xl">{game.emoji}</span><span className="rounded-full bg-black/20 px-3 py-1.5 text-[10px] font-bold text-[#d7f89b]">{game.status}</span></div><h3 className="mt-6 text-2xl font-black">{game.name}</h3><p className="mt-1 text-sm text-[#b6c0b8]">{game.tag}</p><div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-[#b6c0b8]"><span>{game.players}</span><Gamepad2 size={17} /></div></article>)}
        </div>
      </section>

      <section id="comment" className="relative z-10 border-y border-white/10 bg-white/[.025]">
        <div className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-20"><p className="text-xs font-black uppercase tracking-[.22em] text-[#c8f169]">Facile comme bonjour</p><h2 className="mt-3 text-3xl font-black sm:text-4xl">Le village t'attend.</h2><div className="mt-9 grid gap-7 md:grid-cols-3">{[{n:"01",t:"Choisis ton jeu",d:"Commence par le jeu de cartes camerounais, puis retrouve les autres classiques."},{n:"02",t:"Retrouve tes amis",d:"Crée un salon privé et partage son code avec tes proches."},{n:"03",t:"Que le meilleur gagne !",d:"Joue, rigole et fais grimper ton score."}].map((step)=><div key={step.n} className="rounded-2xl border border-white/10 bg-[#192722]/70 p-6"><p className="text-sm font-black text-[#c8f169]">{step.n}</p><h3 className="mt-4 text-xl font-extrabold">{step.t}</h3><p className="mt-2 leading-7 text-[#b6c0b8]">{step.d}</p></div>)}</div></div>
      </section>

      <section id="communaute" className="relative z-10 mx-auto max-w-7xl px-5 py-16 text-center md:px-8 md:py-20"><div className="mx-auto max-w-2xl"><span className="text-4xl">🤝🏾</span><h2 className="mt-5 text-3xl font-black sm:text-4xl">Les meilleurs moments se partagent.</h2><p className="mt-4 leading-7 text-[#b6c0b8]">Mboa Games est en construction. On prépare la place pour les joueurs du Cameroun et d'ailleurs.</p><a href="#jeux" className="mt-7 inline-flex items-center rounded-full bg-[#c8f169] px-7 py-4 font-extrabold text-[#101b18]">Découvrir les jeux <ArrowRight className="ml-2" size={18} /></a></div></section>

      <footer className="relative z-10 border-t border-white/10 px-5 py-7 text-center text-xs text-[#82918a]"><p>© {new Date().getFullYear()} Mboa Games · Fait avec ❤️ au pays 🇨🇲</p><p className="mt-2">Joue. Défie. Rigole. Recommence.</p></footer>
    </main>
  );
}

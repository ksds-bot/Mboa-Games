"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Bot, Users, Trophy, BookOpen, LockKeyhole, Sparkles } from "lucide-react";

const modes = [
  { id: "solo", title: "Contre l’ordinateur", description: "Entraîne-toi gratuitement, sans mise ni points.", icon: Bot, tag: "Gratuit" },
  { id: "friends", title: "Entre amis", description: "Crée un salon privé et invite tes proches avec un code.", icon: Users, tag: "Salon privé" },
  { id: "online", title: "En ligne", description: "Retrouve d’autres joueurs. Les mises et retraits restent désactivés.", icon: Trophy, tag: "Bientôt" },
];

export default function CardGameLobby() {
  const [selected, setSelected] = useState("solo");
  const [notice, setNotice] = useState("Le jeu est en préparation. Les règles et le moteur de partie seront intégrés à partir de Checkgame.");

  return (
    <main className="min-h-screen bg-[#101b18] px-5 py-6 text-white md:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#b6c0b8] transition hover:text-white"><ArrowLeft size={17} /> Retour à Mboa Games</Link>
        <header className="mt-10 rounded-[2rem] border border-[#c8f169]/20 bg-gradient-to-br from-[#c8f169]/15 via-[#192722] to-[#192722] p-7 md:p-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#c8f169]/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-[#d7f89b]"><Sparkles size={14} /> Jeu prioritaire</span>
            <span className="text-5xl">🃏</span>
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-tight md:text-5xl">Jeu de cartes camerounais</h1>
          <p className="mt-4 max-w-2xl leading-7 text-[#b6c0b8]">Retrouve l’ambiance de Checkgame dans Mboa Games. Choisis ton mode de jeu : seul, avec tes amis ou en ligne.</p>
        </header>

        <section className="mt-10">
          <h2 className="text-2xl font-black">Comment veux-tu jouer ?</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {modes.map((mode) => {
              const Icon = mode.icon;
              const active = selected === mode.id;
              return <button key={mode.id} onClick={() => { setSelected(mode.id); setNotice(mode.id === "solo" ? "Mode ordinateur sélectionné : gratuit et sans points." : mode.id === "friends" ? "Mode entre amis sélectionné : les salons privés avec code arrivent dans la prochaine étape." : "Mode en ligne sélectionné. Les mises et retraits sont désactivés pour le moment."); }} className={`rounded-3xl border p-6 text-left transition hover:-translate-y-1 ${active ? "border-[#c8f169]/70 bg-[#c8f169]/10" : "border-white/10 bg-[#192722] hover:border-white/25"}`}>
                <div className="flex items-center justify-between"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-black/20 text-[#c8f169]"><Icon size={23} /></span><span className="rounded-full bg-black/20 px-3 py-1 text-[10px] font-bold text-[#d7f89b]">{mode.tag}</span></div>
                <h3 className="mt-5 text-lg font-black">{mode.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#b6c0b8]">{mode.description}</p>
                <p className="mt-5 text-xs font-extrabold text-[#c8f169]">{active ? "Mode sélectionné ✓" : "Choisir ce mode →"}</p>
              </button>;
            })}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#192722] p-6 md:p-8">
          <div className="flex items-center gap-3"><BookOpen className="text-[#c8f169]" /><h2 className="text-xl font-black">Règles du jeu</h2></div>
          <p className="mt-3 leading-7 text-[#b6c0b8]">La règle de référence sera celle de Checkgame. Le livret détaillé et les validations de cartes seront ajoutés avec le moteur de jeu afin de ne pas inventer de règles.</p>
          <div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/15 p-4 text-sm text-[#d7f89b]"><LockKeyhole size={17} /> Les parties avec points et les retraits restent désactivés.</div>
        </section>

        <div role="status" className="mt-6 rounded-2xl border border-[#c8f169]/20 bg-[#c8f169]/5 p-4 text-sm leading-6 text-[#d7f89b]">{notice}</div>
        <p className="mt-8 text-center text-xs text-[#82918a]">Mboa Games · Le jeu est au village 🇨🇲</p>
      </div>
    </main>
  );
}

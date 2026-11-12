"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, Check, ChevronDown, CirclePlay, Crown,
  Gamepad2, Menu, MessageCircle, Sparkles, Star, Users, X, Zap,
} from "lucide-react";

const games = [
  { name: "Jeu de cartes", subtitle: "Les cartes comme au quartier", description: "Bluffe, réfléchis et bats les autres autour de la table.", icon: "🃏", tone: "cards", label: "À découvrir", href: "/cartes", featured: true },
  { name: "Le 2 Dès", subtitle: "Le Million du quartier", description: "Lance les dés. Tente ta chance. Fais parler les scores.", icon: "🎲", tone: "dice", label: "Jouable", href: "/des" },
  { name: "Ludo", subtitle: "Le classique indémodable", description: "Ramène tes pions à la maison avant les autres.", icon: "🎯", tone: "ludo", label: "Jouable", href: "/ludo" },
  { name: "Damier", subtitle: "La tête froide, le bon coup", description: "Anticipe, piège et prends le dessus.", icon: "♟️", tone: "checkers", label: "Bientôt" },
  { name: "Quiz 237", subtitle: "Tu connais vraiment le pays ?", description: "Culture, musique, sport et anecdotes du Cameroun.", icon: "🧠", tone: "quiz", label: "Bientôt" },
  { name: "Adages", subtitle: "La sagesse du village", description: "Retrouve les proverbes et complète les expressions.", icon: "🗣️", tone: "adages", label: "Bientôt" },
];

const steps = [
  { number: "01", icon: "🎮", title: "Choisis ton jeu", text: "Des classiques qu'on connaît tous, avec une touche Mboa." },
  { number: "02", icon: "🤝🏾", title: "Rassemble la famille", text: "Joue tranquillement ou prépare tes prochaines parties entre amis." },
  { number: "03", icon: "🏆", title: "Fais parler ton talent", text: "Enchaîne les parties, progresse et prends ta revanche." },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);


  return (
    <main className="mboa-home min-h-screen overflow-hidden">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="brand" aria-label="Mboa Games, accueil">
            <span className="brand-mark">M<span>G</span></span>
            <span className="brand-name">mboa<span>games</span><small>LE JEU EST AU VILLAGE</small></span>
          </Link>

          <nav className="desktop-nav" aria-label="Navigation principale">
            <a href="#jeux">Les jeux</a>
            <a href="#concept">Le concept</a>
            <a href="#communaute">Communauté</a>
          </nav>

          <div className="header-account-actions"><Link className="header-login" href="/connexion?mode=login&next=%2Fadmin">Espace administrateur</Link><Link className="header-login" href="/connexion?mode=login">Se connecter</Link><Link className="header-cta" href="/connexion?mode=register">Créer un compte <ArrowUpRight size={16} /></Link></div>
          <button className="mobile-menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={menuOpen}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <nav className="mobile-nav" aria-label="Navigation mobile">
            <a href="#jeux" onClick={() => setMenuOpen(false)}>Les jeux</a>
            <a href="#concept" onClick={() => setMenuOpen(false)}>Le concept</a>
            <a href="#communaute" onClick={() => setMenuOpen(false)}>Communauté</a>\n            <Link href="/connexion?mode=login&next=%2Fadmin" onClick={() => setMenuOpen(false)}>Espace administrateur</Link>
          </nav>
        )}
      </header>

      <section className="hero-shell">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> LA PLACE DU JEU CAMEROUNAIS <span className="flag-mini">🇨🇲</span></div>
          <h1>On ne joue pas<br />chacun dans son <span className="hero-highlight">coin.</span></h1>
          <p className="hero-lead">Crée un seul compte Mboa Games pour retrouver ton pseudo et profiter des fonctionnalités sur tous les jeux. Tu préfères découvrir sans t’inscrire ? Joue librement en invité.</p>
          <div className="hero-actions">
            <Link className="button-primary" href="/connexion?mode=register">Créer un compte <ArrowRight size={18} /></Link>
            <Link className="button-quiet" href="/connexion?mode=login">Se connecter</Link>
            <a className="button-quiet" href="#jeux"><CirclePlay size={18} /> Jouer en invité</a>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack"><span>👨🏿</span><span>👩🏾</span><span>🧑🏽</span><span>👨🏾</span></div>
            <div><strong>Le rendez-vous des joueurs</strong><small>Du quartier, de la famille et d'ailleurs.</small></div>
          </div>
        </div>

        <div className="hero-art" aria-label="Illustration des jeux Mboa Games">
          <div className="art-orbit orbit-a" /><div className="art-orbit orbit-b" />
          <div className="floating-chip chip-top"><span>✦</span> AMBIANCE 237</div>
          <div className="game-table">
            <div className="table-topline"><span>LA TABLE EST OUVERTE</span><span className="live-dot" /> <span>À TOI DE JOUER</span></div>
            <div className="table-center">
              <div className="playing-card card-back"><span>✳</span><small>MBOA</small></div>
              <div className="playing-card card-front"><span>♠</span><b>A</b><small>AS</small></div>
              <div className="dice-cube">⚄</div>
            </div>
            <div className="table-bottomline"><span>JOUE.</span><span>DÉFIE.</span><span>RECOMMENCE.</span></div>
          </div>
          <div className="floating-chip chip-bottom"><Crown size={15} /> LE JEU EST AU VILLAGE !</div>
          <div className="sparkle sparkle-one">✳</div><div className="sparkle sparkle-two">✦</div>
        </div>
      </section>

      <section className="quick-strip" aria-label="Les valeurs Mboa Games">
        <div><Users size={18} /><span>Fait pour jouer ensemble</span></div>
        <i />
        <div><Zap size={18} /><span>Simple, rapide, accessible</span></div>
        <i />
        <div><Star size={18} /><span>100% esprit du 237</span></div>
      </section>

      <section id="jeux" className="games-section section-wrap">
        <div className="section-heading">
          <div><div className="section-kicker">À CHACUN SON TERRAIN</div><h2>Quel jeu on lance <span>?</span></h2><p>Choisis ton mode : invité pour découvrir les jeux, ou membre pour retrouver ton espace personnel et les fonctionnalités réservées aux comptes.</p></div>
          <div className="game-count"><strong>06</strong><span>JEUX AU<br />PROGRAMME</span></div>
        </div>

        <div className="games-grid">
          {games.map((game) => (
            <article key={game.name} className={`game-card game-${game.tone} ${game.featured ? "game-featured" : ""}`}>
              <div className="game-card-top"><span className="game-emoji">{game.icon}</span><span className={`game-status ${game.href ? "status-ready" : ""}`}>{game.href ? <><span /> {game.label}</> : game.label}</span></div>
              <div className="game-card-copy"><p>{game.subtitle}</p><h3>{game.name}</h3><span>{game.description}</span></div>
              {game.href ? <Link href={game.href} className="game-link">Jouer en invité <ArrowUpRight size={17} /></Link> : <div className="game-soon">On prépare ça <Sparkles size={14} /></div>}
              {game.featured && <span className="featured-stamp">LE CLASSIQUE</span>}
            </article>
          ))}
        </div>
      </section>

      <section id="modes" className="modes-section section-wrap"><div className="section-heading modes-heading"><div><div className="section-kicker">À TOI DE CHOISIR</div><h2>Invité ou membre <span>?</span></h2><p>Tu peux commencer sans compte. Et quand tu veux, tu rejoins le village avec ton compte Mboa Games.</p></div></div><div className="modes-grid"><article className="mode-card mode-guest"><div className="mode-card-icon">🎮</div><span className="mode-label">SANS INSCRIPTION</span><h3>Jouer en invité</h3><p>Entre directement dans les jeux disponibles, sans pseudo ni code PIN.</p><ul><li>Accéder aux jeux ouverts aux invités</li><li>Jouer gratuitement sur le même appareil</li><li>Découvrir les règles et tester les jeux</li><li>Pas de profil ni de sauvegarde entre appareils</li></ul><a className="mode-card-link" href="#jeux">Choisir un jeu <ArrowRight size={16}/></a></article><article className="mode-card mode-member"><div className="mode-card-icon">🏆</div><span className="mode-label">ESPACE PERSONNEL</span><h3>Créer un compte / Se connecter</h3><p>Un seul compte pour tous les jeux Mboa Games. Retrouve ton espace après chaque connexion.</p><ul><li>Un profil et un tableau de bord personnels</li><li>Suivi des points, jetons et résultats enregistrés</li><li>Historique des parties et statistiques</li><li>Accès aux salles, commentaires et messages communautaires lorsqu’ils seront activés</li><li>Achats de jetons et portefeuille lorsqu’ils seront sécurisés et disponibles</li></ul><div className="mode-card-actions"><Link href="/connexion?mode=register">Créer mon compte <ArrowRight size={16}/></Link><Link href="/connexion?mode=login">J’ai déjà un compte</Link></div></article></div><p className="modes-footnote">Les salles privées et le chat sont déjà disponibles sur Ludo, CHECK! et Le 2 Dès. Le branchement des coups à distance se poursuit jeu par jeu.</p></section>

      <section id="concept" className="concept-section">
        <div className="section-wrap concept-inner">
          <div className="concept-intro"><div className="section-kicker">C'EST ÇA, L'ESPRIT MBOA</div><h2>Plus qu'un jeu.<br /><span>Un moment</span> à partager.</h2><p>Une partie qui commence par « tu connais jouer ? » et finit avec tout le monde qui réclame la revanche.</p><a href="#jeux" className="text-link">Trouver une partie <ArrowRight size={17} /></a></div>
          <div className="steps-list">{steps.map((step) => <div className="step-row" key={step.number}><span className="step-number">{step.number}</span><span className="step-icon">{step.icon}</span><div><h3>{step.title}</h3><p>{step.text}</p></div><ArrowUpRight className="step-arrow" size={20} /></div>)}</div>
        </div>
      </section>

      <section id="communaute" className="community-section section-wrap">
        <div className="community-card">
          <div className="community-pattern" aria-hidden="true">237&nbsp; 237&nbsp; 237&nbsp; 237</div>
          <div className="community-copy"><div className="section-kicker">LE VILLAGE S'AGRANDIT</div><h2>Ta place est<br />déjà réservée.</h2><p>Mboa Games grandit avec les joueurs. Reviens découvrir les nouveaux jeux et les prochaines fonctionnalités.</p><div className="community-note"><MessageCircle size={17} /> La suite se construit avec la communauté.</div></div>
          <div className="room-box">
            <div className="room-icon">🔑</div><h3>Tu as un code de salon ?</h3><p>Ouvre le jeu correspondant et saisis le code dans son espace multijoueur.</p>
            <div className="flex flex-wrap gap-2"><Link href="/ludo" className="button-primary">Ludo <ArrowUpRight size={15}/></Link><Link href="/cartes" className="button-quiet">CHECK! <ArrowUpRight size={15}/></Link><Link href="/des" className="button-quiet">Le 2 Dès <ArrowUpRight size={15}/></Link></div>
            <small><Check size={13} /> Salles et chat déjà disponibles sur ces jeux.</small>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-main"><Link href="/" className="brand"><span className="brand-mark">M<span>G</span></span><span className="brand-name">mboa<span>games</span><small>LE JEU EST AU VILLAGE</small></span></Link><p>Joue. Défie. Rigole. Recommence.</p><span className="footer-flag">🇨🇲</span></div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} Mboa Games. Fait avec ❤️ au pays.</span><a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Retour en haut ↑</a></div>
      </footer>
    </main>
  );
}

import Link from "next/link";

type SiteHeaderProps = { active?: "home" | "cards" | "dice" | "ludo" | "profile" };

export default function SiteHeader({ active }: SiteHeaderProps) {
  return (
    <header className="game-site-header">
      <div className="game-site-header-inner">
        <Link href="/" className="game-site-brand" aria-label="Mboa Games, accueil">
          <span className="game-site-mark">M<span>G</span></span>
          <span className="game-site-word">mboa<span>games</span><small>LE JEU EST AU VILLAGE</small></span>
        </Link>
        <nav className="game-site-nav" aria-label="Navigation du site">
          <Link href="/" className={active === "home" ? "is-active" : ""}>Accueil</Link>
          <Link href="/cartes" className={active === "cards" ? "is-active" : ""}>CHECK!</Link>
          <Link href="/des" className={active === "dice" ? "is-active" : ""}>Le 2 Dès</Link>
          <Link href="/ludo" className={active === "ludo" ? "is-active" : ""}>Ludo</Link>
          <Link href="/profil" className={active === "profile" ? "is-active" : ""}>Mon compte</Link>
        </nav>
        <span className="game-site-tag">🇨🇲 <span>100% ESPRIT 237</span></span>
      </div>
    </header>
  );
}

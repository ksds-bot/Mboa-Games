import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/site-header";
import ProfileActions from "./profile-actions";
import UsernameSetup from "./username-setup";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mon tableau de bord" };
export const dynamic = "force-dynamic";

const number = new Intl.NumberFormat("fr-FR");
function dateLabel(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Douala",
  }).format(new Date(value));
}

function gameLabel(value: string) {
  const labels: Record<string, string> = {
    check: "CHECK!",
    cartes: "CHECK!",
    des: "Le 2 Dès",
    "le-2-des": "Le 2 Dès",
    ludo: "Ludo",
    damier: "Damier",
    quiz: "Quiz 237",
  };
  return labels[value.toLowerCase()] ?? value;
}

function outcomeLabel(value: string) {
  if (value === "won") return "Victoire";
  if (value === "lost") return "Défaite";
  if (value === "draw") return "Égalité";
  return "Partie arrêtée";
}

export default async function ProfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const [
    { data: profile },
    { data: wallet },
    { data: recentGames },
    { data: allResults, count: gameCount },
    { count: winCount },
    { count: lossCount },
    { data: transactions },
  ] = await Promise.all([
    supabase.from("profiles").select("display_name, username, created_at").eq("id", user.id).maybeSingle(),
    supabase.from("player_wallets").select("points_balance, tokens_balance").eq("user_id", user.id).maybeSingle(),
    supabase.from("player_game_history").select("id, game_type, outcome, score, points_delta, tokens_delta, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
    supabase.from("player_game_history").select("outcome, points_delta, tokens_delta", { count: "exact" }).eq("user_id", user.id),
    supabase.from("player_game_history").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("outcome", "won"),
    supabase.from("player_game_history").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("outcome", "lost"),
    supabase.from("player_wallet_transactions").select("id, asset, direction, amount, status, description, created_at").eq("user_id", user.id).neq("asset", "cash_xaf").order("created_at", { ascending: false }).limit(5),
  ]);

  if (!profile?.username) {
    return (
      <>
        <SiteHeader active="profile" />
        <main className="auth-page"><UsernameSetup /></main>
      </>
    );
  }

  const results = allResults ?? [];
  const wins = winCount ?? 0;
  const losses = lossCount ?? 0;
  const totalGames = gameCount ?? results.length;
  const lostPoints = results.reduce((sum, item) => sum + (item.outcome === "lost" && item.points_delta < 0 ? Math.abs(item.points_delta) : 0), 0);
  const lostTokens = results.reduce((sum, item) => sum + (item.outcome === "lost" && item.tokens_delta < 0 ? Math.abs(item.tokens_delta) : 0), 0);
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const points = wallet?.points_balance ?? 0;
  const tokens = wallet?.tokens_balance ?? 0;

  return (
    <>
      <SiteHeader active="profile" />
      <main className="dashboard-page">
        <div className="dashboard-shell">
          <section className="dashboard-welcome">
            <div>
              <p className="dashboard-kicker">TON ESPACE PERSONNEL · MBOA GAMES</p>
              <h1>Salut, <span>{profile.username}</span> 👋</h1>
              <p>Retrouve ton profil, tes parties, tes points et tes jetons au même endroit.</p>
            </div>
            <div className="dashboard-avatar">{profile.username.slice(0, 1).toUpperCase()}</div>
          </section>

          <nav className="dashboard-tabs" aria-label="Sections du tableau de bord">
            <a href="#apercu" className="is-current">Vue d'ensemble</a>
            <a href="#parties">Mes parties</a>
            <a href="#portefeuille">Portefeuille</a>
            <a href="#profil-joueur">Mon profil</a>
          </nav>

          <section id="apercu" className="dashboard-section">
            <div className="dashboard-section-heading">
              <div><p className="dashboard-kicker">EN UN COUP D'ŒIL</p><h2>Mon aperçu</h2></div>
              <span className="dashboard-live">Compte actif</span>
            </div>
            <div className="dashboard-balance-grid">
              <article className="dashboard-balance-card balance-points">
                <span className="dashboard-card-icon">⭐</span>
                <p>Mes points</p>
                <strong>{number.format(points)}</strong>
                <small>Points de jeu disponibles</small>
              </article>
              <article className="dashboard-balance-card balance-tokens">
                <span className="dashboard-card-icon">🪙</span>
                <p>Mes jetons</p>
                <strong>{number.format(tokens)}</strong>
                <small>Jetons disponibles</small>
              </article>
            </div>
          </section>

          <section className="dashboard-stats-grid" aria-label="Statistiques de jeu">
            <article className="dashboard-stat-card"><span>🎮</span><strong>{number.format(totalGames)}</strong><small>Parties enregistrées</small></article>
            <article className="dashboard-stat-card"><span>🏆</span><strong>{number.format(wins)}</strong><small>Victoires</small></article>
            <article className="dashboard-stat-card"><span>↘️</span><strong>{number.format(losses)}</strong><small>Défaites</small></article>
            <article className="dashboard-stat-card"><span>📈</span><strong>{winRate}%</strong><small>Taux de victoire</small></article>
          </section>

          <div className="dashboard-main-grid">
            <section id="parties" className="dashboard-panel">
              <div className="dashboard-panel-heading"><div><p className="dashboard-kicker">TON PARCOURS</p><h2>Mes dernières parties</h2></div><span>{number.format(totalGames)} au total</span></div>
              {recentGames && recentGames.length > 0 ? (
                <div className="dashboard-history-list">
                  {recentGames.map((game) => (
                    <article className="dashboard-history-row" key={game.id}>
                      <div className="dashboard-game-icon">{game.game_type.toLowerCase().includes("des") ? "🎲" : "🃏"}</div>
                      <div className="dashboard-history-copy"><strong>{gameLabel(game.game_type)}</strong><small>{dateLabel(game.created_at)}</small></div>
                      <div className="dashboard-history-result"><strong className={`outcome-${game.outcome}`}>{outcomeLabel(game.outcome)}</strong><small>{game.points_delta > 0 ? "+" : ""}{number.format(game.points_delta)} pts</small></div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="dashboard-empty"><span>🎯</span><strong>Ton aventure commence ici</strong><p>Tes parties apparaîtront ici dès que les jeux enregistreront leurs résultats sur ton compte.</p><Link href="/des">Jouer au 2 Dès <span>→</span></Link></div>
              )}
            </section>

            <section className="dashboard-panel dashboard-loss-panel">
              <div className="dashboard-panel-heading"><div><p className="dashboard-kicker">BILAN DES PARTIES</p><h2>Mes pertes</h2></div><span>Historique</span></div>
              <div className="dashboard-loss-line"><span>Points perdus</span><strong>{number.format(lostPoints)} pts</strong></div>
              <div className="dashboard-loss-line"><span>Jetons perdus</span><strong>{number.format(lostTokens)}</strong></div>
              <div className="dashboard-loss-line"><span>Parties perdues</span><strong>{number.format(losses)}</strong></div>
              <p className="dashboard-muted-note">Seules les pertes réellement enregistrées dans l'historique sont comptées. Aucun montant n'est estimé.</p>
            </section>
          </div>

          <section id="portefeuille" className="dashboard-panel dashboard-wallet-panel">
            <div className="dashboard-panel-heading"><div><p className="dashboard-kicker">POINTS ET JETONS</p><h2>Mon portefeuille</h2></div></div>
            <div className="dashboard-wallet-grid">
              <div><span>⭐</span><strong>{number.format(points)}</strong><small>Points</small></div>
              <div><span>🪙</span><strong>{number.format(tokens)}</strong><small>Jetons</small></div>
            </div>
            <p className="dashboard-wallet-note">Les points servent à suivre ta progression. Les jetons servent aux mises des parties compatibles. Les recharges sont vérifiées manuellement par l’administration.</p>
            <div className="dashboard-transactions">
              <h3>Derniers mouvements</h3>
              {transactions && transactions.length > 0 ? transactions.map((transaction) => (
                <div className="dashboard-transaction-row" key={transaction.id}>
                  <span>{transaction.description || (transaction.direction === "credit" ? "Crédit" : "Débit")}</span>
                  <strong className={transaction.direction === "credit" ? "outcome-won" : "outcome-lost"}>{transaction.direction === "credit" ? "+" : "−"}{number.format(transaction.amount)} {transaction.asset === "cash_xaf" ? "FCFA" : transaction.asset === "tokens" ? "jetons" : "pts"}</strong>
                </div>
              )) : <p className="dashboard-muted-note">Aucun mouvement enregistré pour le moment.</p>}
            </div>
          </section>

          <section id="profil-joueur" className="dashboard-panel dashboard-profile-panel">
            <div className="dashboard-panel-heading"><div><p className="dashboard-kicker">IDENTITÉ DU JOUEUR</p><h2>Mon profil</h2></div><span>Protégé par PIN</span></div>
            <div className="dashboard-profile-details">
              <div><span>Pseudo</span><strong>@{profile.username}</strong></div>
              <div><span>Nom affiché</span><strong>{profile.display_name || profile.username}</strong></div>
              <div><span>Membre depuis</span><strong>{dateLabel(profile.created_at)}</strong></div>
              <div><span>Identifiant joueur</span><strong>{user.id.slice(0, 8).toUpperCase()}</strong></div>
            </div>
            <p className="dashboard-muted-note">Garde ton code PIN secret. Il te permet de retrouver ce même compte sur un autre téléphone.</p>
          </section>

          <section className="dashboard-panel dashboard-games-panel"><div className="dashboard-panel-heading"><div><p className="dashboard-kicker">TON ESPACE DE JEU</p><h2>Choisir une partie</h2></div><span>Accès direct</span></div><div className="dashboard-games-grid"><Link href="/cartes"><span>🃏</span><div><strong>CHECK!</strong><small>Jouer maintenant</small></div><b>→</b></Link><Link href="/des"><span>🎲</span><div><strong>Le 2 Dès</strong><small>Jouer maintenant</small></div><b>→</b></Link><Link href="/ludo"><span>🎯</span><div><strong>Ludo</strong><small>Jouer maintenant</small></div><b>→</b></Link><div className="dashboard-game-disabled"><span>♟️</span><div><strong>Damier</strong><small>Bientôt disponible</small></div><b>…</b></div></div></section>

          <section className="dashboard-bottom-cta">
            <div><strong>Prêt pour une nouvelle partie ?</strong><p>Ton compte te suit dans tous les jeux Mboa Games.</p></div>
            <Link href="/cartes">Lancer CHECK! <span>→</span></Link>
          </section>
          <div className="dashboard-footer-actions"><Link href="/">Retour à l'accueil</Link><ProfileActions /></div>
        </div>
      </main>
    </>
  );
}

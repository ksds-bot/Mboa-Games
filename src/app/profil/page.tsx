import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/site-header";
import ProfileActions from "./profile-actions";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Mon profil" };

export default async function ProfilPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, created_at")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name || user.email?.split("@")[0] || "Joueur";
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <>
      <SiteHeader active="profile" />
      <main className="auth-page">
        <section className="profile-card">
          <div className="profile-avatar">{initials}</div>
          <p className="auth-kicker">BIENVENUE DANS LA FAMILLE</p>
          <h1>{displayName}</h1>
          <p className="profile-email">{user.email}</p>
          <div className="profile-details">
            <div><span>Pseudo</span><strong>{profile?.username ? `@${profile.username}` : "À choisir bientôt"}</strong></div>
            <div><span>Compte</span><strong>Joueur Mboa Games</strong></div>
          </div>
          <div className="profile-actions">
            <Link className="auth-submit profile-play" href="/">Découvrir les jeux <span aria-hidden="true">→</span></Link>
            <ProfileActions />
          </div>
          <p className="auth-footnote">Ton espace joueur est prêt. Les scores et l'historique seront ajoutés dans les prochaines étapes.</p>
        </section>
      </main>
    </>
  );
}

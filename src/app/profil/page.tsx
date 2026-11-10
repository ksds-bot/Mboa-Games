import Link from "next/link";
import { redirect } from "next/navigation";
import SiteHeader from "@/components/site-header";
import ProfileActions from "./profile-actions";
import UsernameSetup from "./username-setup";
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

  if (!profile?.username) {
    return (
      <>
        <SiteHeader active="profile" />
        <main className="auth-page"><UsernameSetup /></main>
      </>
    );
  }

  return (
    <>
      <SiteHeader active="profile" />
      <main className="auth-page">
        <section className="profile-card">
          <div className="profile-avatar">{profile.username.slice(0, 1).toUpperCase()}</div>
          <p className="auth-kicker">BIENVENUE DANS LA FAMILLE</p>
          <h1>{profile.username}</h1>
          <p className="profile-email">Ton espace joueur Mboa Games</p>
          <div className="profile-details">
            <div><span>Pseudo confirmé</span><strong>@{profile.username}</strong></div>
            <div><span>Compte</span><strong>Protégé par PIN</strong></div>
          </div>
          <div className="profile-actions">
            <Link className="auth-submit profile-play" href="/">Découvrir les jeux <span aria-hidden="true">→</span></Link>
            <ProfileActions />
          </div>
          <p className="auth-footnote">Ton pseudo est unique et réservé à ton compte. Garde ton code PIN secret.</p>
        </section>
      </main>
    </>
  );
}

import { redirect } from "next/navigation";
import SiteHeader from "@/components/site-header";
import ConnexionForm from "./connexion-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Connexion joueur" };

export default async function ConnexionPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/profil");
  return (
    <>
      <SiteHeader />
      <main className="auth-page"><ConnexionForm /></main>
    </>
  );
}

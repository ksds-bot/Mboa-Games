import { redirect } from "next/navigation";
import SiteHeader from "@/components/site-header";
import ConnexionForm from "./connexion-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Connexion joueur" };

type ConnexionPageProps = { searchParams: Promise<{ mode?: string }> };

export default async function ConnexionPage({ searchParams }: ConnexionPageProps) {
  const [supabase, params] = await Promise.all([createClient(), searchParams]);
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/profil");
  const initialMode = params.mode === "login" ? "login" : "register";
  return <><SiteHeader /><main className="auth-page"><ConnexionForm initialMode={initialMode} /></main></>;
}

import { redirect } from "next/navigation";
import SiteHeader from "@/components/site-header";
import ConnexionForm from "./connexion-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Connexion joueur et administrateur" };

type ConnexionPageProps = { searchParams: Promise<{ mode?: string; next?: string }> };

export default async function ConnexionPage({ searchParams }: ConnexionPageProps) {
  const [supabase, params] = await Promise.all([createClient(), searchParams]);
  const adminLogin = params.next === "/admin";
  const redirectTo = adminLogin ? "/admin" : "/profil";
  const { data: { user } } = await supabase.auth.getUser();
  if (user && !adminLogin) redirect("/profil");
  const initialMode = params.mode === "login" || adminLogin ? "login" : "register";
  return <><SiteHeader /><main className="auth-page"><ConnexionForm initialMode={initialMode} redirectTo={redirectTo} /></main></>;
}

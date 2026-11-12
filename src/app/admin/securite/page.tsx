import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminCredentialForm from "./credential-form";

export const metadata = { title: "Sécuriser le compte administrateur · Mboa Games" };
export const dynamic = "force-dynamic";

export default async function AdminSecurityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?mode=login&next=%2Fadmin");
  const { error } = await supabase.rpc("admin_console_snapshot");
  if (error) redirect("/connexion?mode=login&next=%2Fadmin");
  const { data: profile } = await supabase.from("profiles").select("username,must_change_credentials").eq("id", user.id).maybeSingle();
  if (!profile?.must_change_credentials) redirect("/admin");
  return <main className="auth-page"><AdminCredentialForm currentUsername={profile.username ?? ""} /></main>;
}

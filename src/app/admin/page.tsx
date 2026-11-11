import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminConsole from "./admin-console";

export const metadata = { title: "Administration · Mboa Games" };

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?mode=login&next=%2Fadmin");
  const { error: permissionError } = await supabase.rpc("admin_console_snapshot");
  if (permissionError) redirect("/connexion?mode=login&next=%2Fadmin");
  const { data: profile } = await supabase.from("profiles").select("must_change_credentials").eq("id", user.id).maybeSingle();
  if (profile?.must_change_credentials) redirect("/admin/securite");
  return <AdminConsole />;
}

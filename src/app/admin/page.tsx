import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminConsole from "./admin-console";

export const metadata = { title: "Administration · Mboa Games" };

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/connexion?mode=login");
  return <AdminConsole />;
}

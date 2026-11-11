import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HomeContent from "./home-content";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/profil");
  return <HomeContent />;
}

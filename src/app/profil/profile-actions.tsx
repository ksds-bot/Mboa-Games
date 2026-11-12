"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ProfileActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/connexion");
    router.refresh();
  }
  return <button className="profile-signout" onClick={signOut} disabled={busy}>{busy ? "Déconnexion..." : "Se déconnecter"}</button>;
}

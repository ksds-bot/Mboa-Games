import SiteHeader from "@/components/site-header";
import ConnexionForm from "./connexion-form";

export const metadata = { title: "Connexion joueur et administrateur" };
export const dynamic = "force-dynamic";

type ConnexionPageProps = { searchParams: Promise<{ mode?: string; next?: string }> };

function safeReturnPath(value?: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/profil";
  return value;
}

export default async function ConnexionPage({ searchParams }: ConnexionPageProps) {
  const params = await searchParams;
  const redirectTo = safeReturnPath(params.next);
  const adminLogin = redirectTo === "/admin";
  const initialMode = params.mode === "login" || adminLogin ? "login" : "register";
  // Force a fresh form when switching between player registration and admin login.
  // Otherwise React can preserve the previous "register" state across query-string navigation.
  return <><SiteHeader /><main className="auth-page"><ConnexionForm key={adminLogin ? "admin-login" : `player-auth-${redirectTo}`} initialMode={initialMode} redirectTo={redirectTo} /></main></>;
}

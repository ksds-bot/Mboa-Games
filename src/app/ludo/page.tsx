import SiteHeader from "@/components/site-header";
import LudoOnline from "./ludo-online";

export const metadata = { title: "Ludo 237 en ligne | Mboa Games" };

export default function LudoPage() {
  return (
    <>
      <SiteHeader active="ludo" />
      <LudoOnline />
    </>
  );
}

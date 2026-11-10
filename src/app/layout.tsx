import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mboa Games — Le jeu est au village !",
  description: "Retrouve tes amis autour des jeux qui nous rassemblent. Joue, défie, rigole et recommence sur Mboa Games.",
  applicationName: "Mboa Games",
};

export const viewport: Viewport = {
  themeColor: "#101b18",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

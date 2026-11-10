import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Mboa Games — Le jeu est au village !",
    template: "%s | Mboa Games",
  },
  description: "La place du jeu camerounais. Retrouve tes amis autour des cartes, des dés et des classiques du 237. Joue. Défie. Rigole. Recommence.",
  applicationName: "Mboa Games",
  appleWebApp: {
    capable: true,
    title: "Mboa Games",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#101713",
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

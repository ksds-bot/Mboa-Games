# Mboa Games 🇨🇲

**Le jeu est au village !** Une plateforme de jeux multijoueurs inspirée de l'ambiance et de la culture camerounaises.

## Stack
- Next.js 16 · React 19 · TypeScript
- Tailwind CSS 4
- Supabase Auth, PostgreSQL et Realtime
- Vercel (déploiement prévu)

## Démarrage
1. Copier `.env.example` vers `.env.local`.
2. Renseigner `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Installer les dépendances avec `npm install`.
4. Démarrer avec `npm run dev`.

## Base de données
La première migration est dans `supabase/migrations/`. Elle crée les profils, salons, membres, sessions, messages et scores, avec RLS activé. Elle doit être appliquée au projet Supabase cible après vérification de son identité.

## Authentification
Le client navigateur, le client serveur et le proxy de renouvellement de session utilisent `@supabase/ssr` et des cookies sécurisés. Les clés `service_role` / `sb_secret_` ne doivent jamais être placées dans des variables `NEXT_PUBLIC_`.

## Jeux prévus
- Ludo
- Damier
- Quiz
- Adages

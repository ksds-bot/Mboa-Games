# Mboa Games 🇨🇲

**Le jeu est au village !**  
Mboa Games est une plateforme de jeux web inspirée de l'ambiance et de la culture camerounaises. L'objectif est de proposer des parties accessibles sur mobile comme sur ordinateur, avec une expérience simple pour les invités et un espace personnel pour les membres.

Production : **https://mboa-games.vercel.app**

## État du projet

Le projet est en développement actif. Les fonctionnalités ci-dessous distinguent ce qui est déjà jouable de ce qui reste à construire.

### Jeux disponibles

| Jeu | État actuel | Accès |
| --- | --- | --- |
| **CHECK!** | Jeu de cartes jouable en solo contre le Mboma (IA), avec plusieurs niveaux de difficulté et cartes spéciales. | [Jouer à CHECK!](https://mboa-games.vercel.app/cartes) |
| **Le 2 Dès** | Jeu local « passe le téléphone » pour 2 à 10 joueurs, avec 2 à 4 dés. | [Jouer au 2 Dès](https://mboa-games.vercel.app/des) |
| Ludo | À venir | — |
| Damier | À venir | — |
| Quiz 237 | À venir | — |
| Adages | À venir | — |

Les parties de CHECK! et du 2 Dès sont actuellement jouées dans le navigateur. Le multijoueur en ligne et l'enregistrement durable des résultats ne sont pas encore activés pour ces jeux.

### Comptes et espace membre

- La vitrine publique présente les jeux et permet de jouer en invité.
- Les visiteurs peuvent accéder aux jeux sans créer de compte.
- Les membres peuvent créer un compte ou se connecter avec leur identifiant joueur et leur code PIN.
- Après connexion, le membre arrive directement sur son tableau de bord personnel.
- Le tableau de bord présente le profil et les accès aux jeux disponibles.

Les salons en ligne, le chat, les commentaires, l'historique synchronisé et les achats de jetons sont des fonctionnalités prévues, mais ne doivent pas être considérés comme actives tant qu'elles ne sont pas livrées et testées.

## Technologies

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript 5**
- **Tailwind CSS 4**
- **Supabase** : Auth, PostgreSQL et fonctionnalités temps réel prévues
- **Vitest** : tests unitaires
- **Vercel** : hébergement et déploiement continu depuis la branche `main`

## Lancer le projet en local

### Prérequis

- Node.js compatible avec Next.js 16
- npm
- Un projet Supabase si vous souhaitez tester les fonctions liées aux comptes et aux données

### Installation

```bash
git clone https://github.com/ksds-bot/Mboa-Games.git
cd Mboa-Games
npm install
```

Créer un fichier `.env.local` à la racine du projet et renseigner les variables publiques Supabase :

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Puis lancer le serveur de développement :

```bash
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000).

## Commandes utiles

```bash
npm run dev      # serveur de développement
npm run build    # compilation de production
npm run start    # démarrer la version compilée
npm run lint     # vérification ESLint
npm test         # tests unitaires Vitest
```

## Supabase et sécurité

Les migrations SQL du projet se trouvent dans `supabase/migrations/`. Elles définissent notamment les profils, salons, participants, sessions de jeu, messages et scores, ainsi que les données de portefeuille et d'historique prévues pour les évolutions membres.

Avant d'appliquer une migration, vérifier qu'elle cible le bon projet Supabase et examiner les politiques RLS associées.

Principes de sécurité :
- Ne jamais exposer une clé `service_role` ou `sb_secret_` dans le navigateur ou dans une variable `NEXT_PUBLIC_*`.
- Les opérations privilégiées doivent rester côté serveur.
- Conserver et vérifier les politiques Row Level Security (RLS) sur les données privées.
- Ne jamais enregistrer un code PIN ou un secret dans les journaux applicatifs.

## Déploiement

Les changements poussés sur la branche `main` déclenchent le déploiement Vercel configuré pour le dépôt. Vérifier le résultat du build et l'état du déploiement avant de considérer une modification comme publiée.

## Modèle économique et paiements

Le mode de jeu actuel est gratuit. Les mises en argent réel, dépôts, retraits et paiements ne sont pas activés. Ne pas présenter les points ou jetons de démonstration comme une valeur monétaire.

## Contribution

Les contributions doivent préserver :
- l'interface en français et l'identité camerounaise de Mboa Games ;
- une expérience mobile-first et légère ;
- la possibilité de découvrir les jeux sans inscription ;
- la sécurité des comptes et des données des membres.

---

**Mboa Games — Joue. Défie. Rigole. Recommence. 🇨🇲**

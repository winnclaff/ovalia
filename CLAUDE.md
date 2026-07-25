\# Ovalia — Jeu de management de rugby en ligne



\## Stack

\- Frontend : Vite + React (ce dossier)

\- Backend : Supabase (Postgres, Auth, Realtime, Edge Functions)

\- Déploiement front : Netlify (plus tard)

\- Langue du code : anglais partout (variables, tables, colonnes)



\## Base de données Supabase

13 tables MVP : profiles, clubs, players, contracts, leagues, league\_seasons, standings, matches, match\_events, match\_lineups, tactics, training\_plans, transactions



Le client Supabase est dans src/lib/supabase.js. Les credentials sont dans .env (VITE\_SUPABASE\_URL et VITE\_SUPABASE\_ANON\_KEY).



\## Conventions

\- React fonctionnel (hooks, pas de classes)

\- Fichiers pages dans src/pages/

\- Fichiers composants dans src/components/

\- CSS dans src/index.css (pas de CSS modules, pas de Tailwind)

\- Palette : vert #1B7A4A, orange #F5820D, fond #F8F9FA, texte #1A1A2E

\- Typo : Inter ou system fonts

\- Style : moderne flat, cards arrondies, UI clean



\## Pages prévues

Dashboard, Effectif, Ligue, Match, Entraînement, Tactique, Finances, Recrutement, Profil



\## Routing

react-router-dom. Routes protégées (redirige vers /login si pas connecté).



\## Règles du jeu (résumé)

\- 1 user = 1 club. Ligues de 8 clubs, saison 14 semaines.

\- 14 stats joueur (1-100) : endurance, strength, agility, speed, passing, kicking, scrum, lineout, rucking, tackling, breaking, def\_reading, discipline, composure

\- Tactique : 4 curseurs 0-100 (play\_style, scrum\_aggression, lineout\_aggression, tempo)

\- Match : précalculé, 20-40 events affichés sur 80 min via Realtime

\- Tick nocturne à 4h : blessures, entraînement, énergie, contrats, finances, vieillissement, supporters, académie

\- Bots : malus -8%, pas de blessures, entraînement auto



\## État actuel

\- Auth, création de club, dashboard, effectif, ligue, match (simulation + Realtime), entraînement collectif, tactique, finances, recrutement (marché + académie) et profil sont tous implémentés.

\- Edge Functions : nightly-tick (tick nocturne 4h), simulate-match, generate-calendar, end-season.

\- Staff technique (table `coaches` : head\_coach, forwards\_coach, backs\_coach, medic — niveau 1-5, salaire croissant) et infrastructures (`clubs.stadium\_level`, `training\_facility\_level`, `medical\_center\_level`, `academy\_level`, `merchandising\_level`) gérés depuis la page Infrastructures (`src/pages/Infrastructure.jsx`). Constantes de coût/effet dans `src/lib/finance.js` (dupliquées dans les Edge Functions car Deno ne peut pas les importer).

\- Billetterie : revenu généré à chaque match à domicile dans `simulate-match` (capacité du stade × affluence). Salaires du staff et entretien des infrastructures intégrés au tick mensuel de `nightly-tick`. Le centre d'entraînement débloquera l'entraînement individuel (page Entraînement) — pas encore implémenté.

\- ⚠️ `supabase/cron.sql` contient une clé service\_role en clair et est suivi par git — à régénérer si le dépôt est public.

\- Prochaine étape : entraînement individuel (nécessite le centre d'entraînement), ou affiner l'équilibrage économique des nouvelles formules de finances.


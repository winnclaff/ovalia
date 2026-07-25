-- =============================================================================
-- Ovalia — Correction de l'enum transaction_type
-- Exécuter dans Supabase > SQL Editor
-- =============================================================================
-- L'enum réel ne contenait que : salary, ticket_revenue, sponsor, merchandise,
-- transfer_fee, prize, stadium_upkeep, other. Le code (Edge Functions + RPC de
-- transfert) utilisait des valeurs différentes ('sponsorship', 'maintenance',
-- 'ticket', 'fixed_costs', 'transfer_in', 'transfer_out', 'staff_salary',
-- 'infrastructure') qui n'existaient pas → tout insert multi-lignes contenant
-- une de ces valeurs échouait intégralement et silencieusement (le code ne
-- vérifie pas .error). Confirmé : 4 transactions seulement en base après des
-- mois de tick nocturne censé tourner chaque nuit.
--
-- On étend l'enum avec les catégories qui n'ont pas d'équivalent existant.
-- Les renommages vers les valeurs déjà valides (sponsorship→sponsor,
-- maintenance→stadium_upkeep, ticket→ticket_revenue) se font côté code
-- (nightly-tick, simulate-match, Finances.jsx), pas ici.

ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'fixed_costs';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'transfer_in';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'transfer_out';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'staff_salary';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'infrastructure';

-- ─── Fin ─────────────────────────────────────────────────────────────────────

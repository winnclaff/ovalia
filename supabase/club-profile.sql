-- =============================================================================
-- Ovalia — Fiche club/manager (région + lecture publique des profils)
-- Exécuter dans Supabase > SQL Editor
-- =============================================================================

-- ─── 1. Région in-game du club ─────────────────────────────────────────────────

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS region TEXT;

-- ─── 2. Lecture publique des profils ───────────────────────────────────────────
-- Nécessaire pour afficher "Manager depuis" / région IRL sur la fiche d'un AUTRE
-- club. Aucune colonne sensible dans profiles (email/mot de passe vivent dans
-- auth.users) — même principe que clubs_select_all déjà en place.

CREATE POLICY "profiles_select_all"
  ON profiles FOR SELECT
  USING (true);

-- ─── Fin ─────────────────────────────────────────────────────────────────────

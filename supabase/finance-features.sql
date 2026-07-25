-- =============================================================================
-- Ovalia — Staff technique, Infrastructures, Billetterie
-- Exécuter dans Supabase > SQL Editor (comme rls.sql et cron.sql)
-- =============================================================================

-- ─── 1. Niveaux d'infrastructure sur clubs ────────────────────────────────────
-- Valeurs par défaut choisies pour que les clubs existants démarrent avec un
-- coût de maintenance proche de l'ancien montant fixe (13 000 €).

ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS stadium_level           INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS training_facility_level INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medical_center_level     INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS academy_level            INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS merchandising_level      INT NOT NULL DEFAULT 1;

-- ─── 2. Staff technique ───────────────────────────────────────────────────────
-- Un coach par rôle par club (head_coach, forwards_coach, backs_coach, medic).

CREATE TABLE IF NOT EXISTS coaches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id        UUID NOT NULL REFERENCES clubs(id),
  role           TEXT NOT NULL CHECK (role IN ('head_coach','forwards_coach','backs_coach','medic')),
  level          INT  NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  monthly_salary INT  NOT NULL,
  hired_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, role)
);

ALTER TABLE coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coaches_select_all"
  ON coaches FOR SELECT
  USING (true);

CREATE POLICY "coaches_insert_owner"
  ON coaches FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = coaches.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "coaches_update_owner"
  ON coaches FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = coaches.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "coaches_delete_owner"
  ON coaches FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = coaches.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

-- ─── Fin ─────────────────────────────────────────────────────────────────────
-- NOTE : le service_role (clé utilisée par les Edge Functions) bypass RLS
-- et peut toujours lire/écrire toutes les tables sans policy.

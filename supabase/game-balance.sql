-- =============================================================================
-- Ovalia — Équilibrage & boucles d'engagement
-- Exécuter dans Supabase > SQL Editor (nécessite le secret Vault
-- 'service_role_key' déjà en place — voir cron.sql)
-- =============================================================================

-- ─── 1. Rapports quotidiens ("Cette nuit au club") ────────────────────────────
-- Écrits par nightly-tick (service_role), lus par le propriétaire du club
-- sur le Dashboard.

CREATE TABLE IF NOT EXISTS daily_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     UUID NOT NULL REFERENCES clubs(id),
  report_date DATE NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (club_id, report_date)
);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_reports_select_owner"
  ON daily_reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = daily_reports.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

-- ─── 2. Simulation horaire des matchs dus (amicaux + rattrapage) ──────────────
-- Toutes les heures à :10 :
--   a. les propositions d'amicaux expirées (heure du match passée sans réponse)
--      sont annulées ;
--   b. les matchs 'scheduled' dont la deadline de compo est passée sont
--      verrouillés (simulate-match génère une compo auto si absente) ;
--   c. tout match verrouillé/programmé dont l'heure est passée est simulé —
--      amicaux inclus, et matchs de championnat ratés par le job du samedi.

SELECT cron.schedule(
  'ovalia-simulate-due',
  '10 * * * *',
  $cron$
    DO $$
    DECLARE
      v_match RECORD;
      v_key   TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
    BEGIN
      -- a. Propositions d'amicaux expirées
      UPDATE matches
        SET status = 'cancelled'
      WHERE status = 'proposed'
        AND scheduled_at <= NOW();

      -- b. Verrouillage des compos (deadline passée)
      UPDATE matches
        SET status = 'lineups_locked'
      WHERE status = 'scheduled'
        AND lineup_deadline <= NOW();

      -- c. Simulation de tout match dû
      FOR v_match IN
        SELECT id FROM matches
        WHERE status IN ('scheduled', 'lineups_locked')
          AND scheduled_at <= NOW()
      LOOP
        PERFORM net.http_post(
          url     := 'https://fpeggjlxaybexsqnainn.supabase.co/functions/v1/simulate-match',
          headers := jsonb_build_object(
            'Authorization', 'Bearer ' || v_key,
            'Content-Type',  'application/json'
          ),
          body    := jsonb_build_object('match_id', v_match.id)
        );
        PERFORM pg_sleep(2);
      END LOOP;
    END;
    $$ LANGUAGE plpgsql;
  $cron$
);

-- ─── Fin ─────────────────────────────────────────────────────────────────────

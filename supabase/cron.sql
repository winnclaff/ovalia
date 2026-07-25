-- =============================================================================
-- Ovalia — Jobs pg_cron
-- Prérequis 1 : activer pg_cron / pg_net (voir instructions ci-dessous)
-- Prérequis 2 : stocker la clé service_role dans Supabase Vault AVANT d'exécuter
--   ce fichier (ne jamais committer cette clé en clair) :
--
--   select vault.create_secret(
--     '<TA_CLE_SERVICE_ROLE>',
--     'service_role_key',
--     'Clé utilisée par les cron jobs pour appeler les Edge Functions'
--   );
--
-- Exécute ça une seule fois dans le SQL Editor, avec ta vraie clé (Settings →
-- API → service_role secret). Les jobs ci-dessous la relisent depuis
-- vault.decrypted_secrets à chaque exécution — elle n'apparaît jamais ici.
-- =============================================================================

-- ─── Activer l'extension pg_cron ──────────────────────────────────────────────
-- Dans Supabase Dashboard → Database → Extensions → rechercher "pg_cron" → Enable
-- OU via SQL :
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;  -- nécessaire pour les appels HTTP

-- Vérifier que les extensions sont actives :
-- SELECT * FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');

-- =============================================================================

-- ─── 1. Tick nocturne — tous les jours à 4h00 Paris (2h00 UTC) ───────────────

SELECT cron.schedule(
  'ovalia-nightly-tick',
  '0 2 * * *',   -- 4h00 UTC+2 = 2h00 UTC
  $cron$
    SELECT net.http_post(
      url     := 'https://fpeggjlxaybexsqnainn.supabase.co/functions/v1/nightly-tick',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
        'Content-Type',  'application/json'
      ),
      body    := '{}'::jsonb
    );
  $cron$
);

-- ─── 2. Verrouillage des compos — chaque samedi à 12h00 Paris (10h00 UTC) ────

SELECT cron.schedule(
  'ovalia-lock-lineups',
  '0 10 * * 6',   -- 12h00 UTC+2 = 10h00 UTC, samedi (6)
  $cron$
    DO $$
    DECLARE
      v_match     RECORD;
      v_club_id   UUID;
      v_has_lineup BOOLEAN;
      v_player    RECORD;
      v_shirt     INT;
      v_positions TEXT[] := ARRAY[
        'prop','hooker','prop','lock','lock',
        'flanker','flanker','number_8',
        'scrum_half','fly_half','wing','center','center','wing','full_back',
        'prop','prop','hooker','lock','flanker','scrum_half','fly_half','center'
      ];
    BEGIN
      -- Verrouiller tous les matchs scheduled pour aujourd'hui
      UPDATE matches
        SET status = 'lineups_locked'
      WHERE status = 'scheduled'
        AND DATE(scheduled_at AT TIME ZONE 'Europe/Paris') = CURRENT_DATE
        AND league_season_id IS NOT NULL;

      -- Pour les clubs sans compo validée, générer une compo automatique
      FOR v_match IN
        SELECT id, home_club_id, away_club_id
        FROM matches
        WHERE status = 'lineups_locked'
          AND DATE(scheduled_at AT TIME ZONE 'Europe/Paris') = CURRENT_DATE
          AND league_season_id IS NOT NULL
      LOOP
        FOR v_club_id IN SELECT v_match.home_club_id UNION SELECT v_match.away_club_id
        LOOP
          SELECT EXISTS (
            SELECT 1 FROM match_lineups
            WHERE match_id = v_match.id AND club_id = v_club_id
          ) INTO v_has_lineup;

          IF NOT v_has_lineup THEN
            v_shirt := 1;
            FOR v_player IN
              SELECT p.*
              FROM players p
              WHERE p.club_id = v_club_id
                AND p.injury_days_left = 0
              ORDER BY (
                p.endurance + p.strength + p.agility + p.speed +
                p.passing + p.kicking + p.scrum + p.lineout + p.rucking +
                p.tackling + p.breaking + p.def_reading + p.discipline + p.composure
              ) / 14 DESC
              LIMIT 23
            LOOP
              INSERT INTO match_lineups (
                match_id, club_id, player_id,
                shirt_number, is_starter,
                position
              ) VALUES (
                v_match.id, v_club_id, v_player.id,
                v_shirt, v_shirt <= 15,
                v_positions[v_shirt]
              )
              ON CONFLICT DO NOTHING;
              v_shirt := v_shirt + 1;
              EXIT WHEN v_shirt > 23;
            END LOOP;
          END IF;
        END LOOP;
      END LOOP;
    END;
    $$ LANGUAGE plpgsql;
  $cron$
);

-- ─── 3. Simulation des matchs — chaque samedi à 21h05 Paris (19h05 UTC) ──────

SELECT cron.schedule(
  'ovalia-simulate-matches',
  '5 19 * * 6',   -- 21h05 UTC+2 = 19h05 UTC, samedi (5 min après lock)
  $cron$
    DO $$
    DECLARE
      v_match RECORD;
      v_key   TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
    BEGIN
      FOR v_match IN
        SELECT id FROM matches
        WHERE status = 'lineups_locked'
          AND league_season_id IS NOT NULL
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
        PERFORM pg_sleep(2); -- 2 secondes entre chaque match
      END LOOP;
    END;
    $$ LANGUAGE plpgsql;
  $cron$
);

-- ─── Voir tous les jobs actifs ────────────────────────────────────────────────
-- SELECT * FROM cron.job;

-- ─── Voir les logs d'exécution ────────────────────────────────────────────────
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

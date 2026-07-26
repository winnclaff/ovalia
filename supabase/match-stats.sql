-- =============================================================================
-- Ovalia — Enregistrement du film de match + statistiques par joueur
-- Exécuter dans Supabase > SQL Editor
-- =============================================================================
-- Constat : match_events était TOTALEMENT vide malgré des matchs joués.
-- L'insert groupé échouait silencieusement (le code ne vérifiait pas .error)
-- pour deux raisons :
--   1. event_type : le code écrit 'penalty_goal' (l'enum a 'penalty_kick') et
--      'final_whistle' (absent de l'enum). Le coup de sifflet final étant
--      présent à CHAQUE match, 100 % des inserts échouaient.
--   2. club_id est NOT NULL, or les événements neutres (turnover, coup de
--      sifflet final) n'appartiennent à aucun club et étaient insérés à NULL.
-- Le renommage penalty_goal → penalty_kick se fait côté code.

-- ─── 1. Valeur d'enum manquante ───────────────────────────────────────────────

ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'final_whistle';

-- ─── 2. Les événements neutres n'ont pas de club ──────────────────────────────

ALTER TABLE match_events ALTER COLUMN club_id DROP NOT NULL;

-- ─── 3. Statistiques individuelles par match ──────────────────────────────────
-- Alimenté par simulate-match. L'attribution des actions est pondérée par les
-- caractéristiques des joueurs (et non plus aléatoire), pour que ces chiffres
-- soient réellement exploitables : comparer deux joueurs à un même poste,
-- repérer un poste en sous-performance, ajuster la tactique.

CREATE TABLE IF NOT EXISTS match_player_stats (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id           UUID NOT NULL REFERENCES matches(id),
  club_id            UUID NOT NULL REFERENCES clubs(id),
  player_id          UUID NOT NULL REFERENCES players(id),
  position           position_group,
  is_starter         BOOLEAN NOT NULL DEFAULT true,
  minutes_played     INT NOT NULL DEFAULT 0,
  -- Réalisations
  tries              INT NOT NULL DEFAULT 0,
  conversions        INT NOT NULL DEFAULT 0,
  penalties          INT NOT NULL DEFAULT 0,
  points             INT NOT NULL DEFAULT 0,
  -- Jeu courant
  carries            INT NOT NULL DEFAULT 0,
  meters_gained      INT NOT NULL DEFAULT 0,
  tackles            INT NOT NULL DEFAULT 0,
  tackles_missed     INT NOT NULL DEFAULT 0,
  turnovers_won      INT NOT NULL DEFAULT 0,
  handling_errors    INT NOT NULL DEFAULT 0,
  -- Discipline
  yellow_cards       INT NOT NULL DEFAULT 0,
  red_cards          INT NOT NULL DEFAULT 0,
  -- Note globale sur 10
  rating             NUMERIC(3,1) NOT NULL DEFAULT 6.0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS match_player_stats_player_idx ON match_player_stats (player_id);
CREATE INDEX IF NOT EXISTS match_player_stats_club_idx   ON match_player_stats (club_id);

ALTER TABLE match_player_stats ENABLE ROW LEVEL SECURITY;

-- Lecture publique (comme matches / match_events / standings) : permet de
-- consulter les performances de n'importe quel club. Écriture service_role.
CREATE POLICY "match_player_stats_select_all"
  ON match_player_stats FOR SELECT
  USING (true);

-- ─── Fin ─────────────────────────────────────────────────────────────────────

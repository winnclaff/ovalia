-- =============================================================================
-- Ovalia — Objectifs de saison
-- Exécuter dans Supabase > SQL Editor
-- =============================================================================
-- Le board fixe un objectif par club et par saison, avec prime si atteint
-- (versée par end-season) et malus de réputation sinon.

CREATE TABLE IF NOT EXISTS season_objectives (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_season_id UUID NOT NULL REFERENCES league_seasons(id),
  club_id          UUID NOT NULL REFERENCES clubs(id),
  objective_type   TEXT NOT NULL CHECK (objective_type IN ('win_title','top3','top_half','avoid_relegation')),
  reward           INT  NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','achieved','failed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_season_id, club_id)
);

ALTER TABLE season_objectives ENABLE ROW LEVEL SECURITY;

-- Lecture publique (comme standings) ; écriture réservée au service_role.
CREATE POLICY "season_objectives_select_all"
  ON season_objectives FOR SELECT
  USING (true);

-- ─── Seed de la saison en cours ───────────────────────────────────────────────
-- Aucun match joué : on classe les clubs par force d'effectif (moyenne des
-- 14 stats de leurs joueurs) et on assigne un objectif proportionné.

WITH strength AS (
  SELECT
    s.league_season_id,
    s.club_id,
    AVG(
      (p.endurance + p.strength + p.agility + p.speed +
       p.passing + p.kicking + p.scrum + p.lineout + p.rucking +
       p.tackling + p.breaking + p.def_reading + p.discipline + p.composure) / 14.0
    ) AS avg_overall
  FROM standings s
  JOIN league_seasons ls ON ls.id = s.league_season_id AND ls.status = 'in_progress'
  JOIN players p ON p.club_id = s.club_id
  GROUP BY s.league_season_id, s.club_id
),
ranked AS (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY league_season_id ORDER BY avg_overall DESC) AS rk
  FROM strength
)
INSERT INTO season_objectives (league_season_id, club_id, objective_type, reward)
SELECT
  league_season_id,
  club_id,
  CASE
    WHEN rk = 1  THEN 'win_title'
    WHEN rk <= 3 THEN 'top3'
    WHEN rk <= 5 THEN 'top_half'
    ELSE 'avoid_relegation'
  END,
  CASE
    WHEN rk = 1  THEN 300000
    WHEN rk <= 3 THEN 200000
    WHEN rk <= 5 THEN 120000
    ELSE 80000
  END
FROM ranked
ON CONFLICT (league_season_id, club_id) DO NOTHING;

-- ─── Fin ─────────────────────────────────────────────────────────────────────

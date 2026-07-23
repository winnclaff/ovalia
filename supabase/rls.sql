-- =============================================================================
-- Ovalia — Row Level Security
-- Exécuter dans Supabase > SQL Editor
-- =============================================================================

-- ─── 1. Activer RLS sur toutes les tables ────────────────────────────────────

ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clubs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE players        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues        ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE standings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_lineups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions   ENABLE ROW LEVEL SECURITY;

-- ─── 2. profiles — lecture et écriture uniquement sur son propre profil ───────

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ─── 3. clubs — lecture publique, modification réservée au owner ─────────────

CREATE POLICY "clubs_select_all"
  ON clubs FOR SELECT
  USING (true);

CREATE POLICY "clubs_update_owner"
  ON clubs FOR UPDATE
  USING (auth.uid() = owner_user_id OR owner_user_id IS NULL)
  WITH CHECK (auth.uid() = owner_user_id);

-- ─── 4. players — lecture publique, écriture réservée au propriétaire du club ─

CREATE POLICY "players_select_all"
  ON players FOR SELECT
  USING (true);

CREATE POLICY "players_update_club_owner"
  ON players FOR UPDATE
  USING (
    club_id IS NULL
    OR EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = players.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

-- Permet au propriétaire de recruter (mettre à jour club_id d'un joueur libre)
CREATE POLICY "players_update_free_player"
  ON players FOR UPDATE
  USING (club_id IS NULL)
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

-- ─── 5. contracts — lecture publique, écriture réservée au propriétaire ───────

CREATE POLICY "contracts_select_all"
  ON contracts FOR SELECT
  USING (true);

CREATE POLICY "contracts_insert_club_owner"
  ON contracts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = contracts.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "contracts_update_club_owner"
  ON contracts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = contracts.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

-- ─── 6. leagues, league_seasons, standings — lecture publique uniquement ──────
--       (écriture réservée au service_role qui bypass RLS)

CREATE POLICY "leagues_select_all"
  ON leagues FOR SELECT
  USING (true);

CREATE POLICY "league_seasons_select_all"
  ON league_seasons FOR SELECT
  USING (true);

CREATE POLICY "standings_select_all"
  ON standings FOR SELECT
  USING (true);

-- ─── 7. matches, match_events — lecture publique, écriture service_role ───────

CREATE POLICY "matches_select_all"
  ON matches FOR SELECT
  USING (true);

-- Permet aux propriétaires d'insérer des amicaux (is_friendly = true)
CREATE POLICY "matches_insert_friendly"
  ON matches FOR INSERT
  WITH CHECK (
    is_friendly = true
    AND league_season_id IS NULL
    AND (
      EXISTS (SELECT 1 FROM clubs WHERE clubs.id = matches.home_club_id AND clubs.owner_user_id = auth.uid())
      OR
      EXISTS (SELECT 1 FROM clubs WHERE clubs.id = matches.away_club_id AND clubs.owner_user_id = auth.uid())
    )
  );

-- Permet à l'équipe away d'accepter/refuser un amical (update status)
CREATE POLICY "matches_update_friendly_away"
  ON matches FOR UPDATE
  USING (
    is_friendly = true
    AND status = 'scheduled'
    AND EXISTS (SELECT 1 FROM clubs WHERE clubs.id = matches.away_club_id AND clubs.owner_user_id = auth.uid())
  )
  WITH CHECK (
    is_friendly = true
    AND EXISTS (SELECT 1 FROM clubs WHERE clubs.id = away_club_id AND clubs.owner_user_id = auth.uid())
  );

CREATE POLICY "match_events_select_all"
  ON match_events FOR SELECT
  USING (true);

-- ─── 8. match_lineups — lecture publique, écriture par propriétaire du club ───

CREATE POLICY "match_lineups_select_all"
  ON match_lineups FOR SELECT
  USING (true);

CREATE POLICY "match_lineups_insert_club_owner"
  ON match_lineups FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = match_lineups.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "match_lineups_update_club_owner"
  ON match_lineups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = match_lineups.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "match_lineups_delete_club_owner"
  ON match_lineups FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = match_lineups.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

-- ─── 9. tactics — lecture et écriture réservées au propriétaire du club ───────

CREATE POLICY "tactics_select_owner"
  ON tactics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = tactics.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "tactics_insert_owner"
  ON tactics FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = tactics.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "tactics_update_owner"
  ON tactics FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = tactics.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "tactics_delete_owner"
  ON tactics FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = tactics.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

-- ─── 10. training_plans — lecture et écriture réservées au propriétaire ───────

CREATE POLICY "training_plans_select_owner"
  ON training_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = training_plans.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "training_plans_insert_owner"
  ON training_plans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = training_plans.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "training_plans_update_owner"
  ON training_plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = training_plans.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "training_plans_delete_owner"
  ON training_plans FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = training_plans.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

-- ─── 11. transactions — lecture par propriétaire du club ─────────────────────
--         écriture réservée au service_role (Edge Functions)
--         EXCEPTION : on autorise le propriétaire à insérer pour les actions
--         frontend (recrutement) — supprimer cette policy quand tout passe
--         par des Edge Functions

CREATE POLICY "transactions_select_owner"
  ON transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = transactions.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

-- Policy temporaire : permettre au propriétaire d'insérer ses propres transactions
-- (recrutement depuis le frontend). À supprimer une fois la Edge Function sign-player créée.
CREATE POLICY "transactions_insert_owner_tmp"
  ON transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = transactions.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

-- ─── 12. Migration : colonne is_friendly sur matches ─────────────────────────

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS is_friendly BOOLEAN NOT NULL DEFAULT false;

-- ─── Fin ─────────────────────────────────────────────────────────────────────
-- NOTE : le service_role (clé utilisée par les Edge Functions) bypass RLS
-- et peut toujours lire/écrire toutes les tables sans policy.

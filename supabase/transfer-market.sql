-- =============================================================================
-- Ovalia — Marché des transferts (agents libres + mise en vente entre clubs)
-- Exécuter dans Supabase > SQL Editor (comme rls.sql, cron.sql, finance-features.sql)
-- =============================================================================

-- ─── 1. Amorçage du pool d'agents libres ──────────────────────────────────────
-- Le marché est vide (0 club_id NULL en base) car rien n'en a jamais généré.
-- ⚠️ Valeurs de primary_position en minuscules avec underscore : l'enum
-- position_group réel n'a PAS les mêmes valeurs que le tableau POSITIONS
-- (majuscules) précédemment utilisé dans nightly-tick — c'est ce qui faisait
-- silencieusement échouer la génération académie depuis le début.

DO $$
DECLARE
  positions     position_group[] := ARRAY['prop','hooker','lock','flanker','number_8','scrum_half','fly_half','center','wing','full_back']::position_group[];
  nationalities TEXT[] := ARRAY['Français','Anglais','Irlandais','Gallois','Néo-Zélandais','Australien','Argentin','Afrique du Sud','Fidjien','Samoan'];
  first_names   TEXT[] := ARRAY['Lucas','Hugo','Nathan','Léo','Théo','Antoine','Maxime','Pierre','Julien','Axel','Romain','Baptiste','Enzo','Louis','Tom'];
  last_names    TEXT[] := ARRAY['Martin','Bernard','Thomas','Robert','Richard','Petit','Durand','Simon','Michel','Lefebvre','Moreau','Girard','André','Mercier','Blanc'];
  stat_base     INT;
  i             INT;
BEGIN
  FOR i IN 1..40 LOOP
    stat_base := 35 + floor(random() * 35)::int;  -- centre de jauge 35-70

    INSERT INTO players (
      club_id, first_name, last_name, nationality, date_of_birth, primary_position,
      height_cm, weight_kg, source,
      endurance, strength, agility, speed, passing, kicking,
      scrum, lineout, rucking, tackling, breaking, def_reading,
      discipline, composure
    ) VALUES (
      NULL,
      first_names[1 + floor(random() * array_length(first_names, 1))::int],
      last_names[1 + floor(random() * array_length(last_names, 1))::int],
      nationalities[1 + floor(random() * array_length(nationalities, 1))::int],
      CURRENT_DATE - ((19 + floor(random() * 15))::int || ' years')::interval,
      positions[1 + floor(random() * array_length(positions, 1))::int],
      175 + floor(random() * 23)::int,
      80 + floor(random() * 38)::int,
      'transfer_market',
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int)),
      greatest(1, least(99, stat_base + (floor(random() * 21) - 10)::int))
    );
  END LOOP;
END $$;

-- ─── 2. Mise en vente entre clubs ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transfer_listings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES players(id),
  club_id      UUID NOT NULL REFERENCES clubs(id),
  asking_price INT  NOT NULL CHECK (asking_price > 0),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'cancelled')),
  listed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  sold_at      TIMESTAMPTZ
);

ALTER TABLE transfer_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transfer_listings_select_all"
  ON transfer_listings FOR SELECT
  USING (true);

CREATE POLICY "transfer_listings_insert_owner"
  ON transfer_listings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = transfer_listings.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "transfer_listings_update_owner"
  ON transfer_listings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM clubs
      WHERE clubs.id = transfer_listings.club_id
        AND clubs.owner_user_id = auth.uid()
    )
  );

-- ─── 3. Achat d'un joueur en vente (fonction privilégiée) ──────────────────────
-- Un transfert touche DEUX clubs (solde, transactions) + désactive/crée des
-- contrats + change club_id d'un joueur déjà possédé — aucune policy RLS ne
-- doit permettre à un club d'écrire directement dans les données d'un autre
-- club. On utilise donc une fonction SECURITY DEFINER (comme le service_role
-- des Edge Functions, mais transactionnelle) plutôt que d'ouvrir des policies.
-- auth.uid() reste résolu correctement à l'intérieur (JWT de l'appelant préservé
-- par PostgREST/RPC) : c'est le pattern standard Supabase pour ce cas.

CREATE OR REPLACE FUNCTION buy_listed_player(
  p_listing_id UUID,
  p_monthly_salary INT,
  p_duration_months INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing    transfer_listings%ROWTYPE;
  v_buyer_club clubs%ROWTYPE;
BEGIN
  SELECT * INTO v_listing FROM transfer_listings WHERE id = p_listing_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Annonce introuvable ou déjà vendue';
  END IF;

  SELECT * INTO v_buyer_club FROM clubs WHERE owner_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun club pour cet utilisateur';
  END IF;

  IF v_buyer_club.id = v_listing.club_id THEN
    RAISE EXCEPTION 'Impossible d''acheter son propre joueur';
  END IF;

  IF v_buyer_club.balance < v_listing.asking_price + p_monthly_salary THEN
    RAISE EXCEPTION 'Trésorerie insuffisante';
  END IF;

  UPDATE clubs SET balance = balance - v_listing.asking_price - p_monthly_salary WHERE id = v_buyer_club.id;
  UPDATE clubs SET balance = balance + v_listing.asking_price WHERE id = v_listing.club_id;

  INSERT INTO transactions (club_id, type, amount, description) VALUES
    (v_buyer_club.id,   'transfer_out', v_listing.asking_price, 'Achat joueur — transfert'),
    (v_listing.club_id, 'transfer_in',  v_listing.asking_price, 'Vente joueur — transfert'),
    (v_buyer_club.id,   'salary',       p_monthly_salary,       'Signature — premier mois');

  UPDATE contracts SET is_active = false
    WHERE player_id = v_listing.player_id AND club_id = v_listing.club_id AND is_active = true;

  INSERT INTO contracts (player_id, club_id, monthly_salary, start_date, end_date, is_active)
    VALUES (
      v_listing.player_id, v_buyer_club.id, p_monthly_salary,
      CURRENT_DATE, CURRENT_DATE + (p_duration_months || ' months')::interval, true
    );

  UPDATE players SET club_id = v_buyer_club.id WHERE id = v_listing.player_id;

  UPDATE transfer_listings SET status = 'sold', sold_at = now() WHERE id = p_listing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION buy_listed_player(UUID, INT, INT) TO authenticated;

-- ─── Fin ─────────────────────────────────────────────────────────────────────

-- =============================================================================
-- Ovalia — Correction du flux amical (proposer / accepter / refuser)
-- Exécuter dans Supabase > SQL Editor
-- =============================================================================
-- L'enum match_status ne contenait que : scheduled, lineups_locked, simulated,
-- live, completed. AmicauxTab utilisait 'accepted' et 'cancelled' — des valeurs
-- inexistantes — donc accepter/refuser un amical échouait systématiquement.
-- On ajoute :
--   'proposed'  : amical proposé, en attente de réponse du club adverse
--   'cancelled' : amical refusé (ou annulé)
-- Un amical accepté passe directement à 'scheduled' (déjà valide), comme un
-- match de championnat normal.

ALTER TYPE match_status ADD VALUE IF NOT EXISTS 'proposed';
ALTER TYPE match_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ─── Fin ─────────────────────────────────────────────────────────────────────

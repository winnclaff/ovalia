import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PRIZE_MONEY = [500_000, 350_000, 250_000, 150_000, 50_000, 50_000, 50_000, 50_000]

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { league_season_id } = await req.json()
    if (!league_season_id) throw new Error('league_season_id requis')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const log: string[] = []

    // ── 1. Vérifier que tous les matchs sont completed ────────────────────────
    // ✅ is_friendly supprimé — on filtre sur league_season_id directement
    const { data: pendingMatches } = await supabase
      .from('matches')
      .select('id')
      .eq('league_season_id', league_season_id)
      .neq('status', 'completed')

    if (pendingMatches && pendingMatches.length > 0) {
      throw new Error(`${pendingMatches.length} matchs non terminés dans cette saison.`)
    }
    log.push('Vérification: tous les matchs sont terminés ✓')

    // ── 2. Récupérer le classement final ──────────────────────────────────────
    // ✅ ranking_points au lieu de points pour le tri
    const { data: standings, error: sErr } = await supabase
      .from('standings')
      .select('*, clubs(id, name)')
      .eq('league_season_id', league_season_id)
      .order('ranking_points', { ascending: false })

    if (sErr || !standings?.length) throw sErr ?? new Error('Classement introuvable')

    const { data: season } = await supabase
      .from('league_seasons')
      .select('*, leagues(id, name, tier)')
      .eq('id', league_season_id)
      .single()

    if (!season) throw new Error('Saison introuvable')
    const league = season.leagues
    const currentDivision = league.tier ?? 1

    log.push(`Saison terminée : ${league.name} — Division ${currentDivision}`)
    log.push(`Classement final : ${standings.map((s, i) => `${i+1}. ${s.clubs?.name}`).join(', ')}`)

    // ── 3. Primes de classement ───────────────────────────────────────────────
    for (let i = 0; i < standings.length; i++) {
      const prize  = PRIZE_MONEY[i] ?? 50_000
      const clubId = standings[i].club_id

      const { error: prizeErr } = await supabase.from('transactions').insert({
        club_id:     clubId,
        type:        'prize',
        amount:      prize,
        description: `Prime de classement — ${i + 1}e place — ${league.name}`,
      })
      if (prizeErr) log.push(`Prime: erreur insert club ${clubId} — ${prizeErr.message}`)

      const { data: clubRow } = await supabase.from('clubs').select('balance').eq('id', clubId).single()
      if (clubRow) {
        await supabase.from('clubs').update({ balance: (clubRow.balance ?? 0) + prize }).eq('id', clubId)
      }
    }
    log.push('Primes versées ✓')

    // ── 3bis. Objectifs de saison : évaluation ────────────────────────────────
    // win_title : 1er · top3 : ≤3 · top_half : ≤4 · avoid_relegation : ≤7 (pas dernier)
    const OBJECTIVE_RANK_OK: Record<string, (rank: number, total: number) => boolean> = {
      win_title:        (rank) => rank === 1,
      top3:             (rank) => rank <= 3,
      top_half:         (rank) => rank <= 4,
      avoid_relegation: (rank, total) => rank < total,
    }

    const { data: objectives } = await supabase
      .from('season_objectives')
      .select('*')
      .eq('league_season_id', league_season_id)
      .eq('status', 'pending')

    for (const obj of objectives ?? []) {
      const rank = standings.findIndex((s) => s.club_id === obj.club_id) + 1
      if (rank === 0) continue
      const achieved = OBJECTIVE_RANK_OK[obj.objective_type]?.(rank, standings.length) ?? false

      if (achieved) {
        const { error: objTxErr } = await supabase.from('transactions').insert({
          club_id:     obj.club_id,
          type:        'prize',
          amount:      obj.reward,
          description: `Objectif de saison atteint — ${league.name}`,
        })
        if (objTxErr) log.push(`Objectif: erreur transaction club ${obj.club_id} — ${objTxErr.message}`)
        const { data: clubRow2 } = await supabase.from('clubs').select('balance').eq('id', obj.club_id).single()
        if (clubRow2) {
          await supabase.from('clubs').update({ balance: (clubRow2.balance ?? 0) + obj.reward }).eq('id', obj.club_id)
        }
        await supabase.from('season_objectives').update({ status: 'achieved' }).eq('id', obj.id)
      } else {
        // Objectif raté : le board sanctionne — réputation −5
        const { data: clubRow3 } = await supabase.from('clubs').select('reputation').eq('id', obj.club_id).single()
        if (clubRow3) {
          await supabase.from('clubs')
            .update({ reputation: Math.max(1, (clubRow3.reputation ?? 50) - 5) })
            .eq('id', obj.club_id)
        }
        await supabase.from('season_objectives').update({ status: 'failed' }).eq('id', obj.id)
      }
    }
    log.push(`Objectifs évalués : ${(objectives ?? []).length}`)

    // ── 4. Promotion / relégation ─────────────────────────────────────────────
    const rankClubs = standings.map((s) => ({
      clubId:   s.club_id,
      clubName: s.clubs?.name,
      points:   s.ranking_points,
    }))

    let promotedClubId: string | null = null
    let relegatedClubId: string | null = null

    // 1er → montée (sauf D1) : on met à jour clubs.league_id
    if (currentDivision > 1) {
      const { data: upperLeague } = await supabase
        .from('leagues')
        .select('id')
        .eq('tier', currentDivision - 1)
        .maybeSingle()

      if (upperLeague) {
        promotedClubId = rankClubs[0].clubId
        await supabase.from('clubs').update({ league_id: upperLeague.id }).eq('id', promotedClubId)
        log.push(`Montée : ${rankClubs[0].clubName} → Division ${currentDivision - 1} (clubs.league_id mis à jour)`)
      }
    }

    // 8e → relégation : on met à jour clubs.league_id
    const lastClub = rankClubs[standings.length - 1]
    const { data: lowerLeague } = await supabase
      .from('leagues')
      .select('id')
      .eq('tier', currentDivision + 1)
      .maybeSingle()

    if (lowerLeague) {
      relegatedClubId = lastClub.clubId
      await supabase.from('clubs').update({ league_id: lowerLeague.id }).eq('id', relegatedClubId)
      log.push(`Relégation : ${lastClub.clubName} → Division ${currentDivision + 1} (clubs.league_id mis à jour)`)
    }

    // 6e vs 7e → barrage
    if (standings.length >= 7) {
      const club6 = rankClubs[5]
      const club7 = rankClubs[6]

      const barrageDate = new Date()
      barrageDate.setDate(barrageDate.getDate() + 14)
      barrageDate.setUTCHours(19, 0, 0, 0)
      // ✅ lineup_deadline est NOT NULL : 1h avant le coup d'envoi
      const barrageDeadline = new Date(barrageDate.getTime() - 60 * 60_000)

      const { error: barrageErr } = await supabase.from('matches').insert({
        league_season_id: null,
        home_club_id:     club6.clubId,
        away_club_id:     club7.clubId,
        scheduled_at:     barrageDate.toISOString(),
        lineup_deadline:  barrageDeadline.toISOString(),
        status:           'scheduled',
        match_day:        15,  // ✅ était round
      })
      if (barrageErr) log.push(`Barrage: erreur insert — ${barrageErr.message}`)

      log.push(`Barrage créé : ${club6.clubName} (6e) vs ${club7.clubName} (7e)`)
    }

    // ── 5. Clôturer la saison ─────────────────────────────────────────────────
    await supabase.from('league_seasons').update({ status: 'completed' }).eq('id', league_season_id)

    // ── 6. Créer la nouvelle saison ───────────────────────────────────────────
    const newSeasonNumber = (season.season_number ?? 1) + 1

    const { data: newSeason } = await supabase
      .from('league_seasons')
      .insert({ league_id: league.id, season_number: newSeasonNumber, status: 'in_progress' })
      .select()
      .single()

    if (!newSeason) throw new Error('Impossible de créer la nouvelle saison')
    log.push(`Nouvelle saison créée : Saison ${newSeasonNumber}`)

    // ── 7. Créer les standings pour la nouvelle saison ────────────────────────
    // On exclut le club promu et le club relégué : ils rejoignent d'autres ligues.
    // Les 6 clubs restants (2e–7e) restent dans cette ligue.
    // Les 2 slots vacants seront remplis quand les end-season voisines s'exécutent
    // et envoient leur promu/relégué dans cette ligue.
    const remainingClubIds = rankClubs
      .map((c) => c.clubId)
      .filter((id) => id !== promotedClubId && id !== relegatedClubId)

    // Ajouter aussi les clubs dont le league_id pointe toujours vers cette ligue
    // (cas où il n'y a pas eu de promo/relégation — D1 ou division max)
    const currentClubIds = remainingClubIds

    if (currentClubIds.length) {
      const newStandings = currentClubIds.map((clubId) => ({
        league_season_id: newSeason.id,
        club_id:          clubId,
        played:           0,
        won:              0,   // ✅ était wins
        drawn:            0,   // ✅ était draws
        lost:             0,   // ✅ était losses
        points_for:       0,
        points_against:   0,
        bonus_attack:     0,
        bonus_defense:    0,
        ranking_points:   0,   // ✅ était points
      }))
      await supabase.from('standings').insert(newStandings)
      log.push(`Standings créés pour ${currentClubIds.length} clubs`)

      // ── Objectifs de la nouvelle saison, selon le rang final ───────────────
      const newObjectives = currentClubIds.map((clubId) => {
        const finalRank = rankClubs.findIndex((c) => c.clubId === clubId) + 1
        const [type, reward] =
          finalRank <= 2 ? ['win_title', 300000]
          : finalRank <= 4 ? ['top3', 200000]
          : finalRank <= 6 ? ['top_half', 120000]
          : ['avoid_relegation', 80000]
        return { league_season_id: newSeason.id, club_id: clubId, objective_type: type, reward }
      })
      const { error: newObjErr } = await supabase.from('season_objectives').insert(newObjectives)
      log.push(newObjErr
        ? `Objectifs nouvelle saison: erreur — ${newObjErr.message}`
        : `Objectifs assignés pour ${newObjectives.length} clubs`)
    }

    // ── 8. Générer le calendrier — seulement si les 8 clubs sont déjà en place ──
    // (si promo/relégation en attente d'autres ligues, le calendrier sera généré manuellement)
    if (currentClubIds.length === 8) {
      await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-calendar`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({ league_season_id: newSeason.id }),
        },
      )
      log.push('Calendrier généré pour la nouvelle saison ✓')
    }

    return new Response(
      JSON.stringify({ ok: true, log, new_season_id: newSeason.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

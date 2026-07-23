import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function generateRoundRobin(teams: string[]): Array<Array<[string, string]>> {
  const n = teams.length
  const rounds: Array<Array<[string, string]>> = []
  const rotating = [...teams.slice(1)]

  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = []
    const circle = [teams[0], ...rotating]
    for (let i = 0; i < n / 2; i++) {
      round.push([circle[i], circle[n - 1 - i]])
    }
    rounds.push(round)
    rotating.unshift(rotating.pop()!)
  }
  return rounds
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function nextSaturday(from: Date): Date {
  const d = new Date(from)
  const day = d.getDay()
  const diff = (6 - day + 7) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d
}

function matchDatetime(saturday: Date): string {
  const d = new Date(saturday)
  d.setUTCHours(19, 0, 0, 0) // 21h00 Paris (UTC+2) = 19h00 UTC
  return d.toISOString()
}

function lineupDeadline(saturday: Date): string {
  const d = new Date(saturday)
  d.setUTCHours(10, 0, 0, 0) // 12h00 Paris (UTC+2) = 10h00 UTC
  return d.toISOString()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { league_season_id } = await req.json()
    if (!league_season_id) throw new Error('league_season_id requis')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: standingsRows, error: sErr } = await supabase
      .from('standings')
      .select('club_id')
      .eq('league_season_id', league_season_id)

    if (sErr) throw sErr
    if (!standingsRows || standingsRows.length !== 8) {
      throw new Error(`Attendu 8 clubs, trouvé ${standingsRows?.length ?? 0}`)
    }

    const clubIds = standingsRows.map((r) => r.club_id)
    const allerRounds = generateRoundRobin(clubIds)
    const retourRounds = shuffle(
      allerRounds.map((round) => round.map(([h, a]) => [a, h] as [string, string])),
    )
    const allRounds = [...allerRounds, ...retourRounds]

    let saturday = nextSaturday(new Date())
    const rows: Record<string, unknown>[] = []

    for (let journee = 0; journee < 14; journee++) {
      const round    = allRounds[journee]
      const scheduled = matchDatetime(saturday)
      const deadline  = lineupDeadline(saturday)

      for (const [homeId, awayId] of round) {
        rows.push({
          league_season_id,
          home_club_id:    homeId,
          away_club_id:    awayId,
          match_day:       journee + 1,  // ✅ était round
          scheduled_at:    scheduled,
          lineup_deadline: deadline,
          status:          'scheduled',
          // is_friendly supprimé — colonne inexistante
        })
      }

      saturday = new Date(saturday)
      saturday.setDate(saturday.getDate() + 7)
    }

    const { error: insErr } = await supabase.from('matches').insert(rows)
    if (insErr) throw insErr

    return new Response(
      JSON.stringify({ ok: true, matches_created: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

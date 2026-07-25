import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Player {
  id: string; club_id: string; primary_position: string; shirt_number?: number
  endurance: number; strength: number; agility: number; speed: number
  passing: number; kicking: number; scrum: number; lineout: number
  rucking: number; tackling: number; breaking: number; def_reading: number
  discipline: number; composure: number; energy: number
  height_cm?: number; weight_kg?: number
}

interface Tactic {
  play_style: number; scrum_aggression: number
  lineout_aggression: number; tempo: number
}

interface TeamData {
  clubId: string
  players: Player[]
  tactic: Tactic
  isHome: boolean
  isBot: boolean
  perfPenalty: number
}

interface MatchEvent {
  match_id: string
  event_type: string
  club_id: string | null
  player_id: string | null
  game_minute: number
  display_at: string
  home_score: number
  away_score: number
  description: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const rand    = (min: number, max: number) => Math.random() * (max - min) + min
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1))
const pick    = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const avg     = (vals: number[]) => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 50
const clamp   = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))

const FORWARD_POS = ['PROP','HOOKER','LOCK','FLANKER','NUMBER_8']
const BACK_POS    = ['SCRUM_HALF','FLY_HALF','CENTER','WING','FULL_BACK']
const normalPos   = (p: string) => (p ?? '').toUpperCase().replace(/[-\s]/g, '_')

// ✅ primary_position (au lieu de position)
function isForward(p: Player) { return FORWARD_POS.includes(normalPos(p.primary_position)) }
function isBack(p: Player)    { return BACK_POS.includes(normalPos(p.primary_position)) }
function byPos(ps: Player[], pred: (p: Player) => boolean) { return ps.filter(pred) }

// ─── Gabarit (taille/poids) ────────────────────────────────────────────────────
// Impact léger sur le match uniquement (rien n'est modifié en base) : un pilier
// trop grand ou trop léger perd un peu de puissance en mêlée, un ailier trop
// lourd perd un peu de vitesse en attaque. Chaque poste a une fourchette idéale ;
// rester dedans ne change rien, s'en écarter coûte jusqu'à 8%.
const IDEAL_BUILD: Record<string, { height: [number, number]; weight: [number, number] }> = {
  PROP:       { height: [178, 192], weight: [108, 128] },
  HOOKER:     { height: [175, 188], weight: [100, 118] },
  LOCK:       { height: [196, 210], weight: [108, 122] },
  FLANKER:    { height: [185, 197], weight: [98, 112] },
  NUMBER_8:   { height: [188, 200], weight: [102, 116] },
  SCRUM_HALF: { height: [168, 180], weight: [75, 88] },
  FLY_HALF:   { height: [176, 188], weight: [82, 94] },
  CENTER:     { height: [180, 193], weight: [90, 104] },
  WING:       { height: [178, 193], weight: [82, 96] },
  FULL_BACK:  { height: [178, 191], weight: [84, 98] },
}
const MORPHOLOGY_MAX_PENALTY = 0.08

function deviationFraction(value: number, [lo, hi]: [number, number]): number {
  if (value >= lo && value <= hi) return 0
  const span = (hi - lo) / 2
  const dist = value < lo ? lo - value : value - hi
  return clamp(dist / span, 0, 1)
}

function morphologyFactor(p: Player): number {
  const ideal = IDEAL_BUILD[normalPos(p.primary_position)]
  if (!ideal || !p.height_cm || !p.weight_kg) return 1
  const dev = (deviationFraction(p.height_cm, ideal.height) + deviationFraction(p.weight_kg, ideal.weight)) / 2
  return 1 - dev * MORPHOLOGY_MAX_PENALTY
}

// ─── Score d'équipe ───────────────────────────────────────────────────────────

function teamScores(team: TeamData) {
  const { players, tactic, isBot, perfPenalty, isHome } = team
  const fwd = byPos(players, isForward)
  const bk  = byPos(players, isBack)
  const all = players

  const scrum_agg   = tactic.scrum_aggression / 100
  const lineout_agg = tactic.lineout_aggression / 100
  const play_style  = tactic.play_style / 100
  const tempo       = tactic.tempo / 100

  const avgEnergy  = avg(all.map((p) => p.energy))
  const energyMult = avgEnergy >= 50 ? 1 : 0.7 + (avgEnergy / 50) * 0.3
  const botMult    = isBot ? (1 - perfPenalty / 100) : 1
  const homeMult   = isHome ? 1.05 : 1

  const base = {
    scrum:   avg([...fwd.map((p) => p.scrum), ...fwd.map((p) => p.strength * morphologyFactor(p))]) * (0.7 + scrum_agg * 0.6),
    lineout: avg([...fwd.map((p) => p.lineout), ...fwd.map((p) => p.agility)]) * (0.7 + lineout_agg * 0.6),
    attack:  avg([...bk.map((p) => p.breaking), ...bk.map((p) => p.passing), ...bk.map((p) => p.speed * morphologyFactor(p))])
             * (0.8 + play_style * 0.4) * (0.8 + tempo * 0.4),
    defense: avg([...all.map((p) => p.tackling), ...all.map((p) => p.def_reading), ...all.map((p) => p.discipline)]),
    kicking: avg([...bk.slice(0, 3).map((p) => p.kicking), ...bk.slice(0, 3).map((p) => p.composure)])
             * (0.5 + (1 - play_style) * 1.0),
  }

  const mult = energyMult * botMult * homeMult
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, clamp(v * mult, 1, 120)])) as typeof base
}

// ─── Descriptions ─────────────────────────────────────────────────────────────

function tryDescriptions(teamName: string, scorer?: string): string[] {
  return [
    `Essai de ${scorer ?? 'l\'équipe'} pour ${teamName} !`,
    `${teamName} marque dans le coin — essai ${scorer ? 'de ' + scorer : 'collectif'} !`,
    `Belle action collective de ${teamName}, essai ${scorer ? 'de ' + scorer : ''} !`,
    `${scorer ?? teamName} aplatit dans les 22 mètres adverses — essai !`,
  ]
}

function penaltyDescriptions(teamName: string): string[] {
  return [
    `Pénalité accordée à ${teamName}, coup de pied entre les poteaux.`,
    `${teamName} opte pour les trois points — pénalité réussie.`,
    `L'arbitre siffle la faute, ${teamName} convertit la pénalité.`,
  ]
}

const TURNOVER_DESC = [
  'Ballon récupéré après un maul. Le jeu continue.',
  'Interception au ruck — changement de possession.',
  'En-avant adverse — mêlée introduite.',
]

const CARD_YELLOW_DESC = (team: string, p?: string) =>
  `Carton jaune pour ${p ?? 'un joueur'} de ${team} — dix minutes de suspension.`

const CARD_RED_DESC = (team: string, p?: string) =>
  `Carton rouge ! ${p ?? 'Un joueur'} de ${team} est exclu définitivement.`

const INJURY_DESC = (team: string, p?: string) =>
  `Blessure pour ${p ?? 'un joueur'} de ${team} — sortie du terrain.`

// ─── Moteur de simulation ─────────────────────────────────────────────────────

function simulateMatch(
  matchId: string,
  home: TeamData,
  away: TeamData,
  scheduledAt: string,
  isFriendly: boolean,
) {
  const hs = teamScores(home)
  const as = teamScores(away)

  const avgTempo = (home.tactic.tempo + away.tactic.tempo) / 2
  const phases   = randInt(55, 75) + Math.round(avgTempo / 10)

  let homeScore = 0
  let awayScore = 0
  const events: Omit<MatchEvent, 'match_id'>[] = []
  const startTime = new Date(scheduledAt).getTime()

  const displayAt = (gameMin: number) => {
    const ms = (gameMin / 80) * 80 * 60 * 1000
    return new Date(startTime + ms).toISOString()
  }

  const addEvent = (
    minute: number, type: string, clubId: string | null, playerId: string | null,
    desc: string, hs: number, as: number,
  ) => {
    events.push({ event_type: type, club_id: clubId, player_id: playerId,
      game_minute: minute, display_at: displayAt(minute),
      home_score: hs, away_score: as, description: desc })
  }

  const usedMinutes = new Set<number>()
  const nextMinute = (approx: number) => {
    let m = Math.min(79, Math.max(1, approx + randInt(-1, 1)))
    while (usedMinutes.has(m)) m = (m + 1) % 80
    usedMinutes.add(m)
    return m
  }

  const homePlayers = home.players
  const awayPlayers = away.players

  for (let i = 0; i < phases; i++) {
    const approxMin = Math.round((i / phases) * 78) + 1
    const homePossScore = hs.attack * 0.5 + hs.kicking * 0.3 + rand(0, 20)
    const awayPossScore = as.attack * 0.5 + as.kicking * 0.3 + rand(0, 20)
    const homeHasBall   = homePossScore >= awayPossScore

    const teamScore = homeHasBall ? hs : as
    const oppScore  = homeHasBall ? as : hs
    const players   = homeHasBall ? homePlayers : awayPlayers
    const club      = homeHasBall ? home.clubId : away.clubId

    const r = Math.random() * 100
    const phaseType = r < 50 ? 'open' : r < 65 ? 'scrum' : r < 80 ? 'lineout' : r < 94 ? 'penalty' : 'other'
    const minute = nextMinute(approxMin)

    if (phaseType === 'open') {
      const attackVal = teamScore.attack * rand(0.8, 1.2)
      const defVal    = oppScore.defense * rand(0.8, 1.2)
      if (attackVal > defVal * 0.85) {
        // ✅ primary_position pour le ouvreur
        const scorer = pick(players.filter(isBack).length ? players.filter(isBack) : players)
        homeHasBall ? homeScore += 5 : awayScore += 5
        addEvent(minute, 'try', club, scorer.id,
          pick(tryDescriptions(homeHasBall ? 'domicile' : 'extérieur', scorer.id.slice(-4))),
          homeScore, awayScore)

        const kicker = players.find((p) => normalPos(p.primary_position) === 'FLY_HALF') ?? pick(players)
        const kickChance = clamp(kicker.kicking / 100 * 0.9 + 0.2, 0.2, 0.95)
        if (Math.random() < kickChance) {
          homeHasBall ? homeScore += 2 : awayScore += 2
          const m2 = nextMinute(minute + 1)
          addEvent(m2, 'conversion', club, kicker.id, 'Transformation réussie.', homeScore, awayScore)
        }
      } else if (Math.random() < 0.25) {
        addEvent(minute, 'turnover', null, null, pick(TURNOVER_DESC), homeScore, awayScore)
      }
    }

    if (phaseType === 'scrum') {
      const scrumVal = teamScore.scrum * rand(0.8, 1.2)
      const oppScrum = oppScore.scrum * rand(0.8, 1.2)
      if (scrumVal > oppScrum * 1.15 && Math.random() < 0.5) {
        homeHasBall ? homeScore += 3 : awayScore += 3
        addEvent(minute, 'penalty_goal', club, null,
          pick(penaltyDescriptions(homeHasBall ? 'domicile' : 'extérieur')), homeScore, awayScore)
      }
    }

    if (phaseType === 'lineout') {
      const lineoutVal = teamScore.lineout * rand(0.8, 1.2)
      const oppLineout = oppScore.lineout * rand(0.8, 1.2)
      if (lineoutVal > oppLineout && Math.random() < 0.3 && Math.random() < 0.35) {
        homeHasBall ? homeScore += 5 : awayScore += 5
        const scorer = pick(players.filter(isForward).length ? players.filter(isForward) : players)
        addEvent(minute, 'try', club, scorer.id,
          `Essai après maul sur touche pour ${homeHasBall ? 'l\'équipe à domicile' : 'les visiteurs'} !`,
          homeScore, awayScore)
        if (Math.random() < 0.7) {
          homeHasBall ? homeScore += 2 : awayScore += 2
          const m2 = nextMinute(minute + 1)
          addEvent(m2, 'conversion', club, null, 'Transformation réussie.', homeScore, awayScore)
        }
      }
    }

    if (phaseType === 'penalty') {
      const disciplineAvg = avg(players.map((p) => p.discipline))
      const foulChance = clamp(1 - disciplineAvg / 100, 0.1, 0.7)
      if (Math.random() < foulChance) {
        const beneficiary = homeHasBall ? away : home
        const benefPlayers = homeHasBall ? awayPlayers : homePlayers
        const kicker = benefPlayers.find((p) => normalPos(p.primary_position) === 'FLY_HALF') ?? pick(benefPlayers)
        const kickChance = clamp(kicker.kicking / 100 * 0.85 + 0.1, 0.2, 0.95)
        if (Math.random() < kickChance) {
          homeHasBall ? awayScore += 3 : homeScore += 3
          addEvent(minute, 'penalty_goal', beneficiary.clubId, kicker.id,
            pick(penaltyDescriptions(!homeHasBall ? 'domicile' : 'extérieur')), homeScore, awayScore)
        }
        if (Math.random() < 0.08) {
          const culprit = pick(players)
          addEvent(nextMinute(minute + 1), 'yellow_card', club, culprit.id,
            CARD_YELLOW_DESC(homeHasBall ? 'domicile' : 'extérieur', culprit.id.slice(-4)), homeScore, awayScore)
        }
        if (Math.random() < 0.015) {
          const culprit = pick(players)
          addEvent(nextMinute(minute + 1), 'red_card', club, culprit.id,
            CARD_RED_DESC(homeHasBall ? 'domicile' : 'extérieur', culprit.id.slice(-4)), homeScore, awayScore)
        }
      }
    }

    if (Math.random() < (isFriendly ? 0.008 : 0.015)) {
      const injured = pick(players)
      addEvent(nextMinute(approxMin), 'injury', club, injured.id,
        INJURY_DESC(homeHasBall ? 'domicile' : 'extérieur', injured.id.slice(-4)), homeScore, awayScore)
    }
  }

  if (Math.random() < 0.3) {
    const isHomeKick = Math.random() < 0.5
    const dropClub   = isHomeKick ? home.clubId : away.clubId
    const kicker = (isHomeKick ? homePlayers : awayPlayers)
      .find((p) => normalPos(p.primary_position) === 'FLY_HALF')
    if (kicker && clamp(kicker.kicking * rand(0.8, 1.2), 1, 100) > 55) {
      const minute = nextMinute(randInt(20, 75))
      isHomeKick ? homeScore += 3 : awayScore += 3
      addEvent(minute, 'drop_goal', dropClub, kicker.id,
        `Drop réussi ! ${isHomeKick ? 'L\'équipe à domicile' : 'Les visiteurs'} marquent 3 points.`,
        homeScore, awayScore)
    }
  }

  events.sort((a, b) => a.game_minute - b.game_minute)
  events.push({
    event_type: 'final_whistle', club_id: null, player_id: null,
    game_minute: 80, display_at: displayAt(80),
    home_score: homeScore, away_score: awayScore,
    description: `Coup de sifflet final. Score : ${homeScore} – ${awayScore}.`,
  })

  return { homeScore, awayScore, events }
}

// ─── Calcul des standings ─────────────────────────────────────────────────────

function standingsDelta(homeScore: number, awayScore: number, homeTries: number, awayTries: number) {
  const homeWin = homeScore > awayScore
  const awayWin = awayScore > homeScore
  const draw    = homeScore === awayScore
  const margin  = Math.abs(homeScore - awayScore)

  return {
    home: {
      played: 1,
      won:    homeWin ? 1 : 0,    // ✅ était wins
      drawn:  draw ? 1 : 0,       // ✅ était draws
      lost:   awayWin ? 1 : 0,    // ✅ était losses
      points_for:     homeScore,
      points_against: awayScore,
      ranking_points: homeWin ? 4 : draw ? 2 : 0,  // ✅ était points
      bonus_attack:   homeTries >= 4 ? 1 : 0,
      bonus_defense:  !homeWin && margin <= 7 ? 1 : 0,
    },
    away: {
      played: 1,
      won:    awayWin ? 1 : 0,
      drawn:  draw ? 1 : 0,
      lost:   homeWin ? 1 : 0,
      points_for:     awayScore,
      points_against: homeScore,
      ranking_points: awayWin ? 4 : draw ? 2 : 0,
      bonus_attack:   awayTries >= 4 ? 1 : 0,
      bonus_defense:  !awayWin && margin <= 7 ? 1 : 0,
    },
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { match_id } = await req.json()
    if (!match_id) throw new Error('match_id requis')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: match, error: mErr } = await supabase
      .from('matches')
      .select('*')
      .eq('id', match_id)
      .single()
    if (mErr || !match) throw mErr ?? new Error('Match introuvable')
    if (match.status === 'completed') throw new Error('Match déjà simulé')

    // ✅ is_friendly remplacé : un match sans league_season_id est un amical
    const isFriendly = match.league_season_id === null

    const { data: lineupRows } = await supabase
      .from('match_lineups')
      .select('club_id, player_id, shirt_number, is_starter')
      .eq('match_id', match_id)

    const homeLineup = (lineupRows ?? []).filter((r) => r.club_id === match.home_club_id)
    const awayLineup = (lineupRows ?? []).filter((r) => r.club_id === match.away_club_id)

    const allPlayerIds = (lineupRows ?? []).map((r) => r.player_id)
    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .in('id', allPlayerIds.length ? allPlayerIds : ['none'])

    const playerById = Object.fromEntries((playersData ?? []).map((p) => [p.id, p]))

    const mapLineup = (lineup: typeof homeLineup): Player[] =>
      lineup.filter((r) => r.is_starter).map((r) => playerById[r.player_id]).filter(Boolean)

    const homePlayers = mapLineup(homeLineup)
    const awayPlayers = mapLineup(awayLineup)

    const autoPlayers = async (clubId: string): Promise<Player[]> => {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('club_id', clubId)
        .limit(15)
      return (data ?? []).slice(0, 15)
    }

    const finalHomePlayers = homePlayers.length >= 10 ? homePlayers : await autoPlayers(match.home_club_id)
    const finalAwayPlayers = awayPlayers.length >= 10 ? awayPlayers : await autoPlayers(match.away_club_id)

    const defaultTactic: Tactic = { play_style: 50, scrum_aggression: 50, lineout_aggression: 50, tempo: 50 }

    const loadTactic = async (clubId: string): Promise<Tactic> => {
      const { data } = await supabase
        .from('tactics')
        .select('play_style, scrum_aggression, lineout_aggression, tempo')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .maybeSingle()
      return data ?? defaultTactic
    }

    const [homeTactic, awayTactic] = await Promise.all([
      loadTactic(match.home_club_id),
      loadTactic(match.away_club_id),
    ])

    const { data: clubsData } = await supabase
      .from('clubs')
      .select('id, is_bot, performance_penalty, balance, reputation, stadium_level')
      .in('id', [match.home_club_id, match.away_club_id])

    const clubMap  = Object.fromEntries((clubsData ?? []).map((c) => [c.id, c]))
    const homeClub = clubMap[match.home_club_id] ?? {}
    const awayClub = clubMap[match.away_club_id] ?? {}

    const homeTeam: TeamData = {
      clubId: match.home_club_id, players: finalHomePlayers, tactic: homeTactic,
      isHome: true, isBot: homeClub.is_bot ?? false, perfPenalty: homeClub.performance_penalty ?? 8,
    }
    const awayTeam: TeamData = {
      clubId: match.away_club_id, players: finalAwayPlayers, tactic: awayTactic,
      isHome: false, isBot: awayClub.is_bot ?? false, perfPenalty: awayClub.performance_penalty ?? 8,
    }

    const { homeScore, awayScore, events } = simulateMatch(
      match_id, homeTeam, awayTeam, match.scheduled_at, isFriendly,
    )

    const eventRows = events.map((e) => ({ ...e, match_id }))
    await supabase.from('match_events').insert(eventRows)

    const homeTries = events.filter((e) => e.event_type === 'try' && e.club_id === match.home_club_id).length
    const awayTries = events.filter((e) => e.event_type === 'try' && e.club_id === match.away_club_id).length

    await supabase.from('matches').update({
      home_score:   homeScore,
      away_score:   awayScore,
      home_tries:   homeTries,
      away_tries:   awayTries,
      status:       'completed',
      simulated_at: new Date().toISOString(),
    }).eq('id', match_id)

    // ✅ Standings : won/drawn/lost/ranking_points + bonus_attack/bonus_defense séparés
    if (!isFriendly && match.league_season_id) {
      const delta = standingsDelta(homeScore, awayScore, homeTries, awayTries)

      for (const [side, d] of [['home', delta.home], ['away', delta.away]] as const) {
        const clubId = side === 'home' ? match.home_club_id : match.away_club_id
        const { data: standing } = await supabase
          .from('standings')
          .select('*')
          .eq('club_id', clubId)
          .eq('league_season_id', match.league_season_id)
          .single()

        if (standing) {
          await supabase.from('standings').update({
            played:         (standing.played         ?? 0) + d.played,
            won:            (standing.won            ?? 0) + d.won,
            drawn:          (standing.drawn          ?? 0) + d.drawn,
            lost:           (standing.lost           ?? 0) + d.lost,
            points_for:     (standing.points_for     ?? 0) + d.points_for,
            points_against: (standing.points_against ?? 0) + d.points_against,
            ranking_points: (standing.ranking_points ?? 0) + d.ranking_points + d.bonus_attack + d.bonus_defense,
            bonus_attack:   (standing.bonus_attack   ?? 0) + d.bonus_attack,
            bonus_defense:  (standing.bonus_defense  ?? 0) + d.bonus_defense,
          }).eq('id', standing.id)
        }
      }
    }

    // Énergie post-match
    const energyDrain = isFriendly ? 15 : randInt(30, 50)
    for (const p of [...finalHomePlayers, ...finalAwayPlayers]) {
      const newEnergy = Math.max(0, (p.energy ?? 80) - energyDrain)
      await supabase.from('players').update({ energy: newEnergy }).eq('id', p.id)
    }

    // Billetterie : revenu pour l'équipe à domicile, dépendant de la capacité
    // du stade et de l'affluence (réputation + variance légère).
    // ⚠️ Formule dupliquée (avec ce même commentaire) dans src/lib/finance.js
    {
      const capacity        = 3000 + (homeClub.stadium_level ?? 1) * 1500
      const attendanceRate  = clamp(0.45 + (homeClub.reputation ?? 50) / 250 + rand(-0.05, 0.05), 0.35, 0.95)
      const rateMultiplier  = isFriendly ? 0.3 : 1
      const ticketRevenue   = Math.round(capacity * attendanceRate * 15 * rateMultiplier)

      if (ticketRevenue > 0) {
        // ✅ 'ticket_revenue' (pas 'ticket') : seule valeur valide de l'enum transaction_type
        await supabase.from('transactions').insert({
          club_id: match.home_club_id,
          type: 'ticket_revenue',
          amount: ticketRevenue,
          description: isFriendly ? 'Billetterie — match amical' : 'Billetterie — match de championnat',
        })
        await supabase.from('clubs')
          .update({ balance: (homeClub.balance ?? 0) + ticketRevenue })
          .eq('id', match.home_club_id)
      }
    }

    return new Response(
      JSON.stringify({ ok: true, home_score: homeScore, away_score: awayScore, events: events.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

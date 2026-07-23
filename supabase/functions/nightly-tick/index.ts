import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const clamp   = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
const randInt = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo

const ALL_STATS = [
  'endurance','strength','agility','speed','passing','kicking',
  'scrum','lineout','rucking','tackling','breaking','def_reading',
  'discipline','composure',
] as const

// ✅ Calcul de l'âge depuis date_of_birth (pas de colonne age)
function computeAge(dateOfBirth: string | null): number {
  if (!dateOfBirth) return 25
  const today = new Date()
  const dob   = new Date(dateOfBirth)
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

// ✅ Vrai anniversaire aujourd'hui
function isBirthdayToday(dateOfBirth: string | null): boolean {
  if (!dateOfBirth) return false
  const today = new Date()
  const dob   = new Date(dateOfBirth)
  return today.getMonth() === dob.getMonth() && today.getDate() === dob.getDate()
}

function ageFactor(age: number): number {
  if (age <= 22) return 1.5
  if (age <= 28) return 1.0
  if (age <= 32) return 0.6
  return 0.3
}

function capFactor(current: number, initialStat: number): number {
  const cap = Math.min(99, initialStat + 40)
  if (current >= cap) return 0
  return Math.max(0, (cap - current) / 40)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const today         = new Date()
  const todayStr      = today.toISOString().slice(0, 10)
  const isSunday      = today.getUTCDay() === 0
  const isFirstOfMonth = today.getUTCDate() === 1
  const log: string[] = []

  try {

    // ── Pré-charger les club IDs des bots (is_bot est sur clubs, pas players) ──
    const { data: botClubs } = await supabase.from('clubs').select('id').eq('is_bot', true)
    const botClubIds = new Set((botClubs ?? []).map((c) => c.id))

    // ── 1. Blessures ──────────────────────────────────────────────────────────
    {
      // ✅ filtrage par injury_days_left > 0, pas is_injured
      const { data: injured } = await supabase
        .from('players')
        .select('id, injury_days_left, club_id')
        .gt('injury_days_left', 0)

      for (const p of injured ?? []) {
        if (botClubIds.has(p.club_id)) continue  // ✅ bots via club_id
        const newDays = Math.max(0, (p.injury_days_left ?? 0) - 1)
        // ✅ pas de is_injured : dérivé de injury_days_left côté lecture
        await supabase.from('players').update({ injury_days_left: newDays }).eq('id', p.id)
      }
      log.push(`Blessures: ${(injured ?? []).length} joueurs traités`)
    }

    // ── 2. Entraînement + énergie ─────────────────────────────────────────────
    {
      // ✅ target_group au lieu de program_type
      const { data: plans } = await supabase
        .from('training_plans')
        .select('club_id, target_group, focus_stats')

      // ✅ filtrage par injury_days_left = 0 au lieu de is_injured = false
      const { data: allPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('injury_days_left', 0)

      const playersByClub: Record<string, typeof allPlayers> = {}
      for (const p of allPlayers ?? []) {
        if (!playersByClub[p.club_id]) playersByClub[p.club_id] = []
        playersByClub[p.club_id]!.push(p)
      }

      const FORWARD_POS = ['PROP','HOOKER','LOCK','FLANKER','NUMBER_8']
      const BACK_POS    = ['SCRUM_HALF','FLY_HALF','CENTER','WING','FULLBACK']
      const HALF_POS    = ['SCRUM_HALF','FLY_HALF']
      const normalPos   = (pos: string) => (pos ?? '').toUpperCase().replace(/[-\s]/g, '_')

      // ✅ valeurs enum : forwards/backs/halfbacks au lieu de avants/arrieres/charniere
      const matchesGroup = (primaryPos: string, targetGroup: string): boolean => {
        const p = normalPos(primaryPos)
        if (targetGroup === 'forwards')  return FORWARD_POS.includes(p)
        if (targetGroup === 'backs')     return BACK_POS.includes(p) && !HALF_POS.includes(p)
        if (targetGroup === 'halfbacks') return HALF_POS.includes(p)
        return false
      }

      const slotsByClub: Record<string, number> = {}
      for (const plan of plans ?? []) {
        const total = Object.values(plan.focus_stats ?? {}).reduce((a: number, b) => a + (b as number), 0)
        slotsByClub[plan.club_id] = (slotsByClub[plan.club_id] ?? 0) + total
      }

      for (const plan of plans ?? []) {
        const clubPlayers = playersByClub[plan.club_id] ?? []
        const focusStats  = plan.focus_stats ?? {}
        const isBot       = botClubIds.has(plan.club_id)  // ✅ via club

        for (const player of clubPlayers) {
          // ✅ primary_position au lieu de position
          if (!matchesGroup(player.primary_position, plan.target_group)) continue

          if (isBot) {
            const updates: Record<string, number> = {}
            for (const stat of ALL_STATS) {
              const slots = (focusStats[stat] ?? 0) as number
              if (slots === 0) continue
              updates[stat] = clamp((player[stat] ?? 0) + slots * 0.2)
            }
            if (Object.keys(updates).length) {
              await supabase.from('players').update(updates).eq('id', player.id)
            }
            continue
          }

          const statUpdates: Record<string, number> = {}
          // ✅ age calculé depuis date_of_birth
          const age = computeAge(player.date_of_birth)
          // ✅ initial_stats est un jsonb, pas des colonnes individuelles
          const initialStats = player.initial_stats ?? {}

          for (const stat of ALL_STATS) {
            const slots = (focusStats[stat] ?? 0) as number
            if (slots === 0) continue
            const current     = player[stat] ?? 0
            const initialStat = (initialStats[stat] ?? current) as number
            const gain        = slots * 0.3 * ageFactor(age) * capFactor(current, initialStat)
            statUpdates[stat] = clamp(current + gain)
          }
          if (Object.keys(statUpdates).length) {
            await supabase.from('players').update(statUpdates).eq('id', player.id)
          }
        }
      }

      const { data: energyPlayers } = await supabase
        .from('players')
        .select('id, energy, club_id')

      for (const p of energyPlayers ?? []) {
        const totalSlots = slotsByClub[p.club_id] ?? 0
        const newEnergy  = clamp((p.energy ?? 100) - totalSlots * 3 + 15)
        await supabase.from('players').update({ energy: newEnergy }).eq('id', p.id)
      }

      log.push(`Entraînement: ${allPlayers?.length ?? 0} joueurs traités`)
    }

    // ── 3. Contrats expirés ───────────────────────────────────────────────────
    {
      // ✅ is_active = true au lieu de status = 'active'
      const { data: expired } = await supabase
        .from('contracts')
        .select('id, player_id, club_id')
        .eq('is_active', true)
        .lte('end_date', todayStr)

      for (const c of expired ?? []) {
        // ✅ is_active = false au lieu de status = 'expired'
        await supabase.from('contracts').update({ is_active: false }).eq('id', c.id)
        await supabase.from('players').update({ club_id: null }).eq('id', c.player_id)
      }
      log.push(`Contrats: ${(expired ?? []).length} expirés`)
    }

    // ── 4. Finances mensuelles (1er du mois) ──────────────────────────────────
    if (isFirstOfMonth) {
      const { data: clubs } = await supabase
        .from('clubs')
        .select('id, balance, reputation, supporters_count, is_bot')

      for (const club of clubs ?? []) {
        // ✅ monthly_salary au lieu de salary, is_active = true au lieu de status = 'active'
        const { data: contracts } = await supabase
          .from('contracts')
          .select('monthly_salary')
          .eq('club_id', club.id)
          .eq('is_active', true)
        // ✅ monthly_salary
        const totalSalary = (contracts ?? []).reduce((s, c) => s + (c.monthly_salary ?? 0), 0)

        const sponsors      = 25000 + (club.reputation ?? 50) * 400
        const merchandising = (club.supporters_count ?? 1000) * 10
        const maintenance   = 13000
        const fixedCosts    = 5000

        const netFlow    = sponsors + merchandising - totalSalary - maintenance - fixedCosts
        const newBalance = (club.balance ?? 0) + netFlow

        const txRows = [
          { club_id: club.id, type: 'salary',      amount: totalSalary,   description: 'Masse salariale mensuelle' },
          { club_id: club.id, type: 'sponsorship', amount: sponsors,       description: 'Revenus sponsoring mensuel' },
          { club_id: club.id, type: 'merchandise', amount: merchandising,  description: 'Merchandising mensuel' },
          { club_id: club.id, type: 'maintenance', amount: maintenance,    description: 'Entretien du stade' },
          { club_id: club.id, type: 'fixed_costs', amount: fixedCosts,     description: 'Frais fixes mensuels' },
        ].filter((t) => t.amount > 0)

        await supabase.from('transactions').insert(txRows)
        await supabase.from('clubs').update({ balance: newBalance }).eq('id', club.id)
      }
      log.push('Finances: transactions mensuelles générées')
    }

    // ── 5. Vieillissement ─────────────────────────────────────────────────────
    {
      // ✅ pas de colonne age : utiliser date_of_birth
      // Joueurs de 34+ (nés avant today - 34 ans)
      const cutoff34 = new Date()
      cutoff34.setFullYear(cutoff34.getFullYear() - 34)

      const { data: oldPlayers } = await supabase
        .from('players')
        .select('id, date_of_birth, endurance, strength, agility, speed, retired')
        .lte('date_of_birth', cutoff34.toISOString().slice(0, 10))
        .not('retired', 'eq', true)

      for (const p of oldPlayers ?? []) {
        const age = computeAge(p.date_of_birth)

        // Malus physique le jour de l'anniversaire pour les 34+
        if (age >= 34 && isBirthdayToday(p.date_of_birth)) {
          const physStats = ['endurance','strength','agility','speed']
          const toDecrease = physStats.sort(() => Math.random() - 0.5).slice(0, 3)
          const updates: Record<string, number> = {}
          for (const s of toDecrease) {
            updates[s] = Math.max(1, (p[s as keyof typeof p] as number ?? 30) - 1)
          }
          await supabase.from('players').update(updates).eq('id', p.id)
        }

        // Retraite automatique : 36+ avec moyenne physique < 25
        if (age >= 36) {
          const avgPhys = (['endurance','strength','agility','speed'] as const)
            .map((s) => p[s] ?? 0).reduce((a, b) => a + b, 0) / 4
          if (avgPhys < 25) {
            await supabase.from('players').update({ retired: true, club_id: null }).eq('id', p.id)
          }
        }
      }
      log.push('Vieillissement: traité')
    }

    // ── 6. Supporters ─────────────────────────────────────────────────────────
    {
      const { data: clubs } = await supabase
        .from('clubs')
        .select('id, supporters_count, reputation')

      for (const club of clubs ?? []) {
        const { data: recentMatches } = await supabase
          .from('matches')
          .select('home_club_id, away_club_id, home_score, away_score')
          .or(`home_club_id.eq.${club.id},away_club_id.eq.${club.id}`)
          .eq('status', 'completed')
          .order('scheduled_at', { ascending: false })
          .limit(5)

        let formScore = 0
        for (const m of recentMatches ?? []) {
          const isHome   = m.home_club_id === club.id
          const scored   = isHome ? m.home_score : m.away_score
          const conceded = isHome ? m.away_score : m.home_score
          if (scored > conceded)       formScore += 2
          else if (scored === conceded) formScore += 0
          else                          formScore -= 1
        }

        const variation  = formScore * 50 + ((club.reputation ?? 50) - 50) * 5
        const newSupport = Math.max(500, (club.supporters_count ?? 1000) + variation)
        await supabase.from('clubs').update({ supporters_count: Math.round(newSupport) }).eq('id', club.id)
      }
      log.push('Supporters: mis à jour')
    }

    // ── 7. Académie (le dimanche) ─────────────────────────────────────────────
    if (isSunday) {
      // ✅ uniquement pour les clubs non-bot
      const { data: humanClubs } = await supabase.from('clubs').select('id').eq('is_bot', false)

      const POSITIONS    = ['PROP','HOOKER','LOCK','FLANKER','NUMBER_8','SCRUM_HALF','FLY_HALF','CENTER','WING','FULLBACK']
      const NATIONALITIES= ['Français','Anglais','Irlandais','Gallois','Néo-Zélandais','Australien','Argentin','Afrique du Sud','Fidjien','Samoan']
      const FIRST_NAMES  = ['Lucas','Hugo','Nathan','Léo','Théo','Antoine','Maxime','Pierre','Julien','Axel']
      const LAST_NAMES   = ['Martin','Bernard','Thomas','Robert','Richard','Petit','Durand','Simon','Michel','Lefebvre']

      // Date de naissance pour un joueur de 18 ans
      const dob18 = new Date()
      dob18.setFullYear(dob18.getFullYear() - 18)
      const dobStr = dob18.toISOString().slice(0, 10)

      let totalAcademy = 0
      for (const club of humanClubs ?? []) {
        const count = randInt(0, 2)
        if (count === 0) continue
        const newPlayers = Array.from({ length: count }).map(() => ({
          club_id:          club.id,
          primary_position: POSITIONS[randInt(0, POSITIONS.length - 1)],  // ✅ primary_position
          date_of_birth:    dobStr,                                         // ✅ date_of_birth (pas age)
          source:           'academy',
          nationality:      NATIONALITIES[randInt(0, NATIONALITIES.length - 1)],
          first_name:       FIRST_NAMES[randInt(0, FIRST_NAMES.length - 1)],
          last_name:        LAST_NAMES[randInt(0, LAST_NAMES.length - 1)],
          energy:           100,
          // ✅ pas is_injured
          injury_days_left: 0,
          retired:          false,
          initial_stats:    {},  // sera rempli avec les stats générées
          ...Object.fromEntries(
            ALL_STATS.map((s) => [s, randInt(15, 35)])
          ),
        }))
        await supabase.from('players').insert(newPlayers)
        totalAcademy += count
      }
      log.push(`Académie: ${totalAcademy} talents générés`)
    }

    return new Response(
      JSON.stringify({ ok: true, date: todayStr, log }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: (err as Error).message, log }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

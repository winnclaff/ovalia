// Page Ligue — classement + calendrier
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const isCompleted = (m) => m.status === 'completed'
const isLive      = (m) => m.status === 'live' || m.status === 'simulated'

const getRound = (m) => m.match_day ?? 0

const userResult = (m, clubId) => {
  if (!isCompleted(m) || !clubId) return null
  const isHome = m.home_club_id === clubId
  const isAway = m.away_club_id === clubId
  if (!isHome && !isAway) return null
  const scored   = isHome ? m.home_score : m.away_score
  const conceded = isHome ? m.away_score : m.home_score
  if (scored > conceded) return 'W'
  if (scored < conceded) return 'L'
  return 'D'
}

// ─── Standings component ──────────────────────────────────────────────────────

function StandingsTable({ standings, userClubId }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="league-table">
        <thead>
          <tr>
            <th style={{ width: 36, textAlign: 'center' }}>#</th>
            <th>Club</th>
            <th title="Matchs joués">J</th>
            <th title="Victoires">V</th>
            <th title="Nuls">N</th>
            <th title="Défaites">D</th>
            <th title="Points marqués">Pm</th>
            <th title="Points encaissés">Pe</th>
            <th title="Différence de points">+/-</th>
            <th title="Points de classement">Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => {
            const isUser = s.club_id === userClubId
            const pm     = s.points_for    ?? 0
            const pe     = s.points_against ?? 0
            const diff   = pm - pe
            return (
              <tr key={s.id ?? s.club_id} className={`league-row${isUser ? ' league-row-user' : ''}`}>
                <td className="league-rank">{i + 1}</td>
                <td className="league-club-name">
                  {s.clubs?.name ?? s.club_name ?? '—'}
                  {isUser && <span className="you-badge">vous</span>}
                </td>
                <td>{s.played    ?? '—'}</td>
                <td className="col-win">{s.won    ?? '—'}</td>
                <td className="col-draw">{s.drawn  ?? '—'}</td>
                <td className="col-loss">{s.lost ?? '—'}</td>
                <td>{pm || '—'}</td>
                <td>{pe || '—'}</td>
                <td className={diff >= 0 ? 'col-pos' : 'col-neg'}>
                  {pm || pe ? (diff >= 0 ? `+${diff}` : diff) : '—'}
                </td>
                <td className="league-pts">{s.ranking_points ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Schedule component ───────────────────────────────────────────────────────

function ScheduleView({ matches, clubsById, userClubId, currentRound }) {
  const currentRef = useRef(null)

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return (
    <div className="schedule-list">
      {Array.from({ length: 14 }, (_, i) => i + 1).map((round) => {
        const roundMatches = matches.filter((m) => getRound(m) === round)
        const isCurrent = round === currentRound
        const isDone    = roundMatches.length > 0 && roundMatches.every(isCompleted)
        const hasLive   = roundMatches.some(isLive)

        return (
          <div
            key={round}
            ref={isCurrent ? currentRef : null}
            className={`round-section${isCurrent ? ' round-current' : ''}`}
          >
            <div className="round-header">
              <div className="round-header-left">
                <span className="round-number">J{round}</span>
                <span className="round-label">Journée {round}</span>
                {hasLive && <span className="badge-current">En cours</span>}
              </div>
              {isDone && <span className="round-done-label">Terminée</span>}
            </div>

            {roundMatches.length === 0 ? (
              <p className="round-empty">Aucun match programmé</p>
            ) : (
              <div className="round-matches">
                {roundMatches.map((m) => {
                  const home      = clubsById[m.home_club_id]
                  const away      = clubsById[m.away_club_id]
                  const played    = isCompleted(m)
                  const userMatch = m.home_club_id === userClubId || m.away_club_id === userClubId
                  const result    = userResult(m, userClubId)

                  return (
                    <div key={m.id} className={`match-row${userMatch ? ' match-row-user' : ''}`}>
                      <span className={`match-team home${m.home_club_id === userClubId ? ' match-you' : ''}`}>
                        {home?.name ?? '—'}
                      </span>

                      <span className="match-score-cell">
                        {played ? (
                          <span className="match-score">
                            {m.home_score} <span className="score-sep">–</span> {m.away_score}
                          </span>
                        ) : (
                          <span className="match-vs">vs</span>
                        )}
                      </span>

                      <span className={`match-team away${m.away_club_id === userClubId ? ' match-you' : ''}`}>
                        {away?.name ?? '—'}
                      </span>

                      {userMatch && result && (
                        <span className={`result-pill rp-${result.toLowerCase()}`}>
                          {result === 'W' ? 'V' : result === 'L' ? 'D' : 'N'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function Ligue({ session }) {
  const navigate = useNavigate()
  const [tab, setTab]           = useState('standings')
  const [userClub, setUserClub] = useState(null)
  const [leagueName, setLeagueName] = useState('')
  const [standings, setStandings]   = useState([])
  const [matches, setMatches]       = useState([])
  const [clubsById, setClubsById]   = useState({})
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    // 1. Club de l'utilisateur — on récupère league_id directement (source de vérité)
    const { data: club } = await supabase
      .from('clubs')
      .select('id, name, league_id, leagues(id, name, tier)')
      .eq('owner_user_id', session.user.id)
      .single()

    if (!club) { navigate('/create-club', { replace: true }); return }
    setUserClub(club)

    if (!club.league_id) {
      setError("Ce club n'est pas encore inscrit dans une ligue.")
      setLoading(false)
      return
    }

    const league = club.leagues
    setLeagueName(
      league?.name
        ? `${league.name}${league.tier ? ` — Division ${league.tier}` : ''}`
        : 'Ma ligue'
    )

    // 2. Saison active de cette ligue
    const { data: activeSeason, error: seasonErr } = await supabase
      .from('league_seasons')
      .select('id, season_number, status')
      .eq('league_id', club.league_id)
      .eq('status', 'in_progress')
      .order('season_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (seasonErr || !activeSeason) {
      setError("Aucune saison active dans cette ligue.")
      setLoading(false)
      return
    }

    const lsId = activeSeason.id

    // 3. Classement de la saison
    const { data: allStandings } = await supabase
      .from('standings')
      .select('*, clubs(id, name, primary_color, secondary_color)')
      .eq('league_season_id', lsId)
      .order('ranking_points', { ascending: false })

    setStandings(allStandings ?? [])

    // 4. Map des clubs pour le calendrier
    const map = {}
    ;(allStandings ?? []).forEach((s) => { if (s.clubs) map[s.clubs.id] = s.clubs })
    setClubsById(map)

    // 5. Matchs de la saison
    const { data: allMatches } = await supabase
      .from('matches')
      .select('*')
      .eq('league_season_id', lsId)
      .order('match_day', { ascending: true, nullsFirst: false })

    setMatches(allMatches ?? [])
    setLoading(false)
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  const currentRound = (() => {
    for (let r = 1; r <= 14; r++) {
      const rMatches = matches.filter((m) => getRound(m) === r)
      if (rMatches.length && !rMatches.every(isCompleted)) return r
    }
    return 14
  })()

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">

        <div className="page-title-row">
          <h2 className="page-title">Ligue</h2>
          {leagueName && <span className="page-subtitle">{leagueName}</span>}
        </div>

        <div className="tab-bar">
          <button
            className={`tab-btn${tab === 'standings' ? ' active' : ''}`}
            onClick={() => setTab('standings')}
          >
            Classement
          </button>
          <button
            className={`tab-btn${tab === 'schedule' ? ' active' : ''}`}
            onClick={() => setTab('schedule')}
          >
            Calendrier
            {currentRound <= 14 && (
              <span className="tab-badge">J{currentRound}</span>
            )}
          </button>
        </div>

        {loading && <p style={{ color: '#888', padding: '12px 0' }}>Chargement…</p>}

        {!loading && error && (
          <div className="card">
            <p style={{ color: '#888', textAlign: 'center', padding: 16 }}>{error}</p>
          </div>
        )}

        {!loading && !error && tab === 'standings' && (
          <StandingsTable standings={standings} userClubId={userClub?.id} />
        )}

        {!loading && !error && tab === 'schedule' && (
          <ScheduleView
            matches={matches}
            clubsById={clubsById}
            userClubId={userClub?.id}
            currentRound={currentRound}
          />
        )}

      </div>
    </Layout>
  )
}

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import ClubLink from '../components/ClubLink'

const EVENT_ICONS = {
  try:           '🏉',
  conversion:    '✅',
  penalty_goal:  '🎯',
  drop_goal:     '🎯',
  yellow_card:   '🟡',
  red_card:      '🔴',
  injury:        '🚑',
  substitution:  '🔄',
  turnover:      '↩️',
  final_whistle: '🏁',
  default:       '•',
}

const EVENT_POINTS = { try: 5, conversion: 2, penalty_goal: 3, drop_goal: 3 }

const playerName = (p) => {
  if (!p) return null
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null
}

export default function MatchDetail({ session }) {
  const { matchId } = useParams()
  const navigate = useNavigate()

  const [match, setMatch]     = useState(null)
  const [events, setEvents]   = useState([])
  const [lineups, setLineups] = useState({ home: [], away: [] })
  const [stats, setStats]     = useState({ home: [], away: [] })
  const [playersById, setPlayersById] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => { init() }, [matchId])

  const init = async () => {
    setLoading(true); setError(null)

    const { data: m, error: mErr } = await supabase
      .from('matches')
      .select('*, home_club:clubs!home_club_id(id,name,is_bot), away_club:clubs!away_club_id(id,name,is_bot)')
      .eq('id', matchId)
      .single()

    if (mErr || !m) {
      setError('Match introuvable.')
      setLoading(false)
      return
    }
    setMatch(m)

    let evQuery = supabase
      .from('match_events')
      .select('*')
      .eq('match_id', matchId)
      .order('game_minute', { ascending: true })
    // Match pas terminé : ne montrer que les événements déjà "diffusés"
    if (m.status !== 'completed') {
      evQuery = evQuery.lte('display_at', new Date().toISOString())
    }

    const [{ data: evData }, { data: lineupRows }, { data: statRows }] = await Promise.all([
      evQuery,
      supabase
        .from('match_lineups')
        .select('club_id, player_id, shirt_number, is_starter, players(id, first_name, last_name, primary_position)')
        .eq('match_id', matchId)
        .order('shirt_number', { ascending: true }),
      supabase
        .from('match_player_stats')
        .select('*, players(id, first_name, last_name, primary_position)')
        .eq('match_id', matchId)
        .order('rating', { ascending: false }),
    ])

    setEvents(evData ?? [])

    const pById = {}
    ;(lineupRows ?? []).forEach((r) => { if (r.players) pById[r.players.id] = r.players })
    ;(statRows ?? []).forEach((r) => { if (r.players) pById[r.players.id] = r.players })
    setPlayersById(pById)

    setLineups({
      home: (lineupRows ?? []).filter((r) => r.club_id === m.home_club_id),
      away: (lineupRows ?? []).filter((r) => r.club_id === m.away_club_id),
    })
    setStats({
      home: (statRows ?? []).filter((r) => r.club_id === m.home_club_id),
      away: (statRows ?? []).filter((r) => r.club_id === m.away_club_id),
    })
    setLoading(false)
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  if (loading) {
    return (
      <Layout onLogout={handleLogout}>
        <div className="page-container"><p style={{ color: '#888' }}>Chargement…</p></div>
      </Layout>
    )
  }

  if (error || !match) {
    return (
      <Layout onLogout={handleLogout}>
        <div className="page-container">
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: '#888' }}>{error ?? 'Match introuvable.'}</p>
            <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => navigate(-1)}>Retour</button>
          </div>
        </div>
      </Layout>
    )
  }

  const completed = match.status === 'completed'
  const dateLabel = match.scheduled_at
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(match.scheduled_at))
    : '—'
  const isFriendly = match.league_season_id === null

  // ── Acteurs du match : meilleures notes, toutes équipes confondues ─────────
  const allStats = [...stats.home, ...stats.away]
  const topPerformers = [...allStats]
    .sort((a, b) => Number(b.rating) - Number(a.rating))
    .slice(0, 3)
    .map((s) => ({
      playerId: s.player_id,
      name: playerName(s.players) ?? 'Joueur inconnu',
      rating: Number(s.rating),
      detail: [
        s.tries ? `${s.tries} essai${s.tries > 1 ? 's' : ''}` : null,
        s.points ? `${s.points} pts` : null,
        `${s.tackles} plaq.`,
        `${s.meters_gained} m`,
      ].filter(Boolean).join(' · '),
    }))

  // Repli sur les événements tant qu'un match n'a pas de stats enregistrées
  // (matchs joués avant la mise en place des statistiques individuelles).
  const scorerPoints = {}
  events.forEach((ev) => {
    const pts = EVENT_POINTS[ev.event_type]
    if (!pts || !ev.player_id) return
    scorerPoints[ev.player_id] = (scorerPoints[ev.player_id] ?? 0) + pts
  })
  const legacyPerformers = Object.entries(scorerPoints)
    .map(([playerId, pts]) => ({
      playerId, rating: null, name: playerName(playersById[playerId]) ?? 'Joueur inconnu',
      detail: `${pts} pts`,
    }))
    .sort((a, b) => parseInt(b.detail) - parseInt(a.detail))
    .slice(0, 3)

  const performers = topPerformers.length ? topPerformers : legacyPerformers

  const ratingColor = (v) =>
    v >= 7.5 ? '#1B7A4A' : v >= 6.5 ? '#27ae60' : v >= 5.5 ? '#F5820D' : '#e74c3c'

  const renderLineup = (rows, statRows, clubName) => (
    <div className="lineup-section">
      <h3 className="lineup-section-title">{clubName}</h3>

      {statRows.length > 0 ? (
        <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 0 }}>
          <table className="player-table stats-table">
            <thead>
              <tr>
                <th>Joueur</th>
                <th title="Minutes jouées">Min</th>
                <th title="Points marqués">Pts</th>
                <th title="Plaquages réussis">Plaq.</th>
                <th title="Mètres gagnés">Mètres</th>
                <th title="Note sur 10">Note</th>
              </tr>
            </thead>
            <tbody>
              {statRows.map((s) => (
                <tr key={s.player_id} className="player-row">
                  <td className="player-name-cell">
                    {playerName(s.players) ?? '—'}
                    {s.yellow_cards > 0 && <span title="Carton jaune"> 🟡</span>}
                    {s.red_cards > 0 && <span title="Carton rouge"> 🔴</span>}
                  </td>
                  <td className="stats-cell">{s.minutes_played}</td>
                  <td className="stats-cell">{s.points || '—'}</td>
                  <td className="stats-cell">{s.tackles}</td>
                  <td className="stats-cell">{s.meters_gained}</td>
                  <td className="stats-cell">
                    <span className="stats-rating-badge" style={{ background: ratingColor(Number(s.rating)) }}>
                      {Number(s.rating).toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : rows.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 13 }}>Composition non disponible.</p>
      ) : (
        <>
          {rows.filter((r) => r.is_starter).map((r) => (
            <div key={r.player_id} className="lineup-row lineup-row-filled">
              <span className="lineup-number">{r.shirt_number}</span>
              <span className="lineup-player-name">{playerName(r.players) ?? '—'}</span>
            </div>
          ))}
          {rows.some((r) => !r.is_starter) && (
            <>
              <p className="lineup-bench-note" style={{ marginTop: 10 }}>Banc</p>
              {rows.filter((r) => !r.is_starter).map((r) => (
                <div key={r.player_id} className="lineup-row">
                  <span className="lineup-number">{r.shirt_number}</span>
                  <span className="lineup-player-name">{playerName(r.players) ?? '—'}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">

        {/* ── Score ── */}
        <div className="live-scoreboard card">
          <div className="live-score-row">
            {match.home_club
              ? <ClubLink club={match.home_club} className="live-team-name" />
              : <span className="live-team-name">?</span>}
            <div className="live-score-box">
              <span className="live-score-num">{match.home_score ?? '–'}</span>
              <span className="live-score-sep">–</span>
              <span className="live-score-num">{match.away_score ?? '–'}</span>
            </div>
            {match.away_club
              ? <ClubLink club={match.away_club} className="live-team-name" />
              : <span className="live-team-name">?</span>}
          </div>
          <div className="live-status-row">
            {completed
              ? <span className="live-badge live-badge-done">Match terminé</span>
              : <span className="live-badge live-badge-live">● En cours / à venir</span>}
            <span className="live-date">{dateLabel}{isFriendly ? ' · Amical' : ''}</span>
          </div>
          {completed && (match.home_tries != null || match.away_tries != null) && (
            <div className="live-summary-stats" style={{ justifyContent: 'center', marginTop: 8 }}>
              <span>Essais : {match.home_tries ?? 0} – {match.away_tries ?? 0}</span>
            </div>
          )}
        </div>

        {/* ── Acteurs du match ── */}
        {performers.length > 0 && (
          <div className="card">
            <h3 className="lineup-section-title">Acteurs du match</h3>
            <div className="match-detail-performers">
              {performers.map((tp, i) => (
                <div key={tp.playerId} className="match-detail-performer">
                  <span className="match-detail-performer-rank">{i === 0 ? '⭐' : i + 1}</span>
                  <span className="match-detail-performer-name">{tp.name}</span>
                  <span className="match-detail-performer-detail">{tp.detail}</span>
                  {tp.rating != null && (
                    <span className="stats-rating-badge" style={{ background: ratingColor(tp.rating) }}>
                      {tp.rating.toFixed(1)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Timeline ── */}
        <div className="lineup-section-title" style={{ marginTop: 8 }}>Film du match</div>
        {events.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ color: '#aaa' }}>
              {completed ? 'Aucun événement enregistré pour ce match.' : 'Le match n\'a pas encore commencé.'}
            </p>
          </div>
        ) : (
          <div className="live-events-list" style={{ marginBottom: 20 }}>
            {events.map((ev, i) => (
              <div key={ev.id ?? i} className="live-event-row">
                <span className="live-event-minute">{ev.game_minute}'</span>
                <span className="live-event-icon">{EVENT_ICONS[ev.event_type] ?? EVENT_ICONS.default}</span>
                <span className="live-event-desc">{ev.description}</span>
                <span className="live-event-score">{ev.home_score}–{ev.away_score}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Compositions ── */}
        {(lineups.home.length > 0 || lineups.away.length > 0 || allStats.length > 0) && (
          <>
            <div className="lineup-section-title">
              {allStats.length > 0 ? 'Performances individuelles' : 'Compositions'}
            </div>
            <div className="lineup-layout">
              {renderLineup(lineups.home, stats.home, match.home_club?.name ?? 'Domicile')}
              {renderLineup(lineups.away, stats.away, match.away_club?.name ?? 'Extérieur')}
            </div>
          </>
        )}

        <button className="btn btn-outline" style={{ marginTop: 16 }} onClick={() => navigate(-1)}>
          ← Retour
        </button>
      </div>
    </Layout>
  )
}

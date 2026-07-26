import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import JerseyPreview from '../components/JerseyPreview'
import { timezoneLabel } from '../lib/timezones'

const ALL_STATS = [
  'endurance','strength','agility','speed','passing','kicking',
  'scrum','lineout','rucking','tackling','breaking','def_reading',
  'discipline','composure',
]

const getOverall = (p) => {
  const vals = ALL_STATS.map((s) => p[s] ?? 0)
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

const fmtDate = (d, opts = { dateStyle: 'long' }) =>
  d ? new Intl.DateTimeFormat('fr-FR', opts).format(new Date(d)) : '—'

export default function ClubProfile({ session }) {
  const { clubId } = useParams()
  const navigate = useNavigate()

  const [club, setClub]           = useState(null)
  const [manager, setManager]     = useState(null)
  const [history, setHistory]     = useState([])
  const [squad, setSquad]         = useState({ count: 0, avgOverall: 0 })
  const [headToHead, setH2H]      = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  useEffect(() => { init() }, [clubId])

  const init = async () => {
    setLoading(true); setError(null)

    const { data: clubData, error: clubErr } = await supabase
      .from('clubs')
      .select('*')
      .eq('id', clubId)
      .single()

    if (clubErr || !clubData) {
      setError("Ce club n'existe pas ou plus.")
      setLoading(false)
      return
    }
    setClub(clubData)

    const tasks = [
      supabase
        .from('standings')
        .select('*, league_seasons(season_number, status, leagues(name, tier))')
        .eq('club_id', clubId),
      supabase
        .from('players')
        .select('endurance, strength, agility, speed, passing, kicking, scrum, lineout, rucking, tackling, breaking, def_reading, discipline, composure')
        .eq('club_id', clubId),
    ]

    if (!clubData.is_bot && clubData.owner_user_id) {
      tasks.push(
        supabase
          .from('profiles')
          .select('display_name, avatar_url, timezone, created_at')
          .eq('id', clubData.owner_user_id)
          .maybeSingle()
      )
    }

    const [{ data: standingsData }, { data: playersData }, profileResult] = await Promise.all(tasks)

    setHistory(
      (standingsData ?? [])
        .filter((s) => s.league_seasons)
        .sort((a, b) => (b.league_seasons?.season_number ?? 0) - (a.league_seasons?.season_number ?? 0))
    )

    const players = playersData ?? []
    setSquad({
      count: players.length,
      avgOverall: players.length ? Math.round(players.reduce((s, p) => s + getOverall(p), 0) / players.length) : 0,
    })

    if (profileResult?.data) setManager(profileResult.data)

    // ── Face-à-face avec le club du viewer ──────────────────────────────────
    if (session?.user?.id) {
      const { data: viewerClub } = await supabase
        .from('clubs')
        .select('id')
        .eq('owner_user_id', session.user.id)
        .maybeSingle()

      if (viewerClub && viewerClub.id !== clubId) {
        const { data: pastMatches } = await supabase
          .from('matches')
          .select('home_club_id, away_club_id, home_score, away_score')
          .eq('status', 'completed')
          .or(`and(home_club_id.eq.${clubId},away_club_id.eq.${viewerClub.id}),and(home_club_id.eq.${viewerClub.id},away_club_id.eq.${clubId})`)

        let won = 0, drawn = 0, lost = 0
        ;(pastMatches ?? []).forEach((m) => {
          const viewerIsHome = m.home_club_id === viewerClub.id
          const scored   = viewerIsHome ? m.home_score : m.away_score
          const conceded = viewerIsHome ? m.away_score : m.home_score
          if (scored > conceded) won++
          else if (scored < conceded) lost++
          else drawn++
        })
        setH2H({ played: (pastMatches ?? []).length, won, drawn, lost })
      }
    }

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

  if (error) {
    return (
      <Layout onLogout={handleLogout}>
        <div className="page-container">
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <p style={{ color: '#888' }}>{error}</p>
            <button className="btn btn-outline" style={{ marginTop: 12 }} onClick={() => navigate(-1)}>Retour</button>
          </div>
        </div>
      </Layout>
    )
  }

  const currentSeason = history.find((s) => s.league_seasons?.status === 'in_progress')
  const pastSeasons    = history.filter((s) => s.league_seasons?.status !== 'in_progress')
  const titles         = history.filter((s) => s.rank === 1).length

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">

        {/* ── En-tête club ─────────────────────────────────────────────────── */}
        <div className="card club-profile-header">
          <JerseyPreview primary={club.primary_color ?? '#1B7A4A'} secondary={club.secondary_color ?? '#F5820D'} size={90} />
          <div className="club-profile-header-info">
            <h2 className="page-title" style={{ marginBottom: 4 }}>
              {club.name}
              {club.is_bot && <span className="bot-badge">(bot)</span>}
            </h2>
            <div className="club-profile-meta-row">
              {club.stadium_name && <span>{club.stadium_name}</span>}
              {club.region && <span>· {club.region}</span>}
              {club.founded_at && <span>· Fondé le {fmtDate(club.founded_at)}</span>}
            </div>
          </div>
          <div className="club-profile-header-stats">
            <div className="stat-block">
              <span className="stat-value">{club.reputation ?? '—'}</span>
              <span className="stat-label">Réputation</span>
            </div>
            <div className="stat-block">
              <span className="stat-value">{club.supporters_count?.toLocaleString('fr-FR') ?? '—'}</span>
              <span className="stat-label">Supporters</span>
            </div>
            {titles > 0 && (
              <div className="stat-block">
                <span className="stat-value">🏆 {titles}</span>
                <span className="stat-label">Titre{titles > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>

        <div className="club-profile-grid">

          {/* ── Manager ────────────────────────────────────────────────────── */}
          {!club.is_bot && (
            <div className="card">
              <h3 className="lineup-section-title">Manager</h3>
              {manager ? (
                <>
                  <div className="profil-avatar-row" style={{ marginBottom: 12 }}>
                    <div className="profil-avatar">{(manager.display_name || '?')[0].toUpperCase()}</div>
                    <div>
                      <p className="profil-email-text">{manager.display_name || 'Manager anonyme'}</p>
                      <p className="profil-member-since">
                        Manager depuis {fmtDate(manager.created_at, { month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  {manager.timezone && (
                    <p className="club-profile-region">Région IRL : {timezoneLabel(manager.timezone)}</p>
                  )}
                </>
              ) : (
                <p style={{ color: '#aaa', fontSize: 13 }}>Informations manager indisponibles.</p>
              )}
            </div>
          )}

          {/* ── Effectif ───────────────────────────────────────────────────── */}
          <div className="card">
            <h3 className="lineup-section-title">Effectif</h3>
            <div className="stats-row">
              <div className="stat-block">
                <span className="stat-value">{squad.count}</span>
                <span className="stat-label">Joueurs</span>
              </div>
              <div className="stat-block">
                <span className="stat-value">{squad.avgOverall || '—'}</span>
                <span className="stat-label">Note moyenne</span>
              </div>
            </div>
          </div>

          {/* ── Saison en cours ────────────────────────────────────────────── */}
          {currentSeason && (
            <div className="card">
              <h3 className="lineup-section-title">Saison en cours</h3>
              <p className="club-profile-region">
                {currentSeason.league_seasons?.leagues?.name}
                {currentSeason.league_seasons?.leagues?.tier ? ` — Division ${currentSeason.league_seasons.leagues.tier}` : ''}
              </p>
              <div className="stats-row">
                <div className="stat-block">
                  <span className="stat-value">{currentSeason.rank ?? '—'}</span>
                  <span className="stat-label">Rang</span>
                </div>
                <div className="stat-block">
                  <span className="stat-value">{currentSeason.won}-{currentSeason.drawn}-{currentSeason.lost}</span>
                  <span className="stat-label">V-N-D</span>
                </div>
                <div className="stat-block">
                  <span className="stat-value">{currentSeason.ranking_points}</span>
                  <span className="stat-label">Points</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Face-à-face ────────────────────────────────────────────────── */}
          {headToHead && headToHead.played > 0 && (
            <div className="card">
              <h3 className="lineup-section-title">Face-à-face avec vous</h3>
              <div className="stats-row">
                <div className="stat-block">
                  <span className="stat-value">{headToHead.won}</span>
                  <span className="stat-label">Victoires</span>
                </div>
                <div className="stat-block">
                  <span className="stat-value">{headToHead.drawn}</span>
                  <span className="stat-label">Nuls</span>
                </div>
                <div className="stat-block">
                  <span className="stat-value">{headToHead.lost}</span>
                  <span className="stat-label">Défaites</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Palmarès ─────────────────────────────────────────────────────── */}
        <div className="lineup-section-title" style={{ marginTop: 8 }}>Palmarès</div>
        {pastSeasons.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <p style={{ color: '#aaa' }}>Aucune saison terminée pour l'instant.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="league-table">
              <thead>
                <tr>
                  <th>Saison</th>
                  <th>Ligue</th>
                  <th>Rang</th>
                  <th>V-N-D</th>
                  <th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {pastSeasons.map((s) => (
                  <tr key={s.id} className={`league-row${s.rank === 1 ? ' club-profile-title-row' : ''}`}>
                    <td>Saison {s.league_seasons?.season_number ?? '—'}</td>
                    <td>
                      {s.league_seasons?.leagues?.name}
                      {s.league_seasons?.leagues?.tier ? ` — D${s.league_seasons.leagues.tier}` : ''}
                    </td>
                    <td>{s.rank === 1 ? `🏆 ${s.rank}` : s.rank ?? '—'}</td>
                    <td>{s.won}-{s.drawn}-{s.lost}</td>
                    <td className="league-pts">{s.ranking_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Link to="/ligue" className="club-profile-back">← Retour à la ligue</Link>
      </div>
    </Layout>
  )
}

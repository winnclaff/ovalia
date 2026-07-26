import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import ClubLink from '../components/ClubLink'

const fmt = (d) =>
  new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const fmtDate = (d) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

const OBJECTIVE_META = {
  win_title:        { label: 'Remporter le championnat',          okRank: (r) => r === 1 },
  top3:             { label: 'Finir sur le podium',               okRank: (r) => r != null && r <= 3 },
  top_half:         { label: 'Finir dans la première moitié',     okRank: (r) => r != null && r <= 4 },
  avoid_relegation: { label: 'Éviter la relégation',              okRank: (r, total) => r != null && r < (total ?? 8) },
}

export default function Dashboard({ session }) {
  const navigate = useNavigate()
  const [club, setClub]               = useState(null)
  const [nextMatch, setNextMatch]     = useState(null)
  const [lastMatch, setLastMatch]     = useState(null)
  const [standing, setStanding]       = useState(null)
  const [alerts, setAlerts]           = useState([])
  const [allClubs, setAllClubs]       = useState({})
  const [nightReport, setNightReport] = useState(null)
  const [objective, setObjective]     = useState(null)
  const [loading, setLoading]         = useState(true)

  const handleLogout = async () => { await supabase.auth.signOut() }

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    // ── Club
    const { data: clubData } = await supabase
      .from('clubs')
      .select('*')
      .eq('owner_user_id', session.user.id)
      .single()

    if (!clubData) { navigate('/create-club', { replace: true }); return }
    setClub(clubData)

    const clubId = clubData.id

    // ── Toutes les requêtes en parallèle
    const [
      { data: nextMatches },
      { data: lastMatches },
      { data: clubsData },
      { data: activeSeason },
      { data: players },
      { data: expiringContracts },
      { data: reportRow },
    ] = await Promise.all([
      supabase
        .from('matches')
        .select('id, home_club_id, away_club_id, scheduled_at, lineup_deadline, status')
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
        .neq('status', 'completed')
        .order('scheduled_at', { ascending: true })
        .limit(1),

      supabase
        .from('matches')
        .select('id, home_club_id, away_club_id, scheduled_at, home_score, away_score, status')
        .or(`home_club_id.eq.${clubId},away_club_id.eq.${clubId}`)
        .eq('status', 'completed')
        .order('scheduled_at', { ascending: false })
        .limit(1),

      supabase
        .from('clubs')
        .select('id, name, is_bot'),

      supabase
        .from('league_seasons')
        .select('id')
        .eq('league_id', clubData.league_id)
        .eq('status', 'in_progress')
        .order('season_number', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from('players')
        .select('id, injury_days_left')
        .eq('club_id', clubId),

      supabase
        .from('contracts')
        .select('id, end_date, player_id')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .lt('end_date', new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)),

      supabase
        .from('daily_reports')
        .select('report_date, payload')
        .eq('club_id', clubId)
        .order('report_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    // ── Clubs map
    const clubMap = {}
    ;(clubsData ?? []).forEach((c) => { clubMap[c.id] = c })
    setAllClubs(clubMap)

    // ── Rapport de la nuit
    setNightReport(reportRow ?? null)

    // ── Prochain match
    const nm = nextMatches?.[0] ?? null
    setNextMatch(nm)

    // ── Dernier résultat
    setLastMatch(lastMatches?.[0] ?? null)

    // ── Classement
    if (activeSeason?.id) {
      const { data: objRow } = await supabase
        .from('season_objectives')
        .select('objective_type, reward, status')
        .eq('league_season_id', activeSeason.id)
        .eq('club_id', clubId)
        .maybeSingle()
      setObjective(objRow ?? null)

      const { data: standingRow } = await supabase
        .from('standings')
        .select('played, won, drawn, lost, ranking_points')
        .eq('league_season_id', activeSeason.id)
        .eq('club_id', clubId)
        .maybeSingle()

      if (standingRow) {
        const { data: allStandings } = await supabase
          .from('standings')
          .select('club_id, ranking_points')
          .eq('league_season_id', activeSeason.id)
          .order('ranking_points', { ascending: false })

        const rank = (allStandings ?? []).findIndex((s) => s.club_id === clubId) + 1
        setStanding({ ...standingRow, rank, total: allStandings?.length ?? 0 })
      }
    }

    // ── Alertes
    const newAlerts = []

    // Compo manquante si deadline dans < 24h
    if (nm?.lineup_deadline) {
      const deadlineMs = new Date(nm.lineup_deadline).getTime()
      const nowMs      = Date.now()
      if (deadlineMs > nowMs && deadlineMs - nowMs < 24 * 3600_000) {
        const { count } = await supabase
          .from('match_lineups')
          .select('id', { count: 'exact', head: true })
          .eq('match_id', nm.id)
          .eq('club_id', clubId)

        if (!count) {
          const dl = new Date(nm.lineup_deadline).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          newAlerts.push({ type: 'warning', text: `Compose ton équipe avant ${dl}`, link: '/match' })
        }
      }
    }

    // Joueurs blessés
    const injured = (players ?? []).filter((p) => (p.injury_days_left ?? 0) > 0)
    if (injured.length) {
      newAlerts.push({ type: 'info', text: `${injured.length} joueur${injured.length > 1 ? 's' : ''} blessé${injured.length > 1 ? 's' : ''}`, link: '/effectif' })
    }

    // Contrats expirants
    if (expiringContracts?.length) {
      newAlerts.push({ type: 'info', text: `${expiringContracts.length} joueur${expiringContracts.length > 1 ? 's' : ''} en fin de contrat`, link: '/effectif' })
    }

    setAlerts(newAlerts)
    setLoading(false)
  }

  if (loading) return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">
        <p style={{ color: '#888' }}>Chargement…</p>
      </div>
    </Layout>
  )
  if (!club) return null

  // ── Calcul résultat dernier match
  let lastResult = null
  if (lastMatch) {
    const isHome = lastMatch.home_club_id === club.id
    const scored   = isHome ? lastMatch.home_score : lastMatch.away_score
    const conceded = isHome ? lastMatch.away_score : lastMatch.home_score
    const oppId    = isHome ? lastMatch.away_club_id : lastMatch.home_club_id
    const oppName  = allClubs[oppId]?.name ?? '—'
    if (scored > conceded)       lastResult = { label: 'Victoire', cls: 'result-w', scored, conceded, oppName, oppId }
    else if (scored < conceded)  lastResult = { label: 'Défaite',  cls: 'result-l', scored, conceded, oppName, oppId }
    else                         lastResult = { label: 'Nul',      cls: 'result-d', scored, conceded, oppName, oppId }
  }

  // ── Adversaire prochain match
  const nextOppId   = nextMatch ? (nextMatch.home_club_id === club.id ? nextMatch.away_club_id : nextMatch.home_club_id) : null
  const nextOppName = nextOppId ? (allClubs[nextOppId]?.name ?? '—') : null
  const isDeadlineSoon = nextMatch?.lineup_deadline
    ? new Date(nextMatch.lineup_deadline).getTime() - Date.now() < 24 * 3600_000
    : false

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">

        <div className="page-title-row">
          {club.primary_color && (
            <div className="club-colors">
              <div className="club-color-dot" style={{ background: club.primary_color }} />
              <div className="club-color-dot" style={{ background: club.secondary_color }} />
            </div>
          )}
          <h2 className="page-title">{club.name}</h2>
          <span className="page-subtitle">{club.stadium_name}</span>
        </div>

        {/* ── Alertes ── */}
        {alerts.length > 0 && (
          <div className="dash-alerts">
            {alerts.map((a, i) => (
              <a key={i} href={a.link} className={`dash-alert dash-alert-${a.type}`}>
                <span className="dash-alert-icon">{a.type === 'warning' ? '⚠' : 'ℹ'}</span>
                {a.text}
              </a>
            ))}
          </div>
        )}

        {/* ── KPI trésorerie / supporters / réputation ── */}
        <div className="card">
          <div className="stats-row">
            <div className="stat-block">
              <span className="stat-value">{club.balance?.toLocaleString('fr-FR') ?? '—'} €</span>
              <span className="stat-label">Trésorerie</span>
            </div>
            <div className="stat-block">
              <span className="stat-value">{club.supporters_count?.toLocaleString('fr-FR') ?? '—'}</span>
              <span className="stat-label">Supporters</span>
            </div>
            <div className="stat-block">
              <span className="stat-value">{club.reputation ?? '—'}</span>
              <span className="stat-label">Réputation</span>
            </div>
          </div>
        </div>

        {/* ── Cette nuit au club ── */}
        {nightReport?.payload && (() => {
          const p = nightReport.payload
          const hasNews = (p.training?.totalGain ?? 0) > 0 || p.recovered?.length || p.academy?.length
            || p.market?.length || p.financesNet != null
          const dateLabel = new Date(nightReport.report_date + 'T00:00:00')
            .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
          return (
            <div className="card dash-night-report">
              <p className="dash-card-title">🌙 Cette nuit au club <span className="dash-night-date">— {dateLabel}</span></p>
              {!hasNews ? (
                <p className="dash-empty">Nuit calme, rien à signaler.</p>
              ) : (
                <ul className="dash-night-list">
                  {(p.training?.totalGain ?? 0) > 0 && (
                    <li>
                      💪 <strong>+{p.training.totalGain.toLocaleString('fr-FR')} pts</strong> de progression à l'entraînement
                      {p.training.top?.length > 0 && (
                        <span className="dash-night-detail">
                          {' '}(meilleurs : {p.training.top.map((t) => `${t.name} +${t.gain}`).join(', ')})
                        </span>
                      )}
                    </li>
                  )}
                  {p.recovered?.length > 0 && (
                    <li>🩹 De retour de blessure : <strong>{p.recovered.join(', ')}</strong></li>
                  )}
                  {p.academy?.length > 0 && (
                    <li>🎓 Nouveaux talents à l'académie : <strong>{p.academy.join(', ')}</strong></li>
                  )}
                  {p.market?.length > 0 && (
                    <li>🔍 À suivre sur le marché : {p.market.join(', ')}</li>
                  )}
                  {p.financesNet != null && (
                    <li style={{ color: p.financesNet >= 0 ? '#1B7A4A' : '#e74c3c' }}>
                      💰 Bilan financier mensuel : <strong>{p.financesNet >= 0 ? '+' : ''}{p.financesNet.toLocaleString('fr-FR')} €</strong>
                    </li>
                  )}
                </ul>
              )}
            </div>
          )
        })()}

        {/* ── Grille infos ── */}
        <div className="dash-grid">

          {/* Prochain match */}
          <div className="card dash-card">
            <p className="dash-card-title">Prochain match</p>
            {nextMatch ? (
              <>
                <p className="dash-opponent">
                  {nextOppId && allClubs[nextOppId] ? <ClubLink club={allClubs[nextOppId]} /> : nextOppName}
                </p>
                <p className="dash-match-date">{fmt(nextMatch.scheduled_at)}</p>
                {nextMatch.lineup_deadline && (
                  <p className={`dash-deadline${isDeadlineSoon ? ' dash-deadline-urgent' : ''}`}>
                    Compo avant {fmt(nextMatch.lineup_deadline)}
                  </p>
                )}
              </>
            ) : (
              <p className="dash-empty">Aucun match à venir</p>
            )}
          </div>

          {/* Dernier résultat */}
          <div className="card dash-card">
            <p className="dash-card-title">Dernier résultat</p>
            {lastResult ? (
              <>
                <p className={`dash-result-label ${lastResult.cls}`}>{lastResult.label}</p>
                <Link to={`/match/${lastMatch.id}`} className="dash-score dash-score-link" title="Voir le détail du match">
                  {lastResult.scored} – {lastResult.conceded}
                </Link>
                <p className="dash-opponent" style={{ fontSize: 13 }}>
                  vs {lastResult.oppId && allClubs[lastResult.oppId] ? <ClubLink club={allClubs[lastResult.oppId]} /> : lastResult.oppName}
                </p>
              </>
            ) : (
              <p className="dash-empty">Aucun match joué</p>
            )}
          </div>

          {/* Objectif de saison */}
          {objective && OBJECTIVE_META[objective.objective_type] && (() => {
            const meta = OBJECTIVE_META[objective.objective_type]
            const onTrack = standing ? meta.okRank(standing.rank, standing.total) : true
            const stateLabel = objective.status === 'achieved' ? '✓ Atteint'
              : objective.status === 'failed' ? '✗ Manqué'
              : onTrack ? 'En bonne voie' : 'En difficulté'
            const stateColor = objective.status === 'achieved' ? '#1B7A4A'
              : objective.status === 'failed' ? '#e74c3c'
              : onTrack ? '#1B7A4A' : '#F5820D'
            return (
              <div className="card dash-card">
                <p className="dash-card-title">🎯 Objectif de saison</p>
                <p className="dash-objective-label">{meta.label}</p>
                <p className="dash-objective-reward">
                  Prime : {(objective.reward ?? 0).toLocaleString('fr-FR')} €
                </p>
                <p className="dash-objective-state" style={{ color: stateColor }}>{stateLabel}</p>
              </div>
            )
          })()}

          {/* Classement */}
          <div className="card dash-card">
            <p className="dash-card-title">Classement</p>
            {standing ? (
              <>
                <p className="dash-rank">{standing.rank}<span className="dash-rank-total">/{standing.total}</span></p>
                <p className="dash-standing-detail">
                  {standing.played} J · {standing.won}V {standing.drawn}N {standing.lost}D
                </p>
                <p className="dash-standing-pts">{standing.ranking_points} pts</p>
              </>
            ) : (
              <p className="dash-empty">Saison non démarrée</p>
            )}
          </div>

        </div>

      </div>
    </Layout>
  )
}

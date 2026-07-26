import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import ClubLink from '../components/ClubLink'

// ─── Config ───────────────────────────────────────────────────────────────────

const POSITION_LABELS = {
  prop: 'Pilier', hooker: 'Talonneur', lock: '2ème ligne', flanker: '3ème ligne',
  number_8: 'N°8', scrum_half: 'Demi de mêlée', fly_half: 'Ouvreur',
  center: 'Centre', wing: 'Ailier', full_back: 'Arrière',
}

const POSITION_ORDER = ['prop','hooker','lock','flanker','number_8','scrum_half','fly_half','center','wing','full_back']

// Colonnes du tableau joueurs : clé d'agrégat, libellé, et sens de tri par défaut
const COLUMNS = [
  { key: 'matches',        label: 'M',        title: 'Matchs joués' },
  { key: 'avgRating',      label: 'Note',     title: 'Note moyenne sur 10', decimals: 1 },
  { key: 'points',         label: 'Pts',      title: 'Points marqués' },
  { key: 'tries',          label: 'Essais',   title: 'Essais' },
  { key: 'tackles',        label: 'Plaq.',    title: 'Plaquages réussis' },
  { key: 'tacklePct',      label: '% Plaq.',  title: 'Taux de réussite au plaquage', suffix: '%' },
  { key: 'meters_gained',  label: 'Mètres',   title: 'Mètres gagnés balle en main' },
  { key: 'turnovers_won',  label: 'Grattés',  title: 'Ballons grattés' },
  { key: 'handling_errors',label: 'Erreurs',  title: 'Ballons perdus / en-avants' },
]

const ratingColor = (v) => {
  if (v >= 7.5) return '#1B7A4A'
  if (v >= 6.5) return '#27ae60'
  if (v >= 5.5) return '#F5820D'
  return '#e74c3c'
}

const playerName = (p) =>
  p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Joueur' : '—'

const fmtDate = (d) =>
  d ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(d)) : '—'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Statistiques({ session }) {
  const navigate = useNavigate()
  const [clubId, setClubId]   = useState(null)
  const [tab, setTab]         = useState('joueurs')
  const [rows, setRows]       = useState([])
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState('avgRating')
  const [posFilter, setPosFilter] = useState('all')

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: club } = await supabase
      .from('clubs')
      .select('id')
      .eq('owner_user_id', session.user.id)
      .single()

    if (!club) { navigate('/create-club', { replace: true }); return }
    setClubId(club.id)

    const [{ data: statRows }, { data: matchRows }] = await Promise.all([
      supabase
        .from('match_player_stats')
        .select('*, players(id, first_name, last_name, primary_position)')
        .eq('club_id', club.id),
      supabase
        .from('matches')
        .select('id, scheduled_at, match_day, home_score, away_score, home_club_id, away_club_id, league_season_id, home_club:clubs!home_club_id(id,name,is_bot), away_club:clubs!away_club_id(id,name,is_bot)')
        .or(`home_club_id.eq.${club.id},away_club_id.eq.${club.id}`)
        .eq('status', 'completed')
        .order('scheduled_at', { ascending: false }),
    ])

    setRows(statRows ?? [])
    setMatches(matchRows ?? [])
    setLoading(false)
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  // ── Agrégation par joueur sur toute la saison ─────────────────────────────
  const byPlayer = {}
  rows.forEach((r) => {
    const id = r.player_id
    if (!byPlayer[id]) {
      byPlayer[id] = {
        id,
        name: playerName(r.players),
        position: r.position ?? r.players?.primary_position ?? null,
        matches: 0, ratingSum: 0, points: 0, tries: 0,
        tackles: 0, tackles_missed: 0, meters_gained: 0,
        turnovers_won: 0, handling_errors: 0,
      }
    }
    const a = byPlayer[id]
    a.matches          += 1
    a.ratingSum        += Number(r.rating ?? 0)
    a.points           += r.points ?? 0
    a.tries            += r.tries ?? 0
    a.tackles          += r.tackles ?? 0
    a.tackles_missed   += r.tackles_missed ?? 0
    a.meters_gained    += r.meters_gained ?? 0
    a.turnovers_won    += r.turnovers_won ?? 0
    a.handling_errors  += r.handling_errors ?? 0
  })

  const aggregates = Object.values(byPlayer).map((a) => {
    const attempted = a.tackles + a.tackles_missed
    return {
      ...a,
      avgRating: a.matches ? a.ratingSum / a.matches : 0,
      tacklePct: attempted ? Math.round((a.tackles / attempted) * 100) : 0,
    }
  })

  const positions = [...new Set(aggregates.map((a) => a.position).filter(Boolean))]
    .sort((x, y) => POSITION_ORDER.indexOf(x) - POSITION_ORDER.indexOf(y))

  const visible = aggregates
    .filter((a) => posFilter === 'all' || a.position === posFilter)
    .sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0))

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">

        <div className="page-title-row">
          <h2 className="page-title">Statistiques</h2>
          <span className="page-subtitle">Saison en cours</span>
        </div>

        <div className="tab-bar">
          <button className={`tab-btn${tab === 'joueurs' ? ' active' : ''}`} onClick={() => setTab('joueurs')}>
            Mes joueurs
            {!loading && aggregates.length > 0 && <span className="tab-badge">{aggregates.length}</span>}
          </button>
          <button className={`tab-btn${tab === 'matchs' ? ' active' : ''}`} onClick={() => setTab('matchs')}>
            Historique des matchs
            {!loading && matches.length > 0 && <span className="tab-badge">{matches.length}</span>}
          </button>
        </div>

        {loading && <p style={{ color: '#888' }}>Chargement…</p>}

        {/* ── Joueurs ──────────────────────────────────────────────────────── */}
        {!loading && tab === 'joueurs' && (
          aggregates.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: '#aaa' }}>Aucune statistique pour l'instant.</p>
              <p style={{ color: '#bbb', fontSize: 13, marginTop: 8 }}>
                Les performances individuelles sont enregistrées à chaque match joué.
              </p>
            </div>
          ) : (
            <>
              <div className="stats-toolbar">
                <div className="recr-filter-group">
                  <label className="recr-filter-label">Poste</label>
                  <select className="recr-select" value={posFilter} onChange={(e) => setPosFilter(e.target.value)}>
                    <option value="all">Tous les postes</option>
                    {positions.map((p) => (
                      <option key={p} value={p}>{POSITION_LABELS[p] ?? p}</option>
                    ))}
                  </select>
                </div>
                <span className="stats-hint">
                  Cliquez sur une colonne pour trier — comparez vos joueurs à un même poste.
                </span>
              </div>

              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="player-table stats-table">
                  <thead>
                    <tr>
                      <th>Joueur</th>
                      <th>Poste</th>
                      {COLUMNS.map((c) => (
                        <th
                          key={c.key}
                          title={c.title}
                          className={`stats-th-sortable${sortKey === c.key ? ' stats-th-active' : ''}`}
                          onClick={() => setSortKey(c.key)}
                        >
                          {c.label}{sortKey === c.key ? ' ▾' : ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((a) => (
                      <tr key={a.id} className="player-row">
                        <td className="player-name-cell">{a.name}</td>
                        <td className="player-age-cell">{POSITION_LABELS[a.position] ?? '—'}</td>
                        {COLUMNS.map((c) => {
                          const raw = a[c.key] ?? 0
                          const val = c.decimals ? raw.toFixed(c.decimals) : Math.round(raw)
                          return (
                            <td
                              key={c.key}
                              className="stats-cell"
                              style={c.key === 'avgRating' ? { color: ratingColor(raw), fontWeight: 700 } : {}}
                            >
                              {val}{c.suffix ?? ''}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}

        {/* ── Historique ───────────────────────────────────────────────────── */}
        {!loading && tab === 'matchs' && (
          matches.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: '#aaa' }}>Aucun match joué pour l'instant.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="player-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Journée</th>
                    <th>Rencontre</th>
                    <th>Score</th>
                    <th>Résultat</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => {
                    const isHome   = m.home_club_id === clubId
                    const scored   = isHome ? m.home_score : m.away_score
                    const conceded = isHome ? m.away_score : m.home_score
                    const res = scored > conceded ? { l: 'Victoire', c: 'result-w' }
                      : scored < conceded ? { l: 'Défaite', c: 'result-l' }
                      : { l: 'Nul', c: 'result-d' }
                    return (
                      <tr key={m.id} className="player-row">
                        <td className="player-age-cell">{fmtDate(m.scheduled_at)}</td>
                        <td className="player-age-cell">
                          {m.league_season_id ? `J${m.match_day ?? '—'}` : 'Amical'}
                        </td>
                        <td className="player-name-cell">
                          {m.home_club ? <ClubLink club={m.home_club} /> : '—'}
                          <span style={{ color: '#bbb' }}> — </span>
                          {m.away_club ? <ClubLink club={m.away_club} /> : '—'}
                        </td>
                        <td className="stats-cell" style={{ fontWeight: 700 }}>
                          {m.home_score} – {m.away_score}
                        </td>
                        <td><span className={`dash-result-label ${res.c}`} style={{ fontSize: 13 }}>{res.l}</span></td>
                        <td>
                          <Link to={`/match/${m.id}`} className="recr-btn-recruit" style={{ textDecoration: 'none' }}>
                            Détail
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

      </div>
    </Layout>
  )
}

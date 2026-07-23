import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'

// ─── Position metadata ───────────────────────────────────────────────────────

const POSITION_META = {
  PROP:       { label: 'Pilier',         short: 'PIL', group: 'Avants',   order: 1 },
  HOOKER:     { label: 'Talonneur',      short: 'TAL', group: 'Avants',   order: 2 },
  LOCK:       { label: '2ème ligne',     short: '2L',  group: 'Avants',   order: 3 },
  FLANKER:    { label: '3ème ligne',     short: '3L',  group: 'Avants',   order: 4 },
  NUMBER_8:   { label: 'Numéro 8',      short: 'N°8', group: 'Avants',   order: 5 },
  SCRUM_HALF: { label: 'Demi de mêlée', short: 'DM',  group: 'Arrières', order: 6 },
  FLY_HALF:   { label: 'Ouvreur',       short: 'OUV', group: 'Arrières', order: 7 },
  CENTER:     { label: 'Centre',        short: 'CTR', group: 'Arrières', order: 8 },
  WING:       { label: 'Ailier',        short: 'AIL', group: 'Arrières', order: 9 },
  FULLBACK:   { label: 'Arrière',       short: 'ARR', group: 'Arrières', order: 10 },
}

const STAT_GROUPS = [
  { label: 'Physique',   stats: ['endurance', 'strength', 'agility', 'speed'] },
  { label: 'Technique',  stats: ['passing', 'kicking', 'scrum', 'lineout', 'rucking'] },
  { label: 'Défense',    stats: ['tackling', 'breaking', 'def_reading'] },
  { label: 'Mental',     stats: ['discipline', 'composure'] },
]

const STAT_LABELS = {
  endurance:   'Endurance',
  strength:    'Force',
  agility:     'Agilité',
  speed:       'Vitesse',
  passing:     'Passe',
  kicking:     'Coup de pied',
  scrum:       'Mêlée',
  lineout:     'Touche',
  rucking:     'Ruck',
  tackling:    'Plaquage',
  breaking:    'Percussion',
  def_reading: 'Lecture déf.',
  discipline:  'Discipline',
  composure:   'Sang-froid',
}

const ALL_STATS = Object.keys(STAT_LABELS)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getPositionMeta = (pos) => {
  if (!pos) return { label: '—', short: '—', group: null, order: 99 }
  const key = pos.toUpperCase().replace(/[-\s]/g, '_')
  return POSITION_META[key] ?? { label: pos, short: pos.slice(0, 3).toUpperCase(), group: null, order: 99 }
}

const playerName = (p) => {
  if (p.first_name || p.last_name) return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  return p.name ?? `Joueur #${p.id}`
}

const getOverall = (p) => {
  const vals = ALL_STATS.map(s => p[s] ?? 0)
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

const isInjured = (p) => {
  if (p.is_injured) return true
  if (p.injury_until) return new Date(p.injury_until) > new Date()
  return false
}

const statColor = (v) => {
  if (v >= 80) return '#1B7A4A'
  if (v >= 65) return '#27ae60'
  if (v >= 50) return '#F5820D'
  return '#e74c3c'
}

const overallColor = (v) => {
  if (v >= 75) return '#1B7A4A'
  if (v >= 60) return '#F5820D'
  return '#e74c3c'
}

const energyColor = (v) => {
  if (v >= 70) return '#1B7A4A'
  if (v >= 40) return '#F5820D'
  return '#e74c3c'
}

// ─── Player detail modal ─────────────────────────────────────────────────────

function PlayerModal({ player, onClose }) {
  const meta = getPositionMeta(player.position)
  const overall = getOverall(player)
  const injured = isInjured(player)
  const energy = player.energy ?? 0

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>

        <div className="modal-header">
          <div>
            <h3 className="modal-player-name">{playerName(player)}</h3>
            <div className="modal-player-meta">
              <span className={`position-badge pos-${meta.group === 'Avants' ? 'avant' : 'arriere'}`}>
                {meta.label}
              </span>
              {player.age && <span className="modal-detail-text">{player.age} ans</span>}
              {player.nationality && <span className="modal-detail-text">{player.nationality}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="overall-badge overall-large" style={{ background: overallColor(overall) }}>
              {overall}
            </span>
            <button className="modal-close" onClick={onClose} aria-label="Fermer">✕</button>
          </div>
        </div>

        <div className="modal-status-row">
          <div className="modal-energy">
            <span className="modal-energy-label">Énergie</span>
            <div className="energy-bar-container" style={{ width: 120, display: 'inline-block' }}>
              <div className="energy-bar-fill" style={{ width: `${energy}%`, background: energyColor(energy) }} />
            </div>
            <span className="energy-value">{energy}%</span>
          </div>
          <span className={`status-badge ${injured ? 'status-injured' : 'status-fit'}`}>
            {injured ? '🚑 Blessé' : '✓ Apte'}
          </span>
        </div>

        <div className="modal-stats">
          {STAT_GROUPS.map((group) => (
            <div key={group.label} className="stat-group">
              <h4 className="stat-group-title">{group.label}</h4>
              {group.stats.map((stat) => {
                const val = player[stat] ?? 0
                return (
                  <div key={stat} className="stat-detail-row">
                    <span className="stat-detail-label">{STAT_LABELS[stat]}</span>
                    <div className="stat-bar-container">
                      <div className="stat-bar-fill" style={{ width: `${val}%`, background: statColor(val) }} />
                    </div>
                    <span className="stat-detail-value" style={{ color: statColor(val) }}>{val}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'all',      label: 'Tous' },
  { key: 'Avants',   label: 'Avants' },
  { key: 'Arrières', label: 'Arrières' },
]

export default function Effectif({ session }) {
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)

  useEffect(() => { loadPlayers() }, [])

  const loadPlayers = async () => {
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('id')
      .eq('owner_user_id', session.user.id)
      .single()

    if (clubError || !club) {
      navigate('/create-club', { replace: true })
      return
    }

    const { data, error: err } = await supabase
      .from('players')
      .select('*')
      .eq('club_id', club.id)

    if (err) setError('Impossible de charger les joueurs.')
    else setPlayers(data ?? [])
    setLoading(false)
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  const filtered = players
    .filter((p) => filter === 'all' || getPositionMeta(p.position).group === filter)
    .sort((a, b) => getPositionMeta(a.position).order - getPositionMeta(b.position).order)

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">

        <div className="page-title-row">
          <h2 className="page-title">Effectif</h2>
          <span className="page-subtitle">{players.length} joueurs</span>
        </div>

        <div className="filter-tabs">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              className={`filter-tab${filter === key ? ' active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
              {key !== 'all' && (
                <span className="filter-count">
                  {players.filter((p) => getPositionMeta(p.position).group === key).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: '#888' }}>Chargement…</p>}
        {error && <p className="error-text">{error}</p>}

        {!loading && !error && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="player-table">
              <thead>
                <tr>
                  <th>Poste</th>
                  <th>Nom</th>
                  <th>Âge</th>
                  <th>Énergie</th>
                  <th>Statut</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
                      Aucun joueur
                    </td>
                  </tr>
                ) : (
                  filtered.map((player) => {
                    const meta = getPositionMeta(player.position)
                    const overall = getOverall(player)
                    const injured = isInjured(player)
                    const energy = player.energy ?? 0
                    return (
                      <tr key={player.id} className="player-row" onClick={() => setSelected(player)}>
                        <td>
                          <span className={`position-badge pos-${meta.group === 'Avants' ? 'avant' : 'arriere'}`}>
                            {meta.short}
                          </span>
                        </td>
                        <td className="player-name-cell">{playerName(player)}</td>
                        <td className="player-age-cell">{player.age ? `${player.age} ans` : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div className="energy-bar-container">
                              <div
                                className="energy-bar-fill"
                                style={{ width: `${energy}%`, background: energyColor(energy) }}
                              />
                            </div>
                            <span className="energy-value">{energy}%</span>
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge ${injured ? 'status-injured' : 'status-fit'}`}>
                            {injured ? 'Blessé' : 'Apte'}
                          </span>
                        </td>
                        <td>
                          <span className="overall-badge" style={{ background: overallColor(overall) }}>
                            {overall}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {selected && <PlayerModal player={selected} onClose={() => setSelected(null)} />}
      </div>
    </Layout>
  )
}

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
  FULL_BACK:  { label: 'Arrière',       short: 'ARR', group: 'Arrières', order: 10 },
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

const computeAge = (dateOfBirth) => {
  if (!dateOfBirth) return null
  const today = new Date()
  const dob = new Date(dateOfBirth)
  let age = today.getFullYear() - dob.getFullYear()
  const m = today.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--
  return age
}

const isInjured = (p) => (p.injury_days_left ?? 0) > 0

const fmt = (n) =>
  (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

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

function PlayerModal({ player, listing, onClose, onList, onCancelListing, saving }) {
  const meta = getPositionMeta(player.primary_position)
  const overall = getOverall(player)
  const injured = isInjured(player)
  const energy = player.energy ?? 0
  const age = computeAge(player.date_of_birth)
  const [askingPrice, setAskingPrice] = useState(Math.round((overall * 1000 + 5000) / 500) * 500)

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
              {age != null && <span className="modal-detail-text">{age} ans</span>}
              {player.nationality && <span className="modal-detail-text">{player.nationality}</span>}
              {(player.height_cm || player.weight_kg) && (
                <span className="modal-detail-text">
                  {player.height_cm ? `${player.height_cm} cm` : '—'} · {player.weight_kg ? `${player.weight_kg} kg` : '—'}
                </span>
              )}
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

        <div className="sell-section">
          {listing ? (
            <>
              <span className="sell-listed-text">En vente — {fmt(listing.asking_price)}</span>
              <button className="btn btn-outline" onClick={() => onCancelListing(listing)} disabled={saving}>
                {saving ? '…' : 'Retirer de la vente'}
              </button>
            </>
          ) : (
            <>
              <div className="sell-price-row">
                <input
                  type="number"
                  className="recr-input"
                  value={askingPrice}
                  min={500}
                  step={500}
                  onChange={(e) => setAskingPrice(Math.max(0, Number(e.target.value)))}
                />
                <span className="recr-currency">€</span>
              </div>
              <button className="btn btn-primary" onClick={() => onList(player, askingPrice)} disabled={saving || askingPrice <= 0}>
                {saving ? '…' : 'Mettre en vente'}
              </button>
            </>
          )}
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
  const [clubId, setClubId] = useState(null)
  const [players, setPlayers] = useState([])
  const [listings, setListings] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)

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
    setClubId(club.id)

    const [{ data, error: err }, { data: listingRows }] = await Promise.all([
      supabase.from('players').select('*').eq('club_id', club.id),
      supabase.from('transfer_listings').select('id, player_id, asking_price').eq('club_id', club.id).eq('status', 'active'),
    ])

    if (err) setError('Impossible de charger les joueurs.')
    else setPlayers(data ?? [])
    setListings(Object.fromEntries((listingRows ?? []).map((l) => [l.player_id, l])))
    setLoading(false)
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  const handleList = async (player, askingPrice) => {
    setSaving(true)
    const { data, error: err } = await supabase
      .from('transfer_listings')
      .insert({ player_id: player.id, club_id: clubId, asking_price: askingPrice })
      .select('id, player_id, asking_price')
      .single()
    if (!err && data) setListings((prev) => ({ ...prev, [player.id]: data }))
    setSaving(false)
  }

  const handleCancelListing = async (listing) => {
    setSaving(true)
    await supabase.from('transfer_listings').update({ status: 'cancelled' }).eq('id', listing.id)
    setListings((prev) => {
      const next = { ...prev }
      delete next[listing.player_id]
      return next
    })
    setSaving(false)
  }

  const filtered = players
    .filter((p) => filter === 'all' || getPositionMeta(p.primary_position).group === filter)
    .sort((a, b) => getPositionMeta(a.primary_position).order - getPositionMeta(b.primary_position).order)

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
                  {players.filter((p) => getPositionMeta(p.primary_position).group === key).length}
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
                  <th>Gabarit</th>
                  <th>Énergie</th>
                  <th>Statut</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
                      Aucun joueur
                    </td>
                  </tr>
                ) : (
                  filtered.map((player) => {
                    const meta = getPositionMeta(player.primary_position)
                    const overall = getOverall(player)
                    const injured = isInjured(player)
                    const energy = player.energy ?? 0
                    const age = computeAge(player.date_of_birth)
                    const listed = listings[player.id]
                    return (
                      <tr key={player.id} className="player-row" onClick={() => setSelected(player)}>
                        <td>
                          <span className={`position-badge pos-${meta.group === 'Avants' ? 'avant' : 'arriere'}`}>
                            {meta.short}
                          </span>
                        </td>
                        <td className="player-name-cell">
                          {playerName(player)}
                          {listed && <span className="sell-badge">En vente</span>}
                        </td>
                        <td className="player-age-cell">{age != null ? `${age} ans` : '—'}</td>
                        <td className="player-build-cell">
                          {player.height_cm ? `${player.height_cm} cm` : '—'} · {player.weight_kg ? `${player.weight_kg} kg` : '—'}
                        </td>
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

        {selected && (
          <PlayerModal
            player={selected}
            listing={listings[selected.id] ?? null}
            onClose={() => setSelected(null)}
            onList={handleList}
            onCancelListing={handleCancelListing}
            saving={saving}
          />
        )}
      </div>
    </Layout>
  )
}

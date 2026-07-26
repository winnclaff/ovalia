import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import { CONTRACT_DURATIONS, expectedSalary, acceptanceChance, acceptanceLabel, acceptanceColor } from '../lib/contracts'

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

const daysUntil = (dateStr) => {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - Date.now()) / 86400_000)
}

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const RENEWAL_WINDOW_DAYS = 60

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

function PlayerModal({ player, listing, contract, clubBalance, onClose, onList, onCancelListing, onRenew, saving }) {
  const meta = getPositionMeta(player.primary_position)
  const overall = getOverall(player)
  const injured = isInjured(player)
  const energy = player.energy ?? 0
  const age = computeAge(player.date_of_birth)
  const [askingPrice, setAskingPrice] = useState(Math.round((overall * 1000 + 5000) / 500) * 500)

  // ── Renouvellement de contrat ─────────────────────────────────────────────
  const expected = expectedSalary(overall)
  const [renewSalary, setRenewSalary]     = useState(expected)
  const [renewDuration, setRenewDuration] = useState(12)
  const [renewRejected, setRenewRejected] = useState(false)
  const daysLeft = contract ? daysUntil(contract.end_date) : null
  const canRenew = contract && daysLeft != null && daysLeft <= RENEWAL_WINDOW_DAYS
  const renewChance = acceptanceChance(renewSalary, expected)
  const canAffordBonus = clubBalance >= renewSalary // prime de signature = 1 mois

  const handleRenewClick = () => {
    setRenewRejected(false)
    if (Math.random() < renewChance) {
      onRenew(player, contract, renewSalary, renewDuration)
    } else {
      setRenewRejected(true)
    }
  }

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

        {/* ── Contrat ── */}
        {contract && (
          <div className="contract-section">
            <div className="contract-info-row">
              <span className="contract-label">Contrat</span>
              <span className="contract-value">{fmt(contract.monthly_salary)}/mois</span>
              <span className={`contract-expiry${daysLeft != null && daysLeft <= RENEWAL_WINDOW_DAYS ? ' contract-expiry-soon' : ''}`}>
                expire le {fmtDate(contract.end_date)}
                {daysLeft != null && daysLeft <= RENEWAL_WINDOW_DAYS && ` (${Math.max(0, daysLeft)} j)`}
              </span>
            </div>

            {canRenew && (
              <div className="contract-renew-form">
                <div className="recr-salary-row">
                  <input
                    type="number"
                    className="recr-input"
                    value={renewSalary}
                    min={500}
                    step={500}
                    onChange={(e) => { setRenewSalary(Math.max(500, Number(e.target.value))); setRenewRejected(false) }}
                  />
                  <span className="recr-currency">€ / mois</span>
                  <div className="recr-duration-grid" style={{ marginLeft: 'auto' }}>
                    {CONTRACT_DURATIONS.map((d) => (
                      <button
                        key={d}
                        className={`recr-duration-btn${renewDuration === d ? ' active' : ''}`}
                        onClick={() => setRenewDuration(d)}
                      >
                        {d}m
                      </button>
                    ))}
                  </div>
                </div>
                <div className="recr-acceptance-row">
                  <div className="recr-acceptance-bar-track">
                    <div className="recr-acceptance-bar-fill" style={{ width: `${renewChance * 100}%`, background: acceptanceColor(renewChance) }} />
                  </div>
                  <span className="recr-acceptance-label" style={{ color: acceptanceColor(renewChance) }}>
                    {acceptanceLabel(renewChance)} ({Math.round(renewChance * 100)}%)
                  </span>
                </div>
                <div className="contract-renew-footer">
                  <span className="infra-cost-sub">Prime de signature : {fmt(renewSalary)} (1 mois)</span>
                  <button
                    className="btn btn-primary"
                    onClick={handleRenewClick}
                    disabled={saving || renewChance === 0 || !canAffordBonus}
                  >
                    {saving ? '…' : 'Renouveler'}
                  </button>
                </div>
                {!canAffordBonus && <p className="recr-error">Trésorerie insuffisante pour la prime de signature.</p>}
                {renewRejected && (
                  <p className="recr-error">{playerName(player)} refuse cette offre. Proposez un salaire plus élevé.</p>
                )}
              </div>
            )}
          </div>
        )}

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
  const [clubBalance, setClubBalance] = useState(0)
  const [players, setPlayers] = useState([])
  const [listings, setListings] = useState({})
  const [contracts, setContracts] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadPlayers() }, [])

  const loadPlayers = async () => {
    const { data: club, error: clubError } = await supabase
      .from('clubs')
      .select('id, balance')
      .eq('owner_user_id', session.user.id)
      .single()

    if (clubError || !club) {
      navigate('/create-club', { replace: true })
      return
    }
    setClubId(club.id)
    setClubBalance(club.balance ?? 0)

    const [{ data, error: err }, { data: listingRows }, { data: contractRows }] = await Promise.all([
      supabase.from('players').select('*').eq('club_id', club.id),
      supabase.from('transfer_listings').select('id, player_id, asking_price').eq('club_id', club.id).eq('status', 'active'),
      supabase.from('contracts').select('id, player_id, monthly_salary, end_date').eq('club_id', club.id).eq('is_active', true),
    ])

    if (err) setError('Impossible de charger les joueurs.')
    else setPlayers(data ?? [])
    setListings(Object.fromEntries((listingRows ?? []).map((l) => [l.player_id, l])))
    setContracts(Object.fromEntries((contractRows ?? []).map((c) => [c.player_id, c])))
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

  // ── Renouvellement de contrat ───────────────────────────────────────────────
  // Le tirage d'acceptation a déjà eu lieu dans la modale ; ici on exécute :
  // ancien contrat désactivé, nouveau contrat depuis aujourd'hui, prime de
  // signature (1 mois) déduite.
  const handleRenew = async (player, contract, salary, duration) => {
    setSaving(true)

    const startDate = new Date()
    const endDate = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + duration)

    const { error: newErr } = await supabase.from('contracts').insert({
      player_id:      player.id,
      club_id:        clubId,
      monthly_salary: salary,
      start_date:     startDate.toISOString().slice(0, 10),
      end_date:       endDate.toISOString().slice(0, 10),
      is_active:      true,
    })

    if (newErr) {
      setSaving(false)
      alert(`Erreur lors du renouvellement : ${newErr.message}`)
      return
    }

    await supabase.from('contracts').update({ is_active: false }).eq('id', contract.id)

    const newBalance = clubBalance - salary
    await supabase.from('clubs').update({ balance: newBalance }).eq('id', clubId)
    await supabase.from('transactions').insert({
      club_id:     clubId,
      type:        'salary',
      amount:      salary,
      description: `Renouvellement ${playerName(player)} — prime de signature`,
    })

    setClubBalance(newBalance)
    setContracts((prev) => ({
      ...prev,
      [player.id]: {
        id: null, // rechargé au prochain loadPlayers ; suffisant pour l'affichage
        player_id: player.id,
        monthly_salary: salary,
        end_date: endDate.toISOString().slice(0, 10),
      },
    }))
    setSelected(null)
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
                  <th>Contrat</th>
                  <th>Énergie</th>
                  <th>Statut</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
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
                        <td className="player-contract-cell">
                          {(() => {
                            const c = contracts[player.id]
                            if (!c) return <span style={{ color: '#ccc' }}>—</span>
                            const dl = daysUntil(c.end_date)
                            const soon = dl != null && dl <= RENEWAL_WINDOW_DAYS
                            return (
                              <span style={soon ? { color: '#e74c3c', fontWeight: 600 } : {}}>
                                {fmtDate(c.end_date)}
                              </span>
                            )
                          })()}
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
            contract={contracts[selected.id] ?? null}
            clubBalance={clubBalance}
            onClose={() => setSelected(null)}
            onList={handleList}
            onCancelListing={handleCancelListing}
            onRenew={handleRenew}
            saving={saving}
          />
        )}
      </div>
    </Layout>
  )
}

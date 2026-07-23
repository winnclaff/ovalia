import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'

// ─── Config ───────────────────────────────────────────────────────────────────

const POSITION_META = {
  PROP:       { label: 'Pilier',         short: 'PIL', group: 'Avants'   },
  HOOKER:     { label: 'Talonneur',      short: 'TAL', group: 'Avants'   },
  LOCK:       { label: '2ème ligne',     short: '2L',  group: 'Avants'   },
  FLANKER:    { label: '3ème ligne',     short: '3L',  group: 'Avants'   },
  NUMBER_8:   { label: 'Numéro 8',       short: 'N°8', group: 'Avants'   },
  SCRUM_HALF: { label: 'Demi de mêlée',  short: 'DM',  group: 'Arrières' },
  FLY_HALF:   { label: 'Ouvreur',        short: 'OUV', group: 'Arrières' },
  CENTER:     { label: 'Centre',         short: 'CTR', group: 'Arrières' },
  WING:       { label: 'Ailier',         short: 'AIL', group: 'Arrières' },
  FULLBACK:   { label: 'Arrière',        short: 'ARR', group: 'Arrières' },
}

const ALL_STATS = [
  'endurance','strength','agility','speed','passing','kicking',
  'scrum','lineout','rucking','tackling','breaking','def_reading',
  'discipline','composure',
]

const AGE_RANGES = [
  { key: 'all',   label: 'Tous âges' },
  { key: 'u21',   label: '< 21 ans'  },
  { key: '21-25', label: '21–25 ans' },
  { key: '26-30', label: '26–30 ans' },
  { key: '31+',   label: '31+ ans'   },
]

const CONTRACT_DURATIONS = [3, 6, 12, 18, 24]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getOverall = (p) => {
  const vals = ALL_STATS.map((s) => p[s] ?? 0)
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

const playerName = (p) => {
  if (p.first_name || p.last_name) return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  return p.name ?? `Joueur #${p.id}`
}

const getPosMeta = (pos) => {
  if (!pos) return { label: '—', short: '—', group: null }
  const key = pos.toUpperCase().replace(/[-\s]/g, '_')
  return POSITION_META[key] ?? { label: pos, short: pos.slice(0, 3).toUpperCase(), group: null }
}

const overallColor = (v) => {
  if (v >= 75) return '#1B7A4A'
  if (v >= 60) return '#F5820D'
  return '#e74c3c'
}

const matchesAge = (age, range) => {
  if (range === 'all' || !age) return true
  if (range === 'u21')   return age < 21
  if (range === '21-25') return age >= 21 && age <= 25
  if (range === '26-30') return age >= 26 && age <= 30
  if (range === '31+')   return age >= 31
  return true
}

const fmt = (n) =>
  (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

// ─── Contract modal ───────────────────────────────────────────────────────────

function ContractModal({ player, clubBalance, onConfirm, onClose, saving }) {
  const [salary, setSalary]     = useState(5000)
  const [duration, setDuration] = useState(12)
  const overall = getOverall(player)
  const suggested = Math.round((overall * 80 + 1000) / 500) * 500
  const canAfford = clubBalance >= salary

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal recr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-player-name">{playerName(player)}</h3>
            <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
              {getPosMeta(player.position).label}
              {player.age ? ` · ${player.age} ans` : ''}
              {player.nationality ? ` · ${player.nationality}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="overall-badge overall-large" style={{ background: overallColor(overall) }}>
              {overall}
            </span>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="recr-modal-body">
          <div className="recr-suggested">
            <span className="recr-suggested-label">Salaire suggéré</span>
            <span className="recr-suggested-value">{fmt(suggested)} / mois</span>
          </div>

          <div className="recr-field">
            <label className="recr-label">Salaire mensuel</label>
            <div className="recr-salary-row">
              <input
                type="number"
                className="recr-input"
                value={salary}
                min={500}
                max={500000}
                step={500}
                onChange={(e) => setSalary(Math.max(500, Number(e.target.value)))}
              />
              <span className="recr-currency">€ / mois</span>
            </div>
            {!canAfford && (
              <p className="recr-error">
                Solde insuffisant ({fmt(clubBalance)}) pour payer le premier mois.
              </p>
            )}
          </div>

          <div className="recr-field">
            <label className="recr-label">Durée du contrat</label>
            <div className="recr-duration-grid">
              {CONTRACT_DURATIONS.map((d) => (
                <button
                  key={d}
                  className={`recr-duration-btn${duration === d ? ' active' : ''}`}
                  onClick={() => setDuration(d)}
                >
                  {d} mois
                </button>
              ))}
            </div>
          </div>

          <div className="recr-summary">
            <div className="recr-summary-row">
              <span>Coût total estimé</span>
              <span className="recr-summary-val">{fmt(salary * duration)}</span>
            </div>
            <div className="recr-summary-row">
              <span>Premier mois déduit maintenant</span>
              <span className="recr-summary-val" style={{ color: '#e74c3c' }}>−{fmt(salary)}</span>
            </div>
            <div className="recr-summary-row">
              <span>Trésorerie après signature</span>
              <span className="recr-summary-val" style={{ color: canAfford ? '#1B7A4A' : '#e74c3c' }}>
                {fmt(clubBalance - salary)}
              </span>
            </div>
          </div>
        </div>

        <div className="recr-modal-footer">
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Annuler</button>
          <button
            className="btn btn-primary"
            onClick={() => onConfirm(salary, duration)}
            disabled={saving || !canAfford}
          >
            {saving ? 'Signature…' : 'Signer le contrat'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Player card row ──────────────────────────────────────────────────────────

function PlayerRow({ player, onRecruit }) {
  const meta    = getPosMeta(player.position)
  const overall = getOverall(player)
  const isAvant = meta.group === 'Avants'

  return (
    <tr className="recr-player-row">
      <td>
        <span className={`position-badge pos-${isAvant ? 'avant' : 'arriere'}`}>
          {meta.short}
        </span>
      </td>
      <td className="recr-name">{playerName(player)}</td>
      <td className="recr-cell">{player.age ? `${player.age} ans` : '—'}</td>
      <td className="recr-cell">{player.nationality ?? '—'}</td>
      <td>
        <span className="overall-badge" style={{ background: overallColor(overall) }}>
          {overall}
        </span>
      </td>
      <td>
        <button className="recr-btn-recruit" onClick={() => onRecruit(player)}>
          Recruter
        </button>
      </td>
    </tr>
  )
}

// ─── Academy player row ───────────────────────────────────────────────────────

function AcademyRow({ player, onPromote, promoting }) {
  const meta    = getPosMeta(player.position)
  const overall = getOverall(player)
  const isAvant = meta.group === 'Avants'

  return (
    <tr className="recr-player-row">
      <td>
        <span className={`position-badge pos-${isAvant ? 'avant' : 'arriere'}`}>
          {meta.short}
        </span>
      </td>
      <td className="recr-name">{playerName(player)}</td>
      <td className="recr-cell">{player.age ? `${player.age} ans` : '—'}</td>
      <td className="recr-cell">{player.nationality ?? '—'}</td>
      <td>
        <span className="overall-badge" style={{ background: overallColor(overall) }}>
          {overall}
        </span>
      </td>
      <td>
        <button
          className="recr-btn-promote"
          onClick={() => onPromote(player)}
          disabled={promoting === player.id}
        >
          {promoting === player.id ? '…' : 'Intégrer au groupe pro'}
        </button>
      </td>
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Recrutement({ session }) {
  const navigate = useNavigate()
  const [club, setClub]               = useState(null)
  const [tab, setTab]                 = useState('market')
  const [marketPlayers, setMarket]    = useState([])
  const [academyPlayers, setAcademy]  = useState([])
  const [loadingMarket, setLM]        = useState(true)
  const [loadingAcademy, setLA]       = useState(true)
  const [signing, setSigning]         = useState(false)
  const [promoting, setPromoting]     = useState(null)
  const [modalPlayer, setModalPlayer] = useState(null)
  const [successMsg, setSuccessMsg]   = useState('')

  // Filters
  const [filterPos, setFilterPos]     = useState('all')
  const [filterAge, setFilterAge]     = useState('all')
  const [filterMin, setFilterMin]     = useState(0)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: c } = await supabase
      .from('clubs')
      .select('id, name, balance')
      .eq('owner_user_id', session.user.id)
      .single()

    if (!c) { navigate('/create-club', { replace: true }); return }
    setClub(c)
    loadMarket()
    loadAcademy(c.id)
  }

  const loadMarket = async () => {
    setLM(true)
    const { data } = await supabase
      .from('players')
      .select('*')
      .is('club_id', null)
      .eq('retired', false)
      .order('id', { ascending: true })
      .limit(300)
    setMarket(data ?? [])
    setLM(false)
  }

  const loadAcademy = async (clubId) => {
    setLA(true)
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('club_id', clubId)
      .eq('source', 'academy')
      .lt('age', 20)
      .order('age', { ascending: true })
    setAcademy(data ?? [])
    setLA(false)
  }

  // ── Recruit flow ────────────────────────────────────────────────────────────

  const handleRecruit = async (salary, duration) => {
    if (!modalPlayer || !club) return
    setSigning(true)

    const startDate = new Date()
    const endDate   = new Date(startDate)
    endDate.setMonth(endDate.getMonth() + duration)

    // 1. Insert contract
    const { error: contractErr } = await supabase.from('contracts').insert({
      player_id:      modalPlayer.id,
      club_id:        club.id,
      monthly_salary:  salary,
      duration_months: duration,
      start_date:      startDate.toISOString().slice(0, 10),
      end_date:        endDate.toISOString().slice(0, 10),
      is_active:       true,
    })

    if (contractErr) {
      setSigning(false)
      alert('Erreur lors de la création du contrat.')
      return
    }

    // 2. Update player.club_id
    await supabase.from('players').update({ club_id: club.id }).eq('id', modalPlayer.id)

    // 3. Deduct first month salary + log transaction
    const newBalance = (club.balance ?? 0) - salary
    await supabase.from('clubs').update({ balance: newBalance }).eq('id', club.id)
    await supabase.from('transactions').insert({
      club_id:     club.id,
      type:        'salary',
      amount:      salary,
      description: `Signature ${playerName(modalPlayer)} — premier mois`,
    })

    // 4. Update local state
    setClub((c) => ({ ...c, balance: newBalance }))
    setMarket((prev) => prev.filter((p) => p.id !== modalPlayer.id))
    setModalPlayer(null)
    setSigning(false)
    setSuccessMsg(`${playerName(modalPlayer)} a rejoint votre effectif !`)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  // ── Academy promote ─────────────────────────────────────────────────────────

  const handlePromote = async (player) => {
    setPromoting(player.id)
    await supabase
      .from('players')
      .update({ source: 'transfer_market' })
      .eq('id', player.id)
    setAcademy((prev) => prev.filter((p) => p.id !== player.id))
    setSuccessMsg(`${playerName(player)} intégré au groupe professionnel.`)
    setTimeout(() => setSuccessMsg(''), 4000)
    setPromoting(null)
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  // ── Filtered market ─────────────────────────────────────────────────────────

  const positionKeys = ['all', ...Object.keys(POSITION_META)]

  const filteredMarket = marketPlayers.filter((p) => {
    const overall = getOverall(p)
    if (filterPos !== 'all') {
      const posKey = (p.position ?? '').toUpperCase().replace(/[-\s]/g, '_')
      if (posKey !== filterPos) return false
    }
    if (!matchesAge(p.age, filterAge)) return false
    if (overall < filterMin) return false
    return true
  })

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">

        <div className="page-title-row">
          <h2 className="page-title">Recrutement</h2>
          {club && (
            <span className="page-subtitle" style={{ color: club.balance < 0 ? '#e74c3c' : undefined }}>
              Trésorerie : {fmt(club.balance)}
            </span>
          )}
        </div>

        {successMsg && (
          <div className="recr-success-banner">{successMsg}</div>
        )}

        <div className="tab-bar">
          <button
            className={`tab-btn${tab === 'market' ? ' active' : ''}`}
            onClick={() => setTab('market')}
          >
            Marché des transferts
            {!loadingMarket && (
              <span className="tab-badge">{marketPlayers.length}</span>
            )}
          </button>
          <button
            className={`tab-btn${tab === 'academy' ? ' active' : ''}`}
            onClick={() => setTab('academy')}
          >
            Académie
            {!loadingAcademy && academyPlayers.length > 0 && (
              <span className="tab-badge">{academyPlayers.length}</span>
            )}
          </button>
        </div>

        {/* ── Marché ─────────────────────────────────────────────────────── */}
        {tab === 'market' && (
          <>
            {/* Filters */}
            <div className="recr-filters">
              <div className="recr-filter-group">
                <label className="recr-filter-label">Poste</label>
                <select
                  className="recr-select"
                  value={filterPos}
                  onChange={(e) => setFilterPos(e.target.value)}
                >
                  <option value="all">Tous les postes</option>
                  <optgroup label="Avants">
                    {Object.entries(POSITION_META)
                      .filter(([, v]) => v.group === 'Avants')
                      .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </optgroup>
                  <optgroup label="Arrières">
                    {Object.entries(POSITION_META)
                      .filter(([, v]) => v.group === 'Arrières')
                      .map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </optgroup>
                </select>
              </div>

              <div className="recr-filter-group">
                <label className="recr-filter-label">Âge</label>
                <select
                  className="recr-select"
                  value={filterAge}
                  onChange={(e) => setFilterAge(e.target.value)}
                >
                  {AGE_RANGES.map((r) => (
                    <option key={r.key} value={r.key}>{r.label}</option>
                  ))}
                </select>
              </div>

              <div className="recr-filter-group">
                <label className="recr-filter-label">Note min.</label>
                <div className="recr-range-row">
                  <input
                    type="range"
                    min={0}
                    max={90}
                    step={5}
                    value={filterMin}
                    onChange={(e) => setFilterMin(Number(e.target.value))}
                    className="recr-range"
                  />
                  <span className="recr-range-val">{filterMin === 0 ? 'Tous' : `≥ ${filterMin}`}</span>
                </div>
              </div>

              <span className="recr-count">
                {loadingMarket ? '…' : `${filteredMarket.length} joueur${filteredMarket.length !== 1 ? 's' : ''}`}
              </span>
            </div>

            {loadingMarket ? (
              <p style={{ color: '#888' }}>Chargement…</p>
            ) : filteredMarket.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: '#aaa' }}>Aucun joueur ne correspond à ces critères.</p>
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="recr-table">
                  <thead>
                    <tr>
                      <th>Poste</th>
                      <th>Nom</th>
                      <th>Âge</th>
                      <th>Nationalité</th>
                      <th>Note</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMarket.map((p) => (
                      <PlayerRow
                        key={p.id}
                        player={p}
                        onRecruit={setModalPlayer}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Académie ───────────────────────────────────────────────────── */}
        {tab === 'academy' && (
          <>
            <div className="recr-academy-intro">
              <p>
                Les jeunes talents de l'académie ont moins de 20 ans. Intégrez-les au groupe
                professionnel pour les faire apparaître dans votre effectif et les sélectionner en match.
              </p>
            </div>

            {loadingAcademy ? (
              <p style={{ color: '#888' }}>Chargement…</p>
            ) : academyPlayers.length === 0 ? (
              <div className="card recr-academy-empty">
                <svg viewBox="0 0 48 48" fill="none" width="48" height="48" style={{ margin: '0 auto 12px' }}>
                  <circle cx="24" cy="16" r="8" stroke="#ccc" strokeWidth="2.5"/>
                  <path d="M8 40c0-8.837 7.163-16 16-16s16 7.163 16 16" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round"/>
                  <path d="M30 6l2 2-2 2M36 10l-2 2 2 2" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <p className="recr-academy-empty-title">Aucun jeune en formation</p>
                <p className="recr-academy-empty-sub">
                  De nouveaux talents arrivent chaque dimanche lors du tick nocturne.
                </p>
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="recr-table">
                  <thead>
                    <tr>
                      <th>Poste</th>
                      <th>Nom</th>
                      <th>Âge</th>
                      <th>Nationalité</th>
                      <th>Note</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {academyPlayers.map((p) => (
                      <AcademyRow
                        key={p.id}
                        player={p}
                        onPromote={handlePromote}
                        promoting={promoting}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </div>

      {/* Contract modal */}
      {modalPlayer && club && (
        <ContractModal
          player={modalPlayer}
          clubBalance={club.balance ?? 0}
          onConfirm={handleRecruit}
          onClose={() => !signing && setModalPlayer(null)}
          saving={signing}
        />
      )}
    </Layout>
  )
}

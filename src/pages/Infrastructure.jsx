import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import {
  COACH_ROLES, COACH_SIGNING_FEE, COACH_MAX_LEVEL, coachSalary, coachUpgradeCost,
  BUILDINGS, buildingUpgradeCost, fmt,
} from '../lib/finance'

// ─── Level pips (réutilise le motif visuel de training-slot-pip) ─────────────

function LevelPips({ level, max, color }) {
  return (
    <div className="infra-pips">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className="infra-pip"
          style={{ background: i < level ? color : '#e8e8e8' }}
        />
      ))}
    </div>
  )
}

// ─── Carte coach ──────────────────────────────────────────────────────────────

function CoachCard({ roleMeta, coach, balance, onHire, onUpgrade, onFire, busyKey }) {
  const level = coach?.level ?? 0
  const busy = busyKey === roleMeta.key
  const color = '#1B7A4A'

  if (!coach) {
    const cost = COACH_SIGNING_FEE + coachSalary(roleMeta.baseSalary, 1)
    const canAfford = balance >= cost
    return (
      <div className="card infra-card">
        <div className="infra-card-header">
          <span className="infra-card-title">{roleMeta.label}</span>
          <span className="infra-card-badge infra-badge-empty">Poste vacant</span>
        </div>
        <LevelPips level={0} max={COACH_MAX_LEVEL} color={color} />
        <p className="infra-effect">{roleMeta.effect(1)} une fois recruté</p>
        <div className="infra-card-footer">
          <span className="infra-cost">{fmt(cost)}<span className="infra-cost-sub"> (frais + 1er mois)</span></span>
          <button
            className="btn btn-primary"
            onClick={() => onHire(roleMeta)}
            disabled={busy || !canAfford}
          >
            {busy ? '…' : 'Recruter'}
          </button>
        </div>
        {!canAfford && <p className="infra-error">Trésorerie insuffisante</p>}
      </div>
    )
  }

  const salary = coachSalary(roleMeta.baseSalary, level)
  const maxed = level >= COACH_MAX_LEVEL
  const upgradeCost = maxed ? null : coachUpgradeCost(level)
  const canAfford = upgradeCost !== null && balance >= upgradeCost

  return (
    <div className="card infra-card">
      <div className="infra-card-header">
        <span className="infra-card-title">{roleMeta.label}</span>
        <span className="infra-card-badge">{fmt(salary)}/mois</span>
      </div>
      <LevelPips level={level} max={COACH_MAX_LEVEL} color={color} />
      <p className="infra-effect">{roleMeta.effect(level)}</p>
      <div className="infra-card-footer">
        {maxed ? (
          <span className="infra-maxed">Niveau max</span>
        ) : (
          <span className="infra-cost">{fmt(upgradeCost)}</span>
        )}
        <div className="infra-card-actions">
          {!maxed && (
            <button
              className="btn btn-outline"
              onClick={() => onUpgrade(roleMeta, coach)}
              disabled={busy || !canAfford}
            >
              {busy ? '…' : 'Améliorer'}
            </button>
          )}
          <button
            className="btn btn-danger"
            onClick={() => onFire(roleMeta, coach)}
            disabled={busy}
          >
            Licencier
          </button>
        </div>
      </div>
      {!maxed && !canAfford && <p className="infra-error">Trésorerie insuffisante</p>}
    </div>
  )
}

// ─── Carte infrastructure ─────────────────────────────────────────────────────

function BuildingCard({ meta, level, balance, onUpgrade, busyKey }) {
  const busy = busyKey === meta.key
  const color = '#F5820D'
  const maxed = level >= meta.maxLevel
  const cost = maxed ? null : buildingUpgradeCost(meta.baseCost, level)
  const canAfford = cost !== null && balance >= cost
  const isUnbuilt = meta.minLevel === 0 && level === 0

  return (
    <div className="card infra-card">
      <div className="infra-card-header">
        <span className="infra-card-title">{meta.label}</span>
        <span className="infra-card-badge">Niveau {level}</span>
      </div>
      <LevelPips level={level} max={meta.maxLevel} color={color} />
      <p className="infra-effect">{meta.effect(level)}</p>
      <div className="infra-card-footer">
        {maxed ? (
          <span className="infra-maxed">Niveau max</span>
        ) : (
          <span className="infra-cost">{fmt(cost)}</span>
        )}
        {!maxed && (
          <button
            className="btn btn-primary"
            onClick={() => onUpgrade(meta)}
            disabled={busy || !canAfford}
          >
            {busy ? '…' : isUnbuilt ? 'Construire' : 'Améliorer'}
          </button>
        )}
      </div>
      {!maxed && !canAfford && <p className="infra-error">Trésorerie insuffisante</p>}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Infrastructure({ session }) {
  const navigate = useNavigate()
  const [club, setClub] = useState(null)
  const [coaches, setCoaches] = useState({})
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: c } = await supabase
      .from('clubs')
      .select('id, name, balance, stadium_level, training_facility_level, medical_center_level, academy_level, merchandising_level')
      .eq('owner_user_id', session.user.id)
      .single()

    if (!c) { navigate('/create-club', { replace: true }); return }
    setClub(c)

    const { data: coachRows } = await supabase
      .from('coaches')
      .select('id, role, level, monthly_salary')
      .eq('club_id', c.id)

    const byRole = {}
    ;(coachRows ?? []).forEach((row) => { byRole[row.role] = row })
    setCoaches(byRole)
    setLoading(false)
  }

  const flash = (msg) => {
    setSuccessMsg(msg)
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  // ── Coach: recruter ───────────────────────────────────────────────────────

  const handleHire = async (roleMeta) => {
    setBusyKey(roleMeta.key)
    const salary = coachSalary(roleMeta.baseSalary, 1)
    const signingFee = COACH_SIGNING_FEE
    const totalCost = signingFee + salary

    const { data: newCoach, error } = await supabase
      .from('coaches')
      .insert({ club_id: club.id, role: roleMeta.key, level: 1, monthly_salary: salary })
      .select('id, role, level, monthly_salary')
      .single()

    if (error) {
      setBusyKey(null)
      alert("Erreur lors du recrutement.")
      return
    }

    const newBalance = (club.balance ?? 0) - totalCost
    await supabase.from('clubs').update({ balance: newBalance }).eq('id', club.id)
    await supabase.from('transactions').insert([
      { club_id: club.id, type: 'infrastructure', amount: signingFee, description: `Signature — ${roleMeta.label}` },
      { club_id: club.id, type: 'staff_salary', amount: salary, description: `${roleMeta.label} — premier mois` },
    ])

    setClub((prev) => ({ ...prev, balance: newBalance }))
    setCoaches((prev) => ({ ...prev, [roleMeta.key]: newCoach }))
    setBusyKey(null)
    flash(`${roleMeta.label} recruté !`)
  }

  // ── Coach: améliorer ──────────────────────────────────────────────────────

  const handleUpgradeCoach = async (roleMeta, coach) => {
    setBusyKey(roleMeta.key)
    const cost = coachUpgradeCost(coach.level)
    const newLevel = coach.level + 1
    const newSalary = coachSalary(roleMeta.baseSalary, newLevel)

    await supabase.from('coaches').update({ level: newLevel, monthly_salary: newSalary }).eq('id', coach.id)

    const newBalance = (club.balance ?? 0) - cost
    await supabase.from('clubs').update({ balance: newBalance }).eq('id', club.id)
    await supabase.from('transactions').insert({
      club_id: club.id, type: 'infrastructure', amount: cost,
      description: `Amélioration — ${roleMeta.label} → niveau ${newLevel}`,
    })

    setClub((prev) => ({ ...prev, balance: newBalance }))
    setCoaches((prev) => ({ ...prev, [roleMeta.key]: { ...coach, level: newLevel, monthly_salary: newSalary } }))
    setBusyKey(null)
    flash(`${roleMeta.label} passe au niveau ${newLevel} !`)
  }

  // ── Coach: licencier ───────────────────────────────────────────────────────

  const handleFire = async (roleMeta, coach) => {
    if (!window.confirm(`Licencier ${roleMeta.label} ? Aucun remboursement, effectif immédiatement.`)) return
    setBusyKey(roleMeta.key)

    await supabase.from('coaches').delete().eq('id', coach.id)

    setCoaches((prev) => {
      const next = { ...prev }
      delete next[roleMeta.key]
      return next
    })
    setBusyKey(null)
    flash(`${roleMeta.label} a quitté le club.`)
  }

  // ── Infrastructure: améliorer / construire ────────────────────────────────

  const handleUpgradeBuilding = async (meta) => {
    setBusyKey(meta.key)
    const currentLevel = club[meta.key] ?? 0
    const cost = buildingUpgradeCost(meta.baseCost, currentLevel)
    const newLevel = currentLevel + 1
    const newBalance = (club.balance ?? 0) - cost

    await supabase.from('clubs').update({ [meta.key]: newLevel, balance: newBalance }).eq('id', club.id)
    await supabase.from('transactions').insert({
      club_id: club.id, type: 'infrastructure', amount: cost,
      description: `${meta.label} → niveau ${newLevel}`,
    })

    setClub((prev) => ({ ...prev, [meta.key]: newLevel, balance: newBalance }))
    setBusyKey(null)
    flash(`${meta.label} passe au niveau ${newLevel} !`)
  }

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">

        <div className="page-title-row">
          <h2 className="page-title">Infrastructures</h2>
          {club && (
            <span className="page-subtitle" style={{ color: club.balance < 0 ? '#e74c3c' : undefined }}>
              Trésorerie : {fmt(club.balance)}
            </span>
          )}
        </div>

        {successMsg && <div className="recr-success-banner">{successMsg}</div>}

        {loading ? (
          <p style={{ color: '#888' }}>Chargement…</p>
        ) : (
          <>
            <div className="infra-section-title">Staff technique</div>
            <div className="infra-grid">
              {COACH_ROLES.map((roleMeta) => (
                <CoachCard
                  key={roleMeta.key}
                  roleMeta={roleMeta}
                  coach={coaches[roleMeta.key] ?? null}
                  balance={club.balance ?? 0}
                  onHire={handleHire}
                  onUpgrade={handleUpgradeCoach}
                  onFire={handleFire}
                  busyKey={busyKey}
                />
              ))}
            </div>

            <div className="infra-section-title" style={{ marginTop: 28 }}>Infrastructures</div>
            <div className="infra-grid">
              {BUILDINGS.map((meta) => (
                <BuildingCard
                  key={meta.key}
                  meta={meta}
                  level={club[meta.key] ?? meta.minLevel}
                  balance={club.balance ?? 0}
                  onUpgrade={handleUpgradeBuilding}
                  busyKey={busyKey}
                />
              ))}
            </div>
          </>
        )}

      </div>
    </Layout>
  )
}

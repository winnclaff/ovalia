import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'

const MAX_SLOTS = 7
const ENERGY_PER_SLOT = 3
const DAILY_RECOVERY = 15

const PROGRAMS = [
  { key: 'avants',    dbKey: 'forwards',  label: 'Avants',    desc: 'Piliers, talonneurs, 2ème et 3ème lignes',  color: '#1B7A4A' },
  { key: 'arrieres',  dbKey: 'backs',     label: 'Arrières',  desc: 'Centres, ailiers, arrière',                 color: '#F5820D' },
  { key: 'charniere', dbKey: 'halfbacks', label: 'Charnière', desc: 'Demis de mêlée et d\'ouverture',            color: '#8B5CF6' },
]

// Map DB enum values → internal UI keys
const DB_TO_KEY = { forwards: 'avants', backs: 'arrieres', halfbacks: 'charniere' }

const STAT_GROUPS = [
  {
    label: 'Physique',
    stats: [
      { key: 'endurance',  label: 'Endurance' },
      { key: 'strength',   label: 'Force' },
      { key: 'agility',    label: 'Agilité' },
      { key: 'speed',      label: 'Vitesse' },
    ],
  },
  {
    label: 'Technique',
    stats: [
      { key: 'passing',  label: 'Passe' },
      { key: 'kicking',  label: 'Coup de pied' },
      { key: 'scrum',    label: 'Mêlée' },
      { key: 'lineout',  label: 'Touche' },
      { key: 'rucking',  label: 'Ruck' },
    ],
  },
  {
    label: 'Défense',
    stats: [
      { key: 'tackling',    label: 'Plaquage' },
      { key: 'breaking',    label: 'Percussion' },
      { key: 'def_reading', label: 'Lecture déf.' },
    ],
  },
  {
    label: 'Mental',
    stats: [
      { key: 'discipline', label: 'Discipline' },
      { key: 'composure',  label: 'Sang-froid' },
    ],
  },
]

const ALL_STAT_KEYS = STAT_GROUPS.flatMap((g) => g.stats.map((s) => s.key))

const emptyFocusStats = () => Object.fromEntries(ALL_STAT_KEYS.map((k) => [k, 0]))

export default function Entrainement({ session }) {
  const navigate = useNavigate()
  const [clubId, setClubId] = useState(null)
  const [trainingFacilityLevel, setTrainingFacilityLevel] = useState(0)
  const [activeTab, setActiveTab] = useState('avants')
  const [plans, setPlans] = useState({
    avants:    { id: null, focus_stats: emptyFocusStats() },
    arrieres:  { id: null, focus_stats: emptyFocusStats() },
    charniere: { id: null, focus_stats: emptyFocusStats() },
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedTab, setSavedTab] = useState(null)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: club } = await supabase
      .from('clubs')
      .select('id, training_facility_level')
      .eq('owner_user_id', session.user.id)
      .single()

    if (!club) { navigate('/create-club', { replace: true }); return }
    setClubId(club.id)
    setTrainingFacilityLevel(club.training_facility_level ?? 0)

    const { data } = await supabase
      .from('training_plans')
      .select('id, target_group, focus_stats')
      .eq('club_id', club.id)

    if (data?.length) {
      setPlans((prev) => {
        const next = { ...prev }
        data.forEach((row) => {
          const uiKey = DB_TO_KEY[row.target_group]
          if (!uiKey) return
          const fs = emptyFocusStats()
          const saved = row.focus_stats ?? {}
          ALL_STAT_KEYS.forEach((k) => { fs[k] = saved[k] ?? 0 })
          next[uiKey] = { id: row.id, focus_stats: fs }
        })
        return next
      })
    }
    setLoading(false)
  }

  const usedSlots = (progKey) =>
    Object.values(plans[progKey].focus_stats).reduce((a, b) => a + b, 0)

  const handleSlot = (statKey, delta) => {
    setSavedTab(null)
    setPlans((prev) => {
      const fs = prev[activeTab].focus_stats
      const cur = fs[statKey]
      const total = usedSlots(activeTab)
      const next = cur + delta
      if (next < 0) return prev
      if (delta > 0 && total >= MAX_SLOTS) return prev
      return {
        ...prev,
        [activeTab]: {
          ...prev[activeTab],
          focus_stats: { ...fs, [statKey]: next },
        },
      }
    })
  }

  const handleSave = async () => {
    setSaving(true)
    const plan = plans[activeTab]
    const dbKey = PROGRAMS.find((p) => p.key === activeTab)?.dbKey
    const payload = {
      club_id: clubId,
      target_group: dbKey,
      focus_stats: plan.focus_stats,
    }

    if (plan.id) {
      await supabase.from('training_plans').update({ focus_stats: plan.focus_stats }).eq('id', plan.id)
    } else {
      const { data } = await supabase.from('training_plans').insert(payload).select('id').single()
      if (data) {
        setPlans((prev) => ({ ...prev, [activeTab]: { ...prev[activeTab], id: data.id } }))
      }
    }
    setSaving(false)
    setSavedTab(activeTab)
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  const prog = PROGRAMS.find((p) => p.key === activeTab)
  const used = loading ? 0 : usedSlots(activeTab)
  const remaining = MAX_SLOTS - used
  const energyCost = used * ENERGY_PER_SLOT
  const netEnergy = DAILY_RECOVERY - energyCost

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">

        <div className="page-title-row">
          <h2 className="page-title">Entraînement</h2>
          <span className="page-subtitle">Tick nocturne · chaque nuit à 4h</span>
        </div>

        {/* Programme collectif */}
        <div className="training-section-title">Programme collectif</div>

        <div className="filter-tabs" style={{ marginBottom: 20 }}>
          {PROGRAMS.map((p) => {
            const u = loading ? 0 : usedSlots(p.key)
            return (
              <button
                key={p.key}
                className={`filter-tab${activeTab === p.key ? ' active' : ''}`}
                style={activeTab === p.key ? { borderColor: p.color, color: p.color } : {}}
                onClick={() => setActiveTab(p.key)}
              >
                {p.label}
                {u > 0 && (
                  <span className="filter-count" style={activeTab === p.key ? { background: p.color } : {}}>
                    {u}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>Chargement…</p>
        ) : (
          <div className="card training-card">

            {/* Header */}
            <div className="training-header">
              <div>
                <span className="training-prog-label" style={{ color: prog.color }}>{prog.label}</span>
                <p className="training-prog-desc">{prog.desc}</p>
              </div>

              <div className="training-meta-right">
                <div className="training-kpi-box">
                  <span className="training-kpi-value" style={{ color: energyCost > 0 ? '#e74c3c' : '#aaa' }}>
                    −{energyCost}%
                  </span>
                  <span className="training-kpi-label">Coût / jour</span>
                </div>
                <div className="training-kpi-sep">vs</div>
                <div className="training-kpi-box">
                  <span className="training-kpi-value" style={{ color: '#1B7A4A' }}>+{DAILY_RECOVERY}%</span>
                  <span className="training-kpi-label">Récup. / jour</span>
                </div>
                <div className={`training-net-box ${netEnergy >= 0 ? 'net-pos' : 'net-neg'}`}>
                  <span className="training-net-value">
                    {netEnergy >= 0 ? '+' : ''}{netEnergy}%
                  </span>
                  <span className="training-net-label">Net énergie</span>
                </div>
              </div>
            </div>

            {/* Slots bar */}
            <div className="training-slots-header">
              <span className="training-slots-text">
                <strong style={{ color: used === MAX_SLOTS ? prog.color : '#1A1A2E' }}>{used}</strong>
                <span style={{ color: '#aaa' }}> / {MAX_SLOTS} slots utilisés</span>
              </span>
              {remaining > 0 && (
                <span className="training-slots-remaining">{remaining} restant{remaining > 1 ? 's' : ''}</span>
              )}
              {remaining === 0 && (
                <span className="training-slots-full" style={{ color: prog.color }}>Programme complet</span>
              )}
            </div>

            <div className="training-slots-bar">
              {Array.from({ length: MAX_SLOTS }).map((_, i) => (
                <div
                  key={i}
                  className="training-slot-pip"
                  style={{ background: i < used ? prog.color : '#e8e8e8' }}
                />
              ))}
            </div>

            {/* Stats grid by group */}
            <div className="training-groups">
              {STAT_GROUPS.map((group) => (
                <div key={group.label} className="training-group">
                  <div className="training-group-label">{group.label}</div>
                  {group.stats.map((s) => {
                    const val = plans[activeTab].focus_stats[s.key]
                    const canAdd = remaining > 0
                    return (
                      <div key={s.key} className="training-stat-row">
                        <span className="training-stat-label">{s.label}</span>
                        <div className="training-stat-controls">
                          <button
                            className="training-btn-minus"
                            onClick={() => handleSlot(s.key, -1)}
                            disabled={val === 0}
                            aria-label={`Réduire ${s.label}`}
                          >−</button>
                          <span
                            className="training-stat-val"
                            style={{
                              color: val > 0 ? prog.color : '#ccc',
                              fontWeight: val > 0 ? 700 : 400,
                            }}
                          >
                            {val}
                          </span>
                          <button
                            className="training-btn-plus"
                            onClick={() => handleSlot(s.key, 1)}
                            disabled={!canAdd}
                            style={{
                              borderColor: canAdd ? prog.color : '#ddd',
                              color: canAdd ? prog.color : '#ccc',
                            }}
                            aria-label={`Augmenter ${s.label}`}
                          >+</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            <div className="tactic-actions" style={{ marginTop: 24 }}>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Sauvegarde…' : savedTab === activeTab ? 'Sauvegardé ✓' : 'Sauvegarder'}
              </button>
              {used > 0 && (
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setPlans((prev) => ({
                      ...prev,
                      [activeTab]: { ...prev[activeTab], focus_stats: emptyFocusStats() },
                    }))
                    setSavedTab(null)
                  }}
                  disabled={saving}
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>
        )}

        {/* Entraînement individuel — locked */}
        <div className="training-section-title" style={{ marginTop: 32 }}>Entraînement individuel</div>
        <div className="card training-locked-card">
          <div className="training-locked-icon">
            <svg viewBox="0 0 24 24" fill="none" width="28" height="28">
              <rect x="5" y="11" width="14" height="10" rx="2" stroke="#bbb" strokeWidth="2"/>
              <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#bbb" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <p className="training-locked-title">
              {trainingFacilityLevel > 0 ? 'Centre d\'entraînement construit' : 'Nécessite un centre d\'entraînement'}
            </p>
            <p className="training-locked-desc">
              Assignez des séances individuelles à vos joueurs pour cibler leurs faiblesses.
              {trainingFacilityLevel > 0
                ? ' Votre centre d\'entraînement booste déjà l\'entraînement collectif en attendant.'
                : ' '}
              {trainingFacilityLevel === 0 && (
                <>Construisez-en un dans les <Link to="/infrastructure">Infrastructures</Link>.</>
              )}
            </p>
            <span className="training-locked-badge">Bientôt disponible</span>
          </div>
        </div>

      </div>
    </Layout>
  )
}

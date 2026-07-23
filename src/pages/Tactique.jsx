import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'

const DEFAULT_SLIDERS = {
  play_style: 50,
  scrum_aggression: 50,
  lineout_aggression: 50,
  tempo: 50,
}

const SLIDER_META = [
  {
    key: 'play_style',
    label: 'Style de jeu',
    left: 'Jeu au pied',
    right: 'Jeu à la main',
  },
  {
    key: 'scrum_aggression',
    label: 'Mêlée',
    left: 'Conservatrice',
    right: 'Agressive',
  },
  {
    key: 'lineout_aggression',
    label: 'Touche',
    left: 'Conservatrice',
    right: 'Agressive',
  },
  {
    key: 'tempo',
    label: 'Tempo',
    left: 'Lent',
    right: 'Rapide',
  },
]

function TacticSlider({ meta, value, onChange, disabled }) {
  return (
    <div className="tactic-slider-row">
      <div className="tactic-slider-header">
        <span className="tactic-slider-label">{meta.label}</span>
        <span className="tactic-slider-value">{value}</span>
      </div>
      <div className="tactic-slider-track-row">
        <span className="tactic-pole tactic-pole-left">{meta.left}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(meta.key, Number(e.target.value))}
          disabled={disabled}
          className="tactic-range"
          style={{ '--val': `${value}%` }}
        />
        <span className="tactic-pole tactic-pole-right">{meta.right}</span>
      </div>
    </div>
  )
}

export default function Tactique({ session }) {
  const navigate = useNavigate()
  const [clubId, setClubId] = useState(null)
  const [tactics, setTactics] = useState([])
  const [activeTacticId, setActiveTacticId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [sliders, setSliders] = useState(DEFAULT_SLIDERS)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: club } = await supabase
      .from('clubs')
      .select('id')
      .eq('owner_user_id', session.user.id)
      .single()

    if (!club) { navigate('/create-club', { replace: true }); return }
    setClubId(club.id)

    const { data } = await supabase
      .from('tactics')
      .select('*')
      .eq('club_id', club.id)
      .order('created_at', { ascending: true })

    const list = data ?? []
    setTactics(list)

    const active = list.find((t) => t.is_active)
    if (active) {
      setActiveTacticId(active.id)
      selectTactic(active)
    } else if (list.length > 0) {
      selectTactic(list[0])
    } else {
      startNew()
    }
    setLoading(false)
  }

  const selectTactic = (t) => {
    setSelectedId(t.id)
    setName(t.name ?? '')
    setSliders({
      play_style: t.play_style ?? 50,
      scrum_aggression: t.scrum_aggression ?? 50,
      lineout_aggression: t.lineout_aggression ?? 50,
      tempo: t.tempo ?? 50,
    })
    setIsNew(false)
  }

  const startNew = () => {
    setSelectedId(null)
    setName('')
    setSliders(DEFAULT_SLIDERS)
    setIsNew(true)
  }

  const handleSlider = (key, val) => setSliders((s) => ({ ...s, [key]: val }))

  const handleSave = async () => {
    if (!name.trim()) { setError('Donnez un nom à cette tactique.'); return }
    setSaving(true)
    setError(null)

    if (isNew) {
      const { data, error: err } = await supabase
        .from('tactics')
        .insert({ club_id: clubId, name: name.trim(), ...sliders, is_active: tactics.length === 0 })
        .select()
        .single()

      if (err) { setError('Erreur lors de la sauvegarde.'); setSaving(false); return }
      const updated = [...tactics, data]
      setTactics(updated)
      if (data.is_active) setActiveTacticId(data.id)
      selectTactic(data)
    } else {
      const { error: err } = await supabase
        .from('tactics')
        .update({ name: name.trim(), ...sliders })
        .eq('id', selectedId)

      if (err) { setError('Erreur lors de la sauvegarde.'); setSaving(false); return }
      setTactics((prev) => prev.map((t) => t.id === selectedId ? { ...t, name: name.trim(), ...sliders } : t))
    }
    setSaving(false)
  }

  const handleSetActive = async () => {
    if (!selectedId) return
    setSaving(true)
    await supabase.from('tactics').update({ is_active: false }).eq('club_id', clubId)
    await supabase.from('tactics').update({ is_active: true }).eq('id', selectedId)
    setActiveTacticId(selectedId)
    setTactics((prev) => prev.map((t) => ({ ...t, is_active: t.id === selectedId })))
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!selectedId) return
    if (!window.confirm('Supprimer cette tactique ?')) return
    await supabase.from('tactics').delete().eq('id', selectedId)
    const updated = tactics.filter((t) => t.id !== selectedId)
    setTactics(updated)
    if (updated.length > 0) selectTactic(updated[0])
    else startNew()
    if (activeTacticId === selectedId) setActiveTacticId(null)
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">
        <div className="page-title-row">
          <h2 className="page-title">Tactique</h2>
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>Chargement…</p>
        ) : (
          <div className="tactic-layout">

            {/* Left: tactic list */}
            <div className="tactic-list-panel">
              <div className="tactic-list-header">
                <span className="tactic-list-title">Mes tactiques</span>
                <button className="btn-small btn-outline" onClick={startNew}>+ Nouvelle</button>
              </div>

              {tactics.length === 0 && !isNew && (
                <p className="tactic-empty">Aucune tactique. Créez-en une.</p>
              )}

              {tactics.map((t) => (
                <button
                  key={t.id}
                  className={`tactic-list-item${selectedId === t.id && !isNew ? ' active' : ''}`}
                  onClick={() => selectTactic(t)}
                >
                  <span className="tactic-item-name">{t.name}</span>
                  {t.is_active && <span className="badge-active">Active</span>}
                </button>
              ))}

              {isNew && (
                <div className="tactic-list-item active tactic-new-item">
                  <span className="tactic-item-name" style={{ opacity: 0.6 }}>Nouvelle tactique</span>
                </div>
              )}
            </div>

            {/* Right: editor */}
            <div className="tactic-editor-panel">
              <div className="card">
                <div className="tactic-editor-header">
                  <input
                    className="tactic-name-input"
                    placeholder="Nom de la tactique…"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  {!isNew && selectedId === activeTacticId && (
                    <span className="badge-active">Tactique active</span>
                  )}
                </div>

                <div className="tactic-sliders">
                  {SLIDER_META.map((meta) => (
                    <TacticSlider
                      key={meta.key}
                      meta={meta}
                      value={sliders[meta.key]}
                      onChange={handleSlider}
                      disabled={saving}
                    />
                  ))}
                </div>

                {error && <p className="error-text" style={{ marginTop: 8 }}>{error}</p>}

                <div className="tactic-actions">
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Sauvegarde…' : isNew ? 'Créer' : 'Sauvegarder'}
                  </button>
                  {!isNew && selectedId !== activeTacticId && (
                    <button className="btn btn-outline" onClick={handleSetActive} disabled={saving}>
                      Définir comme active
                    </button>
                  )}
                  {!isNew && (
                    <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </Layout>
  )
}

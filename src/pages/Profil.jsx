import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'
import { TIMEZONES } from '../lib/timezones'
import JerseyPreview from '../components/JerseyPreview'

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Profil({ session }) {
  // Manager fields
  const [displayName, setDisplayName] = useState('')
  const [timezone, setTimezone]       = useState('Europe/Paris')

  // Club fields
  const [clubId, setClubId]               = useState(null)
  const [clubName, setClubName]           = useState('')
  const [stadiumName, setStadiumName]     = useState('')
  const [region, setRegion]               = useState('')
  const [primaryColor, setPrimaryColor]   = useState('#1B7A4A')
  const [secondaryColor, setSecondaryColor] = useState('#F5820D')

  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState(null) // { type: 'ok'|'err', text }

  const email = session?.user?.email ?? ''
  const memberSince = session?.user?.created_at
    ? new Date(session.user.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : '—'
  const avatarLetter = (displayName || email)?.[0]?.toUpperCase() ?? '?'

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const userId = session.user.id

    // Load profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, timezone')
      .eq('id', userId)
      .maybeSingle()

    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setTimezone(profile.timezone ?? 'Europe/Paris')
    }

    // Load club
    const { data: club } = await supabase
      .from('clubs')
      .select('id, name, stadium_name, region, primary_color, secondary_color')
      .eq('owner_user_id', userId)
      .maybeSingle()

    if (club) {
      setClubId(club.id)
      setClubName(club.name ?? '')
      setStadiumName(club.stadium_name ?? '')
      setRegion(club.region ?? '')
      setPrimaryColor(club.primary_color ?? '#1B7A4A')
      setSecondaryColor(club.secondary_color ?? '#F5820D')
    }

    setLoading(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveMsg(null)

    try {
      // Upsert profile
      const { error: profErr } = await supabase
        .from('profiles')
        .upsert({
          id:           session.user.id,
          display_name: displayName.trim() || null,
          timezone,
          updated_at:   new Date().toISOString(),
        }, { onConflict: 'id' })

      if (profErr) throw profErr

      // Update club if exists
      if (clubId) {
        const { error: clubErr } = await supabase
          .from('clubs')
          .update({
            name:            clubName.trim(),
            stadium_name:    stadiumName.trim(),
            region:          region.trim() || null,
            primary_color:   primaryColor,
            secondary_color: secondaryColor,
          })
          .eq('id', clubId)

        if (clubErr) throw clubErr
      }

      setSaveMsg({ type: 'ok', text: 'Profil sauvegardé.' })
    } catch (err) {
      setSaveMsg({ type: 'err', text: err.message ?? 'Erreur lors de la sauvegarde.' })
    } finally {
      setSaving(false)
    }
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  if (loading) {
    return (
      <Layout onLogout={handleLogout}>
        <div className="page-container">
          <p style={{ color: '#888' }}>Chargement…</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container profil-page">

        <div className="page-title-row">
          <h2 className="page-title">Profil</h2>
          <span className="page-subtitle">Manager depuis {memberSince}</span>
        </div>

        <form onSubmit={handleSave}>

          {/* ── Section manager ─────────────────────────────────────────── */}
          <div className="profil-section-label">Profil manager</div>
          <div className="card profil-card">

            <div className="profil-avatar-row">
              <div className="profil-avatar">{avatarLetter}</div>
              <div>
                <p className="profil-email-text">{email}</p>
                <p className="profil-member-since">Manager depuis {memberSince}</p>
              </div>
            </div>

            <div className="profil-fields">
              <div className="profil-field">
                <label className="profil-label">Nom du manager</label>
                <input
                  type="text"
                  className="input profil-input"
                  placeholder="Votre nom ou pseudo"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={50}
                />
              </div>

              <div className="profil-field">
                <label className="profil-label">Email</label>
                <input
                  type="email"
                  className="input profil-input profil-input-readonly"
                  value={email}
                  readOnly
                  tabIndex={-1}
                />
              </div>

              <div className="profil-field">
                <label className="profil-label">Fuseau horaire</label>
                <select
                  className="profil-select"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {TIMEZONES.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Section club ─────────────────────────────────────────────── */}
          {clubId && (
            <>
              <div className="profil-section-label" style={{ marginTop: 28 }}>Mon club</div>
              <div className="card profil-card">
                <div className="profil-fields">
                  <div className="profil-field">
                    <label className="profil-label">Nom du club</label>
                    <input
                      type="text"
                      className="input profil-input"
                      value={clubName}
                      onChange={(e) => setClubName(e.target.value)}
                      maxLength={60}
                      required
                    />
                  </div>

                  <div className="profil-field">
                    <label className="profil-label">Nom du stade</label>
                    <input
                      type="text"
                      className="input profil-input"
                      value={stadiumName}
                      onChange={(e) => setStadiumName(e.target.value)}
                      maxLength={60}
                    />
                  </div>

                  <div className="profil-field">
                    <label className="profil-label">Région</label>
                    <input
                      type="text"
                      className="input profil-input"
                      placeholder="Ex : Occitanie"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      maxLength={60}
                    />
                  </div>
                </div>

                <div className="profil-field" style={{ marginTop: 4 }}>
                  <label className="profil-label">Couleurs du maillot</label>
                  <div className="profil-colors-row">
                    <div className="profil-color-picker">
                      <input
                        type="color"
                        className="color-input"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        title="Couleur principale"
                      />
                      <span className="color-picker-label">Principale</span>
                    </div>

                    <div className="profil-jersey-preview">
                      <JerseyPreview primary={primaryColor} secondary={secondaryColor} />
                      <div className="profil-color-dots">
                        <span className="profil-color-dot" style={{ background: primaryColor }} />
                        <span className="profil-color-hex">{primaryColor}</span>
                        <span className="profil-color-sep">·</span>
                        <span className="profil-color-dot" style={{ background: secondaryColor }} />
                        <span className="profil-color-hex">{secondaryColor}</span>
                      </div>
                    </div>

                    <div className="profil-color-picker">
                      <input
                        type="color"
                        className="color-input"
                        value={secondaryColor}
                        onChange={(e) => setSecondaryColor(e.target.value)}
                        title="Couleur secondaire"
                      />
                      <span className="color-picker-label">Secondaire</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Save ─────────────────────────────────────────────────────── */}
          {saveMsg && (
            <div className={`profil-save-msg ${saveMsg.type === 'ok' ? 'profil-save-ok' : 'profil-save-err'}`}>
              {saveMsg.type === 'ok' ? '✓' : '⚠'} {saveMsg.text}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary profil-save-btn"
            disabled={saving}
          >
            {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>

        </form>

        {/* ── Logout ───────────────────────────────────────────────────────── */}
        <div className="profil-logout-section">
          <div className="profil-logout-divider" />
          <button className="profil-logout-btn" onClick={handleLogout}>
            <svg viewBox="0 0 20 20" fill="none" width="16" height="16">
              <path d="M7 3H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M13 14l3-4-3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M16 10H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Se déconnecter
          </button>
        </div>

      </div>
    </Layout>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function JerseyPreview({ primary, secondary }) {
  return (
    <svg viewBox="0 0 100 90" width="110" height="99" aria-hidden="true">
      {/* Left half */}
      <path
        d="M50,12 L20,18 L4,34 L17,40 L17,80 L50,80 Z"
        fill={primary}
        stroke="rgba(0,0,0,0.08)"
        strokeWidth="0.5"
      />
      {/* Right half */}
      <path
        d="M50,12 L80,18 L96,34 L83,40 L83,80 L50,80 Z"
        fill={secondary}
        stroke="rgba(0,0,0,0.08)"
        strokeWidth="0.5"
      />
      {/* Collar */}
      <path
        d="M38,13 Q50,24 62,13"
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function CreateClub({ session }) {
  const navigate = useNavigate()
  const [clubName, setClubName] = useState('')
  const [stadiumName, setStadiumName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#1B7A4A')
  const [secondaryColor, setSecondaryColor] = useState('#F5820D')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const findBotClub = async () => {
    // Ligues du tier le plus bas (division la plus haute) vers le haut.
    // On prend la première ligue qui a encore un bot disponible.
    const { data: leagues } = await supabase
      .from('leagues')
      .select('id, tier')
      .order('tier', { ascending: false })

    for (const league of leagues ?? []) {
      const { data: clubs } = await supabase
        .from('clubs')
        .select('id')
        .eq('league_id', league.id)
        .eq('is_bot', true)
        .is('owner_user_id', null)
        .limit(1)

      if (clubs?.length) return clubs[0].id
    }

    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)

    try {
      const botClubId = await findBotClub()

      if (!botClubId) {
        throw new Error('Aucun club disponible pour le moment. Revenez plus tard.')
      }

      const { error: updateError } = await supabase
        .from('clubs')
        .update({
          name: clubName.trim(),
          stadium_name: stadiumName.trim(),
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          is_bot: false,
          owner_user_id: session.user.id,
        })
        .eq('id', botClubId)
        .eq('is_bot', true)

      if (updateError) throw updateError

      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="create-club-card">
        <h1 className="login-title">Ovalia</h1>
        <p className="login-subtitle">Créez votre club de rugby</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nom du club</label>
            <input
              type="text"
              placeholder="Ex : Stade Aurillacois"
              value={clubName}
              onChange={(e) => setClubName(e.target.value)}
              required
              maxLength={60}
              className="input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Nom du stade</label>
            <input
              type="text"
              placeholder="Ex : Stade Jean-Alric"
              value={stadiumName}
              onChange={(e) => setStadiumName(e.target.value)}
              required
              maxLength={60}
              className="input"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Couleurs du maillot</label>
            <div className="color-pickers-row">
              <div className="color-picker-item">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="color-input"
                  title="Couleur principale"
                />
                <span className="color-picker-label">Principale</span>
              </div>

              <div className="jersey-preview">
                <JerseyPreview primary={primaryColor} secondary={secondaryColor} />
              </div>

              <div className="color-picker-item">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="color-input"
                  title="Couleur secondaire"
                />
                <span className="color-picker-label">Secondaire</span>
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Création en cours…' : 'Créer mon club'}
          </button>
        </form>

        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  )
}

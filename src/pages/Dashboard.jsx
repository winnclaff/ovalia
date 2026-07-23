import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'

export default function Dashboard({ session }) {
  const navigate = useNavigate()
  const [club, setClub] = useState(null)
  const [loading, setLoading] = useState(true)

  const handleLogout = async () => { await supabase.auth.signOut() }

  useEffect(() => { loadClub() }, [])

  const loadClub = async () => {
    const { data } = await supabase
      .from('clubs')
      .select('*')
      .eq('owner_user_id', session.user.id)
      .single()

    if (data) {
      setClub(data)
      setLoading(false)
    } else {
      navigate('/create-club', { replace: true })
    }
  }

  if (loading) return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">
        <p style={{ color: '#888' }}>Chargement…</p>
      </div>
    </Layout>
  )
  if (!club) return null

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">

        <div className="page-title-row">
          {club.primary_color && (
            <div className="club-colors">
              <div className="club-color-dot" style={{ background: club.primary_color }} />
              <div className="club-color-dot" style={{ background: club.secondary_color }} />
            </div>
          )}
          <h2 className="page-title">{club.name}</h2>
          <span className="page-subtitle">{club.stadium_name}</span>
        </div>

        <div className="card">
          <div className="stats-row">
            <div className="stat-block">
              <span className="stat-value">{club.balance?.toLocaleString('fr-FR') ?? '—'} €</span>
              <span className="stat-label">Trésorerie</span>
            </div>
            <div className="stat-block">
              <span className="stat-value">{club.supporters_count?.toLocaleString('fr-FR') ?? '—'}</span>
              <span className="stat-label">Supporters</span>
            </div>
            <div className="stat-block">
              <span className="stat-value">{club.reputation ?? '—'}</span>
              <span className="stat-label">Réputation</span>
            </div>
          </div>
        </div>

      </div>
    </Layout>
  )
}

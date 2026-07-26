import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CreateClub from './pages/CreateClub'
import Effectif from './pages/Effectif'
import Ligue from './pages/Ligue'
import Match from './pages/Match'
import Entrainement from './pages/Entrainement'
import Tactique from './pages/Tactique'
import Finances from './pages/Finances'
import Recrutement from './pages/Recrutement'
import Infrastructure from './pages/Infrastructure'
import Profil from './pages/Profil'
import ClubProfile from './pages/ClubProfile'
import MatchDetail from './pages/MatchDetail'
import Statistiques from './pages/Statistiques'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Chargement...</p>
      </div>
    )
  }

  const auth = (el) => session ? el : <Navigate to="/login" />

  return (
    <Routes>
      <Route path="/login"        element={session ? <Navigate to="/" /> : <Login />} />
      <Route path="/create-club"  element={auth(<CreateClub  session={session} />)} />
      <Route path="/"             element={auth(<Dashboard   session={session} />)} />
      <Route path="/effectif"     element={auth(<Effectif    session={session} />)} />
      <Route path="/ligue"        element={auth(<Ligue       session={session} />)} />
      <Route path="/match"        element={auth(<Match       session={session} />)} />
      <Route path="/entrainement" element={auth(<Entrainement session={session} />)} />
      <Route path="/tactique"     element={auth(<Tactique    session={session} />)} />
      <Route path="/finances"     element={auth(<Finances    session={session} />)} />
      <Route path="/recrutement"  element={auth(<Recrutement session={session} />)} />
      <Route path="/infrastructure" element={auth(<Infrastructure session={session} />)} />
      <Route path="/profil"       element={auth(<Profil      session={session} />)} />
      <Route path="/club/:clubId" element={auth(<ClubProfile session={session} />)} />
      <Route path="/match/:matchId" element={auth(<MatchDetail session={session} />)} />
      <Route path="/statistiques" element={auth(<Statistiques session={session} />)} />
    </Routes>
  )
}

export default App

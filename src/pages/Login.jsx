import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    }
    setLoading(false)
  }

  const toggleMode = (e) => { e.preventDefault(); setIsSignUp(!isSignUp) }

  const btnLabel = loading ? '...' : isSignUp ? 'Creer mon compte' : 'Se connecter'

  return (
    <div className="login-container">
      <div className="login-card">
        <h1 className="login-title">Ovalia</h1>
        <p className="login-subtitle">Gestion de rugby en ligne</p>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" />
          <input type="password" placeholder="Mot de passe (6 min.)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="input" />
          <button type="submit" disabled={loading} className="btn-primary">{btnLabel}</button>
        </form>
        {error && <p className="error-text">{error}</p>}
        <p className="toggle-text">
          {isSignUp ? 'Deja un compte ? ' : 'Pas encore de compte ? '}
          <a href="#" onClick={toggleMode} className="toggle-link">{isSignUp ? 'Se connecter' : 'Creer un compte'}</a>
        </p>
      </div>
    </div>
  )
}
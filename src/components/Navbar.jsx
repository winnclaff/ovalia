import { Link, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/effectif', label: 'Effectif' },
  { to: '/ligue', label: 'Ligue' },
]

export default function Navbar({ onLogout }) {
  const { pathname } = useLocation()

  return (
    <header className="navbar">
      <Link to="/" className="navbar-logo">Ovalia</Link>
      <nav className="navbar-links">
        {NAV_LINKS.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`nav-link${pathname === to ? ' active' : ''}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <button onClick={onLogout} className="btn-secondary">
        Déconnexion
      </button>
    </header>
  )
}

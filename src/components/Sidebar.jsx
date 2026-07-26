import { Link, useLocation } from 'react-router-dom'

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconDashboard = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="6" height="6" rx="1.5"/>
    <rect x="9" y="1" width="6" height="6" rx="1.5"/>
    <rect x="1" y="9" width="6" height="6" rx="1.5"/>
    <rect x="9" y="9" width="6" height="6" rx="1.5"/>
  </svg>
)

const IconEffectif = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="4.5" r="2.5"/>
    <circle cx="2.5" cy="6.5" r="1.8" opacity="0.7"/>
    <circle cx="13.5" cy="6.5" r="1.8" opacity="0.7"/>
    <path d="M4 15c0-2.2 1.8-4 4-4s4 1.8 4 4H4z"/>
    <path d="M.5 14c0-1.5.9-2.6 2.2-3" stroke="currentColor" strokeWidth="1.1" fill="none" opacity="0.7"/>
    <path d="M15.5 14c0-1.5-.9-2.6-2.2-3" stroke="currentColor" strokeWidth="1.1" fill="none" opacity="0.7"/>
  </svg>
)

const IconLigue = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3.5 1h9v5a4.5 4.5 0 01-9 0V1z"/>
    <path d="M1.5 2.5h2M12.5 2.5h2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <rect x="6" y="11" width="4" height="2" rx="0.5"/>
    <rect x="4.5" y="14" width="7" height="1.5" rx="0.75"/>
  </svg>
)

const IconMatch = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <ellipse cx="8" cy="8" rx="6.5" ry="4" transform="rotate(-40 8 8)"/>
    <line x1="5.5" y1="10.5" x2="10.5" y2="5.5"/>
    <line x1="5" y1="8" x2="7.5" y2="5.5" opacity="0.55"/>
    <line x1="8.5" y1="10.5" x2="11" y2="8" opacity="0.55"/>
  </svg>
)

const IconEntrainement = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M9.8 1.2L3.5 9h5L6.2 14.8l8.3-7.8H9L9.8 1.2z"/>
  </svg>
)

const IconTactique = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.4"/>
    <circle cx="5" cy="5.5" r="1.8" fill="currentColor"/>
    <circle cx="11.5" cy="10.5" r="1.8" fill="currentColor"/>
    <path d="M5 5.5 C5 8 7 8 8 8 C9 8 11.5 8 11.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2 1.5"/>
  </svg>
)

const IconFinances = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="8.5" width="3.5" height="6.5" rx="1"/>
    <rect x="6.25" y="5" width="3.5" height="10" rx="1"/>
    <rect x="11.5" y="1.5" width="3.5" height="13.5" rx="1"/>
  </svg>
)

const IconStatistiques = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1.5 13.5h13"/>
    <path d="M2.5 11l3.5-4 3 2.5L14 3.5"/>
    <circle cx="6" cy="7" r="1.1" fill="currentColor" stroke="none"/>
    <circle cx="9.5" cy="9.5" r="1.1" fill="currentColor" stroke="none"/>
  </svg>
)

const IconInfrastructure = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 15V6.5L6 3.5V15H2z" opacity="0.7"/>
    <path d="M6.5 15V1.5L10.5 4V15H6.5z"/>
    <path d="M11 15V6L14 8V15h-3z" opacity="0.7"/>
    <rect x="3" y="8" width="1.3" height="1.3"/>
    <rect x="7.3" y="6" width="1.3" height="1.3" fill="#fff" opacity="0.8"/>
    <rect x="7.3" y="9" width="1.3" height="1.3" fill="#fff" opacity="0.8"/>
  </svg>
)

const IconRecrutement = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="9.5" y1="9.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <line x1="6" y1="3.5" x2="6" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="3.5" y1="6" x2="8.5" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const IconProfil = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="5" r="3"/>
    <path d="M2 15c0-3.3 2.7-6 6-6s6 2.7 6 6H2z"/>
  </svg>
)

const IconLogout = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M6 2H3a1 1 0 00-1 1v9a1 1 0 001 1h3"/>
    <path d="M10 10.5l3-3-3-3"/>
    <path d="M13 7.5H6"/>
  </svg>
)

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/',            label: 'Dashboard',    Icon: IconDashboard,    exact: true },
  { to: '/effectif',    label: 'Effectif',     Icon: IconEffectif },
  { to: '/ligue',       label: 'Ligue',        Icon: IconLigue },
  { to: '/match',       label: 'Match',        Icon: IconMatch },
  { to: '/statistiques', label: 'Statistiques', Icon: IconStatistiques },
  { to: '/entrainement',label: 'Entraînement', Icon: IconEntrainement },
  { to: '/tactique',    label: 'Tactique',     Icon: IconTactique },
  { to: '/finances',    label: 'Finances',     Icon: IconFinances },
  { to: '/recrutement', label: 'Recrutement',  Icon: IconRecrutement },
  { to: '/infrastructure', label: 'Infrastructures', Icon: IconInfrastructure },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar({ onLogout }) {
  const { pathname } = useLocation()

  const isActive = ({ to, exact }) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + '/')

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-header">
        <Link to="/" className="sidebar-logo">
          <span className="sidebar-logo-accent">O</span>valia
        </Link>
        <p className="sidebar-tagline">Rugby Manager</p>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`sidebar-link${isActive(item) ? ' active' : ''}`}
          >
            <span className="sidebar-icon"><item.Icon /></span>
            <span className="sidebar-label">{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Footer: Profil + Logout */}
      <div className="sidebar-footer">
        <div className="sidebar-divider" />
        <Link
          to="/profil"
          className={`sidebar-link${pathname === '/profil' ? ' active' : ''}`}
        >
          <span className="sidebar-icon"><IconProfil /></span>
          <span className="sidebar-label">Profil</span>
        </Link>
        <button className="sidebar-logout" onClick={onLogout}>
          <span className="sidebar-icon"><IconLogout /></span>
          <span>Déconnexion</span>
        </button>
      </div>
    </aside>
  )
}

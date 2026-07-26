import { Link } from 'react-router-dom'

export default function ClubLink({ club, className = '' }) {
  if (!club?.id) return <span className={className}>{club?.name ?? '—'}</span>

  return (
    <Link to={`/club/${club.id}`} className={`club-link ${className}`.trim()}>
      {club.name ?? '—'}
      {club.is_bot && <span className="bot-badge">(bot)</span>}
    </Link>
  )
}

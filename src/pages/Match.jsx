import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'

// ─── Config ───────────────────────────────────────────────────────────────────

const POSITION_SLOTS = [
  { number: 1,  label: 'Pilier gauche',      position: 'PROP',       group: 'Avants'   },
  { number: 2,  label: 'Talonneur',           position: 'HOOKER',     group: 'Avants'   },
  { number: 3,  label: 'Pilier droit',        position: 'PROP',       group: 'Avants'   },
  { number: 4,  label: '2ème ligne',          position: 'LOCK',       group: 'Avants'   },
  { number: 5,  label: '2ème ligne',          position: 'LOCK',       group: 'Avants'   },
  { number: 6,  label: '3ème ligne aile',     position: 'FLANKER',    group: 'Avants'   },
  { number: 7,  label: '3ème ligne aile',     position: 'FLANKER',    group: 'Avants'   },
  { number: 8,  label: 'Numéro 8',            position: 'NUMBER_8',   group: 'Avants'   },
  { number: 9,  label: 'Demi de mêlée',       position: 'SCRUM_HALF', group: 'Arrières' },
  { number: 10, label: 'Ouvreur',             position: 'FLY_HALF',   group: 'Arrières' },
  { number: 11, label: 'Ailier gauche',       position: 'WING',       group: 'Arrières' },
  { number: 12, label: 'Centre',              position: 'CENTER',     group: 'Arrières' },
  { number: 13, label: 'Centre',              position: 'CENTER',     group: 'Arrières' },
  { number: 14, label: 'Ailier droit',        position: 'WING',       group: 'Arrières' },
  { number: 15, label: 'Arrière',             position: 'FULLBACK',   group: 'Arrières' },
]

const BENCH_SLOTS = [
  { number: 16, label: 'Remplaçant pilier',    position: 'PROP'    },
  { number: 17, label: 'Remplaçant pilier',    position: 'PROP'    },
  { number: 18, label: 'Remplaçant talonneur', position: 'HOOKER'  },
  { number: 19, label: 'Remplaçant',           position: null      },
  { number: 20, label: 'Remplaçant',           position: null      },
  { number: 21, label: 'Remplaçant',           position: null      },
  { number: 22, label: 'Remplaçant',           position: null      },
  { number: 23, label: 'Remplaçant',           position: null      },
]

const ALL_STATS = ['endurance','strength','agility','speed','passing','kicking',
  'scrum','lineout','rucking','tackling','breaking','def_reading','discipline','composure']

const EVENT_ICONS = {
  try:           '🏉',
  conversion:    '✅',
  penalty_goal:  '🎯',
  drop_goal:     '🎯',
  yellow_card:   '🟡',
  red_card:      '🔴',
  injury:        '🚑',
  substitution:  '🔄',
  turnover:      '↩️',
  final_whistle: '🏁',
  default:       '•',
}

const CONTRACT_DURATIONS = [3, 6, 12, 18, 24]
const FRIENDLY_SLOTS = ['18:00','19:00','20:00','21:00']

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getOverall = (p) => {
  if (!p) return 0
  const vals = ALL_STATS.map((s) => p[s] ?? 0)
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

const playerName = (p) => {
  if (!p) return '—'
  if (p.first_name || p.last_name) return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  return p.name ?? `Joueur #${p.id}`
}

const normalPos = (pos) => (pos ?? '').toUpperCase().replace(/[-\s]/g, '_')

const posMatch = (player, slot) => {
  if (!slot?.position) return true
  return normalPos(player.position) === slot.position
}

const fmt = (n) =>
  (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

// ─── Lineup sub-components ────────────────────────────────────────────────────

function LineupRow({ slot, player, onOpen, onRemove }) {
  return (
    <div className={`lineup-row${player ? ' lineup-row-filled' : ''}`}>
      <span className="lineup-number">{slot.number}</span>
      <span className="lineup-pos-label">{slot.label}</span>
      {player ? (
        <>
          <span className="lineup-player-name">{playerName(player)}</span>
          <span className="lineup-overall">{getOverall(player)}</span>
          <button className="lineup-btn-remove" onClick={onRemove}>✕</button>
        </>
      ) : (
        <button className="lineup-btn-assign" onClick={onOpen}>+ Choisir</button>
      )}
    </div>
  )
}

function PlayerPickerModal({ slot, players, currentPlayer, onSelect, onClose }) {
  const [search, setSearch] = useState('')
  const filtered = players
    .filter((p) => playerName(p).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const af = posMatch(a, slot) ? 0 : 1
      const bf = posMatch(b, slot) ? 0 : 1
      return af - bf || getOverall(b) - getOverall(a)
    })

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-player-name" style={{ fontSize: 16 }}>
            Poste {slot?.number} — {slot?.label}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <input
          className="picker-search" placeholder="Rechercher…"
          value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
        />
        <div className="picker-list">
          {filtered.length === 0 ? (
            <p style={{ color: '#aaa', padding: '16px 0', textAlign: 'center' }}>Aucun joueur disponible</p>
          ) : filtered.map((p) => {
            const fits = posMatch(p, slot)
            const overall = getOverall(p)
            return (
              <button key={p.id}
                className={`picker-player-row${currentPlayer?.id === p.id ? ' picker-current' : ''}`}
                onClick={() => onSelect(p)}
              >
                <span className={`picker-fit-dot ${fits ? 'fit' : 'nofit'}`} />
                <span className="picker-name">{playerName(p)}</span>
                <span className="picker-pos">{p.position ?? '—'}</span>
                <span className="picker-overall" style={{ color: overall >= 70 ? '#1B7A4A' : overall >= 55 ? '#F5820D' : '#e74c3c' }}>
                  {overall}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SubsTab({ subs, setSubs, lineup, positionSlots, benchSlots }) {
  const filledStarters = positionSlots.filter((s) => lineup[s.number] !== null)
  const filledBench    = benchSlots.filter((s) => lineup[s.number] !== null)
  return (
    <div className="card" style={{ padding: 20 }}>
      <p className="training-desc" style={{ marginBottom: 16 }}>
        Planifiez jusqu'à 8 remplacements. Indiquez le sortant, l'entrant et la minute.
      </p>
      {subs.length === 0 && <p style={{ color: '#aaa', marginBottom: 16 }}>Aucun remplacement planifié.</p>}
      {subs.map((sub, i) => (
        <div key={i} className="sub-row">
          <span className="sub-index">{i + 1}</span>
          <label className="sub-label">Sortant</label>
          <select className="sub-select" value={sub.from}
            onChange={(e) => setSubs((p) => p.map((s, idx) => idx === i ? { ...s, from: Number(e.target.value) } : s))}>
            {filledStarters.map((s) => (
              <option key={s.number} value={s.number}>#{s.number} {playerName(lineup[s.number])}</option>
            ))}
          </select>
          <label className="sub-label">Entrant</label>
          <select className="sub-select" value={sub.to}
            onChange={(e) => setSubs((p) => p.map((s, idx) => idx === i ? { ...s, to: Number(e.target.value) } : s))}>
            {filledBench.map((s) => (
              <option key={s.number} value={s.number}>#{s.number} {playerName(lineup[s.number])}</option>
            ))}
          </select>
          <label className="sub-label">Minute</label>
          <select className="sub-select sub-minute" value={sub.minute}
            onChange={(e) => setSubs((p) => p.map((s, idx) => idx === i ? { ...s, minute: e.target.value === 'HT' ? 'HT' : Number(e.target.value) } : s))}>
            <option value="HT">Mi-temps</option>
            {[10,20,30,40,50,60,65,70,75,80].map((m) => <option key={m} value={m}>{m}'</option>)}
          </select>
          <button className="lineup-btn-remove"
            onClick={() => setSubs((p) => p.filter((_, idx) => idx !== i))}>✕</button>
        </div>
      ))}
      {subs.length < 8 && (
        <button className="btn-small btn-outline" style={{ marginTop: 12 }}
          onClick={() => setSubs((p) => [...p, { from: 1, to: 16, minute: 60 }])}>
          + Ajouter un remplacement
        </button>
      )}
    </div>
  )
}

// ─── Live match view ──────────────────────────────────────────────────────────

function LiveMatchView({ match, club, onBack }) {
  const [events, setEvents]         = useState([])
  const [visibleEvents, setVisible] = useState([])
  const [liveScore, setLiveScore]   = useState({ home: 0, away: 0 })
  const [finished, setFinished]     = useState(false)
  const bottomRef = useRef(null)

  const isHome = match.home_club_id === club?.id

  const loadEvents = useCallback(async () => {
    const now = new Date().toISOString()
    const { data } = await supabase
      .from('match_events')
      .select('*')
      .eq('match_id', match.id)
      .lte('display_at', now)
      .order('game_minute', { ascending: true })

    if (!data) return
    setVisible(data)
    if (data.length) {
      const last = data[data.length - 1]
      setLiveScore({ home: last.home_score ?? 0, away: last.away_score ?? 0 })
      setFinished(last.event_type === 'final_whistle')
    }
  }, [match.id])

  useEffect(() => {
    loadEvents()
    const timer = setInterval(loadEvents, 30_000)

    // Realtime subscription
    const channel = supabase
      .channel(`match-${match.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'match_events',
        filter: `match_id=eq.${match.id}`,
      }, () => loadEvents())
      .subscribe()

    return () => {
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [loadEvents])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visibleEvents.length])

  const homeClubName = match.home_club?.name ?? '?'
  const awayClubName = match.away_club?.name ?? '?'

  return (
    <div className="live-match-wrapper">
      {/* Scoreboard */}
      <div className="live-scoreboard card">
        <div className="live-score-row">
          <span className={`live-team-name${isHome ? ' live-team-you' : ''}`}>{homeClubName}</span>
          <div className="live-score-box">
            <span className="live-score-num">{liveScore.home}</span>
            <span className="live-score-sep">–</span>
            <span className="live-score-num">{liveScore.away}</span>
          </div>
          <span className={`live-team-name${!isHome ? ' live-team-you' : ''}`}>{awayClubName}</span>
        </div>
        <div className="live-status-row">
          {finished
            ? <span className="live-badge live-badge-done">Match terminé</span>
            : <span className="live-badge live-badge-live">● En direct</span>
          }
          {match.scheduled_at && (
            <span className="live-date">
              {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
                .format(new Date(match.scheduled_at))}
            </span>
          )}
        </div>
      </div>

      {/* Event feed */}
      <div className="live-events-list">
        {visibleEvents.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
            <p>En attente des premiers événements…</p>
            <p style={{ fontSize: 12, marginTop: 8 }}>Mis à jour toutes les 30 secondes</p>
          </div>
        )}
        {visibleEvents.map((ev, i) => {
          const icon  = EVENT_ICONS[ev.event_type] ?? EVENT_ICONS.default
          const isMyClub = ev.club_id === club?.id
          return (
            <div
              key={ev.id ?? i}
              className={`live-event-row${isMyClub ? ' live-event-mine' : ''}`}
            >
              <span className="live-event-minute">{ev.game_minute}'</span>
              <span className="live-event-icon">{icon}</span>
              <span className="live-event-desc">{ev.description}</span>
              <span className="live-event-score">{ev.home_score}–{ev.away_score}</span>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Résumé si terminé */}
      {finished && (
        <div className="card live-summary">
          <h3 className="live-summary-title">Résumé du match</h3>
          <div className="live-summary-score">
            {homeClubName} <strong>{liveScore.home} – {liveScore.away}</strong> {awayClubName}
          </div>
          <div className="live-summary-stats">
            <span>Essais dom. : {visibleEvents.filter((e) => e.event_type === 'try' && e.club_id === match.home_club_id).length}</span>
            <span>Essais ext. : {visibleEvents.filter((e) => e.event_type === 'try' && e.club_id === match.away_club_id).length}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Amicaux tab ──────────────────────────────────────────────────────────────

function AmicauxTab({ clubId, clubName }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedOpponent, setSelectedOpponent] = useState(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('18:00')
  const [proposals, setProposals] = useState([])
  const [sentFriendlies, setSentFriendlies] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const minDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    // Lundi-vendredi seulement
    while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })()

  useEffect(() => { loadProposals() }, [clubId])

  const loadProposals = async () => {
    // Propositions reçues (mon club est away, status=scheduled, is_friendly=true)
    const { data: received } = await supabase
      .from('matches')
      .select('*, home_club:clubs!home_club_id(id, name)')
      .eq('away_club_id', clubId)
      .eq('status', 'scheduled')
      .eq('is_friendly', true)
      .is('league_season_id', null)
    setProposals(received ?? [])

    // Amicaux envoyés cette semaine (pour vérifier la limite)
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const { data: sent } = await supabase
      .from('matches')
      .select('away_club_id, scheduled_at')
      .eq('home_club_id', clubId)
      .eq('is_friendly', true)
      .gte('scheduled_at', weekAgo.toISOString())
    setSentFriendlies(sent ?? [])
  }

  const handleSearch = async () => {
    if (!searchTerm.trim()) return
    const { data } = await supabase
      .from('clubs')
      .select('id, name, stadium_name')
      .ilike('name', `%${searchTerm}%`)
      .neq('id', clubId)
      .limit(10)
    setSearchResults(data ?? [])
  }

  const handlePropose = async () => {
    if (!selectedOpponent || !selectedDate) return

    // Vérifications
    if (sentFriendlies.length >= 2) {
      setMsg({ type: 'err', text: 'Limite : 2 amicaux par semaine.' }); return
    }
    const sameOpponentThisWeek = sentFriendlies.filter((f) => f.away_club_id === selectedOpponent.id)
    if (sameOpponentThisWeek.length > 0) {
      setMsg({ type: 'err', text: 'Vous avez déjà un amical contre ce club cette semaine.' }); return
    }

    const datetime = `${selectedDate}T${selectedTime}:00.000Z`
    setLoading(true)
    const { error } = await supabase.from('matches').insert({
      home_club_id:     clubId,
      away_club_id:     selectedOpponent.id,
      league_season_id: null,
      scheduled_at:     datetime,
      status:           'scheduled',
      is_friendly:      true,
    })
    setLoading(false)
    if (error) {
      setMsg({ type: 'err', text: 'Erreur lors de la proposition.' })
    } else {
      setMsg({ type: 'ok', text: `Amical proposé à ${selectedOpponent.name} !` })
      setSelectedOpponent(null)
      setSelectedDate('')
      setSearchResults([])
      setSearchTerm('')
      loadProposals()
    }
  }

  const handleAccept = async (matchId) => {
    await supabase.from('matches').update({ status: 'accepted' }).eq('id', matchId)
    setMsg({ type: 'ok', text: 'Amical accepté !' })
    loadProposals()
  }

  const handleRefuse = async (matchId) => {
    await supabase.from('matches').update({ status: 'cancelled' }).eq('id', matchId)
    loadProposals()
  }

  const filteredDate = (dateStr) => {
    const d = new Date(dateStr)
    return ![0, 6].includes(d.getDay()) // lundi-vendredi uniquement
  }

  return (
    <div className="amicaux-wrapper">

      {msg && (
        <div className={`recr-success-banner${msg.type === 'err' ? ' recr-err-banner' : ''}`}
          style={msg.type === 'err' ? { background: '#fde8e8', color: '#e74c3c', borderColor: '#f5c6c6' } : {}}>
          {msg.text}
        </div>
      )}

      {/* Proposer un amical */}
      <div className="card amicaux-propose-card">
        <h3 className="amicaux-section-title">Proposer un amical</h3>
        <p className="training-desc" style={{ marginBottom: 16 }}>
          Lundi–vendredi, 18h–21h, au moins 24h à l'avance. Max 2 amicaux/semaine.
          <span style={{ color: '#F5820D' }}> {2 - sentFriendlies.length} restant(s) cette semaine.</span>
        </p>

        {/* Recherche adversaire */}
        <div className="amicaux-search-row">
          <input
            className="input" style={{ marginBottom: 0, flex: 1 }}
            placeholder="Nom du club adversaire…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-outline" onClick={handleSearch}>Rechercher</button>
        </div>

        {searchResults.length > 0 && (
          <div className="amicaux-search-results">
            {searchResults.map((c) => (
              <button
                key={c.id}
                className={`amicaux-club-btn${selectedOpponent?.id === c.id ? ' selected' : ''}`}
                onClick={() => setSelectedOpponent(c)}
              >
                <span className="amicaux-club-name">{c.name}</span>
                {c.stadium_name && <span className="amicaux-club-stadium">{c.stadium_name}</span>}
              </button>
            ))}
          </div>
        )}

        {selectedOpponent && (
          <div className="amicaux-slot-row">
            <div className="amicaux-selected-opp">
              ✓ <strong>{selectedOpponent.name}</strong>
            </div>
            <input
              type="date"
              className="sub-select"
              min={minDate}
              value={selectedDate}
              onChange={(e) => {
                const d = new Date(e.target.value)
                if ([0, 6].includes(d.getDay())) {
                  setMsg({ type: 'err', text: 'Choisissez un jour en semaine (lun–ven).' })
                } else {
                  setMsg(null)
                  setSelectedDate(e.target.value)
                }
              }}
            />
            <select
              className="sub-select"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
            >
              {FRIENDLY_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              className="btn btn-primary"
              onClick={handlePropose}
              disabled={loading || !selectedDate || sentFriendlies.length >= 2}
            >
              {loading ? '…' : 'Proposer'}
            </button>
          </div>
        )}
      </div>

      {/* Propositions reçues */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <h3 className="amicaux-section-title">Propositions reçues</h3>
        {proposals.length === 0 ? (
          <p style={{ color: '#aaa', fontSize: 13 }}>Aucune proposition en attente.</p>
        ) : (
          proposals.map((m) => {
            const d = m.scheduled_at
              ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(m.scheduled_at))
              : '—'
            return (
              <div key={m.id} className="amicaux-proposal-row">
                <div>
                  <strong>{m.home_club?.name ?? '?'}</strong>
                  <span className="amicaux-proposal-date"> — {d}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ fontSize: 13, padding: '5px 14px' }}
                    onClick={() => handleAccept(m.id)}>Accepter</button>
                  <button className="btn btn-danger" style={{ fontSize: 13, padding: '5px 14px' }}
                    onClick={() => handleRefuse(m.id)}>Refuser</button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Match({ session }) {
  const navigate = useNavigate()
  const [clubId, setClubId]           = useState(null)
  const [clubName, setClubName]       = useState('')
  const [nextMatch, setNextMatch]     = useState(null)
  const [liveMatch, setLiveMatch]     = useState(null) // match en cours ou récent
  const [players, setPlayers]         = useState([])
  const [lineup, setLineup]           = useState(() => {
    const init = {}
    ;[...POSITION_SLOTS, ...BENCH_SLOTS].forEach((s) => { init[s.number] = null })
    return init
  })
  const [subs, setSubs]               = useState([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [savedMsg, setSavedMsg]       = useState('')
  const [errors, setErrors]           = useState([])
  const [pickerSlot, setPickerSlot]   = useState(null)
  const [tab, setTab]                 = useState('composition')

  useEffect(() => { init() }, [])

  const init = async () => {
    const { data: club } = await supabase
      .from('clubs')
      .select('id, name')
      .eq('owner_user_id', session.user.id)
      .single()

    if (!club) { navigate('/create-club', { replace: true }); return }
    setClubId(club.id)
    setClubName(club.name)

    // Chercher un match en cours ou récent (dans les 3h)
    const twoHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    const { data: recentMatch } = await supabase
      .from('matches')
      .select('*, home_club:clubs!home_club_id(id,name), away_club:clubs!away_club_id(id,name)')
      .or(`home_club_id.eq.${club.id},away_club_id.eq.${club.id}`)
      .in('status', ['in_progress', 'lineups_locked', 'completed'])
      .gte('scheduled_at', twoHoursAgo)
      .order('scheduled_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentMatch) {
      setLiveMatch(recentMatch)
      setTab('live')
    }

    // Prochain match à venir (pour la compo)
    const { data: match } = await supabase
      .from('matches')
      .select('*, home_club:clubs!home_club_id(id,name), away_club:clubs!away_club_id(id,name)')
      .or(`home_club_id.eq.${club.id},away_club_id.eq.${club.id}`)
      .eq('status', 'scheduled')
      .is('home_score', null)
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    setNextMatch(match)

    // Joueurs
    const { data: pData } = await supabase
      .from('players')
      .select('*')
      .eq('club_id', club.id)
    setPlayers(pData ?? [])

    // Compo existante
    if (match) {
      const { data: existing } = await supabase
        .from('match_lineups')
        .select('*')
        .eq('match_id', match.id)
        .eq('club_id', club.id)

      if (existing?.length) {
        const playerById = Object.fromEntries((pData ?? []).map((p) => [p.id, p]))
        const newLineup = { ...lineup }
        existing.forEach((row) => {
          if (row.shirt_number && playerById[row.player_id]) {
            newLineup[row.shirt_number] = playerById[row.player_id]
          }
        })
        setLineup(newLineup)
      }
    }

    setLoading(false)
  }

  const assignedIds = new Set(Object.values(lineup).filter(Boolean).map((p) => p.id))
  const availablePlayers = (slotNum) =>
    players.filter((p) => !assignedIds.has(p.id) || lineup[slotNum]?.id === p.id)

  const assignPlayer = (player) => {
    if (!pickerSlot) return
    setLineup((prev) => ({ ...prev, [pickerSlot]: player }))
    setPickerSlot(null)
    setSavedMsg(''); setErrors([])
  }

  const removePlayer = (num) => setLineup((prev) => ({ ...prev, [num]: null }))

  const validate = () => {
    const errs = []
    const filledStarters = POSITION_SLOTS.filter((s) => lineup[s.number] !== null).length
    if (filledStarters < 15) errs.push(`${15 - filledStarters} poste(s) titulaire(s) non rempli(s).`)
    if (!lineup[16] || !lineup[17]) errs.push('Le banc doit avoir au moins 2 piliers (postes 16 et 17).')
    if (!lineup[18]) errs.push('Le banc doit avoir au moins 1 talonneur (poste 18).')
    return errs
  }

  const handleSave = async () => {
    const errs = validate()
    if (errs.length) { setErrors(errs); return }
    if (!nextMatch) return
    setSaving(true); setSavedMsg(''); setErrors([])

    await supabase.from('match_lineups').delete()
      .eq('match_id', nextMatch.id).eq('club_id', clubId)

    const rows = []
    ;[...POSITION_SLOTS, ...BENCH_SLOTS].forEach((slot) => {
      const player = lineup[slot.number]
      if (!player) return
      const sub = subs.find((s) => s.from === slot.number)
      rows.push({
        match_id: nextMatch.id, club_id: clubId, player_id: player.id,
        shirt_number: slot.number, is_starter: slot.number <= 15,
        position: slot.position ?? player.position,
        planned_sub_minute: sub ? (sub.minute === 'HT' ? 40 : sub.minute) : null,
        replaces_player_id: sub ? (lineup[sub.to]?.id ?? null) : null,
      })
    })
    if (rows.length) await supabase.from('match_lineups').insert(rows)
    setSaving(false); setSavedMsg('Composition sauvegardée ✓')
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  const starterCount = POSITION_SLOTS.filter((s) => lineup[s.number] !== null).length
  const benchCount   = BENCH_SLOTS.filter((s) => lineup[s.number] !== null).length

  const showComposition = tab === 'composition' || tab === 'subs'

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">
        <div className="page-title-row">
          <h2 className="page-title">Match</h2>
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>Chargement…</p>
        ) : (
          <>
            {/* Tabs */}
            <div className="tab-bar">
              {liveMatch && (
                <button className={`tab-btn${tab === 'live' ? ' active' : ''}`} onClick={() => setTab('live')}>
                  {liveMatch.status === 'completed' ? 'Résumé' : '● En direct'}
                </button>
              )}
              {nextMatch && nextMatch.status === 'scheduled' && (
                <>
                  <button className={`tab-btn${tab === 'composition' ? ' active' : ''}`} onClick={() => setTab('composition')}>
                    Composition
                    <span className="tab-badge">{starterCount}/15</span>
                  </button>
                  <button className={`tab-btn${tab === 'subs' ? ' active' : ''}`} onClick={() => setTab('subs')}>
                    Remplacements
                    {subs.length > 0 && <span className="tab-badge">{subs.length}</span>}
                  </button>
                </>
              )}
              <button className={`tab-btn${tab === 'amicaux' ? ' active' : ''}`} onClick={() => setTab('amicaux')}>
                Amicaux
              </button>
            </div>

            {/* ── Vue live ───────────────────────────────────────────────────── */}
            {tab === 'live' && liveMatch && (
              <LiveMatchView match={liveMatch} club={{ id: clubId, name: clubName }} />
            )}

            {/* ── Composition / banc ─────────────────────────────────────────── */}
            {(tab === 'composition' || tab === 'subs') && nextMatch && (
              <>
                <div className="card match-info-card">
                  <div className="match-info-teams">
                    <span className={`match-info-team${nextMatch.home_club_id === clubId ? ' match-info-you' : ''}`}>
                      {nextMatch.home_club?.name ?? '?'}
                    </span>
                    <span className="match-info-vs">vs</span>
                    <span className={`match-info-team${nextMatch.away_club_id === clubId ? ' match-info-you' : ''}`}>
                      {nextMatch.away_club?.name ?? '?'}
                    </span>
                  </div>
                  {nextMatch.scheduled_at && (
                    <p className="match-info-date">
                      {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })
                        .format(new Date(nextMatch.scheduled_at))}
                    </p>
                  )}
                  <div className="match-info-stats">
                    <span>{starterCount}/15 titulaires</span>
                    <span>{benchCount}/8 remplaçants</span>
                  </div>
                </div>

                {tab === 'composition' && (
                  <div className="lineup-layout">
                    <div className="lineup-section">
                      <h3 className="lineup-section-title">Titulaires</h3>
                      <div className="lineup-group">
                        <div className="lineup-group-label">Avants (1–8)</div>
                        {POSITION_SLOTS.filter((s) => s.group === 'Avants').map((slot) => (
                          <LineupRow key={slot.number} slot={slot} player={lineup[slot.number]}
                            onOpen={() => setPickerSlot(slot.number)} onRemove={() => removePlayer(slot.number)} />
                        ))}
                      </div>
                      <div className="lineup-group">
                        <div className="lineup-group-label">Arrières (9–15)</div>
                        {POSITION_SLOTS.filter((s) => s.group === 'Arrières').map((slot) => (
                          <LineupRow key={slot.number} slot={slot} player={lineup[slot.number]}
                            onOpen={() => setPickerSlot(slot.number)} onRemove={() => removePlayer(slot.number)} />
                        ))}
                      </div>
                    </div>
                    <div className="lineup-section">
                      <h3 className="lineup-section-title">Banc (16–23)</h3>
                      <p className="lineup-bench-note">Min. 2 piliers + 1 talonneur obligatoires</p>
                      {BENCH_SLOTS.map((slot) => (
                        <LineupRow key={slot.number} slot={slot} player={lineup[slot.number]}
                          onOpen={() => setPickerSlot(slot.number)} onRemove={() => removePlayer(slot.number)} />
                      ))}
                    </div>
                  </div>
                )}

                {tab === 'subs' && (
                  <SubsTab subs={subs} setSubs={setSubs} lineup={lineup}
                    positionSlots={POSITION_SLOTS} benchSlots={BENCH_SLOTS} />
                )}

                {errors.length > 0 && (
                  <div className="lineup-errors">
                    {errors.map((e, i) => <p key={i} className="error-text">⚠ {e}</p>)}
                  </div>
                )}
                <div className="tactic-actions">
                  <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                    {saving ? 'Sauvegarde…' : 'Valider la composition'}
                  </button>
                  {savedMsg && <span className="save-success">{savedMsg}</span>}
                </div>
              </>
            )}

            {/* Pas de match à venir */}
            {(tab === 'composition' || tab === 'subs') && !nextMatch && !liveMatch && (
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: '#888' }}>Aucun match à venir trouvé.</p>
              </div>
            )}

            {/* ── Amicaux ────────────────────────────────────────────────────── */}
            {tab === 'amicaux' && (
              <AmicauxTab clubId={clubId} clubName={clubName} />
            )}
          </>
        )}

        {/* Picker modal */}
        {pickerSlot !== null && (
          <PlayerPickerModal
            slot={[...POSITION_SLOTS, ...BENCH_SLOTS].find((s) => s.number === pickerSlot)}
            players={availablePlayers(pickerSlot)}
            currentPlayer={lineup[pickerSlot]}
            onSelect={assignPlayer}
            onClose={() => setPickerSlot(null)}
          />
        )}
      </div>
    </Layout>
  )
}

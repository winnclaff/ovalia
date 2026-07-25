import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Layout from '../components/Layout'

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_META = {
  salary:       { label: 'Salaires',       color: '#e74c3c', sign: -1 },
  staff_salary: { label: 'Salaires du staff', color: '#d35400', sign: -1 },
  sponsorship:  { label: 'Sponsors',       color: '#1B7A4A', sign:  1 },
  merchandise:  { label: 'Merchandising',  color: '#27ae60', sign:  1 },
  ticket:       { label: 'Billetterie',    color: '#3498db', sign:  1 },
  maintenance:  { label: 'Entretien',      color: '#F5820D', sign: -1 },
  fixed_costs:  { label: 'Frais fixes',    color: '#c0392b', sign: -1 },
  infrastructure: { label: 'Infrastructure', color: '#34495e', sign: -1 },
  transfer_in:  { label: 'Transfert +',    color: '#27ae60', sign:  1 },
  transfer_out: { label: 'Transfert −',    color: '#e74c3c', sign: -1 },
  prize:        { label: 'Prime de ligue', color: '#8B5CF6', sign:  1 },
  other:        { label: 'Autre',          color: '#999',    sign:  0 },
}

const INCOME_TYPES  = Object.entries(TYPE_META).filter(([, v]) => v.sign > 0).map(([k]) => k)
const EXPENSE_TYPES = Object.entries(TYPE_META).filter(([, v]) => v.sign < 0).map(([k]) => k)

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n, opts = {}) =>
  (n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, ...opts })

const fmtShort = (n) => {
  const abs = Math.abs(n ?? 0)
  if (abs >= 1_000_000) return `${((n ?? 0) / 1_000_000).toFixed(1).replace('.', ',')} M€`
  if (abs >= 1_000)    return `${((n ?? 0) / 1_000).toFixed(0)} k€`
  return fmt(n)
}

const txAmount = (tx) => {
  const meta = TYPE_META[tx.type]
  if (!meta || meta.sign === 0) return tx.amount ?? 0
  return Math.abs(tx.amount ?? 0) * meta.sign
}

const monthKey = (d) => (d ? d.slice(0, 7) : null)

const currentMonthKey = () => new Date().toISOString().slice(0, 7)

const monthLabel = (key) => {
  if (!key) return '—'
  const [y, m] = key.split('-')
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
    .format(new Date(+y, +m - 1))
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function BalanceHero({ balance, monthNet, projection }) {
  const balColor = balance >= 0 ? '#1B7A4A' : '#e74c3c'
  const projColor = projection >= 0 ? '#1B7A4A' : '#e74c3c'
  const netColor  = monthNet >= 0 ? '#1B7A4A' : '#e74c3c'

  return (
    <div className="fin-hero-row">
      {/* Solde principal */}
      <div className="card fin-hero-balance">
        <span className="fin-hero-label">Trésorerie actuelle</span>
        <span className="fin-hero-value" style={{ color: balColor }}>{fmt(balance)}</span>
        <span className="fin-hero-sub" style={{ color: netColor }}>
          {monthNet >= 0 ? '▲' : '▼'} {monthNet >= 0 ? '+' : ''}{fmtShort(monthNet)} ce mois
        </span>
      </div>

      {/* Solde mensuel */}
      <div className="card fin-kpi-card">
        <span className="fin-kpi-label">Solde mensuel</span>
        <span className="fin-kpi-value" style={{ color: netColor }}>
          {monthNet >= 0 ? '+' : ''}{fmtShort(monthNet)}
        </span>
        <span className="fin-kpi-sub">{monthLabel(currentMonthKey())}</span>
      </div>

      {/* Projection */}
      <div className="card fin-kpi-card fin-kpi-projection">
        <span className="fin-kpi-label">Projection 3 mois</span>
        <span className="fin-kpi-value" style={{ color: projColor }}>{fmtShort(projection)}</span>
        <span className="fin-kpi-sub">solde + tendance × 3</span>
      </div>
    </div>
  )
}

function MonthlyBars({ income, expenses }) {
  const max = Math.max(income, expenses, 1)
  const incPct = (income / max) * 100
  const expPct = (expenses / max) * 100
  const net = income - expenses

  return (
    <div className="card fin-monthly-card">
      <div className="fin-section-title">Mois en cours — {monthLabel(currentMonthKey())}</div>

      <div className="fin-bar-row">
        <span className="fin-bar-label">Revenus</span>
        <div className="fin-bar-track">
          <div className="fin-bar-fill fin-bar-income" style={{ width: `${incPct}%` }} />
        </div>
        <span className="fin-bar-amount fin-amount-income">+{fmtShort(income)}</span>
      </div>

      <div className="fin-bar-row">
        <span className="fin-bar-label">Dépenses</span>
        <div className="fin-bar-track">
          <div className="fin-bar-fill fin-bar-expense" style={{ width: `${expPct}%` }} />
        </div>
        <span className="fin-bar-amount fin-amount-expense">−{fmtShort(expenses)}</span>
      </div>

      <div className="fin-bar-net" style={{ color: net >= 0 ? '#1B7A4A' : '#e74c3c' }}>
        {net >= 0 ? '▲ Excédent' : '▼ Déficit'} {net >= 0 ? '+' : ''}{fmtShort(net)}
      </div>
    </div>
  )
}

function CategoryBreakdown({ transactions }) {
  const mk = currentMonthKey()
  const monthTx = transactions.filter((t) => monthKey(t.created_at) === mk)

  const cats = Object.entries(TYPE_META).map(([key, meta]) => {
    const total = monthTx
      .filter((t) => t.type === key)
      .reduce((s, t) => s + Math.abs(t.amount ?? 0), 0)
    return { key, ...meta, total }
  }).filter((c) => c.total > 0)

  const maxCat = Math.max(...cats.map((c) => c.total), 1)

  if (cats.length === 0) {
    return (
      <div className="card">
        <div className="fin-section-title">Détail par catégorie</div>
        <p style={{ color: '#aaa', fontSize: 13, marginTop: 8 }}>Aucune transaction ce mois.</p>
      </div>
    )
  }

  const incomes  = cats.filter((c) => c.sign > 0)
  const expenses = cats.filter((c) => c.sign < 0)

  return (
    <div className="card fin-categories-card">
      <div className="fin-section-title">Détail par catégorie — {monthLabel(mk)}</div>
      <div className="fin-cat-cols">
        <div className="fin-cat-col">
          <div className="fin-cat-group-label" style={{ color: '#1B7A4A' }}>Revenus</div>
          {incomes.length === 0
            ? <p style={{ color: '#ccc', fontSize: 13 }}>Aucun</p>
            : incomes.map((c) => <CatRow key={c.key} cat={c} max={maxCat} />)
          }
        </div>
        <div className="fin-cat-divider" />
        <div className="fin-cat-col">
          <div className="fin-cat-group-label" style={{ color: '#e74c3c' }}>Dépenses</div>
          {expenses.length === 0
            ? <p style={{ color: '#ccc', fontSize: 13 }}>Aucune</p>
            : expenses.map((c) => <CatRow key={c.key} cat={c} max={maxCat} />)
          }
        </div>
      </div>
    </div>
  )
}

function CatRow({ cat, max }) {
  const pct = (cat.total / max) * 100
  return (
    <div className="fin-cat-row">
      <span className="fin-cat-name">{cat.label}</span>
      <div className="fin-cat-bar-track">
        <div
          className="fin-cat-bar-fill"
          style={{ width: `${pct}%`, background: cat.color }}
        />
      </div>
      <span className="fin-cat-amount" style={{ color: cat.color }}>
        {fmtShort(cat.total)}
      </span>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'all', label: 'Toutes' },
  ...Object.entries(TYPE_META).map(([k, v]) => ({ key: k, label: v.label })),
]

export default function Finances({ session }) {
  const navigate = useNavigate()
  const [club, setClub] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const { data: c } = await supabase
      .from('clubs')
      .select('id, name, balance')
      .eq('owner_user_id', session.user.id)
      .single()

    if (!c) { navigate('/create-club', { replace: true }); return }
    setClub(c)

    const { data: tx } = await supabase
      .from('transactions')
      .select('*')
      .eq('club_id', c.id)
      .order('created_at', { ascending: false })
      .limit(200)

    setTransactions(tx ?? [])
    setLoading(false)
  }

  const handleLogout = async () => { await supabase.auth.signOut() }

  // Monthly totals
  const mk = currentMonthKey()
  const monthTx = transactions.filter((t) => monthKey(t.created_at) === mk)
  const monthIncome   = monthTx.filter((t) => INCOME_TYPES.includes(t.type)).reduce((s, t) => s + Math.abs(t.amount ?? 0), 0)
  const monthExpenses = monthTx.filter((t) => EXPENSE_TYPES.includes(t.type)).reduce((s, t) => s + Math.abs(t.amount ?? 0), 0)
  const monthNet = monthIncome - monthExpenses
  const projection = (club?.balance ?? 0) + monthNet * 3

  // Filtered history
  const visible = filter === 'all'
    ? transactions
    : transactions.filter((t) => t.type === filter)

  return (
    <Layout onLogout={handleLogout}>
      <div className="page-container">

        <div className="page-title-row">
          <h2 className="page-title">Finances</h2>
          {club && <span className="page-subtitle">{club.name}</span>}
        </div>

        {loading ? (
          <p style={{ color: '#888' }}>Chargement…</p>
        ) : (
          <>
            {/* 1 — Hero balance + KPIs */}
            <BalanceHero
              balance={club?.balance ?? 0}
              monthNet={monthNet}
              projection={projection}
            />

            {/* 2 — Monthly bars + category breakdown */}
            <div className="fin-mid-row">
              <MonthlyBars income={monthIncome} expenses={monthExpenses} />
              <CategoryBreakdown transactions={transactions} />
            </div>

            {/* 3 — Transaction history */}
            <div className="fin-section-title" style={{ marginTop: 8 }}>Historique des transactions</div>

            <div className="filter-tabs" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  className={`filter-tab${filter === key ? ' active' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  {key !== 'all' && (
                    <span className="filter-count">
                      {transactions.filter((t) => t.type === key).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: 32 }}>
                <p style={{ color: '#aaa' }}>Aucune transaction</p>
              </div>
            ) : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="finances-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Catégorie</th>
                      <th>Description</th>
                      <th style={{ textAlign: 'right' }}>Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((tx) => {
                      const meta = TYPE_META[tx.type] ?? TYPE_META.other
                      const raw = tx.amount ?? 0
                      const isPos = meta.sign > 0 || (meta.sign === 0 && raw >= 0)
                      const display = isPos ? `+${fmtShort(Math.abs(raw))}` : `−${fmtShort(Math.abs(raw))}`
                      const date = tx.created_at
                        ? new Intl.DateTimeFormat('fr-FR').format(new Date(tx.created_at))
                        : '—'
                      return (
                        <tr key={tx.id} className="finances-row">
                          <td className="finances-date">{date}</td>
                          <td>
                            <span
                              className="finances-type-badge"
                              style={{ background: meta.color + '20', color: meta.color }}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="finances-desc">{tx.description ?? tx.notes ?? '—'}</td>
                          <td className="finances-amount" style={{ color: isPos ? '#1B7A4A' : '#e74c3c' }}>
                            {display}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}

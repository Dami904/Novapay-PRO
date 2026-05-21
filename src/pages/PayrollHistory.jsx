import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeb3 } from '../context/Web3Context'
import { exportHistoryToCSV, exportBatchToCSV } from '../utils/csvExporter'

export default function PayrollHistory() {
  const { history } = useWeb3()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [expanded, setExpanded] = useState(null)

  const filtered = useMemo(() => {
    return history.filter((run) => {
      const matchLabel = run.label.toLowerCase().includes(search.toLowerCase())
      const runDate = new Date(run.timestamp)
      const afterFrom = !dateFrom || runDate >= new Date(dateFrom)
      const beforeTo = !dateTo || runDate <= new Date(dateTo + 'T23:59:59')
      return matchLabel && afterFrom && beforeTo
    })
  }, [history, search, dateFrom, dateTo])

  const totalFiltered = filtered.reduce((s, r) => s + r.totalAmount, 0)

  function toggleExpand(id) {
    setExpanded((prev) => (prev === id ? null : id))
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Ledger</h1>
          <p className="page-sub">Full history of all onchain payroll batches</p>
        </div>
        <div className="header-actions">
          {filtered.length > 0 && (
            <button className="btn-export" onClick={() => exportHistoryToCSV(filtered)}>
              ↓ Export All CSV
            </button>
          )}
          <button className="btn-primary" onClick={() => navigate('/payroll/new')}>
            + New Payroll
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input
          className="filter-input"
          type="text"
          placeholder="Search by label…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-date-group">
          <label className="filter-label">From</label>
          <input
            className="filter-input filter-date"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <label className="filter-label">To</label>
          <input
            className="filter-input filter-date"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        {(search || dateFrom || dateTo) && (
          <button
            className="btn-ghost btn-sm"
            onClick={() => { setSearch(''); setDateFrom(''); setDateTo('') }}
          >
            Clear filters
          </button>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="ledger-summary">
          <span>{filtered.length} payroll run{filtered.length !== 1 ? 's' : ''}</span>
          <span className="ledger-total">
            Total: <strong>${totalFiltered.toLocaleString()} USDC</strong>
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">{history.length === 0 ? '📭' : '🔍'}</div>
          <p className="empty-title">
            {history.length === 0 ? 'No payroll history yet' : 'No results match your filters'}
          </p>
          <p className="empty-desc">
            {history.length === 0
              ? 'Run your first batch payroll to see it here.'
              : 'Try adjusting your search or date range.'}
          </p>
          {history.length === 0 && (
            <button className="btn-primary" onClick={() => navigate('/payroll/new')}>
              Run First Payroll
            </button>
          )}
        </div>
      ) : (
        <div className="history-list">
          {filtered.map((run) => (
            <div key={run.id} className="history-item">
              <div className="history-row" onClick={() => toggleExpand(run.id)}>
                <div className="history-left">
                  <div className="history-label">{run.label}</div>
                  <div className="history-meta">
                    {new Date(run.timestamp).toLocaleDateString(undefined, {
                      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                    })}
                    {' · '}
                    {run.recipientCount} recipient{run.recipientCount !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="history-right">
                  <div className="history-amount">${run.totalAmount.toLocaleString()} USDC</div>
                  <div className="history-actions">
                    {run.explorerUrl && (
                      <a
                        href={run.explorerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="tx-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {run.txHash.slice(0, 8)}… ↗
                      </a>
                    )}
                    <button
                      className="btn-export btn-sm"
                      onClick={(e) => { e.stopPropagation(); exportBatchToCSV(run) }}
                    >
                      ↓ CSV
                    </button>
                    <span className="expand-arrow">{expanded === run.id ? '▲' : '▼'}</span>
                  </div>
                </div>
              </div>

              {expanded === run.id && run.recipients?.length > 0 && (
                <div className="history-expanded">
                  <table className="data-table data-table-sm">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Wallet Address</th>
                        <th>Amount (USDC)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.recipients.map((r, i) => (
                        <tr key={i}>
                          <td>{r.name || `Recipient ${i + 1}`}</td>
                          <td className="td-addr">
                            <span className="addr-text">{r.address}</span>
                          </td>
                          <td className="td-amount">${r.amount?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

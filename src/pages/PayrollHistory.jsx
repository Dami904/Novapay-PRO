import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useOrg } from '../context/OrgContext'
import PayrollStatusBadge from '../components/PayrollStatusBadge'
import { exportHistoryToCSV, exportHistoryToXLSX } from '../utils/csvExporter'

// Map API run → exporter-compatible shape
function toExportRow(run) {
  return {
    label:        run.label,
    timestamp:    new Date(run.createdAt).getTime(),
    recipientCount: run.recipientCount,
    totalAmount:  Number(run.totalAmount),
    token:        run.token,
    txHash:       run.txHash ?? '',
    explorerUrl:  run.explorerUrl ?? '',
    recipients:   [],  // detail not loaded in list view
  }
}

export default function PayrollHistory() {
  const { currentOrgId } = useOrg()
  const navigate = useNavigate()
  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState('')
  const [page, setPage]         = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-runs', currentOrgId, search, status, page],
    queryFn:  async () => {
      const params = new URLSearchParams({ page, pageSize: 20 })
      if (search) params.set('search', search)
      if (status) params.set('status', status)
      const res = await api.get(`/orgs/${currentOrgId}/payroll-runs?${params}`)
      return res.ok ? res.json() : { runs: [], total: 0 }
    },
    enabled: !!currentOrgId,
  })

  const runs  = data?.runs  ?? []
  const total = data?.total ?? 0
  const pages = Math.ceil(total / 20)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payroll Ledger</h1>
          <p className="page-sub">Full history of all payroll runs</p>
        </div>
        <div className="header-actions">
          {runs.length > 0 && (
            <>
              <button className="btn-export" onClick={() => exportHistoryToCSV(runs.map(toExportRow))}>↓ CSV</button>
              <button className="btn-export" onClick={() => exportHistoryToXLSX(runs.map(toExportRow))}>↓ Excel</button>
            </>
          )}
          <button className="btn-primary" onClick={() => navigate('/payroll/new')}>+ New Payroll</button>
        </div>
      </div>

      <div className="filter-bar">
        <input
          className="filter-input"
          placeholder="Search by label…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        <select
          className="filter-input"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          style={{ maxWidth: '180px' }}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="complete">Complete</option>
          <option value="failed">Failed</option>
        </select>
        {(search || status) && (
          <button className="btn-ghost btn-sm" onClick={() => { setSearch(''); setStatus(''); setPage(1) }}>
            Clear filters
          </button>
        )}
      </div>

      {total > 0 && (
        <div className="ledger-summary">
          <span>{total} run{total !== 1 ? 's' : ''}</span>
        </div>
      )}

      {isLoading && <div className="empty-state"><span className="spinner-sm" /> Loading…</div>}

      {!isLoading && runs.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{total === 0 && !search && !status ? '📭' : '🔍'}</div>
          <p className="empty-title">{total === 0 && !search && !status ? 'No payroll runs yet' : 'No results'}</p>
          <p className="empty-desc">{total === 0 && !search && !status ? 'Create a payroll run to see it here.' : 'Try adjusting your search or filters.'}</p>
        </div>
      )}

      <div className="history-list">
        {runs.map((run) => (
          <div
            key={run.id}
            className="history-item"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/payroll/${run.id}`)}
          >
            <div className="history-row">
              <div className="history-left">
                <div className="history-label">{run.label}</div>
                <div className="history-meta">
                  {new Date(run.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  {' · '}{run.recipientCount} recipient{run.recipientCount !== 1 ? 's' : ''}
                </div>
                <div style={{ marginTop: '0.35rem' }}>
                  <PayrollStatusBadge status={run.status} />
                </div>
              </div>
              <div className="history-right">
                <div className="history-amount">${Number(run.totalAmount).toLocaleString()} {run.token}</div>
                {run.txHash && run.explorerUrl && (
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
              </div>
            </div>
          </div>
        ))}
      </div>

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span style={{ opacity: 0.6, alignSelf: 'center', fontSize: '0.85rem' }}>Page {page} of {pages}</span>
          <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  )
}

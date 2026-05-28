import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { useOrg } from '../../context/OrgContext'
import PayrollStatusBadge from '../../components/PayrollStatusBadge'

export default function ApprovalQueue() {
  const { currentOrgId } = useOrg()
  const navigate  = useNavigate()
  const qc        = useQueryClient()
  const [noteMap, setNoteMap] = useState({}) // { [runId]: string }

  const { data, isLoading } = useQuery({
    queryKey: ['payroll-runs', currentOrgId, 'pending'],
    queryFn:  async () => {
      const res = await api.get(`/orgs/${currentOrgId}/payroll-runs?status=pending_approval`)
      if (!res.ok) throw new Error('Failed to load runs')
      return res.json()
    },
    enabled: !!currentOrgId,
  })

  const approve = useMutation({
    mutationFn: ({ id, note }) => api.post(`/orgs/${currentOrgId}/payroll-runs/${id}/approve`, { note }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll-runs'] }),
  })

  const reject = useMutation({
    mutationFn: ({ id, note }) => api.post(`/orgs/${currentOrgId}/payroll-runs/${id}/reject`, { note }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['payroll-runs'] }),
  })

  const runs = data?.runs ?? []

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Approval Queue</h1>
          <p className="page-sub">Review and approve payroll runs submitted by your team</p>
        </div>
      </div>

      {isLoading && <div className="empty-state"><span className="spinner-sm" /> Loading…</div>}

      {!isLoading && runs.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✅</div>
          <p className="empty-title">Queue is clear</p>
          <p className="empty-desc">No payroll runs are waiting for approval.</p>
        </div>
      )}

      <div className="history-list">
        {runs.map((run) => (
          <div key={run.id} className="history-item">
            <div className="history-row" style={{ cursor: 'default' }}>
              <div className="history-left">
                <div className="history-label">{run.label}</div>
                <div className="history-meta">
                  {run.recipientCount} recipients ·{' '}
                  ${Number(run.totalAmount).toLocaleString()} {run.token} ·{' '}
                  Submitted {new Date(run.submittedAt).toLocaleDateString()}
                </div>
                <div style={{ marginTop: '0.5rem' }}>
                  <PayrollStatusBadge status={run.status} />
                </div>
              </div>
              <div className="history-right" style={{ flexDirection: 'column', gap: '0.75rem', alignItems: 'flex-end' }}>
                <button className="btn-ghost btn-sm" onClick={() => navigate(`/payroll/${run.id}`)}>
                  View details →
                </button>
                <input
                  className="form-input"
                  style={{ width: '220px', fontSize: '0.8rem' }}
                  placeholder="Review note (optional)"
                  value={noteMap[run.id] ?? ''}
                  onChange={(e) => setNoteMap((m) => ({ ...m, [run.id]: e.target.value }))}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => approve.mutate({ id: run.id, note: noteMap[run.id] })}
                    disabled={approve.isPending}
                  >
                    ✓ Approve
                  </button>
                  <button
                    className="btn-ghost btn-sm"
                    style={{ color: 'var(--error, #ef4444)' }}
                    onClick={() => reject.mutate({ id: run.id, note: noteMap[run.id] })}
                    disabled={reject.isPending}
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

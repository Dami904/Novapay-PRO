import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useOrg } from '../context/OrgContext'
import { useAuth } from '../context/AuthContext'
import PayrollStatusBadge from '../components/PayrollStatusBadge'

export default function Dashboard() {
  const { currentOrgId, currentRole } = useOrg()
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const { data: runsData } = useQuery({
    queryKey: ['payroll-runs', currentOrgId],
    queryFn:  async () => {
      const res = await api.get(`/orgs/${currentOrgId}/payroll-runs?pageSize=5`)
      return res.ok ? res.json() : { runs: [], total: 0 }
    },
    enabled: !!currentOrgId,
  })

  const { data: pendingData } = useQuery({
    queryKey: ['payroll-runs', currentOrgId, 'pending'],
    queryFn:  async () => {
      const res = await api.get(`/orgs/${currentOrgId}/payroll-runs?status=pending_approval&pageSize=1`)
      return res.ok ? res.json() : { total: 0 }
    },
    enabled: !!currentOrgId && ['owner', 'admin', 'finance'].includes(currentRole),
  })

  const { data: org } = useQuery({
    queryKey: ['org', currentOrgId],
    queryFn:  async () => {
      const res = await api.get(`/orgs/${currentOrgId}`)
      return res.ok ? res.json() : null
    },
    enabled: !!currentOrgId,
  })

  const runs          = runsData?.runs ?? []
  const recentRuns    = runs.slice(0, 3)
  const totalPaid     = runs.filter((r) => r.status === 'complete').reduce((s, r) => s + Number(r.totalAmount), 0)
  const completeCount = runs.filter((r) => r.status === 'complete').length
  const pendingCount  = pendingData?.total ?? 0

  const canCreateDraft = ['owner', 'admin', 'finance', 'hr'].includes(currentRole)
  const canApprove     = ['owner', 'admin', 'finance'].includes(currentRole)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">
            Welcome back, {user?.fullName?.split(' ')[0] ?? 'there'} ·{' '}
            <span className="wallet-tag" style={{ textTransform: 'capitalize' }}>{currentRole}</span>
          </p>
        </div>
        {canCreateDraft && (
          <button className="btn-primary" onClick={() => navigate('/payroll/new')}>
            + New Payroll Run
          </button>
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-primary">
          <div className="stat-label">Total Paid Out</div>
          <div className="stat-value">
            ${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-sub">complete runs</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Completed Runs</div>
          <div className="stat-value">{completeCount}</div>
          <div className="stat-sub">all time</div>
        </div>

        {canApprove && (
          <div
            className="stat-card"
            style={{ cursor: pendingCount > 0 ? 'pointer' : 'default', borderColor: pendingCount > 0 ? '#f59e0b' : undefined }}
            onClick={() => pendingCount > 0 && navigate('/approval-queue')}
          >
            <div className="stat-label">Awaiting Approval</div>
            <div className="stat-value" style={{ color: pendingCount > 0 ? '#f59e0b' : undefined }}>
              {pendingCount}
            </div>
            <div className="stat-sub">{pendingCount > 0 ? 'Click to review →' : 'queue clear'}</div>
          </div>
        )}

        <div className="stat-card">
          <div className="stat-label">Organization</div>
          <div className="stat-value stat-value-sm">{org?.name ?? '—'}</div>
          <div className="stat-sub" style={{ textTransform: 'capitalize' }}>{org?.plan ?? ''} plan</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Recent Activity</h2>
          {(runsData?.total ?? 0) > 0 && (
            <button className="btn-ghost" onClick={() => navigate('/history')}>View all →</button>
          )}
        </div>

        {recentRuns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p className="empty-title">No payroll runs yet</p>
            <p className="empty-desc">Upload a CSV and create your first payroll run to get started.</p>
            {canCreateDraft && (
              <button className="btn-primary" onClick={() => navigate('/payroll/new')}>Run First Payroll</button>
            )}
          </div>
        ) : (
          <div className="recent-list">
            {recentRuns.map((run) => (
              <div
                key={run.id}
                className="recent-item"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/payroll/${run.id}`)}
              >
                <div className="recent-left">
                  <div className="recent-label">{run.label}</div>
                  <div className="recent-meta">
                    {run.recipientCount} recipients ·{' '}
                    {new Date(run.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div style={{ marginTop: '0.35rem' }}>
                    <PayrollStatusBadge status={run.status} />
                  </div>
                </div>
                <div className="recent-right">
                  <div className="recent-amount">${Number(run.totalAmount).toLocaleString()} {run.token}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canCreateDraft && (
        <div className="cta-banner">
          <div className="cta-text">
            <strong>Ready to run payroll?</strong>
            <span> Upload your CSV and kick off the approval workflow.</span>
          </div>
          <button className="btn-primary" onClick={() => navigate('/payroll/new')}>+ New Payroll Run</button>
        </div>
      )}
    </div>
  )
}

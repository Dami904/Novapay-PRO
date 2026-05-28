import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../services/api'

export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()

  // Redirect non-super-admins immediately
  if (user && !user.isSuperAdmin) {
    navigate('/dashboard', { replace: true })
    return null
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-stats'],
    queryFn:  async () => {
      const res = await api.get('/admin/stats')
      if (!res.ok) throw new Error('Failed to load admin stats')
      return res.json()
    },
  })

  const stats = [
    { label: 'Total Orgs',      value: data?.totalOrgs     ?? '—', sub: 'organisations on platform' },
    { label: 'Total Users',     value: data?.totalUsers    ?? '—', sub: 'registered accounts' },
    { label: 'Total Runs',      value: data?.totalRuns     ?? '—', sub: 'payroll runs ever created' },
    { label: 'Completed Runs',  value: data?.totalComplete ?? '—', sub: 'successfully executed' },
    { label: 'Failed Runs',     value: data?.totalFailed   ?? '—', sub: 'execution failed' },
  ]

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Super Admin</h1>
          <p className="page-sub">Platform-wide overview — you have access to all organisations</p>
        </div>
        <div className="header-actions">
          <Link to="/admin/orgs"  className="btn-ghost">Organisations →</Link>
          <Link to="/admin/users" className="btn-ghost">Users →</Link>
        </div>
      </div>

      {/* Stats grid */}
      {isLoading && <div className="empty-state"><span className="spinner-sm" /> Loading platform stats…</div>}
      {isError   && <div className="error-box">⚠ Could not load platform stats.</div>}

      {data && (
        <>
          <div className="stats-grid" style={{ marginBottom: '2rem' }}>
            {stats.map((s) => (
              <div key={s.label} className="stat-card">
                <div className="stat-value">{s.value.toLocaleString?.() ?? s.value}</div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-sub" style={{ fontSize: '0.75rem', opacity: 0.55, marginTop: '0.2rem' }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Recent completed runs */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Recent Completed Runs</h2>
              <span className="badge-count">last 5 across all orgs</span>
            </div>

            {data.recentRuns?.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem' }}>
                <p className="empty-title">No completed runs yet</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Organisation</th>
                      <th>Token</th>
                      <th>Amount</th>
                      <th>Executed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentRuns?.map((run) => (
                      <tr key={run.id}>
                        <td>{run.label}</td>
                        <td>
                          <span style={{ fontWeight: 500 }}>{run.org.name}</span>
                          <span style={{ opacity: 0.5, fontSize: '0.8rem', marginLeft: '0.4rem' }}>/{run.org.slug}</span>
                        </td>
                        <td>{run.token}</td>
                        <td className="td-amount">${Number(run.totalAmount).toLocaleString()}</td>
                        <td style={{ opacity: 0.65, fontSize: '0.85rem' }}>
                          {run.executedAt
                            ? new Date(run.executedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick nav */}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <Link to="/admin/orgs"  className="btn-primary">View All Organisations →</Link>
            <Link to="/admin/users" className="btn-ghost">View All Users →</Link>
          </div>
        </>
      )}
    </div>
  )
}

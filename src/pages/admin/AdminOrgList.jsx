import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../services/api'

// ── Org Detail Modal ───────────────────────────────────────────────────────────
function OrgDetailModal({ orgId, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-org-detail', orgId],
    queryFn:  async () => {
      const res = await api.get(`/admin/orgs/${orgId}`)
      if (!res.ok) throw new Error('Failed to load org detail')
      return res.json()
    },
    enabled: !!orgId,
  })

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: '680px', maxHeight: '80vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {isLoading && <div className="empty-state"><span className="spinner-sm" /> Loading…</div>}

        {data && (
          <>
            <div className="card-header" style={{ marginBottom: '1rem' }}>
              <div>
                <h2 className="card-title">{data.name}</h2>
                <div style={{ opacity: 0.55, fontSize: '0.85rem' }}>/{data.slug} · Created {new Date(data.createdAt).toLocaleDateString()}</div>
              </div>
              <button className="btn-ghost btn-sm" onClick={onClose}>✕ Close</button>
            </div>

            {/* Counts */}
            <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {[
                { label: 'Members',   value: data._count.members },
                { label: 'Employees', value: data._count.employees },
                { label: 'Runs',      value: data._count.payrollRuns },
              ].map((c) => (
                <div key={c.label} style={{ background: 'var(--surface)', borderRadius: '8px', padding: '0.75rem 1.25rem', minWidth: '100px', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{c.value}</div>
                  <div style={{ opacity: 0.55, fontSize: '0.8rem' }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Members */}
            {data.members?.length > 0 && (
              <>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Members</h3>
                <div className="table-wrap" style={{ marginBottom: '1.5rem' }}>
                  <table className="data-table">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
                    <tbody>
                      {data.members.map((m) => (
                        <tr key={m.id}>
                          <td>{m.user.fullName ?? '—'}</td>
                          <td style={{ opacity: 0.75 }}>{m.user.email}</td>
                          <td><span style={{ textTransform: 'capitalize', fontWeight: 500 }}>{m.role}</span></td>
                          <td style={{ opacity: 0.6, fontSize: '0.85rem' }}>{new Date(m.joinedAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Recent runs */}
            {data.payrollRuns?.length > 0 && (
              <>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.7, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Payroll Runs</h3>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Label</th><th>Status</th><th>Token</th><th>Amount</th><th>Created</th></tr></thead>
                    <tbody>
                      {data.payrollRuns.map((r) => (
                        <tr key={r.id}>
                          <td>{r.label}</td>
                          <td><span style={{ textTransform: 'capitalize', opacity: 0.8 }}>{r.status.replace('_', ' ')}</span></td>
                          <td>{r.token}</td>
                          <td className="td-amount">${Number(r.totalAmount).toLocaleString()}</td>
                          <td style={{ opacity: 0.6, fontSize: '0.85rem' }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AdminOrgList() {
  const { user } = useAuth()
  const navigate  = useNavigate()
  const qc        = useQueryClient()

  const [search,    setSearch]    = useState('')
  const [page,      setPage]      = useState(1)
  const [detailId,  setDetailId]  = useState(null)   // org id to show in modal
  const [deleteId,  setDeleteId]  = useState(null)   // org id pending confirmation

  // Redirect non-super-admins
  if (user && !user.isSuperAdmin) {
    navigate('/dashboard', { replace: true })
    return null
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-orgs', search, page],
    queryFn:  async () => {
      const params = new URLSearchParams({ page, pageSize: 25 })
      if (search) params.set('search', search)
      const res = await api.get(`/admin/orgs?${params}`)
      if (!res.ok) throw new Error('Failed to load orgs')
      return res.json()
    },
  })

  const deleteOrg = useMutation({
    mutationFn: async (orgId) => {
      const res = await api.delete(`/admin/orgs/${orgId}`)
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete org')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-orgs'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      setDeleteId(null)
    },
  })

  const orgs  = data?.orgs  ?? []
  const total = data?.total ?? 0
  const pages = Math.ceil(total / 25)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">All Organisations</h1>
          <p className="page-sub">Every org registered on the platform</p>
        </div>
        <button className="btn-ghost" onClick={() => navigate('/admin')}>← Admin Home</button>
      </div>

      {/* Search */}
      <div className="filter-bar">
        <input
          className="filter-input"
          placeholder="Search by name or slug…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        {search && (
          <button className="btn-ghost btn-sm" onClick={() => { setSearch(''); setPage(1) }}>Clear</button>
        )}
      </div>

      {total > 0 && (
        <div className="ledger-summary">
          <span>{total} organisation{total !== 1 ? 's' : ''}</span>
        </div>
      )}

      {isLoading && <div className="empty-state"><span className="spinner-sm" /> Loading…</div>}

      {!isLoading && orgs.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{total === 0 && !search ? '🏢' : '🔍'}</div>
          <p className="empty-title">{total === 0 && !search ? 'No organisations yet' : 'No results'}</p>
          <p className="empty-desc">{total === 0 && !search ? 'Orgs appear here once users sign up.' : 'Try a different search.'}</p>
        </div>
      )}

      {/* Org list */}
      <div className="history-list">
        {orgs.map((org) => (
          <div
            key={org.id}
            className="history-item"
            style={{ cursor: 'pointer' }}
            onClick={() => setDetailId(org.id)}
          >
            <div className="history-row">
              <div className="history-left">
                <div className="history-label">{org.name}</div>
                <div className="history-meta">
                  /{org.slug}
                  {' · '}Created {new Date(org.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  <span className="badge-count">{org._count.members} member{org._count.members !== 1 ? 's' : ''}</span>
                  <span className="badge-count">{org._count.employees} employee{org._count.employees !== 1 ? 's' : ''}</span>
                  <span className="badge-count">{org._count.payrollRuns} run{org._count.payrollRuns !== 1 ? 's' : ''}</span>
                </div>
              </div>

              <div className="history-right" style={{ alignItems: 'flex-end', gap: '0.5rem' }}>
                <button
                  className="btn-ghost btn-sm"
                  style={{ color: 'var(--error, #ef4444)' }}
                  onClick={(e) => { e.stopPropagation(); setDeleteId(org.id) }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span style={{ opacity: 0.6, alignSelf: 'center', fontSize: '0.85rem' }}>Page {page} of {pages}</span>
          <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}

      {/* Detail modal */}
      {detailId && <OrgDetailModal orgId={detailId} onClose={() => setDetailId(null)} />}

      {/* Delete confirmation */}
      {deleteId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setDeleteId(null)}
        >
          <div
            className="card"
            style={{ maxWidth: '400px', width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="card-title" style={{ marginBottom: '0.75rem' }}>Delete Organisation?</h2>
            <p style={{ opacity: 0.7, marginBottom: '1.5rem', lineHeight: 1.6 }}>
              This permanently deletes the organisation and all its members, employees, payroll runs, and audit logs.
              <strong> This cannot be undone.</strong>
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setDeleteId(null)}>Cancel</button>
              <button
                className="btn-primary"
                style={{ flex: 1, background: 'var(--error, #ef4444)', borderColor: 'var(--error, #ef4444)' }}
                disabled={deleteOrg.isPending}
                onClick={() => deleteOrg.mutate(deleteId)}
              >
                {deleteOrg.isPending ? <><span className="spinner-sm" /> Deleting…</> : 'Delete Permanently'}
              </button>
            </div>
            {deleteOrg.isError && <div className="error-box" style={{ marginTop: '0.75rem' }}>⚠ Delete failed. Try again.</div>}
          </div>
        </div>
      )}
    </div>
  )
}

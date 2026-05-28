import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../services/api'

// ── Secret confirmation modal ──────────────────────────────────────────────────
function SecretModal({ target, action, onClose, onConfirm, isPending, error }) {
  const [secret, setSecret]   = useState('')
  const [showSecret, setShow] = useState(false)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: '420px', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="card-title" style={{ marginBottom: '0.5rem' }}>
          {action === 'grant' ? '⚡ Grant' : '✕ Revoke'} Super Admin
        </h2>
        <p style={{ opacity: 0.7, marginBottom: '1.25rem', lineHeight: 1.6 }}>
          {action === 'grant'
            ? `This will give ${target.name || target.email} platform-wide super admin access.`
            : `This will remove super admin access from ${target.name || target.email}.`}
        </p>

        <div className="form-group">
          <label className="form-label">ADMIN_SECRET (from your .env)</label>
          <div className="pw-wrap">
            <input
              className="form-input"
              type={showSecret ? 'text' : 'password'}
              placeholder="Paste your ADMIN_SECRET here"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoFocus
            />
            <button type="button" className="pw-eye" onClick={() => setShow((v) => !v)} tabIndex={-1} aria-label={showSecret ? 'Hide secret' : 'Show secret'}>
              {showSecret ? '🙈' : '👁'}
            </button>
          </div>
          <div style={{ fontSize: '0.78rem', opacity: 0.5, marginTop: '0.35rem' }}>
            Found in <code>apps/api/.env</code> as <code>ADMIN_SECRET=…</code>
          </div>
        </div>

        {error && <div className="error-box" style={{ marginBottom: '0.75rem' }}>⚠ {error}</div>}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className="btn-primary"
            style={{
              flex: 1,
              ...(action === 'revoke' ? { background: 'var(--error, #ef4444)', borderColor: 'var(--error, #ef4444)' } : {}),
            }}
            disabled={!secret.trim() || isPending}
            onClick={() => onConfirm(secret.trim())}
          >
            {isPending ? <><span className="spinner-sm" /> Working…</> : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AdminUserList() {
  const { user }  = useAuth()
  const navigate  = useNavigate()
  const qc        = useQueryClient()

  const [search,      setSearch]      = useState('')
  const [page,        setPage]        = useState(1)
  const [modal,       setModal]       = useState(null)   // { userId, name, email, action }
  const [modalError,  setModalError]  = useState('')

  // Redirect non-super-admins
  if (user && !user.isSuperAdmin) {
    navigate('/dashboard', { replace: true })
    return null
  }

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', search, page],
    queryFn:  async () => {
      const params = new URLSearchParams({ page, pageSize: 25 })
      if (search) params.set('search', search)
      const res = await api.get(`/admin/users?${params}`)
      if (!res.ok) throw new Error('Failed to load users')
      return res.json()
    },
  })

  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, isSuperAdmin, secret }) => {
      const res = await api.patch(
        `/admin/users/${userId}/super-admin`,
        { isSuperAdmin },
        { 'X-Admin-Secret': secret },
      )
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Request failed')
      return body
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setModal(null)
      setModalError('')
    },
    onError: (err) => setModalError(err.message),
  })

  const users  = data?.users  ?? []
  const total  = data?.total  ?? 0
  const pages  = Math.ceil(total / 25)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">All Users</h1>
          <p className="page-sub">Every registered account on the platform</p>
        </div>
        <button className="btn-ghost" onClick={() => navigate('/admin')}>← Admin Home</button>
      </div>

      {/* Search */}
      <div className="filter-bar">
        <input
          className="filter-input"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        />
        {search && (
          <button className="btn-ghost btn-sm" onClick={() => { setSearch(''); setPage(1) }}>Clear</button>
        )}
      </div>

      {total > 0 && (
        <div className="ledger-summary">
          <span>{total} user{total !== 1 ? 's' : ''}</span>
        </div>
      )}

      {isLoading && <div className="empty-state"><span className="spinner-sm" /> Loading…</div>}

      {!isLoading && users.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">{total === 0 && !search ? '👥' : '🔍'}</div>
          <p className="empty-title">{total === 0 && !search ? 'No users yet' : 'No results'}</p>
          <p className="empty-desc">{total === 0 && !search ? 'Users appear here after they sign up.' : 'Try a different search.'}</p>
        </div>
      )}

      {/* Table */}
      {users.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Orgs</th>
                  <th>Joined</th>
                  <th>Role</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>{u.fullName || '—'}</td>
                    <td style={{ opacity: 0.75 }}>{u.email}</td>
                    <td className="td-num">{u._count?.orgMembers ?? 0}</td>
                    <td style={{ opacity: 0.6, fontSize: '0.85rem' }}>
                      {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td>
                      {u.isSuperAdmin
                        ? <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.85rem' }}>⚡ Super Admin</span>
                        : <span style={{ opacity: 0.45, fontSize: '0.85rem' }}>User</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {/* Can't revoke own super admin via this UI — backend also blocks it */}
                      {u.id !== user?.id && (
                        <button
                          className="btn-ghost btn-sm"
                          style={u.isSuperAdmin ? { color: 'var(--error, #ef4444)' } : {}}
                          onClick={() => setModal({
                            userId:  u.id,
                            name:    u.fullName,
                            email:   u.email,
                            action:  u.isSuperAdmin ? 'revoke' : 'grant',
                            current: u.isSuperAdmin,
                          })}
                        >
                          {u.isSuperAdmin ? 'Revoke Admin' : 'Grant Admin'}
                        </button>
                      )}
                      {u.id === user?.id && (
                        <span style={{ opacity: 0.35, fontSize: '0.8rem' }}>You</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
          <button className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
          <span style={{ opacity: 0.6, alignSelf: 'center', fontSize: '0.85rem' }}>Page {page} of {pages}</span>
          <button className="btn-ghost btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</button>
        </div>
      )}

      {/* Secret modal */}
      {modal && (
        <SecretModal
          target={{ name: modal.name, email: modal.email }}
          action={modal.action}
          isPending={toggleAdmin.isPending}
          error={modalError}
          onClose={() => { setModal(null); setModalError('') }}
          onConfirm={(secret) => toggleAdmin.mutate({ userId: modal.userId, isSuperAdmin: !modal.current, secret })}
        />
      )}
    </div>
  )
}

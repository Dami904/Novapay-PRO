import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { useOrg } from '../../context/OrgContext'
import { useAuth } from '../../context/AuthContext'

const ROLES = ['admin', 'finance', 'hr', 'viewer']

export default function MembersPage() {
  const { currentOrgId, currentRole } = useOrg()
  const { user } = useAuth()
  const qc = useQueryClient()
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'viewer' })
  const [inviteMsg, setInviteMsg]   = useState('')
  const [inviteErr, setInviteErr]   = useState('')

  const { data: members, isLoading } = useQuery({
    queryKey: ['members', currentOrgId],
    queryFn:  async () => {
      const res = await api.get(`/orgs/${currentOrgId}/members`)
      return res.ok ? res.json() : []
    },
    enabled: !!currentOrgId,
  })

  const invite = useMutation({
    mutationFn: (body) => api.post(`/orgs/${currentOrgId}/invitations`, body),
    onSuccess:  async (res) => {
      const d = await res.json()
      if (res.ok) { setInviteMsg(d.message); setInviteForm({ email: '', role: 'viewer' }) }
      else setInviteErr(d.error ?? 'Failed to invite')
    },
  })

  const changeRole = useMutation({
    mutationFn: ({ userId, role }) => api.patch(`/orgs/${currentOrgId}/members/${userId}`, { role }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  const removeMember = useMutation({
    mutationFn: (userId) => api.delete(`/orgs/${currentOrgId}/members/${userId}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['members'] }),
  })

  const canManage = ['owner', 'admin'].includes(currentRole)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Team Members</h1>
          <p className="page-sub">{members?.length ?? 0} members in this organization</p>
        </div>
      </div>

      {/* Invite form */}
      {canManage && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="card-title" style={{ marginBottom: '1rem' }}>Invite a Team Member</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 2, minWidth: '200px', margin: 0 }}>
              <label className="form-label">Email address</label>
              <input
                className="form-input"
                type="email"
                placeholder="colleague@company.com"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ flex: 1, minWidth: '130px', margin: 0 }}>
              <label className="form-label">Role</label>
              <select className="form-input" value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}>
                {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            <button
              className="btn-primary"
              onClick={() => { setInviteMsg(''); setInviteErr(''); invite.mutate(inviteForm) }}
              disabled={invite.isPending || !inviteForm.email}
            >
              {invite.isPending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
          {inviteMsg && <p style={{ color: '#10b981', marginTop: '0.75rem', fontSize: '0.9rem' }}>✓ {inviteMsg}</p>}
          {inviteErr && <p className="auth-error" style={{ marginTop: '0.75rem' }}>⚠ {inviteErr}</p>}
        </div>
      )}

      {/* Members list */}
      {isLoading ? (
        <div className="empty-state"><span className="spinner-sm" /> Loading…</div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  {canManage && <th></th>}
                </tr>
              </thead>
              <tbody>
                {(members ?? []).map((m) => (
                  <tr key={m.id}>
                    <td>{m.user.fullName ?? '—'}</td>
                    <td>{m.user.email}</td>
                    <td>
                      {canManage && m.role !== 'owner' && m.userId !== user?.id ? (
                        <select
                          className="form-input"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', width: 'auto' }}
                          value={m.role}
                          onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value })}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                        </select>
                      ) : (
                        <span className="status-badge badge-draft" style={{ textTransform: 'capitalize' }}>{m.role}</span>
                      )}
                    </td>
                    <td>{new Date(m.joinedAt).toLocaleDateString()}</td>
                    {canManage && (
                      <td>
                        {m.role !== 'owner' && m.userId !== user?.id && (
                          <button
                            className="btn-ghost btn-sm"
                            style={{ color: '#ef4444' }}
                            onClick={() => removeMember.mutate(m.userId)}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

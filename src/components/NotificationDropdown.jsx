import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { useOrg } from '../context/OrgContext'

function notifRoute(n) {
  if (n.resourceType === 'payroll_run' && n.resourceId) return `/payroll/${n.resourceId}`
  if (n.type === 'member_invited') return '/members'
  return null
}

export default function NotificationDropdown() {
  const { currentOrgId } = useOrg()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const { data } = useQuery({
    queryKey: ['notifications', currentOrgId],
    queryFn:  async () => {
      if (!currentOrgId) return { notifications: [], unreadCount: 0 }
      const res = await api.get(`/me/notifications?orgId=${currentOrgId}&pageSize=20`)
      return res.ok ? res.json() : { notifications: [], unreadCount: 0 }
    },
    refetchInterval: 30_000,
    enabled: !!currentOrgId,
  })

  const markOne = useMutation({
    mutationFn: (id) => api.patch(`/me/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', currentOrgId] }),
  })

  const markAll = useMutation({
    mutationFn: () => api.post('/me/notifications/read-all', { orgId: currentOrgId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', currentOrgId] }),
  })

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const unread        = data?.unreadCount ?? 0
  const notifications = data?.notifications ?? []

  return (
    <div className="notif-wrapper" ref={ref}>
      <button
        className="notif-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread ? ` — ${unread} unread` : ''}`}
      >
        🔔
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <span>Notifications</span>
            {unread > 0 && (
              <button className="btn-ghost btn-sm" onClick={() => markAll.mutate()}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`notif-item ${!n.read ? 'notif-unread' : ''}`}
                  onClick={() => { if (!n.read) markOne.mutate(n.id) }}
                >
                  <div className="notif-title" style={{ paddingRight: notifRoute(n) ? '1.5rem' : 0 }}>{n.title}</div>
                  <div className="notif-body">{n.body}</div>
                  <div className="notif-time">
                    {new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {notifRoute(n) && (
                    <span
                      className="notif-nav-arrow"
                      title="Go to page"
                      onClick={(e) => { e.stopPropagation(); if (!n.read) markOne.mutate(n.id); setOpen(false); navigate(notifRoute(n)) }}
                    >→</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

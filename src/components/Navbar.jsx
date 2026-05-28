import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { useWeb3 } from '../context/Web3Context'
import NotificationDropdown from './NotificationDropdown'
import { useTheme } from '../App'

export default function Navbar() {
  const { user, logout }     = useAuth()
  const { currentOrgMeta, currentRole } = useOrg()
  const { account, isCorrectNetwork, networkError, switchToMorph } = useWeb3()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [switching, setSwitching] = useState(false)

  if (!user) return null

  const navLinks = [
    { to: '/dashboard',      label: 'Dashboard' },
    { to: '/history',        label: 'Payroll' },
    { to: '/approval-queue', label: 'Approvals', roles: ['owner', 'admin', 'finance'] },
    { to: '/employees',      label: 'Employees' },
    { to: '/members',        label: 'Members' },
  ]

  const visibleLinks = navLinks.filter((l) => !l.roles || l.roles.includes(currentRole))
  const isSuperAdmin = user?.isSuperAdmin

  async function handleSwitchNetwork() {
    if (switching) return
    setSwitching(true)
    try { await switchToMorph() } catch { /* user rejected */ } finally { setSwitching(false) }
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/dashboard" className="navbar-logo">
          <span className="logo-icon">✦</span>
          <span className="logo-text">NovaPay</span>
        </Link>

        <div className="navbar-links">
          {visibleLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`nav-link ${location.pathname.startsWith(link.to) ? 'active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
          {isSuperAdmin && (
            <Link
              to="/admin"
              className={`nav-link ${location.pathname.startsWith('/admin') ? 'active' : ''}`}
              style={{ opacity: 0.75 }}
            >
              ⚡ Admin
            </Link>
          )}
        </div>

        <div className="navbar-right">
          <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>

          {account && (
            isCorrectNetwork ? (
              <div className="network-badge ok"><span className="network-dot" />Morph</div>
            ) : (
              <button className="network-badge warn network-badge-btn" onClick={handleSwitchNetwork} disabled={switching}>
                <span className="network-dot" />{switching ? 'Switching…' : 'Wrong Network'}
              </button>
            )
          )}

          <NotificationDropdown />

          {['owner', 'admin'].includes(currentRole) && (
            <button className="theme-toggle" onClick={() => navigate('/settings')} title="Settings">⚙</button>
          )}

          <div className="wallet-chip" style={{ gap: '0.5rem' }}>
            {currentOrgMeta && (
              <span style={{ opacity: 0.7, fontSize: '0.8rem', textTransform: 'capitalize' }}>
                {currentOrgMeta.role}
              </span>
            )}
            <span>{user.fullName?.split(' ')[0] ?? user.email}</span>
            <button className="disconnect-btn" onClick={logout} title="Log out">✕</button>
          </div>
        </div>
      </div>

      {networkError && account && (
        <button className="network-warning-bar" onClick={handleSwitchNetwork} disabled={switching}>
          ⚠ {networkError}
          <span className="switch-cta">{switching ? 'Switching…' : '→ Click to switch'}</span>
        </button>
      )}
    </nav>
  )
}

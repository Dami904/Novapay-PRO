import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useWeb3 } from '../context/Web3Context'

function shortAddress(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function Navbar() {
  const { account, usdcBalance, isCorrectNetwork, networkError, disconnect, switchToMorph, demoMode } = useWeb3()
  const location = useLocation()
  const [switching, setSwitching] = useState(false)

  async function handleSwitchNetwork() {
    if (switching) return
    setSwitching(true)
    try {
      await switchToMorph()
    } catch {
      // user rejected or error — silently reset
    } finally {
      setSwitching(false)
    }
  }

  if (!account) return null

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/payroll/new', label: 'New Payroll' },
    { to: '/history', label: 'Ledger' },
  ]

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/dashboard" className="navbar-logo">
          <span className="logo-icon">✦</span>
          <span className="logo-text">NovaPay</span>
        </Link>

        <div className="navbar-links">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`nav-link ${location.pathname === link.to ? 'active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="navbar-right">
          {demoMode && (
            <span className="demo-badge">DEMO MODE</span>
          )}
          {isCorrectNetwork ? (
            <div className="network-badge ok">
              <span className="network-dot" />
              Morph Testnet
            </div>
          ) : (
            <button
              className="network-badge warn network-badge-btn"
              onClick={handleSwitchNetwork}
              disabled={switching}
              title="Click to switch to Morph Hoodi"
            >
              <span className="network-dot" />
              {switching ? 'Switching…' : 'Wrong Network'}
            </button>
          )}
          <div className="usdc-balance">
            <span className="balance-label">USDC</span>
            <span className="balance-value">{parseFloat(usdcBalance).toLocaleString()}</span>
          </div>
          <div className="wallet-chip">
            <span className="wallet-dot" />
            <span>{shortAddress(account)}</span>
            <button className="disconnect-btn" onClick={disconnect} title="Disconnect">✕</button>
          </div>
        </div>
      </div>
      {networkError && (
        <button className="network-warning-bar" onClick={handleSwitchNetwork} disabled={switching}>
          ⚠ {networkError}
          <span className="switch-cta">{switching ? 'Switching…' : '→ Click to switch'}</span>
        </button>
      )}
    </nav>
  )
}

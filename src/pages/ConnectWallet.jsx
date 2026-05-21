import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeb3 } from '../context/Web3Context'

export default function ConnectWallet() {
  const { connect, switchToMorph, isCorrectNetwork } = useWeb3()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleConnect() {
    setError('')
    setLoading(true)
    try {
      await connect()
      if (!isCorrectNetwork) {
        try { await switchToMorph() } catch {}
      }
      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Failed to connect wallet')
    } finally {
      setLoading(false)
    }
  }

  const features = [
    { icon: '⬆', label: 'Upload CSV', desc: 'Drop in wallet addresses and amounts' },
    { icon: '⚡', label: 'One-Click Payout', desc: 'Batch pay everyone in a single transaction' },
    { icon: '🏷', label: 'Labeled Onchain', desc: 'Every payroll tagged as a permanent record' },
    { icon: '📊', label: 'Export Ledger', desc: 'Audit-ready spreadsheet in seconds' },
  ]

  return (
    <div className="connect-page">
      <div className="connect-bg">
        <div className="bg-orb orb-1" />
        <div className="bg-orb orb-2" />
        <div className="bg-grid" />
      </div>

      <div className="connect-content">
        <div className="connect-hero">
          <div className="hero-logo">
            <span className="hero-logo-icon">✦</span>
            <span className="hero-logo-text">NovaPay</span>
          </div>
          <h1 className="hero-headline">
            Web3 Payroll That<br />
            <span className="gradient-text">Actually Makes Sense.</span>
          </h1>
          <p className="hero-sub">
            Batch USDC payouts, onchain labels, and audit-ready exports — all in one transaction.
            Built on Morph.
          </p>

          <div className="connect-actions">
            <button
              className="btn-connect"
              onClick={handleConnect}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner-sm" />
                  Connecting…
                </>
              ) : (
                <>
                  <span className="metamask-icon">🦊</span>
                  Connect Wallet
                </>
              )}
            </button>
            {error && <p className="connect-error">⚠ {error}</p>}
            <p className="connect-hint">MetaMask or WalletConnect · Morph Hoodi</p>
          </div>
        </div>

        <div className="features-grid">
          {features.map((f) => (
            <div key={f.label} className="feature-card">
              <span className="feature-icon">{f.icon}</span>
              <div>
                <div className="feature-label">{f.label}</div>
                <div className="feature-desc">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="connect-footer">
          <span className="footer-chain">
            <span className="chain-dot" />
            Morph Hoodi · Chain ID 2910
          </span>
          <span>USDC · Solidity · ethers.js</span>
        </div>
      </div>
    </div>
  )
}

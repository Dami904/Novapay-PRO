import { Link } from 'react-router-dom'

const FEATURES = [
  { icon: '👥', label: 'Role-Based Approvals',   desc: 'HR uploads, Finance approves, Owner executes. Every step tracked.' },
  { icon: '⬆',  label: 'CSV Batch Payroll',       desc: 'Upload your payroll file and pay everyone in a single on-chain transaction.' },
  { icon: '🔗',  label: 'Fully On-Chain',          desc: 'Every payout is recorded on Morph L2. Verifiable by anyone, forever.' },
  { icon: '📋',  label: 'Audit Log',               desc: 'Every action—approve, reject, execute—is logged with actor and timestamp.' },
  { icon: '✉️',  label: 'Payslip Emails',          desc: 'Every recipient gets a personal email with their exact amount and a direct link to their payment on-chain.' },
  { icon: '🔔',  label: 'Discord Notifications',   desc: 'Get instant alerts in your team Discord channel when payroll is submitted, approved, or executed.' },
]

export default function LandingPage() {
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
            <span className="hero-logo-text">NovaPay Pro</span>
          </div>

          <h1 className="hero-headline">
            Web3 Payroll for Large Teams<br />
            <span className="gradient-text">That Actually Makes Sense.</span>
          </h1>
          <p className="hero-sub">
            Multi-role approvals, CSV batch payouts, full audit trail,
            personalised payslip emails &amp; Discord alerts —
            all on-chain on Morph L2. Built for real companies.
          </p>

          <div className="connect-actions">
            <Link to="/signup" className="btn-connect" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
              <span>✦</span>
              Get Started →
            </Link>
            <p className="connect-hint">
              Already have an account?{' '}
              <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600 }}>Log in</Link>
            </p>
          </div>
        </div>

        <div className="features-grid">
          {FEATURES.map((f) => (
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
          <span>USDC &amp; USDT · Built for Morph</span>
        </div>
      </div>
    </div>
  )
}

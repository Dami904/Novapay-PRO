import { useNavigate } from 'react-router-dom'
import { useWeb3 } from '../context/Web3Context'

function shortAddress(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export default function Dashboard() {
  const { stats, account, usdcBalance, history, demoMode } = useWeb3()
  const navigate = useNavigate()

  const recentRuns = history.slice(0, 3)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">
            {account && <span className="wallet-tag">{shortAddress(account)}</span>}
            {demoMode && <span className="demo-inline-badge"> · Demo Mode — no real transactions</span>}
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/payroll/new')}>
          + Run New Payroll
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card stat-primary">
          <div className="stat-label">Total Paid Out</div>
          <div className="stat-value">
            ${stats.totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="stat-sub">USDC · all time</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Payroll Runs</div>
          <div className="stat-value">{stats.totalRuns}</div>
          <div className="stat-sub">completed batches</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">USDC Balance</div>
          <div className="stat-value">${parseFloat(usdcBalance).toLocaleString()}</div>
          <div className="stat-sub">available to pay</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Last Payroll</div>
          {stats.lastRun ? (
            <>
              <div className="stat-value stat-value-sm">{stats.lastRun.label}</div>
              <div className="stat-sub">
                {new Date(stats.lastRun.timestamp).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric',
                })}
              </div>
            </>
          ) : (
            <div className="stat-value stat-value-sm stat-empty">None yet</div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Recent Activity</h2>
          {history.length > 0 && (
            <button className="btn-ghost" onClick={() => navigate('/history')}>
              View all →
            </button>
          )}
        </div>

        {recentRuns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <p className="empty-title">No payroll runs yet</p>
            <p className="empty-desc">Upload a CSV and run your first batch payout to get started.</p>
            <button className="btn-primary" onClick={() => navigate('/payroll/new')}>
              Run First Payroll
            </button>
          </div>
        ) : (
          <div className="recent-list">
            {recentRuns.map((run) => (
              <div key={run.id} className="recent-item">
                <div className="recent-left">
                  <div className="recent-label">{run.label}</div>
                  <div className="recent-meta">
                    {run.recipientCount} recipients ·{' '}
                    {new Date(run.timestamp).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </div>
                </div>
                <div className="recent-right">
                  <div className="recent-amount">${run.totalAmount.toLocaleString()} USDC</div>
                  {run.explorerUrl && (
                    <a
                      href={run.explorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="tx-link"
                    >
                      {run.txHash.slice(0, 10)}… ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="cta-banner">
        <div className="cta-text">
          <strong>Ready to run payroll?</strong>
          <span> Upload your CSV and pay everyone in one transaction.</span>
        </div>
        <button className="btn-primary" onClick={() => navigate('/payroll/new')}>
          + New Payroll Run
        </button>
      </div>
    </div>
  )
}

import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

export default function TransactionConfirmation() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state

  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    return () => clearTimeout(t)
  }, [])

  if (!state) {
    navigate('/dashboard')
    return null
  }

  const { txHash, explorerUrl, label, recipientCount, totalAmount, token = 'USDC' } = state

  return (
    <div className="page confirm-page">
      <div className={`confirm-card ${visible ? 'confirm-visible' : ''}`}>
        <div className="confirm-icon-wrap">
          <div className="confirm-icon">✓</div>
          <div className="confirm-ripple" />
          <div className="confirm-ripple confirm-ripple-2" />
        </div>

        <h1 className="confirm-title">Payroll Sent!</h1>
        <p className="confirm-sub">
          Your batch payout has been processed onchain and permanently recorded.
        </p>

        <div className="confirm-details">
          <div className="confirm-row">
            <span className="confirm-key">Label</span>
            <span className="confirm-val confirm-label-val">{label}</span>
          </div>
          <div className="confirm-row">
            <span className="confirm-key">Recipients</span>
            <span className="confirm-val">{recipientCount} employees paid</span>
          </div>
          <div className="confirm-row">
            <span className="confirm-key">Total Disbursed</span>
            <span className="confirm-val confirm-amount">
              ${totalAmount.toLocaleString()} {token}
            </span>
          </div>
          <div className="confirm-row">
            <span className="confirm-key">Transaction Hash</span>
            <span className="confirm-val confirm-hash">
              {txHash ? (
                explorerUrl ? (
                  <a href={explorerUrl} target="_blank" rel="noreferrer" className="tx-hash-link">
                    {txHash.slice(0, 18)}…{txHash.slice(-6)} ↗
                  </a>
                ) : (
                  <span className="hash-text">{txHash.slice(0, 18)}…</span>
                )
              ) : '—'}
            </span>
          </div>
        </div>

        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-explorer"
          >
            View on Morph Explorer ↗
          </a>
        )}

        <div className="confirm-actions">
          <button className="btn-primary" onClick={() => navigate('/payroll/new')}>
            + Run Another Payroll
          </button>
          <button className="btn-ghost" onClick={() => navigate('/history')}>
            View Ledger
          </button>
          <button className="btn-ghost" onClick={() => navigate('/dashboard')}>
            Dashboard
          </button>
        </div>

        <div className="confirm-note">
          This payroll event is permanently recorded on Morph with the label <strong>"{label}"</strong>.
          Head to the Ledger to export your accounting report.
        </div>
      </div>
    </div>
  )
}

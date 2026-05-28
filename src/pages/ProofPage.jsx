import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '../App'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export default function ProofPage() {
  const { txHash }          = useParams()
  const { theme, toggleTheme } = useTheme()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['proof', txHash],
    queryFn:  async () => {
      const res = await fetch(`${BASE}/api/v1/proof/${txHash}`)
      if (res.status === 404) return null
      if (!res.ok) throw new Error('Server error')
      return res.json()
    },
    retry: false,
  })

  return (
    <div className="connect-page">
      {/* Floating theme toggle */}
      <button
        className="theme-toggle theme-toggle-float"
        onClick={toggleTheme}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? '☀' : '☾'}
      </button>

      {/* Ambient orbs */}
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />

      <div style={{ width: '100%', maxWidth: '560px', zIndex: 1 }}>
        {/* NovaPay branding */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.4rem' }}>✦</span>
            <span style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.02em' }}>NovaPay</span>
          </Link>
          <div style={{ marginTop: '0.5rem', opacity: 0.5, fontSize: '0.85rem' }}>On-chain payroll verification</div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="auth-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <span className="spinner-sm" style={{ marginBottom: '1rem', display: 'block' }} />
            <div style={{ opacity: 0.6 }}>Verifying transaction…</div>
          </div>
        )}

        {/* Not found */}
        {!isLoading && (isError || data === null) && (
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠</div>
            <h2 style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Not Verified</h2>
            <p style={{ opacity: 0.65, marginBottom: '1.5rem', lineHeight: 1.6 }}>
              No verified payroll run was found for this transaction hash. It may not exist, or the run is not yet complete.
            </p>
            <div style={{ background: 'var(--surface)', borderRadius: '8px', padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.78rem', opacity: 0.6, wordBreak: 'break-all' }}>
              {txHash}
            </div>
          </div>
        )}

        {/* Verified receipt */}
        {!isLoading && data && (
          <div className="auth-card">
            {/* Verified header */}
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✓</div>
              <h2 className="gradient-text" style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                Payroll Verified
              </h2>
              <div style={{ opacity: 0.55, fontSize: '0.85rem' }}>
                This payroll run was executed on-chain and confirmed
              </div>
            </div>

            {/* Receipt rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.75rem' }}>
              {[
                { label: 'Organisation',   value: data.org?.name },
                { label: 'Run Label',      value: data.label },
                { label: 'Total Payout',   value: `$${Number(data.totalAmount).toLocaleString()} ${data.token}`, highlight: true },
                { label: 'Recipients',     value: `${data.recipientCount} employee${data.recipientCount !== 1 ? 's' : ''}` },
                { label: 'Executed',       value: data.executedAt ? new Date(data.executedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) : '—' },
              ].map(({ label, value, highlight }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border, rgba(255,255,255,0.07))' }}>
                  <span style={{ opacity: 0.55, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{label}</span>
                  <span style={{ fontWeight: highlight ? 700 : 500, textAlign: 'right', ...(highlight ? { color: 'var(--accent)' } : {}) }}>
                    {value || '—'}
                  </span>
                </div>
              ))}
            </div>

            {/* Tx hash */}
            <div style={{ background: 'var(--surface)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
              <div style={{ opacity: 0.45, fontSize: '0.75rem', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Transaction Hash</div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', opacity: 0.8 }}>{data.txHash}</div>
            </div>

            {/* Explorer link */}
            {data.explorerUrl && (
              <a
                href={data.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-primary"
                style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}
              >
                View on Morph Explorer ↗
              </a>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '1.5rem', opacity: 0.4, fontSize: '0.8rem' }}>
          Powered by <Link to="/" style={{ color: 'inherit' }}>NovaPay</Link>
        </div>
      </div>
    </div>
  )
}

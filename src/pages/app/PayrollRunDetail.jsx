import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { useOrg } from '../../context/OrgContext'
import { useWeb3 } from '../../context/Web3Context'
import { ethers } from 'ethers'
import { NOVAPAY_ABI, NOVAPAY_CONTRACT_ADDRESS } from '../../utils/contractABI'
import PayrollStatusBadge from '../../components/PayrollStatusBadge'
import { getFriendlyErrorMessage } from '../../utils/userMessages'

const CAN_EXECUTE = ['owner', 'admin']
const CAN_RECALL  = ['owner', 'admin']

function shortAddr(a) { return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—' }

export default function PayrollRunDetail() {
  const { id }           = useParams()
  const { currentOrgId, currentRole } = useOrg()
  const { signer, account, connect, isCorrectNetwork } = useWeb3()
  const navigate         = useNavigate()
  const qc               = useQueryClient()
  const [execError, setExecError]   = useState('')
  const [executing, setExecuting]   = useState(false)
  const [recallNote, setRecallNote] = useState('')
  const [recalling, setRecalling]   = useState(false)
  const [recallErr, setRecallErr]   = useState('')

  const { data: run, isLoading } = useQuery({
    queryKey: ['payroll-run', id],
    queryFn:  async () => {
      const res = await api.get(`/orgs/${currentOrgId}/payroll-runs/${id}`)
      if (!res.ok) throw new Error('Run not found')
      return res.json()
    },
    enabled: !!currentOrgId && !!id,
  })

  // Execute: fetch unsigned tx data from backend → MetaMask signs → POST /execute with txHash
  const execute = useMutation({
    mutationFn: async () => {
      setExecError('')
      // Always prompt MetaMask — lets user pick any wallet + gets fresh network state
      const networkOk = await connect()
      if (!networkOk) throw new Error('Please switch to the Morph Hoodi network and try again.')

      // 2. Get unsigned tx data from backend
      const txRes  = await api.get(`/orgs/${currentOrgId}/payroll-runs/${id}/tx-data`)
      const txData = await txRes.json()
      if (!txRes.ok) throw new Error(txData.error ?? 'Failed to build transaction')

      // 3. Approve token spend via MetaMask
      const tokenContract = new ethers.Contract(txData.tokenAddress, [
        { inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], name: 'approve', outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable', type: 'function' },
      ], signer)
      const approveTx = await tokenContract.approve(NOVAPAY_CONTRACT_ADDRESS, ethers.parseUnits(txData.totalAmount, txData.decimals))
      await approveTx.wait()

      // 4. Call batchPayout
      const contract = new ethers.Contract(NOVAPAY_CONTRACT_ADDRESS, NOVAPAY_ABI, signer)
      const tx = await contract.batchPayout(
        txData.tokenAddress,
        txData.recipients,
        txData.amounts.map(BigInt),
        txData.label,
      )

      // 5. Notify backend of the txHash
      await api.post(`/orgs/${currentOrgId}/payroll-runs/${id}/execute`, { txHash: tx.hash })
      return tx.hash
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-run', id] }),
    onError:   (err) => setExecError(getFriendlyErrorMessage(err, 'Execution failed. Please try again.')),
  })

  if (isLoading) return <div className="page"><div className="empty-state"><span className="spinner-sm" /> Loading…</div></div>
  if (!run)      return <div className="page"><div className="empty-state"><p className="empty-title">Run not found</p></div></div>

  // Success screen after execution
  if (execute.isSuccess) {
    const txHash = execute.data
    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '3rem' }}>
        <div className="card" style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
          {/* Checkmark */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem', boxShadow: '0 0 32px rgba(99,102,241,0.4)',
            }}>✓</div>
          </div>

          <h1 style={{ fontWeight: 700, fontSize: '1.6rem', marginBottom: '0.5rem' }}>Payroll Sent!</h1>
          <p style={{ opacity: 0.6, fontSize: '0.9rem', marginBottom: '1.75rem', lineHeight: 1.6 }}>
            Your batch payout has been processed onchain and permanently recorded.
          </p>

          {/* Receipt rows */}
          <div style={{ textAlign: 'left', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '1.5rem' }}>
            {[
              { label: 'Label',          value: run.label },
              { label: 'Recipients',     value: `${run.recipientCount} employees paid` },
              { label: 'Total Disbursed', value: `$${Number(run.totalAmount).toLocaleString()} ${run.token}`, highlight: true },
              { label: 'Transaction Hash', value: `${txHash.slice(0, 18)}…${txHash.slice(-6)}` },
            ].map(({ label, value, highlight }, i, arr) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '0.75rem 1rem',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ opacity: 0.55, fontSize: '0.85rem' }}>{label}</span>
                <span style={{ fontWeight: 600, fontSize: '0.875rem', ...(highlight ? { color: 'var(--accent)' } : {}) }}>
                  {value}
                </span>
              </div>
            ))}
          </div>

          {/* Explorer link */}
          {run.explorerUrl && (
            <a
              href={run.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost"
              style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: '0.75rem' }}
            >
              View on Morph Explorer ↗
            </a>
          )}

          {/* Run another */}
          <button
            className="btn-primary"
            style={{ width: '100%', marginBottom: '1rem' }}
            onClick={() => navigate('/payroll/new')}
          >
            + Run Another Payroll
          </button>

          {/* Text links */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem' }}>
            <button className="btn-ghost btn-sm" onClick={() => navigate('/history')}>View Ledger</button>
            <button className="btn-ghost btn-sm" onClick={() => navigate('/dashboard')}>Dashboard</button>
          </div>
        </div>
      </div>
    )
  }

  const canExecute = CAN_EXECUTE.includes(currentRole) && run.status === 'approved'
  const canRecall  = CAN_RECALL.includes(currentRole)  && run.status === 'approved'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{run.label}</h1>
          <p className="page-sub" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <PayrollStatusBadge status={run.status} />
            <span>{run.recipientCount} recipients · ${Number(run.totalAmount).toLocaleString()} {run.token}</span>
          </p>
        </div>
        <button className="btn-ghost" onClick={() => navigate('/history')}>← Back</button>
      </div>

      {/* Approval trail */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>Approval Trail</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <TrailRow icon="📄" label="Created"  ts={run.createdAt}   actor={null} />
          <TrailRow icon="📤" label="Submitted" ts={run.submittedAt} actor={run.submittedByUser} />
          {run.reviewedAt && (
            <TrailRow
              icon={run.status === 'rejected' ? '✕' : '✓'}
              label={run.status === 'rejected' ? 'Rejected' : 'Approved'}
              ts={run.reviewedAt}
              actor={run.reviewedByUser}
              note={run.reviewNote}
              highlight={run.status === 'rejected' ? 'red' : 'green'}
            />
          )}
          {run.executedAt && (
            <TrailRow icon="⚡" label="Executed" ts={run.executedAt} actor={run.executedByUser} highlight="indigo" />
          )}
        </div>

        {run.txHash && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>Transaction: </span>
            {run.explorerUrl ? (
              <a href={run.explorerUrl} target="_blank" rel="noreferrer" className="tx-link">
                {run.txHash.slice(0, 18)}… ↗
              </a>
            ) : (
              <span className="addr-text">{run.txHash.slice(0, 18)}…</span>
            )}
          </div>
        )}
      </div>

      {/* Execute button */}
      {canExecute && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="card-title">Execute Payroll</h2>
          <p style={{ opacity: 0.7, marginBottom: '1rem', fontSize: '0.9rem' }}>
            MetaMask will open so you can pick which wallet signs and funds this payout.
          </p>
          {account && (
            <div style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
              <span style={{ opacity: 0.55 }}>Using: </span>
              <code style={{ opacity: 0.85 }}>{account.slice(0, 6)}…{account.slice(-4)}</code>
            </div>
          )}
          {execError && <p className="auth-error" style={{ marginBottom: '0.75rem' }}>⚠ {execError}</p>}
          <button
            className="btn-primary"
            onClick={() => { setExecuting(true); execute.mutate() }}
            disabled={execute.isPending || executing}
          >
            {execute.isPending ? <><span className="spinner-sm" /> Executing…</> : '⚡ Sign & Execute →'}
          </button>
        </div>
      )}

      {/* Recall approved run */}
      {canRecall && (
        <div className="card" style={{ marginBottom: '1.5rem', borderColor: '#ef4444', padding: '0.875rem 1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#ef4444', fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Recall Approval</span>
            <input
              className="form-input"
              placeholder="Reason for recalling (required)"
              value={recallNote}
              onChange={(e) => setRecallNote(e.target.value)}
              style={{ flex: 1, minWidth: '180px', fontSize: '0.85rem', padding: '0.4rem 0.65rem' }}
            />
            <button
              className="btn-danger"
              disabled={recalling || !recallNote.trim()}
              style={{ padding: '0.4rem 0.9rem', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
              onClick={async () => {
                setRecallErr('')
                setRecalling(true)
                try {
                  const res  = await api.post(`/orgs/${currentOrgId}/payroll-runs/${id}/reject`, { note: recallNote.trim() })
                  const data = await res.json()
                  if (!res.ok) throw new Error(data.error ?? 'Failed to recall')
                  qc.invalidateQueries({ queryKey: ['payroll-run', id] })
                  setRecallNote('')
                } catch (err) {
                  setRecallErr(err.message ?? 'Failed to recall approval')
                } finally {
                  setRecalling(false)
                }
              }}
            >
              {recalling ? '…' : 'Recall'}
            </button>
          </div>
          {recallErr && <p className="auth-error" style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>⚠ {recallErr}</p>}
        </div>
      )}

      {/* Recipients table */}
      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>Recipients ({run.recipientCount})</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Wallet Address</th>
                <th>Amount ({run.token})</th>
              </tr>
            </thead>
            <tbody>
              {(run.recipients ?? []).map((r, i) => (
                <tr key={r.id ?? i}>
                  <td className="td-num">{r.rowIndex ?? i + 1}</td>
                  <td>{r.fullName}</td>
                  <td className="td-addr"><span className="addr-text">{shortAddr(r.walletAddress)}</span></td>
                  <td className="td-amount">${Number(r.amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function TrailRow({ icon, label, ts, actor, note, highlight }) {
  const colors = { green: '#10b981', red: '#ef4444', indigo: '#6366f1' }
  return (
    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      <span style={{ fontSize: '1.1rem', marginTop: '0.05rem', color: colors[highlight] }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: colors[highlight] }}>{label}</div>
        {ts && <div style={{ opacity: 0.6, fontSize: '0.8rem' }}>{new Date(ts).toLocaleString()}</div>}
        {actor && <div style={{ opacity: 0.7, fontSize: '0.8rem' }}>{actor.fullName ?? actor.email}</div>}
        {note && <div style={{ opacity: 0.7, fontSize: '0.8rem', fontStyle: 'italic' }}>"{note}"</div>}
      </div>
    </div>
  )
}

import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeb3 } from '../context/Web3Context'
import { parsePayrollCSV } from '../utils/csvParser'

const SAMPLE_CSV = `wallet_address,name,amount
0x1234567890123456789012345678901234567890,Alice Chen,3000
0x2345678901234567890123456789012345678901,Bob Smith,2500
0x3456789012345678901234567890123456789012,Carol Diaz,2500`

export default function NewPayrollRun() {
  const { sendPayroll, usdcBalance } = useWeb3()
  const navigate = useNavigate()

  const [rows, setRows] = useState([])
  const [errors, setErrors] = useState([])
  const [label, setLabel] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const fileInputRef = useRef()

  const processFile = useCallback(async (file) => {
    if (!file) return
    if (!file.name.endsWith('.csv')) {
      setSendError('Please upload a .csv file')
      return
    }
    setSendError('')
    setFileName(file.name)
    const { rows: parsed, errors: errs } = await parsePayrollCSV(file)
    setRows(parsed)
    setErrors(errs)
  }, [])

  function onFileChange(e) {
    processFile(e.target.files[0])
  }

  function onDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    processFile(e.dataTransfer.files[0])
  }

  function onDragOver(e) {
    e.preventDefault()
    setIsDragging(true)
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'novapay-sample.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const validRows = rows.filter((r) => !r.hasError)
  const totalAmount = validRows.reduce((s, r) => s + r.amount, 0)
  const hasBalance = parseFloat(usdcBalance) >= totalAmount
  const canSend = validRows.length > 0 && label.trim() && errors.length === 0 && !sending

  async function handleSend() {
    if (!canSend) return
    setSendError('')
    setSending(true)
    try {
      const result = await sendPayroll({
        recipients: validRows.map((r) => r.address),
        amounts: validRows.map((r) => r.amount),
        label: label.trim(),
        rows: validRows,
      })
      navigate('/payroll/confirm', {
        state: {
          txHash: result.txHash,
          explorerUrl: result.explorerUrl,
          label: label.trim(),
          recipientCount: validRows.length,
          totalAmount,
        },
      })
    } catch (err) {
      setSendError(err.message || 'Transaction failed')
      setSending(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Payroll Run</h1>
          <p className="page-sub">Upload your CSV, set a label, and send in one transaction</p>
        </div>
        <button className="btn-ghost" onClick={() => navigate('/dashboard')}>
          ← Back
        </button>
      </div>

      <div className="payroll-layout">
        <div className="payroll-main">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Step 1 — Upload CSV</h2>
              <button className="btn-ghost btn-sm" onClick={downloadSample}>
                ↓ Sample CSV
              </button>
            </div>

            <div
              className={`dropzone ${isDragging ? 'dragging' : ''} ${fileName ? 'has-file' : ''}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={onFileChange}
                style={{ display: 'none' }}
              />
              {fileName ? (
                <div className="dropzone-loaded">
                  <span className="dropzone-file-icon">📄</span>
                  <div>
                    <div className="dropzone-filename">{fileName}</div>
                    <div className="dropzone-change">Click to replace</div>
                  </div>
                </div>
              ) : (
                <div className="dropzone-empty">
                  <span className="dropzone-icon">⬆</span>
                  <div className="dropzone-text">Drop your CSV here or click to browse</div>
                  <div className="dropzone-hint">
                    Required columns: <code>wallet_address</code>, <code>amount</code> · Optional: <code>name</code>
                  </div>
                </div>
              )}
            </div>
          </div>

          {rows.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Step 2 — Review Recipients</h2>
                <span className="badge-count">{validRows.length} valid · {errors.length} errors</span>
              </div>

              {errors.length > 0 && (
                <div className="error-banner">
                  <strong>⚠ Validation errors found — fix your CSV before sending</strong>
                  <ul className="error-list">
                    {errors.map((e, i) => (
                      <li key={i}>Line {e.line}: {e.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Wallet Address</th>
                      <th>Amount (USDC)</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={row.hasError ? 'row-error' : ''}>
                        <td className="td-num">{i + 1}</td>
                        <td>{row.name}</td>
                        <td className="td-addr">
                          <span className="addr-text">{row.address || '—'}</span>
                        </td>
                        <td className="td-amount">
                          {row.amount > 0 ? `$${row.amount.toLocaleString()}` : <span className="text-error">{row.amountRaw || '—'}</span>}
                        </td>
                        <td>
                          {row.hasError
                            ? <span className="status-error">✕ Error</span>
                            : <span className="status-ok">✓ Valid</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="total-row">
                <span className="total-label">Total Payout</span>
                <span className="total-amount">${totalAmount.toLocaleString()} USDC</span>
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Step 3 — Label This Payroll</h2>
              </div>
              <div className="label-input-group">
                <input
                  type="text"
                  className="label-input"
                  placeholder='e.g. "Payroll - May 2026" or "Contractor Payments Q2"'
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={100}
                />
                <div className="label-hint">
                  This label is emitted as an onchain event — it becomes a permanent record.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="payroll-sidebar">
          <div className="card sidebar-card">
            <h3 className="sidebar-title">Payroll Summary</h3>
            <div className="summary-rows">
              <div className="summary-row">
                <span>Recipients</span>
                <span>{validRows.length}</span>
              </div>
              <div className="summary-row">
                <span>Total Amount</span>
                <span className="summary-amount">${totalAmount.toLocaleString()} USDC</span>
              </div>
              <div className="summary-row">
                <span>Your Balance</span>
                <span className={hasBalance || totalAmount === 0 ? '' : 'text-error'}>
                  ${parseFloat(usdcBalance).toLocaleString()} USDC
                </span>
              </div>
              <div className="summary-row">
                <span>Label</span>
                <span className="summary-label-val">{label || '—'}</span>
              </div>
            </div>

            {!hasBalance && totalAmount > 0 && (
              <div className="warning-box">
                ⚠ Insufficient USDC balance
              </div>
            )}

            {sendError && (
              <div className="error-box">⚠ {sendError}</div>
            )}

            <button
              className="btn-primary btn-full"
              onClick={handleSend}
              disabled={!canSend || !hasBalance}
            >
              {sending ? (
                <>
                  <span className="spinner-sm" />
                  Sending Payroll…
                </>
              ) : (
                `Send Payroll → ${validRows.length > 0 ? `$${totalAmount.toLocaleString()} USDC` : ''}`
              )}
            </button>

            <div className="sidebar-checks">
              <div className={`check-item ${validRows.length > 0 ? 'check-ok' : ''}`}>
                {validRows.length > 0 ? '✓' : '○'} CSV uploaded
              </div>
              <div className={`check-item ${errors.length === 0 && rows.length > 0 ? 'check-ok' : ''}`}>
                {errors.length === 0 && rows.length > 0 ? '✓' : '○'} No validation errors
              </div>
              <div className={`check-item ${label.trim() ? 'check-ok' : ''}`}>
                {label.trim() ? '✓' : '○'} Payroll label set
              </div>
              <div className={`check-item ${hasBalance && totalAmount > 0 ? 'check-ok' : ''}`}>
                {hasBalance && totalAmount > 0 ? '✓' : '○'} Sufficient balance
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

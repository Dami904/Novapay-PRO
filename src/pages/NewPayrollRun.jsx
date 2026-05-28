import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { api } from '../services/api'
import { useOrg } from '../context/OrgContext'
import { parsePayrollCSV } from '../utils/csvParser'
import { getFriendlyErrorMessage } from '../utils/userMessages'

const SAMPLE_ROWS = [
  { wallet_address: '0x1234567890123456789012345678901234567890', name: 'Alice Chen',  amount: 3000, termination_date: '' },
  { wallet_address: '0x2345678901234567890123456789012345678901', name: 'Bob Smith',   amount: 2500, termination_date: '2027-12-31' },
  { wallet_address: '0x3456789012345678901234567890123456789012', name: 'Carol Diaz',  amount: 2500, termination_date: '' },
]
const SAMPLE_CSV = `wallet_address,name,amount,termination_date
0x1234567890123456789012345678901234567890,Alice Chen,3000,
0x2345678901234567890123456789012345678901,Bob Smith,2500,2027-12-31
0x3456789012345678901234567890123456789012,Carol Diaz,2500,`

export default function NewPayrollRun() {
  const { currentOrgId } = useOrg()
  const navigate         = useNavigate()

  const [rows, setRows]           = useState([])
  const [errors, setErrors]       = useState([])
  const [label, setLabel]         = useState('')
  const [selectedToken, setToken] = useState('USDC')
  const [isDragging, setDragging] = useState(false)
  const [fileName, setFileName]   = useState('')
  const [rawFile, setRawFile]     = useState(null)
  const [submitting, setSub]      = useState(false)
  const [submitError, setSubErr]  = useState('')
  const fileInputRef              = useRef()

  const processFile = useCallback(async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['csv', 'xlsx', 'xls'].includes(ext)) { setSubErr('Please upload a CSV or Excel file.'); return }
    setSubErr('')
    setFileName(file.name)
    setRawFile(file)
    try {
      const { rows: parsed, errors: errs } = await parsePayrollCSV(file)
      setRows(parsed)
      setErrors(errs)
    } catch (err) {
      setRows([]); setErrors([])
      setSubErr(getFriendlyErrorMessage(err, 'Could not read that file. Please try another one.'))
    }
  }, [])

  const onFileChange = (e) => processFile(e.target.files[0])
  const onDrop       = (e) => { e.preventDefault(); setDragging(false); processFile(e.dataTransfer.files[0]) }

  function downloadSampleCSV() {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: 'novapay-sample.csv' }).click()
    URL.revokeObjectURL(url)
  }
  function downloadSampleXLSX() {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_ROWS)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Payroll')
    const buf  = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url  = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, download: 'novapay-sample.xlsx' }).click()
    URL.revokeObjectURL(url)
  }

  const expiredRows = rows.filter((r) => r.isExpired && !r.hasError)
  const validRows   = rows.filter((r) => !r.hasError && !r.isExpired)
  const totalAmount = validRows.reduce((s, r) => s + r.amount, 0)
  const canSubmit   = validRows.length > 0 && label.trim() && errors.length === 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    setSubErr('')
    setSub(true)
    try {
      // 1. Upload CSV + metadata to create a draft
      const fd = new FormData()
      fd.append('label', label.trim())
      fd.append('token', selectedToken)
      if (rawFile) fd.append('csvFile', rawFile, fileName)

      const createRes  = await api.post(`/orgs/${currentOrgId}/payroll-runs`, fd)
      const createData = await createRes.json()
      if (!createRes.ok) throw new Error(createData.error ?? 'Failed to create payroll run')

      // 2. Submit for approval
      const submitRes  = await api.post(`/orgs/${currentOrgId}/payroll-runs/${createData.id}/submit`)
      const submitData = await submitRes.json()
      if (!submitRes.ok) throw new Error(submitData.error ?? 'Failed to submit for approval')

      // 3. Go to run detail
      navigate(`/payroll/${createData.id}`)
    } catch (err) {
      setSubErr(getFriendlyErrorMessage(err, 'Could not submit payroll run. Please try again.'))
      setSub(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Payroll Run</h1>
          <p className="page-sub">Upload your CSV, set a label, then submit for approval</p>
        </div>
        <button className="btn-ghost" onClick={() => navigate('/dashboard')}>← Back</button>
      </div>

      <div className="payroll-layout">
        <div className="payroll-main">
          {/* Step 1: Upload */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Step 1 — Upload File</h2>
              <div className="card-header-right">
                <div className="token-toggle">
                  {['USDC', 'USDT'].map((t) => (
                    <button key={t} className={`token-toggle-btn${selectedToken === t ? ' active' : ''}`} onClick={() => setToken(t)}>{t}</button>
                  ))}
                </div>
                <div className="sample-btns">
                  <button className="btn-ghost btn-sm" onClick={downloadSampleCSV}>↓ Sample CSV</button>
                  <button className="btn-ghost btn-sm" onClick={downloadSampleXLSX}>↓ Sample Excel</button>
                </div>
              </div>
            </div>

            <div
              className={`dropzone ${isDragging ? 'dragging' : ''} ${fileName ? 'has-file' : ''}`}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={onFileChange} style={{ display: 'none' }} />
              {fileName ? (
                <div className="dropzone-loaded">
                  <span className="dropzone-file-icon">📄</span>
                  <div><div className="dropzone-filename">{fileName}</div><div className="dropzone-change">Click to replace</div></div>
                </div>
              ) : (
                <div className="dropzone-empty">
                  <span className="dropzone-icon">⬆</span>
                  <div className="dropzone-text">Drop your CSV or Excel file here or click to browse</div>
                  <div className="dropzone-hint">Include wallet address and amount for each recipient.</div>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Review recipients */}
          {rows.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Step 2 — Review Recipients</h2>
                <span className="badge-count">
                  {validRows.length} valid
                  {errors.length > 0 && ` · ${errors.length} error${errors.length !== 1 ? 's' : ''}`}
                  {expiredRows.length > 0 && ` · ${expiredRows.length} excluded`}
                </span>
              </div>

              {errors.length > 0 && (
                <div className="error-banner">
                  <strong>⚠ Some rows need attention</strong>
                  <ul className="error-list">
                    {errors.map((e, i) => <li key={i}>Line {e.line}: {e.message}</li>)}
                  </ul>
                </div>
              )}

              {expiredRows.length > 0 && (
                <div className="info-banner" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  <strong>ℹ {expiredRows.length} recipient{expiredRows.length !== 1 ? 's' : ''} will be skipped</strong>
                  {' '}— contract termination date has already passed. They will not be included in this payroll run.
                </div>
              )}

              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr><th>#</th><th>Name</th><th>Wallet Address</th><th>Amount ({selectedToken})</th><th>Termination Date</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={row.hasError ? 'row-error' : row.isExpired ? 'row-expired' : ''}>
                        <td className="td-num">{i + 1}</td>
                        <td style={row.isExpired ? { opacity: 0.45 } : {}}>{row.name}</td>
                        <td className="td-addr" style={row.isExpired ? { opacity: 0.45 } : {}}><span className="addr-text">{row.address || '—'}</span></td>
                        <td className="td-amount" style={row.isExpired ? { opacity: 0.45 } : {}}>
                          {row.amount > 0 ? `$${row.amount.toLocaleString()}` : <span className="text-error">{row.amountRaw || '—'}</span>}
                        </td>
                        <td style={{ fontSize: '0.82rem', opacity: row.terminationDate ? 1 : 0.3 }}>
                          {row.terminationDate || '—'}
                        </td>
                        <td>
                          {row.isExpired  ? <span style={{ color: 'var(--warning, #f59e0b)', fontSize: '0.82rem', fontWeight: 600 }}>⏸ Excluded</span>  :
                           row.hasError   ? <span className="status-error">✕ Needs attention</span> :
                                            <span className="status-ok">✓ Ready</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="total-row">
                <span className="total-label">Total Payout</span>
                <span className="total-amount">${totalAmount.toLocaleString()} {selectedToken}</span>
              </div>
            </div>
          )}

          {/* Step 3: Label */}
          {rows.length > 0 && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Step 3 — Label This Payroll</h2></div>
              <div className="label-input-group">
                <input
                  type="text"
                  className="label-input"
                  placeholder='e.g. "May 2026 Payroll"'
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={100}
                />
                <div className="label-hint">This label identifies the run throughout the approval workflow.</div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="payroll-sidebar">
          <div className="card sidebar-card">
            <h3 className="sidebar-title">Payroll Summary</h3>
            <div className="summary-rows">
              <div className="summary-row"><span>Recipients</span><span>{validRows.length}</span></div>
              {expiredRows.length > 0 && (
                <div className="summary-row" style={{ color: 'var(--warning, #f59e0b)', fontSize: '0.82rem' }}>
                  <span>Excluded (expired)</span><span>{expiredRows.length}</span>
                </div>
              )}
              <div className="summary-row"><span>Total Amount</span><span className="summary-amount">${totalAmount.toLocaleString()} {selectedToken}</span></div>
              <div className="summary-row"><span>Label</span><span className="summary-label-val">{label || '—'}</span></div>
            </div>

            {submitError && <div className="error-box">⚠ {submitError}</div>}

            <button className="btn-primary btn-full" onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? <><span className="spinner-sm" /> Submitting…</> : `Submit for Approval →`}
            </button>

            <div className="sidebar-checks">
              <div className={`check-item ${validRows.length > 0 ? 'check-ok' : ''}`}>
                {validRows.length > 0 ? '✓' : '○'} File uploaded
              </div>
              <div className={`check-item ${errors.length === 0 && rows.length > 0 ? 'check-ok' : ''}`}>
                {errors.length === 0 && rows.length > 0 ? '✓' : '○'} All rows are ready
              </div>
              <div className={`check-item ${label.trim() ? 'check-ok' : ''}`}>
                {label.trim() ? '✓' : '○'} Payroll label set
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

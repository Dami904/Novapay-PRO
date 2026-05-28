import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { useOrg } from '../../context/OrgContext'

export default function EmployeeDirectory() {
  const { currentOrgId } = useOrg()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ fullName: '', email: '', walletAddress: '', department: '', terminationDate: '' })
  const [formError, setFormError] = useState('')
  const csvRef = useRef()

  const { data, isLoading } = useQuery({
    queryKey: ['employees', currentOrgId, search],
    queryFn:  async () => {
      const q   = search ? `?search=${encodeURIComponent(search)}` : ''
      const res = await api.get(`/orgs/${currentOrgId}/employees${q}`)
      return res.ok ? res.json() : { employees: [], total: 0 }
    },
    enabled: !!currentOrgId,
  })

  const addEmployee = useMutation({
    mutationFn: (body) => api.post(`/orgs/${currentOrgId}/employees`, body),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['employees'] }); setShowAdd(false); setForm({ fullName: '', email: '', walletAddress: '', department: '', terminationDate: '' }) },
    onError:    async (_, __, ___, res) => setFormError('Failed to add employee.'),
  })

  const deactivate = useMutation({
    mutationFn: (id) => api.patch(`/orgs/${currentOrgId}/employees/${id}`, { isActive: false }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['employees'] }),
  })

  const bulkImport = useMutation({
    mutationFn: async (file) => {
      const fd = new FormData()
      fd.append('csvFile', file)
      const res = await api.post(`/orgs/${currentOrgId}/employees/import`, fd)
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Import failed') }
      return res.json()
    },
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['employees'] }); alert(`Imported ${d.created} new, updated ${d.updated}.`) },
    onError:   (err) => alert(err.message),
  })

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }))

  async function handleAdd(e) {
    e.preventDefault()
    setFormError('')
    const res = await addEmployee.mutateAsync(form).catch((err) => { setFormError(err.message); return null })
    if (!res) return
  }

  const employees = data?.employees ?? []

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Employee Directory</h1>
          <p className="page-sub">{data?.total ?? 0} employees</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn-ghost" onClick={() => csvRef.current?.click()}>
            ↑ Import
          </button>
          <input ref={csvRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && bulkImport.mutate(e.target.files[0])} />
          <button className="btn-primary" onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? '✕ Cancel' : '+ Add Employee'}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <form className="card" style={{ marginBottom: '1.5rem' }} onSubmit={handleAdd}>
          <h2 className="card-title" style={{ marginBottom: '1rem' }}>New Employee</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Full name</label>
              <input className="form-input" placeholder="Alice Chen" value={form.fullName} onChange={set('fullName')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Email (optional)</label>
              <input className="form-input" type="email" placeholder="alice@company.com" value={form.email} onChange={set('email')} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Wallet address</label>
              <input className="form-input" placeholder="0x…" value={form.walletAddress} onChange={set('walletAddress')} required />
            </div>
            <div className="form-group">
              <label className="form-label">Department (optional)</label>
              <input className="form-input" placeholder="Engineering" value={form.department} onChange={set('department')} />
            </div>
            <div className="form-group">
              <label className="form-label">Contract end date (optional)</label>
              <input className="form-input" type="date" value={form.terminationDate} onChange={set('terminationDate')} />
            </div>
          </div>
          {formError && <p className="auth-error">⚠ {formError}</p>}
          <button className="btn-primary" type="submit" disabled={addEmployee.isPending}>
            {addEmployee.isPending ? 'Adding…' : 'Add Employee'}
          </button>
        </form>
      )}

      {/* Search */}
      <div className="filter-bar" style={{ marginBottom: '1rem' }}>
        <input className="filter-input" placeholder="Search by name, email, wallet…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading && <div className="empty-state"><span className="spinner-sm" /> Loading…</div>}

      {!isLoading && employees.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">👥</div>
          <p className="empty-title">No employees yet</p>
          <p className="empty-desc">Add employees manually or import a CSV file.</p>
        </div>
      )}

      {employees.length > 0 && (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Wallet</th>
                  <th>Department</th>
                  <th>Type</th>
                  <th>Contract End</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} style={{ opacity: emp.isActive ? 1 : 0.45 }}>
                    <td>{emp.fullName}</td>
                    <td>{emp.email ?? '—'}</td>
                    <td className="td-addr"><span className="addr-text">{emp.walletAddress ? `${emp.walletAddress.slice(0, 8)}…` : '—'}</span></td>
                    <td>{emp.department ?? '—'}</td>
                    <td>{emp.employmentType}</td>
                    <td style={{ opacity: 0.7, fontSize: '0.85rem' }}>
                      {emp.terminationDate ? new Date(emp.terminationDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td>
                      <span className={`status-badge ${emp.isActive ? 'badge-complete' : 'badge-draft'}`}>
                        {emp.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {emp.isActive && (
                        <button className="btn-ghost btn-sm" onClick={() => deactivate.mutate(emp.id)}>
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

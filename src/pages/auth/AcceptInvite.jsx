import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../services/api'
import { setToken } from '../../services/api'
import { getFriendlyErrorMessage } from '../../utils/userMessages'

export default function AcceptInvite() {
  const [searchParams]        = useSearchParams()
  const navigate              = useNavigate()
  const token                 = searchParams.get('token') ?? ''
  const [invite, setInvite]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [form, setForm]       = useState({ password: '', fullName: '' })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword]       = useState(false)
  const [showConfirm, setShowConfirm]         = useState(false)
  const [submitting, setSub]  = useState(false)

  useEffect(() => {
    if (!token) { setError('No invitation token found in the URL.'); setLoading(false); return }
    api.get(`/orgs/invitations/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error)
        else setInvite(data)
      })
      .catch(() => setError('Could not load invitation. The link may be invalid.'))
      .finally(() => setLoading(false))
  }, [token])

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password.length < 8)          { setError('Password must be at least 8 characters.'); return }
    if (form.password !== confirmPassword) { setError('Passwords do not match.'); return }
    setError('')
    setSub(true)
    try {
      const res  = await api.post(`/orgs/invitations/${token}/accept`, form)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to accept invitation')
      setToken(data.accessToken)
      navigate('/dashboard')
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Could not accept invitation. Please try again.'))
    } finally {
      setSub(false)
    }
  }

  if (loading) return (
    <div className="auth-page"><div className="auth-card"><p className="auth-sub">Loading invitation…</p></div></div>
  )

  if (error && !invite) return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-logo"><span className="hero-logo-icon">✦</span><span className="hero-logo-text">NovaPay</span></Link>
        <h1 className="auth-title">Invitation Invalid</h1>
        <p className="auth-error">⚠ {error}</p>
        <p className="auth-footer"><Link to="/login" className="auth-link">Go to login</Link></p>
      </div>
    </div>
  )

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-logo"><span className="hero-logo-icon">✦</span><span className="hero-logo-text">NovaPay</span></Link>
        <h1 className="auth-title">You&apos;re invited!</h1>
        <p className="auth-sub">
          Join <strong>{invite?.orgName}</strong> as <strong>{invite?.role}</strong>
        </p>
        <p className="auth-sub" style={{ opacity: 0.6 }}>{invite?.email}</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Your name</label>
            <input className="form-input" type="text" placeholder="Alice Chen" value={form.fullName} onChange={set('fullName')} autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">Set a password</label>
            <div className="pw-wrap">
              <input
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={set('password')}
                required
                minLength={8}
              />
              <button type="button" className="pw-eye" onClick={() => setShowPassword((v) => !v)} tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Confirm password</label>
            <div className="pw-wrap">
              <input
                className="form-input"
                type={showConfirm ? 'text' : 'password'}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button type="button" className="pw-eye" onClick={() => setShowConfirm((v) => !v)} tabIndex={-1} aria-label={showConfirm ? 'Hide password' : 'Show password'}>
                {showConfirm ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && <p className="auth-error">⚠ {error}</p>}
          <button className="btn-primary btn-full" type="submit" disabled={submitting}>
            {submitting ? <><span className="spinner-sm" /> Joining…</> : 'Accept & Join →'}
          </button>
        </form>
      </div>
    </div>
  )
}

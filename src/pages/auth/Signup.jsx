import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getFriendlyErrorMessage } from '../../utils/userMessages'

export default function Signup() {
  const { signup } = useAuth()
  const navigate   = useNavigate()

  const [form, setForm]                       = useState({ fullName: '', email: '', password: '', orgName: '' })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword]       = useState(false)
  const [showConfirm, setShowConfirm]         = useState(false)
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState('')

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    if (form.password.length < 8)          { setError('Password must be at least 8 characters.'); return }
    if (form.password !== confirmPassword) { setError('Passwords do not match.'); return }
    setError('')
    setLoading(true)
    try {
      await signup(form)
      navigate('/dashboard')
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Could not create account. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-logo">
          <span className="hero-logo-icon">✦</span>
          <span className="hero-logo-text">NovaPay</span>
        </Link>

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Set up your organization in under a minute</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Your full name</label>
            <input className="form-input" type="text" placeholder="Alice Chen" value={form.fullName} onChange={set('fullName')} required autoFocus />
          </div>

          <div className="form-group">
            <label className="form-label">Work email</label>
            <input className="form-input" type="email" placeholder="you@company.com" value={form.email} onChange={set('email')} required />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
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

          <div className="form-group">
            <label className="form-label">Organization name</label>
            <input className="form-input" type="text" placeholder="Acme Corp" value={form.orgName} onChange={set('orgName')} required />
          </div>

          {error && <p className="auth-error">⚠ {error}</p>}

          <button className="btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? <><span className="spinner-sm" /> Creating account…</> : 'Create Account →'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">Sign in</Link>
        </p>
      </div>
    </div>
  )
}

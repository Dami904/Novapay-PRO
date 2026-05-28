import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api, setToken, clearToken } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [orgs, setOrgs]       = useState([])
  const [isLoaded, setLoaded] = useState(false)  // true once mount refresh attempt finishes

  // ── Restore session on mount ───────────────────────────────────────────────
  useEffect(() => {
    async function restoreSession() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        })
        if (res.ok) {
          const data = await res.json()
          setToken(data.accessToken)
          if (data.user) setUser(data.user)
          if (data.orgs) setOrgs(data.orgs)
        }
      } catch {
        // network error — stay logged out
      } finally {
        setLoaded(true)
      }
    }
    restoreSession()
  }, [])

  // ── login ──────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res  = await api.post('/auth/login', { email, password })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Login failed')
    setToken(data.accessToken)
    setUser(data.user)
    setOrgs(data.orgs ?? [])
    return data
  }, [])

  // ── logout ─────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try { await api.post('/auth/logout') } catch { /* ignore */ }
    clearToken()
    setUser(null)
    setOrgs([])
    window.location.href = '/login'
  }, [])

  // ── signup ─────────────────────────────────────────────────────────────────
  const signup = useCallback(async ({ email, password, fullName, orgName }) => {
    const res  = await api.post('/auth/signup', { email, password, fullName, orgName })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Signup failed')
    setToken(data.accessToken)
    setUser(data.user)
    setOrgs([{ org_id: data.org.id, role: 'owner', slug: data.org.slug }])
    return data
  }, [])

  return (
    <AuthContext.Provider value={{ user, orgs, isLoaded, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

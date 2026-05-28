// ── NovaPay API client ────────────────────────────────────────────────────────
// Injects JWT, auto-refreshes on 401, supports JSON and multipart requests.

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

let _accessToken = null

export const setToken   = (t) => { _accessToken = t }
export const clearToken = ()  => { _accessToken = null }
export const getToken   = ()  => _accessToken

async function req(path, options = {}) {
  const isMultipart = options.body instanceof FormData
  const hasJsonBody = options.body !== undefined && options.body !== null && !isMultipart
  const headers = {
    ...(hasJsonBody ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  }
  if (_accessToken) headers['Authorization'] = `Bearer ${_accessToken}`

  let res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' })

  if (res.status === 401) {
    const refreshRes = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (refreshRes.ok) {
      const { accessToken } = await refreshRes.json()
      setToken(accessToken)
      headers['Authorization'] = `Bearer ${accessToken}`
      res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' })
    } else {
      clearToken()
      window.location.href = '/login'
      return
    }
  }

  return res
}

export const api = {
  get:    (path)                  => req(`/api/v1${path}`),
  post:   (path, body)            => req(`/api/v1${path}`, {
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
  }),
  patch:  (path, body, headers)   => req(`/api/v1${path}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers,
  }),
  delete: (path, headers)         => req(`/api/v1${path}`, { method: 'DELETE', headers }),
}

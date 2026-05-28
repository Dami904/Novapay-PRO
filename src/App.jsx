import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth }   from './context/AuthContext'
import { OrgProvider }             from './context/OrgContext'
import { Web3Provider }            from './context/Web3Context'
import Navbar                      from './components/Navbar'

// Pages — public
import LandingPage   from './pages/LandingPage'
import Login         from './pages/auth/Login'
import Signup        from './pages/auth/Signup'
import AcceptInvite  from './pages/auth/AcceptInvite'

// Pages — protected
import Dashboard         from './pages/Dashboard'
import NewPayrollRun     from './pages/NewPayrollRun'
import PayrollHistory    from './pages/PayrollHistory'
import ApprovalQueue     from './pages/app/ApprovalQueue'
import PayrollRunDetail  from './pages/app/PayrollRunDetail'
import EmployeeDirectory from './pages/app/EmployeeDirectory'
import MembersPage       from './pages/app/MembersPage'
import OrgSettings       from './pages/app/OrgSettings'
import AdminDashboard    from './pages/admin/AdminDashboard'
import AdminOrgList      from './pages/admin/AdminOrgList'
import AdminUserList     from './pages/admin/AdminUserList'
import ProofPage         from './pages/ProofPage'

import './App.css'

// ── Theme context ──────────────────────────────────────────────────────────────
const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} })
export function useTheme() { return useContext(ThemeContext) }

// ── TanStack Query client ──────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

// ── Auth guard ─────────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const { user, isLoaded } = useAuth()
  if (!isLoaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><span className="spinner-sm" /></div>
  return user ? children : <Navigate to="/login" replace />
}

// ── Super-admin guard ──────────────────────────────────────────────────────────
function RequireSuperAdmin({ children }) {
  const { user, isLoaded } = useAuth()
  if (!isLoaded) return <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}><span className="spinner-sm" /></div>
  if (!user) return <Navigate to="/login" replace />
  return user.isSuperAdmin ? children : <Navigate to="/dashboard" replace />
}

// ── App routes ─────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user, isLoaded }     = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <>
      <Navbar />
      {/* Floating theme toggle — only on public pages where the navbar is hidden */}
      {!user && (
        <button
          className="theme-toggle theme-toggle-float"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? '☀' : '☾'}
        </button>
      )}
      <main className={user ? 'main-authenticated' : 'main-public'}>
        <Routes>
          {/* Public */}
          <Route path="/"               element={<LandingPage />} />
          <Route path="/login"          element={isLoaded && user ? <Navigate to="/dashboard" replace /> : <Login />} />
          <Route path="/signup"         element={isLoaded && user ? <Navigate to="/dashboard" replace /> : <Signup />} />
          <Route path="/invite"         element={<AcceptInvite />} />
          <Route path="/proof/:txHash"  element={<ProofPage />} />

          {/* Protected */}
          <Route path="/dashboard"      element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/payroll/new"    element={<RequireAuth><NewPayrollRun /></RequireAuth>} />
          <Route path="/payroll/:id"    element={<RequireAuth><PayrollRunDetail /></RequireAuth>} />
          <Route path="/history"        element={<RequireAuth><PayrollHistory /></RequireAuth>} />
          <Route path="/approval-queue" element={<RequireAuth><ApprovalQueue /></RequireAuth>} />
          <Route path="/employees"      element={<RequireAuth><EmployeeDirectory /></RequireAuth>} />
          <Route path="/members"        element={<RequireAuth><MembersPage /></RequireAuth>} />
          <Route path="/settings"       element={<RequireAuth><OrgSettings /></RequireAuth>} />

          {/* Super Admin */}
          <Route path="/admin"       element={<RequireSuperAdmin><AdminDashboard /></RequireSuperAdmin>} />
          <Route path="/admin/orgs"  element={<RequireSuperAdmin><AdminOrgList /></RequireSuperAdmin>} />
          <Route path="/admin/users" element={<RequireSuperAdmin><AdminUserList /></RequireSuperAdmin>} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to={user ? '/dashboard' : '/'} replace />} />
        </Routes>
      </main>
    </>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('novapay_theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('novapay_theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OrgProvider>
            <Web3Provider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </Web3Provider>
          </OrgProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeContext.Provider>
  )
}

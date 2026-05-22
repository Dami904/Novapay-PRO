import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Web3Provider, useWeb3 } from './context/Web3Context'
import Navbar from './components/Navbar'
import ConnectWallet from './pages/ConnectWallet'
import Dashboard from './pages/Dashboard'
import NewPayrollRun from './pages/NewPayrollRun'
import TransactionConfirmation from './pages/TransactionConfirmation'
import PayrollHistory from './pages/PayrollHistory'
import './App.css'

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} })
export function useTheme() { return useContext(ThemeContext) }

function RequireWallet({ children }) {
  const { account } = useWeb3()
  return account ? children : <Navigate to="/" replace />
}

function AppRoutes({ theme, toggleTheme }) {
  const { account } = useWeb3()

  return (
    <>
      <Navbar theme={theme} toggleTheme={toggleTheme} />
      <main className={account ? 'main-authenticated' : 'main-public'}>
        <Routes>
          <Route path="/" element={account ? <Navigate to="/dashboard" replace /> : <ConnectWallet />} />
          <Route path="/dashboard" element={<RequireWallet><Dashboard /></RequireWallet>} />
          <Route path="/payroll/new" element={<RequireWallet><NewPayrollRun /></RequireWallet>} />
          <Route path="/payroll/confirm" element={<RequireWallet><TransactionConfirmation /></RequireWallet>} />
          <Route path="/history" element={<RequireWallet><PayrollHistory /></RequireWallet>} />
          <Route path="*" element={<Navigate to={account ? '/dashboard' : '/'} replace />} />
        </Routes>
      </main>
    </>
  )
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('novapay_theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('novapay_theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <Web3Provider>
        <BrowserRouter>
          <AppRoutes theme={theme} toggleTheme={toggleTheme} />
        </BrowserRouter>
      </Web3Provider>
    </ThemeContext.Provider>
  )
}

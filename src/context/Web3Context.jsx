import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'
import {
  NOVAPAY_CONTRACT_ADDRESS,
  USDC_CONTRACT_ADDRESS,
  NOVAPAY_ABI,
  ERC20_ABI,
  MORPH_TESTNET,
} from '../utils/contractABI'

const Web3Context = createContext(null)

const STORAGE_KEY = 'novapay_history'
const DEMO_MODE = NOVAPAY_CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000'

const MOCK_HISTORY = [
  {
    id: 'mock-1',
    label: 'Payroll - April 2026',
    timestamp: new Date('2026-04-30').getTime(),
    recipientCount: 5,
    totalAmount: 12500,
    txHash: '0xabc123def456789000000000000000000000000000000000000000000000001',
    explorerUrl: 'https://explorer-hoodi.morphl2.io/tx/0xabc123',
    recipients: [
      { address: '0x1234567890123456789012345678901234567890', name: 'Alice Chen', amount: 3000 },
      { address: '0x2345678901234567890123456789012345678901', name: 'Bob Smith', amount: 2500 },
      { address: '0x3456789012345678901234567890123456789012', name: 'Carol Diaz', amount: 2500 },
      { address: '0x4567890123456789012345678901234567890123', name: 'David Kim', amount: 2500 },
      { address: '0x5678901234567890123456789012345678901234', name: 'Eve Okafor', amount: 2000 },
    ],
  },
  {
    id: 'mock-2',
    label: 'Contractor Payments - April 2026',
    timestamp: new Date('2026-04-15').getTime(),
    recipientCount: 2,
    totalAmount: 4000,
    txHash: '0xdef456abc789000000000000000000000000000000000000000000000000002',
    explorerUrl: 'https://explorer-hoodi.morphl2.io/tx/0xdef456',
    recipients: [
      { address: '0x6789012345678901234567890123456789012345', name: 'Frank Torres', amount: 2000 },
      { address: '0x7890123456789012345678901234567890123456', name: 'Grace Liu', amount: 2000 },
    ],
  },
]

export function Web3Provider({ children }) {
  const [account, setAccount] = useState(null)
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false)
  const [usdcBalance, setUsdcBalance] = useState('0')
  const [history, setHistory] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const parsed = stored ? JSON.parse(stored) : []
      return DEMO_MODE ? [...parsed, ...MOCK_HISTORY] : parsed
    } catch {
      return DEMO_MODE ? MOCK_HISTORY : []
    }
  })
  const [networkError, setNetworkError] = useState(null)

  const checkNetwork = useCallback(async (prov) => {
    const network = await prov.getNetwork()
    const correct = network.chainId === BigInt(2910)
    setIsCorrectNetwork(correct)
    if (!correct) setNetworkError('Please switch to Morph Hoodi')
    else setNetworkError(null)
    return correct
  }, [])

  const fetchUSDCBalance = useCallback(async (addr, prov) => {
    if (DEMO_MODE) { setUsdcBalance('50000'); return }
    try {
      const usdc = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, prov)
      const bal = await usdc.balanceOf(addr)
      setUsdcBalance(ethers.formatUnits(bal, 6))
    } catch {
      setUsdcBalance('0')
    }
  }, [])

  const connect = useCallback(async () => {
    if (!window.ethereum) throw new Error('MetaMask not installed. Please install MetaMask to use NovaPay.')

    const prov = new ethers.BrowserProvider(window.ethereum)
    const accounts = await prov.send('eth_requestAccounts', [])
    const sign = await prov.getSigner()

    setProvider(prov)
    setSigner(sign)
    setAccount(accounts[0])

    const correct = await checkNetwork(prov)
    if (correct) await fetchUSDCBalance(accounts[0], prov)
  }, [checkNetwork, fetchUSDCBalance])

  const switchToMorph = useCallback(async () => {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [MORPH_TESTNET],
    })
  }, [])

  const sendPayroll = useCallback(
    async ({ recipients, amounts, label }) => {
      if (DEMO_MODE) {
        await new Promise((r) => setTimeout(r, 2500))
        const mockTx = `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`
        const totalAmount = amounts.reduce((s, a) => s + a, 0)
        const batch = {
          id: Date.now().toString(),
          label,
          timestamp: Date.now(),
          recipientCount: recipients.length,
          totalAmount,
          txHash: mockTx,
          explorerUrl: `https://explorer-hoodi.morphl2.io/tx/${mockTx}`,
          recipients: recipients.map((addr, i) => ({ address: addr, name: `Recipient ${i + 1}`, amount: amounts[i] })),
        }
        setHistory((prev) => {
          const updated = [batch, ...prev]
          const nonMock = updated.filter((h) => !h.id.startsWith('mock-'))
          localStorage.setItem(STORAGE_KEY, JSON.stringify(nonMock))
          return updated
        })
        return { txHash: mockTx, explorerUrl: batch.explorerUrl }
      }

      const contract = new ethers.Contract(NOVAPAY_CONTRACT_ADDRESS, NOVAPAY_ABI, signer)
      const usdc = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, signer)

      const totalWei = amounts.reduce((s, a) => s + ethers.parseUnits(a.toString(), 6), BigInt(0))
      const approveTx = await usdc.approve(NOVAPAY_CONTRACT_ADDRESS, totalWei)
      await approveTx.wait()

      const amountsWei = amounts.map((a) => ethers.parseUnits(a.toString(), 6))
      const tx = await contract.batchPayout(recipients, amountsWei, label)
      const receipt = await tx.wait()

      const totalAmount = amounts.reduce((s, a) => s + a, 0)
      const batch = {
        id: receipt.hash,
        label,
        timestamp: Date.now(),
        recipientCount: recipients.length,
        totalAmount,
        txHash: receipt.hash,
        explorerUrl: `${MORPH_TESTNET.blockExplorerUrls[0]}/tx/${receipt.hash}`,
        recipients: recipients.map((addr, i) => ({ address: addr, amount: amounts[i] })),
      }

      setHistory((prev) => {
        const updated = [batch, ...prev]
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        return updated
      })

      await fetchUSDCBalance(account, provider)
      return { txHash: receipt.hash, explorerUrl: batch.explorerUrl }
    },
    [signer, account, provider, fetchUSDCBalance]
  )

  const disconnect = useCallback(() => {
    setAccount(null)
    setProvider(null)
    setSigner(null)
    setIsCorrectNetwork(false)
    setUsdcBalance('0')
  }, [])

  useEffect(() => {
    if (!window.ethereum) return
    const onAccountsChanged = (accounts) => {
      if (accounts.length === 0) disconnect()
      else setAccount(accounts[0])
    }
    const onChainChanged = () => window.location.reload()
    window.ethereum.on('accountsChanged', onAccountsChanged)
    window.ethereum.on('chainChanged', onChainChanged)
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccountsChanged)
      window.ethereum.removeListener('chainChanged', onChainChanged)
    }
  }, [disconnect])

  const stats = {
    totalPaid: history.reduce((s, b) => s + (b.totalAmount || 0), 0),
    totalRuns: history.length,
    lastRun: history[0] || null,
  }

  return (
    <Web3Context.Provider
      value={{ account, provider, signer, isCorrectNetwork, usdcBalance, history, networkError, stats, demoMode: DEMO_MODE, connect, disconnect, switchToMorph, sendPayroll }}
    >
      {children}
    </Web3Context.Provider>
  )
}

export function useWeb3() {
  const ctx = useContext(Web3Context)
  if (!ctx) throw new Error('useWeb3 must be used inside Web3Provider')
  return ctx
}

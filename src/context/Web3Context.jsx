// ── Wallet-only context ───────────────────────────────────────────────────────
// Handles MetaMask connection, network detection, and token balance.
// Identity (auth) and org data are in AuthContext / OrgContext.
import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { ethers } from 'ethers'
import { TOKENS, ERC20_ABI, MORPH_TESTNET } from '../utils/contractABI'

const Web3Context = createContext(null)

export function Web3Provider({ children }) {
  const [account, setAccount]               = useState(null)
  const [provider, setProvider]             = useState(null)
  const [signer, setSigner]                 = useState(null)
  const [isCorrectNetwork, setCorrectNet]   = useState(false)
  const [networkError, setNetworkError]     = useState(null)
  const [selectedToken, setSelectedToken]   = useState('USDC')
  const [tokenBalance, setTokenBalance]     = useState('0')

  const checkNetwork = useCallback(async (prov) => {
    const network = await prov.getNetwork()
    const correct = network.chainId === BigInt(2910)
    setCorrectNet(correct)
    setNetworkError(correct ? null : 'Please switch to the Morph Hoodi network.')
    return correct
  }, [])

  const fetchTokenBalance = useCallback(async (addr, prov, tokenKey) => {
    try {
      const cfg   = TOKENS[tokenKey] ?? TOKENS.USDC
      const token = new ethers.Contract(cfg.address, ERC20_ABI, prov)
      const bal   = await token.balanceOf(addr)
      setTokenBalance(ethers.formatUnits(bal, cfg.decimals))
    } catch {
      setTokenBalance('0')
    }
  }, [])

  const connect = useCallback(async () => {
    if (!window.ethereum) throw new Error('Please install a wallet app to continue.')
    const prov     = new ethers.BrowserProvider(window.ethereum)
    const accounts = await prov.send('eth_requestAccounts', [])
    const sign     = await prov.getSigner()
    setProvider(prov)
    setSigner(sign)
    setAccount(accounts[0])
    const correct = await checkNetwork(prov)
    if (correct) await fetchTokenBalance(accounts[0], prov, selectedToken)
    return correct
  }, [checkNetwork, fetchTokenBalance, selectedToken])

  // Auto-initialize if MetaMask already has a connected account (no prompt)
  useEffect(() => {
    if (!window.ethereum) return
    window.ethereum.request({ method: 'eth_accounts' }).then(async (accounts) => {
      if (accounts.length === 0) return
      const prov = new ethers.BrowserProvider(window.ethereum)
      const sign = await prov.getSigner()
      setProvider(prov); setSigner(sign); setAccount(accounts[0])
      const correct = await checkNetwork(prov)
      if (correct) fetchTokenBalance(accounts[0], prov, 'USDC')
    }).catch(() => {})
  }, [checkNetwork, fetchTokenBalance])

  const disconnect = useCallback(() => {
    setAccount(null); setProvider(null); setSigner(null)
    setCorrectNet(false); setTokenBalance('0')
  }, [])

  const switchAccount = useCallback(async () => {
    if (!window.ethereum) throw new Error('No wallet detected')
    try {
      // Forces MetaMask to show the account picker even if already connected
      await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] })
    } catch (err) {
      // 4001 = user rejected the picker — bail silently
      if (err.code === 4001) return
      // Any other error (e.g. unsupported method) — fall through to connect()
    }
    await connect()
  }, [connect])

  const switchToMorph = useCallback(async () => {
    await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [MORPH_TESTNET] })
  }, [])

  // Re-fetch balance on token/network change
  useEffect(() => {
    if (account && provider && isCorrectNetwork) {
      fetchTokenBalance(account, provider, selectedToken)
    }
  }, [selectedToken, account, isCorrectNetwork]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for MetaMask account / chain changes
  useEffect(() => {
    if (!window.ethereum) return
    const onAccounts = (accounts) => accounts.length ? setAccount(accounts[0]) : disconnect()
    const onChain    = () => window.location.reload()
    window.ethereum.on('accountsChanged', onAccounts)
    window.ethereum.on('chainChanged', onChain)
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccounts)
      window.ethereum.removeListener('chainChanged', onChain)
    }
  }, [disconnect])

  return (
    <Web3Context.Provider value={{
      account, provider, signer, isCorrectNetwork, networkError,
      selectedToken, setSelectedToken, tokenBalance,
      connect, disconnect, switchAccount, switchToMorph,
    }}>
      {children}
    </Web3Context.Provider>
  )
}

export function useWeb3() {
  const ctx = useContext(Web3Context)
  if (!ctx) throw new Error('useWeb3 must be used inside Web3Provider')
  return ctx
}

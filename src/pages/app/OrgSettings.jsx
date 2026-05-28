import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../services/api'
import { useOrg } from '../../context/OrgContext'
import { useWeb3 } from '../../context/Web3Context'

export default function OrgSettings() {
  const { currentOrgId, currentRole } = useOrg()
  const canManageSettings = ['owner', 'admin'].includes(currentRole)
  const { signer, account, connect } = useWeb3()
  const qc = useQueryClient()

  const { data: org } = useQuery({
    queryKey: ['org', currentOrgId],
    queryFn:  async () => {
      const res = await api.get(`/orgs/${currentOrgId}`)
      return res.ok ? res.json() : null
    },
    enabled: !!currentOrgId,
  })

  const [name, setName]       = useState('')
  const [webhook, setWebhook] = useState('')
  const [orgMsg, setOrgMsg]   = useState('')
  const [walletMsg, setWalletMsg] = useState('')
  const [walletErr, setWalletErr] = useState('')

  useEffect(() => {
    if (org) { setName(org.name); setWebhook(org.discordWebhookUrl ?? '') }
  }, [org])

  const updateOrg = useMutation({
    mutationFn: () => api.patch(`/orgs/${currentOrgId}`, { name: name.trim(), discordWebhookUrl: webhook.trim() || null }),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['org'] }); setOrgMsg('Settings saved!') },
    onError:    () => setOrgMsg('Failed to save settings.'),
  })

  async function linkWallet() {
    setWalletErr('')
    setWalletMsg('')
    try {
      if (!account) await connect()
      const chalRes  = await api.post('/auth/wallet/challenge', {})
      const chalData = await chalRes.json()
      if (!chalRes.ok) throw new Error(chalData.error ?? 'Could not get challenge')
      const signature = await signer.signMessage(chalData.nonce)
      const verRes    = await api.post('/auth/wallet/verify', { signature, orgId: currentOrgId })
      const verData   = await verRes.json()
      if (!verRes.ok) throw new Error(verData.error ?? 'Verification failed')
      setWalletMsg(`Wallet linked: ${verData.walletAddress}`)
      qc.invalidateQueries({ queryKey: ['org'] })
    } catch (err) {
      setWalletErr(err.message ?? 'Failed to link wallet.')
    }
  }

  if (!canManageSettings) {
    return (
      <div className="page">
        <div className="empty-state">
          <p className="empty-title">Access Restricted</p>
          <p className="empty-sub">Organisation settings can only be changed by owners and admins.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Org Settings</h1>
          <p className="page-sub">Manage your organization profile and integrations</p>
        </div>
      </div>

      {/* General settings */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>General</h2>
        <div className="form-group">
          <label className="form-label">Organization name</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: '360px' }} />
        </div>
        <div className="form-group">
          <label className="form-label">Discord Webhook URL <span style={{ opacity: 0.5, fontSize: '0.8rem' }}>(optional)</span></label>
          <input
            className="form-input"
            type="url"
            placeholder="https://discord.com/api/webhooks/…"
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            style={{ maxWidth: '480px' }}
          />
          <p style={{ opacity: 0.55, fontSize: '0.8rem', marginTop: '0.4rem' }}>
            NovaPay will post payroll events to this channel.
          </p>
        </div>
        {orgMsg && <p style={{ color: orgMsg.startsWith('Failed') ? '#ef4444' : '#10b981', fontSize: '0.9rem', marginBottom: '0.75rem' }}>{orgMsg}</p>}
        <button className="btn-primary" onClick={() => updateOrg.mutate()} disabled={updateOrg.isPending}>
          {updateOrg.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Wallet */}
      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '0.5rem' }}>Signing Wallet</h2>
        <p style={{ opacity: 0.65, fontSize: '0.9rem', marginBottom: '1rem' }}>
          The wallet used to sign and execute payroll transactions on-chain.
        </p>
        {org?.walletAddress ? (
          <div style={{ marginBottom: '1rem' }}>
            <span style={{ opacity: 0.6, fontSize: '0.85rem' }}>Current wallet: </span>
            <code style={{ fontSize: '0.85rem' }}>{org.walletAddress}</code>
            {org.walletLabel && <span style={{ opacity: 0.5, fontSize: '0.8rem', marginLeft: '0.5rem' }}>({org.walletLabel})</span>}
          </div>
        ) : (
          <p style={{ opacity: 0.55, fontSize: '0.85rem', marginBottom: '1rem' }}>No wallet linked yet.</p>
        )}
        {walletErr && <p className="auth-error" style={{ marginBottom: '0.75rem' }}>⚠ {walletErr}</p>}
        {walletMsg && <p style={{ color: '#10b981', fontSize: '0.9rem', marginBottom: '0.75rem' }}>✓ {walletMsg}</p>}
        <button className="btn-primary" onClick={linkWallet}>
          🦊 {org?.walletAddress ? 'Re-link Wallet' : 'Link Wallet'}
        </button>
      </div>
    </div>
  )
}

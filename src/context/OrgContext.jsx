import { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

const OrgContext = createContext(null)

export function OrgProvider({ children }) {
  const { orgs } = useAuth()
  const [currentOrgId, setCurrentOrgId] = useState(() =>
    localStorage.getItem('novapay_last_org') ?? null
  )

  // Keep currentOrgId valid whenever orgs list changes
  useEffect(() => {
    if (!orgs.length) { setCurrentOrgId(null); return }
    const match = orgs.find((o) => o.org_id === currentOrgId)
    if (!match) {
      const fallback = orgs[0].org_id
      setCurrentOrgId(fallback)
      localStorage.setItem('novapay_last_org', fallback)
    }
  }, [orgs]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentOrgMeta = orgs.find((o) => o.org_id === currentOrgId) ?? null
  const currentRole    = currentOrgMeta?.role ?? null

  function switchOrg(orgId) {
    setCurrentOrgId(orgId)
    localStorage.setItem('novapay_last_org', orgId)
  }

  return (
    <OrgContext.Provider value={{ currentOrgId, currentOrgMeta, currentRole, switchOrg }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be used inside OrgProvider')
  return ctx
}

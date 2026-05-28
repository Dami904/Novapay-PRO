import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { OrgProvider, useOrg } from '../../context/OrgContext';

// ── Stub AuthContext so OrgProvider can read orgs ─────────────────────────────

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORG_OWNER   = { org_id: 'org-1', role: 'owner',   slug: 'acme' };
const ORG_FINANCE = { org_id: 'org-2', role: 'finance',  slug: 'beta' };

function TestConsumer({ onRender }) {
  const ctx = useOrg();
  onRender(ctx);
  return null;
}

function renderWithOrgs(orgs) {
  useAuth.mockReturnValue({ orgs });
  let captured;
  render(
    <OrgProvider>
      <TestConsumer onRender={(ctx) => { captured = ctx; }} />
    </OrgProvider>,
  );
  return () => captured;
}

// ── currentRole derivation ────────────────────────────────────────────────────

describe('OrgContext — currentRole', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the role of the selected org', () => {
    const getCtx = renderWithOrgs([ORG_OWNER]);
    expect(getCtx().currentRole).toBe('owner');
  });

  it('defaults to the first org when no saved preference', () => {
    const getCtx = renderWithOrgs([ORG_OWNER, ORG_FINANCE]);
    expect(getCtx().currentOrgId).toBe('org-1');
    expect(getCtx().currentRole).toBe('owner');
  });

  it('uses saved org from localStorage if valid', () => {
    localStorage.setItem('novapay_last_org', 'org-2');
    const getCtx = renderWithOrgs([ORG_OWNER, ORG_FINANCE]);
    expect(getCtx().currentOrgId).toBe('org-2');
    expect(getCtx().currentRole).toBe('finance');
  });

  it('falls back to first org when saved orgId is not in orgs list', () => {
    localStorage.setItem('novapay_last_org', 'org-999');
    const getCtx = renderWithOrgs([ORG_OWNER, ORG_FINANCE]);
    expect(getCtx().currentOrgId).toBe('org-1');
  });

  it('returns null role when orgs list is empty', () => {
    const getCtx = renderWithOrgs([]);
    expect(getCtx().currentRole).toBeNull();
  });
});

// ── switchOrg ─────────────────────────────────────────────────────────────────

describe('OrgContext — switchOrg', () => {
  beforeEach(() => localStorage.clear());

  it('updates currentOrgId when switchOrg is called', () => {
    useAuth.mockReturnValue({ orgs: [ORG_OWNER, ORG_FINANCE] });
    let captured;
    render(
      <OrgProvider>
        <TestConsumer onRender={(ctx) => { captured = ctx; }} />
      </OrgProvider>,
    );
    act(() => captured.switchOrg('org-2'));
    expect(captured.currentOrgId).toBe('org-2');
  });

  it('persists new org to localStorage', () => {
    useAuth.mockReturnValue({ orgs: [ORG_OWNER, ORG_FINANCE] });
    let captured;
    render(
      <OrgProvider>
        <TestConsumer onRender={(ctx) => { captured = ctx; }} />
      </OrgProvider>,
    );
    act(() => captured.switchOrg('org-2'));
    expect(localStorage.getItem('novapay_last_org')).toBe('org-2');
  });
});

// ── useOrg outside provider ───────────────────────────────────────────────────

describe('OrgContext — useOrg error boundary', () => {
  it('throws when used outside OrgProvider', () => {
    const Wrapper = () => { useOrg(); return null; };
    expect(() => render(<Wrapper />)).toThrow('useOrg must be used inside OrgProvider');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('../../context/OrgContext', () => ({
  useOrg: vi.fn(),
}));
vi.mock('../../context/Web3Context', () => ({
  useWeb3: vi.fn(),
}));
vi.mock('../../App', () => ({
  useTheme: vi.fn(),
}));
vi.mock('../../components/NotificationDropdown', () => ({
  default: () => <div data-testid="notif-bell" />,
}));

import { useAuth }  from '../../context/AuthContext';
import { useOrg }   from '../../context/OrgContext';
import { useWeb3 }  from '../../context/Web3Context';
import { useTheme } from '../../App';
import Navbar from '../../components/Navbar';

function defaultMocks({ role = 'owner', isSuperAdmin = false } = {}) {
  useAuth.mockReturnValue({
    user: { id: 'u1', fullName: 'Test User', email: 'test@example.com', isSuperAdmin },
    logout: vi.fn(),
  });
  useOrg.mockReturnValue({
    currentOrgMeta: { role, org_id: 'org-1' },
    currentRole: role,
  });
  useWeb3.mockReturnValue({
    account: null,
    isCorrectNetwork: true,
    networkError: null,
    switchToMorph: vi.fn(),
  });
  useTheme.mockReturnValue({ theme: 'dark', toggleTheme: vi.fn() });
}

function renderNavbar() {
  return render(
    <MemoryRouter>
      <Navbar />
    </MemoryRouter>,
  );
}

// ── Visibility when logged out ────────────────────────────────────────────────

describe('Navbar — logged out', () => {
  it('renders nothing when user is null', () => {
    useAuth.mockReturnValue({ user: null, logout: vi.fn() });
    useOrg.mockReturnValue({ currentOrgMeta: null, currentRole: null });
    useWeb3.mockReturnValue({ account: null, isCorrectNetwork: true, networkError: null, switchToMorph: vi.fn() });
    useTheme.mockReturnValue({ theme: 'dark', toggleTheme: vi.fn() });

    const { container } = renderNavbar();
    expect(container.firstChild).toBeNull();
  });
});

// ── Links visible to all roles ────────────────────────────────────────────────

describe('Navbar — links for all roles', () => {
  beforeEach(() => defaultMocks({ role: 'viewer' }));

  it('shows Dashboard link', () => {
    renderNavbar();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('shows Payroll link', () => {
    renderNavbar();
    expect(screen.getByRole('link', { name: 'Payroll' })).toBeInTheDocument();
  });

  it('shows Employees link', () => {
    renderNavbar();
    expect(screen.getByRole('link', { name: 'Employees' })).toBeInTheDocument();
  });

  it('shows Members link', () => {
    renderNavbar();
    expect(screen.getByRole('link', { name: 'Members' })).toBeInTheDocument();
  });
});

// ── Role-gated links ──────────────────────────────────────────────────────────

describe('Navbar — Approvals visibility', () => {
  it('shows Approvals for owner', () => {
    defaultMocks({ role: 'owner' });
    renderNavbar();
    expect(screen.getByRole('link', { name: 'Approvals' })).toBeInTheDocument();
  });

  it('shows Approvals for admin', () => {
    defaultMocks({ role: 'admin' });
    renderNavbar();
    expect(screen.getByRole('link', { name: 'Approvals' })).toBeInTheDocument();
  });

  it('shows Approvals for finance', () => {
    defaultMocks({ role: 'finance' });
    renderNavbar();
    expect(screen.getByRole('link', { name: 'Approvals' })).toBeInTheDocument();
  });

  it('hides Approvals for hr', () => {
    defaultMocks({ role: 'hr' });
    renderNavbar();
    expect(screen.queryByRole('link', { name: 'Approvals' })).toBeNull();
  });

  it('hides Approvals for viewer', () => {
    defaultMocks({ role: 'viewer' });
    renderNavbar();
    expect(screen.queryByRole('link', { name: 'Approvals' })).toBeNull();
  });
});

// ── Super-admin link ──────────────────────────────────────────────────────────

describe('Navbar — Admin link', () => {
  it('shows Admin link for superadmin', () => {
    defaultMocks({ isSuperAdmin: true });
    renderNavbar();
    expect(screen.getByRole('link', { name: /admin/i })).toBeInTheDocument();
  });

  it('hides Admin link for regular user', () => {
    defaultMocks({ isSuperAdmin: false });
    renderNavbar();
    // Should have no link containing "Admin" (case-insensitive)
    const links = screen.queryAllByRole('link');
    const adminLinks = links.filter((l) => /⚡\s*admin/i.test(l.textContent ?? ''));
    expect(adminLinks).toHaveLength(0);
  });
});

// ── Wallet / network badge ────────────────────────────────────────────────────

describe('Navbar — wallet badge', () => {
  it('shows Morph badge when wallet connected and on correct network', () => {
    defaultMocks();
    useWeb3.mockReturnValue({
      account: '0xabc',
      isCorrectNetwork: true,
      networkError: null,
      switchToMorph: vi.fn(),
    });
    renderNavbar();
    expect(screen.getByText('Morph')).toBeInTheDocument();
  });

  it('shows Wrong Network button when on wrong network', () => {
    defaultMocks();
    useWeb3.mockReturnValue({
      account: '0xabc',
      isCorrectNetwork: false,
      networkError: 'Wrong network',
      switchToMorph: vi.fn(),
    });
    renderNavbar();
    // Both the badge button and the warning bar contain this text — just verify at least one exists
    expect(screen.getAllByText(/wrong network/i).length).toBeGreaterThan(0);
  });

  it('shows no wallet badge when no account connected', () => {
    defaultMocks();
    renderNavbar();
    expect(screen.queryByText('Morph')).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../../context/AuthContext';

// ── Mock the api module ───────────────────────────────────────────────────────

vi.mock('../../services/api', () => {
  let _token = null;
  return {
    api: {
      post: vi.fn(),
      get:  vi.fn(),
    },
    setToken:   vi.fn((t) => { _token = t; }),
    clearToken: vi.fn(() => { _token = null; }),
    _getToken:  () => _token,
  };
});

// Mock the global fetch used for session restore
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { api, setToken, clearToken } from '../../services/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_USER = { id: 'u1', email: 'test@example.com', fullName: 'Test User', isSuperAdmin: false };
const MOCK_ORGS = [{ org_id: 'org-1', role: 'owner', slug: 'acme' }];
const MOCK_ORG  = { id: 'org-1', name: 'Acme Corp', slug: 'acme' };

function TestConsumer({ onRender }) {
  const ctx = useAuth();
  onRender(ctx);
  return null;
}

async function renderAuth() {
  let captured;
  await act(async () => {
    render(
      <AuthProvider>
        <TestConsumer onRender={(ctx) => { captured = ctx; }} />
      </AuthProvider>,
    );
  });
  return () => captured;
}

// ── Session restore (mount) ───────────────────────────────────────────────────

describe('AuthContext — session restore on mount', () => {
  it('sets isLoaded=true after mount even when refresh fails', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const getCtx = await renderAuth();
    expect(getCtx().isLoaded).toBe(true);
    expect(getCtx().user).toBeNull();
  });

  it('restores user + orgs when refresh succeeds', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'tok', user: MOCK_USER, orgs: MOCK_ORGS }),
    });
    const getCtx = await renderAuth();
    await waitFor(() => expect(getCtx().user).not.toBeNull());
    expect(getCtx().user).toMatchObject({ email: 'test@example.com' });
    expect(getCtx().orgs).toHaveLength(1);
    expect(setToken).toHaveBeenCalledWith('tok');
  });
});

// ── login ─────────────────────────────────────────────────────────────────────

describe('AuthContext — login', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: false }); // no session restore
  });

  it('sets user and orgs on successful login', async () => {
    api.post.mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'tok123', user: MOCK_USER, orgs: MOCK_ORGS }),
    });

    const getCtx = await renderAuth();
    await act(async () => {
      await getCtx().login('test@example.com', 'password123');
    });

    expect(getCtx().user).toMatchObject({ email: 'test@example.com' });
    expect(getCtx().orgs).toHaveLength(1);
    expect(setToken).toHaveBeenCalledWith('tok123');
  });

  it('throws on failed login', async () => {
    api.post.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Invalid credentials' }),
    });

    const getCtx = await renderAuth();
    await expect(
      act(async () => { await getCtx().login('x@x.com', 'wrong'); }),
    ).rejects.toThrow('Invalid credentials');
  });
});

// ── signup ────────────────────────────────────────────────────────────────────

describe('AuthContext — signup', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: false });
  });

  it('sets user and orgs on successful signup', async () => {
    api.post.mockResolvedValue({
      ok: true,
      json: async () => ({
        accessToken: 'tok-new',
        user: MOCK_USER,
        org: MOCK_ORG,
      }),
    });

    const getCtx = await renderAuth();
    await act(async () => {
      await getCtx().signup({ email: 'new@example.com', password: 'pass', fullName: 'New User', orgName: 'New Org' });
    });

    expect(getCtx().user).toMatchObject({ email: 'test@example.com' });
    expect(getCtx().orgs[0].role).toBe('owner');
  });

  it('throws on failed signup', async () => {
    api.post.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Email already registered' }),
    });

    const getCtx = await renderAuth();
    await expect(
      act(async () => {
        await getCtx().signup({ email: 'dup@x.com', password: 'pass', fullName: 'Dup', orgName: 'Dup Org' });
      }),
    ).rejects.toThrow('Email already registered');
  });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe('AuthContext — logout', () => {
  it('clears user, orgs and token on logout', async () => {
    // Start with a session
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'tok', user: MOCK_USER, orgs: MOCK_ORGS }),
    });

    api.post.mockResolvedValue({ ok: true, json: async () => ({}) });

    // Mock window.location.href setter
    const locationSpy = vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      href: '',
    });

    const getCtx = await renderAuth();
    await waitFor(() => expect(getCtx().user).not.toBeNull());

    await act(async () => { await getCtx().logout(); });

    expect(getCtx().user).toBeNull();
    expect(getCtx().orgs).toHaveLength(0);
    expect(clearToken).toHaveBeenCalled();

    locationSpy.mockRestore();
  });
});

// ── useAuth outside provider ──────────────────────────────────────────────────

describe('AuthContext — useAuth error boundary', () => {
  it('throws when used outside AuthProvider', () => {
    const Wrapper = () => { useAuth(); return null; };
    expect(() => render(<Wrapper />)).toThrow('useAuth must be used inside AuthProvider');
  });
});

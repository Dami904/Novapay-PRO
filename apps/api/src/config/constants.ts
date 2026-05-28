// ── ROLES ─────────────────────────────────────────────────────────────────────
export const ROLES = {
  OWNER:   'owner',
  ADMIN:   'admin',
  FINANCE: 'finance',
  HR:      'hr',
  VIEWER:  'viewer',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// Role hierarchy — higher index = more permissions
export const ROLE_HIERARCHY: Role[] = ['viewer', 'hr', 'finance', 'admin', 'owner'];

// ── CAPABILITIES ──────────────────────────────────────────────────────────────
// Roles allowed per action (any role in the array can perform the action)
export const CAN_CREATE_DRAFT:   Role[] = ['owner', 'admin', 'finance', 'hr'];
export const CAN_SUBMIT:         Role[] = ['owner', 'admin', 'finance', 'hr'];
export const CAN_APPROVE:        Role[] = ['owner', 'admin', 'finance'];
export const CAN_REJECT:         Role[] = ['owner', 'admin', 'finance'];
export const CAN_EXECUTE:        Role[] = ['owner', 'admin'];
export const CAN_MANAGE_MEMBERS: Role[] = ['owner', 'admin'];
export const CAN_MANAGE_EMPLOYEES: Role[] = ['owner', 'admin', 'hr'];
export const CAN_VIEW_AUDIT_LOG: Role[] = ['owner', 'admin'];
export const CAN_MANAGE_ORG:     Role[] = ['owner', 'admin'];
export const CAN_DELETE_ORG:     Role[] = ['owner'];

// ── PAYROLL STATUS ────────────────────────────────────────────────────────────
export const PAYROLL_STATUS = {
  DRAFT:            'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED:         'approved',
  REJECTED:         'rejected',
  EXECUTING:        'executing',
  COMPLETE:         'complete',
  FAILED:           'failed',
} as const;

export type PayrollStatus = typeof PAYROLL_STATUS[keyof typeof PAYROLL_STATUS];

// Valid state transitions
export const VALID_TRANSITIONS: Record<PayrollStatus, PayrollStatus[]> = {
  draft:            ['pending_approval'],
  pending_approval: ['approved', 'rejected'],
  approved:         ['executing', 'rejected'],
  rejected:         [],          // terminal — HR must create a new draft
  executing:        ['complete', 'failed'],
  complete:         [],          // terminal
  failed:           [],          // terminal
};

// ── BLOCKCHAIN ────────────────────────────────────────────────────────────────
export const MORPH_HOODI_CHAIN_ID = 2910;
export const SUPPORTED_TOKENS = ['USDC', 'USDT'] as const;
export type SupportedToken = typeof SUPPORTED_TOKENS[number];

export const TOKEN_ADDRESSES: Record<SupportedToken, string> = {
  USDC: '0xb646c743B4BA47ac03Bee360BB2484Fb55Db8d7e',
  USDT: '0x7433b41C6c5e1d58D4Da99483609520255ab661B',
};

export const TOKEN_DECIMALS: Record<SupportedToken, number> = {
  USDC: 6,
  USDT: 6,
};

export const MORPH_EXPLORER_URL = 'https://explorer-hoodi.morphl2.io';

// ── MISC ──────────────────────────────────────────────────────────────────────
export const MAX_BATCH_SIZE     = 500;   // max recipients per payroll run
export const INVITATION_TTL_DAYS = 7;   // invitations expire after 7 days
export const TX_POLL_INTERVAL_MS = 5000; // check tx confirmation every 5 seconds
export const TX_POLL_MAX_ATTEMPTS = 60;  // give up after 5 minutes (60 × 5s)

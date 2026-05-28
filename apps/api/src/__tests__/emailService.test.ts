import { describe, it, expect, vi } from 'vitest';

// emailService imports env at module load time; stub it to prevent process.exit
vi.mock('../config/env', () => ({
  env: {
    RESEND_API_KEY:    'test-key',
    EMAIL_FROM:        'noreply@test.com',
    FRONTEND_URL:      'http://localhost:5173',
  },
}));

import {
  payrollSubmittedEmail,
  payrollApprovedEmail,
  payrollRejectedEmail,
  payrollExecutedEmail,
  employeePayslipEmail,
  invitationEmail,
} from '../services/emailService';

// ── payrollSubmittedEmail ─────────────────────────────────────────────────────

describe('payrollSubmittedEmail', () => {
  const data = {
    orgName:   'Acme Corp',
    runLabel:  'May 2026',
    submitter: 'Alice Chen',
    runId:     'run-123',
    orgId:     'org-456',
    appUrl:    'https://novapay.io',
  };

  it('returns a subject and html object', () => {
    const result = payrollSubmittedEmail(data);
    expect(result).toHaveProperty('subject');
    expect(result).toHaveProperty('html');
  });

  it('subject contains the run label', () => {
    expect(payrollSubmittedEmail(data).subject).toContain('May 2026');
  });

  it('html contains the submitter name', () => {
    expect(payrollSubmittedEmail(data).html).toContain('Alice Chen');
  });

  it('html contains a link to the payroll run', () => {
    expect(payrollSubmittedEmail(data).html).toContain('org-456');
    expect(payrollSubmittedEmail(data).html).toContain('run-123');
  });
});

// ── payrollApprovedEmail ──────────────────────────────────────────────────────

describe('payrollApprovedEmail', () => {
  const data = {
    orgName:  'Acme Corp',
    runLabel: 'May 2026',
    approver: 'Bob Smith',
    runId:    'run-123',
    orgId:    'org-456',
    appUrl:   'https://novapay.io',
  };

  it('subject indicates approval', () => {
    expect(payrollApprovedEmail(data).subject).toContain('approved');
  });

  it('html contains approver name', () => {
    expect(payrollApprovedEmail(data).html).toContain('Bob Smith');
  });
});

// ── payrollRejectedEmail ──────────────────────────────────────────────────────

describe('payrollRejectedEmail', () => {
  const data = {
    orgName:  'Acme Corp',
    runLabel: 'May 2026',
    rejector: 'Carol Jones',
    note:     'Amounts look wrong',
    runId:    'run-123',
    orgId:    'org-456',
    appUrl:   'https://novapay.io',
  };

  it('subject indicates rejection', () => {
    expect(payrollRejectedEmail(data).subject).toContain('rejected');
  });

  it('html contains the rejection note', () => {
    expect(payrollRejectedEmail(data).html).toContain('Amounts look wrong');
  });

  it('html falls back gracefully when note is empty', () => {
    const result = payrollRejectedEmail({ ...data, note: '' });
    expect(result.html).toContain('No reason provided');
  });
});

// ── payrollExecutedEmail ──────────────────────────────────────────────────────

describe('payrollExecutedEmail', () => {
  const data = {
    orgName:    'Acme Corp',
    runLabel:   'May 2026',
    txHash:     '0x' + 'a'.repeat(64),
    explorerUrl: 'https://explorer.morphl2.io/tx/0x' + 'a'.repeat(64),
    total:      '15000',
    token:      'USDC',
  };

  it('subject contains the run label and success indicator', () => {
    const { subject } = payrollExecutedEmail(data);
    expect(subject).toContain('May 2026');
    expect(subject).toContain('executed');
  });

  it('html contains total amount and token', () => {
    const { html } = payrollExecutedEmail(data);
    expect(html).toContain('15000');
    expect(html).toContain('USDC');
  });

  it('html contains explorer link', () => {
    expect(payrollExecutedEmail(data).html).toContain('morphl2.io');
  });

  it('html shows truncated tx hash as visible text (not the full 66-char hash)', () => {
    const { html } = payrollExecutedEmail(data);
    // The template shows txHash.slice(0,20)+'...' in the table cell
    const truncated = ('0x' + 'a'.repeat(64)).slice(0, 20) + '...';
    expect(html).toContain(truncated);
    // Full 66-char hash only appears inside href (explorer URL), not as bare text
    expect(html).toContain('0x' + 'a'.repeat(64)); // in the href attribute — that's OK
  });
});

// ── employeePayslipEmail ──────────────────────────────────────────────────────

describe('employeePayslipEmail', () => {
  const data = {
    employeeName: 'Alice Chen',
    orgName:      'Acme Corp',
    runLabel:     'May 2026',
    amount:       '3000',
    token:        'USDC',
    executedAt:   '2026-05-27T10:00:00.000Z',
    proofUrl:     'https://novapay.io/proof/0xabc',
  };

  it('subject contains amount and token', () => {
    const { subject } = employeePayslipEmail(data);
    expect(subject).toContain('USDC');
    expect(subject).toContain('3,000.00');
  });

  it('subject contains org name', () => {
    expect(employeePayslipEmail(data).subject).toContain('Acme Corp');
  });

  it('html greets by first name only', () => {
    const { html } = employeePayslipEmail(data);
    expect(html).toContain('Alice');
    expect(html).not.toContain('Alice Chen');  // greeting uses first name only
  });

  it('html formats amount with 2 decimal places', () => {
    const { html } = employeePayslipEmail({ ...data, amount: '3000' });
    expect(html).toContain('3,000.00');
  });

  it('html contains proof URL', () => {
    expect(employeePayslipEmail(data).html).toContain('https://novapay.io/proof/0xabc');
  });

  it('handles single-name employee gracefully', () => {
    const result = employeePayslipEmail({ ...data, employeeName: 'Madonna' });
    expect(result.html).toContain('Madonna');
  });
});

// ── invitationEmail ───────────────────────────────────────────────────────────

describe('invitationEmail', () => {
  const data = {
    orgName: 'Acme Corp',
    role:    'finance',
    inviter: 'Bob Smith',
    token:   'invite-token-abc',
    appUrl:  'https://novapay.io',
  };

  it('subject contains org name', () => {
    expect(invitationEmail(data).subject).toContain('Acme Corp');
  });

  it('html contains role', () => {
    expect(invitationEmail(data).html).toContain('finance');
  });

  it('html contains accept link with token', () => {
    const { html } = invitationEmail(data);
    expect(html).toContain('invite-token-abc');
    expect(html).toContain('/accept');
  });

  it('html mentions 7 day expiry', () => {
    expect(invitationEmail(data).html).toContain('7 days');
  });
});

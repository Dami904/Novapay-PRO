import { describe, it, expect, beforeEach } from 'vitest';
import { parsePayrollBuffer } from '../utils/csvParser';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_WALLET  = '0x1234567890123456789012345678901234567890';
const VALID_WALLET2 = '0x2345678901234567890123456789012345678901';
const VALID_WALLET3 = '0x3456789012345678901234567890123456789012';

function csv(...lines: string[]): Buffer {
  return Buffer.from(lines.join('\n'));
}

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

const YESTERDAY = dateStr(-1);
const TOMORROW  = dateStr(+1);
const TODAY     = dateStr(0);

// ── parsePayrollBuffer ────────────────────────────────────────────────────────

describe('parsePayrollBuffer — CSV parsing', () => {
  it('parses a valid single-recipient CSV', () => {
    const buf    = csv('wallet_address,name,amount', `${VALID_WALLET},Alice,3000`);
    const result = parsePayrollBuffer(buf, 'test.csv');

    expect(result.hasErrors).toBe(false);
    expect(result.recipients).toHaveLength(1);
    expect(result.recipients[0]).toMatchObject({
      fullName:      'Alice',
      walletAddress: VALID_WALLET,
      amount:        3000,
      hasError:      false,
      isExpired:     false,
    });
  });

  it('parses multiple recipients', () => {
    const buf = csv(
      'wallet_address,name,amount',
      `${VALID_WALLET},Alice,3000`,
      `${VALID_WALLET2},Bob,2500`,
      `${VALID_WALLET3},Carol,1000`,
    );
    const result = parsePayrollBuffer(buf, 'test.csv');

    expect(result.hasErrors).toBe(false);
    expect(result.recipients).toHaveLength(3);
  });

  it('defaults name to "Recipient N" when name column is missing', () => {
    const buf    = csv('wallet_address,amount', `${VALID_WALLET},3000`);
    const result = parsePayrollBuffer(buf, 'test.csv');

    expect(result.recipients[0].fullName).toBe('Recipient 2');
  });

  it('defaults name to "Recipient N" when name cell is blank', () => {
    const buf    = csv('wallet_address,name,amount', `${VALID_WALLET},,3000`);
    const result = parsePayrollBuffer(buf, 'test.csv');

    expect(result.recipients[0].fullName).toBe('Recipient 2');
  });
});

// ── Column aliases ────────────────────────────────────────────────────────────

describe('parsePayrollBuffer — column aliases', () => {
  it('accepts "address" as wallet column', () => {
    const buf    = csv('address,amount', `${VALID_WALLET},500`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.hasErrors).toBe(false);
    expect(result.recipients[0].walletAddress).toBe(VALID_WALLET);
  });

  it('accepts "wallet" as wallet column', () => {
    const buf    = csv('wallet,amount', `${VALID_WALLET},500`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.hasErrors).toBe(false);
  });

  it('accepts "usdc_amount" as amount column', () => {
    const buf    = csv('wallet_address,usdc_amount', `${VALID_WALLET},750`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.hasErrors).toBe(false);
    expect(result.recipients[0].amount).toBe(750);
  });

  it('accepts "full_name" as name column', () => {
    const buf    = csv('wallet_address,full_name,amount', `${VALID_WALLET},Dan,900`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.recipients[0].fullName).toBe('Dan');
  });
});

// ── Validation errors ─────────────────────────────────────────────────────────

describe('parsePayrollBuffer — row validation', () => {
  it('marks row with missing wallet as error', () => {
    const buf    = csv('wallet_address,amount', `,500`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.hasErrors).toBe(true);
    expect(result.recipients[0].hasError).toBe(true);
    expect(result.recipients[0].errors).toEqual(expect.arrayContaining([expect.stringContaining('missing')]));
  });

  it('marks row with invalid wallet address as error', () => {
    const buf    = csv('wallet_address,amount', `not-an-address,500`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.hasErrors).toBe(true);
    expect(result.recipients[0].hasError).toBe(true);
  });

  it('marks row with zero amount as error', () => {
    const buf    = csv('wallet_address,amount', `${VALID_WALLET},0`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.hasErrors).toBe(true);
    expect(result.recipients[0].errors).toEqual(expect.arrayContaining([expect.stringContaining('Invalid amount')]));
  });

  it('marks row with negative amount as error', () => {
    const buf    = csv('wallet_address,amount', `${VALID_WALLET},-100`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.hasErrors).toBe(true);
  });

  it('marks row with missing amount as error', () => {
    const buf    = csv('wallet_address,amount', `${VALID_WALLET},`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.hasErrors).toBe(true);
    expect(result.recipients[0].errors).toEqual(expect.arrayContaining([expect.stringContaining('missing')]));
  });

  it('preserves rowIndex matching CSV line number', () => {
    const buf    = csv('wallet_address,amount', `${VALID_WALLET},100`, `${VALID_WALLET2},200`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.recipients[0].rowIndex).toBe(2);
    expect(result.recipients[1].rowIndex).toBe(3);
  });
});

// ── Termination date ──────────────────────────────────────────────────────────

describe('parsePayrollBuffer — termination_date', () => {
  it('marks yesterday as expired', () => {
    const buf    = csv('wallet_address,amount,termination_date', `${VALID_WALLET},1000,${YESTERDAY}`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.recipients[0].isExpired).toBe(true);
    expect(result.recipients[0].hasError).toBe(false);
    expect(result.recipients[0].terminationDate).toBeInstanceOf(Date);
  });

  it('does not mark today as expired (still active on termination day)', () => {
    const buf    = csv('wallet_address,amount,termination_date', `${VALID_WALLET},1000,${TODAY}`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.recipients[0].isExpired).toBe(false);
  });

  it('does not mark future date as expired', () => {
    const buf    = csv('wallet_address,amount,termination_date', `${VALID_WALLET},1000,${TOMORROW}`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.recipients[0].isExpired).toBe(false);
  });

  it('does not mark blank termination_date as expired', () => {
    const buf    = csv('wallet_address,amount,termination_date', `${VALID_WALLET},1000,`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.recipients[0].isExpired).toBe(false);
    expect(result.recipients[0].terminationDate).toBeNull();
  });

  it('handles missing termination_date column gracefully', () => {
    const buf    = csv('wallet_address,amount', `${VALID_WALLET},1000`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.recipients[0].isExpired).toBe(false);
    expect(result.recipients[0].terminationDate).toBeNull();
  });

  it('accepts "contract_end" as a termination column alias', () => {
    const buf    = csv('wallet_address,amount,contract_end', `${VALID_WALLET},1000,${YESTERDAY}`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.recipients[0].isExpired).toBe(true);
  });

  it('accepts "end_date" as a termination column alias', () => {
    const buf    = csv('wallet_address,amount,end_date', `${VALID_WALLET},1000,${YESTERDAY}`);
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.recipients[0].isExpired).toBe(true);
  });

  it('mixed batch: valid + expired recipients both parse without hasError', () => {
    const buf = csv(
      'wallet_address,name,amount,termination_date',
      `${VALID_WALLET},Alice,3000,${TOMORROW}`,
      `${VALID_WALLET2},Bob,2500,${YESTERDAY}`,
      `${VALID_WALLET3},Carol,1000,`,
    );
    const result = parsePayrollBuffer(buf, 'test.csv');
    expect(result.hasErrors).toBe(false);
    expect(result.recipients[0].isExpired).toBe(false);
    expect(result.recipients[1].isExpired).toBe(true);
    expect(result.recipients[2].isExpired).toBe(false);
  });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe('parsePayrollBuffer — file-level errors', () => {
  it('throws on unsupported file extension', () => {
    expect(() => parsePayrollBuffer(Buffer.from('data'), 'file.txt')).toThrow(/unsupported/i);
  });

  it('throws on empty file', () => {
    const buf = csv('wallet_address,amount');
    expect(() => parsePayrollBuffer(buf, 'test.csv')).toThrow(/empty/i);
  });
});

import { describe, it, expect } from 'vitest';
import { parsePayrollCSV } from '../../utils/csvParser';

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_WALLET  = '0x1234567890123456789012345678901234567890';
const VALID_WALLET2 = '0x2345678901234567890123456789012345678901';
const VALID_WALLET3 = '0x3456789012345678901234567890123456789012';

function makeCSVFile(content, name = 'test.csv') {
  return new File([content], name, { type: 'text/csv' });
}

function dateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

const YESTERDAY = dateStr(-1);
const TOMORROW  = dateStr(+1);
const TODAY     = dateStr(0);

// ── Basic parsing ─────────────────────────────────────────────────────────────

describe('parsePayrollCSV — basic parsing', () => {
  it('parses a single valid row', async () => {
    const file   = makeCSVFile(`wallet_address,name,amount\n${VALID_WALLET},Alice,3000`);
    const result = await parsePayrollCSV(file);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      address:  VALID_WALLET,
      name:     'Alice',
      amount:   3000,
      hasError: false,
      isExpired: false,
    });
  });

  it('parses multiple rows', async () => {
    const content = [
      'wallet_address,name,amount',
      `${VALID_WALLET},Alice,3000`,
      `${VALID_WALLET2},Bob,2500`,
    ].join('\n');
    const result = await parsePayrollCSV(makeCSVFile(content));
    expect(result.rows).toHaveLength(2);
  });

  it('defaults name to "Recipient N" when blank', async () => {
    const file   = makeCSVFile(`wallet_address,name,amount\n${VALID_WALLET},,500`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].name).toBe('Recipient 1');
  });
});

// ── Column aliases ────────────────────────────────────────────────────────────

describe('parsePayrollCSV — column aliases', () => {
  it('accepts "address" for wallet column', async () => {
    const file   = makeCSVFile(`address,amount\n${VALID_WALLET},500`);
    const result = await parsePayrollCSV(file);
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0].address).toBe(VALID_WALLET);
  });

  it('accepts "usdc_amount" for amount column', async () => {
    const file   = makeCSVFile(`wallet_address,usdc_amount\n${VALID_WALLET},750`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].amount).toBe(750);
  });
});

// ── Validation errors ─────────────────────────────────────────────────────────

describe('parsePayrollCSV — validation errors', () => {
  it('errors on missing wallet address', async () => {
    const file   = makeCSVFile(`wallet_address,amount\n,500`);
    const result = await parsePayrollCSV(file);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.rows[0].hasError).toBe(true);
  });

  it('errors on invalid wallet address', async () => {
    const file   = makeCSVFile(`wallet_address,amount\nnot-a-wallet,500`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].hasError).toBe(true);
  });

  it('errors on zero amount', async () => {
    const file   = makeCSVFile(`wallet_address,amount\n${VALID_WALLET},0`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].hasError).toBe(true);
  });

  it('errors on negative amount', async () => {
    const file   = makeCSVFile(`wallet_address,amount\n${VALID_WALLET},-50`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].hasError).toBe(true);
  });

  it('errors on missing amount', async () => {
    const file   = makeCSVFile(`wallet_address,amount\n${VALID_WALLET},`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].hasError).toBe(true);
  });
});

// ── Termination date ──────────────────────────────────────────────────────────

describe('parsePayrollCSV — termination_date', () => {
  it('marks yesterday as expired', async () => {
    const file   = makeCSVFile(`wallet_address,amount,termination_date\n${VALID_WALLET},1000,${YESTERDAY}`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].isExpired).toBe(true);
    expect(result.rows[0].hasError).toBe(false);
  });

  it('does not mark today as expired', async () => {
    const file   = makeCSVFile(`wallet_address,amount,termination_date\n${VALID_WALLET},1000,${TODAY}`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].isExpired).toBe(false);
  });

  it('does not mark future date as expired', async () => {
    const file   = makeCSVFile(`wallet_address,amount,termination_date\n${VALID_WALLET},1000,${TOMORROW}`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].isExpired).toBe(false);
  });

  it('does not mark blank termination date as expired', async () => {
    const file   = makeCSVFile(`wallet_address,amount,termination_date\n${VALID_WALLET},1000,`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].isExpired).toBe(false);
    expect(result.rows[0].terminationDate).toBeNull();
  });

  it('stores the ISO date string for valid termination dates', async () => {
    const file   = makeCSVFile(`wallet_address,amount,termination_date\n${VALID_WALLET},1000,${TOMORROW}`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].terminationDate).toBe(TOMORROW);
  });

  it('mixed batch: only expired rows are marked', async () => {
    const content = [
      'wallet_address,name,amount,termination_date',
      `${VALID_WALLET},Alice,3000,${TOMORROW}`,
      `${VALID_WALLET2},Bob,2500,${YESTERDAY}`,
      `${VALID_WALLET3},Carol,1000,`,
    ].join('\n');
    const result = await parsePayrollCSV(makeCSVFile(content));
    expect(result.rows[0].isExpired).toBe(false);
    expect(result.rows[1].isExpired).toBe(true);
    expect(result.rows[2].isExpired).toBe(false);
  });

  it('accepts "contract_end" as termination alias', async () => {
    const file   = makeCSVFile(`wallet_address,amount,contract_end\n${VALID_WALLET},1000,${YESTERDAY}`);
    const result = await parsePayrollCSV(file);
    expect(result.rows[0].isExpired).toBe(true);
  });
});

// ── Unsupported file type ─────────────────────────────────────────────────────

describe('parsePayrollCSV — unsupported file type', () => {
  it('rejects non-CSV/XLSX files', async () => {
    const file = makeCSVFile('some content', 'test.pdf');
    await expect(parsePayrollCSV(file)).rejects.toThrow();
  });
});

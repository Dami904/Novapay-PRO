import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { ethers } from 'ethers';

export interface ParsedRecipient {
  fullName:        string;
  walletAddress:   string;
  amount:          number;
  email:           string | null;
  rowIndex:        number;
  hasError:        boolean;
  errors:          string[];
  terminationDate: Date | null;
  isExpired:       boolean;
}

export interface ParseResult {
  recipients: ParsedRecipient[];
  hasErrors:  boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Coerce any cell value to a trimmed string (handles Date, number, null). */
function toStr(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().split('T')[0]; // "2026-05-01"
  return String(v).trim();
}

/** Parse a date from a cell value (string or Date object). Returns null if unparseable. */
function parseTerminationDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ── Column detection ─────────────────────────────────────────────────────────

const TERM_ALIASES = [
  'termination_date', 'termination', 'contract_end', 'end_date', 'contract_end_date',
  'expiry_date', 'expiry', 'expiration_date', 'expiration', 'contract_expiry',
  'contract_expiration', 'last_day', 'last_working_day', 'exit_date', 'offboarding_date',
  'departure_date', 'end_of_contract', 'contract_end_date',
];

const EMAIL_ALIASES = [
  'email', 'email_address', 'mail', 'work_email', 'business_email', 'contact_email',
  'employee_email', 'personal_email', 'e_mail', 'e-mail',
];

function detectColumns(headers: string[]): {
  walletCol: number; amountCol: number; nameCol: number; termCol: number; emailCol: number;
} {
  const lh = headers.map((h) => h.toLowerCase().trim());

  const walletCol = lh.findIndex((h) => [
    'wallet_address', 'address', 'wallet', 'eth_address', 'ethereum_address',
    'wallet_addr', 'addr', 'public_address', 'crypto_address', 'blockchain_address',
    'recipient_address', 'payment_address', 'recipient_wallet', 'metamask_address',
    'usdc_wallet', 'usdt_wallet', 'usdc_address', 'usdt_address',
    'usdc_wallet_address', 'usdt_wallet_address', 'token_address',
  ].includes(h));
  const amountCol = lh.findIndex((h) => [
    'amount', 'usdc_amount', 'usdc', 'usdt_amount', 'usdt', 'payment_amount',
    'pay_amount', 'salary', 'pay', 'wage', 'wages', 'compensation', 'payout',
    'disbursement', 'token_amount', 'sum', 'value',
  ].includes(h));
  const nameCol   = lh.findIndex((h) => [
    'name', 'employee_name', 'employee', 'full_name', 'staff_name', 'staff',
    'worker', 'recipient', 'member', 'member_name', 'payee', 'payee_name',
    'display_name', 'preferred_name', 'beneficiary',
  ].includes(h));
  const termCol   = lh.findIndex((h) => TERM_ALIASES.includes(h));
  const emailCol  = lh.findIndex((h) => EMAIL_ALIASES.includes(h));

  return { walletCol, amountCol, nameCol, termCol, emailCol };
}

function inferColumnsFromData(
  rows:    Record<string, unknown>[],
  headers: string[],
): { walletCol: number; amountCol: number; nameCol: number } {
  const sample = rows.slice(0, 10);
  const scores = headers.map((_, colIdx) => {
    const values = sample.map((r) => toStr(Object.values(r)[colIdx])).filter(Boolean);
    return {
      isWallet: values.filter((v) => /^0x[0-9a-fA-F]{40}$/.test(v)).length / (values.length || 1),
      isAmount: values.filter((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0).length / (values.length || 1),
    };
  });

  const walletCol = scores.reduce((best, s, i) => (s.isWallet > scores[best].isWallet ? i : best), 0);
  const amountCol = scores.reduce(
    (best, s, i) => (i !== walletCol && s.isAmount > scores[best].isAmount ? i : best),
    walletCol === 0 ? 1 : 0,
  );
  const nameCol = scores.findIndex((_, i) => i !== walletCol && i !== amountCol);

  return { walletCol, amountCol, nameCol };
}

// ── Row validation ────────────────────────────────────────────────────────────

function validateRow(
  walletRaw:      unknown,
  amountRaw:      unknown,
  nameRaw:        unknown,
  terminationRaw: unknown,
  emailRaw:       unknown,
  rowIndex:       number,
): ParsedRecipient {
  const errors: string[] = [];

  const walletAddress = toStr(walletRaw);
  const amountStr     = toStr(amountRaw);
  const fullName      = toStr(nameRaw) || `Recipient ${rowIndex}`;
  const emailRaw2     = toStr(emailRaw);
  const email         = emailRaw2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw2) ? emailRaw2 : null;

  if (!walletAddress) errors.push('Wallet address is missing');
  else if (!ethers.isAddress(walletAddress)) errors.push(`Invalid wallet address: ${walletAddress}`);

  const amount = parseFloat(amountStr);
  if (!amountStr) errors.push('Amount is missing');
  else if (isNaN(amount) || amount <= 0) errors.push(`Invalid amount: ${amountStr}`);

  const terminationDate = parseTerminationDate(terminationRaw);
  const startOfToday    = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const isExpired       = terminationDate !== null && terminationDate < startOfToday;

  return {
    fullName,
    walletAddress,
    amount:          isNaN(amount) ? 0 : amount,
    email,
    rowIndex,
    hasError:        errors.length > 0,
    errors,
    terminationDate,
    isExpired,
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function parsePayrollBuffer(buffer: Buffer, filename: string): ParseResult {
  const ext = filename.split('.').pop()?.toLowerCase();

  let rows: Record<string, unknown>[] = [];
  let headers: string[] = [];

  if (ext === 'csv') {
    const result = Papa.parse<Record<string, string>>(buffer.toString('utf-8'), {
      header:          true,
      skipEmptyLines:  true,
      transformHeader: (h) => h.trim(),
    });
    rows    = result.data as Record<string, unknown>[];
    headers = result.meta.fields ?? [];
  } else if (ext === 'xlsx' || ext === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const sheet    = workbook.Sheets[workbook.SheetNames[0]];
    const json     = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    rows    = json;
    headers = json.length > 0 ? Object.keys(json[0]) : [];
  } else {
    throw new Error('Unsupported file type. Upload a .csv or .xlsx file.');
  }

  if (rows.length === 0) throw new Error('The file is empty or has no data rows.');

  let { walletCol, amountCol, nameCol, termCol, emailCol } = detectColumns(headers);

  if (walletCol === -1 || amountCol === -1) {
    const inferred = inferColumnsFromData(rows, headers);
    if (walletCol === -1) walletCol = inferred.walletCol;
    if (amountCol === -1) amountCol = inferred.amountCol;
    if (nameCol   === -1) nameCol   = inferred.nameCol;
  }

  const walletHeader = headers[walletCol];
  const amountHeader = headers[amountCol];
  const nameHeader   = nameCol  >= 0 ? headers[nameCol]  : '';
  const termHeader   = termCol  >= 0 ? headers[termCol]  : '';
  const emailHeader  = emailCol >= 0 ? headers[emailCol] : '';

  const recipients: ParsedRecipient[] = rows.map((row, i) =>
    validateRow(
      row[walletHeader],
      row[amountHeader],
      nameHeader  ? row[nameHeader]  : '',
      termHeader  ? row[termHeader]  : null,
      emailHeader ? row[emailHeader] : null,
      i + 2, // +2 because row 1 is the header
    ),
  );

  return {
    recipients,
    hasErrors: recipients.some((r) => r.hasError),
  };
}

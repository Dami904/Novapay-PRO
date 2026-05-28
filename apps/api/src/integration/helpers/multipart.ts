import FormData from 'form-data';

export interface MultipartField {
  name:  string;
  value: string;
}

export interface MultipartFile {
  fieldName: string;       // form field name
  filename:  string;       // original filename e.g. "payroll.csv"
  content:   Buffer | string;
  mimeType?: string;
}

/**
 * Build a multipart/form-data body suitable for Fastify's app.inject().
 *
 * @example
 * const { payload, headers } = buildMultipartBody(
 *   [{ name: 'label', value: 'May Payroll' }, { name: 'token', value: 'USDC' }],
 *   [{ fieldName: 'file', filename: 'payroll.csv', content: makePayrollCsv([...]) }],
 * );
 * const res = await app.inject({
 *   method: 'POST', url: '/api/v1/orgs/.../payroll-runs',
 *   headers: { authorization: `Bearer ${token}`, ...headers },
 *   payload,
 * });
 */
export function buildMultipartBody(
  fields: MultipartField[] = [],
  files:  MultipartFile[]  = [],
): { payload: Buffer; headers: Record<string, string> } {
  const form = new FormData();

  for (const f of fields) {
    form.append(f.name, f.value);
  }

  for (const file of files) {
    const buf = typeof file.content === 'string' ? Buffer.from(file.content) : file.content;
    form.append(file.fieldName, buf, {
      filename:    file.filename,
      contentType: file.mimeType ?? (file.filename.endsWith('.csv') ? 'text/csv' : 'application/octet-stream'),
    });
  }

  return {
    payload: form.getBuffer(),
    headers: form.getHeaders() as Record<string, string>,
  };
}

// ── CSV/file factories ────────────────────────────────────────────────────────

/** Build a minimal valid payroll run CSV string. */
export function makePayrollCsv(
  rows: Array<{ wallet: string; name?: string; amount: number; terminationDate?: string }>,
): string {
  const header = 'wallet_address,name,amount,termination_date';
  const lines  = rows.map((r) =>
    `${r.wallet},${r.name ?? 'Test Recipient'},${r.amount},${r.terminationDate ?? ''}`,
  );
  return [header, ...lines].join('\n');
}

/** Build a minimal valid employee import CSV string. */
export function makeEmployeeCsv(
  rows: Array<{ wallet: string; name: string; email?: string; department?: string }>,
): string {
  const header = 'wallet_address,full_name,email,department';
  const lines  = rows.map((r) =>
    `${r.wallet},${r.name},${r.email ?? ''},${r.department ?? ''}`,
  );
  return [header, ...lines].join('\n');
}

// ── Well-known test wallet addresses (valid checksummed Ethereum addresses) ──

export const WALLETS = [
  '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  '0x53d284357ec70cE289D6D64134DfAc8E511c8a3D',
  '0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8',
  '0xC3D6880fD95E06C816cB030fAc45b3ffe3651Cb0',
  '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4',
  '0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2',
  '0x4B20993Bc481177ec7E8f571ceCaE8A9e22C02db',
  '0x78731D3Ca6b7E34aC0F824c42a7cC18A495cabaB',
] as const;

/** Yesterday's date as ISO string (YYYY-MM-DD) — triggers isExpired = true. */
export function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

/** Tomorrow's date as ISO string — NOT expired. */
export function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

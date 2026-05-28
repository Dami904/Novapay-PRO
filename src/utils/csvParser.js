import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { ethers } from 'ethers'

function normalizeHeader(h) {
  return h.trim().toLowerCase().replace(/\s+/g, '_')
}

const WALLET_ALIASES = [
  'wallet_address', 'address', 'wallet', 'eth_address', 'ethereum_address',
  'wallet_addr', 'addr', 'public_address', 'crypto_address', 'blockchain_address',
  'recipient_address', 'payment_address', 'recipient_wallet', 'metamask_address',
  'usdc_wallet', 'usdt_wallet', 'usdc_address', 'usdt_address',
  'usdc_wallet_address', 'usdt_wallet_address', 'token_address',
]
const AMOUNT_ALIASES = [
  'amount', 'usdc_amount', 'usdc', 'usdt_amount', 'usdt', 'payment_amount',
  'pay_amount', 'salary', 'pay', 'wage', 'wages', 'compensation', 'payout',
  'disbursement', 'token_amount', 'sum', 'value',
]
const NAME_ALIASES = [
  'name', 'employee_name', 'employee', 'full_name', 'staff_name', 'staff',
  'worker', 'recipient', 'member', 'member_name', 'payee', 'payee_name',
  'display_name', 'preferred_name', 'beneficiary',
]
const TERMINATION_ALIASES = [
  'termination_date', 'termination', 'contract_end', 'end_date', 'contract_end_date',
  'expiry_date', 'expiry', 'expiration_date', 'expiration', 'contract_expiry',
  'contract_expiration', 'last_day', 'last_working_day', 'exit_date', 'offboarding_date',
  'departure_date', 'end_of_contract',
]

function findAlias(headers, aliases) {
  return aliases.find((a) => headers.includes(a)) || ''
}

function inferColumns(headers, rawRows) {
  const sample = rawRows.slice(0, 10)

  function score(header, testFn) {
    const vals = sample.map((r) => String(r[header] ?? '').trim()).filter(Boolean)
    if (!vals.length) return 0
    return vals.filter(testFn).length / vals.length
  }

  const isAddress = (v) => /^0x[0-9a-fA-F]{40}$/.test(v)
  const isAmount  = (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0
  const isName    = (v) => isNaN(parseFloat(v)) && v.length > 0

  let walletCol = '', amountCol = '', nameCol = ''

  for (const h of headers) {
    if (!walletCol && score(h, isAddress) >= 0.5) walletCol = h
    if (!amountCol && score(h, isAmount)  >= 0.5) amountCol = h
    if (!nameCol   && score(h, isName)    >= 0.5 && h !== walletCol) nameCol = h
  }

  return { walletCol, amountCol, nameCol }
}

/** Parse a date string/object. Returns a Date or null. */
function parseDate(v) {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function validateRows(rawRows) {
  const rows   = []
  const errors = []

  const headers = rawRows.length ? Object.keys(rawRows[0]) : []

  let walletKey = findAlias(headers, WALLET_ALIASES)
  let amountKey = findAlias(headers, AMOUNT_ALIASES)
  let nameKey   = findAlias(headers, NAME_ALIASES)
  const termKey = findAlias(headers, TERMINATION_ALIASES)

  if (!walletKey || !amountKey) {
    const inferred = inferColumns(headers, rawRows)
    if (!walletKey) walletKey = inferred.walletCol
    if (!amountKey) amountKey = inferred.amountCol
    if (!nameKey)   nameKey   = inferred.nameCol
  }

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)

  rawRows.forEach((row, i) => {
    const lineNum   = i + 2
    const address   = String(row[walletKey]  ?? '').trim()
    const amountRaw = String(row[amountKey]  ?? '').trim()
    const name      = String(row[nameKey]    ?? '').trim()
    const termRaw   = termKey ? row[termKey] : null

    if (!address) {
      errors.push({ line: lineNum, field: 'wallet_address', message: 'Add a wallet address for this row.' })
    } else if (!ethers.isAddress(address)) {
      errors.push({ line: lineNum, field: 'wallet_address', message: 'Enter a valid wallet address.' })
    }

    const amount = parseFloat(amountRaw)
    if (!amountRaw) {
      errors.push({ line: lineNum, field: 'amount', message: 'Add an amount for this row.' })
    } else if (isNaN(amount) || amount <= 0) {
      errors.push({ line: lineNum, field: 'amount', message: 'Enter an amount greater than 0.' })
    }

    const terminationDate = parseDate(termRaw)
    const isExpired       = terminationDate !== null && terminationDate < startOfToday

    rows.push({
      line:            lineNum,
      address:         address || '',
      name:            name || `Recipient ${i + 1}`,
      amount:          isNaN(amount) ? 0 : amount,
      amountRaw,
      hasError:        !address || !ethers.isAddress(address) || isNaN(amount) || amount <= 0,
      terminationDate: terminationDate ? terminationDate.toISOString().split('T')[0] : null,
      isExpired,
    })
  })

  return { rows, errors }
}

export function parsePayrollCSV(file) {
  const ext = file.name.split('.').pop().toLowerCase()

  if (!['csv', 'xlsx', 'xls'].includes(ext)) {
    return Promise.reject(new Error('We could not read that file. Please upload a CSV or Excel file.'))
  }

  if (ext === 'xlsx' || ext === 'xls') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target.result, { type: 'array', cellDates: true })
          const sheet    = workbook.Sheets[workbook.SheetNames[0]]
          const rawRows  = XLSX.utils.sheet_to_json(sheet, { defval: '' })
          const normalized = rawRows.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => {
                const key = normalizeHeader(String(k))
                // Preserve Date objects for termination column detection
                if (v instanceof Date) return [key, v]
                return [key, String(v ?? '')]
              }),
            ),
          )
          resolve(validateRows(normalized))
        } catch (err) {
          reject(new Error('We could not read that file. Please upload a CSV or Excel file.'))
        }
      }
      reader.onerror = () => reject(new Error('We could not read that file. Please upload a CSV or Excel file.'))
      reader.readAsArrayBuffer(file)
    })
  }

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header:          true,
      skipEmptyLines:  true,
      transformHeader: normalizeHeader,
      complete: (results) => resolve(validateRows(results.data)),
      error:    () => reject(new Error('We could not read that file. Please upload a CSV or Excel file.')),
    })
  })
}

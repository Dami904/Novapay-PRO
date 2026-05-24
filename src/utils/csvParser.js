import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { ethers } from 'ethers'

function normalizeHeader(h) {
  return h.trim().toLowerCase().replace(/\s+/g, '_')
}

const WALLET_ALIASES = ['wallet_address', 'address', 'wallet']
const AMOUNT_ALIASES = ['amount', 'usdc_amount', 'usdc']
const NAME_ALIASES   = ['name', 'employee_name', 'employee']

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

function validateRows(rawRows) {
  const rows = []
  const errors = []

  const headers = rawRows.length ? Object.keys(rawRows[0]) : []

  let walletKey = findAlias(headers, WALLET_ALIASES)
  let amountKey = findAlias(headers, AMOUNT_ALIASES)
  let nameKey   = findAlias(headers, NAME_ALIASES)

  if (!walletKey || !amountKey) {
    const inferred = inferColumns(headers, rawRows)
    if (!walletKey) walletKey = inferred.walletCol
    if (!amountKey) amountKey = inferred.amountCol
    if (!nameKey)   nameKey   = inferred.nameCol
  }

  rawRows.forEach((row, i) => {
    const lineNum  = i + 2
    const address  = String(row[walletKey] ?? '').trim()
    const amountRaw = String(row[amountKey] ?? '').trim()
    const name     = String(row[nameKey]   ?? '').trim()

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

    rows.push({
      line: lineNum,
      address: address || '',
      name: name || `Recipient ${i + 1}`,
      amount: isNaN(amount) ? 0 : amount,
      amountRaw,
      hasError: !address || !ethers.isAddress(address) || isNaN(amount) || amount <= 0,
    })
  })

  return { rows, errors }
}

export function parsePayrollCSV(file) {
  const ext = file.name.split('.').pop().toLowerCase()

  if (ext === 'xlsx' || ext === 'xls') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target.result, { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
          const normalized = rawRows.map((row) =>
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [normalizeHeader(String(k)), String(v)])
            )
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
      header: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      complete: (results) => resolve(validateRows(results.data)),
      error: () => reject(new Error('We could not read that file. Please upload a CSV or Excel file.')),
    })
  })
}

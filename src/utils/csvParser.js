import Papa from 'papaparse'
import { ethers } from 'ethers'

export function parsePayrollCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: (results) => {
        const rows = []
        const errors = []

        results.data.forEach((row, i) => {
          const lineNum = i + 2
          const address = (row.wallet_address || row.address || row.wallet || '').trim()
          const amountRaw = (row.amount || row.usdc_amount || row.usdc || '').trim()
          const name = (row.name || row.employee_name || row.employee || '').trim()

          if (!address) {
            errors.push({ line: lineNum, field: 'wallet_address', message: 'Missing wallet address' })
          } else if (!ethers.isAddress(address)) {
            errors.push({ line: lineNum, field: 'wallet_address', message: `Invalid address: ${address}` })
          }

          const amount = parseFloat(amountRaw)
          if (!amountRaw) {
            errors.push({ line: lineNum, field: 'amount', message: 'Missing amount' })
          } else if (isNaN(amount) || amount <= 0) {
            errors.push({ line: lineNum, field: 'amount', message: `Invalid amount: ${amountRaw}` })
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

        resolve({ rows, errors })
      },
      error: (err) => reject(new Error(`CSV parse error: ${err.message}`)),
    })
  })
}

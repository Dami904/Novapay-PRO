import Papa from 'papaparse'
import * as XLSX from 'xlsx'

function buildHistoryRows(history) {
  const detailed = history.flatMap((batch) =>
    (batch.recipients || []).map((r) => ({
      Date: new Date(batch.timestamp).toLocaleDateString(),
      'Payroll Label': batch.label,
      'Recipient Name': r.name || '',
      'Wallet Address': r.address,
      'Amount (USDC)': r.amount,
      'Tx Hash': batch.txHash,
      'Block Explorer': batch.explorerUrl || '',
    }))
  )

  if (detailed.length) return detailed

  return history.map((batch) => ({
    Date: new Date(batch.timestamp).toLocaleDateString(),
    'Payroll Label': batch.label,
    Recipients: batch.recipientCount,
    'Total USDC': batch.totalAmount,
    'Tx Hash': batch.txHash,
    'Block Explorer': batch.explorerUrl || '',
  }))
}

function downloadCSV(rows, filename) {
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, filename)
}

function downloadXLSX(rows, filename) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Payroll')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  triggerDownload(blob, filename)
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function exportHistoryToCSV(history, filename = 'payflow-ledger.csv') {
  downloadCSV(buildHistoryRows(history), filename)
}

export function exportHistoryToXLSX(history, filename = 'payflow-ledger.xlsx') {
  downloadXLSX(buildHistoryRows(history), filename)
}

export function exportBatchToCSV(batch) {
  const safeLabel = batch.label.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  exportHistoryToCSV([batch], `payflow-${safeLabel}.csv`)
}

export function exportBatchToXLSX(batch) {
  const safeLabel = batch.label.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  exportHistoryToXLSX([batch], `payflow-${safeLabel}.xlsx`)
}

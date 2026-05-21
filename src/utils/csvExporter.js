import Papa from 'papaparse'

export function exportHistoryToCSV(history, filename = 'novapay-ledger.csv') {
  const rows = history.flatMap((batch) =>
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

  if (!rows.length) {
    const summaryRows = history.map((batch) => ({
      Date: new Date(batch.timestamp).toLocaleDateString(),
      'Payroll Label': batch.label,
      Recipients: batch.recipientCount,
      'Total USDC': batch.totalAmount,
      'Tx Hash': batch.txHash,
      'Block Explorer': batch.explorerUrl || '',
    }))
    downloadCSV(summaryRows, filename)
    return
  }

  downloadCSV(rows, filename)
}

export function exportBatchToCSV(batch) {
  const safeLabel = batch.label.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  exportHistoryToCSV([batch], `novapay-${safeLabel}.csv`)
}

function downloadCSV(rows, filename) {
  const csv = Papa.unparse(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

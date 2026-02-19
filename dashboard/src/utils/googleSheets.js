/**
 * Utility functions to fetch and process data from Google Sheets
 */

const DIRECT_SALES = [
  ['1 - Target', '1 - Target'],
  ['2 - Qualified', '2 - Qualified'],
  ['3 - Proposal', '3 - Proposal'],
  ['4 - Shortlist', '4 - Shortlist'],
  ['5 - Negotiate', '5 - Negotiate'],
  ['6 - Contract Out', '6 - Contract Out'],
  ['7 - Deal Approval', '7 - Deal Approval'],
  ['8 - Closed Won', '8 - Closed Won'],
  ['9 - Implementation', '9 - Implementation'],
  ['10 - Live', '10 - Live'],
  ['11 - Closed Lost', '11 - Closed Lost'],
  ['12 - Churn', '12 - Churn'],
  ['13 - Dead Deals', '13 - Dead Deals'],
  ['14 - Offboarded', '14 - Offboarded'],
]

const PARTNER_MANAGEMENT = [
  ['0 - Dormant', '0 - Dormant'],
  ['i - Identified or Unknown', 'i - Identified or Unknown'],
  ['ii - Qualified/ Proposal', 'ii - Qualified/Proposal'],
  ['iii - Negotiation', 'iii - Negotiation'],
  ['iv - Closed Won', 'iv - Closed Won'],
  ['v - Implementation', 'v - Implementation'],
  ['vi - Live', 'vi - Live'],
  ['vii - Closed Lost', 'vii - Closed Lost'],
]

const ACTIVE_EXCLUDE = new Set([
  '11 - Closed Lost',
  '12 - Churn',
  '13 - Dead Deals',
  '14 - Offboarded',
  'vii - Closed Lost',
])

/**
 * Parse CSV text into array of objects
 * Handles quoted fields, commas within quotes, and escaped quotes
 */
function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length === 0) return []

  function parseCSVLine(line) {
    const values = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          current += '"'
          i++ // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        // End of field
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    // Add last field
    values.push(current.trim())
    return values
  }

  const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''))
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    
    // Only add rows that have at least some data
    if (values.length > 0 && values.some(v => v.trim() !== '')) {
      const row = {}
      headers.forEach((header, idx) => {
        // Remove surrounding quotes and trim
        const value = (values[idx] || '').replace(/^"|"$/g, '').trim()
        row[header] = value
      })
      rows.push(row)
    }
  }

  return rows
}

/**
 * Parse date string to Date object
 * Handles various formats: YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, etc.
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null
  
  // Try parsing as-is first
  let date = new Date(dateStr)
  if (!isNaN(date.getTime())) return date
  
  // Try parsing formats like "2025-02-19 10:25" or "2025-02-19"
  const isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
  if (isoMatch) {
    const [, year, month, day, hour = 0, minute = 0, second = 0] = isoMatch
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour), parseInt(minute), parseInt(second))
    if (!isNaN(date.getTime())) return date
  }
  
  // Try parsing formats like "02/19/2025" or "19/02/2025"
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slashMatch) {
    const [, part1, part2, year] = slashMatch
    // Try both MM/DD/YYYY and DD/MM/YYYY
    date = new Date(parseInt(year), parseInt(part1) - 1, parseInt(part2))
    if (!isNaN(date.getTime()) && date.getFullYear() === parseInt(year)) return date
    
    date = new Date(parseInt(year), parseInt(part2) - 1, parseInt(part1))
    if (!isNaN(date.getTime()) && date.getFullYear() === parseInt(year)) return date
  }
  
  return null
}

/**
 * Get month-end date for a given date
 */
function getMonthEnd(date) {
  const year = date.getFullYear()
  const month = date.getMonth()
  return new Date(year, month + 1, 0) // Last day of month
}

/**
 * Build mapping from column name to stage for given pipeline
 */
function buildColToStage(headers, pipelineType) {
  const suffix = pipelineType === 'Direct Sales' ? '(Direct Sales)' : '(Partner Management)'
  const stages = pipelineType === 'Direct Sales' ? DIRECT_SALES : PARTNER_MANAGEMENT
  const colToStage = {}

  stages.forEach(([shortName]) => {
    for (const header of headers) {
      if (header.includes('Date entered "') && header.includes(shortName) && header.includes(suffix)) {
        colToStage[header] = shortName
        break
      }
    }
  })

  return colToStage
}

/**
 * Get stage at a given date for a deal row
 */
function getStageAtDate(row, colToStage, targetDate) {
  const candidates = []

  for (const [col, stage] of Object.entries(colToStage)) {
    const dateStr = row[col]
    if (dateStr && dateStr.trim() !== '') {
      const date = parseDate(dateStr)
      if (date && date <= targetDate) {
        candidates.push({ stage, date })
      }
    }
  }

  if (candidates.length === 0) return { stage: null, date: null }

  candidates.sort((a, b) => b.date - a.date)
  return candidates[0]
}

/**
 * Generate month-end dates from earliest to latest date in data
 */
function generateMonthEnds(rows, colToStage) {
  const allDates = []

  rows.forEach((row) => {
    Object.keys(colToStage).forEach((col) => {
      const dateStr = row[col]
      if (dateStr && dateStr.trim() !== '') {
        const date = parseDate(dateStr)
        if (date) allDates.push(date)
      }
    })
  })

  if (allDates.length === 0) return []

  const minDate = new Date(Math.min(...allDates))
  const maxDate = new Date(Math.max(...allDates))

  const monthEnds = []
  let current = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
  current = new Date(current.getFullYear(), current.getMonth() + 1, 0) // First month-end

  while (current <= maxDate) {
    monthEnds.push(new Date(current))
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1)
    current = new Date(current.getFullYear(), current.getMonth() + 1, 0)
  }

  return monthEnds
}

/**
 * Count deals per stage at each month-end
 */
function countAtMonthEnds(rows, pipelineType, monthEnds) {
  const headers = Object.keys(rows[0] || {})
  const colToStage = buildColToStage(headers, pipelineType)
  const stagesConfig = pipelineType === 'Direct Sales' ? DIRECT_SALES : PARTNER_MANAGEMENT
  const stages = stagesConfig.map(([, displayName]) => displayName)
  const results = {}

  monthEnds.forEach((me) => {
    const label = `${me.getFullYear()}-${String(me.getMonth() + 1).padStart(2, '0')}`
    results[label] = {}
    stages.forEach((s) => {
      results[label][s] = 0
    })
  })

  rows.forEach((row) => {
    const hasActivity = Object.keys(colToStage).some((col) => row[col] && row[col].trim() !== '')
    if (!hasActivity) return

    monthEnds.forEach((monthEnd) => {
      const { stage } = getStageAtDate(row, colToStage, monthEnd)
      if (!stage) return

      if (ACTIVE_EXCLUDE.has(stage)) return

      const displayName = stagesConfig.find(([short]) => short === stage)?.[1]
      if (!displayName) return

      const label = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}`
      if (results[label]) {
        results[label][displayName] = (results[label][displayName] || 0) + 1
      }
    })
  })

  return results
}

/**
 * Build deal-level details for each (month, stage)
 */
function buildDealDetails(rows, pipelineType, monthEnds) {
  const headers = Object.keys(rows[0] || {})
  const colToStage = buildColToStage(headers, pipelineType)
  const stagesConfig = pipelineType === 'Direct Sales' ? DIRECT_SALES : PARTNER_MANAGEMENT
  const stages = stagesConfig
    .map(([, displayName]) => displayName)
    .filter((s) => !ACTIVE_EXCLUDE.has(s))
  const results = {}

  monthEnds.forEach((me) => {
    const label = `${me.getFullYear()}-${String(me.getMonth() + 1).padStart(2, '0')}`
    results[label] = {}
    stages.forEach((s) => {
      results[label][s] = []
    })
  })

  rows.forEach((row) => {
    const hasActivity = Object.keys(colToStage).some((col) => row[col] && row[col].trim() !== '')
    if (!hasActivity) return

    const dealName = String(row['Deal Name'] || '').trim()
    const dealOwner = String(row['Deal owner'] || '').trim()
    const amount = parseFloat(row['Amount in company currency'] || 0) || 0
    const monthlyTransactions = parseFloat(row['Expected usage (txns p.m.)'] || 0) || 0

    monthEnds.forEach((monthEnd) => {
      const { stage, date } = getStageAtDate(row, colToStage, monthEnd)
      if (!stage) return

      if (ACTIVE_EXCLUDE.has(stage)) return

      const displayName = stagesConfig.find(([short]) => short === stage)?.[1]
      if (!displayName) return

      const dateStr = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : ''
      const label = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}`

      if (results[label] && results[label][displayName]) {
        results[label][displayName].push({
          dealName,
          dealStage: displayName,
          dealOwner,
          dateEnteredStage: dateStr,
          amount,
          monthlyTransactions,
        })
      }
    })
  })

  return results
}

/**
 * Convert count data to chart format
 */
function toChartData(countData, monthLabels, stagesConfig) {
  const chartData = []
  const stages = stagesConfig.map(([, displayName]) => displayName).filter((s) => !ACTIVE_EXCLUDE.has(s))

  stages.forEach((stage) => {
    const stageData = {
      stage,
      month: [],
      count: [],
    }

    monthLabels.forEach((label) => {
      stageData.month.push(label)
      stageData.count.push(countData[label]?.[stage] || 0)
    })

    chartData.push(stageData)
  })

  return chartData
}

/**
 * Fetch and process data from Google Sheets
 */
export async function fetchDataFromGoogleSheets(sheetId, gid = '0') {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
  
  try {
    const response = await fetch(csvUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch Google Sheets: ${response.statusText}`)
    }

    const csvText = await response.text()
    const rows = parseCSV(csvText)

    if (rows.length === 0) {
      throw new Error('No data found in Google Sheets')
    }

    // Build column mappings for both pipelines
    const headers = Object.keys(rows[0])
    const colToStageDS = buildColToStage(headers, 'Direct Sales')
    const colToStagePM = buildColToStage(headers, 'Partner Management')

    // Generate month-ends from all date columns
    const allColToStage = { ...colToStageDS, ...colToStagePM }
    const monthEnds = generateMonthEnds(rows, allColToStage)

    if (monthEnds.length === 0) {
      throw new Error('No valid dates found in Google Sheets')
    }

    const monthLabels = monthEnds.map((me) => `${me.getFullYear()}-${String(me.getMonth() + 1).padStart(2, '0')}`)

    // Process Direct Sales
    const countDataDS = countAtMonthEnds(rows, 'Direct Sales', monthEnds)
    const dealDetailsDS = buildDealDetails(rows, 'Direct Sales', monthEnds)
    const chartDataDS = toChartData(countDataDS, monthLabels, DIRECT_SALES)

    // Process Partner Management
    const countDataPM = countAtMonthEnds(rows, 'Partner Management', monthEnds)
    const dealDetailsPM = buildDealDetails(rows, 'Partner Management', monthEnds)
    const chartDataPM = toChartData(countDataPM, monthLabels, PARTNER_MANAGEMENT)

    return {
      chartDataDS,
      chartDataPM,
      monthLabels,
      dealDetailsDS,
      dealDetailsPM,
      rawRows: rows, // Include raw rows for conversion calculations
      colToStageDS,
      colToStagePM,
    }
  } catch (error) {
    console.error('Error fetching from Google Sheets:', error)
    throw error
  }
}

import { useState, useEffect, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
  LineChart,
  Line,
  ComposedChart,
  Scatter,
} from 'recharts'
import { fetchDataFromGoogleSheets } from './utils/googleSheets'
import './App.css'

// Company color palette – distinct colors for each stage
const COLORS = {
  'Direct Sales': {
    '1 - Target': '#2f1e4f',        // Dark purple/indigo
    '2 - Qualified': '#ef4444',     // Red
    '3 - Proposal': '#f59e0b',      // Orange/Amber
    '4 - Shortlist': '#3b82f6',     // Bright blue
    '5 - Negotiate': '#10b981',     // Green
    '6 - Contract Out': '#06b6d4',  // Teal/Cyan
    '7 - Deal Approval': '#8b5cf6', // Purple
    '8 - Closed Won': '#22c55e',     // Bright green
    '9 - Implementation': '#14b8a6', // Turquoise
    '10 - Live': '#93c5fd',         // Light blue
  },
  'Partner Management': {
    '0 - Dormant': '#2f1e4f',       // Dark purple/indigo
    'i - Identified or Unknown': '#ffb3ba', // Light pastel red
    'ii - Qualified/Proposal': '#f59e0b',  // Orange/Amber
    'iii - Negotiation': '#3b82f6', // Bright blue
    'iv - Closed Won': '#22c55e',   // Bright green
    'v - Implementation': '#14b8a6', // Turquoise
    'vi - Live': '#93c5fd',         // Light blue
  },
}

function toRechartsFormat(chartData, monthLabels, includedStages) {
  if (!chartData?.length || !monthLabels?.length) return []
  const months = chartData[0]?.month
  if (!months?.length) return []
  const includeSet = includedStages?.length ? new Set(includedStages) : null
  const stagesOrder = includeSet
    ? chartData.filter((s) => includeSet.has(s.stage)).map((s) => s.stage)
    : chartData.map((s) => s.stage)
  return months.map((month, i) => {
    const point = { month }
    let total = 0
    let topStage = stagesOrder[stagesOrder.length - 1]
    chartData.forEach((s) => {
      if (includeSet && !includeSet.has(s.stage)) return
      const v = s.count[i] ?? 0
      point[s.stage] = v
      total += v
      if (v > 0) topStage = s.stage
    })
    point.total = total
    point._topStage = topStage
    return point
  })
}

function isDealInEntryRange(deal, dealEntryMap, entryDateStart, entryDateEnd) {
  if (!entryDateStart && !entryDateEnd) return true
  const key = `${deal.dealName}|${deal.dealOwner}`
  const entry = dealEntryMap?.get(key)
  if (!entry?.entryDate) return false
  const entryDate = parseDate(entry.entryDate)
  if (!entryDate) return false
  if (entryDateStart) {
    const start = parseDate(entryDateStart)
    if (start && entryDate < start) return false
  }
  if (entryDateEnd) {
    const end = parseDate(entryDateEnd)
    if (end && entryDate > end) return false
  }
  return true
}

function computeChartFromDealDetails(dealDetails, monthLabels, stages, selectedOwners, selectedDealNames, includedStages, metric = 'count', dealEntryMap = null, entryDateStart = null, entryDateEnd = null) {
  if (!dealDetails || !monthLabels?.length || !stages?.length) return []
  const ownerSet = selectedOwners?.length ? new Set(selectedOwners) : null
  const dealNameSet = selectedDealNames?.length ? new Set(selectedDealNames) : null
  const includeSet = includedStages?.length ? new Set(includedStages) : null
  const stagesOrder = includeSet ? stages.filter((s) => includeSet.has(s)) : stages
  const matchDeal = (d) => {
    if (ownerSet && !ownerSet.has(d.dealOwner)) return false
    if (dealNameSet && !dealNameSet.has(d.dealName)) return false
    if (!isDealInEntryRange(d, dealEntryMap, entryDateStart, entryDateEnd)) return false
    return true
  }
  const agg = (deals) => {
    const filtered = deals.filter(matchDeal)
    if (metric === 'amount') {
      return filtered.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
    } else if (metric === 'monthlyTransactions') {
      return filtered.reduce((sum, d) => sum + (Number(d.monthlyTransactions) || 0), 0)
    } else {
      return filtered.length
    }
  }
  return monthLabels.map((month) => {
    const point = { month }
    let total = 0
    let topStage = stagesOrder[stagesOrder.length - 1]
    const monthData = dealDetails[month] || {}
    stages.forEach((stage) => {
      if (includeSet && !includeSet.has(stage)) return
      const deals = monthData[stage] || []
      const value = agg(deals)
      point[stage] = value
      total += value
      if (value > 0) topStage = stage
    })
    point.total = total
    point._topStage = topStage
    return point
  })
}

function formatMonthLabel(ym) {
  if (!ym || ym === 'all') return ym
  const [y, m] = ym.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parseInt(m, 10) - 1] || m} ${y}`
}

function formatDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return '-'
  const date = parseDate(dateStr)
  if (!date) return dateStr
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = date.getDate()
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  
  return `${month} ${day}, ${year}`
}

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

function formatAmount(val) {
  if (val == null) return '-'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val)
}

function formatAmountShort(val) {
  if (val == null || val === 0) return '0'
  const abs = Math.abs(val)
  if (abs >= 1e9) return `$${(val / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(val / 1e3).toFixed(0)}K`
  return formatAmount(val)
}

function formatNumber(val) {
  if (val == null) return '-'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(val)
}

function formatNumberShort(val) {
  if (val == null || val === 0) return '0'
  const abs = Math.abs(val)
  if (abs >= 1e9) return `${(val / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(val / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(val / 1e3).toFixed(0)}K`
  return formatNumber(val)
}

function monthToStartDate(ym) {
  if (!ym) return ''
  return `${ym}-01`
}

function monthToEndDate(ym) {
  if (!ym) return ''
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${ym}-${String(lastDay).padStart(2, '0')}`
}

function dateToMonthIndex(dateStr, monthLabels) {
  if (!dateStr || !monthLabels?.length) return -1
  const ym = dateStr.slice(0, 7)
  const idx = monthLabels.indexOf(ym)
  return idx >= 0 ? idx : -1
}

function daysBetween(dateStr1, dateStr2) {
  const d1 = parseDate(dateStr1)
  const d2 = parseDate(dateStr2)
  if (!d1 || !d2) return null
  const ms = d2.getTime() - d1.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

function App() {
  const [pipeline, setPipeline] = useState('Partner Management')
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [includedStages, setIncludedStages] = useState([])
  const [selectedOwners, setSelectedOwners] = useState([])
  const [selectedDealNames, setSelectedDealNames] = useState([])
  const [dealNameSearch, setDealNameSearch] = useState('')
  const [filterOpen, setFilterOpen] = useState(null)
  const [dataType, setDataType] = useState('count') // 'count' | 'amount' | 'monthlyTransactions'
  const [chartHeight, setChartHeight] = useState(750)
  const [cohortModal, setCohortModal] = useState(null) // { month, deals: [...] }
  const [salesCycleCohortModal, setSalesCycleCohortModal] = useState(null) // { month, deals: [...] }
  const [timeInStageCohortModal, setTimeInStageCohortModal] = useState(null) // { month, deals: [{ dealName, dealOwner, daysInStage }] }
  const [timeInStageBarModal, setTimeInStageBarModal] = useState(null) // { stage, deals, avgDays, medianDays }
  const [timeInStageDealFilter, setTimeInStageDealFilter] = useState('all') // 'all' | 'converted' | 'notConverted'
  const [entryDateStart, setEntryDateStart] = useState('')
  const [entryDateEnd, setEntryDateEnd] = useState('')
  
  useEffect(() => {
    const updateChartHeight = () => {
      setChartHeight(window.innerWidth <= 768 ? 500 : 750)
    }
    updateChartHeight()
    window.addEventListener('resize', updateChartHeight)
    return () => window.removeEventListener('resize', updateChartHeight)
  }, [])

  useEffect(() => {
    setIncludedStages([])
    setSelectedOwners([])
    setSelectedDealNames([])
    setDealNameSearch('')
    setEntryDateStart('')
    setEntryDateEnd('')
    setTimeInStageDealFilter('all')
  }, [pipeline])

  useEffect(() => {
    if (!filterOpen) return
    const close = () => setFilterOpen(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [filterOpen])

  useEffect(() => {
    const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID || '1FhenanldXBkesfIrWUXksMyjJgoYK-_em4DLUcMcSGE'
    const gid = import.meta.env.VITE_GOOGLE_SHEET_GID || '0'
    
    fetchDataFromGoogleSheets(sheetId, gid)
      .then((json) => {
        setData(json)
        if (json.monthLabels?.length && !selectedMonth) {
          setSelectedMonth(json.monthLabels[json.monthLabels.length - 1])
        }
      })
      .catch((err) => {
        console.error('Error loading data:', err)
        setError(err.message || 'Failed to load data from Google Sheets')
      })
      .finally(() => setLoading(false))
  }, [])

  const chartData =
    pipeline === 'Direct Sales' ? data?.chartDataDS : data?.chartDataPM
  const stages = chartData?.map((s) => s.stage) ?? []
  const dealDetails = pipeline === 'Direct Sales' ? data?.dealDetailsDS : data?.dealDetailsPM

  const allOwners = useMemo(() => {
    if (!dealDetails) return []
    const set = new Set()
    Object.values(dealDetails).forEach((monthData) => {
      Object.values(monthData || {}).forEach((deals) => {
        (deals || []).forEach((d) => d.dealOwner && set.add(d.dealOwner))
      })
    })
    return Array.from(set).sort()
  }, [dealDetails])

  const allDealNames = useMemo(() => {
    if (!dealDetails) return []
    const set = new Set()
    Object.values(dealDetails).forEach((monthData) => {
      Object.values(monthData || {}).forEach((deals) => {
        (deals || []).forEach((d) => d.dealName && set.add(d.dealName))
      })
    })
    return Array.from(set).sort()
  }, [dealDetails])

  const dealEntryMap = useMemo(() => {
    if (!data?.rawRows || !data?.colToStageDS || !data?.colToStagePM) return new Map()
    const colToStage = pipeline === 'Direct Sales' ? data.colToStageDS : data.colToStagePM
    const map = new Map()
    data.rawRows.forEach((row) => {
      const dealName = String(row['Deal Name'] || '').trim()
      const dealOwner = String(row['Deal owner'] || '').trim()
      if (!dealName) return
      const key = `${dealName}|${dealOwner}`
      let earliestDate = null
      let earliestDateStr = null
      for (const [col] of Object.entries(colToStage)) {
        const dateStr = row[col]
        if (dateStr && dateStr.trim() !== '') {
          const date = parseDate(dateStr)
          if (date && (!earliestDate || date < earliestDate)) {
            earliestDate = date
            earliestDateStr = dateStr
          }
        }
      }
      if (earliestDateStr) {
        const existing = map.get(key)
        if (!existing || earliestDate < parseDate(existing.entryDate)) {
          map.set(key, {
            entryMonth: earliestDate ? `${earliestDate.getFullYear()}-${String(earliestDate.getMonth() + 1).padStart(2, '0')}` : null,
            entryDate: earliestDateStr,
          })
        }
      }
    })
    return map
  }, [data?.rawRows, data?.colToStageDS, data?.colToStagePM, pipeline])

  const dealsInEntryRangeSet = useMemo(() => {
    if (!entryDateStart && !entryDateEnd) return null
    const set = new Set()
    dealEntryMap.forEach((entry, key) => {
      if (!entry?.entryDate) return
      const entryDate = parseDate(entry.entryDate)
      if (!entryDate) return
      if (entryDateStart) {
        const start = parseDate(entryDateStart)
        if (start && entryDate < start) return
      }
      if (entryDateEnd) {
        const end = parseDate(entryDateEnd)
        if (end && entryDate > end) return
      }
      set.add(key)
    })
    return set
  }, [dealEntryMap, entryDateStart, entryDateEnd])

  const allRechartsData = useMemo(() => {
    const hasEntryDateFilter = !!(entryDateStart || entryDateEnd)
    const needsDealDetails =
      dataType === 'amount' || dataType === 'monthlyTransactions' || selectedOwners.length > 0 || selectedDealNames.length > 0 || hasEntryDateFilter
    if (needsDealDetails && dealDetails) {
      return computeChartFromDealDetails(
        dealDetails,
        data?.monthLabels ?? [],
        stages,
        selectedOwners,
        selectedDealNames,
        includedStages,
        dataType,
        dealEntryMap,
        entryDateStart || null,
        entryDateEnd || null
      )
    }
    if (dataType === 'amount' || dataType === 'monthlyTransactions') return [] // these modes need dealDetails
    return toRechartsFormat(chartData ?? [], data?.monthLabels ?? [], includedStages)
  }, [chartData, data?.monthLabels, dealDetails, selectedOwners, selectedDealNames, includedStages, stages, dataType, dealEntryMap, entryDateStart, entryDateEnd])

  const rechartsData = useMemo(() => {
    if (!selectedMonth || selectedMonth === 'all') return allRechartsData
    const idx = data?.monthLabels?.indexOf(selectedMonth) ?? -1
    if (idx < 0) return allRechartsData
    const showMonths = 12
    const start = Math.max(0, idx - showMonths + 1)
    return allRechartsData.slice(start, idx + 1)
  }, [allRechartsData, selectedMonth, data?.monthLabels])

  // Calculate interval for x-axis labels based on number of months
  const xAxisInterval = useMemo(() => {
    const monthCount = rechartsData?.length || 0
    if (monthCount <= 6) return 0 // Show all labels
    if (monthCount <= 12) return 0 // Show all labels
    if (monthCount <= 18) return 1 // Show every other label
    return 2 // Show every third label
  }, [rechartsData])

  const visibleStages = useMemo(
    () => (includedStages.length === 0 ? stages : stages.filter((s) => includedStages.includes(s))),
    [stages, includedStages]
  )
  const colors = COLORS[pipeline] ?? {}

  const selectAllStages = () => setIncludedStages([])

  const toggleStageIncluded = (stage) => {
    setIncludedStages((prev) => {
      if (prev.length === 0) {
        return stages.filter((s) => s !== stage)
      }
      const next = prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage]
      return next.length === 0 ? [] : next
    })
  }

  const selectAllOwners = () => setSelectedOwners([])

  const selectAllDealNames = () => setSelectedDealNames([])

  const toggleDealName = (name) => {
    setSelectedDealNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  const toggleOwner = (owner) => {
    setSelectedOwners((prev) =>
      prev.includes(owner) ? prev.filter((o) => o !== owner) : [...prev, owner]
    )
  }

  const handleBarClick = () => (data) => {
    const payload = data?.payload ?? data
    const month = payload?.month ?? data?.month
    if (!month) return
    const monthData = dealDetails?.[month]
    const filteredStages = visibleStages.length ? visibleStages : stages
    const rawDeals = monthData
      ? filteredStages.flatMap((stage) => monthData[stage] ?? [])
      : []
    let filtered = rawDeals
    if (selectedOwners.length > 0) {
      filtered = filtered.filter((d) => selectedOwners.includes(d.dealOwner))
    }
    if (selectedDealNames.length > 0) {
      filtered = filtered.filter((d) => selectedDealNames.includes(d.dealName))
    }
    if (entryDateStart || entryDateEnd) {
      filtered = filtered.filter((d) => isDealInEntryRange(d, dealEntryMap, entryDateStart || null, entryDateEnd || null))
    }
    const sortedDeals = [...filtered].sort((a, b) => {
      if (a.dealStage !== b.dealStage) return String(a.dealStage).localeCompare(b.dealStage)
      return (b.amount || 0) - (a.amount || 0)
    })
    setModal({
      month,
      deals: sortedDeals,
      needsRefresh: !dealDetails,
    })
  }

  const monthOptions = useMemo(() => {
    const labels = data?.monthLabels ?? []
    return [
      { value: 'all', label: 'All months' },
      ...labels.map((m) => ({ value: m, label: formatMonthLabel(m) })).reverse(),
    ]
  }, [data?.monthLabels])

  const pipelineMovements = useMemo(() => {
    if (!dealDetails || !data?.monthLabels?.length) return []
    const labels = data.monthLabels
    const targetMonth =
      selectedMonth && selectedMonth !== 'all'
        ? selectedMonth
        : labels[labels.length - 1]
    const idx = labels.indexOf(targetMonth)
    if (idx < 0) return []
    const prevMonth = idx > 0 ? labels[idx - 1] : null
    const includeSet = includedStages?.length ? new Set(includedStages) : null
    const ownerSet = selectedOwners?.length ? new Set(selectedOwners) : null
    const dealNameSet = selectedDealNames?.length ? new Set(selectedDealNames) : null
    const visibleStagesList = includeSet
      ? stages.filter((s) => includeSet.has(s))
      : stages

    const entryDateFilterActive = !!(entryDateStart || entryDateEnd)
    const prevStageByDeal = new Map()
    if (prevMonth) {
      const prevData = dealDetails[prevMonth] || {}
      visibleStagesList.forEach((stage) => {
        ;(prevData[stage] || []).forEach((d) => {
          if (ownerSet && !ownerSet.has(d.dealOwner)) return
          if (dealNameSet && !dealNameSet.has(d.dealName)) return
          if (entryDateFilterActive && !isDealInEntryRange(d, dealEntryMap, entryDateStart || null, entryDateEnd || null)) return
          prevStageByDeal.set(`${d.dealName}\n${d.dealOwner}`, stage)
        })
      })
    }

    const movements = []
    const currData = dealDetails[targetMonth] || {}
    visibleStagesList.forEach((toStage) => {
      ;(currData[toStage] || []).forEach((d) => {
        if (ownerSet && !ownerSet.has(d.dealOwner)) return
        if (dealNameSet && !dealNameSet.has(d.dealName)) return
        if (entryDateFilterActive && !isDealInEntryRange(d, dealEntryMap, entryDateStart || null, entryDateEnd || null)) return
        const key = `${d.dealName}\n${d.dealOwner}`
        const fromStage = prevStageByDeal.get(key)
        if (fromStage === toStage) return
        movements.push({
          dealName: d.dealName,
          dealOwner: d.dealOwner,
          fromStage: fromStage || null,
          toStage,
        })
      })
    })
    return movements.sort((a, b) => {
      if (a.toStage !== b.toStage) return String(a.toStage).localeCompare(b.toStage)
      return String(a.dealName).localeCompare(b.dealName)
    })
  }, [
    dealDetails,
    data?.monthLabels,
    selectedMonth,
    stages,
    includedStages,
    selectedOwners,
    selectedDealNames,
    dealEntryMap,
    entryDateStart,
    entryDateEnd,
  ])

  const movementsMonthLabel = useMemo(() => {
    if (!data?.monthLabels?.length) return null
    const m =
      selectedMonth && selectedMonth !== 'all'
        ? selectedMonth
        : data.monthLabels[data.monthLabels.length - 1]
    return formatMonthLabel(m)
  }, [data?.monthLabels, selectedMonth])

  // Conversion metrics calculations - using raw data to track actual stage entries
  const overallConversion = useMemo(() => {
    if (!data?.rawRows || !data?.colToStageDS || !data?.colToStagePM) return null
    
    const colToStage = pipeline === 'Direct Sales' ? data.colToStageDS : data.colToStagePM
    const liveStageShort = pipeline === 'Direct Sales' ? '10 - Live' : 'vi - Live'
    
    // Find the column name for live stage
    let liveStageCol = null
    for (const [col, stage] of Object.entries(colToStage)) {
      if (stage === liveStageShort) {
        liveStageCol = col
        break
      }
    }
    
    if (!liveStageCol) return null
    
    const dealsMap = new Map()
    
    // Process all rows to find deals that have ANY activity in this pipeline and/or reached live stage
    data.rawRows.forEach(row => {
      const dealName = String(row['Deal Name'] || '').trim()
      const dealOwner = String(row['Deal owner'] || '').trim()
      if (!dealName) return
      
      const key = `${dealName}|${dealOwner}`
      if (!dealsMap.has(key)) {
        dealsMap.set(key, {
          dealName,
          dealOwner,
          hasPipelineActivity: false,
          enteredLive: false,
        })
      }
      
      const dealData = dealsMap.get(key)
      
      // Check if deal has ANY activity in this pipeline (any stage date filled)
      const hasActivity = Object.keys(colToStage).some(col => {
        const dateStr = row[col]
        return dateStr && dateStr.trim() !== ''
      })
      if (hasActivity) {
        dealData.hasPipelineActivity = true
      }
      
      // Check if deal entered live stage
      const liveStageDate = row[liveStageCol]
      if (liveStageDate && liveStageDate.trim() !== '') {
        dealData.enteredLive = true
      }
    })
    
    // Filter by entry date range if set
    const dealList = Array.from(dealsMap.values()).filter(d => d.hasPipelineActivity)
    const filteredDealList = dealsInEntryRangeSet
      ? dealList.filter(d => dealsInEntryRangeSet.has(`${d.dealName}|${d.dealOwner}`))
      : dealList
    const totalDeals = filteredDealList.length
    const convertedDeals = filteredDealList.filter(d => d.enteredLive).length
    const conversionRate = totalDeals > 0 ? Math.round((convertedDeals / totalDeals) * 1000) / 10 : 0
    
    return { totalDeals, convertedDeals, conversionRate }
  }, [data, pipeline, dealsInEntryRangeSet])

  const stageConversion = useMemo(() => {
    if (!data?.rawRows || !data?.colToStageDS || !data?.colToStagePM) return []
    
    const colToStage = pipeline === 'Direct Sales' ? data.colToStageDS : data.colToStagePM
    const stagesConfig = pipeline === 'Direct Sales'
      ? [['1 - Target', '1 - Target'], ['2 - Qualified', '2 - Qualified'], ['3 - Proposal', '3 - Proposal'], ['4 - Shortlist', '4 - Shortlist'], ['5 - Negotiate', '5 - Negotiate'], ['6 - Contract Out', '6 - Contract Out'], ['7 - Deal Approval', '7 - Deal Approval'], ['8 - Closed Won', '8 - Closed Won'], ['9 - Implementation', '9 - Implementation'], ['10 - Live', '10 - Live']]
      : [['0 - Dormant', '0 - Dormant'], ['i - Identified or Unknown', 'i - Identified or Unknown'], ['ii - Qualified/ Proposal', 'ii - Qualified/Proposal'], ['iii - Negotiation', 'iii - Negotiation'], ['iv - Closed Won', 'iv - Closed Won'], ['v - Implementation', 'v - Implementation'], ['vi - Live', 'vi - Live']]
    
    const stages = stagesConfig.map(([, displayName]) => displayName)
    const liveStageShort = pipeline === 'Direct Sales' ? '10 - Live' : 'vi - Live'
    
    // Build map of stage short name to column name
    const stageToCol = {}
    for (const [col, stageShort] of Object.entries(colToStage)) {
      const stageConfig = stagesConfig.find(([short]) => short === stageShort)
      if (stageConfig) {
        stageToCol[stageConfig[1]] = col
      }
    }
    
    const dealsMap = new Map()
    
    // Process all rows to track which stages each deal entered
    data.rawRows.forEach(row => {
      const dealName = String(row['Deal Name'] || '').trim()
      const dealOwner = String(row['Deal owner'] || '').trim()
      if (!dealName) return
      
      const key = `${dealName}|${dealOwner}`
      if (!dealsMap.has(key)) {
        dealsMap.set(key, {
          dealName,
          dealOwner,
          stagesEntered: new Set(),
          enteredLive: false,
        })
      }
      
      const dealData = dealsMap.get(key)
      
      // Check which stages this deal entered
      stages.forEach(stage => {
        const col = stageToCol[stage]
        if (col && row[col] && row[col].trim() !== '') {
          dealData.stagesEntered.add(stage)
          if (stage === (pipeline === 'Direct Sales' ? '10 - Live' : 'vi - Live')) {
            dealData.enteredLive = true
          }
        }
      })
    })
    
    const results = []
    const allDeals = Array.from(dealsMap.values())
    const filterByEntry = (list) => dealsInEntryRangeSet
      ? list.filter(d => dealsInEntryRangeSet.has(`${d.dealName}|${d.dealOwner}`))
      : list
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i]
      const dealsInStage = filterByEntry(allDeals.filter(d => d.stagesEntered.has(stage)))
      const dealsConverted = dealsInStage.filter(d => d.enteredLive).length
      const nextStage = i < stages.length - 1 ? stages[i + 1] : null
      const dealsToNextStage = nextStage
        ? filterByEntry(allDeals.filter(d =>
            d.stagesEntered.has(stage) && d.stagesEntered.has(nextStage)
          )).length
        : dealsConverted
      
      const stageConversion = dealsInStage.length > 0
        ? Math.round((dealsToNextStage / dealsInStage.length) * 1000) / 10
        : 0
      
      const overallConversion = dealsInStage.length > 0
        ? Math.round((dealsConverted / dealsInStage.length) * 1000) / 10
        : 0
      
      results.push({
        stage,
        dealsInStage: dealsInStage.length,
        dealsToNextStage: nextStage ? dealsToNextStage : dealsConverted,
        nextStage: nextStage || 'Live',
        stageConversion,
        overallConversion,
      })
    }
    
    return results
  }, [data, pipeline, dealsInEntryRangeSet])

  const cohortConversion = useMemo(() => {
    if (!data?.rawRows || !data?.monthLabels?.length || !data?.colToStageDS || !data?.colToStagePM) return []
    
    const colToStage = pipeline === 'Direct Sales' ? data.colToStageDS : data.colToStagePM
    const liveStageShort = pipeline === 'Direct Sales' ? '10 - Live' : 'vi - Live'
    
    // Find column name for live stage
    let liveStageCol = null
    for (const [col, stage] of Object.entries(colToStage)) {
      if (stage === liveStageShort) {
        liveStageCol = col
        break
      }
    }
    
    if (!liveStageCol) return []
    
    const dealsMap = new Map()
    
    // Process rows to find entry month (earliest stage date) and conversion status
    data.rawRows.forEach(row => {
      const dealName = String(row['Deal Name'] || '').trim()
      const dealOwner = String(row['Deal owner'] || '').trim()
      if (!dealName) return
      
      const key = `${dealName}|${dealOwner}`
      
      // Find earliest stage entry date (entry month)
      let earliestDate = null
      let earliestMonth = null
      let earliestDateStr = null
      
      for (const [col, stage] of Object.entries(colToStage)) {
        const dateStr = row[col]
        if (dateStr && dateStr.trim() !== '') {
          const date = parseDate(dateStr)
          if (date && (!earliestDate || date < earliestDate)) {
            earliestDate = date
            earliestMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
            earliestDateStr = dateStr
          }
        }
      }
      
      if (earliestMonth) {
        if (!dealsMap.has(key)) {
          dealsMap.set(key, {
            dealName,
            dealOwner,
            entryMonth: earliestMonth,
            entryDate: earliestDateStr,
            converted: false,
            liveDate: null,
          })
        } else {
          // Use earliest entry month
          const existing = dealsMap.get(key)
          if (earliestMonth < existing.entryMonth) {
            existing.entryMonth = earliestMonth
            existing.entryDate = earliestDateStr
          }
        }
      }
      
      // Check if converted (entered live stage)
      const liveStageDate = row[liveStageCol]
      if (liveStageDate && liveStageDate.trim() !== '') {
        if (dealsMap.has(key)) {
          dealsMap.get(key).converted = true
          dealsMap.get(key).liveDate = liveStageDate
        } else {
          // Deal reached Live but has no other stage dates - use Live date as entry
          const date = parseDate(liveStageDate)
          if (date) {
            const entryMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
            dealsMap.set(key, {
              dealName,
              dealOwner,
              entryMonth,
              entryDate: liveStageDate,
              converted: true,
              liveDate: liveStageDate,
            })
          }
        }
      }
    })
    
    const cohortMap = new Map()
    dealsMap.forEach(deal => {
      if (!cohortMap.has(deal.entryMonth)) {
        cohortMap.set(deal.entryMonth, {
          month: deal.entryMonth,
          totalDeals: 0,
          convertedDeals: 0,
          deals: [], // Store deal details for modal
        })
      }
      const cohort = cohortMap.get(deal.entryMonth)
      cohort.totalDeals++
      cohort.deals.push({
        dealName: deal.dealName,
        dealOwner: deal.dealOwner,
        entryDate: deal.entryDate,
        liveDate: deal.liveDate,
        converted: deal.converted,
      })
      if (deal.converted) cohort.convertedDeals++
    })
    
    const cohortList = Array.from(cohortMap.values())
    if (dealsInEntryRangeSet) {
      cohortList.forEach(cohort => {
        cohort.deals = cohort.deals.filter(d => dealsInEntryRangeSet.has(`${d.dealName}|${d.dealOwner}`))
        cohort.totalDeals = cohort.deals.length
        cohort.convertedDeals = cohort.deals.filter(d => d.converted).length
      })
    }
    cohortList.forEach(cohort => {
      cohort.conversionRate = cohort.totalDeals > 0
        ? Math.round((cohort.convertedDeals / cohort.totalDeals) * 1000) / 10
        : 0
      cohort.deals.sort((a, b) => a.dealName.localeCompare(b.dealName))
    })
    const sorted = cohortList.sort((a, b) => a.month.localeCompare(b.month))
    if (dealsInEntryRangeSet) {
      if (entryDateStart || entryDateEnd) {
        const startMonth = entryDateStart ? entryDateStart.slice(0, 7) : null
        const endMonth = entryDateEnd ? entryDateEnd.slice(0, 7) : null
        return sorted.filter(c => {
          if (startMonth && c.month < startMonth) return false
          if (endMonth && c.month > endMonth) return false
          return true
        })
      }
    }
    return sorted
  }, [data, pipeline, dealsInEntryRangeSet, entryDateStart, entryDateEnd])

  const handleCohortRowClick = (cohort) => {
    setCohortModal({
      month: cohort.month,
      deals: cohort.deals,
    })
  }

  const monthlyConversionTrends = useMemo(() => {
    if (!data?.rawRows || !data?.monthLabels?.length || !data?.colToStageDS || !data?.colToStagePM) return []
    
    const colToStage = pipeline === 'Direct Sales' ? data.colToStageDS : data.colToStagePM
    const liveStageShort = pipeline === 'Direct Sales' ? '10 - Live' : 'vi - Live'
    
    // Find column name for live stage
    let liveStageCol = null
    for (const [col, stage] of Object.entries(colToStage)) {
      if (stage === liveStageShort) {
        liveStageCol = col
        break
      }
    }
    
    if (!liveStageCol) return []
    
    const dealsMap = new Map()
    
    // Process rows to find entry month (earliest stage) and conversion month
    data.rawRows.forEach(row => {
      const dealName = String(row['Deal Name'] || '').trim()
      const dealOwner = String(row['Deal owner'] || '').trim()
      if (!dealName) return
      
      const key = `${dealName}|${dealOwner}`
      
      // Find earliest stage entry date (entry month)
      let earliestDate = null
      let earliestMonth = null
      
      for (const [col] of Object.entries(colToStage)) {
        const dateStr = row[col]
        if (dateStr && dateStr.trim() !== '') {
          const date = parseDate(dateStr)
          if (date && (!earliestDate || date < earliestDate)) {
            earliestDate = date
            earliestMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          }
        }
      }
      
      if (earliestMonth) {
        if (!dealsMap.has(key)) {
          dealsMap.set(key, {
            dealName,
            dealOwner,
            entryMonth: earliestMonth,
            convertedMonth: null,
          })
        } else {
          const existing = dealsMap.get(key)
          if (earliestMonth < existing.entryMonth) {
            existing.entryMonth = earliestMonth
          }
        }
      }
      
      // Get conversion month
      const liveStageDate = row[liveStageCol]
      if (liveStageDate && liveStageDate.trim() !== '') {
        const date = parseDate(liveStageDate)
        if (date) {
          const convertedMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          if (dealsMap.has(key)) {
            const deal = dealsMap.get(key)
            if (!deal.convertedMonth || convertedMonth < deal.convertedMonth) {
              deal.convertedMonth = convertedMonth
            }
          } else {
            // Deal reached Live but has no other stage dates - use Live date as entry
            dealsMap.set(key, {
              dealName,
              dealOwner,
              entryMonth: convertedMonth,
              convertedMonth,
            })
          }
        }
      }
    })
    
    // Count unique deals that went live in each specific month
    const dealsWentLiveByMonth = new Map()
    const dealsWentLiveSet = new Map() // Track unique deals per month
    
    data.rawRows.forEach(row => {
      const dealName = String(row['Deal Name'] || '').trim()
      const dealOwner = String(row['Deal owner'] || '').trim()
      if (!dealName) return
      const key = `${dealName}|${dealOwner}`
      if (dealsInEntryRangeSet && !dealsInEntryRangeSet.has(key)) return
      
      const liveStageDate = row[liveStageCol]
      if (liveStageDate && liveStageDate.trim() !== '') {
        const date = parseDate(liveStageDate)
        if (date) {
          const convertedMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          
          if (!dealsWentLiveSet.has(convertedMonth)) {
            dealsWentLiveSet.set(convertedMonth, new Set())
          }
          
          // Only count each deal once per month
          if (!dealsWentLiveSet.get(convertedMonth).has(key)) {
            dealsWentLiveSet.get(convertedMonth).add(key)
            dealsWentLiveByMonth.set(convertedMonth, (dealsWentLiveByMonth.get(convertedMonth) || 0) + 1)
          }
        }
      }
    })
    
    const filteredDeals = dealsInEntryRangeSet
      ? Array.from(dealsMap.values()).filter(d => dealsInEntryRangeSet.has(`${d.dealName}|${d.dealOwner}`))
      : Array.from(dealsMap.values())
    
    const monthList = data.monthLabels
    let monthsToShow = monthList
    if (entryDateStart || entryDateEnd) {
      const startMonth = entryDateStart ? entryDateStart.slice(0, 7) : null
      const endMonth = entryDateEnd ? entryDateEnd.slice(0, 7) : null
      monthsToShow = monthList.filter(m => {
        if (startMonth && m < startMonth) return false
        if (endMonth && m > endMonth) return false
        return true
      })
    }
    
    return monthsToShow.map(month => {
      const dealsEntered = filteredDeals.filter(d => d.entryMonth && d.entryMonth <= month).length
      const dealsConverted = filteredDeals.filter(
        d => d.entryMonth && d.entryMonth <= month && d.convertedMonth && d.convertedMonth <= month
      ).length
      const conversionRate = dealsEntered > 0
        ? Math.round((dealsConverted / dealsEntered) * 1000) / 10
        : 0
      const dealsWentLive = dealsWentLiveByMonth.get(month) || 0
      return { month, dealsEntered, dealsConverted, conversionRate, dealsWentLive }
    })
  }, [data, pipeline, dealsInEntryRangeSet, entryDateStart, entryDateEnd])

  const overallSalesCycle = useMemo(() => {
    if (!data?.rawRows || !data?.colToStageDS || !data?.colToStagePM) return null
    const colToStage = pipeline === 'Direct Sales' ? data.colToStageDS : data.colToStagePM
    const liveStageShort = pipeline === 'Direct Sales' ? '10 - Live' : 'vi - Live'
    let liveStageCol = null
    for (const [col, stage] of Object.entries(colToStage)) {
      if (stage === liveStageShort) { liveStageCol = col; break }
    }
    if (!liveStageCol) return null
    const dealsMap = new Map()
    data.rawRows.forEach(row => {
      const dealName = String(row['Deal Name'] || '').trim()
      const dealOwner = String(row['Deal owner'] || '').trim()
      if (!dealName) return
      const key = `${dealName}|${dealOwner}`
      if (dealsInEntryRangeSet && !dealsInEntryRangeSet.has(key)) return
      let earliestDateStr = null
      for (const [col] of Object.entries(colToStage)) {
        const dateStr = row[col]
        if (dateStr && dateStr.trim() !== '') {
          const date = parseDate(dateStr)
          if (date && (!earliestDateStr || date < parseDate(earliestDateStr))) {
            earliestDateStr = dateStr
          }
        }
      }
      const liveDateStr = row[liveStageCol]
      if (!earliestDateStr || !liveDateStr || !liveDateStr.trim()) return
      const days = daysBetween(earliestDateStr, liveDateStr)
      if (days == null || days < 0) return
      if (!dealsMap.has(key)) {
        dealsMap.set(key, { dealName, dealOwner, days })
      }
    })
    const daysList = Array.from(dealsMap.values()).map(d => d.days).filter(d => d >= 0)
    if (daysList.length === 0) return null
    const sorted = [...daysList].sort((a, b) => a - b)
    const sum = daysList.reduce((a, b) => a + b, 0)
    const avgDays = Math.round(sum / daysList.length)
    const medianDays = sorted.length % 2 === 0
      ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
      : sorted[Math.floor(sorted.length / 2)]
    return {
      avgDays,
      medianDays,
      count: daysList.length,
      minDays: sorted[0],
      maxDays: sorted[sorted.length - 1],
    }
  }, [data, pipeline, dealsInEntryRangeSet])

  const salesCycleCohorts = useMemo(() => {
    if (!data?.rawRows || !data?.colToStageDS || !data?.colToStagePM) return []
    const colToStage = pipeline === 'Direct Sales' ? data.colToStageDS : data.colToStagePM
    const liveStageShort = pipeline === 'Direct Sales' ? '10 - Live' : 'vi - Live'
    let liveStageCol = null
    for (const [col, stage] of Object.entries(colToStage)) {
      if (stage === liveStageShort) { liveStageCol = col; break }
    }
    if (!liveStageCol) return []
    const cohortMap = new Map()
    data.rawRows.forEach(row => {
      const dealName = String(row['Deal Name'] || '').trim()
      const dealOwner = String(row['Deal owner'] || '').trim()
      if (!dealName) return
      const key = `${dealName}|${dealOwner}`
      if (dealsInEntryRangeSet && !dealsInEntryRangeSet.has(key)) return
      let earliestDate = null
      let earliestDateStr = null
      let earliestMonth = null
      for (const [col] of Object.entries(colToStage)) {
        const dateStr = row[col]
        if (dateStr && dateStr.trim() !== '') {
          const date = parseDate(dateStr)
          if (date && (!earliestDate || date < earliestDate)) {
            earliestDate = date
            earliestDateStr = dateStr
            earliestMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          }
        }
      }
      const liveDateStr = row[liveStageCol]
      if (!earliestMonth || !earliestDateStr || !liveDateStr || !liveDateStr.trim()) return
      const days = daysBetween(earliestDateStr, liveDateStr)
      if (days == null || days < 0) return
      if (!cohortMap.has(earliestMonth)) {
        cohortMap.set(earliestMonth, { month: earliestMonth, deals: [] })
      }
      cohortMap.get(earliestMonth).deals.push({
        dealName,
        dealOwner,
        entryDate: earliestDateStr,
        liveDate: liveDateStr,
        days,
      })
    })
    let cohortList = Array.from(cohortMap.values())
    if (entryDateStart || entryDateEnd) {
      const startMonth = entryDateStart ? entryDateStart.slice(0, 7) : null
      const endMonth = entryDateEnd ? entryDateEnd.slice(0, 7) : null
      cohortList = cohortList.filter(c => {
        if (startMonth && c.month < startMonth) return false
        if (endMonth && c.month > endMonth) return false
        return true
      })
    }
    return cohortList.map(c => {
      const daysList = c.deals.map(d => d.days)
      const sorted = [...daysList].sort((a, b) => a - b)
      const sum = daysList.reduce((a, b) => a + b, 0)
      return {
        ...c,
        avgDays: Math.round(sum / daysList.length),
        medianDays: sorted.length % 2 === 0
          ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
          : sorted[Math.floor(sorted.length / 2)],
        count: daysList.length,
        minDays: sorted[0],
        maxDays: sorted[sorted.length - 1],
      }
    }).sort((a, b) => a.month.localeCompare(b.month))
  }, [data, pipeline, dealsInEntryRangeSet, entryDateStart, entryDateEnd])

  const handleSalesCycleCohortClick = (cohort) => {
    setSalesCycleCohortModal({ month: cohort.month, deals: cohort.deals })
  }

  const handleTimeInStageCohortClick = (cohort) => {
    setTimeInStageCohortModal({ month: cohort.month, deals: cohort.deals ?? [] })
  }

  const STAGES_CONFIG_TIME = pipeline === 'Direct Sales'
    ? [['1 - Target', '1 - Target'], ['2 - Qualified', '2 - Qualified'], ['3 - Proposal', '3 - Proposal'], ['4 - Shortlist', '4 - Shortlist'], ['5 - Negotiate', '5 - Negotiate'], ['6 - Contract Out', '6 - Contract Out'], ['7 - Deal Approval', '7 - Deal Approval'], ['8 - Closed Won', '8 - Closed Won'], ['9 - Implementation', '9 - Implementation'], ['10 - Live', '10 - Live']]
    : [['0 - Dormant', '0 - Dormant'], ['i - Identified or Unknown', 'i - Identified or Unknown'], ['ii - Qualified/ Proposal', 'ii - Qualified/Proposal'], ['iii - Negotiation', 'iii - Negotiation'], ['iv - Closed Won', 'iv - Closed Won'], ['v - Implementation', 'v - Implementation'], ['vi - Live', 'vi - Live']]
  const STAGES_FOR_TIME = STAGES_CONFIG_TIME.map(([, d]) => d)

  const timeInStageSummary = useMemo(() => {
    if (!data?.rawRows || !data?.colToStageDS || !data?.colToStagePM) return []
    const colToStage = pipeline === 'Direct Sales' ? data.colToStageDS : data.colToStagePM
    const liveStage = pipeline === 'Direct Sales' ? '10 - Live' : 'vi - Live'
    const liveCol = Object.entries(colToStage).find(([, s]) => s === liveStage)?.[0]
    const stageToCol = {}
    for (const [col, stageShort] of Object.entries(colToStage)) {
      const cfg = STAGES_CONFIG_TIME.find(([short]) => short === stageShort)
      if (cfg) stageToCol[cfg[1]] = col
    }
    const daysByStage = {}
    const dealsByStage = {}
    STAGES_FOR_TIME.forEach(s => { daysByStage[s] = []; dealsByStage[s] = [] })
    data.rawRows.forEach(row => {
      const dealName = String(row['Deal Name'] || '').trim()
      const dealOwner = String(row['Deal owner'] || '').trim()
      const key = `${dealName}|${dealOwner}`
      if (dealsInEntryRangeSet && !dealsInEntryRangeSet.has(key)) return
      const isConverted = liveCol && row[liveCol] && String(row[liveCol]).trim() !== ''
      if (timeInStageDealFilter === 'converted' && !isConverted) return
      if (timeInStageDealFilter === 'notConverted' && isConverted) return
      const entries = []
      STAGES_FOR_TIME.forEach(stage => {
        const col = stageToCol[stage]
        if (col && row[col] && row[col].trim() !== '') {
          const d = parseDate(row[col])
          if (d) entries.push({ stage, date: d, dateStr: row[col].trim() })
        }
      })
      entries.sort((a, b) => a.date - b.date)
      for (let i = 0; i < entries.length - 1; i++) {
        const days = Math.round((entries[i + 1].date - entries[i].date) / (1000 * 60 * 60 * 24))
        if (days >= 0 && daysByStage[entries[i].stage]) {
          daysByStage[entries[i].stage].push(days)
          dealsByStage[entries[i].stage].push({
            dealName,
            dealOwner,
            entryDate: entries[i].dateStr,
            exitDate: entries[i + 1].dateStr,
            days,
          })
        }
      }
    })
    return STAGES_FOR_TIME.map(stage => {
      const arr = daysByStage[stage] || []
      const deals = dealsByStage[stage] || []
      if (arr.length === 0) return { stage, avgDays: null, count: 0, medianDays: null, deals: [] }
      const sorted = [...arr].sort((a, b) => a - b)
      const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
      const median = sorted.length % 2 === 0
        ? Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2)
        : sorted[Math.floor(sorted.length / 2)]
      return { stage, avgDays: avg, count: arr.length, medianDays: median, deals }
    }).filter(s => s.count > 0)
  }, [data, pipeline, dealsInEntryRangeSet, timeInStageDealFilter])

  const timeInStageCohorts = useMemo(() => {
    if (!data?.rawRows || !data?.colToStageDS || !data?.colToStagePM) return []
    const colToStage = pipeline === 'Direct Sales' ? data.colToStageDS : data.colToStagePM
    const liveStage = pipeline === 'Direct Sales' ? '10 - Live' : 'vi - Live'
    const liveCol = Object.entries(colToStage).find(([, s]) => s === liveStage)?.[0]
    const stageToCol = {}
    for (const [col, stageShort] of Object.entries(colToStage)) {
      const cfg = STAGES_CONFIG_TIME.find(([short]) => short === stageShort)
      if (cfg) stageToCol[cfg[1]] = col
    }
    const cohortMap = new Map()
    data.rawRows.forEach(row => {
      const dealName = String(row['Deal Name'] || '').trim()
      const dealOwner = String(row['Deal owner'] || '').trim()
      if (!dealName) return
      const key = `${dealName}|${dealOwner}`
      if (dealsInEntryRangeSet && !dealsInEntryRangeSet.has(key)) return
      const isConverted = liveCol && row[liveCol] && String(row[liveCol]).trim() !== ''
      if (timeInStageDealFilter === 'converted' && !isConverted) return
      if (timeInStageDealFilter === 'notConverted' && isConverted) return
      let entryMonth = null
      let entryDate = null
      const entries = []
      STAGES_FOR_TIME.forEach(stage => {
        const col = stageToCol[stage]
        if (col && row[col] && row[col].trim() !== '') {
          const d = parseDate(row[col])
          if (d) {
            entries.push({ stage, date: d })
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            if (!entryMonth || ym < entryMonth) { entryMonth = ym; entryDate = d }
          }
        }
      })
      if (!entryMonth) return
      if (entryDateStart || entryDateEnd) {
        const startM = entryDateStart ? entryDateStart.slice(0, 7) : null
        const endM = entryDateEnd ? entryDateEnd.slice(0, 7) : null
        if (startM && entryMonth < startM) return
        if (endM && entryMonth > endM) return
      }
      if (!cohortMap.has(entryMonth)) {
        cohortMap.set(entryMonth, { month: entryMonth, daysByStage: {}, deals: [] })
      }
      const cohort = cohortMap.get(entryMonth)
      STAGES_FOR_TIME.forEach(s => { if (!cohort.daysByStage[s]) cohort.daysByStage[s] = [] })
      entries.sort((a, b) => a.date - b.date)
      const dealDaysInStage = {}
      for (let i = 0; i < entries.length - 1; i++) {
        const days = Math.round((entries[i + 1].date - entries[i].date) / (1000 * 60 * 60 * 24))
        if (days >= 0 && cohort.daysByStage[entries[i].stage]) {
          cohort.daysByStage[entries[i].stage].push(days)
          dealDaysInStage[entries[i].stage] = days
        }
      }
      if (Object.keys(dealDaysInStage).length > 0) {
        cohort.deals.push({ dealName, dealOwner, daysInStage: dealDaysInStage })
      }
    })
    return Array.from(cohortMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, c]) => {
        const stageStats = STAGES_FOR_TIME.map(stage => {
          const arr = c.daysByStage[stage] || []
          if (arr.length === 0) return null
          const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)
          return { stage, avgDays: avg, count: arr.length }
        }).filter(Boolean)
        return { month, stageStats, deals: c.deals }
      })
  }, [data, pipeline, dealsInEntryRangeSet, entryDateStart, entryDateEnd, timeInStageDealFilter])

  if (loading) return <div className="loading">Loading data from Google Sheets…</div>
  if (error) {
    return (
      <div className="error">
        <p>{error}</p>
        <p className="hint">
          Make sure the Google Sheets document is publicly accessible and the Sheet ID is correct.
          <br />
          Check the browser console for more details.
        </p>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header app-content-width">
        <div className="header-top">
          <div className="header-left">
            <img
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTJ4lz2AIGPYV-lEuY8XU-ezlAqO5IqACf5sQ&s"
              alt="Token"
              className="logo-img"
              onError={(e) => {
                e.target.onerror = null
                e.target.src = '/token-logo.svg'
              }}
            />
            <div className="title-block">
              <h1>Pipeline Development</h1>
              <p className="header-subtitle">Deal stage breakdown by month – active opportunities across Direct Sales and Partner Management.</p>
            </div>
          </div>
        </div>
        <div className="header-controls">
          <div className="pipeline-tabs">
            <button
              className={`tab ${pipeline === 'Partner Management' ? 'tab-active' : ''}`}
              onClick={() => setPipeline('Partner Management')}
            >
              Partner Management
            </button>
            <button
              className={`tab ${pipeline === 'Direct Sales' ? 'tab-active' : ''}`}
              onClick={() => setPipeline('Direct Sales')}
            >
              Direct Sales
            </button>
          </div>
          <div className="control-group">
            <div className="filter-group">
              <label htmlFor="month-select">Month:</label>
              <select
                id="month-select"
                className="month-select"
                value={selectedMonth ?? 'all'}
                onChange={(e) => setSelectedMonth(e.target.value === 'all' ? 'all' : e.target.value)}
              >
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="data-switcher">
              <span className="data-switcher-label">Show:</span>
              <div className="pipeline-tabs data-switcher-tabs">
                <button
                  className={`tab ${dataType === 'count' ? 'tab-active' : ''}`}
                  onClick={() => setDataType('count')}
                >
                  # Deals
                </button>
                <button
                  className={`tab ${dataType === 'amount' ? 'tab-active' : ''}`}
                  onClick={() => setDataType('amount')}
                >
                  Amount
                </button>
                <button
                  className={`tab ${dataType === 'monthlyTransactions' ? 'tab-active' : ''}`}
                  onClick={() => setDataType('monthlyTransactions')}
                >
                  Monthly transactions
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="filters-row app-content-width">
        <div className="filter-dropdown">
          <button className="filter-dropdown-btn" type="button" onClick={(e) => { e.stopPropagation(); setFilterOpen((f) => (f === 'stage' ? null : 'stage')); }}>
            Deal Stage {includedStages.length === 0 ? '(All)' : `(${includedStages.length} selected)`} ▾
          </button>
          {filterOpen === 'stage' && (
            <div className="filter-dropdown-panel" onClick={(e) => e.stopPropagation()}>
              <span className="filter-hint">Show in graph:</span>
              <label className="filter-check">
                <input
                  type="checkbox"
                  checked={includedStages.length === 0}
                  onChange={() => selectAllStages()}
                />
                All
              </label>
              {stages.map((stage) => (
                <label key={stage} className="filter-check">
                  <input
                    type="checkbox"
                    checked={includedStages.length === 0 || includedStages.includes(stage)}
                    onChange={() => toggleStageIncluded(stage)}
                  />
                  {stage}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="filter-dropdown">
          <button className="filter-dropdown-btn" type="button" onClick={(e) => { e.stopPropagation(); setFilterOpen((f) => (f === 'owner' ? null : 'owner')); }}>
            Deal Owner {selectedOwners.length === 0 ? '(All)' : `(${selectedOwners.length} selected)`} ▾
          </button>
          {filterOpen === 'owner' && (
            <div className="filter-dropdown-panel filter-dropdown-panel--tall" onClick={(e) => e.stopPropagation()}>
              <span className="filter-hint">Show only deals from:</span>
              <label className="filter-check">
                <input
                  type="checkbox"
                  checked={selectedOwners.length === 0}
                  onChange={() => selectAllOwners()}
                />
                All
              </label>
              {allOwners.map((owner) => (
                <label key={owner} className="filter-check">
                  <input
                    type="checkbox"
                    checked={selectedOwners.includes(owner)}
                    onChange={() => toggleOwner(owner)}
                  />
                  {owner}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="filter-dropdown">
          <button className="filter-dropdown-btn" type="button" onClick={(e) => { e.stopPropagation(); setFilterOpen((f) => (f === 'dealName' ? null : 'dealName')); }}>
            Deal Name {selectedDealNames.length === 0 ? '(All)' : `(${selectedDealNames.length} selected)`} ▾
          </button>
          {filterOpen === 'dealName' && (
            <div className="filter-dropdown-panel filter-dropdown-panel--deal-name" onClick={(e) => e.stopPropagation()}>
              <span className="filter-hint">Show only deals:</span>
              <input
                type="text"
                className="filter-search"
                placeholder="Search deal names…"
                value={dealNameSearch}
                onChange={(e) => setDealNameSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <label className="filter-check">
                <input
                  type="checkbox"
                  checked={selectedDealNames.length === 0}
                  onChange={() => selectAllDealNames()}
                />
                All
              </label>
              <div className="filter-list-scroll">
                {allDealNames
                  .filter((name) => !dealNameSearch.trim() || name.toLowerCase().includes(dealNameSearch.trim().toLowerCase()))
                  .map((name) => (
                    <label key={name} className="filter-check filter-check--truncate">
                      <input
                        type="checkbox"
                        checked={selectedDealNames.includes(name)}
                        onChange={() => toggleDealName(name)}
                      />
                      <span title={name}>{name}</span>
                    </label>
                  ))}
              </div>
              {allDealNames.filter((name) => !dealNameSearch.trim() || name.toLowerCase().includes(dealNameSearch.trim().toLowerCase())).length === 0 && (
                <p className="filter-empty">No matching deal names</p>
              )}
            </div>
          )}
        </div>
        <div className="filter-dropdown">
          <button
            className="filter-dropdown-btn"
            type="button"
            onClick={(e) => { e.stopPropagation(); setFilterOpen((f) => (f === 'entryDate' ? null : 'entryDate')); }}
          >
            Pipeline Entry {!(entryDateStart || entryDateEnd) ? '(All)' : `(${entryDateStart || '…'} – ${entryDateEnd || '…'}) ▾`}
          </button>
          {filterOpen === 'entryDate' && (
            <div className="filter-dropdown-panel filter-dropdown-panel--dates" onClick={(e) => e.stopPropagation()}>
              <span className="filter-hint">Show only deals that entered the pipeline between:</span>
              {data?.monthLabels?.length > 0 && (() => {
                const labels = data.monthLabels
                const startIdx = dateToMonthIndex(entryDateStart, labels)
                const endIdx = dateToMonthIndex(entryDateEnd, labels)
                const startVal = startIdx >= 0 ? startIdx : 0
                const endVal = endIdx >= 0 ? endIdx : labels.length - 1
                const safeStartVal = Math.min(startVal, endVal)
                const safeEndVal = Math.max(startVal, endVal)
                return (
                <div className="filter-slider-wrap">
                  <div className="filter-slider-row">
                    <span className="filter-slider-label">Start</span>
                    <input
                      type="range"
                      className="filter-range-input"
                      min={0}
                      max={labels.length - 1}
                      value={safeStartVal}
                      onChange={(e) => {
                        const idx = Number(e.target.value)
                        const currentEnd = endIdx >= 0 ? endIdx : labels.length - 1
                        setEntryDateStart(monthToStartDate(labels[idx]))
                        if (idx > currentEnd) setEntryDateEnd(monthToEndDate(labels[idx]))
                      }}
                    />
                    <span className="filter-slider-value">{formatMonthLabel(labels[safeStartVal])}</span>
                  </div>
                  <div className="filter-slider-row">
                    <span className="filter-slider-label">End</span>
                    <input
                      type="range"
                      className="filter-range-input"
                      min={0}
                      max={labels.length - 1}
                      value={safeEndVal}
                      onChange={(e) => {
                        const idx = Number(e.target.value)
                        const currentStart = startIdx >= 0 ? startIdx : 0
                        setEntryDateEnd(monthToEndDate(labels[idx]))
                        if (idx < currentStart) setEntryDateStart(monthToStartDate(labels[idx]))
                      }}
                    />
                    <span className="filter-slider-value">{formatMonthLabel(labels[safeEndVal])}</span>
                  </div>
                </div>
                )
              })()}
              <div className="filter-date-row">
                <label className="filter-date-label">
                  <span>Start</span>
                  <input
                    type="date"
                    className="filter-date-input"
                    value={entryDateStart}
                    onChange={(e) => setEntryDateStart(e.target.value)}
                  />
                </label>
                <label className="filter-date-label">
                  <span>End</span>
                  <input
                    type="date"
                    className="filter-date-input"
                    value={entryDateEnd}
                    onChange={(e) => setEntryDateEnd(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="filter-date-clear"
                onClick={() => { setEntryDateStart(''); setEntryDateEnd(''); }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      <main className="main app-content-width">
        <div className="card chart-card">
          <h2 className="card-title">Deal Stage Breakdown</h2>
          <p className="card-desc">
            {dataType === 'count'
              ? 'Stacked column chart showing the number of active deals by stage at each month-end.'
              : dataType === 'amount'
              ? 'Stacked column chart showing the total deal amount (USD) by stage at each month-end.'
              : 'Stacked column chart showing the total monthly transactions (txns p.m.) by stage at each month-end.'}{' '}
            Bridge sequencing follows deal flow from early stages to Closed Won / Implementation / Live.
          </p>
          <div className="chart-inner" style={{ minHeight: window.innerWidth <= 768 ? 500 : 750 }}>
            {!rechartsData?.length ? (
              <div className="loading">No data to display.</div>
            ) : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart
                data={rechartsData}
                margin={{ top: 36, right: 30, left: 20, bottom: 160 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={(v) => formatMonthLabel(v)}
                  tick={{ fontSize: 10, fill: '#5c6b7a', fontFamily: "'DM Sans', sans-serif" }}
                  axisLine={{ stroke: '#e0e4e8' }}
                  tickLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={140}
                  interval={xAxisInterval}
                  minTickGap={10}
                  dx={-8}
                  dy={15}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#5c6b7a', fontFamily: "'DM Sans', sans-serif" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={dataType === 'amount' || dataType === 'monthlyTransactions'}
                  tickFormatter={(v) => {
                    if (dataType === 'amount') return formatAmountShort(v)
                    if (dataType === 'monthlyTransactions') return formatNumberShort(v)
                    return v
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid #e0e4e8',
                    borderRadius: 8,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                  formatter={(value, name) => {
                    if (dataType === 'amount') return [formatAmount(value), name]
                    if (dataType === 'monthlyTransactions') return [formatNumber(value), name]
                    return [value, name]
                  }}
                  labelFormatter={(label) => `Month: ${formatMonthLabel(label)}`}
                />
                <Legend
                  wrapperStyle={{ paddingTop: 16 }}
                  layout="horizontal"
                  align="center"
                  verticalAlign="bottom"
                  iconType="square"
                  iconSize={10}
                  formatter={(value) => <span style={{ color: '#2c3e50', fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{value}</span>}
                />
                {visibleStages.map((stage) => (
                  <Bar
                    key={stage}
                    dataKey={stage}
                    stackId="a"
                    fill={colors[stage] ?? '#95A5A6'}
                    name={stage}
                    radius={[0, 0, 0, 0]}
                    onClick={handleBarClick()}
                    style={{ cursor: 'pointer' }}
                  >
                    <LabelList
                      dataKey={stage}
                      position="center"
                      formatter={(val) => {
                        if (val <= 0) return ''
                        if (dataType === 'amount') return formatAmountShort(val)
                        if (dataType === 'monthlyTransactions') return formatNumberShort(val)
                        return val
                      }}
                      style={{ fill: '#1a202c', fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
                    />
                    <LabelList
                      dataKey={(entry) =>
                        entry?._topStage === stage && entry?.total != null ? entry.total : null
                      }
                      position="top"
                      formatter={(val) => {
                        if (val == null) return ''
                        if (dataType === 'amount') return formatAmountShort(val)
                        if (dataType === 'monthlyTransactions') return formatNumberShort(val)
                        return String(val)
                      }}
                      style={{ fill: '#1a202c', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}
                    />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>

          {movementsMonthLabel && (
            <div className="movements-section">
              <h3 className="movements-title">
                Pipeline movements – {movementsMonthLabel}
              </h3>
              <p className="movements-desc">
                Deals that changed stage in this month (from → to).
              </p>
              {pipelineMovements.length === 0 ? (
                <p className="movements-empty">No stage changes in this month.</p>
              ) : (
                <div className="movements-list">
                  {pipelineMovements.map((m, i) => (
                    <div key={i} className="movement-item">
                      <span className="movement-deal" title={m.dealName}>{m.dealName}</span>
                      <span className="movement-owner">{m.dealOwner}</span>
                      <span className="movement-arrow">
                        {m.fromStage ? (
                          <>
                            <span className="movement-from">{m.fromStage}</span>
                            <span className="movement-arrow-icon">→</span>
                          </>
                        ) : (
                          <span className="movement-new">New</span>
                        )}
                        <span className="movement-to">{m.toStage}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Funnel Conversion Metrics Section */}
      {overallConversion && (
        <div className="conversion-section app-content-width">
          <div className="card">
            <h2 className="card-title">Funnel Conversion Metrics</h2>
            <p className="card-desc">
              Conversion analysis showing how deals progress through the funnel. A deal is considered converted when it reaches the "Live" stage.
            </p>
            
            {/* Overall Conversion */}
            <div className="conversion-overall">
              <h3 className="conversion-subtitle">Overall Conversion Rate</h3>
              <div className="conversion-stats">
                <div className="conversion-stat">
                  <div className="conversion-stat-value">{overallConversion.conversionRate}%</div>
                  <div className="conversion-stat-label">Conversion Rate</div>
                </div>
                <div className="conversion-stat">
                  <div className="conversion-stat-value">{overallConversion.convertedDeals}</div>
                  <div className="conversion-stat-label">Deals Converted</div>
                </div>
                <div className="conversion-stat">
                  <div className="conversion-stat-value">{overallConversion.totalDeals}</div>
                  <div className="conversion-stat-label">Total Deals</div>
                </div>
              </div>
            </div>

            {/* Stage-by-Stage Conversion */}
            {stageConversion.length > 0 && (
              <div className="conversion-stages">
                <h3 className="conversion-subtitle">Stage-by-Stage Conversion</h3>
                <div className="conversion-table-wrapper">
                  <table className="conversion-table">
                    <thead>
                      <tr>
                        <th>Stage</th>
                        <th>Deals in Stage</th>
                        <th>Moved to Next</th>
                        <th>Stage Conversion</th>
                        <th>Overall Conversion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stageConversion.map((s, i) => (
                        <tr key={i}>
                          <td className="stage-name">{s.stage}</td>
                          <td>{s.dealsInStage}</td>
                          <td>{s.dealsToNextStage}</td>
                          <td>
                            <span className={`conversion-badge ${s.stageConversion >= 50 ? 'high' : s.stageConversion >= 25 ? 'medium' : 'low'}`}>
                              {s.stageConversion}%
                            </span>
                          </td>
                          <td>
                            <span className={`conversion-badge ${s.overallConversion >= 50 ? 'high' : s.overallConversion >= 25 ? 'medium' : 'low'}`}>
                              {s.overallConversion}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Monthly Conversion Trends */}
            {monthlyConversionTrends.length > 0 && (
              <div className="conversion-trends">
                <h3 className="conversion-subtitle">Monthly Conversion Trends</h3>
                <div className="chart-inner" style={{ minHeight: 300 }}>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={monthlyConversionTrends}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                      <XAxis
                        dataKey="month"
                        tickFormatter={(v) => formatMonthLabel(v)}
                        tick={{ fontSize: 11, fill: '#5c6b7a', fontFamily: "'DM Sans', sans-serif" }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 11, fill: '#5c6b7a', fontFamily: "'DM Sans', sans-serif" }}
                        label={{ value: 'Conversion Rate (%)', angle: -90, position: 'insideLeft' }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11, fill: '#5c6b7a', fontFamily: "'DM Sans', sans-serif" }}
                        label={{ value: 'Deals Went Live', angle: 90, position: 'insideRight' }}
                      />
                      <Tooltip
                        formatter={(value, name) => {
                          if (name === 'Conversion Rate') return [`${value}%`, name]
                          if (name === 'Deals Went Live') return [value, name]
                          return [value, name]
                        }}
                        labelFormatter={(label) => `Month: ${formatMonthLabel(label)}`}
                      />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="conversionRate"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', r: 4 }}
                        name="Conversion Rate"
                      />
                      <Bar
                        yAxisId="right"
                        dataKey="dealsWentLive"
                        fill="#22c55e"
                        name="Deals Went Live"
                        radius={[4, 4, 0, 0]}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Cohort Conversion */}
            {cohortConversion.length > 0 && (
              <div className="conversion-cohorts">
                <h3 className="conversion-subtitle">Cohort Conversion Analysis</h3>
                <div className="conversion-table-wrapper">
                  <table className="conversion-table">
                    <thead>
                      <tr>
                        <th>Entry Month</th>
                        <th>Total Deals</th>
                        <th>Converted</th>
                        <th>Conversion Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cohortConversion.map((c, i) => (
                        <tr key={i} className="cohort-row" onClick={() => handleCohortRowClick(c)} style={{ cursor: 'pointer' }}>
                          <td>{formatMonthLabel(c.month)}</td>
                          <td>{c.totalDeals}</td>
                          <td>{c.convertedDeals}</td>
                          <td>
                            <span className={`conversion-badge ${c.conversionRate >= 50 ? 'high' : c.conversionRate >= 25 ? 'medium' : 'low'}`}>
                              {c.conversionRate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sales Cycle Analysis Section */}
      {overallSalesCycle && (
        <div className="conversion-section app-content-width">
          <div className="card">
            <h2 className="card-title">Sales Cycle Analysis</h2>
            <p className="card-desc">
              Average time from first pipeline stage to Live. Measures how long it takes for deals to complete the funnel.
            </p>
            
            <div className="conversion-overall">
              <h3 className="conversion-subtitle">Overall Sales Cycle</h3>
              <div className="conversion-stats">
                <div className="conversion-stat">
                  <div className="conversion-stat-value">{overallSalesCycle.avgDays}</div>
                  <div className="conversion-stat-label">Avg days to Live</div>
                </div>
                <div className="conversion-stat">
                  <div className="conversion-stat-value">{overallSalesCycle.medianDays}</div>
                  <div className="conversion-stat-label">Median days</div>
                </div>
                <div className="conversion-stat">
                  <div className="conversion-stat-value">{overallSalesCycle.count}</div>
                  <div className="conversion-stat-label">Deals (reached Live)</div>
                </div>
                <div className="conversion-stat">
                  <div className="conversion-stat-value">{overallSalesCycle.minDays} – {overallSalesCycle.maxDays}</div>
                  <div className="conversion-stat-label">Min – Max days</div>
                </div>
              </div>
            </div>

            {salesCycleCohorts.length > 0 && (
              <>
                <div className="conversion-trends">
                  <h3 className="conversion-subtitle">Avg days to Live by entry month</h3>
                  <div className="chart-inner" style={{ minHeight: 480 }}>
                    <ResponsiveContainer width="100%" height={480}>
                      <BarChart data={salesCycleCohorts} margin={{ top: 16, right: 20, left: 20, bottom: 100 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" />
                        <XAxis
                          dataKey="month"
                          tickFormatter={(v) => formatMonthLabel(v)}
                          tick={{ fontSize: 11, fill: '#5c6b7a', fontFamily: "'DM Sans', sans-serif" }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#5c6b7a', fontFamily: "'DM Sans', sans-serif" }}
                          label={{ value: 'Avg days to Live', angle: -90, position: 'insideLeft' }}
                        />
                        <Tooltip
                          formatter={(value) => [value, 'Avg days']}
                          labelFormatter={(label) => `Entry: ${formatMonthLabel(label)}`}
                          contentStyle={{ fontFamily: "'DM Sans', sans-serif" }}
                        />
                        <Bar
                          dataKey="avgDays"
                          fill="#8b5cf6"
                          name="Avg days to Live"
                          radius={[4, 4, 0, 0]}
                        >
                          <LabelList dataKey="avgDays" position="top" style={{ fontSize: 11, fontWeight: 600 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="conversion-cohorts">
                  <h3 className="conversion-subtitle">Sales cycle by entry cohort</h3>
                  <div className="conversion-table-wrapper">
                    <table className="conversion-table">
                      <thead>
                        <tr>
                          <th>Entry Month</th>
                          <th>Deals</th>
                          <th>Avg days</th>
                          <th>Median days</th>
                          <th>Min – Max</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesCycleCohorts.map((c, i) => (
                          <tr key={i} className="cohort-row" onClick={() => handleSalesCycleCohortClick(c)} style={{ cursor: 'pointer' }}>
                            <td>{formatMonthLabel(c.month)}</td>
                            <td>{c.count}</td>
                            <td>{c.avgDays}</td>
                            <td>{c.medianDays}</td>
                            <td>{c.minDays} – {c.maxDays}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Time in Stage Analysis Section */}
      {timeInStageSummary.length > 0 && (
        <div className="conversion-section app-content-width">
          <div className="card">
            <h2 className="card-title">Average Time in Deal Stages</h2>
            <p className="card-desc">
              How many days deals typically spend in each stage before moving to the next. Based on deals that progressed through consecutive stages.
            </p>

            <div className="time-in-stage-filter">
              <span className="time-in-stage-filter-label">Show deals:</span>
              <div className="pipeline-tabs data-switcher-tabs">
                <button
                  className={`tab ${timeInStageDealFilter === 'all' ? 'tab-active' : ''}`}
                  onClick={() => setTimeInStageDealFilter('all')}
                >
                  All
                </button>
                <button
                  className={`tab ${timeInStageDealFilter === 'converted' ? 'tab-active' : ''}`}
                  onClick={() => setTimeInStageDealFilter('converted')}
                >
                  Converted only
                </button>
                <button
                  className={`tab ${timeInStageDealFilter === 'notConverted' ? 'tab-active' : ''}`}
                  onClick={() => setTimeInStageDealFilter('notConverted')}
                >
                  Not converted
                </button>
              </div>
            </div>
            
            <div className="conversion-overall">
              <h3 className="conversion-subtitle">Summary by stage</h3>
              <div className="chart-inner" style={{ minHeight: 400 }}>
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart
                    data={timeInStageSummary}
                    layout="vertical"
                    margin={{ top: 16, right: 40, left: 120, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#edf2f7" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#5c6b7a', fontFamily: "'DM Sans', sans-serif" }}
                      label={{ value: 'Avg days', position: 'insideBottom', offset: -8 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="stage"
                      width={110}
                      tick={{ fontSize: 11, fill: '#5c6b7a', fontFamily: "'DM Sans', sans-serif" }}
                    />
                    <Tooltip
                      formatter={(value, name, { payload }) => {
                        if (name === 'Median') return [`${value} days`, 'Median']
                        return [`${value} days (${payload?.count ?? 0} deals)`, payload?.stage ?? '']
                      }}
                      contentStyle={{ fontFamily: "'DM Sans', sans-serif" }}
                    />
                    <Bar
                      dataKey="avgDays"
                      fill="#06b6d4"
                      name="Avg days"
                      radius={[0, 4, 4, 0]}
                      onClick={(data, index) => {
                        const payload = timeInStageSummary[index]
                        if (payload) setTimeInStageBarModal({ stage: payload.stage, deals: payload.deals ?? [], avgDays: payload.avgDays, medianDays: payload.medianDays })
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <LabelList dataKey="avgDays" position="right" style={{ fontSize: 11, fontWeight: 600 }} formatter={(v) => `${v}d`} />
                    </Bar>
                    <Legend formatter={(value) => <span style={{ fontSize: 12, color: '#4a5568' }}>{value}</span>} />
                    <Scatter
                      dataKey="medianDays"
                      fill="#e11d48"
                      name="Median"
                      shape="circle"
                      r={5}
                      onClick={(data, index) => {
                        const payload = timeInStageSummary[index]
                        if (payload) setTimeInStageBarModal({ stage: payload.stage, deals: payload.deals ?? [], avgDays: payload.avgDays, medianDays: payload.medianDays })
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="time-in-stage-chart-hint">
                <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#e11d48', verticalAlign: 'middle' }} /> Median (click bar for details)</span>
              </p>
              <div className="conversion-table-wrapper" style={{ marginTop: 24 }}>
                <table className="conversion-table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Avg days</th>
                      <th>Median days</th>
                      <th>Deals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeInStageSummary.map((s, i) => (
                      <tr key={i}>
                        <td className="stage-name">{s.stage}</td>
                        <td>{s.avgDays}</td>
                        <td>{s.medianDays ?? '–'}</td>
                        <td>{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {timeInStageCohorts.length > 0 && (
              <div className="conversion-cohorts">
                <h3 className="conversion-subtitle">Time in stage by entry cohort</h3>
                <div className="conversion-table-wrapper">
                  <table className="conversion-table conversion-table--time-cohort">
                    <thead>
                      <tr>
                        <th>Entry Month</th>
                        {STAGES_FOR_TIME.map((s, i) => (
                          <th key={i}>{s.split(' - ')[0]}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {timeInStageCohorts.map((c, i) => (
                        <tr key={i} className="cohort-row" onClick={() => handleTimeInStageCohortClick(c)} style={{ cursor: 'pointer' }}>
                          <td>{formatMonthLabel(c.month)}</td>
                          {STAGES_FOR_TIME.map((stage, j) => {
                            const stat = c.stageStats?.find(x => x.stage === stage)
                            return (
                              <td key={j} title={stat ? `${stat.count} deals` : ''}>
                                {stat ? `${stat.avgDays}d` : '–'}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Time in Stage Bar Details Modal */}
      {timeInStageBarModal && (
        <div className="modal-overlay" onClick={() => setTimeInStageBarModal(null)}>
          <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Time in stage – {timeInStageBarModal.stage}</h3>
              <button className="modal-close" onClick={() => setTimeInStageBarModal(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <div className="conversion-table-wrapper">
                <table className="deal-table">
                  <thead>
                    <tr>
                      <th>Deal Name</th>
                      <th>Deal Owner</th>
                      <th>Entered</th>
                      <th>Exited</th>
                      <th>Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(timeInStageBarModal.deals ?? [])].sort((a, b) => a.days - b.days).map((d, i) => (
                      <tr key={i}>
                        <td>{d.dealName}</td>
                        <td>{d.dealOwner}</td>
                        <td>{d.entryDate ? formatDate(d.entryDate) : '–'}</td>
                        <td>{d.exitDate ? formatDate(d.exitDate) : '–'}</td>
                        <td>{d.days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="time-in-stage-modal-summary">
                <span><strong>Average:</strong> {timeInStageBarModal.avgDays ?? '–'} days</span>
                <span><strong>Median:</strong> {timeInStageBarModal.medianDays ?? '–'} days</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Time in Stage Cohort Details Modal */}
      {timeInStageCohortModal && (
        <div className="modal-overlay" onClick={() => setTimeInStageCohortModal(null)}>
          <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Time in stage – {formatMonthLabel(timeInStageCohortModal.month)}</h3>
              <button className="modal-close" onClick={() => setTimeInStageCohortModal(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <p className="cohort-summary">
                {timeInStageCohortModal.deals.length} deal{timeInStageCohortModal.deals.length !== 1 ? 's' : ''} entered the pipeline in {formatMonthLabel(timeInStageCohortModal.month)}. Days spent in each stage.
              </p>
              <div className="conversion-table-wrapper">
                <table className="deal-table conversion-table--time-cohort">
                  <thead>
                    <tr>
                      <th>Deal Name</th>
                      <th>Deal Owner</th>
                      {STAGES_FOR_TIME.map((s, i) => (
                        <th key={i}>{s.split(' - ')[0]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...timeInStageCohortModal.deals].sort((a, b) => a.dealName.localeCompare(b.dealName)).map((d, i) => (
                      <tr key={i}>
                        <td className="stage-name">{d.dealName}</td>
                        <td>{d.dealOwner}</td>
                        {STAGES_FOR_TIME.map((stage, j) => (
                          <td key={j}>{d.daysInStage?.[stage] != null ? `${d.daysInStage[stage]}d` : '–'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sales Cycle Cohort Details Modal */}
      {salesCycleCohortModal && (
        <div className="modal-overlay" onClick={() => setSalesCycleCohortModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Sales cycle – {formatMonthLabel(salesCycleCohortModal.month)}</h3>
              <button className="modal-close" onClick={() => setSalesCycleCohortModal(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <p className="cohort-summary">
                {salesCycleCohortModal.deals.length} deal{salesCycleCohortModal.deals.length !== 1 ? 's' : ''} reached Live from this entry month.
              </p>
              <table className="deal-table">
                <thead>
                  <tr>
                    <th>Deal Name</th>
                    <th>Deal Owner</th>
                    <th>Entry Date</th>
                    <th>Went Live</th>
                    <th>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {[...salesCycleCohortModal.deals].sort((a, b) => a.days - b.days).map((d, i) => (
                    <tr key={i}>
                      <td>{d.dealName}</td>
                      <td>{d.dealOwner}</td>
                      <td>{d.entryDate ? formatDate(d.entryDate) : '-'}</td>
                      <td>{d.liveDate ? formatDate(d.liveDate) : '-'}</td>
                      <td>{d.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Cohort Details Modal */}
      {cohortModal && (
        <div className="modal-overlay" onClick={() => setCohortModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cohort Details – {formatMonthLabel(cohortModal.month)}</h3>
              <button className="modal-close" onClick={() => setCohortModal(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <p className="cohort-summary">
                {cohortModal.deals.length} deal{cohortModal.deals.length !== 1 ? 's' : ''} entered the pipeline in {formatMonthLabel(cohortModal.month)}.
                {cohortModal.deals.filter(d => d.converted).length > 0 && (
                  <span> {cohortModal.deals.filter(d => d.converted).length} of them reached Live.</span>
                )}
              </p>
              <table className="deal-table">
                <thead>
                  <tr>
                    <th>Deal Name</th>
                    <th>Deal Owner</th>
                    <th>Entry Date</th>
                    <th>Went Live</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortModal.deals.map((d, i) => (
                    <tr key={i}>
                      <td>{d.dealName}</td>
                      <td>{d.dealOwner}</td>
                      <td>{d.entryDate ? formatDate(d.entryDate) : '-'}</td>
                      <td>{d.liveDate ? formatDate(d.liveDate) : '-'}</td>
                      <td>
                        {d.converted ? (
                          <span className="status-badge converted">Converted</span>
                        ) : (
                          <span className="status-badge not-converted">Not Converted</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Deals – {formatMonthLabel(modal.month)}</h3>
              <button className="modal-close" onClick={() => setModal(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <table className="deal-table">
                <thead>
                  <tr>
                    <th>Deal Name</th>
                    <th>Deal Stage</th>
                    <th>Deal Owner</th>
                    <th>Date Entered Stage</th>
                    <th>Amount</th>
                    <th>Monthly Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {modal.deals.map((d, i) => (
                    <tr key={i}>
                      <td>{d.dealName}</td>
                      <td>{d.dealStage}</td>
                      <td>{d.dealOwner}</td>
                      <td>{d.dateEnteredStage || '-'}</td>
                      <td>{formatAmount(d.amount)}</td>
                      <td>{formatNumber(d.monthlyTransactions || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {modal.deals.length === 0 && (
                <p className="modal-empty">
                  {modal.needsRefresh
                    ? "Deal details not available. Run 'python pipeline_dashboard.py' to regenerate data with drill-down."
                    : "No deals in this segment."}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

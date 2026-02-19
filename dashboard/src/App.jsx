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

function computeChartFromDealDetails(dealDetails, monthLabels, stages, selectedOwners, selectedDealNames, includedStages, metric = 'count') {
  if (!dealDetails || !monthLabels?.length || !stages?.length) return []
  const ownerSet = selectedOwners?.length ? new Set(selectedOwners) : null
  const dealNameSet = selectedDealNames?.length ? new Set(selectedDealNames) : null
  const includeSet = includedStages?.length ? new Set(includedStages) : null
  const stagesOrder = includeSet ? stages.filter((s) => includeSet.has(s)) : stages
  const matchDeal = (d) => {
    if (ownerSet && !ownerSet.has(d.dealOwner)) return false
    if (dealNameSet && !dealNameSet.has(d.dealName)) return false
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

  useEffect(() => {
    setIncludedStages([])
    setSelectedOwners([])
    setSelectedDealNames([])
    setDealNameSearch('')
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

  const allRechartsData = useMemo(() => {
    const needsDealDetails =
      dataType === 'amount' || dataType === 'monthlyTransactions' || selectedOwners.length > 0 || selectedDealNames.length > 0
    if (needsDealDetails && dealDetails) {
      return computeChartFromDealDetails(
        dealDetails,
        data?.monthLabels ?? [],
        stages,
        selectedOwners,
        selectedDealNames,
        includedStages,
        dataType
      )
    }
    if (dataType === 'amount' || dataType === 'monthlyTransactions') return [] // these modes need dealDetails
    return toRechartsFormat(chartData ?? [], data?.monthLabels ?? [], includedStages)
  }, [chartData, data?.monthLabels, dealDetails, selectedOwners, selectedDealNames, includedStages, stages, dataType])

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

    const prevStageByDeal = new Map()
    if (prevMonth) {
      const prevData = dealDetails[prevMonth] || {}
      visibleStagesList.forEach((stage) => {
        ;(prevData[stage] || []).forEach((d) => {
          if (ownerSet && !ownerSet.has(d.dealOwner)) return
          if (dealNameSet && !dealNameSet.has(d.dealName)) return
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
  ])

  const movementsMonthLabel = useMemo(() => {
    if (!data?.monthLabels?.length) return null
    const m =
      selectedMonth && selectedMonth !== 'all'
        ? selectedMonth
        : data.monthLabels[data.monthLabels.length - 1]
    return formatMonthLabel(m)
  }, [data?.monthLabels, selectedMonth])

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
      <header className="header">
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
        <div className="header-right">
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
        </div>
      </header>

      <div className="filters-row">
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
      </div>

      <main className="main">
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
          <div className="chart-inner" style={{ minHeight: 750 }}>
            {!rechartsData?.length ? (
              <div className="loading">No data to display.</div>
            ) : (
            <ResponsiveContainer width="100%" height={750}>
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

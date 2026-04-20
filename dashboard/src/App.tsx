import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import clsx from 'clsx'
import { Panel } from './components/Panel'
import { Metric, MetricInline } from './components/Metric'
import { StatusIndicator, StatusBar } from './components/StatusIndicator'
import { SettingsModal } from './components/SettingsModal'
import { SetupWizard } from './components/SetupWizard'
import { LineChart, Sparkline } from './components/LineChart'
import { NotificationBell } from './components/NotificationBell'
import { Tooltip, TooltipContent } from './components/Tooltip'
import { getActionabilityView } from './utils/signalActionability'
import { getApiBase, hasWorkerApiBaseUrl } from './apiBase'
import type {
  Status,
  Config,
  ExperimentRun,
  ExperimentSummary,
  LogEntry,
  Signal,
  Position,
  SignalResearch,
  PortfolioSnapshot,
  SignalActionability,
} from './types'

/** URL for curl hint: matches what the app targets (Worker URL when built for hosted, else local wrangler port). */
function getAgentEnableUrlForHint(): string {
  const base = getApiBase()
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return `${base.replace(/\/$/, '')}/enable`
  }
  const port = import.meta.env.VITE_WRANGLER_PORT || '8787'
  return `http://localhost:${port}/agent/enable`
}

function isHostedSiteMissingWorkerUrl(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  const isLocal = h === 'localhost' || h === '127.0.0.1'
  if (isLocal) return false
  return !hasWorkerApiBaseUrl()
}

function getApiToken(): string {
  return localStorage.getItem('mahoraga_api_token') || ''
}

function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getApiToken()
  const headers = new Headers(options.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(url, { ...options, headers })
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function getAgentColor(agent: string): string {
  const colors: Record<string, string> = {
    'Analyst': 'text-hud-purple',
    'Executor': 'text-hud-cyan',
    'StockTwits': 'text-hud-success',
    'SignalResearch': 'text-hud-cyan',
    'PositionResearch': 'text-hud-purple',
    'Crypto': 'text-hud-warning',
    'System': 'text-hud-text-dim',
  }
  return colors[agent] || 'text-hud-text'
}

function isCryptoSymbol(symbol: string, cryptoSymbols: string[] = []): boolean {
  const upperSymbol = symbol.toUpperCase()
  const matchesConfig = cryptoSymbols.some(cs => {
    const normalizedConfig = cs.toUpperCase()
    if (upperSymbol === normalizedConfig) return true
    const baseSymbol = normalizedConfig.split('/')[0]
    const quoteSymbol = normalizedConfig.split('/')[1] || 'USD'
    return upperSymbol === `${baseSymbol}${quoteSymbol}`
  })
  return matchesConfig || /^[A-Z]{2,5}\/(USD|USDT|USDC)$/.test(upperSymbol)
}

function formatCryptoSymbol(symbol: string, cryptoSymbols: string[] = []): string {
  if (symbol.includes('/')) return symbol
  const upperSymbol = symbol.toUpperCase()
  for (const cs of cryptoSymbols) {
    const baseSymbol = cs.split('/')[0].toUpperCase()
    if (upperSymbol.startsWith(baseSymbol)) {
      const quote = upperSymbol.slice(baseSymbol.length)
      if (quote.length >= 3 && ['USD', 'USDT', 'USDC'].includes(quote)) {
        return `${baseSymbol}/${quote}`
      }
    }
  }
  const match = upperSymbol.match(/^([A-Z]{2,5})(USD|USDT|USDC)$/)
  if (match) return `${match[1]}/${match[2]}`
  return symbol
}

function getVerdictColor(verdict: string): string {
  if (verdict === 'BUY') return 'text-hud-success'
  if (verdict === 'SKIP') return 'text-hud-error'
  return 'text-hud-warning'
}

function getQualityColor(quality: string): string {
  if (quality === 'excellent') return 'text-hud-success'
  if (quality === 'good') return 'text-hud-primary'
  if (quality === 'fair') return 'text-hud-warning'
  return 'text-hud-error'
}

function getSentimentColor(score: number): string {
  if (score >= 0.3) return 'text-hud-success'
  if (score <= -0.2) return 'text-hud-error'
  return 'text-hud-warning'
}

async function fetchPortfolioHistory(period: string = '1D'): Promise<PortfolioSnapshot[]> {
  try {
    const timeframe = period === '1D' ? '15Min' : '1D'
    const intraday = period === '1D' ? '&intraday_reporting=extended_hours' : ''
    const res = await authFetch(`${getApiBase()}/history?period=${period}&timeframe=${timeframe}${intraday}`)
    const data = await res.json()
    if (data.ok && data.data?.snapshots) {
      return data.data.snapshots
    }
    return []
  } catch {
    return []
  }
}

// Generate mock price history for positions
function generateMockPriceHistory(currentPrice: number, unrealizedPl: number, points: number = 20): number[] {
  const prices: number[] = []
  const isPositive = unrealizedPl >= 0
  const startPrice = currentPrice * (isPositive ? 0.95 : 1.05)
  
  for (let i = 0; i < points; i++) {
    const progress = i / (points - 1)
    const trend = startPrice + (currentPrice - startPrice) * progress
    const noise = trend * (Math.random() - 0.5) * 0.02
    prices.push(trend + noise)
  }
  prices[prices.length - 1] = currentPrice
  return prices
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [setupChecked, setSetupChecked] = useState(false)
  const [time, setTime] = useState(new Date())
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioSnapshot[]>([])
  const [portfolioPeriod, setPortfolioPeriod] = useState<'1D' | '1W' | '1M'>('1D')
  const [experimentSummaries, setExperimentSummaries] = useState<ExperimentSummary[]>([])
  const [activeExperimentId, setActiveExperimentId] = useState<string | null>(null)
  const [experimentRunDetail, setExperimentRunDetail] = useState<ExperimentRun | null>(null)

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await authFetch(`${getApiBase()}/setup/status`)
        const data = await res.json()
        if (data.ok && !data.data.configured) {
          setShowSetup(true)
        }
        setSetupChecked(true)
      } catch {
        setSetupChecked(true)
      }
    }
    checkSetup()
  }, [])

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await authFetch(`${getApiBase()}/status`)
        const data = await res.json()
        if (data.ok) {
          setStatus(data.data)
          setError(null)
        } else {
          setError(data.error || 'Failed to fetch status')
        }
      } catch {
        setError('Connection failed - is the agent running?')
      }
    }

    if (setupChecked && !showSetup) {
      fetchStatus()
      const interval = setInterval(fetchStatus, 5000)
      const timeInterval = setInterval(() => setTime(new Date()), 1000)

      return () => {
        clearInterval(interval)
        clearInterval(timeInterval)
      }
    }
  }, [setupChecked, showSetup])

  useEffect(() => {
    if (!setupChecked || showSetup) return

    const fetchExperiments = async () => {
      try {
        const res = await authFetch(`${getApiBase()}/experiments`)
        const data = await res.json()
        if (data.ok && data.data) {
          setExperimentSummaries(data.data.experiments || [])
          setActiveExperimentId(data.data.activeExperimentId || null)
        }
      } catch {
        // Keep dashboard resilient if experiments endpoint is temporarily unavailable.
      }
    }

    fetchExperiments()
    const experimentInterval = setInterval(fetchExperiments, 10000)
    return () => clearInterval(experimentInterval)
  }, [setupChecked, showSetup])

  useEffect(() => {
    if (!setupChecked || showSetup) return

    const loadPortfolioHistory = async () => {
      const history = await fetchPortfolioHistory(portfolioPeriod)
      if (history.length > 0) {
        setPortfolioHistory(history)
      }
    }

    loadPortfolioHistory()
    const historyInterval = setInterval(loadPortfolioHistory, 60000)
    return () => clearInterval(historyInterval)
  }, [setupChecked, showSetup, portfolioPeriod])

  useEffect(() => {
    const id = activeExperimentId || experimentSummaries.find((run) => run.status === 'completed')?.id
    if (!id) {
      setExperimentRunDetail(null)
      return
    }

    const fetchExperimentDetail = async () => {
      try {
        const res = await authFetch(`${getApiBase()}/experiments/${id}`)
        const data = await res.json()
        if (data.ok) {
          setExperimentRunDetail(data.data || null)
        }
      } catch {
        // Non-blocking; panel will show whichever data is available.
      }
    }

    fetchExperimentDetail()
  }, [activeExperimentId, experimentSummaries])

  const handleSaveConfig = async (config: Config) => {
    const res = await authFetch(`${getApiBase()}/config`, {
      method: 'POST',
      body: JSON.stringify(config),
    })
    const data = await res.json()
    if (data.ok && status) {
      setStatus({ ...status, config: data.data })
    }
  }

  // Derived state (must stay above early returns per React hooks rules)
  const account = status?.account
  const positions = status?.positions || []
  const signals = status?.signals || []
  const signalActionability: Record<string, SignalActionability> = status?.signalActionability || {}
  const actionableSignals = status?.actionableSignals || []
  const logs = status?.logs || []
  const costs = status?.costs || { total_usd: 0, calls: 0, tokens_in: 0, tokens_out: 0 }
  const config = status?.config
  const activeExperiment = useMemo(
    () => experimentSummaries.find((run) => run.id === activeExperimentId) || null,
    [experimentSummaries, activeExperimentId]
  )
  const latestCompletedExperiment = useMemo(
    () => experimentSummaries.find((run) => run.status === 'completed') || null,
    [experimentSummaries]
  )
  const experimentForView = activeExperiment || latestCompletedExperiment
  const baselineSnapshot = experimentRunDetail
    ? experimentRunDetail.snapshots.find((s) => s.id === experimentRunDetail.baseline_snapshot_id) || null
    : null
  const latestSnapshot = experimentRunDetail
    ? experimentRunDetail.snapshots[experimentRunDetail.snapshots.length - 1] || null
    : null
  const actionableSymbols = new Set(actionableSignals.map((s: Signal) => s.symbol))
  const actionableSignalCount = signals.filter((s: Signal) => actionableSymbols.has(s.symbol)).length
  const isMarketOpen = status?.clock?.is_open ?? false

  const startingEquity = config?.starting_equity || 100000
  const unrealizedPl = positions.reduce((sum, p) => sum + p.unrealized_pl, 0)
  const totalPl = account ? account.equity - startingEquity : 0
  const realizedPl = totalPl - unrealizedPl
  const totalPlPct = account ? (totalPl / startingEquity) * 100 : 0

  // Color palette for position lines (distinct colors for each stock)
  const positionColors = ['cyan', 'purple', 'yellow', 'blue', 'green'] as const

  // Generate mock price histories for positions (stable per session via useMemo)
  const positionPriceHistories = useMemo(() => {
    const histories: Record<string, number[]> = {}
    positions.forEach(pos => {
      histories[pos.symbol] = generateMockPriceHistory(pos.current_price, pos.unrealized_pl)
    })
    return histories
  }, [positions.map(p => p.symbol).join(',')])

  // Chart data derived from portfolio history
  const portfolioChartData = useMemo(() => {
    return portfolioHistory.map(s => s.equity)
  }, [portfolioHistory])

  const portfolioChartLabels = useMemo(() => {
    return portfolioHistory.map(s => {
      const date = new Date(s.timestamp)
      if (portfolioPeriod === '1D') {
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
      }
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    })
  }, [portfolioHistory, portfolioPeriod])

  const { marketMarkers, marketHoursZone } = useMemo(() => {
    if (portfolioPeriod !== '1D' || portfolioHistory.length === 0) {
      return { marketMarkers: undefined, marketHoursZone: undefined }
    }
    
    const markers: { index: number; label: string; color?: string }[] = []
    let openIndex = -1
    let closeIndex = -1
    
    portfolioHistory.forEach((s, i) => {
      const date = new Date(s.timestamp)
      const hours = date.getHours()
      const minutes = date.getMinutes()
      
      if (hours === 9 && minutes >= 30 && minutes < 45 && openIndex === -1) {
        openIndex = i
        markers.push({ index: i, label: 'OPEN', color: 'var(--color-hud-success)' })
      } else if (hours === 16 && minutes === 0 && closeIndex === -1) {
        closeIndex = i
        markers.push({ index: i, label: 'CLOSE', color: 'var(--color-hud-error)' })
      }
    })
    
    const zone = openIndex >= 0 && closeIndex >= 0 
      ? { openIndex, closeIndex } 
      : undefined
    
    return { 
      marketMarkers: markers.length > 0 ? markers : undefined,
      marketHoursZone: zone
    }
  }, [portfolioHistory, portfolioPeriod])

  // Normalize position price histories to % change for stacked comparison view
  const normalizedPositionSeries = useMemo(() => {
    return positions.map((pos, idx) => {
      const priceHistory = positionPriceHistories[pos.symbol] || []
      if (priceHistory.length < 2) return null
      const startPrice = priceHistory[0]
      // Convert to % change from start
      const normalizedData = priceHistory.map(price => ((price - startPrice) / startPrice) * 100)
      return {
        label: pos.symbol,
        data: normalizedData,
        variant: positionColors[idx % positionColors.length],
      }
    }).filter(Boolean) as { label: string; data: number[]; variant: typeof positionColors[number] }[]
  }, [positions, positionPriceHistories])

  // Early returns (after all hooks)
  if (showSetup) {
    return <SetupWizard onComplete={() => setShowSetup(false)} />
  }

  if (error && !status) {
    const isAuthError = error.includes('Unauthorized')
    return (
      <div className="min-h-screen bg-hud-bg flex items-center justify-center p-6">
        <Panel title={isAuthError ? "AUTHENTICATION REQUIRED" : "CONNECTION ERROR"} className="max-w-md w-full">
          <div className="text-center py-8">
            <div className="text-hud-error text-2xl mb-4">{isAuthError ? "NO TOKEN" : "OFFLINE"}</div>
            <p className="text-hud-text-dim text-sm mb-6">{error}</p>
            {isAuthError ? (
              <div className="space-y-4">
                <div className="text-left bg-hud-panel p-4 border border-hud-line">
                  <label className="hud-label block mb-2">API Token</label>
                  <input
                    type="password"
                    className="hud-input w-full mb-2"
                    placeholder="Enter MAHORAGA_API_TOKEN"
                    defaultValue={localStorage.getItem('mahoraga_api_token') || ''}
                    onChange={(e) => localStorage.setItem('mahoraga_api_token', e.target.value)}
                  />
                  <button 
                    onClick={() => window.location.reload()}
                    className="hud-button w-full"
                  >
                    Save & Reload
                  </button>
                  <button
                    onClick={() => {
                      localStorage.removeItem('mahoraga_api_token')
                      window.location.reload()
                    }}
                    className="hud-button w-full mt-2"
                  >
                    Clear Saved Token
                  </button>
                  <p className="text-[10px] text-hud-text-dim mt-2">
                    Stored only in this browser localStorage.
                  </p>
                </div>
                <p className="text-hud-text-dim text-xs">
                  Find your token in <code className="text-hud-primary">.dev.vars</code> (local) or Cloudflare secrets (deployed)
                </p>
              </div>
            ) : (
              <div className="text-hud-text-dim text-xs text-left space-y-3">
                {isHostedSiteMissingWorkerUrl() ? (
                  <p className="bg-hud-panel border border-hud-warning/40 p-3 text-[11px] leading-relaxed">
                    <span className="text-hud-warning font-semibold block mb-1">Hosted site missing Worker API URL</span>
                    Set <code className="text-hud-primary">VITE_MAHORAGA_API_BASE</code> (or{' '}
                    <code className="text-hud-primary">MAHORAGA_PUBLIC_API_BASE</code>) in Cloudflare Pages → Settings →
                    Variables to <code className="text-hud-primary break-all">https://&lt;your-worker&gt;.workers.dev/agent</code>{' '}
                    for <strong>Preview</strong> and <strong>Production</strong>, then redeploy. The Pages Function{' '}
                    <code className="text-hud-primary">/mahoraga-runtime-config</code> reads those values at runtime.
                  </p>
                ) : null}
                <p>
                  <span className="block text-[10px] text-hud-text-dim mb-1">API base for this build</span>
                  <code className="text-hud-primary break-all text-[11px] block">
                    {(() => {
                      const base = getApiBase()
                      return base.startsWith('http')
                        ? base
                        : typeof window !== 'undefined' &&
                            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
                          ? `${base} (Vite) → http://localhost:${import.meta.env.VITE_WRANGLER_PORT || '8787'}/agent`
                          : `${base} — no dev proxy on this host; set Pages variables above`
                    })()}
                  </code>
                </p>
                <p>
                  <span className="block mb-1">Enable the agent (run in a terminal; Worker must be running):</span>
                  <code className="text-hud-primary break-all text-[10px] block">
                    curl -H &quot;Authorization: Bearer $TOKEN&quot; {getAgentEnableUrlForHint()}
                  </code>
                </p>
              </div>
            )}
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-hud-bg">
      <div className="max-w-[1920px] mx-auto p-4">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 pb-3 border-b border-hud-line">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-xl md:text-2xl font-light tracking-tight text-hud-text-bright">
                MAHORAGA
              </span>
              <span className="hud-label">v2</span>
            </div>
            <StatusIndicator 
              status={isMarketOpen ? 'active' : 'inactive'} 
              label={isMarketOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
              pulse={isMarketOpen}
            />
          </div>
          <div className="flex items-center gap-3 md:gap-6 flex-wrap">
            <StatusBar
              items={[
                { label: 'LLM COST', value: `$${costs.total_usd.toFixed(4)}`, status: costs.total_usd > 1 ? 'warning' : 'active' },
                { label: 'API CALLS', value: costs.calls.toString() },
              ]}
            />
            <NotificationBell 
              overnightActivity={status?.overnightActivity}
              premarketPlan={status?.premarketPlan}
            />
            <button 
              className="hud-label hover:text-hud-primary transition-colors"
              onClick={() => setShowSettings(true)}
            >
              [CONFIG]
            </button>
            <span className="hud-value-sm font-mono">
              {time.toLocaleTimeString('en-US', { hour12: false })}
            </span>
          </div>
        </header>

        <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-4">
          {/* Row 1: Account, Positions, LLM Costs */}
          <div className="col-span-4 md:col-span-4 lg:col-span-3">
            <Panel title="ACCOUNT" className="h-full">
              {account ? (
                <div className="space-y-4">
                  <Metric label="EQUITY" value={formatCurrency(account.equity)} size="xl" />
                  <div className="grid grid-cols-2 gap-4">
                    <Metric label="CASH" value={formatCurrency(account.cash)} size="md" />
                    <Metric label="BUYING POWER" value={formatCurrency(account.buying_power)} size="md" />
                  </div>
                  <div className="pt-2 border-t border-hud-line space-y-2">
                    <Metric 
                      label="TOTAL P&L" 
                      value={`${formatCurrency(totalPl)} (${formatPercent(totalPlPct)})`}
                      size="md"
                      color={totalPl >= 0 ? 'success' : 'error'}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <MetricInline 
                        label="REALIZED" 
                        value={formatCurrency(realizedPl)}
                        color={realizedPl >= 0 ? 'success' : 'error'}
                      />
                      <MetricInline 
                        label="UNREALIZED" 
                        value={formatCurrency(unrealizedPl)}
                        color={unrealizedPl >= 0 ? 'success' : 'error'}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-hud-text-dim text-sm">Loading...</div>
              )}
            </Panel>
          </div>

          <div className="col-span-4 md:col-span-4 lg:col-span-5">
            <Panel title="POSITIONS" titleRight={`${positions.length}/${config?.max_positions || 5}`} className="h-full">
              {positions.length === 0 ? (
                <div className="text-hud-text-dim text-sm py-8 text-center">No open positions</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-hud-line/50">
                        <th className="hud-label text-left py-2 px-2">Symbol</th>
                        <th className="hud-label text-right py-2 px-2 hidden sm:table-cell">Qty</th>
                        <th className="hud-label text-right py-2 px-2 hidden md:table-cell">Value</th>
                        <th className="hud-label text-right py-2 px-2">P&L</th>
                        <th className="hud-label text-center py-2 px-2">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((pos: Position) => {
                        const plPct = (pos.unrealized_pl / (pos.market_value - pos.unrealized_pl)) * 100
                        const priceHistory = positionPriceHistories[pos.symbol] || []
                        const posEntry = status?.positionEntries?.[pos.symbol]
                        const staleness = status?.stalenessAnalysis?.[pos.symbol]
                        const holdTime = posEntry ? Math.floor((Date.now() - posEntry.entry_time) / 3600000) : null
                        
                        return (
                          <motion.tr 
                            key={pos.symbol}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="border-b border-hud-line/20 hover:bg-hud-line/10"
                          >
                            <td className="hud-value-sm py-2 px-2">
                              <Tooltip
                                position="right"
                                content={
                                  <TooltipContent
                                    title={isCryptoSymbol(pos.symbol, config?.crypto_symbols)
                                      ? `${formatCryptoSymbol(pos.symbol, config?.crypto_symbols)} - CRYPTO`
                                      : pos.symbol}
                                    items={[
                                      { label: 'Entry Price', value: posEntry ? formatCurrency(posEntry.entry_price) : 'N/A' },
                                      { label: 'Current Price', value: formatCurrency(pos.current_price) },
                                      { label: 'Hold Time', value: holdTime !== null ? `${holdTime}h` : 'N/A' },
                                      { label: 'Entry Sentiment', value: posEntry ? `${(posEntry.entry_sentiment * 100).toFixed(0)}%` : 'N/A' },
                                      ...(staleness ? [{ 
                                        label: 'Staleness', 
                                        value: `${(staleness.score * 100).toFixed(0)}%`,
                                        color: staleness.shouldExit ? 'text-hud-error' : 'text-hud-text'
                                      }] : []),
                                    ]}
                                    description={posEntry?.entry_reason}
                                  />
                                }
                              >
                                <span className="cursor-help border-b border-dotted border-hud-text-dim">
                                  {isCryptoSymbol(pos.symbol, config?.crypto_symbols) && (
                                    <span className="text-hud-warning mr-1">₿</span>
                                  )}
                                  {isCryptoSymbol(pos.symbol, config?.crypto_symbols) 
                                    ? formatCryptoSymbol(pos.symbol, config?.crypto_symbols)
                                    : pos.symbol}
                                </span>
                              </Tooltip>
                            </td>
                            <td className="hud-value-sm text-right py-2 px-2 hidden sm:table-cell">{pos.qty}</td>
                            <td className="hud-value-sm text-right py-2 px-2 hidden md:table-cell">{formatCurrency(pos.market_value)}</td>
                            <td className={clsx(
                              'hud-value-sm text-right py-2 px-2',
                              pos.unrealized_pl >= 0 ? 'text-hud-success' : 'text-hud-error'
                            )}>
                              <div>{formatCurrency(pos.unrealized_pl)}</div>
                              <div className="text-xs opacity-70">{formatPercent(plPct)}</div>
                            </td>
                            <td className="py-2 px-2">
                              <div className="flex justify-center">
                                <Sparkline data={priceHistory} width={60} height={20} />
                              </div>
                            </td>
                          </motion.tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>

          <div className="col-span-4 md:col-span-8 lg:col-span-4">
            <Panel title="LLM COSTS" className="h-full">
              <div className="grid grid-cols-2 gap-4">
                <Metric label="TOTAL SPENT" value={`$${costs.total_usd.toFixed(4)}`} size="lg" />
                <Metric label="API CALLS" value={costs.calls.toString()} size="lg" />
                <MetricInline label="TOKENS IN" value={costs.tokens_in.toLocaleString()} />
                <MetricInline label="TOKENS OUT" value={costs.tokens_out.toLocaleString()} />
                <MetricInline 
                  label="AVG COST/CALL" 
                  value={costs.calls > 0 ? `$${(costs.total_usd / costs.calls).toFixed(6)}` : '$0'} 
                />
                <MetricInline label="MODEL" value={config?.llm_model || 'gpt-4o-mini'} />
              </div>
            </Panel>
          </div>

          {/* Row 2: Portfolio Performance Chart */}
          <div className="col-span-4 md:col-span-8 lg:col-span-8">
            <Panel 
              title="PORTFOLIO PERFORMANCE" 
              titleRight={
                <div className="flex gap-2">
                  {(['1D', '1W', '1M'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setPortfolioPeriod(p)}
                      className={clsx(
                        'hud-label transition-colors',
                        portfolioPeriod === p ? 'text-hud-primary' : 'text-hud-text-dim hover:text-hud-text'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              } 
              className="h-[320px]"
            >
              {portfolioChartData.length > 1 ? (
                <div className="h-full w-full">
                  <LineChart
                    series={[{ label: 'Equity', data: portfolioChartData, variant: totalPl >= 0 ? 'green' : 'red' }]}
                    labels={portfolioChartLabels}
                    showArea={true}
                    showGrid={true}
                    showDots={false}
                    formatValue={(v) => `$${(v / 1000).toFixed(1)}k`}
                    markers={marketMarkers}
                    marketHours={marketHoursZone}
                  />
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-hud-text-dim text-sm">
                  Collecting performance data...
                </div>
              )}
            </Panel>
          </div>

          <div className="col-span-4 md:col-span-8 lg:col-span-4">
            <Panel title="POSITION PERFORMANCE" titleRight="% CHANGE" className="h-[320px]">
              {positions.length === 0 ? (
                <div className="h-full flex items-center justify-center text-hud-text-dim text-sm">
                  No positions to display
                </div>
              ) : normalizedPositionSeries.length > 0 ? (
                <div className="h-full flex flex-col">
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 mb-2 pb-2 border-b border-hud-line/30 shrink-0">
                    {positions.slice(0, 5).map((pos: Position, idx: number) => {
                      const isPositive = pos.unrealized_pl >= 0
                      const plPct = (pos.unrealized_pl / (pos.market_value - pos.unrealized_pl)) * 100
                      const color = positionColors[idx % positionColors.length]
                      return (
                        <div key={pos.symbol} className="flex items-center gap-1.5">
                          <div 
                            className="w-2 h-2 rounded-full" 
                            style={{ backgroundColor: `var(--color-hud-${color})` }}
                          />
                          <span className="hud-value-sm">{pos.symbol}</span>
                          <span className={clsx('hud-label', isPositive ? 'text-hud-success' : 'text-hud-error')}>
                            {formatPercent(plPct)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {/* Stacked chart */}
                  <div className="flex-1 min-h-0 w-full">
                    <LineChart
                      series={normalizedPositionSeries.slice(0, 5)}
                      showArea={false}
                      showGrid={true}
                      showDots={false}
                      animated={false}
                      formatValue={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
                    />
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-hud-text-dim text-sm">
                  Loading position data...
                </div>
              )}
            </Panel>
          </div>

          {/* Row 3: Signals, Activity, Research */}
          <div className="col-span-4 md:col-span-4 lg:col-span-4">
            <Panel
              title="ACTIVE SIGNALS"
              titleRight={`${actionableSignalCount}/${signals.length} actionable`}
              className="h-80"
            >
              <div className="overflow-y-auto h-full space-y-1">
                {signals.length === 0 ? (
                  <div className="text-hud-text-dim text-sm py-4 text-center">Gathering signals...</div>
                ) : (
                  signals.slice(0, 20).map((sig: Signal, i: number) => {
                    const actionability = signalActionability[sig.symbol]
                    const actionabilityView = getActionabilityView(sig.symbol, actionableSymbols, signalActionability)
                    const isActionable = actionabilityView.isActionable
                    const actionabilityLabel = actionabilityView.reasonLabel

                    return (
                      <Tooltip
                        key={`${sig.symbol}-${sig.source}-${i}`}
                        position="right"
                        content={
                          <TooltipContent
                            title={`${sig.symbol} - ${sig.source.toUpperCase()}`}
                            items={[
                              {
                                label: 'Actionable',
                                value: isActionable ? 'YES' : `NO (${actionabilityLabel})`,
                                color: isActionable ? 'text-hud-success' : 'text-hud-warning',
                              },
                              { label: 'Sentiment', value: `${(sig.sentiment * 100).toFixed(0)}%`, color: getSentimentColor(sig.sentiment) },
                              { label: 'Volume', value: sig.volume },
                              ...(sig.bullish !== undefined ? [{ label: 'Bullish', value: sig.bullish, color: 'text-hud-success' }] : []),
                              ...(sig.bearish !== undefined ? [{ label: 'Bearish', value: sig.bearish, color: 'text-hud-error' }] : []),
                              ...(sig.score !== undefined ? [{ label: 'Score', value: sig.score }] : []),
                              ...(sig.upvotes !== undefined ? [{ label: 'Upvotes', value: sig.upvotes }] : []),
                              ...(sig.momentum !== undefined ? [{ label: 'Momentum', value: `${sig.momentum >= 0 ? '+' : ''}${sig.momentum.toFixed(2)}%` }] : []),
                              ...(sig.price !== undefined ? [{ label: 'Price', value: formatCurrency(sig.price) }] : []),
                              ...(actionability?.price ? [{ label: 'Tradable Price', value: formatCurrency(actionability.price) }] : []),
                            ]}
                            description={sig.reason}
                          />
                        }
                      >
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className={clsx(
                            "flex items-center justify-between py-1 px-2 border-b border-hud-line/10 hover:bg-hud-line/10 cursor-help",
                            sig.isCrypto && "bg-hud-warning/5",
                            !isActionable && "opacity-65"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            {sig.isCrypto && <span className="text-hud-warning text-xs">₿</span>}
                            <span className="hud-value-sm">{sig.symbol}</span>
                            <span className={clsx('hud-label', sig.isCrypto ? 'text-hud-warning' : '')}>{sig.source.toUpperCase()}</span>
                            {!isActionable && (
                              <span className="hud-label text-hud-warning hidden sm:inline">
                                NON-ACTIONABLE
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {sig.isCrypto && sig.momentum !== undefined ? (
                              <span className={clsx('hud-label hidden sm:inline', sig.momentum >= 0 ? 'text-hud-success' : 'text-hud-error')}>
                                {sig.momentum >= 0 ? '+' : ''}{sig.momentum.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="hud-label hidden sm:inline">VOL {sig.volume}</span>
                            )}
                            <span className={clsx('hud-value-sm', getSentimentColor(sig.sentiment))}>
                              {(sig.sentiment * 100).toFixed(0)}%
                            </span>
                          </div>
                        </motion.div>
                      </Tooltip>
                    )
                  })
                )}
              </div>
            </Panel>
          </div>

          <div className="col-span-4 md:col-span-4 lg:col-span-4">
            <Panel title="ACTIVITY FEED" titleRight="LIVE" className="h-80">
              <div className="overflow-y-auto h-full font-mono text-xs space-y-1">
                {logs.length === 0 ? (
                  <div className="text-hud-text-dim py-4 text-center">Waiting for activity...</div>
                ) : (
                  logs.slice(-50).reverse().map((log: LogEntry, i: number) => (
                    <motion.div 
                      key={`${log.timestamp}-${i}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-start gap-2 py-1 border-b border-hud-line/10"
                    >
                      <span className="text-hud-text-dim shrink-0 hidden sm:inline w-[52px]">
                        {new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                      </span>
                      <span className={clsx('shrink-0 w-[72px] text-right', getAgentColor(log.agent))}>
                        {log.agent}
                      </span>
                      <span className="text-hud-text flex-1 text-right wrap-break-word">
                        {log.action}
                        {log.symbol && <span className="text-hud-primary ml-1">({log.symbol})</span>}
                      </span>
                    </motion.div>
                  ))
                )}

              </div>
            </Panel>
          </div>

          <div className="col-span-4 md:col-span-8 lg:col-span-4">
            <Panel title="SIGNAL RESEARCH" titleRight={Object.keys(status?.signalResearch || {}).length.toString()} className="h-80">
              <div className="overflow-y-auto h-full space-y-2">
                {Object.entries(status?.signalResearch || {}).length === 0 ? (
                  <div className="text-hud-text-dim text-sm py-4 text-center">Researching candidates...</div>
                ) : (
                  Object.entries(status?.signalResearch || {})
                    .sort(([, a], [, b]) => b.timestamp - a.timestamp)
                    .map(([symbol, research]: [string, SignalResearch]) => (
                    <Tooltip
                      key={symbol}
                      position="left"
                      content={
                        <div className="space-y-2 min-w-[200px]">
                          <div className="hud-label text-hud-primary border-b border-hud-line/50 pb-1">
                            {symbol} DETAILS
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-hud-text-dim">Confidence</span>
                              <span className="text-hud-text-bright">{(research.confidence * 100).toFixed(0)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-hud-text-dim">Sentiment</span>
                              <span className={getSentimentColor(research.sentiment)}>
                                {(research.sentiment * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-hud-text-dim">Analyzed</span>
                              <span className="text-hud-text">
                                {new Date(research.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                              </span>
                            </div>
                          </div>
                          {research.catalysts.length > 0 && (
                            <div className="pt-1 border-t border-hud-line/30">
                              <span className="text-[9px] text-hud-text-dim">CATALYSTS:</span>
                              <ul className="mt-1 space-y-0.5">
                                {research.catalysts.map((c, i) => (
                                  <li key={i} className="text-[10px] text-hud-success">+ {c}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {research.red_flags.length > 0 && (
                            <div className="pt-1 border-t border-hud-line/30">
                              <span className="text-[9px] text-hud-text-dim">RED FLAGS:</span>
                              <ul className="mt-1 space-y-0.5">
                                {research.red_flags.map((f, i) => (
                                  <li key={i} className="text-[10px] text-hud-error">- {f}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      }
                    >
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-2 border border-hud-line/30 rounded hover:border-hud-line/60 cursor-help transition-colors"
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="hud-value-sm">{symbol}</span>
                          <div className="flex items-center gap-2">
                            <span className={clsx('hud-label', getQualityColor(research.entry_quality))}>
                              {research.entry_quality.toUpperCase()}
                            </span>
                            <span className={clsx('hud-value-sm font-bold', getVerdictColor(research.verdict))}>
                              {research.verdict}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-hud-text-dim leading-tight mb-1">{research.reasoning}</p>
                        {research.red_flags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {research.red_flags.slice(0, 2).map((flag, i) => (
                              <span key={i} className="text-xs text-hud-error bg-hud-error/10 px-1 rounded">
                                {flag.slice(0, 30)}...
                              </span>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    </Tooltip>
                  ))
                )}
              </div>
            </Panel>
          </div>
        </div>

        <div className="mt-4">
          <Panel
            title="EXPERIMENT TRACKING"
            titleRight={experimentForView ? `${experimentForView.status.toUpperCase()} • ${experimentForView.name}` : 'NO RUNS'}
            className="min-h-[220px]"
          >
            {!experimentRunDetail || !latestSnapshot ? (
              <div className="text-hud-text-dim text-sm py-4 text-center">
                Start an experiment with `POST /agent/experiments/start` to begin baseline vs current tracking.
              </div>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="hud-label">RUN</span>
                  <span className="hud-value-sm">{experimentRunDetail.name}</span>
                  <span className="hud-label text-hud-text-dim">
                    {new Date(experimentRunDetail.started_at).toLocaleString('en-US', { hour12: false })}
                  </span>
                  {experimentRunDetail.ended_at && (
                    <span className="hud-label text-hud-text-dim">
                      END {new Date(experimentRunDetail.ended_at).toLocaleString('en-US', { hour12: false })}
                    </span>
                  )}
                  <span className={clsx('hud-label', latestSnapshot.verdict.passed ? 'text-hud-success' : 'text-hud-error')}>
                    {latestSnapshot.verdict.passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="p-2 border border-hud-line/30 rounded">
                    <div className="hud-label text-hud-text-dim">Return %</div>
                    <div className={clsx('hud-value-sm', latestSnapshot.metrics.returns.return_pct >= 0 ? 'text-hud-success' : 'text-hud-error')}>
                      {formatPercent(latestSnapshot.metrics.returns.return_pct)}
                    </div>
                    {baselineSnapshot && (
                      <div className="hud-label text-hud-text-dim">
                        vs {formatPercent(baselineSnapshot.metrics.returns.return_pct)}
                      </div>
                    )}
                  </div>
                  <div className="p-2 border border-hud-line/30 rounded">
                    <div className="hud-label text-hud-text-dim">Actionable Ratio</div>
                    <div className="hud-value-sm text-hud-primary">
                      {(latestSnapshot.metrics.signal_funnel.avg_actionable_ratio * 100).toFixed(1)}%
                    </div>
                    {baselineSnapshot && (
                      <div className="hud-label text-hud-text-dim">
                        vs {(baselineSnapshot.metrics.signal_funnel.avg_actionable_ratio * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div className="p-2 border border-hud-line/30 rounded">
                    <div className="hud-label text-hud-text-dim">Alarm Errors</div>
                    <div className={clsx('hud-value-sm', latestSnapshot.metrics.reliability.alarm_error_count === 0 ? 'text-hud-success' : 'text-hud-warning')}>
                      {latestSnapshot.metrics.reliability.alarm_error_count}
                    </div>
                    {baselineSnapshot && (
                      <div className="hud-label text-hud-text-dim">
                        vs {baselineSnapshot.metrics.reliability.alarm_error_count}
                      </div>
                    )}
                  </div>
                  <div className="p-2 border border-hud-line/30 rounded">
                    <div className="hud-label text-hud-text-dim">Cost / Trade</div>
                    <div className="hud-value-sm text-hud-warning">
                      {formatCurrency(latestSnapshot.metrics.costs.cost_per_executed_trade || 0)}
                    </div>
                    {baselineSnapshot && (
                      <div className="hud-label text-hud-text-dim">
                        vs {formatCurrency(baselineSnapshot.metrics.costs.cost_per_executed_trade || 0)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  {latestSnapshot.verdict.checks.map((check) => (
                    <div key={check.name} className="flex items-center justify-between border-b border-hud-line/10 py-1">
                      <span className="hud-label">{check.name}</span>
                      <span className={clsx('hud-label', check.passed ? 'text-hud-success' : 'text-hud-error')}>
                        {check.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>
        </div>

        <footer className="mt-4 pt-3 border-t border-hud-line flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex flex-wrap gap-4 md:gap-6">
            {config && (
              <>
                <MetricInline label="MAX POS" value={`$${config.max_position_value}`} />
                <MetricInline label="MIN SENT" value={`${(config.min_sentiment_score * 100).toFixed(0)}%`} />
                <MetricInline label="TAKE PROFIT" value={`${config.take_profit_pct}%`} />
                <MetricInline label="STOP LOSS" value={`${config.stop_loss_pct}%`} />
                <span className="hidden lg:inline text-hud-line">|</span>
                <MetricInline 
                  label="OPTIONS" 
                  value={config.options_enabled ? 'ON' : 'OFF'} 
                  valueClassName={config.options_enabled ? 'text-hud-purple' : 'text-hud-text-dim'}
                />
                {config.options_enabled && (
                  <>
                    <MetricInline label="OPT Δ" value={config.options_target_delta?.toFixed(2) || '0.35'} />
                    <MetricInline label="OPT DTE" value={`${config.options_min_dte || 7}-${config.options_max_dte || 45}`} />
                  </>
                )}
                <span className="hidden lg:inline text-hud-line">|</span>
                <MetricInline 
                  label="CRYPTO" 
                  value={config.crypto_enabled ? '24/7' : 'OFF'} 
                  valueClassName={config.crypto_enabled ? 'text-hud-warning' : 'text-hud-text-dim'}
                />
                {config.crypto_enabled && (
                  <MetricInline label="SYMBOLS" value={(config.crypto_symbols || ['BTC', 'ETH', 'SOL']).map(s => s.split('/')[0]).join('/')} />
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="hud-label hidden md:inline">AUTONOMOUS TRADING SYSTEM</span>
            <span className="hud-value-sm">PAPER MODE</span>
          </div>
        </footer>
      </div>

      <AnimatePresence>
        {showSettings && config && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <SettingsModal 
              config={config} 
              onSave={handleSaveConfig} 
              onClose={() => setShowSettings(false)} 
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

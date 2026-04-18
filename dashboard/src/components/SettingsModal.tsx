import { useState } from 'react'
import type { Config } from '../types'
import { Panel } from './Panel'

interface SettingsModalProps {
  config: Config
  onSave: (config: Config) => void
  onClose: () => void
}

export function SettingsModal({ config, onSave, onClose }: SettingsModalProps) {
  const [localConfig, setLocalConfig] = useState<Config>(config)
  const [saving, setSaving] = useState(false)
  const [apiToken, setApiToken] = useState(localStorage.getItem('mahoraga_api_token') || '')

  // Note: We intentionally do NOT sync localConfig with the config prop after initial mount.
  // This prevents the parent's polling (every 5s) from overwriting user's unsaved changes.

  const handleTokenSave = () => {
    if (apiToken) {
      localStorage.setItem('mahoraga_api_token', apiToken)
    } else {
      localStorage.removeItem('mahoraga_api_token')
    }
    window.location.reload()
  }

  const handleTokenClear = () => {
    localStorage.removeItem('mahoraga_api_token')
    setApiToken('')
    window.location.reload()
  }

  const handleChange = <K extends keyof Config>(key: K, value: Config[K]) => {
    setLocalConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(localConfig)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <Panel
        title="TRADING CONFIGURATION"
        className="w-full max-w-2xl max-h-[90vh] overflow-auto"
        titleRight={
          <button onClick={onClose} className="hud-label hover:text-hud-primary">
            [ESC]
          </button>
        }
      >
        <div onClick={e => e.stopPropagation()} className="space-y-6">
          {/* API Authentication */}
          <div className="pb-4 border-b border-hud-line">
            <h3 className="hud-label mb-3 text-hud-error">API Authentication (Required)</h3>
            <div className="flex gap-2">
              <input
                type="password"
                className="hud-input flex-1"
                value={apiToken}
                onChange={e => setApiToken(e.target.value)}
                placeholder="Enter MAHORAGA_API_TOKEN"
              />
              <button className="hud-button" onClick={handleTokenSave}>
                Save & Reload
              </button>
              <button className="hud-button" onClick={handleTokenClear}>
                Clear Token
              </button>
            </div>
            <p className="text-[10px] text-hud-text-dim mt-1">
              This token is stored only in this browser's localStorage and is never embedded in the deployed frontend build.
            </p>
            <p className="text-[9px] text-hud-text-dim mt-1">
              Use your MAHORAGA_API_TOKEN from Cloudflare secrets. Required for all API access.
            </p>
          </div>

          {/* Position Limits */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Position Limits</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="hud-label block mb-1">Max Position Value ($)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.max_position_value}
                  onChange={e => handleChange('max_position_value', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Max Positions</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.max_positions}
                  onChange={e => handleChange('max_positions', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Position Size (% of Cash)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.position_size_pct_of_cash}
                  onChange={e => handleChange('position_size_pct_of_cash', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Sentiment Thresholds */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Sentiment Thresholds</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="hud-label block mb-1">Min Sentiment to Buy (0-1)</label>
                <input
                  type="number"
                  step="0.05"
                  className="hud-input w-full"
                  value={localConfig.min_sentiment_score}
                  onChange={e => handleChange('min_sentiment_score', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Min Analyst Confidence (0-1)</label>
                <input
                  type="number"
                  step="0.05"
                  className="hud-input w-full"
                  value={localConfig.min_analyst_confidence}
                  onChange={e => handleChange('min_analyst_confidence', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Risk Management */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Risk Management</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="hud-label block mb-1">Take Profit (%)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.take_profit_pct}
                  onChange={e => handleChange('take_profit_pct', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Stop Loss (%)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.stop_loss_pct}
                  onChange={e => handleChange('stop_loss_pct', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Timing */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Polling Intervals</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="hud-label block mb-1">Data Poll (ms)</label>
                <input
                  type="number"
                  step="1000"
                  className="hud-input w-full"
                  value={localConfig.data_poll_interval_ms}
                  onChange={e => handleChange('data_poll_interval_ms', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Analyst Interval (ms)</label>
                <input
                  type="number"
                  step="1000"
                  className="hud-input w-full"
                  value={localConfig.analyst_interval_ms}
                  onChange={e => handleChange('analyst_interval_ms', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Pre-Market Plan Window (min)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  className="hud-input w-full"
                  value={localConfig.premarket_plan_window_minutes ?? 5}
                  onChange={e => handleChange('premarket_plan_window_minutes', Number(e.target.value))}
                />
                <p className="text-[9px] text-hud-text-dim mt-1">Generate a plan when within N minutes of the next market open.</p>
              </div>
              <div>
                <label className="hud-label block mb-1">Market Open Execute Window (min)</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  className="hud-input w-full"
                  value={localConfig.market_open_execute_window_minutes ?? 2}
                  onChange={e => handleChange('market_open_execute_window_minutes', Number(e.target.value))}
                />
                <p className="text-[9px] text-hud-text-dim mt-1">Execute the plan if the market is open and within this window.</p>
              </div>
            </div>
          </div>

          {/* LLM Config */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">LLM Configuration</h3>
            <div className="grid grid-cols-1 gap-4 mb-4">
              <div>
                <label className="hud-label block mb-1">Provider</label>
                <select
                  className="hud-input w-full"
                  value={localConfig.llm_provider || 'openai-raw'}
                  onChange={e => handleChange('llm_provider', e.target.value as Config['llm_provider'])}
                >
                  <option value="openai-raw">OpenAI Direct (default)</option>
                  <option value="ai-sdk">AI SDK (5 providers)</option>
                  <option value="cloudflare-gateway">Cloudflare AI Gateway</option>
                  {localConfig.llm_provider &&
                    !['openai-raw', 'ai-sdk', 'cloudflare-gateway'].includes(localConfig.llm_provider) && (
                      <option value={localConfig.llm_provider}>Custom (backend configured)</option>
                    )}
                </select>
                <p className="text-[9px] text-hud-text-dim mt-1">
                  {localConfig.llm_provider === 'ai-sdk' && 'Supports: OpenAI, Anthropic, Google, xAI, DeepSeek'}
                  {(!localConfig.llm_provider || localConfig.llm_provider === 'openai-raw') && 'Uses OPENAI_API_KEY directly (+ optional OPENAI_BASE_URL).'}
                  {localConfig.llm_provider &&
                    !['openai-raw', 'ai-sdk', 'cloudflare-gateway'].includes(localConfig.llm_provider) &&
                    'Provider is configured in the backend; selection is hidden in the dashboard.'}
                  {localConfig.llm_provider === 'cloudflare-gateway' && 'Uses CLOUDFLARE_AI_GATEWAY_* env vars via Cloudflare AI Gateway /compat.'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="hud-label block mb-1">Research Model (cheap)</label>
                <select
                  className="hud-input w-full"
                  value={localConfig.llm_model}
                  onChange={e => handleChange('llm_model', e.target.value)}
                >
                  {(!localConfig.llm_provider || localConfig.llm_provider === 'openai-raw') && (
                    <>
                      <option value="gpt-4o-mini">gpt-4o-mini</option>
                      <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
                    </>
                  )}
                  {localConfig.llm_provider === 'ai-sdk' && (
                    <>
                      <optgroup label="OpenAI">
                        <option value="openai/gpt-4o-mini">gpt-4o-mini</option>
                        <option value="openai/gpt-3.5-turbo">gpt-3.5-turbo</option>
                      </optgroup>
                      <optgroup label="Anthropic">
                        <option value="anthropic/claude-3-5-haiku-latest">claude-3.5-haiku</option>
                      </optgroup>
                      <optgroup label="Google">
                        <option value="google/gemini-2.5-flash">gemini-2.5-flash</option>
                        <option value="google/gemini-2.0-flash">gemini-2.0-flash</option>
                      </optgroup>
                      <optgroup label="DeepSeek">
                        <option value="deepseek/deepseek-chat">deepseek-chat</option>
                      </optgroup>
                    </>
                  )}
                  {localConfig.llm_provider === 'cloudflare-gateway' && (
                    <>
                      <optgroup label="OpenAI">
                        <option value="openai/gpt-4o-mini">gpt-4o-mini</option>
                        <option value="openai/gpt-5-mini">gpt-5-mini</option>
                      </optgroup>
                      <optgroup label="Anthropic">
                        <option value="anthropic/claude-haiku-4-5">claude-haiku-4.5</option>
                      </optgroup>
                      <optgroup label="Google AI Studio">
                        <option value="google-ai-studio/gemini-2.5-flash">gemini-2.5-flash</option>
                      </optgroup>
                      <optgroup label="DeepSeek">
                        <option value="deepseek/deepseek-chat">deepseek-chat</option>
                      </optgroup>
                    </>
                  )}
                  {localConfig.llm_provider &&
                    !['openai-raw', 'ai-sdk', 'cloudflare-gateway'].includes(localConfig.llm_provider) && (
                      <option value={localConfig.llm_model}>{localConfig.llm_model}</option>
                    )}
                </select>
              </div>
              <div>
                <label className="hud-label block mb-1">Analyst Model (smart)</label>
                <select
                  className="hud-input w-full"
                  value={localConfig.llm_analyst_model || 'gpt-4o'}
                  onChange={e => handleChange('llm_analyst_model', e.target.value)}
                >
                  {(!localConfig.llm_provider || localConfig.llm_provider === 'openai-raw') && (
                    <>
                      <option value="gpt-5.2-2025-12-11">GPT-5.2 (best)</option>
                      <option value="gpt-4o">gpt-4o</option>
                      <option value="gpt-4o-mini">gpt-4o-mini (cheaper)</option>
                    </>
                  )}
                  {localConfig.llm_provider === 'ai-sdk' && (
                    <>
                      <optgroup label="OpenAI">
                        <option value="openai/gpt-4o">gpt-4o</option>
                        <option value="openai/o1">o1 (reasoning)</option>
                        <option value="openai/o1-mini">o1-mini</option>
                      </optgroup>
                      <optgroup label="Anthropic">
                        <option value="anthropic/claude-3-7-sonnet-latest">claude-3.7-sonnet (best)</option>
                        <option value="anthropic/claude-sonnet-4-0">claude-sonnet-4</option>
                        <option value="anthropic/claude-opus-4-1">claude-opus-4</option>
                      </optgroup>
                      <optgroup label="Google">
                        <option value="google/gemini-2.5-pro">gemini-2.5-pro</option>
                        <option value="google/gemini-3-pro-preview">gemini-3-pro (preview)</option>
                      </optgroup>
                      <optgroup label="xAI">
                        <option value="xai/grok-4">grok-4</option>
                        <option value="xai/grok-3">grok-3</option>
                        <option value="xai/grok-4-fast-reasoning">grok-4-fast-reasoning</option>
                      </optgroup>
                      <optgroup label="DeepSeek">
                        <option value="deepseek/deepseek-reasoner">deepseek-reasoner</option>
                        <option value="deepseek/deepseek-chat">deepseek-chat</option>
                      </optgroup>
                    </>
                  )}
                  {localConfig.llm_provider === 'cloudflare-gateway' && (
                    <>
                      <optgroup label="OpenAI">
                        <option value="openai/gpt-5.2">gpt-5.2 (best)</option>
                        <option value="openai/gpt-5">gpt-5</option>
                        <option value="openai/gpt-4o">gpt-4o</option>
                      </optgroup>
                      <optgroup label="Anthropic">
                        <option value="anthropic/claude-opus-4-5">claude-opus-4.5 (best)</option>
                        <option value="anthropic/claude-sonnet-4-5">claude-sonnet-4.5</option>
                      </optgroup>
                      <optgroup label="Google AI Studio">
                        <option value="google-ai-studio/gemini-2.5-pro">gemini-2.5-pro</option>
                      </optgroup>
                      <optgroup label="Grok">
                        <option value="grok/grok-4.1-fast-reasoning">grok-4.1-fast-reasoning</option>
                        <option value="grok/grok-code-fast-1">grok-code-fast-1</option>
                      </optgroup>
                    </>
                  )}
                  {localConfig.llm_provider &&
                    !['openai-raw', 'ai-sdk', 'cloudflare-gateway'].includes(localConfig.llm_provider) && (
                      <option value={localConfig.llm_analyst_model || 'gpt-4o'}>
                        {localConfig.llm_analyst_model || 'gpt-4o'}
                      </option>
                    )}
                </select>
              </div>
            </div>
          </div>

          {/* Account Config */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Account</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="hud-label block mb-1">Starting Equity ($)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.starting_equity || 100000}
                  onChange={e => handleChange('starting_equity', Number(e.target.value))}
                />
                <p className="text-xs text-hud-text-dim mt-1">For P&L calculation</p>
              </div>
            </div>
          </div>

          {/* Options Trading */}
          <div>
            <h3 className="hud-label mb-3 text-hud-purple">Options Trading (Beta)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.options_enabled || false}
                    onChange={e => handleChange('options_enabled', e.target.checked)}
                  />
                  <span className="hud-label">Enable Options Trading</span>
                </label>
              </div>
              <div>
                <label className="hud-label block mb-1">Min Confidence (0-1)</label>
                <input
                  type="number"
                  step="0.05"
                  className="hud-input w-full"
                  value={localConfig.options_min_confidence || 0.75}
                  onChange={e => handleChange('options_min_confidence', Number(e.target.value))}
                  disabled={!localConfig.options_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Max % Per Trade</label>
                <input
                  type="number"
                  step="0.5"
                  className="hud-input w-full"
                  value={localConfig.options_max_pct_per_trade || 2}
                  onChange={e => handleChange('options_max_pct_per_trade', Number(e.target.value))}
                  disabled={!localConfig.options_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Min DTE (days)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.options_min_dte || 7}
                  onChange={e => handleChange('options_min_dte', Number(e.target.value))}
                  disabled={!localConfig.options_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Max DTE (days)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.options_max_dte || 45}
                  onChange={e => handleChange('options_max_dte', Number(e.target.value))}
                  disabled={!localConfig.options_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Target Delta</label>
                <input
                  type="number"
                  step="0.05"
                  className="hud-input w-full"
                  value={localConfig.options_target_delta || 0.35}
                  onChange={e => handleChange('options_target_delta', Number(e.target.value))}
                  disabled={!localConfig.options_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Stop Loss (%)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.options_stop_loss_pct || 50}
                  onChange={e => handleChange('options_stop_loss_pct', Number(e.target.value))}
                  disabled={!localConfig.options_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Take Profit (%)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.options_take_profit_pct || 100}
                  onChange={e => handleChange('options_take_profit_pct', Number(e.target.value))}
                  disabled={!localConfig.options_enabled}
                />
              </div>
            </div>
          </div>

          {/* Crypto Trading */}
          <div>
            <h3 className="hud-label mb-3 text-hud-cyan">Crypto Trading (24/7)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.crypto_enabled || false}
                    onChange={e => handleChange('crypto_enabled', e.target.checked)}
                  />
                  <span className="hud-label">Enable Crypto Trading</span>
                </label>
                <p className="text-[9px] text-hud-text-dim mt-1">Trade crypto 24/7 based on momentum. Alpaca supports 20+ coins.</p>
              </div>
              <div>
                <label className="hud-label block mb-1">Symbols (comma-separated)</label>
                <input
                  type="text"
                  className="hud-input w-full"
                  value={(localConfig.crypto_symbols || ['BTC/USD', 'ETH/USD', 'SOL/USD']).join(', ')}
                  onChange={e => handleChange('crypto_symbols', e.target.value.split(',').map(s => s.trim()))}
                  disabled={!localConfig.crypto_enabled}
                  placeholder="BTC/USD, ETH/USD, SOL/USD, DOGE/USD, AVAX/USD..."
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Momentum Threshold (%)</label>
                <input
                  type="number"
                  step="0.5"
                  className="hud-input w-full"
                  value={localConfig.crypto_momentum_threshold || 2.0}
                  onChange={e => handleChange('crypto_momentum_threshold', Number(e.target.value))}
                  disabled={!localConfig.crypto_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Max Position ($)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.crypto_max_position_value || 1000}
                  onChange={e => handleChange('crypto_max_position_value', Number(e.target.value))}
                  disabled={!localConfig.crypto_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Take Profit (%)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.crypto_take_profit_pct || 10}
                  onChange={e => handleChange('crypto_take_profit_pct', Number(e.target.value))}
                  disabled={!localConfig.crypto_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Stop Loss (%)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.crypto_stop_loss_pct || 5}
                  onChange={e => handleChange('crypto_stop_loss_pct', Number(e.target.value))}
                  disabled={!localConfig.crypto_enabled}
                />
              </div>
            </div>
          </div>

          {/* Institutional Data Sources */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Institutional Signal Sources</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.uoa_enabled || false}
                    onChange={e => handleChange('uoa_enabled', e.target.checked)}
                  />
                  <span className="hud-label">Enable Unusual Options Flow</span>
                </label>
              </div>
              <div>
                <label className="hud-label block mb-1">UOA Max Candidates</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.uoa_max_candidates || 10}
                  onChange={e => handleChange('uoa_max_candidates', Number(e.target.value))}
                  disabled={!localConfig.uoa_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">UOA Min Premium ($)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.uoa_min_premium || 100000}
                  onChange={e => handleChange('uoa_min_premium', Number(e.target.value))}
                  disabled={!localConfig.uoa_enabled}
                />
              </div>

              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.congressional_enabled || false}
                    onChange={e => handleChange('congressional_enabled', e.target.checked)}
                  />
                  <span className="hud-label">Enable Congressional Trades (FMP)</span>
                </label>
              </div>
              <div>
                <label className="hud-label block mb-1">Congressional Max Candidates</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.congressional_max_candidates || 10}
                  onChange={e => handleChange('congressional_max_candidates', Number(e.target.value))}
                  disabled={!localConfig.congressional_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Congressional Lookback (days)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.congressional_lookback_days || 14}
                  onChange={e => handleChange('congressional_lookback_days', Number(e.target.value))}
                  disabled={!localConfig.congressional_enabled}
                />
              </div>

              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.contract_awards_enabled || false}
                    onChange={e => handleChange('contract_awards_enabled', e.target.checked)}
                  />
                  <span className="hud-label">Enable Federal Contract Awards (GovCon)</span>
                </label>
              </div>
              <div>
                <label className="hud-label block mb-1">Contract Max Candidates</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.contract_awards_max_candidates || 10}
                  onChange={e => handleChange('contract_awards_max_candidates', Number(e.target.value))}
                  disabled={!localConfig.contract_awards_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Contract Lookback (days)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.contract_awards_lookback_days || 30}
                  onChange={e => handleChange('contract_awards_lookback_days', Number(e.target.value))}
                  disabled={!localConfig.contract_awards_enabled}
                />
              </div>
            </div>
            <p className="text-[9px] text-hud-text-dim mt-2">
              Keep disabled until corresponding API keys are configured in worker secrets.
            </p>
          </div>

          {/* Free-tier signal bundle */}
          <div>
            <h3 className="hud-label mb-3 text-hud-primary">Free-Tier Signal Bundle</h3>
            <p className="text-[9px] text-hud-text-dim mb-3">
              Staged activation: enable Crypto F&amp;G first, then Finnhub, then FRED. Use experiment snapshots between
              stages. Set conservative TTLs to protect Worker subrequests and provider quotas.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.crypto_fng_enabled || false}
                    onChange={e => handleChange('crypto_fng_enabled', e.target.checked)}
                  />
                  <span className="hud-label">Crypto Fear &amp; Greed (Alternative.me, no API key)</span>
                </label>
              </div>
              <div>
                <label className="hud-label block mb-1">F&amp;G cache TTL (seconds)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.crypto_fng_cache_ttl_seconds ?? 1200}
                  onChange={e => handleChange('crypto_fng_cache_ttl_seconds', Number(e.target.value))}
                  disabled={!localConfig.crypto_fng_enabled}
                />
              </div>

              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.finnhub_enabled || false}
                    onChange={e => handleChange('finnhub_enabled', e.target.checked)}
                  />
                  <span className="hud-label">Finnhub market news bundle (requires FINNHUB_API_KEY)</span>
                </label>
              </div>
              <div>
                <label className="hud-label block mb-1">Finnhub max symbols</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.finnhub_max_symbols ?? 10}
                  onChange={e => handleChange('finnhub_max_symbols', Number(e.target.value))}
                  disabled={!localConfig.finnhub_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Finnhub cache TTL (seconds)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.finnhub_cache_ttl_seconds ?? 240}
                  onChange={e => handleChange('finnhub_cache_ttl_seconds', Number(e.target.value))}
                  disabled={!localConfig.finnhub_enabled}
                />
              </div>
              <div className="col-span-2">
                <label className="hud-label block mb-1">Finnhub symbol allowlist (comma-separated)</label>
                <input
                  type="text"
                  className="hud-input w-full font-mono text-xs"
                  value={(localConfig.finnhub_symbols || []).join(', ')}
                  onChange={e =>
                    handleChange(
                      'finnhub_symbols',
                      e.target.value
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean)
                    )
                  }
                  disabled={!localConfig.finnhub_enabled}
                  placeholder="SPY, QQQ, AAPL, ..."
                />
              </div>

              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.fred_enabled || false}
                    onChange={e => handleChange('fred_enabled', e.target.checked)}
                  />
                  <span className="hud-label">FRED macro regime (SPY/QQQ bias, requires FRED_API_KEY)</span>
                </label>
              </div>
              <div>
                <label className="hud-label block mb-1">FRED cache TTL (seconds)</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.fred_cache_ttl_seconds ?? 14400}
                  onChange={e => handleChange('fred_cache_ttl_seconds', Number(e.target.value))}
                  disabled={!localConfig.fred_enabled}
                />
              </div>
              <div className="col-span-2">
                <label className="hud-label block mb-1">FRED series IDs (comma-separated)</label>
                <input
                  type="text"
                  className="hud-input w-full font-mono text-xs"
                  value={(localConfig.fred_series || []).join(', ')}
                  onChange={e =>
                    handleChange(
                      'fred_series',
                      e.target.value
                        .split(',')
                        .map(s => s.trim())
                        .filter(Boolean)
                    )
                  }
                  disabled={!localConfig.fred_enabled}
                  placeholder="VIXCLS, DGS10, FEDFUNDS"
                />
              </div>
            </div>
            <p className="text-[9px] text-hud-text-dim mt-2">
              On 429 / upstream errors, gatherers fall back to KV cache when available or emit no signals (no
              cycle-breaking throws).
            </p>
          </div>

          {/* Stale Position Management */}
          <div>
            <h3 className="hud-label mb-3 text-hud-warning">Stale Position Management</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="hud-input w-4 h-4"
                    checked={localConfig.stale_position_enabled ?? true}
                    onChange={e => handleChange('stale_position_enabled', e.target.checked)}
                  />
                  <span className="hud-label">Enable Stale Position Detection</span>
                </label>
              </div>
              <div>
                <label className="hud-label block mb-1">Max Hold Days</label>
                <input
                  type="number"
                  className="hud-input w-full"
                  value={localConfig.stale_max_hold_days || 3}
                  onChange={e => handleChange('stale_max_hold_days', Number(e.target.value))}
                  disabled={!localConfig.stale_position_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Min Gain % to Keep</label>
                <input
                  type="number"
                  step="0.5"
                  className="hud-input w-full"
                  value={localConfig.stale_min_gain_pct || 5}
                  onChange={e => handleChange('stale_min_gain_pct', Number(e.target.value))}
                  disabled={!localConfig.stale_position_enabled}
                />
              </div>
              <div>
                <label className="hud-label block mb-1">Social Volume Decay</label>
                <input
                  type="number"
                  step="0.1"
                  className="hud-input w-full"
                  value={localConfig.stale_social_volume_decay || 0.3}
                  onChange={e => handleChange('stale_social_volume_decay', Number(e.target.value))}
                  disabled={!localConfig.stale_position_enabled}
                />
                <p className="text-[9px] text-hud-text-dim mt-1">Exit if volume drops to this % of entry</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4 pt-4 border-t border-hud-line">
            <button className="hud-button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="hud-button"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  )
}

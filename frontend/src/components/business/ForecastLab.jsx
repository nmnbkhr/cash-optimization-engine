import { useState, useEffect } from 'react'
import axios from 'axios'
import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, BarChart, Bar, Cell,
} from 'recharts'

const API = 'http://localhost:8000'
const theme = {
  bg: '#0a0e17', card: '#0f1419', border: '#1e293b', gold: '#d4a853',
  green: '#10b981', cyan: '#06b6d4', red: '#ef4444', amber: '#f59e0b',
  purple: '#a78bfa', text: '#e8eaed', textSecondary: '#8b949e',
  mono: "'JetBrains Mono', monospace",
}
const MODEL_COLORS = { xgboost: theme.gold, sarima: theme.cyan, prophet: theme.purple, actual: theme.text }
const MODEL_LABELS = { xgboost: 'XGBoost', sarima: 'SARIMA', prophet: 'Prophet' }

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
      <span style={{ color: theme.textSecondary, fontFamily: theme.mono, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      {children}
    </label>
  )
}
const inputStyle = {
  backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`,
  borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: theme.mono, minWidth: 70,
}

function Section({ title, subtitle, children, right }) {
  return (
    <div style={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: theme.mono, color: theme.text, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 3 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function ForecastLab() {
  const [config, setConfig] = useState(null)
  const [branches, setBranches] = useState([])
  const [branch, setBranch] = useState('')
  const [target, setTarget] = useState('withdrawal')
  const [horizon, setHorizon] = useState(7)
  const [origins, setOrigins] = useState(5)
  const [models, setModels] = useState(['xgboost', 'sarima', 'prophet'])
  const [params, setParams] = useState(null)
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [promoting, setPromoting] = useState(false)
  const [promoted, setPromoted] = useState(null)

  useEffect(() => {
    axios.get(`${API}/api/forecast-lab/config`).then((r) => {
      setConfig(r.data)
      setParams(JSON.parse(JSON.stringify(r.data.default_params)))
    }).catch((e) => setError(e.message))
    axios.get(`${API}/api/branches`).then((r) => {
      const list = r.data || []
      setBranches(list)
      if (list.length) setBranch(list[0].branch_id)
    }).catch(() => {})
  }, [])

  const toggleModel = (m) => setModels((cur) => cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m])
  const setParam = (model, key, val) =>
    setParams((cur) => ({ ...cur, [model]: { ...cur[model], [key]: val } }))

  const run = () => {
    if (!branch || !models.length) return
    setRunning(true); setError(null); setResult(null)
    axios.post(`${API}/api/forecast-lab/run`, { branch_id: branch, target, horizon, origins, models, params })
      .then((r) => {
        if (r.data.error) setError(r.data.error)
        else setResult(r.data)
      })
      .catch((e) => setError(e.response?.data?.detail || e.message))
      .finally(() => setRunning(false))
  }

  const promote = () => {
    if (!result?.best_model) return
    const best = result.best_model
    setPromoting(true); setPromoted(null)
    axios.post(`${API}/api/forecast-lab/promote`, {
      branch_id: branch, target, horizon, model: best,
      params: params?.[best], mape: result.models[best]?.metrics?.mape,
    })
      .then((r) => setPromoted(r.data.error ? { error: r.data.error } : r.data))
      .catch((e) => setPromoted({ error: e.response?.data?.detail || e.message }))
      .finally(() => setPromoting(false))
  }

  const okModels = result ? Object.entries(result.models).filter(([, m]) => m.status === 'ok') : []

  // Merge forecast paths of all ok models into one chart series keyed by date.
  const chartData = (() => {
    if (!result) return []
    const byDate = {}
    result.history.forEach((h) => { byDate[h.date] = { date: h.date, actual: h.value } })
    okModels.forEach(([key, m]) => {
      m.forecast.forEach((p) => {
        byDate[p.date] = byDate[p.date] || { date: p.date }
        byDate[p.date][`${key}_yhat`] = p.yhat
        byDate[p.date][`${key}_lo`] = p.lower
        byDate[p.date][`${key}_hi`] = p.upper
        if (p.actual != null) byDate[p.date].actual = p.actual
      })
    })
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  })()

  const horizonData = (() => {
    if (!result || !okModels.length) return []
    const H = result.meta.horizon
    const rows = []
    for (let h = 1; h <= H; h++) {
      const row = { h: `d+${h}` }
      okModels.forEach(([key, m]) => {
        const bh = m.metrics.by_horizon.find((x) => x.h === h)
        row[key] = bh ? bh.mape : null
      })
      rows.push(row)
    }
    return rows
  })()

  const xgb = result?.models?.xgboost
  const importances = xgb?.status === 'ok' ? (xgb.feature_importances || []).slice(0, 12) : []

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1320, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: theme.text, margin: 0 }}>Forecast Lab</h1>
        <p style={{ fontSize: 12, color: theme.textSecondary, margin: '4px 0 0' }}>
          Train &amp; compare XGBoost · SARIMA · Prophet — per-horizon accuracy, interval coverage, feature importances
          {result && <> · <span style={{ fontFamily: theme.mono }}>as-of {result.meta.as_of}</span></>}
        </p>
      </div>

      {/* ── Controls ── */}
      <Section title="Configuration" subtitle="Pick a branch, target flow, horizon and models — then tune each model's parameters.">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
          <Field label="Branch">
            <select value={branch} onChange={(e) => setBranch(e.target.value)} style={{ ...inputStyle, minWidth: 220 }}>
              {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_id} — {b.name}</option>)}
            </select>
          </Field>
          <Field label="Target flow">
            <select value={target} onChange={(e) => setTarget(e.target.value)} style={inputStyle}>
              <option value="withdrawal">Withdrawal</option>
              <option value="deposit">Deposit</option>
            </select>
          </Field>
          <Field label={`Horizon: ${horizon}d`}>
            <input type="range" min={config?.horizon.min || 1} max={config?.horizon.max || 14} value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))} style={{ width: 120 }} />
          </Field>
          <Field label={`Backtest origins: ${origins}`}>
            <input type="range" min={config?.origins.min || 1} max={config?.origins.max || 12} value={origins}
              onChange={(e) => setOrigins(Number(e.target.value))} style={{ width: 120 }} />
          </Field>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {['xgboost', 'sarima', 'prophet'].map((m) => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: models.includes(m) ? MODEL_COLORS[m] : theme.textSecondary, fontFamily: theme.mono, cursor: 'pointer' }}>
                <input type="checkbox" checked={models.includes(m)} onChange={() => toggleModel(m)} />
                {MODEL_LABELS[m]}
              </label>
            ))}
          </div>
          <button onClick={run} disabled={running || !branch}
            style={{ backgroundColor: running ? theme.border : theme.gold, color: running ? theme.textSecondary : '#0a0e17', border: 'none', borderRadius: 6, padding: '9px 22px', fontSize: 12, fontWeight: 700, fontFamily: theme.mono, cursor: running ? 'default' : 'pointer' }}>
            {running ? 'Training…' : 'Run Comparison'}
          </button>
        </div>

        {/* Per-model hyperparameters */}
        {params && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 18, paddingTop: 16, borderTop: `1px solid ${theme.border}` }}>
            {models.includes('xgboost') && (
              <div>
                <div style={{ fontSize: 11, color: theme.gold, fontFamily: theme.mono, marginBottom: 8 }}>XGBoost</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Field label="n_estimators"><input type="number" value={params.xgboost.n_estimators} onChange={(e) => setParam('xgboost', 'n_estimators', Number(e.target.value))} style={inputStyle} /></Field>
                  <Field label="max_depth"><input type="number" value={params.xgboost.max_depth} onChange={(e) => setParam('xgboost', 'max_depth', Number(e.target.value))} style={inputStyle} /></Field>
                  <Field label="learning_rate"><input type="number" step="0.01" value={params.xgboost.learning_rate} onChange={(e) => setParam('xgboost', 'learning_rate', Number(e.target.value))} style={inputStyle} /></Field>
                </div>
              </div>
            )}
            {models.includes('sarima') && (
              <div>
                <div style={{ fontSize: 11, color: theme.cyan, fontFamily: theme.mono, marginBottom: 8 }}>SARIMA (p,d,q)(P,D,Q,s)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['p', 'd', 'q', 'P', 'D', 'Q', 's'].map((k) => (
                    <Field key={k} label={k}><input type="number" value={params.sarima[k]} onChange={(e) => setParam('sarima', k, Number(e.target.value))} style={{ ...inputStyle, minWidth: 48 }} /></Field>
                  ))}
                </div>
              </div>
            )}
            {models.includes('prophet') && (
              <div>
                <div style={{ fontSize: 11, color: theme.purple, fontFamily: theme.mono, marginBottom: 8 }}>Prophet</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Field label="seasonality">
                    <select value={params.prophet.seasonality_mode} onChange={(e) => setParam('prophet', 'seasonality_mode', e.target.value)} style={inputStyle}>
                      <option value="additive">additive</option>
                      <option value="multiplicative">multiplicative</option>
                    </select>
                  </Field>
                  <Field label="weekly"><input type="checkbox" checked={params.prophet.weekly_seasonality} onChange={(e) => setParam('prophet', 'weekly_seasonality', e.target.checked)} style={{ marginTop: 8 }} /></Field>
                  <Field label="yearly"><input type="checkbox" checked={params.prophet.yearly_seasonality} onChange={(e) => setParam('prophet', 'yearly_seasonality', e.target.checked)} style={{ marginTop: 8 }} /></Field>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: `1px solid ${theme.red}55`, borderRadius: 8, padding: '12px 16px', color: theme.red, fontSize: 13, marginBottom: 18 }}>
          {error}
        </div>
      )}

      {running && !result && (
        <div style={{ color: theme.textSecondary, fontFamily: theme.mono, fontSize: 13, padding: '30px 0', textAlign: 'center' }}>
          Training {models.map((m) => MODEL_LABELS[m]).join(' · ')} over {origins} rolling origins…
        </div>
      )}

      {result && (
        <>
          {/* ── Leaderboard ── */}
          <Section
            title="Model Comparison"
            subtitle={`Rolling-origin backtest · ${result.meta.origins} origins · target = ${result.meta.target} flow (PKR M)`}
            right={result.best_model && (
              <button onClick={promote} disabled={promoting}
                title="Write this model's forward forecast to production — it will drive the vault base-stock target"
                style={{ backgroundColor: promoting ? theme.border : theme.green, color: promoting ? theme.textSecondary : '#0a0e17', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 11, fontWeight: 700, fontFamily: theme.mono, cursor: promoting ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                {promoting ? 'Promoting…' : `▲ Promote ${MODEL_LABELS[result.best_model]} to production`}
              </button>
            )}
          >
            {promoted && (
              <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, fontSize: 12,
                backgroundColor: promoted.error ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                border: `1px solid ${promoted.error ? theme.red : theme.green}55`,
                color: promoted.error ? theme.red : theme.green, fontFamily: theme.mono }}>
                {promoted.error
                  ? `Promotion failed: ${promoted.error}`
                  : `✓ ${promoted.model_version} promoted for ${promoted.branch_id} — ${promoted.rows_written} days written. ${promoted.note}`}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {Object.entries(result.models).map(([key, m]) => {
                const isBest = key === result.best_model
                return (
                  <div key={key} style={{ flex: '1 1 200px', minWidth: 190, backgroundColor: theme.bg, border: `1px solid ${isBest ? theme.green : theme.border}`, borderRadius: 8, padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: MODEL_COLORS[key], fontFamily: theme.mono }}>{MODEL_LABELS[key]}</span>
                      {isBest && <span style={{ fontSize: 9, fontWeight: 700, color: theme.green, border: `1px solid ${theme.green}55`, borderRadius: 4, padding: '2px 6px', fontFamily: theme.mono }}>BEST</span>}
                    </div>
                    {m.status === 'ok' ? (
                      <>
                        <div style={{ fontSize: 26, fontWeight: 700, color: theme.text, fontFamily: theme.mono }}>{m.metrics.mape}<span style={{ fontSize: 13, color: theme.textSecondary }}>% MAPE</span></div>
                        <div style={{ fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>Interval coverage: <span style={{ color: Math.abs(m.metrics.coverage_pct - 90) <= 10 ? theme.green : theme.amber }}>{m.metrics.coverage_pct}%</span> <span style={{ opacity: 0.6 }}>(nominal 90%)</span></div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: theme.red, fontFamily: theme.mono }}>{m.error}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>

          {/* ── Forecast vs actual ── */}
          <Section title="Forecast vs Actual" subtitle="Last backtest origin: each model's predicted path overlaid on the realised series.">
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData}>
                <CartesianGrid stroke={theme.border} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: theme.textSecondary, fontSize: 10 }} tickFormatter={(d) => d?.slice(5)} minTickGap={20} />
                <YAxis tick={{ fill: theme.textSecondary, fontSize: 10 }} width={48} />
                <Tooltip contentStyle={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="actual" name="Actual" stroke={theme.text} strokeWidth={2} dot={false} connectNulls />
                {okModels.map(([key]) => (
                  <Line key={key} type="monotone" dataKey={`${key}_yhat`} name={MODEL_LABELS[key]} stroke={MODEL_COLORS[key]} strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2 }} connectNulls />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </Section>

          {/* ── Accuracy by horizon ── */}
          <Section title="Accuracy by Horizon" subtitle="MAPE (%) at each forecast day — this is the accuracy degradation across the horizon you asked for.">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={horizonData}>
                <CartesianGrid stroke={theme.border} strokeDasharray="3 3" />
                <XAxis dataKey="h" tick={{ fill: theme.textSecondary, fontSize: 11 }} />
                <YAxis tick={{ fill: theme.textSecondary, fontSize: 10 }} width={40} label={{ value: 'MAPE %', angle: -90, position: 'insideLeft', fill: theme.textSecondary, fontSize: 10 }} />
                <Tooltip contentStyle={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {okModels.map(([key]) => <Bar key={key} dataKey={key} name={MODEL_LABELS[key]} fill={MODEL_COLORS[key]} radius={[3, 3, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </Section>

          {/* ── Feature importances + glossary ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>
            {importances.length > 0 && (
              <div style={{ flex: '1 1 460px' }}>
                <Section title="XGBoost Feature Importances" subtitle="What drives the gradient-boosted forecast (top 12).">
                  <ResponsiveContainer width="100%" height={Math.max(200, importances.length * 26)}>
                    <BarChart layout="vertical" data={importances} margin={{ left: 40 }}>
                      <XAxis type="number" tick={{ fill: theme.textSecondary, fontSize: 10 }} />
                      <YAxis type="category" dataKey="feature" tick={{ fill: theme.textSecondary, fontSize: 10 }} width={120} />
                      <Tooltip contentStyle={{ backgroundColor: theme.card, border: `1px solid ${theme.border}`, borderRadius: 6, fontSize: 12 }} />
                      <Bar dataKey="importance" fill={theme.gold} radius={[0, 3, 3, 0]}>
                        {importances.map((_, i) => <Cell key={i} fill={i === 0 ? theme.gold : `${theme.gold}bb`} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Section>
              </div>
            )}
            <div style={{ flex: '1 1 380px' }}>
              <Section title="How Each Model Works" subtitle="Feature set & mechanism.">
                <div style={{ fontSize: 12, color: theme.text, lineHeight: 1.7 }}>
                  <p style={{ margin: '0 0 10px' }}><span style={{ color: theme.gold, fontFamily: theme.mono }}>XGBoost</span> — direct multi-horizon gradient boosting; horizon <code>h</code> is a feature. Uses:</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                    {result.feature_glossary.origin_features.concat(result.feature_glossary.calendar_features).map((f) => (
                      <span key={f} style={{ fontSize: 10, fontFamily: theme.mono, color: theme.textSecondary, backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: 4, padding: '2px 6px' }}>{f}</span>
                    ))}
                  </div>
                  <p style={{ margin: '0 0 8px' }}><span style={{ color: theme.cyan, fontFamily: theme.mono }}>SARIMA</span> — univariate; models trend + weekly seasonality on the flow series directly (statsmodels SARIMAX).</p>
                  <p style={{ margin: 0 }}><span style={{ color: theme.purple, fontFamily: theme.mono }}>Prophet</span> — additive/multiplicative trend + weekly &amp; yearly seasonality on the raw series.</p>
                </div>
              </Section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

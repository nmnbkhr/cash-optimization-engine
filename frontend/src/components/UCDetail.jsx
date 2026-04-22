import { ArrowLeft } from 'lucide-react'
import {
  Vault, CreditCard, GitBranch, TrendingUp, Globe, Shield,
  Layers, Truck, Smartphone, BarChart3
} from 'lucide-react'
import useAppStore from '../stores/appStore'
import { useCases } from '../data/useCases'
import Badge from './common/Badge'
import UC01Dashboard from './uc01/UC01Dashboard'
import UC02Dashboard from './uc02/UC02Dashboard'
import UC03Dashboard from './uc03/UC03Dashboard'
import UC04Dashboard from './uc04/UC04Dashboard'
import UC05Dashboard from './uc05/UC05Dashboard'
import UC06Dashboard from './uc06/UC06Dashboard'
import UC07Dashboard from './uc07/UC07Dashboard'
import UC08Dashboard from './uc08/UC08Dashboard'
import UC09Dashboard from './uc09/UC09Dashboard'
import UC10Dashboard from './uc10/UC10Dashboard'

const iconMap = {
  Vault, CreditCard, GitBranch, TrendingUp, Globe, Shield,
  Layers, Truck, Smartphone, BarChart3,
}

export default function UCDetail() {
  const { currentUC, setCurrentUC } = useAppStore()
  const uc = useCases.find((u) => u.id === currentUC)

  if (!uc) return null

  // Route UC-01 to its full dashboard
  if (currentUC === 'uc01') {
    return (
      <div>
        {/* Back button */}
        <button
          className="flex items-center gap-2 mb-4 text-sm cursor-pointer transition-colors"
          style={{ color: '#8b949e', background: 'none', border: 'none' }}
          onClick={() => setCurrentUC('catalog')}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a853')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </button>
        <UC01Dashboard />
      </div>
    )
  }

  // Route UC-02 to its full dashboard
  if (currentUC === 'uc02') {
    return (
      <div>
        {/* Back button */}
        <button
          className="flex items-center gap-2 mb-4 text-sm cursor-pointer transition-colors"
          style={{ color: '#8b949e', background: 'none', border: 'none' }}
          onClick={() => setCurrentUC('catalog')}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a853')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </button>
        <UC02Dashboard />
      </div>
    )
  }

  // Route UC-03 to its full dashboard
  if (currentUC === 'uc03') {
    return (
      <div>
        {/* Back button */}
        <button
          className="flex items-center gap-2 mb-4 text-sm cursor-pointer transition-colors"
          style={{ color: '#8b949e', background: 'none', border: 'none' }}
          onClick={() => setCurrentUC('catalog')}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a853')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </button>
        <UC03Dashboard />
      </div>
    )
  }

  // Route UC-04 to its full dashboard
  if (currentUC === 'uc04') {
    return (
      <div>
        {/* Back button */}
        <button
          className="flex items-center gap-2 mb-4 text-sm cursor-pointer transition-colors"
          style={{ color: '#8b949e', background: 'none', border: 'none' }}
          onClick={() => setCurrentUC('catalog')}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a853')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </button>
        <UC04Dashboard />
      </div>
    )
  }

  // Route UC-05 to its full dashboard
  if (currentUC === 'uc05') {
    return (
      <div>
        {/* Back button */}
        <button
          className="flex items-center gap-2 mb-4 text-sm cursor-pointer transition-colors"
          style={{ color: '#8b949e', background: 'none', border: 'none' }}
          onClick={() => setCurrentUC('catalog')}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a853')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </button>
        <UC05Dashboard />
      </div>
    )
  }

  // Route UC-06 to its full dashboard
  if (currentUC === 'uc06') {
    return (
      <div>
        {/* Back button */}
        <button
          className="flex items-center gap-2 mb-4 text-sm cursor-pointer transition-colors"
          style={{ color: '#8b949e', background: 'none', border: 'none' }}
          onClick={() => setCurrentUC('catalog')}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a853')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </button>
        <UC06Dashboard />
      </div>
    )
  }

  // Route UC-07 to its full dashboard
  if (currentUC === 'uc07') {
    return (
      <div>
        {/* Back button */}
        <button
          className="flex items-center gap-2 mb-4 text-sm cursor-pointer transition-colors"
          style={{ color: '#8b949e', background: 'none', border: 'none' }}
          onClick={() => setCurrentUC('catalog')}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a853')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </button>
        <UC07Dashboard />
      </div>
    )
  }

  // Route UC-08 to its full dashboard
  if (currentUC === 'uc08') {
    return (
      <div>
        {/* Back button */}
        <button
          className="flex items-center gap-2 mb-4 text-sm cursor-pointer transition-colors"
          style={{ color: '#8b949e', background: 'none', border: 'none' }}
          onClick={() => setCurrentUC('catalog')}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a853')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </button>
        <UC08Dashboard />
      </div>
    )
  }

  // Route UC-09 to its full dashboard
  if (currentUC === 'uc09') {
    return (
      <div>
        {/* Back button */}
        <button
          className="flex items-center gap-2 mb-4 text-sm cursor-pointer transition-colors"
          style={{ color: '#8b949e', background: 'none', border: 'none' }}
          onClick={() => setCurrentUC('catalog')}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a853')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </button>
        <UC09Dashboard />
      </div>
    )
  }

  // Route UC-10 to its full dashboard
  if (currentUC === 'uc10') {
    return (
      <div>
        {/* Back button */}
        <button
          className="flex items-center gap-2 mb-4 text-sm cursor-pointer transition-colors"
          style={{ color: '#8b949e', background: 'none', border: 'none' }}
          onClick={() => setCurrentUC('catalog')}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a853')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
        >
          <ArrowLeft size={16} />
          Back to Catalog
        </button>
        <UC10Dashboard />
      </div>
    )
  }

  const Icon = iconMap[uc.icon] || BarChart3
  const metricEntries = Object.entries(uc.metrics)

  return (
    <div>
      {/* Back button */}
      <button
        className="flex items-center gap-2 mb-6 text-sm cursor-pointer transition-colors"
        style={{ color: '#8b949e', background: 'none', border: 'none' }}
        onClick={() => setCurrentUC('catalog')}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#d4a853')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#8b949e')}
      >
        <ArrowLeft size={16} />
        Back to Catalog
      </button>

      {/* UC Header */}
      <div
        className="rounded-lg p-6 mb-6 border"
        style={{ backgroundColor: '#141a23', borderColor: '#1e293b' }}
      >
        <div className="flex items-start gap-4 mb-4">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: uc.color + '15' }}
          >
            <Icon size={24} style={{ color: uc.color }} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <span
                className="text-xs font-mono font-bold px-2 py-0.5 rounded"
                style={{ backgroundColor: uc.color + '20', color: uc.color }}
              >
                {uc.id.toUpperCase()}
              </span>
              <Badge
                label={uc.status}
                color={uc.status === 'active' ? '#22c55e' : uc.status === 'live' ? '#22c55e' : '#6b7280'}
              />
            </div>
            <h2 className="text-xl font-bold" style={{ color: '#e8eaed' }}>
              {uc.title}
            </h2>
            <p
              className="text-sm font-mono mt-1"
              style={{ color: '#8b949e' }}
            >
              {uc.subtitle}
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed mb-4" style={{ color: '#8b949e' }}>
          {uc.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {uc.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2.5 py-1 rounded"
              style={{
                backgroundColor: '#0a0e17',
                color: '#8b949e',
                border: '1px solid #1e293b',
              }}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Metrics strip */}
        <div
          className="grid gap-4 p-4 rounded-lg"
          style={{
            backgroundColor: '#0f1419',
            gridTemplateColumns: `repeat(${Math.min(metricEntries.length, 4)}, 1fr)`,
          }}
        >
          {metricEntries.map(([key, value]) => (
            <div key={key} className="text-center">
              <p
                className="text-lg font-bold"
                style={{ color: uc.color, fontFamily: "'JetBrains Mono', monospace" }}
              >
                {value}
              </p>
              <p className="text-xs capitalize mt-1" style={{ color: '#6b7280' }}>
                {key.replace(/_/g, ' ')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Coming Soon Placeholder */}
      <div
        className="rounded-lg border border-dashed p-12 flex flex-col items-center justify-center"
        style={{ borderColor: '#1e293b', backgroundColor: '#0f1419' }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{ backgroundColor: uc.color + '10' }}
        >
          <Icon size={32} style={{ color: uc.color, opacity: 0.5 }} />
        </div>
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: '#e8eaed' }}
        >
          Dashboard Coming Soon
        </h3>
        <p className="text-sm text-center max-w-md" style={{ color: '#6b7280' }}>
          The full interactive dashboard for {uc.title} is under development.
          It will include optimization controls, forecasting charts, game theory analysis, and AI-powered executive briefs.
        </p>
        <div
          className="mt-6 px-4 py-2 rounded text-xs font-mono"
          style={{ backgroundColor: '#141a23', color: '#8b949e', border: '1px solid #1e293b' }}
        >
          Status: {uc.status.toUpperCase()}
        </div>
      </div>
    </div>
  )
}

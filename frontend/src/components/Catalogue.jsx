import {
  Vault, CreditCard, GitBranch, TrendingUp, Globe, Shield,
  Layers, Truck, Smartphone, BarChart3
} from 'lucide-react'
import { useCases } from '../data/useCases'
import useAppStore from '../stores/appStore'
import Badge from './common/Badge'

const iconMap = {
  Vault, CreditCard, GitBranch, TrendingUp, Globe, Shield,
  Layers, Truck, Smartphone, BarChart3,
}

export default function Catalogue() {
  const setCurrentUC = useAppStore((s) => s.setCurrentUC)

  return (
    <div>
      <div className="mb-6">
        <h2
          className="text-lg font-bold tracking-wide"
          style={{ color: '#e8eaed' }}
        >
          Cash Optimization Use Cases
        </h2>
        <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
          10 optimization engines covering branch vaults, ATMs, CRR, nostro/vostro, CIT logistics, and more.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {useCases.map((uc) => {
          const Icon = iconMap[uc.icon] || BarChart3
          const metricEntries = Object.entries(uc.metrics)

          return (
            <div
              key={uc.id}
              className="rounded-lg p-5 cursor-pointer transition-all duration-200 border group"
              style={{
                backgroundColor: '#141a23',
                borderColor: '#1e293b',
              }}
              onClick={() => setCurrentUC(uc.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = uc.color
                e.currentTarget.style.backgroundColor = '#1a2230'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1e293b'
                e.currentTarget.style.backgroundColor = '#141a23'
              }}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: uc.color + '15' }}
                  >
                    <Icon size={18} style={{ color: uc.color }} />
                  </div>
                  <div>
                    <p
                      className="text-xs font-mono font-semibold"
                      style={{ color: uc.color }}
                    >
                      {uc.id.toUpperCase()}
                    </p>
                    <h3 className="text-sm font-semibold" style={{ color: '#e8eaed' }}>
                      {uc.title}
                    </h3>
                  </div>
                </div>
                <Badge
                  label={uc.status}
                  color={uc.status === 'live' ? '#22c55e' : '#6b7280'}
                />
              </div>

              {/* Subtitle */}
              <p
                className="text-xs font-mono mb-2"
                style={{ color: '#8b949e' }}
              >
                {uc.subtitle}
              </p>

              {/* Description */}
              <p className="text-xs leading-relaxed mb-4" style={{ color: '#6b7280' }}>
                {uc.description}
              </p>

              {/* Metrics */}
              <div
                className="grid gap-2 mb-3 p-3 rounded"
                style={{
                  backgroundColor: '#0f1419',
                  gridTemplateColumns: `repeat(${Math.min(metricEntries.length, 3)}, 1fr)`,
                }}
              >
                {metricEntries.map(([key, value]) => (
                  <div key={key} className="text-center">
                    <p
                      className="text-sm font-bold"
                      style={{ color: uc.color, fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {value}
                    </p>
                    <p className="text-xs capitalize" style={{ color: '#6b7280' }}>
                      {key.replace(/_/g, ' ')}
                    </p>
                  </div>
                ))}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {uc.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded"
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
            </div>
          )
        })}
      </div>
    </div>
  )
}

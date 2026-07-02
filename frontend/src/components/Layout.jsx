import { useMemo, useState, useEffect } from 'react'
import axios from 'axios'
import {
  Vault, CreditCard, GitBranch, TrendingUp, Globe, Shield,
  Layers, Truck, Smartphone, BarChart3, LayoutGrid, ChevronRight, PieChart,
  Building2, MapPin, Landmark, Target, ShieldCheck, LineChart,
  Route, MonitorSmartphone, Map, Activity, Grid3x3, BarChart2,
  Gauge, Globe2, ClipboardCheck, SlidersHorizontal, Bell, Zap,
  Cpu, ArrowLeftRight, Calendar, ChevronDown
} from 'lucide-react'
import useAppStore from '../stores/appStore'
import { useCases } from '../data/useCases'
import Catalogue from './Catalogue'
import UCDetail from './UCDetail'
import ExecutiveSummary from './ExecutiveSummary'
import ConsolidatedDashboard from './business/ConsolidatedDashboard'
import BranchPlanView from './business/BranchPlanView'
import TreasuryView from './business/TreasuryView'
import RegionalView from './business/RegionalView'
import ReconciliationSheet from './business/ReconciliationSheet'
import RatesSheet from './business/RatesSheet'
import CITRouteSheet from './business/CITRouteSheet'
import DigitalShiftReport from './business/DigitalShiftReport'
import BranchMapView from './business/BranchMapView'
import CashPulse from './business/CashPulse'
import VaultHeatmap from './business/VaultHeatmap'
import PnLWaterfall from './business/PnLWaterfall'
import CRRGauge from './business/CRRGauge'
import NostroMap from './business/NostroMap'
import BranchScorecard from './business/BranchScorecard'
import WhatIfSimulator from './business/WhatIfSimulator'
import AlertsPanel from './business/AlertsPanel'
import CommandCenter from './business/CommandCenter'
import ForecastDashboard from './business/ForecastDashboard'
import CDMPlan from './business/CDMPlan'
import IECHub from './business/IECHub'
import ComplianceMonitor from './business/ComplianceMonitor'
import SeasonalPrep from './business/SeasonalPrep'
import ExceptionsQueue from './business/ExceptionsQueue'
import DataHealth from './business/DataHealth'
import SchemaBrowser from './business/SchemaBrowser'
import { UC_DATA_STATUS } from '../data/ucDataStatus'

/* ─── Icon lookup for nav config ─── */
const ICONS = {
  Zap, Bell, Building2, Route, TrendingUp, Target, MapPin, Activity,
  Grid3x3, Map, Landmark, ArrowLeftRight, LineChart, SlidersHorizontal,
  Calendar, MonitorSmartphone, Cpu, BarChart2, PieChart, Shield,
  ShieldCheck, LayoutGrid, Vault, CreditCard, GitBranch, Globe,
  Layers, Truck, Smartphone, BarChart3,
}

/* ─── UC icon map (for header badge) ─── */
const ucIconMap = {
  Vault, CreditCard, GitBranch, TrendingUp, Globe, Shield,
  Layers, Truck, Smartphone, BarChart3,
}

/* ─── Roles ─── */
const ROLES = [
  { value: 'SUPERUSER', label: 'Superuser (All Pages)' },
  { value: 'BRANCH_MANAGER', label: 'Branch Manager' },
  { value: 'REGIONAL_HEAD', label: 'Regional Head' },
  { value: 'TREASURY', label: 'Treasury' },
  { value: 'CFO', label: 'CFO / ALCO' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'COMPLIANCE', label: 'Compliance' },
]

/* ─── Navigation structure ─── */
const NAV_CONFIG = [
  {
    group: null,
    items: [
      { id: 'biz-command', label: 'Command Center', icon: 'Zap', roles: '*' },
      { id: 'biz-exceptions', label: 'Exceptions Queue', icon: 'ShieldCheck', roles: '*' },
      { id: 'biz-alerts', label: 'Alerts', icon: 'Bell', roles: '*', badge: true },
    ],
  },
  {
    group: 'daily',
    label: 'Daily Operations',
    roles: '*',
    items: [
      { id: 'biz-branch', label: 'Branch Action Plan', icon: 'Building2', roles: '*' },
      { id: 'biz-cit', label: 'CIT & Fleet', icon: 'Route', roles: ['SUPERUSER', 'OPERATIONS', 'BRANCH_MANAGER', 'REGIONAL_HEAD'] },
      { id: 'biz-forecast', label: 'Forecast', icon: 'TrendingUp', roles: ['SUPERUSER', 'TREASURY', 'CFO', 'REGIONAL_HEAD'] },
    ],
  },
  {
    group: 'monitoring',
    label: 'Monitoring',
    roles: ['SUPERUSER', 'CFO', 'REGIONAL_HEAD', 'TREASURY'],
    items: [
      { id: 'biz-dashboard', label: 'Dashboard', icon: 'Target', roles: ['SUPERUSER', 'CFO', 'REGIONAL_HEAD', 'TREASURY'] },
      { id: 'biz-regional', label: 'Regional View', icon: 'MapPin', roles: ['SUPERUSER', 'REGIONAL_HEAD', 'CFO'] },
      { id: 'biz-pulse', label: 'Cash Pulse', icon: 'Activity', roles: ['SUPERUSER', 'CFO'] },
      { id: 'biz-heatmap', label: 'Vault Heatmap', icon: 'Grid3x3', roles: ['SUPERUSER', 'REGIONAL_HEAD', 'CFO'] },
      { id: 'biz-map', label: 'Branch Network', icon: 'Map', roles: ['SUPERUSER', 'REGIONAL_HEAD'] },
    ],
  },
  {
    group: 'treasury',
    label: 'Treasury',
    roles: ['SUPERUSER', 'TREASURY', 'CFO'],
    items: [
      { id: 'biz-treasury', label: 'Treasury Desk', icon: 'Landmark', roles: ['SUPERUSER', 'TREASURY', 'CFO'] },
      { id: 'biz-iec', label: 'IEC Swap Hub', icon: 'ArrowLeftRight', roles: ['SUPERUSER', 'TREASURY'] },
      { id: 'biz-rates', label: 'SBP Rates', icon: 'LineChart', roles: ['SUPERUSER', 'TREASURY', 'CFO'] },
    ],
  },
  {
    group: 'planning',
    label: 'Planning & Analysis',
    roles: ['SUPERUSER', 'CFO', 'TREASURY', 'REGIONAL_HEAD'],
    items: [
      { id: 'biz-simulator', label: 'What-If Simulator', icon: 'SlidersHorizontal', roles: ['SUPERUSER', 'CFO', 'TREASURY'] },
      { id: 'biz-seasonal', label: 'Seasonal Prep', icon: 'Calendar', roles: ['SUPERUSER', 'TREASURY', 'REGIONAL_HEAD'] },
      { id: 'biz-digital', label: 'Digital Shift', icon: 'MonitorSmartphone', roles: ['SUPERUSER', 'CFO', 'OPERATIONS'] },
      { id: 'biz-cdm', label: 'CDM Deployment', icon: 'Cpu', roles: ['SUPERUSER', 'OPERATIONS', 'COMPLIANCE'] },
      { id: 'biz-waterfall', label: 'P&L Value Realized', icon: 'BarChart2', roles: ['SUPERUSER', 'CFO'] },
      { id: 'executive', label: 'Executive Summary', icon: 'PieChart', roles: ['SUPERUSER', 'CFO'] },
    ],
  },
  {
    group: 'compliance',
    label: 'Compliance & Data',
    roles: ['SUPERUSER', 'COMPLIANCE', 'CFO', 'TREASURY'],
    items: [
      { id: 'biz-compliance', label: 'Compliance Monitor', icon: 'Shield', roles: ['SUPERUSER', 'COMPLIANCE', 'CFO'] },
      { id: 'biz-recon', label: 'Data Reconciliation', icon: 'ShieldCheck', roles: ['SUPERUSER', 'COMPLIANCE'] },
      { id: 'biz-datahealth', label: 'Data Health & Lineage', icon: 'Activity', roles: ['SUPERUSER', 'COMPLIANCE', 'CFO', 'TREASURY'] },
      { id: 'biz-schema', label: 'Schema Browser', icon: 'Grid3x3', roles: ['SUPERUSER', 'COMPLIANCE', 'TREASURY'] },
    ],
  },
  {
    group: 'technical',
    label: 'Technical · Methodology',
    roles: ['SUPERUSER'],
    items: [
      { id: 'catalog', label: 'Use Case Catalog', icon: 'LayoutGrid', roles: ['SUPERUSER'] },
      { id: 'uc01', label: 'UC-01 Vault Forecast', icon: 'Vault', roles: ['SUPERUSER'] },
      { id: 'uc02', label: 'UC-02 ATM Replenish', icon: 'CreditCard', roles: ['SUPERUSER'] },
      { id: 'uc03', label: 'UC-03 Netting', icon: 'GitBranch', roles: ['SUPERUSER'] },
      { id: 'uc04', label: 'UC-04 CRR Float', icon: 'TrendingUp', roles: ['SUPERUSER'] },
      { id: 'uc05', label: 'UC-05 Nostro', icon: 'Globe', roles: ['SUPERUSER'] },
      { id: 'uc06', label: 'UC-06 Vostro', icon: 'Shield', roles: ['SUPERUSER'] },
      { id: 'uc07', label: 'UC-07 Denomination', icon: 'Layers', roles: ['SUPERUSER'] },
      { id: 'uc08', label: 'UC-08 CIT Routing', icon: 'Truck', roles: ['SUPERUSER'] },
      { id: 'uc09', label: 'UC-09 Digital', icon: 'Smartphone', roles: ['SUPERUSER'] },
      { id: 'uc10', label: 'UC-10 P&L', icon: 'BarChart3', roles: ['SUPERUSER'] },
    ],
  },
]

/* ─── Header title lookup ─── */
const HEADER_TITLES = {
  executive: 'Executive Strategy Summary',
  catalog: 'Use Case Catalog',
  'biz-dashboard': 'Consolidated Dashboard',
  'biz-branch': 'Branch Manager Plan',
  'biz-treasury': 'Treasury Desk',
  'biz-regional': 'Regional View',
  'biz-command': 'Command Center',
  'biz-exceptions': 'Exceptions Queue — Human-in-the-Loop Oversight',
  'biz-forecast': 'Forecast Dashboard',
  'biz-pulse': 'Cash Pulse',
  'biz-heatmap': 'Vault Health Heatmap',
  'biz-waterfall': 'P&L Waterfall',
  'biz-gauge': 'CRR Compliance Gauge',
  'biz-nostro-map': 'Nostro World Map',
  'biz-scorecard': 'Branch Scorecard',
  'biz-map': 'Branch Network Map',
  'biz-rates': 'SBP Rates Dashboard',
  'biz-cit': 'CIT Route Sheet',
  'biz-digital': 'Digital Shift Report',
  'biz-simulator': 'What-If Simulator',
  'biz-alerts': 'Alerts & Exceptions',
  'biz-recon': 'Data Reconciliation',
  'biz-cdm': 'CDM Deployment & Recycling',
  'biz-iec': 'IEC Swap Hub',
  'biz-compliance': 'CMS Compliance',
  'biz-seasonal': 'Seasonal Peak Preparation',
  'biz-datahealth': 'Data Health & Lineage',
  'biz-schema': 'Database Schema Browser',
}

/* ─── Visibility helper ─── */
function isVisible(roleSpec, currentRole) {
  if (roleSpec === '*') return true
  if (Array.isArray(roleSpec)) return roleSpec.includes(currentRole)
  return false
}

export default function Layout() {
  const {
    currentUC, setCurrentUC,
    role, setRole,
    collapsedGroups, toggleGroup,
    alertBadgeCount, setAlertBadgeCount,
  } = useAppStore()
  const [rates, setRates] = useState(null)

  useEffect(() => {
    axios.get('/api/business/rates').then(r => setRates(r.data)).catch(() => {})
    const interval = setInterval(() => {
      axios.get('/api/business/rates').then(r => setRates(r.data)).catch(() => {})
    }, 3600000)
    return () => clearInterval(interval)
  }, [])

  // Alert badge count
  useEffect(() => {
    axios.get('/api/business/alerts/count')
      .then(r => setAlertBadgeCount(r.data?.total || 0))
      .catch(() => {})
    const iv = setInterval(() => {
      axios.get('/api/business/alerts/count')
        .then(r => setAlertBadgeCount(r.data?.total || 0))
        .catch(() => {})
    }, 60000)
    return () => clearInterval(iv)
  }, [setAlertBadgeCount])

  const activeUC = useMemo(
    () => useCases.find((uc) => uc.id === currentUC),
    [currentUC]
  )

  // Count visible items for role selector footer
  const visibleCount = NAV_CONFIG.reduce((sum, section) => {
    if (!isVisible(section.roles || '*', role)) return sum
    return sum + section.items.filter(i => isVisible(i.roles, role)).length
  }, 0)

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ backgroundColor: '#0a0e17' }}>
      {/* ═══════════════════ SIDEBAR ═══════════════════ */}
      <aside
        className="flex flex-col w-64 min-w-[256px] border-r"
        style={{ backgroundColor: '#0f1419', borderColor: '#1e293b' }}
      >
        {/* Logo / Header */}
        <div
          className="px-4 py-4 border-b cursor-pointer"
          style={{ borderColor: '#1e293b' }}
          onClick={() => setCurrentUC('executive')}
        >
          {/* Godaitec Logo */}
          <svg viewBox="0 0 200 44" style={{ width: 140, height: 30, marginBottom: 8 }}>
            {/* Circle with kanji */}
            <circle cx="22" cy="22" r="19" fill="#e05a4e" />
            <circle cx="22" cy="22" r="21" fill="none" stroke="#8b949e" strokeWidth="1.5" />
            <text x="22" y="28" textAnchor="middle" fill="#fff" fontSize="16" fontWeight="700" fontFamily="serif">五大</text>
            {/* godaitec text */}
            <text x="50" y="30" fill="#e8eaed" fontSize="22" fontWeight="700" fontFamily="'DM Sans', sans-serif" letterSpacing="-0.5">
              godaitec
            </text>
            <line x1="50" y1="35" x2="128" y2="35" stroke="#e05a4e" strokeWidth="1.5" />
          </svg>
          <h1
            className="text-xs font-bold tracking-widest"
            style={{ color: '#d4a853', fontFamily: "'JetBrains Mono', monospace" }}
          >
            CASH OPTIMIZATION ENGINE
          </h1>
        </div>

        {/* Navigation — grouped, collapsible, role-filtered */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_CONFIG.map((section, si) => {
            // Skip entire group if role can't see it
            const groupRoles = section.roles || '*'
            if (!isVisible(groupRoles, role)) return null

            const items = section.items.filter(i => isVisible(i.roles, role))
            if (items.length === 0) return null

            const isCollapsed = section.group ? !!collapsedGroups[section.group] : false
            const isTechnical = section.group === 'technical'

            return (
              <div key={si} className={section.group ? 'mt-1' : ''}>
                {/* Group header (collapsible) */}
                {section.group && (
                  <button
                    onClick={() => toggleGroup(section.group)}
                    className="w-full flex items-center justify-between px-4 py-1.5 mt-2 mb-0.5 cursor-pointer"
                    style={{ background: 'none', border: 'none' }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        color: isTechnical ? '#6b7280' : '#8b949e',
                      }}
                    >
                      {section.label}
                    </span>
                    <ChevronDown
                      size={11}
                      style={{
                        color: '#6b7280',
                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  </button>
                )}

                {/* Items */}
                {!isCollapsed && items.map(item => {
                  const Icon = ICONS[item.icon]
                  const isActive = currentUC === item.id

                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 mx-2 px-2 py-2 cursor-pointer transition-colors"
                      style={{
                        backgroundColor: isActive ? '#d4a85312' : 'transparent',
                        borderRadius: 6,
                        borderLeft: isActive ? '2px solid #d4a853' : '2px solid transparent',
                      }}
                      onClick={() => setCurrentUC(item.id)}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = '#141a23' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      {Icon && (
                        <Icon
                          size={14}
                          style={{
                            color: isActive ? '#d4a853' : isTechnical ? '#6b7280' : '#8b949e',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <span
                        className="truncate"
                        style={{
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 500,
                          color: isActive ? '#e8eaed' : isTechnical ? '#8b949e' : '#c9d1d9',
                          fontFamily: isTechnical ? "'JetBrains Mono', monospace" : 'inherit',
                        }}
                      >
                        {item.label}
                      </span>

                      {/* Alert badge */}
                      {item.badge && alertBadgeCount > 0 && (
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontSize: 10,
                            fontFamily: "'JetBrains Mono', monospace",
                            fontWeight: 700,
                            backgroundColor: '#ef444425',
                            color: '#ef4444',
                            padding: '1px 7px',
                            borderRadius: 10,
                          }}
                        >
                          {alertBadgeCount}
                        </span>
                      )}

                      {/* Active indicator */}
                      {isActive && !item.badge && (
                        <ChevronRight
                          size={10}
                          style={{ color: '#d4a853', flexShrink: 0, marginLeft: 'auto' }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </nav>

        {/* ─── Role Selector (footer) ─── */}
        <div className="border-t px-3 py-3" style={{ borderColor: '#1e293b' }}>
          <label
            style={{
              display: 'block',
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: '#6b7280',
              marginBottom: 5,
            }}
          >
            View As
          </label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#0a0e17',
              border: '1px solid #1e293b',
              borderRadius: 6,
              fontSize: 12,
              fontFamily: "'JetBrains Mono', monospace",
              color: '#c9d1d9',
              padding: '6px 10px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          {role !== 'SUPERUSER' && (
            <p
              style={{
                fontSize: 10,
                fontFamily: "'JetBrains Mono', monospace",
                color: '#6b7280',
                marginTop: 5,
              }}
            >
              Showing {visibleCount} of 35 pages
            </p>
          )}
          {/* Branding links */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <a
                href="https://www.godai.tech"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 10, color: '#6b7280', textDecoration: 'none', fontFamily: "'JetBrains Mono', monospace" }}
              >
                godai.tech
              </a>
              <span style={{ color: '#374151', fontSize: 10 }}>|</span>
              <a
                href="mailto:info@godai.tech"
                style={{ fontSize: 10, color: '#6b7280', textDecoration: 'none', fontFamily: "'JetBrains Mono', monospace" }}
              >
                info@godai.tech
              </a>
              <span style={{ color: '#374151', fontSize: 10 }}>|</span>
              <a
                href="https://linkedin.com/company/godaitec-private-limited"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 10, color: '#6b7280', textDecoration: 'none', fontFamily: "'JetBrains Mono', monospace" }}
              >
                LinkedIn
              </a>
            </div>
            <p style={{ fontSize: 9, color: '#374151', marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
              v0.1.0-alpha
            </p>
          </div>
        </div>
      </aside>

      {/* ═══════════════════ MAIN CONTENT ═══════════════════ */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <header
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b"
          style={{ backgroundColor: '#0f1419', borderColor: '#1e293b' }}
        >
          <div>
            {activeUC ? (
              <div className="flex items-center gap-3">
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ backgroundColor: activeUC.color + '20', color: activeUC.color }}
                >
                  {activeUC.id.toUpperCase()}
                </span>
                <span className="text-sm font-semibold" style={{ color: '#e8eaed' }}>
                  {activeUC.title}
                </span>
                <span className="text-xs" style={{ color: '#6b7280' }}>
                  {activeUC.subtitle}
                </span>
                {UC_DATA_STATUS[currentUC] && (
                  <span
                    title={`Data provenance: ${UC_DATA_STATUS[currentUC].tier}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                      color: UC_DATA_STATUS[currentUC].color,
                      background: UC_DATA_STATUS[currentUC].color + '18',
                      border: `1px solid ${UC_DATA_STATUS[currentUC].color}44`,
                      borderRadius: 5, padding: '2px 8px', textTransform: 'uppercase',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: UC_DATA_STATUS[currentUC].color }} />
                    {UC_DATA_STATUS[currentUC].label}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm font-semibold" style={{ color: '#e8eaed' }}>
                {HEADER_TITLES[currentUC] || 'Use Case Catalog'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {rates && (
              <div className="flex items-center gap-3 mr-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                <span className="text-xs" style={{ color: '#d4a853' }}>
                  KIBOR {rates.kibor_6m}%
                </span>
                <span className="text-xs" style={{ color: '#8b949e' }}>|</span>
                <span className="text-xs" style={{ color: '#e8eaed' }}>
                  Policy {rates.policy_rate}%
                </span>
                <span className="text-xs" style={{ color: '#8b949e' }}>|</span>
                <span className="text-xs" style={{ color: '#e8eaed' }}>
                  USD/PKR {rates.fx?.USD?.toFixed(1)}
                </span>
                <span className="text-xs" style={{ color: '#8b949e' }}>|</span>
                <span className="text-xs" style={{ color: '#6b7280' }}>
                  {rates.data_source}
                </span>
              </div>
            )}
            <span
              className="text-xs px-2 py-1 rounded"
              style={{ backgroundColor: '#141a23', color: '#8b949e' }}
            >
              10 Use Cases
            </span>
          </div>
        </header>

        {/* Disclaimer Banner */}
        <div
          style={{
            backgroundColor: '#f59e0b15',
            borderBottom: '1px solid #f59e0b33',
            padding: '6px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ color: '#f59e0b', fontSize: 13 }}>&#9888;</span>
          <span style={{
            color: '#f59e0b',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 500,
          }}>
            DEMO MODE — All data shown is synthetic and for demonstration purposes only. No real bank data is used.
          </span>
        </div>

        {/* Content — ternary chain UNCHANGED */}
        <div className="p-6">
          {currentUC === 'executive' ? <ExecutiveSummary />
            : currentUC === 'catalog' ? <Catalogue />
            : currentUC === 'biz-dashboard' ? <ConsolidatedDashboard />
            : currentUC === 'biz-branch' ? <BranchPlanView />
            : currentUC === 'biz-treasury' ? <TreasuryView />
            : currentUC === 'biz-regional' ? <RegionalView />
            : currentUC === 'biz-command' ? <CommandCenter />
            : currentUC === 'biz-exceptions' ? <ExceptionsQueue />
            : currentUC === 'biz-forecast' ? <ForecastDashboard />
            : currentUC === 'biz-pulse' ? <CashPulse />
            : currentUC === 'biz-heatmap' ? <VaultHeatmap />
            : currentUC === 'biz-waterfall' ? <PnLWaterfall />
            : currentUC === 'biz-gauge' ? <CRRGauge />
            : currentUC === 'biz-nostro-map' ? <NostroMap />
            : currentUC === 'biz-scorecard' ? <BranchScorecard />
            : currentUC === 'biz-map' ? <BranchMapView />
            : currentUC === 'biz-rates' ? <RatesSheet />
            : currentUC === 'biz-cit' ? <CITRouteSheet />
            : currentUC === 'biz-digital' ? <DigitalShiftReport />
            : currentUC === 'biz-simulator' ? <WhatIfSimulator />
            : currentUC === 'biz-alerts' ? <AlertsPanel />
            : currentUC === 'biz-recon' ? <ReconciliationSheet />
            : currentUC === 'biz-cdm' ? <CDMPlan />
            : currentUC === 'biz-iec' ? <IECHub />
            : currentUC === 'biz-compliance' ? <ComplianceMonitor />
            : currentUC === 'biz-seasonal' ? <SeasonalPrep />
            : currentUC === 'biz-datahealth' ? <DataHealth />
            : currentUC === 'biz-schema' ? <SchemaBrowser />
            : <UCDetail />}
        </div>
      </main>
    </div>
  )
}

import { create } from 'zustand'

const useAppStore = create((set) => ({
  currentUC: 'executive',
  selectedBranch: null,
  branchFilter: 'All',
  forecastData: [],
  optimizationResult: null,
  gameTheoryResult: null,
  aiBrief: null,
  isOptimizing: false,
  isAILoading: false,
  branches: [],
  networkSummary: {},

  // UC-01 specific state
  uc01NetworkSummary: null,
  isForecasting: false,
  isAnalyzing: false,

  // UC-03 specific state
  uc03NetworkSummary: null,
  nettingResult: null,
  auctionResult: null,
  cityHeatmapData: null,
  isNetting: false,
  isAuctioning: false,

  // UC-04 specific state
  crrSummary: null,
  crrTimeline: null,
  crrOptimal: null,
  crrStrategy: null,
  uc04AIBrief: null,
  isCRROptimizing: false,
  isCRRStrategyLoading: false,

  // UC-05 specific state
  nostroSummary: null,
  nostroPortfolio: null,
  currencyBreakdown: null,
  nostroOptimal: null,
  nashBargaining: null,
  fxCarry: null,
  uc05AIBrief: null,
  isNostroOptimizing: false,
  isNashLoading: false,
  isFXCarryLoading: false,

  // UC-06 specific state
  vostroSummary: null,
  vostroPortfolio: null,
  deploymentBreakdown: null,
  vostroLaR: null,
  vostroDeployment: null,
  cooperativeGame: null,
  uc06AIBrief: null,
  isLaRComputing: false,
  isDeploymentOptimizing: false,
  isCooperativeLoading: false,

  // UC-07 specific state
  denomSummary: null,
  branchDenom: null,
  penaltyHeatmap: null,
  denomOptimal: null,
  uc07AIBrief: null,
  isDenomOptimizing: false,
  isHeatmapLoading: false,
  selectedScenario: 'normal',

  // UC-08 specific state
  citSummary: null,
  fleetDashboard: null,
  citRoutes: null,
  routeComparison: null,
  emergencyResult: null,
  uc08AIBrief: null,
  isCITOptimizing: false,
  isRouteComparing: false,
  isEmergencyLoading: false,

  // UC-09 specific state
  incentiveSummary: null,
  segmentDashboard: null,
  incentiveOptimal: null,
  equilibrium: null,
  roiResults: null,
  abTestResult: null,
  uc09AIBrief: null,
  isIncentiveOptimizing: false,
  isEquilibriumLoading: false,
  isROILoading: false,
  isABTestLoading: false,
  selectedSegment: 'Mass Retail',

  // UC-10 specific state
  pnlSummary: null,
  pnlWaterfall: null,
  branchRanking: null,
  costTreemap: null,
  transferPricing: null,
  alcoReport: null,
  uc10AIBrief: null,
  isTransferPricingLoading: false,
  isALCOLoading: false,

  // UC-02 specific state
  selectedATM: null,
  atmFilter: 'All',
  atms: [],
  uc02NetworkSummary: null,
  atmForecastData: null,
  atmOptimizationResult: null,
  dqnResult: null,
  stackelbergResult: null,

  // ── Sidebar role + collapse state ──
  role: typeof window !== 'undefined' ? (localStorage.getItem('coe_role') || 'SUPERUSER') : 'SUPERUSER',
  setRole: (role) => {
    localStorage.setItem('coe_role', role)
    set({ role })
  },
  collapsedGroups: typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('coe_collapsed') || '{"daily":false,"monitoring":false,"treasury":false,"planning":true,"compliance":true,"technical":true}')
    : { daily: false, monitoring: false, treasury: false, planning: true, compliance: true, technical: true },
  toggleGroup: (group) => set(state => {
    const next = { ...state.collapsedGroups, [group]: !state.collapsedGroups[group] }
    localStorage.setItem('coe_collapsed', JSON.stringify(next))
    return { collapsedGroups: next }
  }),
  alertBadgeCount: 0,
  setAlertBadgeCount: (n) => set({ alertBadgeCount: n }),

  setCurrentUC: (uc) => set({ currentUC: uc, selectedBranch: null, forecastData: [], optimizationResult: null, gameTheoryResult: null, aiBrief: null }),
  setSelectedBranch: (branch) => set({ selectedBranch: branch, forecastData: [], optimizationResult: null, gameTheoryResult: null, aiBrief: null }),
  setBranchFilter: (filter) => set({ branchFilter: filter }),
  setForecastData: (data) => set({ forecastData: data }),
  setOptimizationResult: (result) => set({ optimizationResult: result }),
  setGameTheoryResult: (result) => set({ gameTheoryResult: result }),
  setAIBrief: (brief) => set({ aiBrief: brief }),
  setIsOptimizing: (val) => set({ isOptimizing: val }),
  setIsAILoading: (val) => set({ isAILoading: val }),
  setBranches: (branches) => set({ branches }),
  setNetworkSummary: (summary) => set({ networkSummary: summary }),

  // UC-01 specific actions
  setUC01NetworkSummary: (s) => set({ uc01NetworkSummary: s }),
  setIsForecasting: (v) => set({ isForecasting: v }),
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),

  // UC-03 specific actions
  setUC03NetworkSummary: (s) => set({ uc03NetworkSummary: s }),
  setNettingResult: (r) => set({ nettingResult: r }),
  setAuctionResult: (r) => set({ auctionResult: r }),
  setCityHeatmapData: (d) => set({ cityHeatmapData: d }),
  setIsNetting: (v) => set({ isNetting: v }),
  setIsAuctioning: (v) => set({ isAuctioning: v }),

  // UC-04 specific actions
  setCRRSummary: (s) => set({ crrSummary: s }),
  setCRRTimeline: (t) => set({ crrTimeline: t }),
  setCRROptimal: (o) => set({ crrOptimal: o }),
  setCRRStrategy: (s) => set({ crrStrategy: s }),
  setUC04AIBrief: (b) => set({ uc04AIBrief: b }),
  setIsCRROptimizing: (v) => set({ isCRROptimizing: v }),
  setIsCRRStrategyLoading: (v) => set({ isCRRStrategyLoading: v }),

  // UC-05 specific actions
  setNostroSummary: (s) => set({ nostroSummary: s }),
  setNostroPortfolio: (p) => set({ nostroPortfolio: p }),
  setCurrencyBreakdown: (d) => set({ currencyBreakdown: d }),
  setNostroOptimal: (o) => set({ nostroOptimal: o }),
  setNashBargaining: (n) => set({ nashBargaining: n }),
  setFXCarry: (f) => set({ fxCarry: f }),
  setUC05AIBrief: (b) => set({ uc05AIBrief: b }),
  setIsNostroOptimizing: (v) => set({ isNostroOptimizing: v }),
  setIsNashLoading: (v) => set({ isNashLoading: v }),
  setIsFXCarryLoading: (v) => set({ isFXCarryLoading: v }),

  // UC-06 specific actions
  setVostroSummary: (s) => set({ vostroSummary: s }),
  setVostroPortfolio: (p) => set({ vostroPortfolio: p }),
  setDeploymentBreakdown: (d) => set({ deploymentBreakdown: d }),
  setVostroLaR: (r) => set({ vostroLaR: r }),
  setVostroDeployment: (d) => set({ vostroDeployment: d }),
  setCooperativeGame: (g) => set({ cooperativeGame: g }),
  setUC06AIBrief: (b) => set({ uc06AIBrief: b }),
  setIsLaRComputing: (v) => set({ isLaRComputing: v }),
  setIsDeploymentOptimizing: (v) => set({ isDeploymentOptimizing: v }),
  setIsCooperativeLoading: (v) => set({ isCooperativeLoading: v }),

  // UC-07 specific actions
  setDenomSummary: (s) => set({ denomSummary: s }),
  setBranchDenom: (d) => set({ branchDenom: d }),
  setPenaltyHeatmap: (h) => set({ penaltyHeatmap: h }),
  setDenomOptimal: (o) => set({ denomOptimal: o }),
  setUC07AIBrief: (b) => set({ uc07AIBrief: b }),
  setIsDenomOptimizing: (v) => set({ isDenomOptimizing: v }),
  setIsHeatmapLoading: (v) => set({ isHeatmapLoading: v }),
  setSelectedScenario: (s) => set({ selectedScenario: s }),

  // UC-08 specific actions
  setCITSummary: (s) => set({ citSummary: s }),
  setFleetDashboard: (d) => set({ fleetDashboard: d }),
  setCITRoutes: (r) => set({ citRoutes: r }),
  setRouteComparison: (r) => set({ routeComparison: r }),
  setEmergencyResult: (r) => set({ emergencyResult: r }),
  setUC08AIBrief: (b) => set({ uc08AIBrief: b }),
  setIsCITOptimizing: (v) => set({ isCITOptimizing: v }),
  setIsRouteComparing: (v) => set({ isRouteComparing: v }),
  setIsEmergencyLoading: (v) => set({ isEmergencyLoading: v }),

  // UC-09 specific actions
  setIncentiveSummary: (s) => set({ incentiveSummary: s }),
  setSegmentDashboard: (d) => set({ segmentDashboard: d }),
  setIncentiveOptimal: (o) => set({ incentiveOptimal: o }),
  setEquilibrium: (e) => set({ equilibrium: e }),
  setROIResults: (r) => set({ roiResults: r }),
  setABTestResult: (r) => set({ abTestResult: r }),
  setUC09AIBrief: (b) => set({ uc09AIBrief: b }),
  setIsIncentiveOptimizing: (v) => set({ isIncentiveOptimizing: v }),
  setIsEquilibriumLoading: (v) => set({ isEquilibriumLoading: v }),
  setIsROILoading: (v) => set({ isROILoading: v }),
  setIsABTestLoading: (v) => set({ isABTestLoading: v }),
  setSelectedSegment: (s) => set({ selectedSegment: s }),

  // UC-10 specific actions
  setPnLSummary: (s) => set({ pnlSummary: s }),
  setPnLWaterfall: (w) => set({ pnlWaterfall: w }),
  setBranchRanking: (r) => set({ branchRanking: r }),
  setCostTreemap: (t) => set({ costTreemap: t }),
  setTransferPricing: (tp) => set({ transferPricing: tp }),
  setALCOReport: (r) => set({ alcoReport: r }),
  setUC10AIBrief: (b) => set({ uc10AIBrief: b }),
  setIsTransferPricingLoading: (v) => set({ isTransferPricingLoading: v }),
  setIsALCOLoading: (v) => set({ isALCOLoading: v }),

  // UC-02 specific actions
  setSelectedATM: (atm) => set({ selectedATM: atm, atmForecastData: null, atmOptimizationResult: null, dqnResult: null, stackelbergResult: null }),
  setATMFilter: (f) => set({ atmFilter: f }),
  setATMs: (a) => set({ atms: a }),
  setUC02NetworkSummary: (s) => set({ uc02NetworkSummary: s }),
  setATMForecastData: (d) => set({ atmForecastData: d }),
  setATMOptimizationResult: (r) => set({ atmOptimizationResult: r }),
  setDQNResult: (r) => set({ dqnResult: r }),
  setStackelbergResult: (r) => set({ stackelbergResult: r }),
}))

export default useAppStore

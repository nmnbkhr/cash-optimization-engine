import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 300000,
})

export const fetchBranches = (params) => api.get('/api/branches', { params })
export const fetchBranch = (branchId) => api.get(`/api/branches/${branchId}`)
export const fetchDashboardSummary = () => api.get('/api/dashboard/summary')
export const fetchExecutiveSummary = () => api.get('/api/dashboard/executive-summary')
export const requestAISummary = (data) => api.post('/api/ai-summary', data)
export const checkAIStatus = () => api.get('/api/ai-summary/status')

// UC-01 specific API functions
export const fetchUC01NetworkSummary = () => api.get('/api/uc01/network-summary')
export const runForecast = (branchId) => api.post(`/api/uc01/forecast/${branchId}`)
export const runOptimizer = (branchId) => api.post(`/api/uc01/optimize/${branchId}`)
export const runGameTheory = (branchId) => api.post(`/api/uc01/game-theory/${branchId}`)
export const fetchAIBrief = (branchId) => api.post(`/api/uc01/ai-brief/${branchId}`)

// UC-02 specific API functions
export const fetchATMs = (params) => api.get('/api/uc02/atms', { params })
export const fetchATM = (atmId) => api.get(`/api/uc02/atms/${atmId}`)
export const fetchUC02NetworkSummary = () => api.get('/api/uc02/network-summary')
export const runATMForecast = (atmId) => api.post(`/api/uc02/forecast/${atmId}`)
export const runATMOptimize = (atmId) => api.post(`/api/uc02/optimize/${atmId}`)
export const runDQNRecommend = (atmId) => api.post(`/api/uc02/dqn-recommend/${atmId}`)
export const runStackelberg = () => api.post('/api/uc02/stackelberg-analysis')
export const fetchATMAIBrief = (atmId) => api.post(`/api/uc02/ai-brief/${atmId}`)

// UC-03 specific API functions
export const fetchUC03NetworkSummary = () => api.get('/api/uc03/network-summary')
export const solveNetting = () => api.post('/api/uc03/solve-netting')
export const runVCGAuction = () => api.post('/api/uc03/run-auction')
export const fetchCityHeatmap = () => api.get('/api/uc03/city-heatmap')
export const fetchUC03AIBrief = () => api.post('/api/uc03/ai-brief')

// UC-04 specific API functions
export const fetchCRRSummary = () => api.get('/api/uc04/summary')
export const fetchCRRTimeline = () => api.get('/api/uc04/weekly-timeline')
export const runCRROptimize = () => api.post('/api/uc04/optimize')
export const runCRRStrategyGame = () => api.post('/api/uc04/strategy-game')
export const fetchUC04AIBrief = () => api.post('/api/uc04/ai-brief')

// UC-05 specific API functions
export const fetchNostroSummary = () => api.get('/api/uc05/summary')
export const fetchNostroPortfolio = () => api.get('/api/uc05/portfolio')
export const fetchCurrencyBreakdown = () => api.get('/api/uc05/currency-breakdown')
export const runNostroOptimize = () => api.post('/api/uc05/optimize')
export const runNashBargaining = () => api.post('/api/uc05/nash-bargaining')
export const runFXCarry = () => api.post('/api/uc05/fx-carry')
export const fetchUC05AIBrief = () => api.post('/api/uc05/ai-brief')

// UC-06 specific API functions
export const fetchVostroSummary = () => api.get('/api/uc06/summary')
export const fetchVostroPortfolio = () => api.get('/api/uc06/portfolio')
export const fetchDeploymentBreakdown = () => api.get('/api/uc06/deployment-breakdown')
export const runComputeLaR = () => api.post('/api/uc06/compute-lar')
export const runOptimizeDeployment = () => api.post('/api/uc06/optimize-deployment')
export const runCooperativeGame = () => api.post('/api/uc06/cooperative-game')
export const fetchUC06AIBrief = () => api.post('/api/uc06/ai-brief')

// UC-07 specific API functions
export const fetchDenomSummary = () => api.get('/api/uc07/summary')
export const fetchBranchDenom = (branchId) => api.get(`/api/uc07/branch/${branchId}`)
export const fetchPenaltyHeatmap = () => api.get('/api/uc07/penalty-heatmap')
export const runDenomOptimize = (branchId, scenario) => api.post('/api/uc07/optimize', null, { params: { branch_id: branchId || undefined, scenario: scenario || undefined } })
export const fetchUC07AIBrief = () => api.post('/api/uc07/ai-brief')

// UC-08 specific API functions
export const fetchCITSummary = () => api.get('/api/uc08/summary')
export const fetchFleetDashboard = () => api.get('/api/uc08/fleet-dashboard')
export const runCITOptimize = (city) => api.post('/api/uc08/optimize', null, { params: { city: city || undefined } })
export const runRouteComparison = (city) => api.post('/api/uc08/route-comparison', null, { params: { city: city || undefined } })
export const runEmergencyReroute = (routeId, failedStop) => api.post('/api/uc08/emergency-reroute', null, { params: { route_id: routeId, failed_stop: failedStop } })
export const fetchUC08AIBrief = () => api.post('/api/uc08/ai-brief')

// UC-09 specific API functions
export const fetchIncentiveSummary = () => api.get('/api/uc09/summary')
export const fetchSegmentDashboard = () => api.get('/api/uc09/segment-dashboard')
export const runIncentiveOptimize = () => api.post('/api/uc09/optimize')
export const runEquilibrium = () => api.post('/api/uc09/equilibrium')
export const runROICalc = () => api.post('/api/uc09/roi')
export const runABTest = (segment, armA, armB) => api.post('/api/uc09/ab-test', null, { params: { segment, arm_a: armA, arm_b: armB } })
export const fetchUC09AIBrief = () => api.post('/api/uc09/ai-brief')

// UC-10 specific API functions
export const fetchPnLSummary = () => api.get('/api/uc10/summary')
export const fetchPnLWaterfall = () => api.get('/api/uc10/waterfall')
export const fetchBranchRanking = () => api.get('/api/uc10/branch-ranking')
export const fetchCostTreemap = () => api.get('/api/uc10/cost-treemap')
export const runTransferPricing = () => api.post('/api/uc10/transfer-pricing')
export const fetchALCOReport = () => api.get('/api/uc10/alco-report')
export const fetchUC10AIBrief = () => api.post('/api/uc10/ai-brief')

export default api

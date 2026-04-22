import { create } from 'zustand'
import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000/api/command-center' })

export const useCommandStore = create((set, get) => ({
  snapshot: null,
  opportunities: [],
  log: [],
  lastAction: null,
  loading: false,
  toastVisible: false,
  radius: 15,
  minAmount: 3,

  fetchAll: async () => {
    set({ loading: true })
    try {
      const [snapRes, oppsRes] = await Promise.all([
        api.get('/snapshot'),
        api.get('/opportunities', {
          params: { radius: get().radius, min_amt: get().minAmount }
        }),
      ])
      set({ snapshot: snapRes.data, opportunities: oppsRes.data, loading: false })
    } catch (err) {
      console.error('Fetch failed:', err)
      set({ loading: false })
    }
  },

  executeTransfer: async (fromId, toId, amount) => {
    set({ loading: true })
    try {
      const { data } = await api.post('/execute', {
        from_id: fromId, to_id: toId, amount
      })
      if (data.error) {
        console.error(data.error)
        set({ loading: false })
        return
      }
      set({ lastAction: data, toastVisible: true })
      setTimeout(() => set({ toastVisible: false }), 6000)
      await get().fetchAll()
      const logRes = await api.get('/log')
      set({ log: logRes.data.transfers, loading: false })
    } catch (err) {
      console.error('Execute failed:', err)
      set({ loading: false })
    }
  },

  resetAll: async () => {
    set({ loading: true })
    try {
      const { data } = await api.post('/reset')
      set({ snapshot: data, lastAction: null, log: [], toastVisible: false, loading: false })
      await get().fetchAll()
    } catch (err) {
      console.error('Reset failed:', err)
      set({ loading: false })
    }
  },

  setRadius: (v) => set({ radius: v }),
  setMinAmount: (v) => set({ minAmount: v }),
  dismissToast: () => set({ toastVisible: false }),
}))

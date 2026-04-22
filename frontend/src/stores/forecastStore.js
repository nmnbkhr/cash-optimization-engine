import { create } from 'zustand'
import axios from 'axios'

const api = axios.create({ baseURL: 'http://localhost:8000/api/business' })

export const useForecastStore = create((set, get) => ({
  modelStatus: null,
  forecast: null,
  training: false,
  predicting: false,
  predictingAll: false,

  fetchStatus: async () => {
    try {
      const { data } = await api.get('/ensemble/status')
      set({ modelStatus: data })
    } catch (e) {
      console.error('Status fetch failed:', e)
    }
  },

  trainModel: async () => {
    set({ training: true })
    try {
      const { data } = await api.post('/ensemble/train')
      set({ modelStatus: data, training: false })
      return data
    } catch (e) {
      set({ training: false })
      throw e
    }
  },

  fetchForecast: async (branchId) => {
    set({ predicting: true })
    try {
      const { data } = await api.get(`/ensemble/predict/${branchId}`)
      set({ forecast: data, predicting: false })
    } catch (e) {
      set({ predicting: false })
    }
  },

  predictAll: async () => {
    set({ predictingAll: true })
    try {
      const { data } = await api.post('/ensemble/predict-all')
      set({ predictingAll: false })
      await get().fetchStatus()
      return data
    } catch (e) {
      set({ predictingAll: false })
      throw e
    }
  },
}))

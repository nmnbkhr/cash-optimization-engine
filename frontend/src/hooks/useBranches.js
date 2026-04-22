import { useEffect } from 'react'
import useAppStore from '../stores/appStore'
import { fetchBranches } from './useAPI'

export default function useBranches() {
  const { branches, setBranches, branchFilter } = useAppStore()

  useEffect(() => {
    const load = async () => {
      try {
        const params = branchFilter !== 'All' ? { branch_type: branchFilter } : {}
        const { data } = await fetchBranches(params)
        setBranches(data)
      } catch (err) {
        console.error('Failed to load branches:', err)
      }
    }
    load()
  }, [branchFilter, setBranches])

  return branches
}

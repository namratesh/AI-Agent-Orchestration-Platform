/**
 * Global UI state store using Zustand with localStorage persistence.
 *
 * Persisted under the key `"app-ui-store"` so sidebar state survives page
 * refreshes.  Only lightweight UI preferences are stored here — server data
 * lives in component-level state or React Query caches.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppStore {
  /** Whether the sidebar is in collapsed (icon-only) mode. */
  sidebarCollapsed: boolean
  /** Toggle the sidebar between expanded and collapsed states. */
  toggleSidebar: () => void
  /** Set the sidebar collapsed state directly. */
  setSidebarCollapsed: (v: boolean) => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
    }),
    { name: 'app-ui-store' }
  )
)

/**
 * React hook for reading and writing a JSON-serialised value in `localStorage`.
 *
 * Initialises from the stored value on first render (falling back to `initial`
 * if the key is absent or the stored value is unparseable).  Updates are
 * synchronously written to `localStorage` so they survive page refreshes.
 *
 * @param key - `localStorage` key to read from and write to.
 * @param initial - Value to use when no stored value exists.
 *
 * @returns `[value, set]` — a getter and setter similar to `useState`, but
 *   backed by `localStorage`.  The setter accepts either a new value or an
 *   updater function `(prev) => next`.
 */
import { useState, useCallback } from 'react'

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key)
      return item !== null ? (JSON.parse(item) as T) : initial
    } catch {
      return initial
    }
  })

  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
      try { localStorage.setItem(key, JSON.stringify(next)) } catch {
        // localStorage may be unavailable in private browsing — fail silently.
      }
      return next
    })
  }, [key])

  return [value, set] as const
}

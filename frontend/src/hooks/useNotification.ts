/**
 * Thin wrapper around `react-hot-toast` that provides typed notification helpers.
 *
 * Centralising toast calls here means duration and styling can be adjusted in
 * one place rather than scattered across components.
 *
 * Usage:
 * ```ts
 * const { success, error, promise } = useNotification()
 * success('Agent created!')
 * promise(createAgent(data), { loading: 'Creating…', success: 'Done!', error: 'Failed' })
 * ```
 */
import toast from 'react-hot-toast'

export function useNotification() {
  return {
    /** Show a green success toast for 3 seconds. */
    success: (msg: string) => toast.success(msg, { duration: 3000 }),
    /** Show a red error toast for 4 seconds. */
    error:   (msg: string) => toast.error(msg,   { duration: 4000 }),
    /** Show a neutral informational toast for 3 seconds. */
    info:    (msg: string) => toast(msg,          { duration: 3000 }),
    /** Show a loading toast that transitions to success/error when the promise settles. */
    promise: <T,>(p: Promise<T>, msgs: { loading: string; success: string; error: string }) =>
      toast.promise(p, msgs),
  }
}

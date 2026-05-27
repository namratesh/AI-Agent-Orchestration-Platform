import toast from 'react-hot-toast'

export function useNotification() {
  return {
    success: (msg: string) => toast.success(msg, { duration: 3000 }),
    error:   (msg: string) => toast.error(msg,   { duration: 4000 }),
    info:    (msg: string) => toast(msg,          { duration: 3000 }),
    promise: <T,>(p: Promise<T>, msgs: { loading: string; success: string; error: string }) =>
      toast.promise(p, msgs),
  }
}

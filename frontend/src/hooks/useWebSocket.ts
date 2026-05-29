import { useEffect, useRef, useState, useCallback } from 'react'

type Status = 'connecting' | 'connected' | 'disconnected' | 'error'

export function useWebSocket(url: string, onMessage: (data: unknown) => void, enabled = true) {
  const [status, setStatus] = useState<Status>('disconnected')
  const wsRef    = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!enabled) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => setStatus('connected')

    ws.onclose = () => {
      setStatus('disconnected')
      // Auto-reconnect after 3 s
      retryRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      setStatus('error')
      ws.close()
    }

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string)
        onMessageRef.current(data)
      } catch {}
    }
  }, [url, enabled])

  const disconnect = useCallback(() => {
    if (retryRef.current) clearTimeout(retryRef.current)
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return { status, reconnect: connect, disconnect }
}

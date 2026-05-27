import { useEffect, useRef, useState, useCallback } from 'react'

type Status = 'connecting' | 'connected' | 'disconnected' | 'error'

export function useWebSocket(url: string, onMessage: (data: unknown) => void, enabled = true) {
  const [status, setStatus] = useState<Status>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    if (!enabled) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen  = () => setStatus('connected')
    ws.onclose = () => setStatus('disconnected')
    ws.onerror = () => setStatus('error')
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data as string)
        onMessageRef.current(data)
      } catch {}
    }
  }, [url, enabled])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return { status, reconnect: connect, disconnect }
}

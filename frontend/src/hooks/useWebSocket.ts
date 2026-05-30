/**
 * React hook for managing a WebSocket connection with automatic reconnection.
 *
 * Establishes a WebSocket connection to `url` and calls `onMessage` for every
 * JSON message received.  Automatically reconnects after a 3-second delay when
 * the connection drops.  The connection is torn down when the component unmounts.
 *
 * The `onMessage` callback is stored in a ref so callers can use an inline
 * function without causing the effect to re-run on every render.
 *
 * @param url - WebSocket URL (e.g. `"ws://localhost:8000/ws/logs"`).
 * @param onMessage - Called with the parsed JSON payload of each incoming message.
 * @param enabled - Set to `false` to prevent connecting (e.g. feature flags).
 *
 * @returns `{ status, reconnect, disconnect }` where `status` reflects the
 *   current connection state and `reconnect`/`disconnect` allow manual control.
 */
import { useEffect, useRef, useState, useCallback } from 'react'

type Status = 'connecting' | 'connected' | 'disconnected' | 'error'

export function useWebSocket(url: string, onMessage: (data: unknown) => void, enabled = true) {
  const [status, setStatus] = useState<Status>('disconnected')
  const wsRef    = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ref so callers can pass inline functions without re-triggering the effect.
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
      } catch {
        // Non-JSON frames are silently ignored.
      }
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

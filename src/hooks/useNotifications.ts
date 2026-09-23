import { useEffect, useRef, useState } from 'react'
import { GreenApiError, deleteNotification, receiveNotification } from '../api/greenApi'
import type { Credentials, Notification } from '../types'

const RETRY_DELAY_MS = 3000
/** Backoff on 429: 5s, 10s, 20s … up to 60s */
const RATE_LIMIT_BASE_MS = 5000
const RATE_LIMIT_MAX_MS = 60000

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

/**
 * Polls the HTTP API notification queue: receiveNotification (long-polls up to 5s),
 * handle the notification, then deleteNotification so the queue moves on.
 */
export function useNotifications(
  creds: Credentials | null,
  onNotification: (n: Notification) => void,
) {
  const [error, setError] = useState<string | null>(null)
  const handlerRef = useRef(onNotification)

  useEffect(() => {
    handlerRef.current = onNotification
  }, [onNotification])

  useEffect(() => {
    if (!creds) return
    const controller = new AbortController()
    const { signal } = controller

    async function loop() {
      let rateLimitHits = 0
      while (!signal.aborted) {
        try {
          const notification = await receiveNotification(creds!, signal)
          if (signal.aborted) break
          if (notification) {
            handlerRef.current(notification)
            await deleteNotification(creds!, notification.receiptId, signal)
          }
          setError(null)
          rateLimitHits = 0
        } catch (err) {
          if (signal.aborted) break
          setError(err instanceof Error ? err.message : 'Ошибка получения сообщений')
          if (err instanceof GreenApiError && err.status === 429) {
            const delay = Math.min(RATE_LIMIT_BASE_MS * 2 ** rateLimitHits, RATE_LIMIT_MAX_MS)
            rateLimitHits++
            await sleep(delay, signal)
          } else {
            await sleep(RETRY_DELAY_MS, signal)
          }
        }
      }
    }

    loop()
    return () => controller.abort()
  }, [creds])

  return error
}

import { useEffect, useState } from 'react'
import { getAvatar } from '../api/greenApi'
import type { Credentials } from '../types'

/** Delay between getAvatar requests to stay under the rate limit */
const REQUEST_GAP_MS = 400

// Session cache: each avatar is requested once, even if it is shown in several places
const cache = new Map<string, Promise<string | null>>()

// Requests run one at a time instead of all at once when the chat list loads
let queue: Promise<unknown> = Promise.resolve()

const cacheKey = (creds: Credentials, chatId: string) => `${creds.idInstance}:${chatId}`

function loadAvatar(creds: Credentials, chatId: string) {
  const key = cacheKey(creds, chatId)
  let promise = cache.get(key)
  if (!promise) {
    promise = queue.then(async () => {
      try {
        return await getAvatar(creds, chatId)
      } catch {
        return null
      } finally {
        await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS))
      }
    })
    queue = promise
    cache.set(key, promise)
  }
  return promise
}

/** Forget a broken avatar URL so it is requested again next time */
export function forgetAvatar(creds: Credentials, chatId: string) {
  cache.delete(cacheKey(creds, chatId))
}

/** Avatar URL for a chat, or null while loading / when there is no photo */
export function useAvatar(creds: Credentials | null, chatId: string) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!creds) return
    let cancelled = false
    setUrl(null)
    loadAvatar(creds, chatId).then((result) => {
      if (!cancelled) setUrl(result)
    })
    return () => {
      cancelled = true
    }
  }, [creds, chatId])

  return url
}

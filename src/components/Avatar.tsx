import { useState } from 'react'
import { forgetAvatar, useAvatar } from '../hooks/useAvatar'
import type { Credentials } from '../types'

interface Props {
  creds: Credentials | null
  chatId: string
  title: string
  className?: string
}

/** Shows the first letter, then fades the profile photo in on top once it has loaded */
export function Avatar({ creds, chatId, title, className = 'avatar' }: Props) {
  const url = useAvatar(creds, chatId)
  // Track state per URL so it resets automatically when the URL changes
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const loaded = url !== null && loadedUrl === url
  const broken = url !== null && brokenUrl === url
  const letter = title.replace(/^[@+]/, '').charAt(0).toUpperCase()

  return (
    <span className={className}>
      <span className="avatar__letter">{letter}</span>
      {url && !broken && (
        <img
          key={url}
          className={`avatar__img${loaded ? ' avatar__img--loaded' : ''}`}
          src={url}
          alt=""
          decoding="async"
          onLoad={() => setLoadedUrl(url)}
          onError={() => {
            setBrokenUrl(url)
            if (creds) forgetAvatar(creds, chatId)
          }}
        />
      )}
    </span>
  )
}

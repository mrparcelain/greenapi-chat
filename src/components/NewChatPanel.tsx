import { useEffect, useRef, useState, type FormEvent } from 'react'

export interface NewChatRequest {
  phone: string
  /** Optional first message */
  message: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (request: NewChatRequest) => Promise<void>
}

export function NewChatPanel({ open, onClose, onSubmit }: Props) {
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the phone field on open; Escape closes the panel
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => inputRef.current?.focus(), 200)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!phone.trim() || loading) return
    setLoading(true)
    setError(null)
    try {
      await onSubmit({ phone: phone.trim(), message: message.trim() })
      setPhone('')
      setMessage('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось открыть чат')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={`panel${open ? ' panel--open' : ''}`} aria-hidden={!open} inert={!open}>
      <header className="panel__header">
        <button type="button" className="icon-button" onClick={onClose} aria-label="Назад">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" />
          </svg>
        </button>
        <h2 className="panel__title">Новый чат</h2>
      </header>

      <form className="panel__card" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="panel__input"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Номер телефона, например 79991234567"
          inputMode="tel"
          aria-label="Номер телефона получателя"
        />

        <div className="panel__message">
          <input
            className="panel__input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Сообщение (необязательно)"
            aria-label="Первое сообщение"
          />
          <button className="send-button" type="submit" disabled={!phone.trim() || loading} aria-label="Открыть чат">
            {loading ? (
              <span className="spinner" />
            ) : (
              <svg viewBox="0 0 72 72" aria-hidden="true">
                <path d="M64.23 33.27L10.23 9.27C9.12002 8.79 7.83002 9 6.96002 9.84C6.09002 10.68 5.79002 11.94 6.21002 13.08L11.7 27.75L33 36.03L10.59 47.22L6.18002 58.95C5.76002 60.09 6.06002 61.35 6.93002 62.19C7.36438 62.5974 7.91014 62.8662 8.49781 62.9624C9.08548 63.0586 9.68848 62.9777 10.23 62.73L64.23 38.73C64.7558 38.4932 65.2021 38.1097 65.5151 37.6254C65.8282 37.1411 65.9947 36.5767 65.9947 36C65.9947 35.4233 65.8282 34.8589 65.5151 34.3746C65.2021 33.8904 64.7558 33.5068 64.23 33.27Z" />
              </svg>
            )}
          </button>
        </div>

        {error && <p className="error">{error}</p>}
      </form>

      <p className="panel__hint">Номер получателя в международном формате, например 79991234567.</p>
    </section>
  )
}

import { useState, type FormEvent } from 'react'
import { getStateInstance } from '../api/greenApi'
import type { Credentials } from '../types'
import './LoginForm.css'

interface Props {
  onLogin: (creds: Credentials) => void
}

/** The API host usually starts with the first 4 digits of idInstance; the user can override it */
const guessApiUrl = (id: string) =>
  id.length >= 4 ? `https://${id.slice(0, 4)}.api.green-api.com` : 'https://api.green-api.com'

export function LoginForm({ onLogin }: Props) {
  const [idInstance, setIdInstance] = useState('')
  const [apiTokenInstance, setApiTokenInstance] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [apiUrlTouched, setApiUrlTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const effectiveApiUrl = apiUrlTouched ? apiUrl : guessApiUrl(idInstance.trim())

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const creds: Credentials = {
      apiUrl: effectiveApiUrl.trim(),
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
    }
    setLoading(true)
    setError(null)
    try {
      const state = await getStateInstance(creds)
      if (state !== 'authorized') {
        setError(`Инстанс не авторизован (статус: ${state}). Авторизуйте его в личном кабинете GREEN-API.`)
        return
      }
      onLogin(creds)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="tg-login">
      <form className="tg-login__form" onSubmit={handleSubmit}>
        <div className="tg-login__logo" aria-hidden="true">
          <svg viewBox="0 0 72 72">
            <path d="M64.23 33.27L10.23 9.27C9.12002 8.79 7.83002 9 6.96002 9.84C6.09002 10.68 5.79002 11.94 6.21002 13.08L11.7 27.75L33 36.03L10.59 47.22L6.18002 58.95C5.76002 60.09 6.06002 61.35 6.93002 62.19C7.36438 62.5974 7.91014 62.8662 8.49781 62.9624C9.08548 63.0586 9.68848 62.9777 10.23 62.73L64.23 38.73C64.7558 38.4932 65.2021 38.1097 65.5151 37.6254C65.8282 37.1411 65.9947 36.5767 65.9947 36C65.9947 35.4233 65.8282 34.8589 65.5151 34.3746C65.2021 33.8904 64.7558 33.5068 64.23 33.27Z" />
          </svg>
        </div>

        <h1 className="tg-login__title">GREEN-API Chat</h1>
        <p className="tg-login__subtitle">
          Введите данные инстанса
          <br />
          из личного кабинета GREEN-API.
        </p>

        {/* placeholder=" " lets CSS detect an empty field via :placeholder-shown (floating labels) */}
        <label className="tg-field">
          <input
            value={idInstance}
            onChange={(e) => setIdInstance(e.target.value)}
            inputMode="numeric"
            placeholder=" "
            autoFocus
            required
          />
          <span className="tg-field__label">idInstance</span>
        </label>

        <label className="tg-field">
          <input
            value={apiTokenInstance}
            onChange={(e) => setApiTokenInstance(e.target.value)}
            type="password"
            autoComplete="off"
            placeholder=" "
            required
          />
          <span className="tg-field__label">apiTokenInstance</span>
        </label>

        <label className="tg-field">
          <input
            value={effectiveApiUrl}
            onChange={(e) => {
              setApiUrlTouched(true)
              setApiUrl(e.target.value)
            }}
            type="url"
            placeholder=" "
            required
          />
          <span className="tg-field__label">apiUrl</span>
        </label>

        {error && <p className="tg-login__error">{error}</p>}

        <button className="tg-login__button" type="submit" disabled={loading}>
          {loading ? <span className="tg-login__spinner" aria-label="Проверяем" /> : 'Войти'}
        </button>
      </form>
    </div>
  )
}

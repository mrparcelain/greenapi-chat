import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { Chat, Credentials, Message } from '../types'
import { Avatar } from './Avatar'
import './ChatWindow.css'

interface Props {
  creds: Credentials | null
  chat: Chat | null
  onSend: (text: string) => void
  onBack: () => void
  pollingError: string | null
  /** Instance settings that block notifications (from getSettings) */
  settingsWarning: string | null
  historyError: string | null
}

const formatTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

const STATUS_ICON = { sending: '🕓', sent: '✓', delivered: '✓✓', read: '✓✓', failed: '⚠' } as const

const STATUS_TITLE = {
  sending: 'Отправляется',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  failed: 'Ошибка отправки',
} as const

export function ChatWindow({ creds, chat, onSend, onBack, pollingError, settingsWarning, historyError }: Props) {
  const [text, setText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [chat?.messages.length, chat?.chatId])

  if (!chat) {
    return (
      <section className="chat chat--empty">
        <p>Выберите чат или создайте новый</p>
      </section>
    )
  }

  function submit() {
    const value = text.trim()
    if (!value) return
    onSend(value)
    setText('')
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    submit()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  // Group chats show the sender's name and avatar
  const group = chat.chatId.startsWith('-')
  const messages = chat.messages

  return (
    <section className="chat">
      <header className="chat__header">
        <button className="chat__back" onClick={onBack} aria-label="Назад к чатам">
          ←
        </button>
        <Avatar creds={creds} chatId={chat.chatId} title={chat.title} />
        <span className="chat__title">{chat.title}</span>
      </header>

      {settingsWarning && <div className="banner">Настройки инстанса: {settingsWarning}</div>}

      {pollingError && <div className="banner">Получение сообщений: {pollingError}</div>}

      {historyError && <div className="banner">История чата: {historyError}</div>}

      <div className="chat__messages" ref={listRef}>
        {!chat.historyLoaded && <p className="chat__loading">Загружаем историю…</p>}
        {messages.map((m, i) => {
          const bubble = (
            <div key={m.id} className={`bubble ${m.outgoing ? 'bubble--out' : 'bubble--in'}`}>
              {!m.outgoing && group && !sameRun(messages[i - 1], m) && (
                <span className="bubble__name" style={{ color: senderColor(senderKey(m)) }}>
                  {m.senderName || 'Участник'}
                </span>
              )}
              <span className="bubble__text">{m.text}</span>
              <span className="bubble__meta">
                {formatTime(m.timestamp)}
                {m.outgoing && m.status && (
                  <span className={`bubble__status bubble__status--${m.status}`} title={STATUS_TITLE[m.status]}>
                    {STATUS_ICON[m.status]}
                  </span>
                )}
              </span>
            </div>
          )
          if (m.outgoing) return bubble

          // Incoming: reserve space for the avatar; draw it only on the last message of a run
          const last = !sameRun(m, messages[i + 1])
          return (
            <div key={m.id} className={`msg-row${last ? ' msg-row--last' : ''}`}>
              <span className="msg-row__avatar">
                {last &&
                  (group ? (
                    <span className="avatar msg-avatar" style={{ background: senderColor(senderKey(m)) }}>
                      {(m.senderName || '?').replace(/^[@+]/, '').charAt(0).toUpperCase()}
                    </span>
                  ) : (
                    <Avatar creds={creds} chatId={chat.chatId} title={chat.title} className="avatar msg-avatar" />
                  ))}
              </span>
              {bubble}
            </div>
          )
        })}
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Сообщение"
          rows={1}
          maxLength={4000}
        />
        <button className="composer__send" type="submit" disabled={!text.trim()} aria-label="Отправить">
          <svg viewBox="0 0 72 72" aria-hidden="true">
            <path d="M64.23 33.27L10.23 9.27C9.12002 8.79 7.83002 9 6.96002 9.84C6.09002 10.68 5.79002 11.94 6.21002 13.08L11.7 27.75L33 36.03L10.59 47.22L6.18002 58.95C5.76002 60.09 6.06002 61.35 6.93002 62.19C7.36438 62.5974 7.91014 62.8662 8.49781 62.9624C9.08548 63.0586 9.68848 62.9777 10.23 62.73L64.23 38.73C64.7558 38.4932 65.2021 38.1097 65.5151 37.6254C65.8282 37.1411 65.9947 36.5767 65.9947 36C65.9947 35.4233 65.8282 34.8589 65.5151 34.3746C65.2021 33.8904 64.7558 33.5068 64.23 33.27Z" />
          </svg>
        </button>
      </form>
    </section>
  )
}

const senderKey = (m: Message) => m.senderId || m.senderName || ''

/** Consecutive incoming messages from the same sender */
function sameRun(a: Message | undefined, b: Message | undefined) {
  return !!a && !!b && !a.outgoing && !b.outgoing && senderKey(a) === senderKey(b)
}

/** Telegram-like name colors: stable per sender */
const NAME_COLORS = ['#e17076', '#7bc862', '#e5a64e', '#65aadd', '#a695e7', '#ee7aae', '#6ec9cb', '#faa774']

function senderColor(key: string) {
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return NAME_COLORS[Math.abs(hash) % NAME_COLORS.length]
}

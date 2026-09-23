import { useRef, useState, type KeyboardEvent } from 'react'
import type { Chat, ChatPreview, Credentials } from '../types'
import { Avatar } from './Avatar'
import { NewChatPanel, type NewChatRequest } from './NewChatPanel'
import { SidebarMenu, type MenuAction } from './SidebarMenu'

interface Props {
  creds: Credentials | null
  chats: Chat[]
  activeChatId: string | null
  onSelect: (chatId: string) => void
  onStartChat: (request: NewChatRequest) => Promise<void>
  onMenuAction: (action: MenuAction) => void
  loading: boolean
  loadError: string | null
}

export function Sidebar({
  creds,
  chats,
  activeChatId,
  onSelect,
  onStartChat,
  onMenuAction,
  loading: chatsLoading,
  loadError,
}: Props) {
  const [query, setQuery] = useState('')
  const [newChatOpen, setNewChatOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  function clearSearch() {
    setQuery('')
    searchRef.current?.focus()
  }

  const q = query.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const visibleChats = q
    ? chats.filter(
        (c) =>
          [c.title, c.subtitle, c.chatId].some((v) => v?.toLowerCase().includes(q)) ||
          // match phone numbers by digits: "+7 999" finds "+79991234567"
          (qDigits.length >= 3 && (c.subtitle ?? '').replace(/\D/g, '').includes(qDigits)),
      )
    : chats

  function handleSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && query) {
      e.preventDefault()
      clearSearch()
      return
    }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__top">
        <SidebarMenu onAction={onMenuAction} />
        <label className="search">
          <svg className="search__icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder="Поиск"
            aria-label="Поиск по чатам"
          />
          {query && (
            <button type="button" className="search__clear" onClick={clearSearch} aria-label="Очистить поиск">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </label>
      </div>

      {loadError && <p className="error error--sidebar">Список чатов: {loadError}</p>}

      <ul className="chat-list">
        {visibleChats.length === 0 && (
          <li className="chat-list__empty">
            {q ? 'Ничего не найдено' : chatsLoading ? 'Загружаем чаты…' : 'Пока нет чатов'}
          </li>
        )}
        {visibleChats.map((chat) => {
          const last = lastMessage(chat)
          const sender = last && senderLabel(chat, last)
          return (
            <li key={chat.chatId}>
              <button
                className={`chat-item${chat.chatId === activeChatId ? ' chat-item--active' : ''}`}
                onClick={() => onSelect(chat.chatId)}
              >
                <Avatar creds={creds} chatId={chat.chatId} title={chat.title} className="avatar-like" />
                <span className="chat-item__body">
                  <span className="chat-item__title">{chat.title}</span>
                  <span className="chat-item__preview">
                    {last ? (
                      <>
                        {sender && <span className="chat-item__sender">{sender}: </span>}
                        {last.text}
                      </>
                    ) : (
                      (chat.subtitle ?? 'Нет сообщений')
                    )}
                  </span>
                </span>
                {chat.unread > 0 && <span className="badge">{chat.unread}</span>}
              </button>
            </li>
          )
        })}

      </ul>

      <button className="fab" onClick={() => setNewChatOpen(true)} aria-label="Новый чат" title="Новый чат">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.707 19.707L18 10.414L13.586 6L4.293 15.293C4.16494 15.421 4.07404 15.5814 4.03 15.757L3 21L8.242 19.97C8.418 19.926 8.579 19.835 8.707 19.707ZM21 7.414C21.3749 7.03894 21.5856 6.53033 21.5856 6C21.5856 5.46967 21.3749 4.96106 21 4.586L19.414 3C19.0389 2.62506 18.5303 2.41443 18 2.41443C17.4697 2.41443 16.9611 2.62506 16.586 3L15 4.586L19.414 9L21 7.414Z" />
        </svg>
      </button>

      <NewChatPanel open={newChatOpen} onClose={() => setNewChatOpen(false)} onSubmit={onStartChat} />
    </aside>
  )
}

/** The newest message: the last loaded one or the getChatHistory preview, whichever is newer */
function lastMessage(chat: Chat): ChatPreview | undefined {
  const loaded = chat.messages[chat.messages.length - 1]
  const preview = chat.preview
  if (!loaded) return preview
  if (preview && preview.timestamp > loaded.timestamp) return preview
  return loaded
}

/** Telegram group chat IDs are negative */
const isGroup = (chatId: string) => chatId.startsWith('-')

/** "Вы" for own messages, the sender's name in groups, nothing in private chats */
function senderLabel(chat: Chat, message: ChatPreview) {
  if (message.outgoing) return 'Вы'
  if (isGroup(chat.chatId)) return message.senderName || undefined
  return undefined
}

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import {
  GreenApiError,
  checkAccount,
  checkInstanceSettings,
  extractText,
  getChatHistory,
  getChats,
  getLastMessage,
  sendMessage,
  toMessageStatus,
} from './api/greenApi'
import { ChatWindow } from './components/ChatWindow'
import { LoginForm } from './components/LoginForm'
import type { NewChatRequest } from './components/NewChatPanel'
import type { MenuAction } from './components/SidebarMenu'
import { Sidebar } from './components/Sidebar'
import { useNotifications } from './hooks/useNotifications'
import type { Chat, ChatInfo, ChatPreview, Credentials, Message, MessageStatus, Notification } from './types'

const STORAGE_KEY = 'greenapi-credentials'
/** getChatHistory is limited to 1 request per second */
const PREVIEW_GAP_MS = 1100

function loadCredentials(): Credentials | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Credentials) : null
  } catch {
    return null
  }
}

interface State {
  chats: Chat[]
  activeChatId: string | null
}

type Action =
  | { type: 'openChat'; chatId: string; title: string }
  | { type: 'select'; chatId: string | null }
  | { type: 'addMessage'; chatId: string; title: string; message: Message }
  | { type: 'updateStatus'; chatId: string; tempId: string; id?: string; status: MessageStatus }
  | { type: 'setStatus'; chatId: string; id: string; status: MessageStatus }
  | { type: 'loadChats'; chats: ChatInfo[] }
  | { type: 'loadHistory'; chatId: string; messages: Message[] }
  | { type: 'setPreview'; chatId: string; preview: ChatPreview }
  | { type: 'reset' }

const initialState: State = { chats: [], activeChatId: null }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'openChat': {
      const exists = state.chats.some((c) => c.chatId === action.chatId)
      const chats = exists
        ? state.chats
        : [{ chatId: action.chatId, title: action.title, messages: [], unread: 0 }, ...state.chats]
      return { chats: markRead(chats, action.chatId), activeChatId: action.chatId }
    }

    case 'select':
      return {
        activeChatId: action.chatId,
        chats: action.chatId ? markRead(state.chats, action.chatId) : state.chats,
      }

    case 'addMessage': {
      const isActive = state.activeChatId === action.chatId
      const existing = state.chats.find((c) => c.chatId === action.chatId)
      // The same notification can arrive twice: skip duplicates by id
      if (existing?.messages.some((m) => m.id === action.message.id)) return state

      const chat: Chat = existing ?? {
        chatId: action.chatId,
        title: action.title,
        messages: [],
        unread: 0,
      }
      const updated: Chat = {
        ...chat,
        messages: [...chat.messages, action.message],
        unread: isActive || action.message.outgoing ? 0 : chat.unread + 1,
      }
      // Move the chat with the new message to the top
      return {
        ...state,
        chats: [updated, ...state.chats.filter((c) => c.chatId !== action.chatId)],
      }
    }

    case 'updateStatus':
      return {
        ...state,
        chats: state.chats.map((c) =>
          c.chatId !== action.chatId
            ? c
            : {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === action.tempId ? { ...m, id: action.id ?? m.id, status: action.status } : m,
                ),
              },
        ),
      }

    case 'setStatus':
      return {
        ...state,
        chats: state.chats.map((c) =>
          c.chatId !== action.chatId
            ? c
            : {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === action.id ? { ...m, status: mergeStatus(m.status, action.status) } : m,
                ),
              },
        ),
      }

    case 'loadChats': {
      const known = new Set(state.chats.map((c) => c.chatId))
      const loaded: Chat[] = action.chats
        .filter((c) => !known.has(c.chatId))
        .map((c) => ({
          chatId: c.chatId,
          title: c.name || c.username || c.chatId,
          subtitle: c.username || (c.phoneNumber ? `+${c.phoneNumber}` : undefined),
          messages: [],
          unread: 0,
        }))
      return { ...state, chats: [...state.chats, ...loaded] }
    }

    case 'loadHistory':
      return {
        ...state,
        chats: state.chats.map((c) => {
          if (c.chatId !== action.chatId) return c
          // Merge history with messages that arrived while it was loading
          const byId = new Map<string, Message>()
          for (const m of [...action.messages, ...c.messages]) byId.set(m.id, m)
          const messages = [...byId.values()].sort((a, b) => a.timestamp - b.timestamp)
          return { ...c, messages, historyLoaded: true }
        }),
      }

    case 'setPreview':
      return {
        ...state,
        chats: state.chats.map((c) => (c.chatId === action.chatId ? { ...c, preview: action.preview } : c)),
      }

    case 'reset':
      return initialState
  }
}

// Statuses can arrive out of order: never downgrade "read" to "delivered"
const STATUS_RANK: Record<MessageStatus, number> = { sending: 0, failed: 1, sent: 2, delivered: 3, read: 4 }

function mergeStatus(current: MessageStatus | undefined, next: MessageStatus): MessageStatus {
  if (!current) return next
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current
}

function markRead(chats: Chat[], chatId: string) {
  return chats.map((c) => (c.chatId === chatId ? { ...c, unread: 0 } : c))
}

export default function App() {
  const [creds, setCreds] = useState<Credentials | null>(loadCredentials)
  const [state, dispatch] = useReducer(reducer, initialState)
  // A status can arrive before sendMessage returns the idMessage, so keep it until then
  const earlyStatuses = useRef(new Map<string, MessageStatus>())

  const handleNotification = useCallback((n: Notification) => {
    console.info('[GREEN-API]', n.body.typeWebhook, n.body)
    if (n.body.typeWebhook === 'outgoingMessageStatus') {
      const status = toMessageStatus(n.body.status)
      const { chatId, idMessage } = n.body
      if (!status || !chatId || !idMessage) return
      earlyStatuses.current.set(idMessage, status)
      dispatch({ type: 'setStatus', chatId, id: idMessage, status })
      return
    }

    if (n.body.typeWebhook !== 'incomingMessageReceived' || !n.body.senderData) return
    const text = extractText(n)
    if (text === null) return // only text messages are supported

    const { chatId, chatName, senderName, sender } = n.body.senderData
    dispatch({
      type: 'addMessage',
      chatId,
      title: chatName || senderName || chatId,
      message: {
        id: n.body.idMessage ?? String(n.receiptId),
        text,
        outgoing: false,
        timestamp: n.body.timestamp * 1000,
        senderName,
        senderId: sender,
      },
    })
  }, [])

  const pollingError = useNotifications(creds, handleNotification)
  const [chatsLoading, setChatsLoading] = useState(false)
  const [chatsError, setChatsError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [settingsWarning, setSettingsWarning] = useState<string | null>(null)

  // Warn if the instance settings block incoming messages or statuses
  useEffect(() => {
    if (!creds) return
    let cancelled = false
    setSettingsWarning(null)
    checkInstanceSettings(creds)
      .then((problems) => {
        if (!cancelled && problems.length) setSettingsWarning(problems.join('; '))
      })
      .catch((err) => console.warn('[GREEN-API] getSettings', err))
    return () => {
      cancelled = true
    }
  }, [creds])

  useEffect(() => {
    if (!creds) return
    let cancelled = false
    setChatsLoading(true)
    setChatsError(null)
    // Last message for each chat in the list, one request at a time
    async function loadPreviews(chats: ChatInfo[]) {
      for (const chat of chats) {
        if (cancelled) return
        try {
          const preview = await getLastMessage(creds!, chat.chatId)
          if (!cancelled && preview) dispatch({ type: 'setPreview', chatId: chat.chatId, preview })
        } catch (err) {
          // 466: the chat is outside the plan's limit, skip its preview
          if (!(err instanceof GreenApiError && err.status === 466)) {
            console.warn('[preview]', chat.chatId, err)
          }
        }
        await new Promise((resolve) => setTimeout(resolve, PREVIEW_GAP_MS))
      }
    }

    getChats(creds)
      .then((chats) => {
        if (cancelled) return
        dispatch({ type: 'loadChats', chats })
        setChatsLoading(false)
        loadPreviews(chats)
      })
      .catch((err) => {
        if (cancelled) return
        setChatsError(err instanceof Error ? err.message : 'Не удалось загрузить чаты')
        setChatsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [creds])

  // Load history once when a chat is opened
  const activeChatId = state.activeChatId
  const needsHistory = state.chats.some((c) => c.chatId === activeChatId && !c.historyLoaded)
  useEffect(() => {
    setHistoryError(null)
    if (!creds || !activeChatId || !needsHistory) return
    let cancelled = false
    getChatHistory(creds, activeChatId)
      .then((messages) => {
        if (!cancelled) dispatch({ type: 'loadHistory', chatId: activeChatId, messages })
      })
      .catch((err) => {
        if (cancelled) return
        setHistoryError(err instanceof Error ? err.message : 'Не удалось загрузить историю')
        // Mark as loaded so the request is not retried in a loop
        dispatch({ type: 'loadHistory', chatId: activeChatId, messages: [] })
      })
    return () => {
      cancelled = true
    }
  }, [creds, activeChatId, needsHistory])

  function handleLogin(next: Credentials) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* sessionStorage unavailable: just don't persist the login */
    }
    setCreds(next)
  }

  function handleLogout() {
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    dispatch({ type: 'reset' })
    setCreds(null)
  }

  async function sendTo(chatId: string, title: string, text: string) {
    if (!creds) return
    const tempId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`

    // Show the message immediately; update its status once the API responds
    dispatch({
      type: 'addMessage',
      chatId,
      title,
      message: { id: tempId, text, outgoing: true, timestamp: Date.now(), status: 'sending' },
    })

    try {
      const idMessage = await sendMessage(creds, chatId, text)
      dispatch({ type: 'updateStatus', chatId, tempId, id: idMessage, status: 'sent' })
      const early = earlyStatuses.current.get(idMessage)
      if (early) dispatch({ type: 'setStatus', chatId, id: idMessage, status: early })
    } catch {
      dispatch({ type: 'updateStatus', chatId, tempId, status: 'failed' })
    }
  }

  async function handleSend(text: string) {
    const chatId = state.activeChatId
    if (!chatId) return
    const chat = state.chats.find((c) => c.chatId === chatId)
    await sendTo(chatId, chat?.title ?? chatId, text)
  }

  /** New chat by phone number: chatId comes from checkAccount */
  async function handleStartChat({ phone, message }: NewChatRequest) {
    if (!creds) return
    // Reuse a known chat to avoid spending a checkAccount request
    const digits = phone.replace(/\D/g, '')
    const known = state.chats.find((c) => c.subtitle?.replace(/\D/g, '') === digits)
    const chatId = known ? known.chatId : await checkAccount(creds, phone)
    const title = known?.title ?? `+${digits}`
    dispatch({ type: 'openChat', chatId, title })
    if (message) await sendTo(chatId, title, message)
  }

  function handleMenuAction(action: MenuAction) {
    if (action === 'logout') handleLogout()
  }

  if (!creds) return <LoginForm onLogin={handleLogin} />

  const activeChat = state.chats.find((c) => c.chatId === state.activeChatId) ?? null

  return (
    <div className={`layout${activeChat ? ' layout--chat-open' : ''}`}>
      <Sidebar
        creds={creds}
        chats={state.chats}
        activeChatId={state.activeChatId}
        onSelect={(chatId) => dispatch({ type: 'select', chatId })}
        onStartChat={handleStartChat}
        onMenuAction={handleMenuAction}
        loading={chatsLoading}
        loadError={chatsError}
      />
      <ChatWindow
        creds={creds}
        chat={activeChat}
        onSend={handleSend}
        onBack={() => dispatch({ type: 'select', chatId: null })}
        pollingError={pollingError}
        settingsWarning={settingsWarning}
        historyError={historyError}
      />
    </div>
  )
}

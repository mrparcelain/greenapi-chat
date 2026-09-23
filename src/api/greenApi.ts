import type { ChatInfo, ChatPreview, Credentials, HistoryItem, Message, MessageStatus, Notification } from '../types'

export class GreenApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'GreenApiError'
    this.status = status
  }
}

function buildUrl(creds: Credentials, method: string, query = '') {
  const base = creds.apiUrl.replace(/\/+$/, '')
  return `${base}/waInstance${creds.idInstance}/${method}/${creds.apiTokenInstance}${query}`
}

const RATE_LIMIT_RETRIES = 3
const RATE_LIMIT_DELAY_MS = 1500

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, init)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      throw new GreenApiError('Нет соединения с сервером GREEN-API. Проверь apiUrl.')
    }
    // Retry on 429; the notification loop (which passes a signal) handles its own backoff
    if (res.status !== 429 || attempt >= RATE_LIMIT_RETRIES || init?.signal) break
    await wait(RATE_LIMIT_DELAY_MS * (attempt + 1))
  }

  if (!res.ok) {
    if (res.status === 466) {
      // Developer plan: 3 chats per month and monthly per-method quotas
      throw new GreenApiError('Лимит бесплатного тарифа GREEN-API исчерпан (3 чата в месяц)', 466)
    }
    if (res.status === 429) {
      throw new GreenApiError('Слишком много запросов к GREEN-API, попробуйте через несколько секунд', 429)
    }
    if (res.status === 401 || res.status === 403) {
      throw new GreenApiError('Неверный idInstance или apiTokenInstance', res.status)
    }
    const text = await res.text().catch(() => '')
    throw new GreenApiError(text || `Ошибка сервера: ${res.status}`, res.status)
  }

  // receiveNotification returns an empty body when the queue is empty
  const text = await res.text()
  return (text ? JSON.parse(text) : null) as T
}

/** Instance state: authorized, notAuthorized, blocked, starting, … */
export async function getStateInstance(creds: Credentials) {
  const data = await request<{ stateInstance: string }>(buildUrl(creds, 'getStateInstance'))
  return data.stateInstance
}

/** Resolves a recipient's phone number to a chatId */
export async function checkAccount(creds: Credentials, contact: string) {
  const value = contact.trim()
  const body = value.startsWith('@')
    ? { username: value }
    : { phoneNumber: Number(value.replace(/\D/g, '')) }

  const data = await request<{
    exist?: boolean
    chatId?: string
    status?: boolean
    reason?: string
  }>(buildUrl(creds, 'checkAccount'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (data.status === false) throw new GreenApiError(data.reason ?? 'Инстанс не авторизован')
  if (!data.exist || !data.chatId) {
    throw new GreenApiError('Аккаунт с таким номером или username не найден')
  }
  return data.chatId
}

export async function sendMessage(creds: Credentials, chatId: string, message: string) {
  const data = await request<{ idMessage: string }>(buildUrl(creds, 'sendMessage'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, message }),
  })
  return data.idMessage
}

export async function getChats(creds: Credentials) {
  const data = await request<ChatInfo[] | null>(buildUrl(creds, 'getChats'))
  // Channels are read-only, so only private chats and groups are listed
  return (data ?? []).filter((c) => c.type !== 'channel')
}

function fetchHistory(creds: Credentials, chatId: string, count: number) {
  return request<HistoryItem[] | null>(buildUrl(creds, 'getChatHistory'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, count }),
  })
}

export async function getChatHistory(creds: Credentials, chatId: string, count = 50): Promise<Message[]> {
  const data = await fetchHistory(creds, chatId, count)
  return (data ?? [])
    .map((m) => ({ item: m, text: m.textMessage || m.extendedTextMessage?.text || '' }))
    .filter(({ text }) => text.length > 0)
    .map(({ item: m, text }) => ({
      id: m.idMessage,
      text,
      outgoing: m.type === 'outgoing',
      timestamp: m.timestamp * 1000,
      status: m.type === 'outgoing' ? toMessageStatus(m.statusMessage) ?? 'sent' : undefined,
      senderName: m.senderName,
      senderId: m.senderId,
    }))
    .sort((a, b) => a.timestamp - b.timestamp || compareIds(a.id, b.id))
}

/** Telegram message IDs are increasing numbers; fall back to string comparison */
function compareIds(a: string, b: string) {
  const na = Number(a)
  const nb = Number(b)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return a < b ? -1 : a > b ? 1 : 0
}

/** Chat list labels for non-text messages */
const MEDIA_LABELS: Record<string, string> = {
  imageMessage: 'Фото',
  videoMessage: 'Видео',
  documentMessage: 'Файл',
  audioMessage: 'Аудио',
  voiceMessage: 'Голосовое сообщение',
  stickerMessage: 'Стикер',
  locationMessage: 'Геопозиция',
  contactMessage: 'Контакт',
  pollMessage: 'Опрос',
}

export function previewText(m: HistoryItem): string {
  const text = m.textMessage || m.extendedTextMessage?.text
  if (text) return text
  const label = MEDIA_LABELS[m.typeMessage] ?? 'Сообщение'
  return m.caption ? `${label}, ${m.caption}` : label
}

/** Last message of a chat for the chat list; null if the chat is empty */
export async function getLastMessage(creds: Credentials, chatId: string): Promise<ChatPreview | null> {
  const data = await fetchHistory(creds, chatId, 1)
  const m = data?.[0]
  if (!m) return null
  return {
    text: previewText(m),
    outgoing: m.type === 'outgoing',
    senderName: m.senderName,
    timestamp: m.timestamp * 1000,
  }
}

export function receiveNotification(creds: Credentials, signal?: AbortSignal) {
  return request<Notification | null>(
    buildUrl(creds, 'receiveNotification', '?receiveTimeout=5'),
    { signal },
  )
}

export function deleteNotification(creds: Credentials, receiptId: number, signal?: AbortSignal) {
  return request<{ result: boolean }>(buildUrl(creds, 'deleteNotification', `/${receiptId}`), {
    method: 'DELETE',
    signal,
  })
}

/** Text of an incoming message, or null if it is not a text message */
export function extractText(n: Notification): string | null {
  const data = n.body.messageData
  if (!data) return null
  if (data.typeMessage === 'textMessage') return data.textMessageData?.textMessage ?? null
  // Replies arrive as quotedMessage with the text in the same place
  if (data.typeMessage === 'extendedTextMessage' || data.typeMessage === 'quotedMessage') {
    return data.extendedTextMessageData?.text ?? null
  }
  return null
}

/** Maps an API status (outgoingMessageStatus / getChatHistory) to a UI status */
export function toMessageStatus(status?: string): MessageStatus | null {
  switch (status) {
    case 'sent':
    case 'delivered':
    case 'read':
      return status
    case 'failed':
    case 'noAccount':
    case 'notInGroup':
    case 'suspended':
      return 'failed'
    default:
      return null
  }
}

/** Profile or group photo URL; null if there is none or it is hidden by privacy settings */
export async function getAvatar(creds: Credentials, chatId: string) {
  try {
    const data = await request<{ urlAvatar?: string } | null>(buildUrl(creds, 'getAvatar'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId }),
    })
    return data?.urlAvatar || null
  } catch (err) {
    // 466: chat is outside the plan's limit, fall back to the letter
    if (err instanceof GreenApiError && err.status === 466) return null
    throw err
  }
}


interface InstanceSettings {
  webhookUrl?: string
  incomingWebhook?: string
  outgoingWebhook?: string
}

/** Checks the instance settings that incoming messages depend on; returns user-facing problems */
export async function checkInstanceSettings(creds: Credentials): Promise<string[]> {
  const s = await request<InstanceSettings>(buildUrl(creds, 'getSettings'))
  const problems: string[] = []
  if (s.webhookUrl) {
    problems.push('у инстанса задан webhookUrl — пока он указан, входящие не приходят через HTTP API; очистите его в личном кабинете')
  }
  if (s.incomingWebhook !== 'yes') {
    problems.push('выключены уведомления о входящих сообщениях (incomingWebhook) — ответы не будут появляться')
  }
  if (s.outgoingWebhook !== 'yes') {
    problems.push('выключены уведомления о статусах сообщений (outgoingWebhook) — галочки доставки и прочтения не обновятся')
  }
  return problems
}

export interface Credentials {
  apiUrl: string
  idInstance: string
  apiTokenInstance: string
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

export interface Message {
  id: string
  text: string
  outgoing: boolean
  timestamp: number
  status?: MessageStatus
  senderName?: string
  senderId?: string
}

/** Chat list preview of the last message (may be a label like "Фото") */
export interface ChatPreview {
  text: string
  outgoing: boolean
  senderName?: string
  timestamp: number
}

export interface Chat {
  chatId: string
  title: string
  messages: Message[]
  unread: number
  /** Shown under the title while the chat has no messages (e.g. @username) */
  subtitle?: string
  historyLoaded?: boolean
  preview?: ChatPreview
}

export interface ChatInfo {
  chatId: string
  name: string
  type: 'user' | 'group' | 'supergroup' | 'channel' | string
  phoneNumber: number
  username: string
}

/** getChatHistory item (only the fields we use) */
export interface HistoryItem {
  type: 'incoming' | 'outgoing'
  idMessage: string
  timestamp: number
  typeMessage: string
  textMessage?: string
  /** Replies (quotedMessage) carry their text here */
  extendedTextMessage?: { text?: string }
  statusMessage?: string
  senderId?: string
  senderName?: string
  /** Caption of a photo, video or file */
  caption?: string
}

/** GREEN-API queue notification (only the fields we use) */
export interface Notification {
  receiptId: number
  body: {
    typeWebhook: string
    timestamp: number
    idMessage?: string
    /** outgoingMessageStatus only */
    chatId?: string
    status?: string
    senderData?: {
      chatId: string
      /** Sender id (differs from chatId in groups) */
      sender?: string
      chatName?: string
      senderName?: string
    }
    messageData?: {
      typeMessage: string
      textMessageData?: { textMessage: string }
      extendedTextMessageData?: { text: string }
    }
  }
}

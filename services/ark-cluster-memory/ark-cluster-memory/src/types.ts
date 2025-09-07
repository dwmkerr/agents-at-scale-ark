export type Message = unknown;

export interface StoredMessage {
  timestamp: string;
  session_id: string;
  query_id: string;
  message: Message;
}

export interface AddMessageRequest {
  message: Message;
}

export interface AddMessagesRequest {
  messages: Message[];
}

export interface MessagesResponse {
  messages: Message[];
}
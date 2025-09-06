export type Message = unknown;

export interface AddMessageRequest {
  message: Message;
}

export interface AddMessagesRequest {
  messages: Message[];
}

export interface MessagesResponse {
  messages: Message[];
}
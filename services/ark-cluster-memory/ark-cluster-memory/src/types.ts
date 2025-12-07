export type Message = unknown;

export interface StoredMessage {
  timestamp: string;
  session_id: string;
  query_id: string;
  message: Message;
  sequence: number;
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

export interface StreamChoice {
  index: number;
  delta: {
    content?: string;
  };
  finish_reason?: string;
}

export interface StreamError {
  message: string;
  type: string;
  code?: string;
}

export interface StreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices?: StreamChoice[];
  error?: StreamError;
}

export interface Question {
  id: string;
  sender: string;
  recipient: string;
  channels: string[];
  content: string;
  status: 'pending' | 'answered';
  response?: string;
  createdAt: string;
  answeredAt?: string;
}

export interface CreateQuestionInput {
  sender: string;
  recipient: string;
  channels?: string[];
  content: string;
}

export interface QuestionFilter {
  sender?: string;
  recipient?: string;
  status?: 'pending' | 'answered';
}
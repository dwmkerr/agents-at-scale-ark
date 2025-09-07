import { Message, StoredMessage } from './types.js';

export class MemoryStore {
  // Flat list of all messages with metadata
  private messages: StoredMessage[] = [];
  private readonly maxMessageSize: number;

  constructor(maxMessageSize = 10 * 1024 * 1024) {
    this.maxMessageSize = maxMessageSize;
  }

  private validateSessionID(sessionID: string): void {
    if (!sessionID || typeof sessionID !== 'string') {
      throw new Error('Session ID cannot be empty');
    }
  }

  private validateMessage(message: Message): void {
    const messageSize = JSON.stringify(message).length;
    if (messageSize > this.maxMessageSize) {
      throw new Error(`Message exceeds maximum size of ${this.maxMessageSize} bytes`);
    }
  }

  addMessage(sessionID: string, message: Message): void {
    this.validateSessionID(sessionID);
    this.validateMessage(message);

    const storedMessage: StoredMessage = {
      timestamp: new Date().toISOString(),
      session_id: sessionID,
      query_id: '', // Legacy method without query_id
      message
    };
    
    this.messages.push(storedMessage);
  }

  addMessages(sessionID: string, messages: Message[]): void {
    this.validateSessionID(sessionID);
    
    for (const message of messages) {
      this.validateMessage(message);
    }

    const timestamp = new Date().toISOString();
    const storedMessages = messages.map(msg => ({
      timestamp,
      session_id: sessionID,
      query_id: '', // Legacy method without query_id
      message: msg
    }));
    
    this.messages.push(...storedMessages);
  }

  addMessagesWithMetadata(sessionID: string, queryID: string, messages: Message[]): void {
    this.validateSessionID(sessionID);
    
    if (!queryID) {
      throw new Error('Query ID cannot be empty');
    }
    
    for (const message of messages) {
      this.validateMessage(message);
    }

    const timestamp = new Date().toISOString();
    const storedMessages = messages.map(msg => ({
      timestamp,
      session_id: sessionID,
      query_id: queryID,
      message: msg
    }));
    
    this.messages.push(...storedMessages);
  }

  getMessages(sessionID: string): Message[] {
    this.validateSessionID(sessionID);
    // Return just the message content for backward compatibility
    return this.messages
      .filter(m => m.session_id === sessionID)
      .map(m => m.message);
  }

  getMessagesWithMetadata(sessionID: string, queryID?: string): StoredMessage[] {
    this.validateSessionID(sessionID);
    let filtered = this.messages.filter(m => m.session_id === sessionID);
    if (queryID) {
      filtered = filtered.filter(m => m.query_id === queryID);
    }
    return filtered;
  }

  clearSession(sessionID: string): void {
    this.validateSessionID(sessionID);
    this.messages = this.messages.filter(m => m.session_id !== sessionID);
  }

  getSessions(): string[] {
    // Get unique session IDs from the flat list
    const sessionSet = new Set(this.messages.map(m => m.session_id));
    return Array.from(sessionSet);
  }

  getAllSessions(): string[] {
    // Alias for getSessions() for clarity
    return this.getSessions();
  }

  getAllMessages(): StoredMessage[] {
    // Return all messages from the flat list
    return this.messages;
  }

  getStats(): { sessions: number; totalMessages: number } {
    const uniqueSessions = new Set(this.messages.map(m => m.session_id));
    
    return {
      sessions: uniqueSessions.size,
      totalMessages: this.messages.length
    };
  }

  isHealthy(): boolean {
    return true;
  }
}
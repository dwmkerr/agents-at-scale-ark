import { Message } from './types.js';

export class MemoryStore {
  private sessions: Map<string, Message[]> = new Map();
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

    if (!this.sessions.has(sessionID)) {
      this.sessions.set(sessionID, []);
    }
    
    this.sessions.get(sessionID)!.push(message);
  }

  addMessages(sessionID: string, messages: Message[]): void {
    this.validateSessionID(sessionID);
    
    for (const message of messages) {
      this.validateMessage(message);
    }

    if (!this.sessions.has(sessionID)) {
      this.sessions.set(sessionID, []);
    }
    
    this.sessions.get(sessionID)!.push(...messages);
  }

  getMessages(sessionID: string): Message[] {
    this.validateSessionID(sessionID);
    return this.sessions.get(sessionID) || [];
  }

  clearSession(sessionID: string): void {
    this.validateSessionID(sessionID);
    this.sessions.delete(sessionID);
  }

  getSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  getStats(): { sessions: number; totalMessages: number } {
    let totalMessages = 0;
    for (const messages of this.sessions.values()) {
      totalMessages += messages.length;
    }
    
    return {
      sessions: this.sessions.size,
      totalMessages
    };
  }

  isHealthy(): boolean {
    return true;
  }
}
import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import { mkdirSync } from 'fs';

export interface OTLPAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string;
    doubleValue?: number;
    boolValue?: boolean;
    arrayValue?: { values: OTLPAttribute['value'][] };
  };
}

export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes?: OTLPAttribute[];
  status?: { code?: number; message?: string };
  events?: { name: string; timeUnixNano: string; attributes?: OTLPAttribute[] }[];
}

export interface OTLPScopeSpan {
  scope?: { name?: string; version?: string };
  spans: OTLPSpan[];
}

export interface OTLPResourceSpan {
  resource?: { attributes?: OTLPAttribute[] };
  scopeSpans: OTLPScopeSpan[];
}

export interface OTLPTraceData {
  resourceSpans: OTLPResourceSpan[];
}

export interface SessionSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  queryCount: number;
  activeQueries: number;
}

export interface SessionDetail {
  resourceVersion: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  queries: Record<string, { traceId: string; spans: OTLPSpan[] }>;
}

export interface SessionListResponse {
  resourceVersion: string;
  sessions: SessionSummary[];
  cursor?: string;
}

interface StoredSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  traceIds: Set<string>;
  queries: Map<string, { traceId: string; spans: OTLPSpan[]; isActive: boolean }>;
}

export class SessionStore {
  private sessions: Map<string, StoredSession> = new Map();
  private traceToSession: Map<string, string> = new Map();
  private resourceVersion: number = 0;
  private readonly sessionsFilePath?: string;
  public eventEmitter: EventEmitter = new EventEmitter();

  constructor() {
    this.sessionsFilePath = process.env.SESSIONS_FILE_PATH;
    this.loadFromFile();
  }

  ingestTraces(data: OTLPTraceData): void {
    for (const resourceSpan of data.resourceSpans) {
      for (const scopeSpan of resourceSpan.scopeSpans) {
        for (const span of scopeSpan.spans) {
          this.processSpan(span);
        }
      }
    }
    this.saveToFile();
  }

  private processSpan(span: OTLPSpan): void {
    const sessionId = this.getAttributeValue(span.attributes, 'session.id');
    const queryName = this.getAttributeValue(span.attributes, 'query.name');
    const traceId = span.traceId;

    let targetSessionId = sessionId || this.traceToSession.get(traceId) || `session-${traceId.substring(0, 8)}`;

    if (sessionId) this.traceToSession.set(traceId, sessionId);

    let session = this.sessions.get(targetSessionId);
    if (!session) {
      session = {
        id: targetSessionId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        traceIds: new Set(),
        queries: new Map(),
      };
      this.sessions.set(targetSessionId, session);
    }

    session.traceIds.add(traceId);
    session.updatedAt = new Date().toISOString();

    const effectiveQueryName = queryName || `query-${traceId.substring(0, 8)}`;

    let query = session.queries.get(effectiveQueryName);
    if (!query) {
      query = { traceId, spans: [], isActive: true };
      session.queries.set(effectiveQueryName, query);
    }

    query.spans.push(span);

    if (span.endTimeUnixNano && span.name.startsWith('query.')) {
      query.isActive = false;
    }

    this.resourceVersion++;
    this.eventEmitter.emit('span', {
      resourceVersion: this.resourceVersion.toString(),
      sessionId: targetSessionId,
      queryName: effectiveQueryName,
      span,
    });
  }

  private getAttributeValue(attributes: OTLPAttribute[] | undefined, key: string): string | undefined {
    return attributes?.find(a => a.key === key)?.value.stringValue;
  }

  getSessions(options?: { limit?: number; before?: string; active?: boolean }): SessionListResponse {
    const limit = options?.limit || 100;
    let sessions = Array.from(this.sessions.values());

    if (options?.active) {
      sessions = sessions.filter(s => Array.from(s.queries.values()).some(q => q.isActive));
    }

    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    if (options?.before) {
      const idx = sessions.findIndex(s => s.id === options.before);
      if (idx > 0) sessions = sessions.slice(idx);
    }

    const paginated = sessions.slice(0, limit);
    const cursor = paginated.length === limit && sessions.length > limit ? paginated[paginated.length - 1].id : undefined;

    return {
      resourceVersion: this.resourceVersion.toString(),
      sessions: paginated.map(s => ({
        id: s.id,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        queryCount: s.queries.size,
        activeQueries: Array.from(s.queries.values()).filter(q => q.isActive).length,
      })),
      cursor,
    };
  }

  getSession(id: string): SessionDetail | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    const queries: Record<string, { traceId: string; spans: OTLPSpan[] }> = {};
    for (const [name, query] of session.queries) {
      queries[name] = { traceId: query.traceId, spans: query.spans };
    }

    return {
      resourceVersion: this.resourceVersion.toString(),
      id: session.id,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      queries,
    };
  }

  getResourceVersion(): string {
    return this.resourceVersion.toString();
  }

  purge(): void {
    this.sessions.clear();
    this.traceToSession.clear();
    this.resourceVersion = 0;
    this.saveToFile();
  }

  private loadFromFile(): void {
    if (!this.sessionsFilePath) {
      console.log('[SESSIONS LOAD] File persistence disabled');
      return;
    }

    try {
      if (existsSync(this.sessionsFilePath)) {
        const data = readFileSync(this.sessionsFilePath, 'utf-8');
        const parsed = JSON.parse(data);

        if (parsed.sessions && Array.isArray(parsed.sessions)) {
          for (const s of parsed.sessions) {
            const session: StoredSession = {
              id: s.id,
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
              traceIds: new Set(s.traceIds || []),
              queries: new Map(Object.entries(s.queries || {}).map(([k, v]: [string, any]) => [
                k,
                { traceId: v.traceId, spans: v.spans, isActive: v.isActive }
              ])),
            };
            this.sessions.set(s.id, session);
          }
          this.resourceVersion = parsed.resourceVersion || 0;
          console.log(`[SESSIONS LOAD] Loaded ${this.sessions.size} sessions from ${this.sessionsFilePath}`);
        }
      } else {
        console.log(`[SESSIONS LOAD] File not found at ${this.sessionsFilePath}, starting fresh`);
      }
    } catch (error) {
      console.error(`[SESSIONS LOAD] Failed to load: ${error}`);
    }
  }

  private saveToFile(): void {
    if (!this.sessionsFilePath) return;

    try {
      const dir = dirname(this.sessionsFilePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data = {
        resourceVersion: this.resourceVersion,
        sessions: Array.from(this.sessions.values()).map(s => ({
          id: s.id,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          traceIds: Array.from(s.traceIds),
          queries: Object.fromEntries(
            Array.from(s.queries.entries()).map(([k, v]) => [k, v])
          ),
        })),
      };

      writeFileSync(this.sessionsFilePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`[SESSIONS SAVE] Saved ${this.sessions.size} sessions to ${this.sessionsFilePath}`);
    } catch (error) {
      console.error(`[SESSIONS SAVE] Failed to save: ${error}`);
    }
  }
}

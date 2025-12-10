const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  (typeof window !== 'undefined' ? window.location.origin : '');

export interface OTLPAttributeValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
}

export interface OTLPAttribute {
  key: string;
  value: OTLPAttributeValue;
}

export interface OTLPEvent {
  name: string;
  timeUnixNano?: string;
  attributes?: OTLPAttribute[];
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
  events?: OTLPEvent[];
  status?: { code?: number; message?: string };
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

export interface SessionsFilters {
  limit?: number;
  before?: string;
  active?: boolean;
}

export type SpanEventHandler = (data: {
  sessionId: string;
  queryName: string;
  span: OTLPSpan;
}) => void;

export const sessionsService = {
  async getSessions(filters?: SessionsFilters): Promise<SessionListResponse> {
    const params = new URLSearchParams();
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.before) params.append('before', filters.before);
    if (filters?.active) params.append('active', 'true');

    const queryString = params.toString();
    const url = `${API_BASE}/api/v1/broker/sessions${queryString ? `?${queryString}` : ''}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch sessions: ${response.statusText}`);
    }
    return response.json();
  },

  async getSession(id: string): Promise<SessionDetail> {
    const url = `${API_BASE}/api/v1/broker/sessions/${id}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch session: ${response.statusText}`);
    }
    return response.json();
  },

  watchSessions(
    resourceVersion: string,
    onSpan: SpanEventHandler,
    onError?: (error: Error) => void,
  ): () => void {
    const url = `${API_BASE}/api/v1/broker/sessions?watch=true&resourceVersion=${resourceVersion}`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener('span', event => {
      try {
        const data = JSON.parse(event.data);
        onSpan(data);
      } catch (e) {
        console.error('Failed to parse span event:', e);
      }
    });

    eventSource.onerror = () => {
      onError?.(new Error('SSE connection error'));
    };

    return () => eventSource.close();
  },

  watchSession(
    id: string,
    resourceVersion: string,
    onSpan: SpanEventHandler,
    onError?: (error: Error) => void,
  ): () => void {
    const url = `${API_BASE}/api/v1/broker/sessions/${id}?watch=true&resourceVersion=${resourceVersion}`;
    const eventSource = new EventSource(url);

    eventSource.addEventListener('span', event => {
      try {
        const data = JSON.parse(event.data);
        onSpan({ sessionId: id, ...data });
      } catch (e) {
        console.error('Failed to parse span event:', e);
      }
    });

    eventSource.onerror = () => {
      onError?.(new Error('SSE connection error'));
    };

    return () => eventSource.close();
  },

  async purgeSessions(): Promise<void> {
    const url = `${API_BASE}/api/v1/broker/sessions`;
    const response = await fetch(url, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error(`Failed to purge sessions: ${response.statusText}`);
    }
  },
};

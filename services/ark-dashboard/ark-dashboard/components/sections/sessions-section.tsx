'use client';

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  GitBranch,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  type OTLPSpan,
  type SessionDetail,
  type SessionSummary,
  sessionsService,
} from '@/lib/services/sessions';

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';

interface SessionsSectionProps {
  readonly active?: boolean;
}

type SelectedItem =
  | { type: 'session'; session: SessionSummary; detail?: SessionDetail }
  | {
      type: 'query';
      session: SessionSummary;
      queryName: string;
      query: { traceId: string; spans: OTLPSpan[] };
    }
  | { type: 'span'; span: OTLPSpan };

export function SessionsSection({ active }: SessionsSectionProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resourceVersion, setResourceVersion] = useState<string>('0');
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(
    new Set(),
  );
  const [expandedQueries, setExpandedQueries] = useState<Set<string>>(
    new Set(),
  );
  const [sessionDetails, setSessionDetails] = useState<
    Record<string, SessionDetail>
  >({});
  const [selected, setSelected] = useState<SelectedItem | null>(null);

  const cleanupRef = useRef<(() => void) | null>(null);

  const loadSessions = useCallback(
    async (showRefreshing = false) => {
      if (showRefreshing) setRefreshing(true);

      try {
        const response = await sessionsService.getSessions({ active });
        setSessions(response.sessions);
        setResourceVersion(response.resourceVersion);
      } catch (error) {
        console.error('Failed to load sessions:', error);
        toast.error('Failed to Load Sessions', {
          description:
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred',
        });
      } finally {
        setLoading(false);
        if (showRefreshing) setRefreshing(false);
      }
    },
    [active],
  );

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (resourceVersion === '0') return;

    const cleanup = sessionsService.watchSessions(
      resourceVersion,
      data => {
        setSessions(prev => {
          const idx = prev.findIndex(s => s.id === data.sessionId);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = {
              ...updated[idx],
              updatedAt: new Date().toISOString(),
            };
            return updated;
          }
          return [
            {
              id: data.sessionId,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              queryCount: 1,
              activeQueries: 1,
            },
            ...prev,
          ];
        });

        if (expandedSessions.has(data.sessionId)) {
          setSessionDetails(prev => {
            const detail = prev[data.sessionId];
            if (!detail) return prev;

            const queries = { ...detail.queries };
            const query = queries[data.queryName] || {
              traceId: data.span.traceId,
              spans: [],
            };
            queries[data.queryName] = {
              ...query,
              spans: [...query.spans, data.span],
            };

            return {
              ...prev,
              [data.sessionId]: { ...detail, queries },
            };
          });
        }
      },
      error => {
        console.error('SSE error:', error);
      },
    );

    cleanupRef.current = cleanup;
    return () => cleanup();
  }, [resourceVersion, expandedSessions]);

  const toggleSession = async (sessionId: string) => {
    const newExpanded = new Set(expandedSessions);
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId);
    } else {
      newExpanded.add(sessionId);
      if (!sessionDetails[sessionId]) {
        try {
          const detail = await sessionsService.getSession(sessionId);
          setSessionDetails(prev => ({ ...prev, [sessionId]: detail }));
        } catch (error) {
          console.error('Failed to load session details:', error);
          toast.error('Failed to load session details');
        }
      }
    }
    setExpandedSessions(newExpanded);
  };

  const toggleQuery = (queryKey: string) => {
    const newExpanded = new Set(expandedQueries);
    if (newExpanded.has(queryKey)) {
      newExpanded.delete(queryKey);
    } else {
      newExpanded.add(queryKey);
    }
    setExpandedQueries(newExpanded);
  };

  const handlePurge = async () => {
    try {
      await sessionsService.purgeSessions();
      setSessions([]);
      setSessionDetails({});
      setExpandedSessions(new Set());
      setExpandedQueries(new Set());
      setSelected(null);
      toast.success('Sessions purged');
    } catch {
      toast.error('Failed to purge sessions');
    }
  };

  const formatAge = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'just now';
  };

  const getSpanType = (span: OTLPSpan): string => {
    const name = span.name;
    if (name.startsWith('query.')) return 'chain';
    if (name.startsWith('model.') || name.startsWith('llm.')) return 'llm';
    if (name.startsWith('tool.')) return 'tool';
    if (name.startsWith('agent.')) return 'agent';
    if (name.startsWith('team.')) return 'team';
    if (name.startsWith('target.')) return 'target';
    if (name === 'HTTP' || name.includes('http')) return 'http';
    return 'unknown';
  };

  const getSpanTypeColor = (type: string): string => {
    switch (type) {
      case 'chain':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
      case 'llm':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
      case 'agent':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
      case 'tool':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
      case 'team':
        return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300';
      case 'target':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'http':
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const isSpanError = (span: OTLPSpan): boolean => {
    return span.status?.code === 2;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin text-gray-400" />
          <p className="text-gray-500">Loading sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Tree View */}
      <div className="w-80 flex-shrink-0 overflow-auto border-r bg-gray-50 dark:bg-gray-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-gray-50 p-3 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handlePurge}
              disabled={sessions.length === 0}
              title="Purge all">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadSessions(true)}
              disabled={refreshing}
              title="Refresh">
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            No sessions yet
          </div>
        ) : (
          <div className="p-2">
            {sessions.map(session => {
              const isExpanded = expandedSessions.has(session.id);
              const detail = sessionDetails[session.id];
              const isSelected =
                selected?.type === 'session' &&
                selected.session.id === session.id;

              return (
                <div key={session.id} className="mb-1">
                  {/* Session Node */}
                  <div
                    className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-gray-200 dark:hover:bg-gray-800 ${
                      isSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                    }`}
                    onClick={() =>
                      setSelected({ type: 'session', session, detail })
                    }>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        toggleSession(session.id);
                      }}
                      className="flex-shrink-0 rounded p-0.5 hover:bg-gray-300 dark:hover:bg-gray-700">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </button>
                    <GitBranch className="h-4 w-4 flex-shrink-0 text-gray-500" />
                    <span className="flex-1 truncate font-mono text-xs">
                      {session.id.length > 20
                        ? `${session.id.slice(0, 20)}...`
                        : session.id}
                    </span>
                    {session.activeQueries > 0 && (
                      <span className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-green-500" />
                    )}
                  </div>

                  {/* Queries */}
                  {isExpanded && detail && (
                    <div className="ml-4 border-l border-gray-300 pl-2 dark:border-gray-700">
                      {Object.entries(detail.queries).map(
                        ([queryName, query]) => {
                          const queryKey = `${session.id}:${queryName}`;
                          const isQueryExpanded = expandedQueries.has(queryKey);
                          const isQuerySelected =
                            selected?.type === 'query' &&
                            selected.session.id === session.id &&
                            selected.queryName === queryName;

                          return (
                            <div key={queryName} className="my-0.5">
                              {/* Query Node */}
                              <div
                                className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm hover:bg-gray-200 dark:hover:bg-gray-800 ${
                                  isQuerySelected
                                    ? 'bg-blue-100 dark:bg-blue-900/30'
                                    : ''
                                }`}
                                onClick={() =>
                                  setSelected({
                                    type: 'query',
                                    session,
                                    queryName,
                                    query,
                                  })
                                }>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    toggleQuery(queryKey);
                                  }}
                                  className="flex-shrink-0 rounded p-0.5 hover:bg-gray-300 dark:hover:bg-gray-700">
                                  {isQueryExpanded ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                </button>
                                <Search className="h-4 w-4 text-gray-500" />
                                <span className="flex-1 truncate font-mono text-xs">
                                  {queryName}
                                </span>
                                <Badge
                                  variant="outline"
                                  className="px-1 py-0 text-[10px]">
                                  {query.spans.length}
                                </Badge>
                              </div>

                              {/* Spans */}
                              {isQueryExpanded && (
                                <div className="ml-4 border-l border-gray-300 pl-2 dark:border-gray-700">
                                  {query.spans.map(span => {
                                    const isSpanSelected =
                                      selected?.type === 'span' &&
                                      selected.span.spanId === span.spanId;
                                    const spanType = getSpanType(span);
                                    const hasError = isSpanError(span);

                                    return (
                                      <div
                                        key={span.spanId}
                                        className={`flex cursor-pointer items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-800 ${
                                          isSpanSelected
                                            ? 'bg-blue-100 dark:bg-blue-900/30'
                                            : ''
                                        }`}
                                        onClick={() =>
                                          setSelected({ type: 'span', span })
                                        }>
                                        <span
                                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${getSpanTypeColor(spanType)}`}>
                                          {spanType}
                                        </span>
                                        <span className="flex-1 truncate font-mono">
                                          {span.name}
                                        </span>
                                        {hasError ? (
                                          <AlertCircle className="h-3 w-3 flex-shrink-0 text-red-500" />
                                        ) : (
                                          <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-green-500" />
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: Details Panel */}
      <div className="flex-1 overflow-auto p-6">
        {!selected ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Activity />
              </EmptyMedia>
              <EmptyTitle>Select an item</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : selected.type === 'session' ? (
          <SessionDetails
            session={selected.session}
            detail={selected.detail}
            formatAge={formatAge}
          />
        ) : selected.type === 'query' ? (
          <QueryDetails
            queryName={selected.queryName}
            query={selected.query}
            getSpanType={getSpanType}
          />
        ) : (
          <SpanDetails span={selected.span} />
        )}
      </div>
    </div>
  );
}

function SessionDetails({
  session,
  detail,
  formatAge,
}: {
  session: SessionSummary;
  detail?: SessionDetail;
  formatAge: (ts: string) => string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Session</h2>
        <p className="font-mono text-sm text-gray-500">{session.id}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">Created</div>
          <div className="text-lg font-medium">
            {formatAge(session.createdAt)}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">Updated</div>
          <div className="text-lg font-medium">
            {formatAge(session.updatedAt)}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">Queries</div>
          <div className="text-lg font-medium">{session.queryCount}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">Active</div>
          <div className="text-lg font-medium">
            {session.activeQueries > 0 ? (
              <span className="text-green-500">
                {session.activeQueries} running
              </span>
            ) : (
              <span className="text-gray-400">None</span>
            )}
          </div>
        </div>
      </div>

      {detail && (
        <div>
          <h3 className="mb-2 font-medium">Queries in this session</h3>
          <div className="space-y-2">
            {Object.entries(detail.queries).map(([name, query]) => (
              <div key={name} className="rounded border p-3">
                <div className="font-mono text-sm">{name}</div>
                <div className="text-xs text-gray-500">
                  {query.spans.length} span{query.spans.length !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function QueryDetails({
  queryName,
  query,
  getSpanType,
}: {
  queryName: string;
  query: { traceId: string; spans: OTLPSpan[] };
  getSpanType: (span: OTLPSpan) => string;
}) {
  const hasErrors = query.spans.some(s => s.status?.code === 2);
  const errorCount = query.spans.filter(s => s.status?.code === 2).length;

  const rootSpan = query.spans.find(s => s.name.startsWith('query.'));
  const input = rootSpan
    ? (getAttr(rootSpan, 'input') ?? getAttr(rootSpan, 'input.value'))
    : undefined;
  const output = rootSpan
    ? (getAttr(rootSpan, 'output') ?? getAttr(rootSpan, 'output.value'))
    : undefined;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
          chain
        </span>
        <h2 className="text-lg font-semibold">{queryName}</h2>
        {hasErrors ? (
          <span className="flex items-center gap-1 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            {errorCount} error{errorCount > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm text-green-500">
            <CheckCircle2 className="h-4 w-4" />
            OK
          </span>
        )}
        <span className="text-sm text-gray-400">
          {query.spans.length} span{query.spans.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Input / Output side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-500">Input</h4>
          <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
            <p className="text-sm whitespace-pre-wrap">
              {input ? String(input) : '-'}
            </p>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-500">Output</h4>
          <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
            <p className="text-sm whitespace-pre-wrap">
              {output ? String(output) : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* Trace ID */}
      <div className="rounded-lg border p-3">
        <div className="mb-1 text-xs text-gray-500">Trace ID</div>
        <div className="font-mono text-xs break-all">{query.traceId}</div>
      </div>

      {/* All Spans */}
      <div>
        <h3 className="mb-2 text-sm font-medium">Spans</h3>
        <div className="max-h-64 space-y-1 overflow-auto">
          {query.spans.map(span => {
            const spanType = getSpanType(span);
            const hasError = span.status?.code === 2;
            return (
              <div
                key={span.spanId}
                className="flex items-center gap-2 rounded border p-2 text-sm">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${getSpanTypeColorLocal(spanType)}`}>
                  {spanType}
                </span>
                <span className="flex-1 truncate font-mono text-xs">
                  {span.name}
                </span>
                {hasError ? (
                  <AlertCircle className="h-3 w-3 flex-shrink-0 text-red-500" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 flex-shrink-0 text-green-500" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function getSpanTypeLocal(name: string): string {
  if (name.startsWith('query.')) return 'chain';
  if (name.startsWith('model.') || name.startsWith('llm.')) return 'llm';
  if (name.startsWith('tool.')) return 'tool';
  if (name.startsWith('agent.')) return 'agent';
  if (name.startsWith('team.')) return 'team';
  if (name.startsWith('target.')) return 'target';
  if (name === 'HTTP' || name.includes('http')) return 'http';
  return 'unknown';
}

function getSpanTypeColorLocal(type: string): string {
  switch (type) {
    case 'chain':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
    case 'llm':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
    case 'agent':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
    case 'tool':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
    case 'team':
      return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300';
    case 'target':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
    case 'http':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

function formatDurationLocal(
  startTimeUnixNano?: string,
  endTimeUnixNano?: string,
): string | null {
  if (!startTimeUnixNano || !endTimeUnixNano) return null;
  const start = BigInt(startTimeUnixNano);
  const end = BigInt(endTimeUnixNano);
  const durationNs = end - start;
  const durationMs = Number(durationNs) / 1_000_000;
  if (durationMs < 1000) return `${durationMs.toFixed(0)}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function getAttr(
  span: OTLPSpan,
  key: string,
): string | number | boolean | undefined {
  const attr = span.attributes?.find(a => a.key === key);
  if (!attr) return undefined;
  return (
    attr.value.stringValue ??
    attr.value.intValue ??
    attr.value.doubleValue ??
    attr.value.boolValue
  );
}

function spanToJson(span: OTLPSpan): Record<string, unknown> {
  const attrs =
    span.attributes?.reduce(
      (acc, attr) => {
        acc[attr.key] =
          attr.value.stringValue ??
          attr.value.intValue ??
          attr.value.doubleValue ??
          attr.value.boolValue;
        return acc;
      },
      {} as Record<string, unknown>,
    ) ?? {};

  return {
    name: span.name,
    spanId: span.spanId,
    traceId: span.traceId,
    parentSpanId: span.parentSpanId,
    status: span.status,
    attributes: attrs,
    events: span.events,
  };
}

function SpanHeader({ span }: { span: OTLPSpan }) {
  const spanType = getSpanTypeLocal(span.name);
  const hasError = span.status?.code === 2;
  const duration = formatDurationLocal(
    span.startTimeUnixNano,
    span.endTimeUnixNano,
  );

  return (
    <div className="flex items-center gap-2">
      <span
        className={`rounded px-2 py-0.5 text-xs font-medium ${getSpanTypeColorLocal(spanType)}`}>
        {spanType}
      </span>
      <h2 className="text-lg font-semibold">{span.name}</h2>
      {hasError ? (
        <span className="flex items-center gap-1 text-sm text-red-500">
          <AlertCircle className="h-4 w-4" />
          ERROR
        </span>
      ) : (
        <span className="flex items-center gap-1 text-sm text-green-500">
          <CheckCircle2 className="h-4 w-4" />
          OK
        </span>
      )}
      {duration && (
        <span className="flex items-center gap-1 text-sm text-gray-500">
          <Clock className="h-3 w-3" />
          {duration}
        </span>
      )}
    </div>
  );
}

function SpanErrorBanner({ span }: { span: OTLPSpan }) {
  if (span.status?.code !== 2 || !span.status?.message) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
      <div className="mb-1 text-xs font-medium text-red-600 dark:text-red-400">
        Status Description
      </div>
      <div className="text-sm break-words text-red-800 dark:text-red-200">
        {span.status.message}
      </div>
    </div>
  );
}

function RawJsonView({ span }: { span: OTLPSpan }) {
  return (
    <pre className="max-h-[600px] overflow-auto rounded-lg border bg-gray-50 p-4 text-xs dark:bg-gray-900">
      {JSON.stringify(spanToJson(span), null, 2)}
    </pre>
  );
}

function InputOutputView({ span }: { span: OTLPSpan }) {
  const input = getAttr(span, 'input') ?? getAttr(span, 'input.value');
  const output = getAttr(span, 'output') ?? getAttr(span, 'output.value');

  if (!input && !output) return null;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-500">Input</h4>
        <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
          <p className="text-sm whitespace-pre-wrap">
            {input ? String(input) : '-'}
          </p>
        </div>
      </div>
      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-500">Output</h4>
        <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
          <p className="text-sm whitespace-pre-wrap">
            {output ? String(output) : '-'}
          </p>
        </div>
      </div>
    </div>
  );
}

function ChainSpanView({ span }: { span: OTLPSpan }) {
  return <InputOutputView span={span} />;
}

function AgentSpanView({ span }: { span: OTLPSpan }) {
  const agentName = getAttr(span, 'agent.name') ?? getAttr(span, 'name');

  return (
    <div className="space-y-4">
      {agentName && (
        <div className="rounded-lg border p-3">
          <div className="mb-1 text-xs text-gray-500">Agent</div>
          <div className="font-mono text-sm">{String(agentName)}</div>
        </div>
      )}
      <InputOutputView span={span} />
    </div>
  );
}

function LlmSpanView({ span }: { span: OTLPSpan }) {
  const model = getAttr(span, 'model') ?? getAttr(span, 'llm.model');
  const tokens =
    getAttr(span, 'llm.token_count.total') ??
    getAttr(span, 'llm.usage.total_tokens');

  return (
    <div className="space-y-4">
      {(model || tokens) && (
        <div className="flex gap-4">
          {model && (
            <div className="rounded-lg border p-3">
              <div className="mb-1 text-xs text-gray-500">Model</div>
              <div className="font-mono text-sm">{String(model)}</div>
            </div>
          )}
          {tokens && (
            <div className="rounded-lg border p-3">
              <div className="mb-1 text-xs text-gray-500">Tokens</div>
              <div className="font-mono text-sm">{String(tokens)}</div>
            </div>
          )}
        </div>
      )}
      <InputOutputView span={span} />
    </div>
  );
}

function ToolSpanView({ span }: { span: OTLPSpan }) {
  const toolName = getAttr(span, 'tool.name') ?? getAttr(span, 'name');
  const input = getAttr(span, 'input') ?? getAttr(span, 'tool.parameters');
  const output = getAttr(span, 'output') ?? getAttr(span, 'tool.result');

  return (
    <div className="space-y-4">
      {toolName && (
        <div className="rounded-lg border p-3">
          <div className="mb-1 text-xs text-gray-500">Tool</div>
          <div className="font-mono text-sm">{String(toolName)}</div>
        </div>
      )}
      {(input || output) && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-500">
              Parameters
            </h4>
            <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
              <p className="text-sm whitespace-pre-wrap">
                {input ? String(input) : '-'}
              </p>
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-500">Result</h4>
            <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
              <p className="text-sm whitespace-pre-wrap">
                {output ? String(output) : '-'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SpanDetails({ span }: { span: OTLPSpan }) {
  const spanType = getSpanTypeLocal(span.name);

  const renderDetails = () => {
    switch (spanType) {
      case 'chain':
        return <ChainSpanView span={span} />;
      case 'agent':
        return <AgentSpanView span={span} />;
      case 'llm':
        return <LlmSpanView span={span} />;
      case 'tool':
        return <ToolSpanView span={span} />;
      default:
        return null;
    }
  };

  const details = renderDetails();

  return (
    <div className="space-y-4">
      <SpanHeader span={span} />
      <SpanErrorBanner span={span} />
      {details}
      <div>
        <h4 className="mb-2 text-sm font-medium text-gray-500">Raw Event</h4>
        <RawJsonView span={span} />
      </div>
    </div>
  );
}

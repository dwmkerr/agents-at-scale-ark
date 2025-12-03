'use client';

import {
  AlertCircle,
  Bot,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  GitBranch,
  Loader2,
  MessageSquare,
  Pause,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { DASHBOARD_SECTIONS } from '@/lib/constants';
import {
  type Session,
  type SessionEvent,
  type SessionQuery,
  sessionsService,
} from '@/lib/services/sessions';

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';

type SelectedItem =
  | { type: 'session'; session: Session }
  | { type: 'query'; session: Session; query: SessionQuery }
  | {
      type: 'event';
      session: Session;
      query: SessionQuery;
      event: SessionEvent;
    };

function formatDuration(ms: number | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatTimestamp(timestamp: string | undefined): string {
  if (!timestamp) return '-';
  return new Date(timestamp).toLocaleString();
}

function getStatusBadge(status: SessionQuery['status']) {
  switch (status) {
    case 'completed':
      return (
        <Badge
          variant="secondary"
          className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      );
    case 'running':
      return (
        <Badge
          variant="secondary"
          className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Running
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive">
          <AlertCircle className="mr-1 h-3 w-3" />
          Error
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline">
          <Clock className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getEventIcon(eventType: string) {
  if (eventType.includes('Tool')) return <Wrench className="h-3.5 w-3.5" />;
  if (eventType.includes('LLM')) return <Zap className="h-3.5 w-3.5" />;
  if (eventType.includes('Agent')) return <Bot className="h-3.5 w-3.5" />;
  if (eventType.includes('Team')) return <Users className="h-3.5 w-3.5" />;
  if (eventType.includes('Memory')) return <Database className="h-3.5 w-3.5" />;
  if (eventType.includes('Query')) return <Search className="h-3.5 w-3.5" />;
  return <MessageSquare className="h-3.5 w-3.5" />;
}

function getEventColor(eventType: string): string {
  if (eventType.includes('Error')) return 'text-red-500';
  if (eventType.includes('Complete')) return 'text-green-500';
  if (eventType.includes('Start')) return 'text-blue-500';
  return 'text-gray-500';
}

function getEventLabel(eventType: string): string {
  return eventType
    .replace(/Start$/, '')
    .replace(/Complete$/, '')
    .replace(/Error$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim();
}

function InterruptDialog({
  open,
  onOpenChange,
  queryName,
  onRestart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queryName: string;
  onRestart: (feedback: string) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRestart = async () => {
    setIsSubmitting(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    onRestart(feedback);
    setFeedback('');
    setIsSubmitting(false);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setFeedback('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pause className="h-5 w-5 text-orange-500" />
            Interrupt Query
          </DialogTitle>
          <DialogDescription>
            You are interrupting <span className="font-mono">{queryName}</span>.
            Provide feedback on what went wrong and how the query should be
            adjusted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <label
              htmlFor="feedback"
              className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              What went wrong?
            </label>
            <Textarea
              id="feedback"
              placeholder="Describe the issue and what changes are needed..."
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={4}
              className="w-full"
            />
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-900 dark:bg-orange-950">
            <p className="text-sm text-orange-800 dark:text-orange-200">
              The query will be stopped and restarted with your feedback
              included as additional context for the agent.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleRestart}
            disabled={!feedback.trim() || isSubmitting}
            className="bg-orange-600 hover:bg-orange-700">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Restarting...
              </>
            ) : (
              <>
                <RotateCcw className="mr-2 h-4 w-4" />
                Restart with Feedback
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionDetailPanel({
  item,
  onInterrupt,
}: {
  item: SelectedItem;
  onInterrupt?: (query: SessionQuery) => void;
}) {
  if (item.type === 'session') {
    const { session } = item;
    return (
      <div className="space-y-6">
        <div>
          <h3 className="mb-4 text-lg font-semibold">Session Details</h3>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Session ID
              </dt>
              <dd className="mt-1 font-mono text-sm">{session.id}</dd>
            </div>
            {session.memoryName && (
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Memory
                </dt>
                <dd className="mt-1 text-sm">{session.memoryName}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Created
              </dt>
              <dd className="mt-1 text-sm">
                {formatTimestamp(session.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Last Activity
              </dt>
              <dd className="mt-1 text-sm">
                {formatTimestamp(session.lastActivity)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Queries
              </dt>
              <dd className="mt-1 text-sm">{session.queries.length}</dd>
            </div>
            {session.totalTokens && (
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Total Tokens
                </dt>
                <dd className="mt-1 text-sm">
                  {session.totalTokens.toLocaleString()}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    );
  }

  if (item.type === 'query') {
    const { query } = item;
    const isRunning = query.status === 'running';

    return (
      <div className="space-y-6">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Query Details</h3>
            <div className="flex items-center gap-2">
              {getStatusBadge(query.status)}
              {isRunning && onInterrupt && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onInterrupt(query)}
                  className="border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950">
                  <Pause className="mr-1 h-4 w-4" />
                  Interrupt
                </Button>
              )}
            </div>
          </div>
          {isRunning && (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Query in progress
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Click Interrupt to stop and provide feedback
                </p>
              </div>
            </div>
          )}
          <dl className="space-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Name
              </dt>
              <dd className="mt-1 font-mono text-sm">{query.name}</dd>
            </div>
            {query.targetName && (
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Target
                </dt>
                <dd className="mt-1 text-sm">
                  {query.targetName}{' '}
                  <span className="text-gray-500">({query.targetType})</span>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Duration
              </dt>
              <dd className="mt-1 text-sm">
                {formatDuration(query.durationMs)}
              </dd>
            </div>
            {query.tokenUsage && (
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Token Usage
                </dt>
                <dd className="mt-1 text-sm">
                  {query.tokenUsage.prompt.toLocaleString()} prompt /{' '}
                  {query.tokenUsage.completion.toLocaleString()} completion /{' '}
                  {query.tokenUsage.total.toLocaleString()} total
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            Input
          </h4>
          <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
            <p className="text-sm whitespace-pre-wrap">{query.input}</p>
          </div>
        </div>
        {query.output && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
              Output
            </h4>
            <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
              <p className="text-sm whitespace-pre-wrap">{query.output}</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (item.type === 'event') {
    const { event } = item;
    return (
      <div className="space-y-6">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <span className={getEventColor(event.type)}>
              {getEventIcon(event.type)}
            </span>
            <h3 className="text-lg font-semibold">
              {getEventLabel(event.type)}
            </h3>
            {event.type.includes('Error') && (
              <Badge variant="destructive">Error</Badge>
            )}
            {event.type.includes('Complete') && (
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Complete
              </Badge>
            )}
            {event.type.includes('Start') && (
              <Badge
                variant="secondary"
                className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                Start
              </Badge>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Event Type
              </dt>
              <dd className="mt-1 font-mono text-sm">{event.type}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Timestamp
              </dt>
              <dd className="mt-1 text-sm">
                {formatTimestamp(event.timestamp)}
              </dd>
            </div>
            {event.durationMs !== undefined && (
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  Duration
                </dt>
                <dd className="mt-1 text-sm">
                  {formatDuration(event.durationMs)}
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
            Message
          </h4>
          <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
            <p className="text-sm">{event.message}</p>
          </div>
        </div>
        {Object.keys(event.data).length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
              Event Data
            </h4>
            <div className="rounded-lg bg-gray-100 p-3 dark:bg-gray-800">
              <pre className="overflow-x-auto text-xs">
                {JSON.stringify(event.data, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

function QueryTreeItem({
  session,
  query,
  selectedItem,
  onSelect,
}: {
  session: Session;
  query: SessionQuery;
  selectedItem: SelectedItem | null;
  onSelect: (item: SelectedItem) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const isSelected =
    selectedItem?.type === 'query' && selectedItem.query.id === query.id;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center">
        <CollapsibleTrigger className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </CollapsibleTrigger>
        <button
          onClick={() => onSelect({ type: 'query', session, query })}
          className={`ml-1 flex flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800 ${
            isSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''
          }`}>
          <Search className="h-4 w-4 text-gray-500" />
          <span className="flex-1 truncate">{query.name}</span>
          <span
            className={`h-2 w-2 rounded-full ${
              query.status === 'completed'
                ? 'bg-green-500'
                : query.status === 'running'
                  ? 'animate-pulse bg-blue-500'
                  : query.status === 'error'
                    ? 'bg-red-500'
                    : 'bg-gray-400'
            }`}
          />
        </button>
      </div>
      <CollapsibleContent>
        <div className="ml-7 space-y-0.5 border-l border-gray-200 pl-3 dark:border-gray-700">
          {query.events.map(event => {
            const isEventSelected =
              selectedItem?.type === 'event' &&
              selectedItem.event.id === event.id;
            return (
              <button
                key={event.id}
                onClick={() =>
                  onSelect({ type: 'event', session, query, event })
                }
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800 ${
                  isEventSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                }`}>
                <span className={getEventColor(event.type)}>
                  {getEventIcon(event.type)}
                </span>
                <span className="flex-1 truncate">
                  {getEventLabel(event.type)}
                </span>
                {event.durationMs !== undefined && (
                  <span className="text-gray-400">
                    {formatDuration(event.durationMs)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SessionTreeItem({
  session,
  selectedItem,
  onSelect,
}: {
  session: Session;
  selectedItem: SelectedItem | null;
  onSelect: (item: SelectedItem) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const isSelected =
    selectedItem?.type === 'session' && selectedItem.session.id === session.id;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center">
        <CollapsibleTrigger className="flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </CollapsibleTrigger>
        <button
          onClick={() => onSelect({ type: 'session', session })}
          className={`ml-1 flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 ${
            isSelected ? 'bg-blue-100 dark:bg-blue-900/30' : ''
          }`}>
          <GitBranch className="h-4 w-4 text-gray-500" />
          <span className="flex-1 truncate">
            {session.memoryName ?? session.id}
          </span>
          <span className="text-xs text-gray-400">
            {session.queries.length} queries
          </span>
        </button>
      </div>
      <CollapsibleContent>
        <div className="ml-3 space-y-0.5 border-l border-gray-200 pl-3 dark:border-gray-700">
          {session.queries.map(query => (
            <QueryTreeItem
              key={query.id}
              session={session}
              query={query}
              selectedItem={selectedItem}
              onSelect={onSelect}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function SessionsSection() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const [interruptDialogOpen, setInterruptDialogOpen] = useState(false);
  const [queryToInterrupt, setQueryToInterrupt] = useState<SessionQuery | null>(
    null,
  );

  const handleInterrupt = (query: SessionQuery) => {
    setQueryToInterrupt(query);
    setInterruptDialogOpen(true);
  };

  const handleRestart = (feedback: string) => {
    if (queryToInterrupt) {
      toast.success('Query Restarted', {
        description: `Query "${queryToInterrupt.name}" has been restarted with your feedback.`,
      });
      console.log('Restarting query with feedback:', {
        queryId: queryToInterrupt.id,
        queryName: queryToInterrupt.name,
        feedback,
      });
    }
    setQueryToInterrupt(null);
  };

  const loadSessions = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const result = await sessionsService.getAll();
      setSessions(result.items);
      if (result.items.length > 0 && !showRefreshing) {
        setSelectedItem({ type: 'session', session: result.items[0] });
      }
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
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

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

  if (sessions.length === 0) {
    return (
      <div className="p-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <DASHBOARD_SECTIONS.sessions.icon />
            </EmptyMedia>
            <EmptyTitle>No Sessions Yet</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-[calc(100vh-12rem)]">
        <div className="w-96 border-r dark:border-gray-800">
          <div className="flex items-center justify-between border-b p-3 dark:border-gray-800">
            <h2 className="text-sm font-semibold">Sessions</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => loadSessions(true)}
              disabled={refreshing}>
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
          <ScrollArea className="h-[calc(100%-3.5rem)]">
            <div className="space-y-1 p-2">
              {sessions.map(session => (
                <SessionTreeItem
                  key={session.id}
                  session={session}
                  selectedItem={selectedItem}
                  onSelect={setSelectedItem}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="border-b p-3 dark:border-gray-800">
            <h2 className="text-sm font-semibold">Details</h2>
          </div>
          <ScrollArea className="h-[calc(100%-3.5rem)]">
            <div className="p-4">
              {selectedItem ? (
                <SessionDetailPanel
                  item={selectedItem}
                  onInterrupt={handleInterrupt}
                />
              ) : (
                <p className="text-center text-gray-500">
                  Select an item to view details
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
      <InterruptDialog
        open={interruptDialogOpen}
        onOpenChange={setInterruptDialogOpen}
        queryName={queryToInterrupt?.name ?? ''}
        onRestart={handleRestart}
      />
    </>
  );
}

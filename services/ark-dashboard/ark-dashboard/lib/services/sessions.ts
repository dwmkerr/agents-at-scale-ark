export type SessionEventType =
  | 'QueryExecutionStart'
  | 'QueryExecutionComplete'
  | 'QueryExecutionError'
  | 'TargetExecutionStart'
  | 'TargetExecutionComplete'
  | 'TargetExecutionError'
  | 'AgentExecutionStart'
  | 'AgentExecutionComplete'
  | 'AgentExecutionError'
  | 'ToolCallStart'
  | 'ToolCallComplete'
  | 'ToolCallError'
  | 'TeamExecutionStart'
  | 'TeamExecutionComplete'
  | 'TeamExecutionError'
  | 'TeamMemberStart'
  | 'TeamMemberComplete'
  | 'TeamMemberError'
  | 'TeamTurnStart'
  | 'TeamTurnComplete'
  | 'TeamTurnError'
  | 'LLMCallStart'
  | 'LLMCallComplete'
  | 'LLMCallError'
  | 'MemoryAddMessagesStart'
  | 'MemoryAddMessagesComplete'
  | 'MemoryGetMessagesStart'
  | 'MemoryGetMessagesComplete';

export interface SessionEvent {
  id: string;
  type: SessionEventType;
  timestamp: string;
  durationMs?: number;
  message: string;
  data: Record<string, unknown>;
}

export interface SessionQuery {
  id: string;
  name: string;
  input: string;
  output?: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  startTime: string;
  endTime?: string;
  durationMs?: number;
  targetName?: string;
  targetType?: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  events: SessionEvent[];
}

export interface Session {
  id: string;
  memoryName?: string;
  createdAt: string;
  lastActivity: string;
  queries: SessionQuery[];
  totalTokens?: number;
}

const MOCK_SESSIONS: Session[] = [
  {
    id: 'session-abc123',
    memoryName: 'weather-agent-memory',
    createdAt: '2025-12-03T10:00:00Z',
    lastActivity: '2025-12-03T10:15:32Z',
    totalTokens: 4521,
    queries: [
      {
        id: 'query-001',
        name: 'weather-query-london',
        input: 'What is the weather in London today?',
        output:
          'The current weather in London is 12°C with partly cloudy skies. Expected high of 14°C and low of 8°C.',
        status: 'completed',
        startTime: '2025-12-03T10:00:00Z',
        endTime: '2025-12-03T10:00:12Z',
        durationMs: 12340,
        targetName: 'weather-agent',
        targetType: 'Agent',
        tokenUsage: { prompt: 156, completion: 89, total: 245 },
        events: [
          {
            id: 'evt-001-1',
            type: 'QueryExecutionStart',
            timestamp: '2025-12-03T10:00:00.000Z',
            message: 'Query execution started',
            data: {
              queryName: 'weather-query-london',
              sessionId: 'session-abc123',
            },
          },
          {
            id: 'evt-001-2',
            type: 'TargetExecutionStart',
            timestamp: '2025-12-03T10:00:00.100Z',
            message: 'Starting agent execution',
            data: { targetName: 'weather-agent', targetType: 'Agent' },
          },
          {
            id: 'evt-001-3',
            type: 'AgentExecutionStart',
            timestamp: '2025-12-03T10:00:00.150Z',
            message: 'Agent weather-agent starting',
            data: { agentName: 'weather-agent', model: 'gpt-4o' },
          },
          {
            id: 'evt-001-4',
            type: 'LLMCallStart',
            timestamp: '2025-12-03T10:00:00.200Z',
            message: 'Calling LLM for initial response',
            data: { model: 'gpt-4o', promptTokens: 120 },
          },
          {
            id: 'evt-001-5',
            type: 'LLMCallComplete',
            timestamp: '2025-12-03T10:00:02.500Z',
            durationMs: 2300,
            message: 'LLM call completed',
            data: { model: 'gpt-4o', completionTokens: 45 },
          },
          {
            id: 'evt-001-6',
            type: 'ToolCallStart',
            timestamp: '2025-12-03T10:00:02.600Z',
            message: 'Calling tool: get_weather',
            data: {
              toolName: 'get_weather',
              toolType: 'function',
              parameters: { location: 'London, UK', units: 'metric' },
            },
          },
          {
            id: 'evt-001-7',
            type: 'ToolCallComplete',
            timestamp: '2025-12-03T10:00:08.100Z',
            durationMs: 5500,
            message: 'Tool call completed: get_weather',
            data: {
              toolName: 'get_weather',
              result: {
                temp: 12,
                condition: 'partly_cloudy',
                high: 14,
                low: 8,
              },
            },
          },
          {
            id: 'evt-001-8',
            type: 'LLMCallStart',
            timestamp: '2025-12-03T10:00:08.200Z',
            message: 'Calling LLM for final response',
            data: { model: 'gpt-4o', promptTokens: 36 },
          },
          {
            id: 'evt-001-9',
            type: 'LLMCallComplete',
            timestamp: '2025-12-03T10:00:11.800Z',
            durationMs: 3600,
            message: 'LLM call completed',
            data: { model: 'gpt-4o', completionTokens: 44 },
          },
          {
            id: 'evt-001-10',
            type: 'AgentExecutionComplete',
            timestamp: '2025-12-03T10:00:11.900Z',
            durationMs: 11750,
            message: 'Agent execution completed successfully',
            data: { agentName: 'weather-agent' },
          },
          {
            id: 'evt-001-11',
            type: 'MemoryAddMessagesComplete',
            timestamp: '2025-12-03T10:00:12.100Z',
            durationMs: 150,
            message: 'Messages saved to memory',
            data: { messagesAdded: 2 },
          },
          {
            id: 'evt-001-12',
            type: 'QueryExecutionComplete',
            timestamp: '2025-12-03T10:00:12.340Z',
            durationMs: 12340,
            message: 'Query completed successfully',
            data: { promptTokens: 156, completionTokens: 89, totalTokens: 245 },
          },
        ],
      },
      {
        id: 'query-002',
        name: 'weather-query-paris',
        input: 'What about Paris?',
        output:
          'Paris is currently experiencing 15°C with clear skies. Expected high of 18°C and low of 11°C.',
        status: 'completed',
        startTime: '2025-12-03T10:05:00Z',
        endTime: '2025-12-03T10:05:08Z',
        durationMs: 8120,
        targetName: 'weather-agent',
        targetType: 'Agent',
        tokenUsage: { prompt: 210, completion: 76, total: 286 },
        events: [
          {
            id: 'evt-002-1',
            type: 'QueryExecutionStart',
            timestamp: '2025-12-03T10:05:00.000Z',
            message: 'Query execution started',
            data: {
              queryName: 'weather-query-paris',
              sessionId: 'session-abc123',
            },
          },
          {
            id: 'evt-002-2',
            type: 'MemoryGetMessagesStart',
            timestamp: '2025-12-03T10:05:00.050Z',
            message: 'Retrieving conversation context',
            data: { memoryName: 'weather-agent-memory' },
          },
          {
            id: 'evt-002-3',
            type: 'MemoryGetMessagesComplete',
            timestamp: '2025-12-03T10:05:00.120Z',
            durationMs: 70,
            message: 'Retrieved 2 messages from memory',
            data: { messageCount: 2 },
          },
          {
            id: 'evt-002-4',
            type: 'ToolCallStart',
            timestamp: '2025-12-03T10:05:01.000Z',
            message: 'Calling tool: get_weather',
            data: {
              toolName: 'get_weather',
              parameters: { location: 'Paris, France' },
            },
          },
          {
            id: 'evt-002-5',
            type: 'ToolCallComplete',
            timestamp: '2025-12-03T10:05:05.200Z',
            durationMs: 4200,
            message: 'Tool call completed: get_weather',
            data: {
              toolName: 'get_weather',
              result: { temp: 15, condition: 'clear' },
            },
          },
          {
            id: 'evt-002-6',
            type: 'QueryExecutionComplete',
            timestamp: '2025-12-03T10:05:08.120Z',
            durationMs: 8120,
            message: 'Query completed successfully',
            data: { promptTokens: 210, completionTokens: 76, totalTokens: 286 },
          },
        ],
      },
      {
        id: 'query-003',
        name: 'weather-query-forecast',
        input: "What's the 5-day forecast for both cities?",
        output:
          'London 5-day forecast: Mon 14°C cloudy, Tue 12°C rain, Wed 10°C rain, Thu 11°C cloudy, Fri 13°C sunny. Paris 5-day forecast: Mon 18°C clear, Tue 17°C cloudy, Wed 15°C rain, Thu 14°C cloudy, Fri 16°C sunny.',
        status: 'completed',
        startTime: '2025-12-03T10:10:00Z',
        endTime: '2025-12-03T10:10:45Z',
        durationMs: 45230,
        targetName: 'weather-agent',
        targetType: 'Agent',
        tokenUsage: { prompt: 890, completion: 320, total: 1210 },
        events: [
          {
            id: 'evt-003-1',
            type: 'QueryExecutionStart',
            timestamp: '2025-12-03T10:10:00.000Z',
            message: 'Query execution started',
            data: { queryName: 'weather-query-forecast' },
          },
          {
            id: 'evt-003-2',
            type: 'ToolCallStart',
            timestamp: '2025-12-03T10:10:02.000Z',
            message: 'Calling tool: get_forecast',
            data: {
              toolName: 'get_forecast',
              parameters: { location: 'London', days: 5 },
            },
          },
          {
            id: 'evt-003-3',
            type: 'ToolCallComplete',
            timestamp: '2025-12-03T10:10:18.000Z',
            durationMs: 16000,
            message: 'Tool call completed: get_forecast',
            data: { toolName: 'get_forecast' },
          },
          {
            id: 'evt-003-4',
            type: 'ToolCallStart',
            timestamp: '2025-12-03T10:10:20.000Z',
            message: 'Calling tool: get_forecast',
            data: {
              toolName: 'get_forecast',
              parameters: { location: 'Paris', days: 5 },
            },
          },
          {
            id: 'evt-003-5',
            type: 'ToolCallComplete',
            timestamp: '2025-12-03T10:10:38.000Z',
            durationMs: 18000,
            message: 'Tool call completed: get_forecast',
            data: { toolName: 'get_forecast' },
          },
          {
            id: 'evt-003-6',
            type: 'QueryExecutionComplete',
            timestamp: '2025-12-03T10:10:45.230Z',
            durationMs: 45230,
            message: 'Query completed successfully',
            data: { totalTokens: 1210 },
          },
        ],
      },
    ],
  },
  {
    id: 'session-def456',
    memoryName: 'research-team-memory',
    createdAt: '2025-12-03T09:30:00Z',
    lastActivity: '2025-12-03T09:45:12Z',
    totalTokens: 8934,
    queries: [
      {
        id: 'query-004',
        name: 'research-query-ai',
        input:
          'Research the latest developments in AI agents and provide a summary',
        output:
          'Summary: AI agent development in 2025 focuses on multi-agent systems, improved tool use, and autonomous planning...',
        status: 'completed',
        startTime: '2025-12-03T09:30:00Z',
        endTime: '2025-12-03T09:42:30Z',
        durationMs: 750000,
        targetName: 'research-team',
        targetType: 'Team',
        tokenUsage: { prompt: 4500, completion: 2800, total: 7300 },
        events: [
          {
            id: 'evt-004-1',
            type: 'QueryExecutionStart',
            timestamp: '2025-12-03T09:30:00.000Z',
            message: 'Query execution started',
            data: { queryName: 'research-query-ai' },
          },
          {
            id: 'evt-004-2',
            type: 'TeamExecutionStart',
            timestamp: '2025-12-03T09:30:00.500Z',
            message: 'Team execution started: research-team',
            data: { teamName: 'research-team', strategy: 'round_robin' },
          },
          {
            id: 'evt-004-3',
            type: 'TeamTurnStart',
            timestamp: '2025-12-03T09:30:01.000Z',
            message: 'Starting team turn 1',
            data: { turn: 1 },
          },
          {
            id: 'evt-004-4',
            type: 'TeamMemberStart',
            timestamp: '2025-12-03T09:30:01.100Z',
            message: 'Team member started: researcher',
            data: { memberName: 'researcher', role: 'Research specialist' },
          },
          {
            id: 'evt-004-5',
            type: 'ToolCallStart',
            timestamp: '2025-12-03T09:30:05.000Z',
            message: 'Calling tool: web_search',
            data: {
              toolName: 'web_search',
              parameters: { query: 'AI agents 2025 developments' },
            },
          },
          {
            id: 'evt-004-6',
            type: 'ToolCallComplete',
            timestamp: '2025-12-03T09:31:20.000Z',
            durationMs: 75000,
            message: 'Tool call completed: web_search',
            data: { toolName: 'web_search', resultsCount: 15 },
          },
          {
            id: 'evt-004-7',
            type: 'ToolCallStart',
            timestamp: '2025-12-03T09:31:25.000Z',
            message: 'Calling tool: read_url',
            data: {
              toolName: 'read_url',
              parameters: { url: 'https://arxiv.org/paper123' },
            },
          },
          {
            id: 'evt-004-8',
            type: 'ToolCallComplete',
            timestamp: '2025-12-03T09:32:45.000Z',
            durationMs: 80000,
            message: 'Tool call completed: read_url',
            data: { toolName: 'read_url' },
          },
          {
            id: 'evt-004-9',
            type: 'TeamMemberComplete',
            timestamp: '2025-12-03T09:35:00.000Z',
            durationMs: 299000,
            message: 'Team member completed: researcher',
            data: { memberName: 'researcher' },
          },
          {
            id: 'evt-004-10',
            type: 'TeamMemberStart',
            timestamp: '2025-12-03T09:35:01.000Z',
            message: 'Team member started: writer',
            data: { memberName: 'writer', role: 'Content writer' },
          },
          {
            id: 'evt-004-11',
            type: 'LLMCallStart',
            timestamp: '2025-12-03T09:35:02.000Z',
            message: 'Calling LLM for synthesis',
            data: { model: 'claude-sonnet-4-20250514' },
          },
          {
            id: 'evt-004-12',
            type: 'LLMCallComplete',
            timestamp: '2025-12-03T09:40:00.000Z',
            durationMs: 298000,
            message: 'LLM call completed',
            data: { model: 'claude-sonnet-4-20250514', completionTokens: 2100 },
          },
          {
            id: 'evt-004-13',
            type: 'TeamMemberComplete',
            timestamp: '2025-12-03T09:40:30.000Z',
            durationMs: 329000,
            message: 'Team member completed: writer',
            data: { memberName: 'writer' },
          },
          {
            id: 'evt-004-14',
            type: 'TeamTurnComplete',
            timestamp: '2025-12-03T09:40:35.000Z',
            durationMs: 574000,
            message: 'Team turn 1 completed',
            data: { turn: 1 },
          },
          {
            id: 'evt-004-15',
            type: 'TeamExecutionComplete',
            timestamp: '2025-12-03T09:42:00.000Z',
            durationMs: 720000,
            message: 'Team execution completed',
            data: { teamName: 'research-team', turnsCompleted: 1 },
          },
          {
            id: 'evt-004-16',
            type: 'QueryExecutionComplete',
            timestamp: '2025-12-03T09:42:30.000Z',
            durationMs: 750000,
            message: 'Query completed successfully',
            data: { totalTokens: 7300 },
          },
        ],
      },
      {
        id: 'query-005',
        name: 'research-query-followup',
        input: 'Focus more on multi-agent coordination patterns',
        status: 'running',
        startTime: '2025-12-03T09:44:00Z',
        targetName: 'research-team',
        targetType: 'Team',
        events: [
          {
            id: 'evt-005-1',
            type: 'QueryExecutionStart',
            timestamp: '2025-12-03T09:44:00.000Z',
            message: 'Query execution started',
            data: { queryName: 'research-query-followup' },
          },
          {
            id: 'evt-005-2',
            type: 'TeamExecutionStart',
            timestamp: '2025-12-03T09:44:00.500Z',
            message: 'Team execution started',
            data: { teamName: 'research-team' },
          },
          {
            id: 'evt-005-3',
            type: 'TeamMemberStart',
            timestamp: '2025-12-03T09:44:01.000Z',
            message: 'Team member started: researcher',
            data: { memberName: 'researcher' },
          },
          {
            id: 'evt-005-4',
            type: 'ToolCallStart',
            timestamp: '2025-12-03T09:44:30.000Z',
            message: 'Calling tool: web_search',
            data: {
              toolName: 'web_search',
              parameters: { query: 'multi-agent coordination patterns 2025' },
            },
          },
        ],
      },
    ],
  },
  {
    id: 'session-ghi789',
    memoryName: 'code-assistant-memory',
    createdAt: '2025-12-03T08:00:00Z',
    lastActivity: '2025-12-03T08:25:00Z',
    totalTokens: 3200,
    queries: [
      {
        id: 'query-006',
        name: 'code-query-review',
        input: 'Review the authentication module for security issues',
        output:
          'Security review complete. Found 2 potential issues: 1) Missing rate limiting on login endpoint...',
        status: 'completed',
        startTime: '2025-12-03T08:00:00Z',
        endTime: '2025-12-03T08:12:00Z',
        durationMs: 720000,
        targetName: 'code-reviewer',
        targetType: 'Agent',
        tokenUsage: { prompt: 1800, completion: 950, total: 2750 },
        events: [
          {
            id: 'evt-006-1',
            type: 'QueryExecutionStart',
            timestamp: '2025-12-03T08:00:00.000Z',
            message: 'Query execution started',
            data: { queryName: 'code-query-review' },
          },
          {
            id: 'evt-006-2',
            type: 'AgentExecutionStart',
            timestamp: '2025-12-03T08:00:00.500Z',
            message: 'Agent started: code-reviewer',
            data: { agentName: 'code-reviewer' },
          },
          {
            id: 'evt-006-3',
            type: 'ToolCallStart',
            timestamp: '2025-12-03T08:00:05.000Z',
            message: 'Calling tool: read_file',
            data: {
              toolName: 'read_file',
              parameters: { path: 'src/auth/login.ts' },
            },
          },
          {
            id: 'evt-006-4',
            type: 'ToolCallComplete',
            timestamp: '2025-12-03T08:00:06.500Z',
            durationMs: 1500,
            message: 'Tool call completed: read_file',
            data: { toolName: 'read_file', linesRead: 245 },
          },
          {
            id: 'evt-006-5',
            type: 'ToolCallStart',
            timestamp: '2025-12-03T08:00:10.000Z',
            message: 'Calling tool: read_file',
            data: {
              toolName: 'read_file',
              parameters: { path: 'src/auth/middleware.ts' },
            },
          },
          {
            id: 'evt-006-6',
            type: 'ToolCallComplete',
            timestamp: '2025-12-03T08:00:11.200Z',
            durationMs: 1200,
            message: 'Tool call completed: read_file',
            data: { toolName: 'read_file', linesRead: 180 },
          },
          {
            id: 'evt-006-7',
            type: 'LLMCallStart',
            timestamp: '2025-12-03T08:00:15.000Z',
            message: 'Analyzing code for security issues',
            data: { model: 'gpt-4o' },
          },
          {
            id: 'evt-006-8',
            type: 'LLMCallComplete',
            timestamp: '2025-12-03T08:11:30.000Z',
            durationMs: 675000,
            message: 'Analysis complete',
            data: { model: 'gpt-4o', issuesFound: 2 },
          },
          {
            id: 'evt-006-9',
            type: 'AgentExecutionComplete',
            timestamp: '2025-12-03T08:11:50.000Z',
            durationMs: 710000,
            message: 'Agent completed: code-reviewer',
            data: { agentName: 'code-reviewer' },
          },
          {
            id: 'evt-006-10',
            type: 'QueryExecutionComplete',
            timestamp: '2025-12-03T08:12:00.000Z',
            durationMs: 720000,
            message: 'Query completed successfully',
            data: { totalTokens: 2750 },
          },
        ],
      },
    ],
  },
  {
    id: 'session-jkl012',
    createdAt: '2025-12-03T07:00:00Z',
    lastActivity: '2025-12-03T07:02:30Z',
    totalTokens: 450,
    queries: [
      {
        id: 'query-007',
        name: 'simple-query',
        input: 'What is 2 + 2?',
        output: '2 + 2 = 4',
        status: 'completed',
        startTime: '2025-12-03T07:00:00Z',
        endTime: '2025-12-03T07:00:02Z',
        durationMs: 2100,
        targetName: 'calculator',
        targetType: 'Model',
        tokenUsage: { prompt: 25, completion: 15, total: 40 },
        events: [
          {
            id: 'evt-007-1',
            type: 'QueryExecutionStart',
            timestamp: '2025-12-03T07:00:00.000Z',
            message: 'Query execution started',
            data: {},
          },
          {
            id: 'evt-007-2',
            type: 'LLMCallStart',
            timestamp: '2025-12-03T07:00:00.200Z',
            message: 'Direct LLM call',
            data: { model: 'gpt-4o-mini' },
          },
          {
            id: 'evt-007-3',
            type: 'LLMCallComplete',
            timestamp: '2025-12-03T07:00:01.800Z',
            durationMs: 1600,
            message: 'LLM call completed',
            data: { model: 'gpt-4o-mini' },
          },
          {
            id: 'evt-007-4',
            type: 'QueryExecutionComplete',
            timestamp: '2025-12-03T07:00:02.100Z',
            durationMs: 2100,
            message: 'Query completed',
            data: { totalTokens: 40 },
          },
        ],
      },
    ],
  },
  {
    id: 'session-mno345',
    memoryName: 'data-analyst-memory',
    createdAt: '2025-12-02T16:00:00Z',
    lastActivity: '2025-12-02T16:35:00Z',
    totalTokens: 12500,
    queries: [
      {
        id: 'query-008',
        name: 'data-analysis-sales',
        input: 'Analyze Q4 sales data and identify trends',
        output:
          'Analysis complete. Key findings: 1) Revenue increased 15% YoY, 2) Top performing region: EMEA...',
        status: 'completed',
        startTime: '2025-12-02T16:00:00Z',
        endTime: '2025-12-02T16:25:00Z',
        durationMs: 1500000,
        targetName: 'data-analyst',
        targetType: 'Agent',
        tokenUsage: { prompt: 6500, completion: 4200, total: 10700 },
        events: [
          {
            id: 'evt-008-1',
            type: 'QueryExecutionStart',
            timestamp: '2025-12-02T16:00:00.000Z',
            message: 'Query execution started',
            data: {},
          },
          {
            id: 'evt-008-2',
            type: 'ToolCallStart',
            timestamp: '2025-12-02T16:00:30.000Z',
            message: 'Calling tool: query_database',
            data: {
              toolName: 'query_database',
              parameters: { query: 'SELECT * FROM sales WHERE quarter = Q4' },
            },
          },
          {
            id: 'evt-008-3',
            type: 'ToolCallComplete',
            timestamp: '2025-12-02T16:05:00.000Z',
            durationMs: 270000,
            message: 'Tool call completed: query_database',
            data: { toolName: 'query_database', rowsReturned: 15420 },
          },
          {
            id: 'evt-008-4',
            type: 'ToolCallStart',
            timestamp: '2025-12-02T16:05:30.000Z',
            message: 'Calling tool: python_execute',
            data: {
              toolName: 'python_execute',
              parameters: { code: 'import pandas as pd...' },
            },
          },
          {
            id: 'evt-008-5',
            type: 'ToolCallComplete',
            timestamp: '2025-12-02T16:15:00.000Z',
            durationMs: 570000,
            message: 'Tool call completed: python_execute',
            data: { toolName: 'python_execute' },
          },
          {
            id: 'evt-008-6',
            type: 'QueryExecutionComplete',
            timestamp: '2025-12-02T16:25:00.000Z',
            durationMs: 1500000,
            message: 'Query completed',
            data: { totalTokens: 10700 },
          },
        ],
      },
      {
        id: 'query-009',
        name: 'data-analysis-error',
        input: 'Generate a report with visualization',
        status: 'error',
        startTime: '2025-12-02T16:30:00Z',
        endTime: '2025-12-02T16:32:00Z',
        durationMs: 120000,
        targetName: 'data-analyst',
        targetType: 'Agent',
        events: [
          {
            id: 'evt-009-1',
            type: 'QueryExecutionStart',
            timestamp: '2025-12-02T16:30:00.000Z',
            message: 'Query execution started',
            data: {},
          },
          {
            id: 'evt-009-2',
            type: 'ToolCallStart',
            timestamp: '2025-12-02T16:30:30.000Z',
            message: 'Calling tool: generate_chart',
            data: { toolName: 'generate_chart' },
          },
          {
            id: 'evt-009-3',
            type: 'ToolCallError',
            timestamp: '2025-12-02T16:31:45.000Z',
            durationMs: 75000,
            message: 'Tool call failed: generate_chart',
            data: {
              toolName: 'generate_chart',
              error: 'matplotlib not available in execution environment',
            },
          },
          {
            id: 'evt-009-4',
            type: 'QueryExecutionError',
            timestamp: '2025-12-02T16:32:00.000Z',
            durationMs: 120000,
            message: 'Query failed: visualization tool unavailable',
            data: { error: 'Unable to generate visualization' },
          },
        ],
      },
    ],
  },
];

export const sessionsService = {
  async getAll(): Promise<{ items: Session[]; total: number }> {
    await new Promise(resolve => setTimeout(resolve, 300));
    return {
      items: MOCK_SESSIONS,
      total: MOCK_SESSIONS.length,
    };
  },

  async get(sessionId: string): Promise<Session | null> {
    await new Promise(resolve => setTimeout(resolve, 100));
    return MOCK_SESSIONS.find(s => s.id === sessionId) ?? null;
  },

  async getQuery(
    sessionId: string,
    queryId: string,
  ): Promise<SessionQuery | null> {
    await new Promise(resolve => setTimeout(resolve, 100));
    const session = MOCK_SESSIONS.find(s => s.id === sessionId);
    if (!session) return null;
    return session.queries.find(q => q.id === queryId) ?? null;
  },

  async getEvent(
    sessionId: string,
    queryId: string,
    eventId: string,
  ): Promise<SessionEvent | null> {
    await new Promise(resolve => setTimeout(resolve, 50));
    const session = MOCK_SESSIONS.find(s => s.id === sessionId);
    if (!session) return null;
    const query = session.queries.find(q => q.id === queryId);
    if (!query) return null;
    return query.events.find(e => e.id === eventId) ?? null;
  },
};

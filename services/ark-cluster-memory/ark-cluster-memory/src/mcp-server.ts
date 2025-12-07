import express from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { QuestionStore } from './question-store.js';

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
const servers: { [sessionId: string]: Server } = {};

function createServer(questions: QuestionStore): Server {
  const server = new Server(
    {
      name: 'ark-broker',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const tools: Tool[] = [
    {
      name: 'ask_question',
      description: 'Ask a question and wait for an answer. Supports progress notifications while waiting.',
      inputSchema: {
        type: 'object',
        properties: {
          recipient: {
            type: 'string',
            description: 'The recipient of the question (e.g., "ark://users/john")',
          },
          content: {
            type: 'string',
            description: 'The question to ask',
          },
          channels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional channels to deliver the question (e.g., ["slack", "github"])',
          },
        },
        required: ['recipient', 'content'],
      },
    },
    {
      name: 'list_pending_questions',
      description: 'List all pending questions sent by this agent',
      inputSchema: {
        type: 'object',
        properties: {
          sender: {
            type: 'string',
            description: 'Filter by sender (e.g., "ark://agents/my-agent")',
          },
        },
      },
    },
  ];

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'ask_question') {
      const { recipient, content, channels } = args as any;
      const sender = (args as any).sender || 'ark://agents/unknown';

      const question = questions.createQuestion({
        sender,
        recipient,
        content,
        channels: channels || [],
      });

      const progressToken = (request.params as any)._meta?.progressToken;
      let progressInterval: NodeJS.Timeout | undefined;

      if (progressToken) {
        progressInterval = setInterval(() => {
          const currentQuestion = questions.getQuestion(question.id);
          if (currentQuestion?.status === 'pending') {
            server.notification({
              method: 'notifications/progress',
              params: {
                progressToken,
                progress: 0,
                total: 0,
                message: `Waiting for answer to question ${question.id}...`,
              },
            });
          }
        }, 5000);
      }

      try {
        const response = await questions.waitForAnswer(question.id);

        if (progressInterval) {
          clearInterval(progressInterval);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                questionId: question.id,
                response,
                answeredAt: questions.getQuestion(question.id)?.answeredAt,
              }),
            },
          ],
        };
      } catch (error) {
        if (progressInterval) {
          clearInterval(progressInterval);
        }
        throw error;
      }
    }

    if (name === 'list_pending_questions') {
      const sender = (args as any).sender;
      const pendingQuestions = questions.getQuestions({
        sender,
        status: 'pending',
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ questions: pendingQuestions }),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

export async function startMCPServer(questions: QuestionStore, port: number) {
  const app = express();
  app.use(express.json());

  app.post('/mcp', async (req, res) => {
    const sessionId = (req.headers['mcp-session-id'] ||
      req.headers['Mcp-Session-Id']) as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
        console.log(`[MCP] Reusing session ${sessionId}`);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        const newSessionId = randomUUID();
        console.log(`[MCP] Creating new session ${newSessionId}`);

        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (sid) => {
            console.log(`[MCP] Session initialized: ${sid}`);
            transports[sid] = transport;
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            delete transports[sid];
            delete servers[sid];
            console.log(`[MCP] Session closed: ${sid}`);
          }
        };

        const server = createServer(questions);
        servers[newSessionId] = server;
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided',
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[MCP] Error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });

  const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    const sessionId = (req.headers['mcp-session-id'] ||
      req.headers['Mcp-Session-Id']) as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  };

  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  app.get('/health', (req, res) => {
    res.status(200).send('OK');
  });

  app.listen(port, () => {
    console.log(`[MCP SERVER] Started on port ${port}`);
    console.log(`[MCP SERVER] Endpoint: http://0.0.0.0:${port}/mcp`);
  });
}

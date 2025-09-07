import express from 'express';
import cors from 'cors';
import { MemoryStore } from './memory-store.js';
import { AddMessageRequest, AddMessagesRequest, MessagesResponse, StreamResponse, StreamError, Message } from './types.js';

const app = express();
const memory = new MemoryStore();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Validation middleware
const validateSessionParam = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const { uid } = req.params;
  if (!uid) {
    res.status(400).json({ error: 'Session ID parameter is required' });
    return;
  }
  next();
};

// Helper function to parse timeout parameter
const parseTimeout = (timeoutStr: string | undefined, defaultTimeout: number): number => {
  if (!timeoutStr) return defaultTimeout;
  const timeout = parseInt(timeoutStr);
  return isNaN(timeout) ? defaultTimeout : Math.max(1000, Math.min(timeout * 1000, 300000));
};

// Helper function to chunk content into smaller pieces
const chunkContent = (content: string, maxChunkSize: number): string[] => {
  if (content.length <= maxChunkSize) {
    return [content];
  }
  
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += maxChunkSize) {
    chunks.push(content.slice(i, i + maxChunkSize));
  }
  return chunks;
};

// Helper function to create OpenAI-compatible stream responses (with chunking support)
const createStreamResponses = (sessionID: string, message: Message, index: number, maxChunkSize: number = 50): StreamResponse[] => {
  // Handle completion messages specially
  if (typeof message === 'object' && message !== null) {
    const msgObj = message as any;
    if (msgObj.type === 'completion' && msgObj.finish_reason === 'stop') {
      return [{
        id: sessionID,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'ark-cluster-memory',
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }]
      }];
    }
  }

  let content: string;
  try {
    if (typeof message === 'string') {
      content = message;
    } else if (typeof message === 'object' && message !== null) {
      const msgObj = message as any;
      content = msgObj.content || JSON.stringify(message);
    } else {
      content = String(message);
    }
  } catch (error) {
    content = '[Unable to parse message content]';
  }

  // Chunk the content and create multiple responses
  const chunks = chunkContent(content, maxChunkSize);
  
  // Log chunking activity
  if (chunks.length > 1) {
    console.log(`[STREAM] Session ${sessionID}: Split content (${content.length} chars) into ${chunks.length} chunks of max ${maxChunkSize} chars`);
  }
  
  return chunks.map((chunk, idx) => {
    if (chunks.length > 1) {
      console.log(`[STREAM] Session ${sessionID}: Chunk ${idx + 1}/${chunks.length}: "${chunk.substring(0, 20)}${chunk.length > 20 ? '...' : ''}" (${chunk.length} chars)`);
    }
    
    return {
      id: sessionID,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: 'ark-cluster-memory',
      choices: [{
        index: 0,
        delta: { content: chunk }
      }]
    };
  });
};

// Helper function to write SSE event
const writeSSEEvent = (res: express.Response, data: StreamResponse): boolean => {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (error) {
    console.error('Error writing SSE event:', error);
    return false;
  }
};

// Health check - same as postgres-memory
app.get('/health', (req, res) => {
  try {
    const isHealthy = memory.isHealthy();
    if (isHealthy) {
      res.status(200).send('OK');
    } else {
      res.status(503).send('Service Unavailable');
    }
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).send('Service Unavailable');
  }
});

// Store messages - POST /messages
app.post('/messages', (req, res) => {
  try {
    const { session_id, query_id, messages } = req.body;
    
    console.log(`POST /messages - session_id: ${session_id}, query_id: ${query_id}, messages: ${messages?.length}`);
    
    if (!session_id) {
      res.status(400).json({ error: 'session_id is required' });
      return;
    }
    
    if (!query_id) {
      res.status(400).json({ error: 'query_id is required' });
      return;
    }
    
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'messages array is required' });
      return;
    }
    
    // Store messages with full metadata
    memory.addMessagesWithMetadata(session_id, query_id, messages);
    res.status(200).send();
  } catch (error) {
    console.error('Failed to add messages:', error);
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
});

// Retrieve messages - GET /messages?session_id={id}&query_id={id}
app.get('/messages', (req, res) => {
  try {
    const session_id = req.query.session_id as string;
    const query_id = req.query.query_id as string;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    if (session_id) {
      // Get messages for specific session (optionally filtered by query_id)
      const messages = memory.getMessages(session_id);
      
      // Filter by query_id if provided (not implemented in memory store yet)
      // For now, return all messages for the session
      
      const response = {
        messages: messages.map(msg => ({
          timestamp: new Date().toISOString(),
          session_id,
          query_id: query_id || '',
          message: msg
        }))
      };
      res.json(response);
    } else {
      // Get all messages across all sessions (matching postgres-memory behavior)
      const allMessages = memory.getAllMessages();
      const paginatedMessages = allMessages.slice(offset, offset + limit);
      
      const response = {
        messages: paginatedMessages,
        total: allMessages.length,
        limit,
        offset
      };
      res.json(response);
    }
  } catch (error) {
    console.error('Failed to get messages:', error);
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
});

// List sessions - GET /sessions
app.get('/sessions', (req, res) => {
  try {
    // Get all unique session IDs from the memory store
    const sessions = memory.getAllSessions();
    res.json({ sessions });
  } catch (error) {
    console.error('Failed to get sessions:', error);
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
});

// Streaming endpoint - GET /stream/{uid}
app.get('/stream/:uid', validateSessionParam, async (req, res) => {
  try {
    const { uid } = req.params;
    const fromBeginning = req.query['from-beginning'] === 'true';
    const waitForSession = req.query['wait-for-session'] === 'true';
    const timeout = parseTimeout(req.query.timeout as string, 30000);
    
    // Parse max chunk size, default to 50 characters
    let maxChunkSize = 50;
    if (req.query['max-chunk-size']) {
      const size = parseInt(req.query['max-chunk-size'] as string);
      if (!isNaN(size) && size > 0) {
        maxChunkSize = size;
      }
    }

    console.log(`SSE stream request for session ${uid}, from-beginning=${fromBeginning}, wait-for-session=${waitForSession}, timeout=${timeout}ms, max-chunk-size=${maxChunkSize}`);

    // Check if session exists
    const exists = memory.sessionExists(uid);

    if (!exists && !waitForSession) {
      console.log(`Session ${uid} not found, returning 404`);
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (!exists && waitForSession) {
      console.log(`Waiting for session ${uid} (timeout: ${timeout}ms)`);
      
      const sessionCreated = await memory.waitForSession(uid, timeout);
      if (!sessionCreated) {
        console.log(`Session ${uid} creation timeout after ${timeout}ms`);
        res.status(408).json({ error: 'Session creation timeout' });
        return;
      }
      
      console.log(`Session ${uid} created, starting stream`);
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Subscribe to new messages
    const unsubscribe = memory.subscribe(uid, (message: Message) => {
      const streamResponses = createStreamResponses(uid, message, 0, maxChunkSize);
      console.log(`[STREAM] Session ${uid}: Broadcasting ${streamResponses.length} chunk(s) to streaming client`);
      
      for (const streamResp of streamResponses) {
        if (!writeSSEEvent(res, streamResp)) {
          console.log(`[STREAM] Session ${uid}: Error writing SSE event, closing stream`);
          unsubscribe();
          return;
        }
        
        // If this is a completion message, send [DONE] and close
        if (streamResp.choices?.[0]?.finish_reason === 'stop') {
          console.log(`[STREAM] Session ${uid}: Sending completion marker and closing stream`);
          res.write('data: [DONE]\n\n');
          unsubscribe();
          return;
        }
      }
    });

    // If from-beginning, send existing messages first
    if (fromBeginning) {
      const existingMessages = memory.getMessages(uid);
      console.log(`Sending ${existingMessages.length} existing messages for session ${uid}`);
      
      for (let i = 0; i < existingMessages.length; i++) {
        const streamResponses = createStreamResponses(uid, existingMessages[i], i, maxChunkSize);
        for (const streamResp of streamResponses) {
          if (!writeSSEEvent(res, streamResp)) {
            console.log(`Error writing existing message for session ${uid}`);
            unsubscribe();
            return;
          }
        }
      }
    }

    // Handle client disconnect
    req.on('close', () => {
      console.log(`Stream connection closed for session ${uid}`);
      unsubscribe();
    });

    req.on('error', (error) => {
      console.log(`Stream connection error for session ${uid}:`, error);
      unsubscribe();
    });

  } catch (error) {
    console.error('Failed to handle stream request:', error);
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// Stream-in endpoint - POST /stream-in/{sessionId} - Receive real-time chunks from ARK controller
app.post('/stream-in/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      res.status(400).json({ error: 'Session ID parameter is required' });
      return;
    }
    
    console.log(`Stream-in connection for session ${sessionId}`);
    
    // Set headers for newline-delimited JSON streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Connection', 'keep-alive');
    
    let chunkCount = 0;
    let buffer = '';
    
    // Handle incoming streaming chunks
    req.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      
      // Process complete lines (newline-delimited JSON)
      while (buffer.includes('\n')) {
        const newlineIndex = buffer.indexOf('\n');
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        
        if (line) {
          try {
            const streamChunk = JSON.parse(line);
            console.log(`[STREAM-IN] Session ${sessionId}: Received chunk ${chunkCount + 1}`);
            
            // Forward the chunk to any active streaming clients
            memory.addMessage(sessionId, streamChunk);
            chunkCount++;
            
            // Log every 10th chunk to reduce noise
            if (chunkCount % 10 === 0) {
              console.log(`[STREAM-IN] Session ${sessionId}: Processed ${chunkCount} chunks`);
            }
          } catch (parseError) {
            console.error(`[STREAM-IN] Failed to parse chunk for session ${sessionId}:`, parseError);
          }
        }
      }
    });
    
    req.on('end', () => {
      console.log(`[STREAM-IN] Session ${sessionId}: Stream ended (total chunks: ${chunkCount})`);
      res.json({
        status: 'stream_processed',
        session: sessionId,
        chunks_received: chunkCount
      });
    });
    
    req.on('error', (error) => {
      console.error(`[STREAM-IN] Session ${sessionId}: Stream error:`, error);
      res.status(500).json({ error: 'Stream processing failed' });
    });
    
  } catch (error) {
    console.error('Failed to handle stream-in request:', error);
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// Session completion endpoint - POST /session/{id}/complete
app.post('/session/:id/complete', (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      res.status(400).json({ error: 'Session ID parameter is required' });
      return;
    }
    
    console.log(`Completion request for session ${id}`);
    
    // Check if session exists
    if (!memory.sessionExists(id)) {
      console.log(`Session ${id} not found for completion`);
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    
    memory.completeSession(id);
    
    res.json({
      status: 'completed',
      session: id
    });
  } catch (error) {
    console.error('Failed to complete session:', error);
    const err = error as Error;
    res.status(500).json({ error: err.message });
  }
});

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`ARK Cluster Memory service running on port ${PORT}`);
  if (process.env.MEMORY_FILE_PATH) {
    console.log(`Memory persistence enabled at: ${process.env.MEMORY_FILE_PATH}`);
  }
});

// Periodic save every 30 seconds if file persistence is enabled
let saveInterval: NodeJS.Timeout | undefined;
if (process.env.MEMORY_FILE_PATH) {
  saveInterval = setInterval(() => {
    memory.saveMemory();
  }, 30000);
}

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('Shutting down gracefully');
  
  if (saveInterval) {
    clearInterval(saveInterval);
  }
  
  // Save memory before exit
  memory.saveMemory();
  
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
};

process.on('SIGTERM', () => {
  console.log('SIGTERM received');
  gracefulShutdown();
});

process.on('SIGINT', () => {
  console.log('SIGINT received');
  gracefulShutdown();
});

export default app;

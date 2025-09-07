import express from 'express';
import cors from 'cors';
import { MemoryStore } from './memory-store.js';
import { AddMessageRequest, AddMessagesRequest, MessagesResponse } from './types.js';

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
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

export default app;

import express from 'express';
import cors from 'cors';
import { MemoryStore } from './memory-store.js';
import { AddMessageRequest, AddMessagesRequest, MessagesResponse } from './types.js';

const app = express();
const memory = new MemoryStore();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

// Single message endpoint - PUT /message/{uid}
app.put('/message/:uid', validateSessionParam, (req, res) => {
  try {
    const { uid } = req.params;
    const { message }: AddMessageRequest = req.body;
    
    if (message === undefined) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    
    memory.addMessage(uid, message);
    res.status(200).send();
  } catch (error) {
    console.error('Failed to add message:', error);
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
});

// Single message endpoint - GET /message/{uid}
app.get('/message/:uid', validateSessionParam, (req, res) => {
  try {
    const { uid } = req.params;
    const messages = memory.getMessages(uid);
    
    const response: MessagesResponse = { messages };
    res.json(response);
  } catch (error) {
    console.error('Failed to get messages:', error);
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
});

// Multiple messages endpoint - PUT /messages/{uid}
app.put('/messages/:uid', validateSessionParam, (req, res) => {
  try {
    const { uid } = req.params;
    const { messages }: AddMessagesRequest = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: 'Messages array is required' });
      return;
    }
    
    memory.addMessages(uid, messages);
    res.status(200).send();
  } catch (error) {
    console.error('Failed to add messages:', error);
    const err = error as Error;
    res.status(400).json({ error: err.message });
  }
});

// Multiple messages endpoint - GET /messages/{uid}
app.get('/messages/:uid', validateSessionParam, (req, res) => {
  try {
    const { uid } = req.params;
    const messages = memory.getMessages(uid);
    
    const response: MessagesResponse = { messages };
    res.json(response);
  } catch (error) {
    console.error('Failed to get messages:', error);
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

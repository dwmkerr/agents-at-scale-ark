import { Router } from 'express';
import { MemoryStore } from '../memory-store.js';

export function createMemoryRouter(memory: MemoryStore): Router {
  const router = Router();

  // Store messages - POST /messages
  router.post('/messages', (req, res) => {
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
  router.get('/messages', (req, res) => {
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
  router.get('/sessions', (req, res) => {
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

  return router;
}
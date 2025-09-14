import { Router } from 'express';
import { MemoryStore } from '../memory-store.js';

export function createMemoryRouter(memory: MemoryStore): Router {
  const router = Router();

  /**
   * @swagger
   * /messages:
   *   post:
   *     summary: Store messages in memory
   *     description: Stores chat messages for a specific session and query
   *     tags:
   *       - Memory
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - session_id
   *               - query_id
   *               - messages
   *             properties:
   *               session_id:
   *                 type: string
   *                 description: Session identifier
   *               query_id:
   *                 type: string
   *                 description: Query identifier
   *               messages:
   *                 type: array
   *                 description: Array of OpenAI-format messages
   *                 items:
   *                   type: object
   *     responses:
   *       200:
   *         description: Messages stored successfully
   *       400:
   *         description: Invalid request parameters
   */
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

  /**
   * @swagger
   * /messages:
   *   get:
   *     summary: Get memory statistics
   *     description: Returns statistics about all stored messages and sessions
   *     tags:
   *       - Memory
   *     responses:
   *       200:
   *         description: Memory statistics retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 total_sessions:
   *                   type: integer
   *                   description: Total number of sessions
   *                 total_messages:
   *                   type: integer
   *                   description: Total number of messages across all sessions
   *                 sessions:
   *                   type: object
   *                   description: Per-session statistics
   */
  router.get('/messages', (req, res) => {
    try {
      const sessions = memory.getAllSessions();
      const allMessages = memory.getAllMessages();
      
      // Get per-session statistics
      const sessionStats: any = {};
      for (const sessionId of sessions) {
        const messages = memory.getMessages(sessionId);
        const queries = new Set<string>();
        
        // Extract unique query IDs from messages
        for (const msg of allMessages) {
          if (msg.session_id === sessionId && msg.query_id) {
            queries.add(msg.query_id);
          }
        }
        
        sessionStats[sessionId] = {
          message_count: messages.length,
          query_count: queries.size
        };
      }
      
      res.json({
        total_sessions: sessions.length,
        total_messages: allMessages.length,
        sessions: sessionStats
      });
    } catch (error) {
      console.error('Failed to get memory statistics:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
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

  /**
   * @swagger
   * /messages:
   *   delete:
   *     summary: Purge all memory data
   *     description: Clears all stored messages and saves empty state to disk
   *     tags:
   *       - Memory
   *     responses:
   *       200:
   *         description: Memory purged successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   example: success
   *                 message:
   *                   type: string
   *                   example: Memory purged
   *       500:
   *         description: Failed to purge memory
   */
  router.delete('/messages', (req, res) => {
    try {
      memory.purge();
      res.json({ status: 'success', message: 'Memory purged' });
    } catch (error) {
      console.error('Memory purge failed:', error);
      res.status(500).json({ error: 'Failed to purge memory' });
    }
  });

  return router;
}
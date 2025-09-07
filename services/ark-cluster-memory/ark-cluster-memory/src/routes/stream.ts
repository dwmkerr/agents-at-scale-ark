import { Router, Request, Response } from 'express';
import { MemoryStore } from '../memory-store.js';
import { Message, StreamResponse } from '../types.js';

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
    // Check for OpenAI-compatible completion format
    if (msgObj.choices && Array.isArray(msgObj.choices) && 
        msgObj.choices.length > 0 && msgObj.choices[0].finish_reason === 'stop') {
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
const writeSSEEvent = (res: Response, data: StreamResponse): boolean => {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (error) {
    console.error('Error writing SSE event:', error);
    return false;
  }
};

export function createStreamRouter(memory: MemoryStore): Router {
  const router = Router();

  // Stream endpoint - GET /stream/{query_name} - Serve real-time chunks to dashboard
  router.get('/:query_name', async (req, res) => {
    try {
      const { query_name } = req.params;
      const fromBeginning = req.query['from-beginning'] === 'true';
      // Parse wait-for-query parameter - timeout value (e.g., "30s")
      const waitForQueryParam = req.query['wait-for-query'] as string;
      let waitForQuery = false;
      let timeout = 30000; // default 30 seconds
      
      if (waitForQueryParam) {
        waitForQuery = true;
        timeout = parseTimeout(waitForQueryParam, 30000);
      }
      
      // Parse max chunk size, default to 50 characters
      let maxChunkSize = 50;
      if (req.query['max-chunk-size']) {
        const size = parseInt(req.query['max-chunk-size'] as string);
        if (!isNaN(size) && size > 0) {
          maxChunkSize = size;
        }
      }

      console.log(`[STREAM] GET /stream/${query_name} - from-beginning=${fromBeginning}, wait-for-query=${waitForQueryParam}, timeout=${timeout}ms, max-chunk-size=${maxChunkSize}`);

      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Subscribe to streaming chunks for this query
      let outboundChunkCount = 0;
      const unsubscribe = memory.subscribeToChunks(query_name, (chunk: any) => {
        // Chunks are already in OpenAI format, just forward them
        if (!writeSSEEvent(res, chunk)) {
          console.log(`[STREAM-OUT] Query ${query_name}: Error writing SSE event, closing stream`);
          unsubscribe();
          return;
        }
        
        outboundChunkCount++;
        
        // Log every 10th chunk to match incoming stream logging
        if (outboundChunkCount % 10 === 0) {
          console.log(`[STREAM-OUT] Query ${query_name}: Sent ${outboundChunkCount} chunks`);
        }
        
        // If this is a completion message, send [DONE] and close
        if (chunk.choices?.[0]?.finish_reason === 'stop') {
          console.log(`[STREAM-OUT] Query ${query_name}: Sending completion marker and closing stream (total chunks: ${outboundChunkCount})`);
          res.write('data: [DONE]\n\n');
          res.end();
          unsubscribe();
          return;
        }
      });

      // If from-beginning, send existing chunks first  
      if (fromBeginning) {
        const existingChunks = memory.getStreamChunks(query_name);
        console.log(`[STREAM] Sending ${existingChunks.length} existing chunks for query ${query_name}`);
        
        for (let i = 0; i < existingChunks.length; i++) {
          const chunk = existingChunks[i];
          
          // Chunks are already in OpenAI format, just forward them
          if (!writeSSEEvent(res, chunk)) {
            console.log(`[STREAM] Error writing existing chunk for query ${query_name}`);
            unsubscribe();
            return;
          }
          
          // Check if this is the completion marker
          if (chunk.choices?.[0]?.finish_reason === 'stop') {
            console.log(`[STREAM] Query ${query_name}: Found completion marker in stored chunks, closing stream`);
            res.write('data: [DONE]\n\n');
            res.end();
            unsubscribe();
            return;
          }
        }
      } else {
        // Not from-beginning - check if stream is already complete
        const existingChunks = memory.getStreamChunks(query_name);
        console.log(`[STREAM] Checking completion for ${query_name}: ${existingChunks.length} chunks exist`);
        if (existingChunks.length > 0) {
          const lastChunk = existingChunks[existingChunks.length - 1];
          console.log(`[STREAM] Last chunk finish_reason: ${lastChunk.choices?.[0]?.finish_reason}`);
          if (lastChunk.choices?.[0]?.finish_reason === 'stop') {
            console.log(`[STREAM] Query ${query_name} already complete (no from-beginning), nothing to send, closing connection`);
            res.end();
            unsubscribe();
            return;
          }
        }
      }

      // Handle client disconnect
      req.on('close', () => {
        console.log(`[STREAM] Connection closed for query ${query_name}`);
        unsubscribe();
      });

      req.on('error', (error) => {
        console.log(`[STREAM] Connection error for query ${query_name}:`, error);
        unsubscribe();
      });

    } catch (error) {
      console.error('[STREAM] Failed to handle stream request:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  // Stream endpoint - POST /stream/{query_id} - Receive real-time chunks from ARK controller
  router.post('/:query_id', (req, res) => {
    try {
      const { query_id } = req.params;
      
      if (!query_id) {
        res.status(400).json({ error: 'Query ID parameter is required' });
        return;
      }
      
      console.log(`[STREAM] POST /stream/${query_id} - receiving chunks from ARK controller`);
      
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
              chunkCount++;
              
              // Log first chunk and then every 10th chunk to reduce noise
              if (chunkCount === 1) {
                console.log(`[STREAM-IN] Query ${query_id}: Receiving chunks...`);
              } else if (chunkCount % 10 === 0) {
                console.log(`[STREAM-IN] Query ${query_id}: Received ${chunkCount} chunks`);
              }
              
              // Store the chunk for later replay AND forward to active streaming clients
              memory.addStreamChunk(query_id, streamChunk);
              memory.eventEmitter.emit(`chunk:${query_id}`, streamChunk);
            } catch (parseError) {
              console.error(`[STREAM-IN] Failed to parse chunk for query ${query_id}:`, parseError);
            }
          }
        }
      });
      
      req.on('end', () => {
        console.log(`[STREAM-IN] Query ${query_id}: Stream ended (total chunks: ${chunkCount})`);
        res.json({
          status: 'stream_processed',
          query: query_id,
          chunks_received: chunkCount
        });
      });
      
      req.on('error', (error) => {
        console.error(`[STREAM-IN] Query ${query_id}: Stream error:`, error);
        res.status(500).json({ error: 'Stream processing failed' });
      });
      
    } catch (error) {
      console.error('[STREAM] Failed to handle stream POST request:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  // Stream completion endpoint - POST /stream/{query_id}/complete
  router.post('/:query_id/complete', (req, res) => {
    try {
      const { query_id } = req.params;
      
      if (!query_id) {
        res.status(400).json({ error: 'Query ID parameter is required' });
        return;
      }
      
      console.log(`[STREAM] POST /stream/${query_id}/complete - marking query as complete`);
      
      // Mark query stream as complete
      memory.completeQueryStream(query_id);
      
      res.json({
        status: 'completed',
        query: query_id
      });
    } catch (error) {
      console.error('[STREAM] Failed to complete query stream:', error);
      const err = error as Error;
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
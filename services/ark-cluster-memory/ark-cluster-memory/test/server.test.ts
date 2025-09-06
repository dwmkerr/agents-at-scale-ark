import request from 'supertest';
import app from '../src/server.js';

describe('ARK Cluster Memory API', () => {
  describe('Health Check', () => {
    test('GET /health should return OK', async () => {
      const response = await request(app).get('/health');
      
      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
    });
  });

  describe('Single Message Endpoints', () => {
    test('should initially have no messages', async () => {
      const response = await request(app).get('/message/test-session');
      
      expect(response.status).toBe(200);
      expect(response.body.messages).toEqual([]);
    });

    test('should add and retrieve single message', async () => {
      const message = { role: 'user', content: 'Hello, world!' };
      
      // Add message
      const addResponse = await request(app)
        .put('/message/test-session')
        .send({ message });
      
      expect(addResponse.status).toBe(200);
      
      // Retrieve messages
      const getResponse = await request(app).get('/message/test-session');
      
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.messages).toHaveLength(1);
      expect(getResponse.body.messages[0]).toEqual(message);
    });

    test('should add multiple messages sequentially', async () => {
      const message1 = { role: 'user', content: 'First message' };
      const message2 = { role: 'assistant', content: 'Second message' };
      
      await request(app)
        .put('/message/test-session-2')
        .send({ message: message1 });
      
      await request(app)
        .put('/message/test-session-2')
        .send({ message: message2 });
      
      const response = await request(app).get('/message/test-session-2');
      
      expect(response.status).toBe(200);
      expect(response.body.messages).toHaveLength(2);
      expect(response.body.messages[0]).toEqual(message1);
      expect(response.body.messages[1]).toEqual(message2);
    });

    test('should return error for missing message', async () => {
      const response = await request(app)
        .put('/message/test-session')
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Message is required');
    });
  });

  describe('Multiple Messages Endpoints', () => {
    test('should add and retrieve multiple messages at once', async () => {
      const messages = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Second message' }
      ];
      
      // Add messages
      const addResponse = await request(app)
        .put('/messages/batch-session')
        .send({ messages });
      
      expect(addResponse.status).toBe(200);
      
      // Retrieve messages
      const getResponse = await request(app).get('/messages/batch-session');
      
      expect(getResponse.status).toBe(200);
      expect(getResponse.body.messages).toHaveLength(2);
      expect(getResponse.body.messages).toEqual(messages);
    });

    test('should return error for invalid messages array', async () => {
      const response = await request(app)
        .put('/messages/test-session')
        .send({ messages: 'not-an-array' });
      
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Messages array is required');
    });
  });

  describe('Session Isolation', () => {
    test('should keep different sessions separate', async () => {
      const message1 = { session: 'session1', content: 'Message for session 1' };
      const message2 = { session: 'session2', content: 'Message for session 2' };
      
      await request(app)
        .put('/message/session1')
        .send({ message: message1 });
      
      await request(app)
        .put('/message/session2')  
        .send({ message: message2 });
      
      // Check session1
      const response1 = await request(app).get('/message/session1');
      expect(response1.body.messages).toHaveLength(1);
      expect(response1.body.messages[0]).toEqual(message1);
      
      // Check session2
      const response2 = await request(app).get('/message/session2');
      expect(response2.body.messages).toHaveLength(1);
      expect(response2.body.messages[0]).toEqual(message2);
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown');
      
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not found');
    });

    test('should handle empty session ID', async () => {
      const response = await request(app)
        .put('/message/')
        .send({ message: 'test' });
      
      expect(response.status).toBe(404); // Router handles missing parameter as 404
    });
  });
});
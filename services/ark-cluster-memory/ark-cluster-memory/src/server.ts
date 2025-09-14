import express from 'express';
import cors from 'cors';
import { MemoryStore } from './memory-store.js';
import { StreamStore } from './stream-store.js';
import { createMemoryRouter } from './routes/memory.js';
import { createStreamRouter } from './routes/stream.js';
import { setupSwagger } from './swagger.js';

const app = express();
const memory = new MemoryStore();
const stream = new StreamStore();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Setup Swagger/OpenAPI documentation
setupSwagger(app);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the service
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: OK
 *       503:
 *         description: Service is unavailable
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Service Unavailable
 */
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


// Mount route modules
app.use('/', createMemoryRouter(memory));
app.use('/stream', createStreamRouter(stream));

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
const PORT = process.env.PORT || '8080';
const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(parseInt(PORT), HOST, () => {
  console.log(`ARK Cluster Memory service running on http://${HOST}:${PORT}`);
  if (process.env.MEMORY_FILE_PATH) {
    console.log(`Memory persistence enabled at: ${process.env.MEMORY_FILE_PATH}`);
  }
  if (process.env.STREAM_FILE_PATH) {
    console.log(`Stream persistence enabled at: ${process.env.STREAM_FILE_PATH}`);
  }
});

// Memory will be saved on graceful shutdown only
let saveInterval: NodeJS.Timeout | undefined;

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('Shutting down gracefully');
  
  if (saveInterval) {
    clearInterval(saveInterval);
  }
  
  // Save memory and streams before exit
  memory.saveMemory();
  stream.saveStreams();
  
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

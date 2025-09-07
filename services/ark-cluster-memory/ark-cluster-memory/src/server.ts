import express from 'express';
import cors from 'cors';
import { MemoryStore } from './memory-store.js';
import { createMemoryRouter } from './routes/memory.js';
import { createStreamRouter } from './routes/stream.js';

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



// Health check
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
app.use('/stream', createStreamRouter(memory));

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

// Memory will be saved on graceful shutdown only
let saveInterval: NodeJS.Timeout | undefined;

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

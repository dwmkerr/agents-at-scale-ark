import { createRequire } from 'module';
import app, { memory, stream, questions } from './server.js';
import { setupSwagger } from './swagger.js';
import { startMCPServer } from './mcp-server.js';

// Get version from package.json
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// Setup Swagger with real version
setupSwagger(app, version);

const PORT = process.env.PORT || '8080';
const HOST = process.env.HOST || '0.0.0.0';
const ENABLE_MCP = process.env.ENABLE_MCP === 'true';

const server = app.listen(parseInt(PORT), HOST, () => {
  console.log(`ARK Cluster Memory service running on http://${HOST}:${PORT}`);
  if (process.env.MEMORY_FILE_PATH) {
    console.log(`Memory persistence enabled at: ${process.env.MEMORY_FILE_PATH}`);
  }
  if (process.env.STREAM_FILE_PATH) {
    console.log(`Stream persistence enabled at: ${process.env.STREAM_FILE_PATH}`);
  }
  if (process.env.QUESTIONS_FILE_PATH) {
    console.log(`Questions persistence enabled at: ${process.env.QUESTIONS_FILE_PATH}`);
  }
});

if (ENABLE_MCP) {
  const MCP_PORT = parseInt(process.env.MCP_PORT || '8081');
  startMCPServer(questions, MCP_PORT).catch((error) => {
    console.error('Failed to start MCP server:', error);
  });
}

// Memory will be saved on graceful shutdown only
let saveInterval: ReturnType<typeof setInterval> | undefined;

// Graceful shutdown
const gracefulShutdown = (): void => {
  console.log('Shutting down gracefully');

  if (saveInterval) {
    clearInterval(saveInterval);
  }

  // Save memory, streams, and questions before exit
  memory.saveMemory();
  stream.saveStreams();
  questions.saveQuestions();

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
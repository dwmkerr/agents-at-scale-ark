import { Router, Request, Response } from 'express';
import { SessionStore } from '../session-store.js';
import protobuf from 'protobufjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let ExportTraceServiceRequest: protobuf.Type | null = null;

async function loadProto() {
  if (ExportTraceServiceRequest) return;
  const root = await protobuf.load(join(__dirname, '../../proto/trace_service.proto'));
  ExportTraceServiceRequest = root.lookupType('opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest');
  console.log('[OTLP] Protobuf definitions loaded');
}

loadProto().catch(err => console.error('[OTLP] Failed to load protobuf:', err));

export function createSessionsRouter(sessions: SessionStore): Router {
  const router = Router();

  router.post('/v1/traces', async (req: Request, res: Response) => {
    try {
      let data;
      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('application/x-protobuf')) {
        if (!ExportTraceServiceRequest) {
          await loadProto();
        }
        const decoded = ExportTraceServiceRequest!.decode(req.body as Buffer);
        data = ExportTraceServiceRequest!.toObject(decoded, { longs: String, bytes: String });
      } else {
        data = req.body;
      }

      console.log('[OTLP] Received traces:', JSON.stringify(data, null, 2).substring(0, 500));
      sessions.ingestTraces(data);
      res.json({ partialSuccess: {} });
    } catch (error) {
      console.error('[OTLP] Failed to ingest traces:', error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get('/broker/sessions', (req: Request, res: Response) => {
    const watch = req.query.watch === 'true';
    const resourceVersion = req.query.resourceVersion as string | undefined;

    if (watch) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const onSpan = (event: { resourceVersion: string; sessionId: string; queryName: string; span: unknown }) => {
        if (resourceVersion && parseInt(event.resourceVersion) <= parseInt(resourceVersion)) return;
        res.write(`event: span\ndata: ${JSON.stringify({ sessionId: event.sessionId, queryName: event.queryName, span: event.span })}\n\n`);
      };

      sessions.eventEmitter.on('span', onSpan);

      res.write(`event: connected\ndata: ${JSON.stringify({ resourceVersion: sessions.getResourceVersion() })}\n\n`);

      req.on('close', () => {
        sessions.eventEmitter.off('span', onSpan);
      });

      return;
    }

    const result = sessions.getSessions({
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      before: req.query.before as string | undefined,
      active: req.query.active === 'true',
    });
    res.json(result);
  });

  router.get('/broker/sessions/:id', (req: Request, res: Response) => {
    const watch = req.query.watch === 'true';
    const resourceVersion = req.query.resourceVersion as string | undefined;
    const sessionId = req.params.id;

    if (watch) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const onSpan = (event: { resourceVersion: string; sessionId: string; queryName: string; span: unknown }) => {
        if (event.sessionId !== sessionId) return;
        if (resourceVersion && parseInt(event.resourceVersion) <= parseInt(resourceVersion)) return;
        res.write(`event: span\ndata: ${JSON.stringify({ queryName: event.queryName, span: event.span })}\n\n`);
      };

      sessions.eventEmitter.on('span', onSpan);

      res.write(`event: connected\ndata: ${JSON.stringify({ resourceVersion: sessions.getResourceVersion() })}\n\n`);

      req.on('close', () => {
        sessions.eventEmitter.off('span', onSpan);
      });

      return;
    }

    const session = sessions.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  });

  router.delete('/broker/sessions', (req: Request, res: Response) => {
    sessions.purge();
    res.json({ status: 'success', message: 'Sessions purged' });
  });

  return router;
}

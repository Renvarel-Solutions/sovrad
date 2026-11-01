import Fastify, {type FastifyInstance, type FastifyReply} from 'fastify';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { Storage } from './storage.js';
import { registerAI, type AIConfig } from './ai.js';

const manualSchema = z.object({
  workflowId: z.string().min(1).max(100), stepId: z.string().min(1).max(100),
  baseRevision: z.number().int().positive(), text: z.string().trim().min(3).max(2000),
  proposedRules: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
  explanation: z.string().max(2000).default('Manual suggestion'),
}).strict();

function handleError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof z.ZodError) return reply.code(400).send({error: 'Invalid request'});
  const message = error instanceof Error ? error.message : '';
  if (/not found/i.test(message)) return reply.code(404).send({error: message});
  if (/stale|already resolved/i.test(message)) return reply.code(409).send({error: message});
  return reply.code(500).send({error: 'Unable to complete this request. No change was applied.'});
}

function localBoundary(app: FastifyInstance, port: number): void {
  app.addHook('onRequest', async (req, reply) => {
    if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host || '')) {
      return reply.code(403).send({error: 'Unapproved host'});
    }
    if (req.headers.origin && !['http://127.0.0.1:5173', 'http://localhost:5173'].includes(req.headers.origin)) {
      return reply.code(403).send({error: 'Unapproved origin'});
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') return reply.code(403).send({error: 'Cross-site request refused'});
    if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-sovrad-action'] !== '1') {
      return reply.code(403).send({error: 'Missing local action header'});
    }
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
}

export function buildApp(storage: Storage, options: {port?: number; ai?: AIConfig} = {}): FastifyInstance {
  const port = options.port ?? 4317;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid API_PORT');
  const ai = options.ai ?? {
    enabled: process.env.SOVRAD_AI_ENABLED === 'true',
    apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL,
  };
  const app = Fastify({logger: false, bodyLimit: 16384});
  localBoundary(app, port);
  app.addHook('onClose', () => storage.close());
  app.get('/api/health', async () => ({
    ok: true, service: 'sovrad-api', mode: 'local-only',
    aiConfigured: ai.enabled && Boolean(ai.apiKey && ai.model), runnerEnabled: false,
  }));
  app.get('/api/projects', async () => ({projects: storage.projects()}));
  app.get('/api/projects/:id/workflows', async (req, reply) => {
    const {id} = z.object({id: z.string()}).parse(req.params);
    if (!storage.projects().some(p => p.id === id)) return reply.code(404).send({error: 'Project not found'});
    return {workflows: storage.workflows(id)};
  });
  app.get('/api/workflows/:id', async (req, reply) => {
    const {id} = z.object({id: z.string()}).parse(req.params);
    const workflow = storage.workflow(id);
    if (!workflow) return reply.code(404).send({error: 'Workflow not found'});
    return {workflow, proposals: storage.proposals(id), history: storage.history(id)};
  });
  registerProposals(app, storage);
  registerAI(app, storage, ai);
  return app;
}

function registerProposals(app: FastifyInstance, storage: Storage): void {
  app.post('/api/proposals', async (req, reply) => {
    try {
      const input = manualSchema.parse(req.body);
      return reply.code(201).send({proposal: storage.propose({...input, provenance: 'manual'})});
    } catch (error) { return handleError(reply, error); }
  });
  app.post('/api/proposals/:id/decision', async (req, reply) => {
    try {
      const {id} = z.object({id: z.string().uuid()}).parse(req.params);
      const {action} = z.object({action: z.enum(['approve', 'reject'])}).strict().parse(req.body);
      return storage.decide(id, action);
    } catch (error) { return handleError(reply, error); }
  });
}

async function start(): Promise<void> {
  const port = Number(process.env.API_PORT || 4317);
  const app = buildApp(new Storage(), {port});
  const close = (): void => { void app.close(); };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  try {
    await app.listen({port, host: '127.0.0.1'});
    console.log('Sovrad API: http://127.0.0.1:' + port + ' (local only)');
  } catch {
    console.error('Sovrad could not start. Check the port and private data directory.');
    await app.close();
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void start().catch(() => { console.error('Sovrad could not initialize private storage.'); process.exitCode = 1; });
}

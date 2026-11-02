import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Storage} from './storage.js';
export function registerImports(app: FastifyInstance, storage: Storage): void {
  app.get('/api/imports/status',async()=>({enabled:false,reason:'The synthetic coding and native isolation gates must pass before a real pilot.'}));
  app.get('/api/imports',async()=>({snapshots:storage.imports.list()}));
  app.get('/api/imports/:id',async(req,reply)=>{
    const parsed=z.object({id:z.string().uuid()}).safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({error:'Invalid snapshot identity'});
    try {return {snapshot:storage.imports.get(parsed.data.id)};}
    catch {return reply.code(404).send({error:'Snapshot not found'});}
  });
  app.post('/api/imports',async(req,reply)=>{
    const valid=z.object({repository:z.string().min(1).max(500),commit:z.string().regex(/^[a-f0-9]{40}$/),
      files:z.array(z.string().min(1).max(300)).min(1).max(100)}).strict().safeParse(req.body);
    if (!valid.success) return reply.code(400).send({error:'Invalid import selection'});
    // Do not read any source before the real-pilot gate. There is no HTTP override.
    return reply.code(503).send({error:'Read-only pilot blocked until synthetic execution and isolation checks pass.'});
  });
}

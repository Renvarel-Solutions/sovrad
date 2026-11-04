import type {FastifyInstance} from 'fastify';
import {z} from 'zod';
import type {Storage} from './storage.js';
const identity = z.object({id:z.string().uuid()});
const empty = z.object({}).strict();
const approvalSchema = z.object({manifestDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export function registerImplementation(app: FastifyInstance, storage: Storage): void {
  app.get('/api/implementation/status',async()=>({enabled:false,...{reason:'Native isolation has not passed adversarial probes.'}}));
  app.get('/api/workflows/:id/tasks',async(req,reply)=>{
    const {id}=z.object({id:z.string().max(100)}).parse(req.params);
    if (!storage.workflow(id)) return reply.code(404).send({error:'Workflow not found'});
    return {tasks:storage.implementation.list(id)};
  });
  app.post('/api/implementation/tasks',async(req,reply)=>{
    const parsed=z.object({workflowId:z.string().max(100),revision:z.number().int().positive()}).strict().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({error:'Invalid task request'});
    try { return reply.code(201).send({task:storage.implementation.create(parsed.data.workflowId,parsed.data.revision)}); }
    catch { return reply.code(409).send({error:'An approved current synthetic calculator specification is required.'}); }
  });
  app.get('/api/implementation/tasks/:id',async(req,reply)=>{
    const parsed=identity.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({error:'Invalid task identity'});
    try { return {task:storage.implementation.get(parsed.data.id)}; }
    catch { return reply.code(404).send({error:'Task not found'}); }
  });
  app.get('/api/implementation/tasks/:id/events',async(req,reply)=>{
    const parsed=identity.safeParse(req.params);
    if (!parsed.success) return reply.code(400).send({error:'Invalid task identity'});
    try { return {events:storage.implementation.events(parsed.data.id)}; }
    catch { return reply.code(404).send({error:'Task not found'}); }
  });
  for (const action of ['approve','start','cancel'] as const) {
    app.post(`/api/implementation/tasks/:id/${action}`,async(req,reply)=>{
      const id=identity.safeParse(req.params);
      const body=(action==='approve'?approvalSchema:empty).safeParse(req.body);
      if (!id.success || !body.success) return reply.code(400).send({error:'Invalid implementation action'});
      try {
        if (action==='approve') return {task:storage.implementation.approve(id.data.id,approvalSchema.parse(req.body).manifestDigest)};
        if (action==='cancel') return {task:storage.implementation.cancel(id.data.id)};
        const result=storage.implementation.start(id.data.id);
        return reply.code(503).send({...result,error:'Execution blocked: native isolation is not verified.'});
      } catch { return reply.code(409).send({error:'Task missing, changed or not approved for this action.'}); }
    });
  }
}

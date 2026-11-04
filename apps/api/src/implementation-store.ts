import {randomUUID} from 'node:crypto';
import type Database from 'better-sqlite3';
import type {Workflow} from '@renvarel/architect-core';
import {digest, isolationPreflight, type ImplementationTask, type TaskEvent} from '../../runner/src/index.js';
import {prepareCalculator, verifyRepository, type RepositoryIdentity} from '../../runner/src/repository.js';
type Binding = {task: ImplementationTask; repository: RepositoryIdentity};

export class ImplementationStore {
  constructor(private readonly db: Database.Database, private readonly directory: string,
    private readonly approvedSpec: (id: string, revision: number) => {workflow: Workflow; receiptId: string}) {
    this.db.transaction(() => {
      const rows = this.db.prepare("SELECT payload FROM implementation_tasks WHERE state='running'").all() as {payload:string}[];
      for (const row of rows) {
        const binding = JSON.parse(row.payload) as Binding;
        binding.task.state='interrupted'; binding.task.approval=null;
        this.save(binding); this.event(binding.task.id,'interrupted','Restart detected; fresh implementation approval required.');
      }
    }).immediate();
  }
  private binding(id: string): Binding {
    const row = this.db.prepare('SELECT payload FROM implementation_tasks WHERE id=?').get(id) as {payload:string}|undefined;
    if (!row) throw new Error('Task not found');
    return JSON.parse(row.payload) as Binding;
  }
  private save(binding: Binding): void {
    this.db.prepare('UPDATE implementation_tasks SET state=?,payload=? WHERE id=?').run(binding.task.state,JSON.stringify(binding),binding.task.id);
  }
  private event(id: string, kind: string, detail: string): void {
    this.db.prepare('INSERT INTO implementation_events(task_id,kind,time,detail) VALUES (?,?,?,?)').run(id,kind,new Date().toISOString(),detail);
  }
  get(id: string): ImplementationTask { return this.binding(id).task; }
  list(workflowId: string): ImplementationTask[] {
    return (this.db.prepare('SELECT payload FROM implementation_tasks WHERE workflow_id=? ORDER BY rowid DESC').all(workflowId) as {payload:string}[])
      .map(row=>(JSON.parse(row.payload) as Binding).task);
  }
  events(id: string): TaskEvent[] {
    this.get(id);
    return this.db.prepare('SELECT sequence,kind,time,detail FROM implementation_events WHERE task_id=? ORDER BY sequence').all(id) as TaskEvent[];
  }
  create(workflowId: string, revision: number): ImplementationTask {
    const approved = this.approvedSpec(workflowId,revision);
    const id = randomUUID();
    const prepared = prepareCalculator(this.directory,id);
    return this.db.transaction(() => {
      this.approvedSpec(workflowId,revision);
      const manifest = {workflowId,specRevision:revision,specDigest:digest(JSON.stringify(approved.workflow)),
        specReceiptId:approved.receiptId,repositoryId:prepared.repository.id,baseCommit:prepared.repository.baseCommit,
        allowedFiles:['calculator.mjs'],acceptanceSuite:'calculator-v1' as const,acceptanceDigest:prepared.acceptanceDigest,maxSeconds:600 as const};
      const task: ImplementationTask = {id,manifest,manifestDigest:digest(JSON.stringify(manifest)),state:'awaiting_approval',
        approval:null,findings:[],diff:null,tests:[]};
      this.db.prepare('INSERT INTO implementation_tasks(id,workflow_id,state,payload) VALUES (?,?,?,?)')
        .run(id,workflowId,task.state,JSON.stringify({task,repository:prepared.repository}));
      this.event(id,'created','Frozen synthetic calculator manifest prepared; no coding permission granted.');
      return task;
    }).immediate();
  }
  private validate(binding: Binding): void {
    const {task} = binding;
    const approved = this.approvedSpec(task.manifest.workflowId,task.manifest.specRevision);
    if (digest(JSON.stringify(approved.workflow))!==task.manifest.specDigest || approved.receiptId!==task.manifest.specReceiptId ||
        digest(JSON.stringify(task.manifest))!==task.manifestDigest) throw new Error('Stale specification or manifest');
    verifyRepository(binding.repository);
  }
  approve(id: string, manifestDigest: string): ImplementationTask {
    return this.db.transaction(() => {
      const binding=this.binding(id); const {task}=binding;
      this.validate(binding);
      if (!['awaiting_approval','interrupted'].includes(task.state) || task.approval || task.manifestDigest!==manifestDigest) throw new Error('Stale or replayed approval');
      task.state='awaiting_approval';
      task.approval={id:randomUUID(),manifestDigest,actor:'delegated-review',time:new Date().toISOString()};
      task.findings=[];
      this.save(binding); this.event(id,'approved','Distinct implementation receipt recorded for this exact manifest.');
      return task;
    }).immediate();
  }
  start(id: string): {task: ImplementationTask; blocked: true} {
    return this.db.transaction(() => {
      const binding=this.binding(id); const {task}=binding;
      this.validate(binding);
      if (task.state!=='awaiting_approval' || task.approval?.manifestDigest!==task.manifestDigest) throw new Error('Fresh implementation approval required');
      const preflight=isolationPreflight();
      if (!task.findings.length) this.event(id,'preflight_blocked','Native isolation is unverified; no coding process launched.');
      task.findings=preflight.findings;
      this.save(binding);
      return {task,blocked:true as const};
    }).immediate();
  }
  cancel(id: string): ImplementationTask {
    return this.db.transaction(() => {
      const binding=this.binding(id); const {task}=binding;
      if (['succeeded','failed','cancelled'].includes(task.state)) return task;
      task.state='cancelled'; task.approval=null;
      this.save(binding); this.event(id,'cancelled','Task cancelled; implementation permission revoked.');
      return task;
    }).immediate();
  }
}

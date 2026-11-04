import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { dataDirectory, validateDataDirectory } from './data-directory.js';
import {AIBudget} from './ai-budget.js';
import {backupPath, migrate} from './migrations.js';
import {ImplementationStore} from './implementation-store.js';
import {ImportStore} from './import-store.js';
import {
  CALCULATOR_PROJECT, CALCULATOR_WORKFLOW, applyApprovedProposal, assertValidWorkflow,
  type Workflow, type Project, type Proposal
} from '@renvarel/architect-core';

export class Storage {
  private readonly db: Database.Database;
  readonly budget: AIBudget;
  readonly implementation: ImplementationStore;
  readonly imports: ImportStore;
  private readonly directory: string;
  constructor(directory = dataDirectory()) {
    directory = validateDataDirectory(directory);
    mkdirSync(directory, {recursive: true, mode: 0o700});
    this.directory = directory;
    const existing = existsSync(path.join(directory, 'sovrad.sqlite'));
    this.db = new Database(path.join(directory, 'sovrad.sqlite'));
    try {
      // Reject newer schemas and back up older ones before any startup writes.
      migrate(this.db, directory, existing);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workflows (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id),
          revision INTEGER NOT NULL,
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS proposals (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL REFERENCES workflows(id),
          status TEXT NOT NULL CHECK(status IN ('draft','approved','rejected')),
          payload TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_events (
          id TEXT PRIMARY KEY,
          time TEXT NOT NULL,
          action TEXT NOT NULL,
          workflow_id TEXT NOT NULL,
          base_revision INTEGER NOT NULL,
          resulting_revision INTEGER,
          proposal_id TEXT NOT NULL,
          specification_json TEXT NOT NULL
        );
      `);
      this.db.exec('CREATE TABLE IF NOT EXISTS ai_daily_usage(day TEXT PRIMARY KEY,requests INTEGER NOT NULL CHECK(requests >= 0)); CREATE TABLE IF NOT EXISTS workflow_revisions(workflow_id TEXT NOT NULL,revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(workflow_id,revision));');
      this.seed();
      this.db.prepare('INSERT OR IGNORE INTO workflow_revisions(workflow_id,revision,payload) SELECT id,revision,payload FROM workflows').run();
      this.budget = new AIBudget(this.db);
      this.imports = new ImportStore(this.db);
      this.implementation = new ImplementationStore(this.db,directory,(id,revision)=>{
        const workflow=this.workflow(id);
        if (!workflow || workflow.projectId!==CALCULATOR_PROJECT.id || workflow.id!==CALCULATOR_WORKFLOW.id || workflow.revision!==revision) throw new Error('Current synthetic specification required');
        const receipt=this.db.prepare("SELECT id FROM audit_events WHERE workflow_id=? AND resulting_revision=? AND action='approve'").get(id,revision) as {id:string}|undefined;
        if (!receipt) throw new Error('Approved specification required');
        return {workflow,receiptId:receipt.id};
      });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close(): void { this.db.close(); }
  async backup(): Promise<string> {
    const destination = backupPath(this.directory);
    await this.db.backup(destination);
    return destination;
  }
  reserveAIRequest(day: string, limit: number): boolean {
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT requests FROM ai_daily_usage WHERE day=?').get(day) as {requests: number} | undefined;
      if ((row?.requests || 0) >= limit) return false;
      this.db.prepare('INSERT INTO ai_daily_usage(day,requests) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET requests=requests+1').run(day);
      return true;
    }).immediate();
  }
  history(workflowId: string): {revision: number; workflow: Workflow}[] {
    return (this.db.prepare('SELECT revision,payload FROM workflow_revisions WHERE workflow_id=? ORDER BY revision').all(workflowId) as {revision: number; payload: string}[])
      .map(row => ({revision: row.revision, workflow: JSON.parse(row.payload) as Workflow}));
  }
  private seed(): void {
    const exists=this.db.prepare('SELECT 1 FROM projects WHERE id=?').get(CALCULATOR_PROJECT.id);
    if (exists) return;
    assertValidWorkflow(CALCULATOR_WORKFLOW);
    this.db.transaction(()=>{
      this.db.prepare('INSERT INTO projects(id,payload) VALUES (?,?)').run(CALCULATOR_PROJECT.id,JSON.stringify(CALCULATOR_PROJECT));
      this.db.prepare('INSERT INTO workflows(id,project_id,revision,payload) VALUES (?,?,?,?)').run(CALCULATOR_WORKFLOW.id,CALCULATOR_PROJECT.id,CALCULATOR_WORKFLOW.revision,JSON.stringify(CALCULATOR_WORKFLOW));
    }).immediate();
  }
  projects(): Project[] {
    return (this.db.prepare('SELECT payload FROM projects ORDER BY id').all() as {payload:string}[]).map(r=>JSON.parse(r.payload) as Project);
  }
  workflows(projectId:string):Workflow[] {
    return (this.db.prepare('SELECT payload FROM workflows WHERE project_id=? ORDER BY id').all(projectId) as {payload:string}[]).map(r=>JSON.parse(r.payload) as Workflow);
  }
  workflow(id:string):Workflow|null {
    const row=this.db.prepare('SELECT payload FROM workflows WHERE id=?').get(id) as {payload:string}|undefined;
    return row?JSON.parse(row.payload) as Workflow:null;
  }
  proposals(workflowId:string):Proposal[] {
    return (this.db.prepare('SELECT payload FROM proposals WHERE workflow_id=? ORDER BY rowid DESC').all(workflowId) as {payload:string}[]).map(r=>JSON.parse(r.payload) as Proposal);
  }
  propose(input:Pick<Proposal,'workflowId'|'stepId'|'baseRevision'|'text'|'proposedRules'|'explanation'|'provenance'>):Proposal {
    const workflow=this.workflow(input.workflowId);
    if(!workflow) throw new Error('Workflow not found');
    if(workflow.revision!==input.baseRevision) throw new Error('Stale proposal: refresh workflow first');
    if(!workflow.steps.find(s=>s.id===input.stepId)) throw new Error('Selected step was not found');
    if(!input.text.trim() || input.proposedRules.length===0 || input.proposedRules.some(s=>!s.trim())) throw new Error('Proposal must include a change and valid rules');
    const proposal:Proposal={...input,id:randomUUID(),status:'draft',createdAt:new Date().toISOString()};
    this.db.prepare('INSERT INTO proposals(id,workflow_id,status,payload) VALUES (?,?,?,?)').run(proposal.id,proposal.workflowId,proposal.status,JSON.stringify(proposal));
    return proposal;
  }
  decide(proposalId:string,action:'approve'|'reject'):{proposal:Proposal,workflow:Workflow} {
    return this.db.transaction(()=>{
      const stored=this.db.prepare('SELECT payload FROM proposals WHERE id=?').get(proposalId) as {payload:string}|undefined;
      if(!stored) throw new Error('Proposal not found');
      const proposal=JSON.parse(stored.payload) as Proposal;
      if(proposal.status!=='draft') throw new Error('Proposal is already resolved');
      const old=this.workflow(proposal.workflowId);
      if(!old) throw new Error('Workflow not found');
      if(old.revision!==proposal.baseRevision) throw new Error('Stale proposal: refresh workflow first');
      const next=action==='approve'?applyApprovedProposal(old,proposal):old;
      if (action === 'approve') this.db.prepare('INSERT INTO workflow_revisions(workflow_id,revision,payload) VALUES (?,?,?)').run(next.id,next.revision,JSON.stringify(next));
      const updated:Proposal={...proposal,status:action==='approve'?'approved':'rejected'};
      if(action==='approve') this.db.prepare('UPDATE workflows SET revision=?,payload=? WHERE id=? AND revision=?').run(next.revision,JSON.stringify(next),next.id,old.revision);
      this.db.prepare('UPDATE proposals SET status=?,payload=? WHERE id=? AND status=?').run(updated.status,JSON.stringify(updated),updated.id,'draft');
      this.db.prepare('INSERT INTO audit_events(id,time,action,workflow_id,base_revision,resulting_revision,proposal_id,specification_json) VALUES (?,?,?,?,?,?,?,?)').run(randomUUID(),new Date().toISOString(),action,old.id,old.revision,action==='approve'?next.revision:null,updated.id,JSON.stringify(next));
      return {proposal:updated,workflow:next};
    }).immediate();
  }
}

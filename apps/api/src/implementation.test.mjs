import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Storage} from './storage.ts';
import {buildApp} from './server.ts';
const workflowId = 'sample-calculator-arithmetic';
const headers = {host:'127.0.0.1:4317', origin:'http://127.0.0.1:5173', 'x-sovrad-action':'1'};
const post = (app, url, payload) => app.inject({method:'POST',url,payload,headers});
async function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'sovrad-implementation-'));
  const storage = new Storage(directory);
  const app = buildApp(storage, {ai:{enabled:false}});
  t.after(async () => { await app.close(); rmSync(directory,{recursive:true,force:true}); });
  return {app,storage,directory};
}
function approveSpec(storage) {
  const proposal = storage.propose({workflowId,stepId:'number-a',baseRevision:1,text:'Whole number first input',
    proposedRules:['Accept only nonnegative whole numbers.'],explanation:'Synthetic requirement',provenance:'manual'});
  storage.decide(proposal.id,'approve');
}

test('implementation needs an approved revision and frozen manifest, with a distinct approval', async t => {
  const {app,storage} = await fixture(t);
  assert.equal((await post(app,'/api/implementation/tasks',{workflowId,revision:1})).statusCode,409);
  approveSpec(storage);
  const created = await post(app,'/api/implementation/tasks',{workflowId,revision:2});
  assert.equal(created.statusCode,201,created.body);
  const task = created.json().task;
  assert.equal(task.state,'awaiting_approval');
  assert.equal(task.manifest.specRevision,2);
  assert.equal(task.manifest.specDigest.length,64);
  assert.equal(task.manifest.baseCommit.length,40);
  assert.deepEqual(task.manifest.allowedFiles,['calculator.mjs']);
  assert.equal(task.approval,null);
  assert.equal((await post(app,`/api/implementation/tasks/${task.id}/start`,{})).statusCode,409);
  assert.equal((await post(app,`/api/implementation/tasks/${task.id}/approve`,{manifestDigest:'0'.repeat(64)})).statusCode,409);
  assert.equal((await post(app,`/api/implementation/tasks/${task.id}/approve`,{manifestDigest:task.manifestDigest,actor:'model'})).statusCode,400);
  assert.equal((await post(app,`/api/implementation/tasks/${task.id}/approve`,{manifestDigest:task.manifestDigest})).statusCode,200);
  assert.equal((await post(app,`/api/implementation/tasks/${task.id}/approve`,{manifestDigest:task.manifestDigest})).statusCode,409);
});

test('native isolation gate refuses start without launching any coding model and persists the finding', async t => {
  const {app,storage,directory} = await fixture(t);
  approveSpec(storage);
  const task = (await post(app,'/api/implementation/tasks',{workflowId,revision:2})).json().task;
  await post(app,`/api/implementation/tasks/${task.id}/approve`,{manifestDigest:task.manifestDigest});
  const started = await post(app,`/api/implementation/tasks/${task.id}/start`,{});
  assert.equal(started.statusCode,503);
  assert.ok(!started.body.includes(directory));
  const status = (await app.inject({url:`/api/implementation/tasks/${task.id}`,headers})).json().task;
  assert.equal(status.state,'awaiting_approval');
  assert.ok(status.findings.some(f=>/isolation/i.test(f)));
  const events = (await app.inject({url:`/api/implementation/tasks/${task.id}/events`,headers})).json().events;
  assert.ok(events.some(e=>e.kind==='preflight_blocked'));
  assert.equal((await post(app,`/api/implementation/tasks/${task.id}/cancel`,{})).json().task.state,'cancelled');
  assert.equal((await post(app,`/api/implementation/tasks/${task.id}/start`,{})).statusCode,409);
  await app.close();
  const reopened = new Storage(directory);
  try { assert.equal(reopened.implementation.get(task.id).state,'cancelled'); } finally {reopened.close();}
});

test('tasks from stale specifications cannot be approved or started; imported projects never execute', async t => {
  const {app,storage} = await fixture(t);
  approveSpec(storage);
  const task = (await post(app,'/api/implementation/tasks',{workflowId,revision:2})).json().task;
  const later = storage.propose({workflowId,stepId:'number-a',baseRevision:2,text:'A later change',
    proposedRules:['Accept positive whole numbers.'],explanation:'Synthetic change',provenance:'manual'});
  storage.decide(later.id,'approve');
  assert.equal((await post(app,`/api/implementation/tasks/${task.id}/approve`,{manifestDigest:task.manifestDigest})).statusCode,409);
  assert.equal((await post(app,'/api/implementation/tasks',{workflowId:'imported-fictional',revision:1})).statusCode,409);
  assert.equal((await post(app,'/api/implementation/tasks',{workflowId,revision:3,repository:'C:/private',commands:['anything']})).statusCode,400);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildApp} from './server.ts';
import {Storage} from './storage.ts';

const workflowId = 'sample-calculator-arithmetic';
const headers = {host: '127.0.0.1:4317', origin: 'http://127.0.0.1:5173', 'x-sovrad-action': '1'};
const change = {workflowId, stepId: 'number-a', baseRevision: 1, text: 'Accept whole numbers only',
  proposedRules: ['Accept only whole numbers.'], explanation: 'Synthetic test'};
const ask = {workflowId, stepId: 'number-a', baseRevision: 1, text: 'Accept whole numbers only', sendToAI: true};
async function fixture(t, ai = {enabled: false}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'sovrad-http-'));
  const storage = new Storage(directory);
  const app = buildApp(storage, {ai});
  t.after(async () => { await app.close(); rmSync(directory, {recursive: true, force: true}); });
  return {app, storage, directory};
}
const post = (app, url, payload, overrides = {}) => app.inject({method: 'POST', url, payload, headers: {...headers, ...overrides}});
const response = (result = {proposedRules: ['Accept only whole numbers.'], explanation: 'Synthetic suggestion'}) =>
  new Response(JSON.stringify({id: 'resp_synthetic', object: 'response', status: 'completed',
    output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text: JSON.stringify(result)}]}]}),
  {status: 200, headers: {'Content-Type': 'application/json'}});

test('HTTP proposal, approval, stale refusal, immutable history and restart persistence', async t => {
  const {app, storage, directory} = await fixture(t);
  const a = (await post(app, '/api/proposals', change)).json().proposal;
  const b = (await post(app, '/api/proposals', {...change, text: 'A competing change'})).json().proposal;
  assert.equal(storage.workflow(workflowId).revision, 1);
  assert.equal((await post(app, '/api/proposals/' + a.id + '/decision', {action: 'approve'})).statusCode, 200);
  assert.equal((await post(app, '/api/proposals/' + b.id + '/decision', {action: 'approve'})).statusCode, 409);
  assert.equal((await post(app, '/api/proposals/' + a.id + '/decision', {action: 'approve'})).statusCode, 409);
  const saved = await app.inject({url: '/api/workflows/' + workflowId, headers});
  assert.equal(saved.json().workflow.revision, 2);
  assert.deepEqual(saved.json().history.map(r => r.revision), [1, 2]);
  assert.notDeepEqual(saved.json().history[0].workflow.steps[0].rules, change.proposedRules);
  assert.deepEqual(saved.json().history[1].workflow.steps[0].rules, change.proposedRules);
  await app.close();
  const reopened = new Storage(directory);
  try {
    assert.deepEqual(reopened.workflow(workflowId).steps[0].rules, change.proposedRules);
    assert.equal(reopened.proposals(workflowId).find(p => p.id === a.id).status, 'approved');
    assert.equal(reopened.history(workflowId).length, 2);
  } finally { reopened.close(); }
});

test('HTTP rejection records decision without changing rules or revision', async t => {
  const {app, storage} = await fixture(t);
  const original = storage.workflow(workflowId);
  const created = await post(app, '/api/proposals', change);
  assert.equal(created.statusCode, 201);
  const decided = await post(app, '/api/proposals/' + created.json().proposal.id + '/decision', {action: 'reject'});
  assert.equal(decided.statusCode, 200);
  assert.equal(decided.json().proposal.status, 'rejected');
  assert.deepEqual(storage.workflow(workflowId), original);
});

test('HTTP boundary denies malicious host, origin, null origin, cross-site reads and missing action header', async t => {
  const {app, storage} = await fixture(t);
  for (const override of [{host: 'evil.example:4317'}, {origin: 'https://evil.example'}, {origin: 'null'}, {'x-sovrad-action': ''}]) {
    assert.equal((await post(app, '/api/proposals', change, override)).statusCode, 403);
  }
  assert.equal((await app.inject({url: '/api/projects', headers: {...headers, 'sec-fetch-site': 'cross-site'}})).statusCode, 403);
  const allowed = await app.inject({url: '/api/projects', headers});
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.json().projects[0].id, 'sample-calculator');
  assert.equal(allowed.headers['cache-control'], 'no-store');
  assert.equal(storage.proposals(workflowId).length, 0);
});

test('HTTP input cannot assign approval, forge AI provenance or execute commands', async t => {
  const {app} = await fixture(t);
  for (const extra of [{status: 'approved'}, {provenance: 'openai-api'}, {command: 'echo forbidden'}]) {
    assert.equal((await post(app, '/api/proposals', {...change, ...extra})).statusCode, 400);
  }
  assert.equal((await post(app, '/api/proposals', {...change, proposedRules: [' ']})).statusCode, 400);
  assert.equal((await post(app, '/api/proposals', {...change, text: 'x'.repeat(18000)})).statusCode, 413);
  assert.equal((await post(app, '/api/runner/start', {command: 'echo forbidden'})).statusCode, 404);
  assert.equal((await app.inject({url: '/api/health', headers})).json().runnerEnabled, false);
});

test('AI is disabled by default and always needs request consent', async t => {
  const {app} = await fixture(t);
  assert.equal((await post(app, '/api/ai/proposal', ask)).statusCode, 503);
  assert.equal((await post(app, '/api/ai/proposal', {...ask, sendToAI: false})).statusCode, 400);
});

test('AI sends minimal selected data using structured output and never approves it', async t => {
  const calls = [];
  const {app, storage} = await fixture(t, {enabled: true, apiKey: 'synthetic-test-key', model: 'test-model',
    fetch: async (url, options) => { calls.push({url: String(url), body: JSON.parse(options.body)}); return response(); }});
  assert.equal((await post(app, '/api/ai/proposal', {...ask, sendToAI: false})).statusCode, 400);
  const result = await post(app, '/api/ai/proposal', ask);
  assert.equal(result.statusCode, 201, result.body);
  assert.equal(result.json().proposal.status, 'draft');
  assert.equal(result.json().proposal.provenance, 'openai-api');
  assert.equal(storage.workflow(workflowId).revision, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].body.store, false);
  assert.equal(calls[0].body.max_output_tokens, 1500);
  assert.equal(calls[0].body.text.format.strict, true);
  assert.deepEqual(Object.keys(JSON.parse(calls[0].body.input[1].content)).sort(),
    ['currentRules', 'purpose', 'requestedChange', 'stepTitle']);
  const health = (await app.inject({url: '/api/health', headers})).body;
  assert.ok(!health.includes('synthetic-test-key'));
});

test('credential-like requests are refused before any AI network call', async t => {
  let calls = 0;
  const {app} = await fixture(t, {enabled: true, apiKey: 'synthetic-test-key', model: 'test-model',
    fetch: async () => { calls++; return response(); }});
  assert.equal((await post(app, '/api/ai/proposal', {...ask, text: 'My key is ' + 'sk-' + 'a'.repeat(30)})).statusCode, 400);
  assert.equal(calls, 0);
  assert.equal((await post(app, '/api/ai/proposal', ask)).statusCode, 201);
  assert.equal(calls, 1);
});

test('AI refusal, invalid output and provider failure preserve the workflow', async t => {
  for (const result of [response({proposedRules: [], explanation: 'Invalid'}), new Response('private provider details', {status: 500}),
    new Response(JSON.stringify({status: 'incomplete', output: []}), {status: 200, headers: {'Content-Type': 'application/json'}})]) {
    const {app, storage} = await fixture(t, {enabled: true, apiKey: 'synthetic-test-key', model: 'test-model', fetch: async () => result});
    const failed = await post(app, '/api/ai/proposal', ask);
    assert.equal(failed.statusCode, 502);
    assert.ok(!failed.body.includes('private provider details'));
    assert.equal(storage.proposals(workflowId).length, 0);
    assert.equal(storage.workflow(workflowId).revision, 1);
  }
});

test('AI rechecks revision after the provider returns', async t => {
  let storageRef;
  const {app, storage} = await fixture(t, {enabled: true, apiKey: 'synthetic-test-key', model: 'test-model',
    fetch: async () => { const p = storageRef.propose({...change, provenance: 'manual'}); storageRef.decide(p.id, 'approve'); return response(); }});
  storageRef = storage;
  const stale = await post(app, '/api/ai/proposal', ask);
  assert.equal(stale.statusCode, 409);
  assert.equal(storage.proposals(workflowId).length, 1);
  assert.equal(storage.proposals(workflowId)[0].provenance, 'manual');
});

test('AI daily quota survives close and reopen, including failed attempts', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'sovrad-quota-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  let attempts = 0;
  const ai = {enabled: true, apiKey: 'synthetic-test-key', model: 'test-model', fetch: async () => ++attempts === 1 ? new Response('failure', {status: 500}) : response()};
  let app = buildApp(new Storage(directory), {ai});
  try {
    for (let i = 0; i < 10; i++) assert.equal((await post(app, '/api/ai/proposal', ask)).statusCode, i === 0 ? 502 : 201);
    await app.close();
    app = buildApp(new Storage(directory), {ai});
    assert.equal((await post(app, '/api/ai/proposal', ask)).statusCode, 429);
    assert.equal(attempts, 10);
  } finally { await app.close(); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Storage} from './storage.ts';
import {buildApp} from './server.ts';
const headers = {host: '127.0.0.1:4317', origin: 'http://127.0.0.1:5173', 'x-sovrad-action': '1'};
const ask = {workflowId: 'sample-calculator-arithmetic', stepId: 'number-a', baseRevision: 1,
  text: 'Accept whole numbers only', sendToAI: true};
const json = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});
const completion = text => json({id: 'resp_synthetic', object: 'response', status: 'completed', usage: {input_tokens: 100, output_tokens: 20},
  output: [{type: 'message', role: 'assistant', content: [{type: 'output_text', text: JSON.stringify({
    proposedRules: ['Accept whole numbers only.'], explanation: text || 'Synthetic suggestion',
  })}]}]});
async function fixture(t, transport, config = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'sovrad-spending-'));
  const storage = new Storage(dir);
  const app = buildApp(storage, {ai: {enabled: true, apiKey: 'synthetic-only-credential', hardLimitConfirmed: true,
    fetch: transport, ...config}});
  t.after(async () => { await app.close(); rmSync(dir, {recursive: true, force: true}); });
  const send = () => app.inject({method: 'POST', url: '/api/ai/proposal', payload: ask, headers});
  return {app, storage, send};
}

test('AI counts full input before reserving and settles reported usage before saving draft', async t => {
  const calls = [];
  const {app, storage, send} = await fixture(t, async (url, options) => {
    calls.push({url: String(url), body: JSON.parse(options.body)});
    if (String(url).endsWith('/input_tokens')) return json({input_tokens: 100});
    assert.equal(storage.budget.status().reservedMicros, 18_250);
    return completion();
  });
  assert.equal((await send()).statusCode, 201);
  assert.equal(calls.length, 2);
  for (const field of ['model', 'input', 'text', 'reasoning']) assert.deepEqual(calls[0].body[field], calls[1].body[field]);
  assert.deepEqual(calls[1].body.reasoning, {effort: 'none'});
  const status = await app.inject({url: '/api/ai/status', headers});
  assert.equal(status.json().spentMicros, 490);
  assert.equal(status.json().reservedMicros, 0);
  assert.ok(!status.body.includes('synthetic-only-credential'));
});

test('unknown response charge retains reservation, pauses future calls and never leaks provider error', async t => {
  let calls = 0;
  const {storage, send} = await fixture(t, async url => {
    calls++;
    return String(url).endsWith('/input_tokens') ? json({input_tokens: 100}) : new Response('synthetic-only-credential', {status: 500});
  });
  const failed = await send();
  assert.equal(failed.statusCode, 502);
  assert.ok(!failed.body.includes('synthetic-only-credential'));
  assert.equal(storage.budget.status().paused, true);
  assert.equal((await send()).statusCode, 429);
  assert.equal(calls, 2);
});

test('provider output cannot echo the backend credential into drafts', async t => {
  const {storage, send} = await fixture(t, async url => String(url).endsWith('/input_tokens') ? json({input_tokens: 100}) : completion('synthetic-only-credential'));
  const result = await send();
  assert.equal(result.statusCode, 502);
  assert.ok(!result.body.includes('synthetic-only-credential'));
  assert.equal(storage.proposals(ask.workflowId).length, 0);
  assert.equal(storage.budget.status().spentMicros, 490);
});

test('paid AI requires confirmed project hard limit and pinned price/model', async t => {
  for (const config of [{hardLimitConfirmed: false}, {model: 'unpriced-model'}]) {
    let calls = 0;
    const {send} = await fixture(t, async () => { calls++; return completion(); }, config);
    assert.equal((await send()).statusCode, 503);
    assert.equal(calls, 0);
  }
});

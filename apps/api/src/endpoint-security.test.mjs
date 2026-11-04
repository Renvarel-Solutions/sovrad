import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildApp} from './server.ts';
import {Storage} from './storage.ts';
const headers={host:'127.0.0.1:4317',origin:'http://127.0.0.1:5173','x-sovrad-action':'1'};
const id='00000000-0000-4000-8000-000000000000';
const marker='synthetic-credential-never-in-http';
const expected=[
  'GET /api/health','GET /api/projects','GET /api/projects/:id/workflows','GET /api/workflows/:id',
  'POST /api/proposals','POST /api/proposals/:id/decision','GET /api/ai/status','POST /api/ai/proposal',
  'GET /api/implementation/status','GET /api/workflows/:id/tasks','POST /api/implementation/tasks',
  'GET /api/implementation/tasks/:id','GET /api/implementation/tasks/:id/events',
  'POST /api/implementation/tasks/:id/approve','POST /api/implementation/tasks/:id/start','POST /api/implementation/tasks/:id/cancel',
  'GET /api/imports/status','GET /api/imports','GET /api/imports/:id','POST /api/imports',
].sort();

test('every registered endpoint enforces local boundaries and returns no backend credential',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'sovrad-endpoints-'));
  const app=buildApp(new Storage(directory),{ai:{enabled:false,apiKey:marker}});
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  assert.deepEqual(app.routeInventory.filter(r=>r.method!=='HEAD').map(r=>r.method+' '+r.url).sort(),expected);
  for (const route of app.routeInventory) {
    const url=route.url.replaceAll(':id',id);
    const valid={method:route.method,url,headers,payload:route.method==='POST'?{}:undefined};
    const control=await app.inject(valid);
    assert.notEqual(control.statusCode,403,route.method+' '+url+' positive control');
    assert.ok(!control.body.includes(marker),url);
    assert.equal(control.headers['cache-control'],'no-store');
    for (const override of [{host:'evil.example'},{origin:'https://evil.example'},{origin:'null'},{'sec-fetch-site':'cross-site'}]) {
      const result=await app.inject({...valid,headers:{...headers,...override}});
      assert.equal(result.statusCode,403,route.method+' '+url+' '+JSON.stringify(override));
      assert.ok(!result.body.includes(marker));
    }
    if (route.method==='POST') {
      assert.equal((await app.inject({...valid,headers:{...headers,'x-sovrad-action':''}})).statusCode,403,url);
      assert.equal((await app.inject({...valid,payload:{text:'x'.repeat(17000)}})).statusCode,413,url);
    }
  }
  const missing=await app.inject({url:'/api/unknown?key='+marker,headers});
  assert.equal(missing.statusCode,404);
  assert.ok(!missing.body.includes(marker),'unknown URLs must not echo credentials');
});

test('manual proposals cannot persist or echo credential-like values, including the configured key',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'sovrad-secret-'));
  const storage=new Storage(directory);
  const app=buildApp(storage,{ai:{enabled:false,apiKey:marker}});
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
  const body={workflowId:'sample-calculator-arithmetic',stepId:'number-a',baseRevision:1,text:'A synthetic correction',proposedRules:['Finite numbers only'],explanation:'Synthetic'};
  assert.equal((await app.inject({method:'POST',url:'/api/proposals',headers,payload:body})).statusCode,201);
  for (const secret of [marker,'sk-'+'a'.repeat(30)]) {
    const rejected=await app.inject({method:'POST',url:'/api/proposals',headers,payload:{...body,explanation:secret}});
    assert.equal(rejected.statusCode,400);
    assert.ok(!rejected.body.includes(secret));
  }
  assert.equal(storage.proposals(body.workflowId).length,1);
});

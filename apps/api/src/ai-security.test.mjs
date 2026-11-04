import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import {Storage} from './storage.ts';
import {buildApp} from './server.ts';
import {containsPrivateContent,secretLike} from './privacy.ts';
import {prepareCalculator,git} from '../../runner/src/repository.ts';
const headers={host:'127.0.0.1:4317',origin:'http://127.0.0.1:5173','x-sovrad-action':'1'};
const key='synthetic-dedicated-credential';
const ask={workflowId:'sample-calculator-arithmetic',stepId:'number-a',baseRevision:1,text:'Accept whole numbers only',sendToAI:true};
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const completion=text=>json({id:'resp_fixture',object:'response',status:'completed',usage:{input_tokens:100,output_tokens:20},
 output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({proposedRules:['Accept whole numbers.'],explanation:text})}]}]});
function env(t,values){for(const [name,value]of Object.entries(values)){const prior=process.env[name];process.env[name]=value;t.after(()=>{if(prior===undefined)delete process.env[name];else process.env[name]=prior;});}}
async function fixture(t,fetch){const directory=mkdtempSync(path.join(os.tmpdir(),'sovrad-ai-security-'));const storage=new Storage(directory);
 const app=buildApp(storage,{ai:{enabled:true,hardLimitConfirmed:true,apiKey:key,fetch}});
 t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true});});
 return{app,storage,directory,send:text=>app.inject({method:'POST',url:'/api/ai/proposal',headers,payload:{...ask,text:text||ask.text}})};}
function escapedCredential(token){const text=String.raw`password=\"${token}\"`;
 assert.ok(text.includes('\\"'),'fixture must retain literal backslash escaping');
 assert.equal(secretLike.test(text),false,'raw pattern must not satisfy the decoding regression');return text;}
function assertNotRetained(directory,token){const db=new Database(path.join(directory,'sovrad.sqlite'),{readonly:true});
 try{for(const table of ['proposals','audit_events','imported_snapshots','import_quarantines','workflows','workflow_revisions']){
  assert.ok(!JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all()).includes(token),`${table} retained screened content`);
 }}finally{db.close();}}
function commitBlob(repository,content){writeFileSync(path.join(repository.directory,'fixture.txt'),content);
 git(repository.directory,['add','fixture.txt']);git(repository.directory,['-c','user.name=Synthetic','-c','user.email=fixture@example.invalid','commit','-m','Synthetic screening fixture']);
 return{repository:repository.directory,commit:git(repository.directory,['rev-parse','HEAD']),files:['fixture.txt']};}

test('inherited provider URL cannot redirect either AI request',async t=>{
 env(t,{OPENAI_BASE_URL:'http://127.0.0.1:9/foreign-provider'});const calls=[];
 const {send}=await fixture(t,async url=>{calls.push(String(url));return String(url).endsWith('/input_tokens')?json({input_tokens:100}):completion('Synthetic explanation');});
 assert.equal((await send()).statusCode,201);
 assert.deepEqual(calls,['https://api.openai.com/v1/responses/input_tokens','https://api.openai.com/v1/responses']);
});

test('inherited headers cannot replace the dedicated key or carry unrelated credentials',async t=>{
 env(t,{OPENAI_CUSTOM_HEADERS:'Authorization: Bearer synthetic-foreign-credential\nX-Unrelated-Secret: synthetic-foreign-secret',OPENAI_ORG_ID:'foreign-org',OPENAI_PROJECT_ID:'foreign-project',OPENAI_ADMIN_KEY:'synthetic-admin-key'});
 const calls=[];const {send}=await fixture(t,async(url,options)=>{calls.push(new Headers(options.headers));return String(url).endsWith('/input_tokens')?json({input_tokens:100}):completion('Synthetic explanation');});
 assert.equal((await send()).statusCode,201);assert.equal(calls.length,2);
 for(const outgoing of calls){assert.equal(outgoing.get('authorization'),'Bearer '+key);assert.equal(outgoing.get('x-unrelated-secret'),null);assert.equal(outgoing.get('openai-organization'),null);assert.equal(outgoing.get('openai-project'),null);}
});

test('inherited debug logging cannot expose requests, results or provider exceptions',async t=>{
 env(t,{OPENAI_LOG:'debug'});const logs=[];
 for(const method of ['log','debug','info','warn','error'])t.mock.method(console,method,(...args)=>logs.push(args));
 for(const fail of [false,true]){let calls=0;const{send}=await fixture(t,async url=>{calls++;return String(url).endsWith('/input_tokens')?json({input_tokens:100}):fail?new Response('synthetic-private-error',{status:500}):completion('synthetic-private-result');});
  const result=await send('Synthetic private instruction');assert.equal(result.statusCode,fail?502:201);assert.equal(calls,2);
  if(fail)assert.ok(!result.body.includes('synthetic-private-error'));
 }
 assert.equal(logs.length,0,'SDK logging must be disabled even with inherited debug settings');
});

test('quoted assignments and JSON credentials are refused before any AI transport',async t=>{
 let calls=0;const{send,storage,directory}=await fixture(t,async url=>{calls++;return String(url).endsWith('/input_tokens')?json({input_tokens:100}):completion('Synthetic explanation');});
 assert.equal((await send()).statusCode,201);assert.equal(calls,2);calls=0;
 const token='fixture'+'secretvalue12345';
 for(const text of [`password="${token}"`,JSON.stringify({password:token}),`api_key='${token}'`,JSON.stringify({access_token:token})]){
  const result=await send(text);assert.equal(result.statusCode,400);assert.ok(!result.body.includes(token));
 }
 assert.equal(calls,0);assert.equal(storage.proposals(ask.workflowId).length,1);assertNotRetained(directory,token);
});

test('quoted credentials cannot persist in manual drafts',async t=>{
 const token='fixture'+'secretvalue12345';
 const{app,storage,directory}=await fixture(t,async url=>String(url).endsWith('/input_tokens')?json({input_tokens:100}):completion(JSON.stringify({password:token})));
 const manual=await app.inject({method:'POST',url:'/api/proposals',headers,payload:{workflowId:ask.workflowId,stepId:ask.stepId,baseRevision:1,text:'Synthetic change',proposedRules:[`password="${token}"`],explanation:'Synthetic'}});
 assert.equal(manual.statusCode,400);assert.equal(storage.proposals(ask.workflowId).length,0);assertNotRetained(directory,token);
});

test('provider output refuses quoted JSON credentials after accounting for its charge',async t=>{
 const token='fixture'+'secretvalue12345';
 const{storage,send,directory}=await fixture(t,async url=>String(url).endsWith('/input_tokens')?json({input_tokens:100}):completion(JSON.stringify({password:token})));
 assert.equal((await send()).statusCode,502);assert.equal(storage.proposals(ask.workflowId).length,0);
 assert.equal(storage.budget.status().spentMicros,490);assertNotRetained(directory,token);
});

test('committed quoted JSON credentials are quarantined without retaining source content',t=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'sovrad-json-quarantine-'));
 const{repository}=prepareCalculator(directory,'fixture-reader');const storage=new Storage(path.join(directory,'records'));
 t.after(()=>{storage.close();rmSync(directory,{recursive:true,force:true});});
 const token='fixture'+'secretvalue12345';writeFileSync(path.join(repository.directory,'config.json'),JSON.stringify({password:token}));
 git(repository.directory,['add','config.json']);git(repository.directory,['-c','user.name=Synthetic','-c','user.email=fixture@example.invalid','commit','-m','Synthetic quoted fixture']);
 assert.throws(()=>storage.imports.capture({repository:repository.directory,commit:git(repository.directory,['rev-parse','HEAD']),files:['config.json']}),/quarantined/i);
 assert.equal(storage.imports.list().length,0);assertNotRetained(path.join(directory,'records'),token);
});

test('privacy helper accepts safe nested JSON and detects exact configured keys',()=>{
 assert.equal(containsPrivateContent({rules:['Accept whole numbers'],count:3,optional:null,enabled:true}),false);
 assert.equal(containsPrivateContent(key),false,'bare fixture key must not match a heuristic prefix');
 assert.equal(containsPrivateContent({nested:[{text:`Use ${key} here`}]},key),true);
 assert.equal(containsPrivateContent({password:'fixturesecretvalue12345'}),true);
 assert.equal(containsPrivateContent({nested:[escapedCredential('fixturesecretvalue12345')]}),true);
});

test('literal escaped AI input is refused before transport or retained records',async t=>{
 const token='escapedfixturevalue12345';let calls=0;
 const{send,storage,directory}=await fixture(t,async()=>{calls++;return json({input_tokens:100});});
 const result=await send(escapedCredential(token));assert.equal(result.statusCode,400);assert.equal(calls,0);
 assert.equal(storage.proposals(ask.workflowId).length,0);assertNotRetained(directory,token);assert.ok(!result.body.includes(token));
});

test('literal escaped manual input is refused before draft or audit storage',async t=>{
 const token='escapedfixturevalue12345';const{app,storage,directory}=await fixture(t,async()=>{throw new Error('Unexpected transport');});
 const result=await app.inject({method:'POST',url:'/api/proposals',headers,payload:{workflowId:ask.workflowId,stepId:ask.stepId,baseRevision:1,
  text:'Synthetic change',proposedRules:[escapedCredential(token)],explanation:'Synthetic'}});
 assert.equal(result.statusCode,400);assert.equal(storage.proposals(ask.workflowId).length,0);
 assertNotRetained(directory,token);assert.ok(!result.body.includes(token));
});

test('literal escaped provider output is refused after charge without draft or audit storage',async t=>{
 const token='escapedfixturevalue12345';let calls=0;
 const{send,storage,directory}=await fixture(t,async url=>{calls++;return String(url).endsWith('/input_tokens')?json({input_tokens:100}):completion(escapedCredential(token));});
 const result=await send();assert.equal(result.statusCode,502);assert.equal(calls,2);assert.equal(storage.budget.status().spentMicros,490);
 assert.equal(storage.proposals(ask.workflowId).length,0);assertNotRetained(directory,token);assert.ok(!result.body.includes(token));
});

for(const variant of ['bare configured key','literal escaped credential'])test(`${variant} in committed blob is quarantined without retained content`,async t=>{
 const token=variant==='bare configured key'?key:'escapedfixturevalue12345';
 const{storage,directory}=await fixture(t,async()=>{throw new Error('Unexpected transport');});
 const{repository}=prepareCalculator(directory,'fixture-reader');
 const content=variant==='bare configured key'?`Synthetic marker ${token}`:escapedCredential(token);
 assert.equal(containsPrivateContent(content),variant!=='bare configured key','bare-key case must depend on configured-key propagation');
 const selection=commitBlob(repository,content);
 assert.throws(()=>storage.imports.capture(selection),/quarantined/i);assert.equal(storage.imports.list().length,0);
 const db=new Database(path.join(directory,'sovrad.sqlite'),{readonly:true});
 try{assert.equal(db.prepare('SELECT count(*) AS n FROM import_quarantines').get().n,1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM audit_events').get().n,0);
 }finally{db.close();}
 assertNotRetained(directory,token);
 const safe=storage.imports.capture(commitBlob(repository,'Accept whole numbers only.'));
 assert.equal(safe.files[0].content,'Accept whole numbers only.');assert.equal(storage.imports.list().length,1);
 assertNotRetained(directory,token);
});

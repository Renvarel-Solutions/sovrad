import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough,Writable} from 'node:stream';
import * as runner from './index.ts';

test('stdio protocol matches request IDs and denies all coding/permission approvals',async()=>{
  const output=new PassThrough();
  const sent=[];
  const input=new Writable({write(chunk,_encoding,done){sent.push(JSON.parse(chunk));done();}});
  const client=runner.createProtocol({input,output,close(){}});
  try {
    const pending=client.call('initialize',{clientInfo:{name:'sovrad_preview',version:'0.1.0'}});
    output.write(JSON.stringify({id:sent[0].id,result:{userAgent:'synthetic'}})+'\n');
    assert.deepEqual(await pending,{userAgent:'synthetic'});
    for (const method of ['item/commandExecution/requestApproval','item/fileChange/requestApproval','item/permissions/requestApproval','unknown/request']) {
      output.write(JSON.stringify({id:method,method,params:{command:'forbidden'}})+'\n');
    }
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(sent.find(m=>m.id==='item/commandExecution/requestApproval').result.decision,'decline');
    assert.equal(sent.find(m=>m.id==='item/fileChange/requestApproval').result.decision,'decline');
    assert.deepEqual(sent.find(m=>m.id==='item/permissions/requestApproval').result.permissions,{});
    assert.ok(sent.find(m=>m.id==='unknown/request').error);
    await assert.rejects(()=>client.call('turn/start',{input:'forbidden'}),/disabled/i);
  } finally {client.close();}
});

test('malformed output closes stdio session without returning provider data',async()=>{
  const output=new PassThrough();
  let closed=false;
  const client=runner.createProtocol({input:new Writable({write(_c,_e,done){done();}}),output,close(){closed=true;}});
  const pending=client.call('initialize',{});
  output.write('not-json-private-provider-message\n');
  await assert.rejects(()=>pending,error=>!error.message.includes('private-provider-message'));
  assert.equal(closed,true);
});

for (const [label,character,fragmented] of [
  ['whole UTF-8 frame','\u00e9\u4e2d\u{1f680}',false],
  ['fragmented 2-byte UTF-8','\u00e9',true],
  ['fragmented 3-byte UTF-8','\u4e2d',true],
  ['fragmented 4-byte UTF-8','\u{1f680}',true],
]) {
  test(`stdio protocol preserves exact response values for ${label}`,async()=>{
    const output=new PassThrough();
    const sent=[];
    const input=new Writable({write(chunk,_encoding,done){sent.push(JSON.parse(chunk));done();}});
    const client=runner.createProtocol({input,output,close(){}});
    try {
      const pending=client.call('initialize',{});
      const expected={userAgent:'synthetic',codexHome:`C:/synthetic/${character}`,note:'quoted "value"\nnext line'};
      const frame=Buffer.from(JSON.stringify({id:sent[0].id,result:expected})+'\n','utf8');
      if (fragmented) {
        const start=frame.indexOf(Buffer.from(character,'utf8'));
        const width=Buffer.byteLength(character,'utf8');
        // Split inside every byte of the character, JSON tokens, and before the framing newline.
        const cuts=[1,start,...Array.from({length:width-1},(_,index)=>start+index+1),
          start+width,frame.length-2,frame.length-1,frame.length];
        let offset=0;
        for (const end of cuts) {output.write(frame.subarray(offset,end));offset=end;}
      } else output.write(frame);
      assert.deepEqual(await pending,expected);
    } finally {client.close();}
  });
}

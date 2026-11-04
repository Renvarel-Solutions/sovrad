import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {prepareCalculator,git,gitBytes} from '../../runner/src/repository.ts';
import {Storage} from './storage.ts';

function fixture(t) {
  const directory=mkdtempSync(path.join(os.tmpdir(),'sovrad-import-'));
  const {repository}=prepareCalculator(directory,'fictional-reader');
  const storage=new Storage(path.join(directory,'records'));
  t.after(()=>{storage.close();rmSync(directory,{recursive:true,force:true});});
  return {directory,repository,storage};
}

test('read-only import records exact committed blobs and provenance without changing source',t=>{
  const {repository,storage}=fixture(t);
  const before=readFileSync(path.join(repository.directory,'calculator.mjs'));
  const snapshot=storage.imports.capture({repository:repository.directory,commit:repository.baseCommit,files:['calculator.mjs']});
  assert.equal(snapshot.sourceCommit,repository.baseCommit);
  assert.equal(snapshot.readOnly,true);
  assert.equal(snapshot.executable,false);
  assert.equal(snapshot.files[0].path,'calculator.mjs');
  assert.equal(snapshot.files[0].category,'unknown');
  assert.equal(snapshot.files[0].sha256.length,64);
  assert.equal(snapshot.files[0].content,before.toString('utf8'));
  assert.deepEqual(readFileSync(path.join(repository.directory,'calculator.mjs')),before);
  assert.equal(git(repository.directory,['status','--porcelain']), '');
  assert.deepEqual(storage.imports.get(snapshot.id),snapshot);
});

for (const withBOM of [false,true]) {
  test(`import preserves exact committed UTF-8 bytes and SHA-256 ${withBOM?'with BOM':'without BOM'}`,t=>{
    const {repository,storage}=fixture(t);
    const text='Synthetic UTF-8 fixture: \u00e9 \u4e2d \u{1f680}\n';
    const original=Buffer.concat([withBOM?Buffer.from([0xef,0xbb,0xbf]):Buffer.alloc(0),Buffer.from(text,'utf8')]);
    const filename='unicode.txt';
    writeFileSync(path.join(repository.directory,filename),original);
    git(repository.directory,['add','--',filename]);
    git(repository.directory,['-c','user.name=Synthetic','-c','user.email=fixture@example.invalid','commit','-m','Synthetic UTF-8 fixture']);
    const commit=git(repository.directory,['rev-parse','HEAD']);
    const blobId=git(repository.directory,['rev-parse',`${commit}:${filename}`]);
    const committed=gitBytes(repository.directory,['cat-file','blob',blobId]);
    assert.deepEqual(committed,original);

    const snapshot=storage.imports.capture({repository:repository.directory,commit,files:[filename]});
    const expectedContent=(withBOM?'\ufeff':'')+text;
    const expectedHash=createHash('sha256').update(committed).digest('hex');
    assert.equal(snapshot.sourceCommit,commit);
    assert.equal(snapshot.files[0].gitBlob,blobId);
    assert.equal(snapshot.files[0].sha256,expectedHash);
    assert.equal(snapshot.files[0].content,expectedContent);
    assert.deepEqual(Buffer.from(snapshot.files[0].content,'utf8'),committed);
    assert.deepEqual(storage.imports.get(snapshot.id),snapshot);
    assert.deepEqual(readFileSync(path.join(repository.directory,filename)),original);
    assert.equal(git(repository.directory,['status','--porcelain']), '');
  });
}

test('import refuses path traversal, config, nonexistent commits, dirty source and credential-like blobs',t=>{
  const {repository,storage}=fixture(t);
  const base={repository:repository.directory,commit:repository.baseCommit,files:['calculator.mjs']};
  for (const files of [['../outside'],['.git/config'],['.env'],['/absolute'],['calculator.mjs:other']]) {
    assert.throws(()=>storage.imports.capture({...base,files}));
  }
  assert.throws(()=>storage.imports.capture({...base,commit:'0'.repeat(40)}));
  writeFileSync(path.join(repository.directory,'README.md'),'password='+'x'.repeat(30));
  assert.throws(()=>storage.imports.capture(base),/dirty|changed/i);
  git(repository.directory,['add','README.md']);
  git(repository.directory,['-c','user.name=Synthetic','-c','user.email=fixture@example.invalid','commit','-m','Synthetic secret-like fixture']);
  const commit=git(repository.directory,['rev-parse','HEAD']);
  assert.throws(()=>storage.imports.capture({...base,commit,files:['README.md']}),/quarantined/i);
  assert.equal(storage.imports.list().length,0);
});

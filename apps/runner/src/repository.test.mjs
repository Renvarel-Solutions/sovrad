import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareCalculator,prepareWorktree,identity,verifyRepository,git} from './repository.ts';

test('synthetic execution uses a genuine detached worktree with exact base and common directory', t=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'sovrad-worktree-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const {repository}=prepareCalculator(root,'fictional');
  const destination=path.join(root,'implementation','fictional','execution');
  const location=prepareWorktree(repository,destination);
  const actual=identity(location);
  assert.equal(actual.commonDirectory,repository.commonDirectory);
  assert.equal(actual.baseCommit,repository.baseCommit);
  assert.notEqual(actual.directory,repository.directory);
  assert.equal(git(location,['rev-parse','--abbrev-ref','HEAD']),'HEAD');
});

test('dirty or swapped repositories fail validation; edits in worktree leave baseline unchanged',t=>{
  const root=mkdtempSync(path.join(os.tmpdir(),'sovrad-worktree-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const {repository}=prepareCalculator(root,'fictional');
  const before=readFileSync(path.join(repository.directory,'calculator.mjs'),'utf8');
  const execution=prepareWorktree(repository,path.join(root,'implementation','fictional','execution'));
  writeFileSync(path.join(execution,'calculator.mjs'),'unapproved edit');
  assert.equal(readFileSync(path.join(repository.directory,'calculator.mjs'),'utf8'),before);
  verifyRepository(repository);
  writeFileSync(path.join(repository.directory,'unexpected.txt'),'dirty');
  assert.throws(()=>verifyRepository(repository),/changed/i);
});

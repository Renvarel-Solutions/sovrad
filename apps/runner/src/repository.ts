import {execFileSync} from 'node:child_process';
import {mkdirSync, realpathSync, writeFileSync, lstatSync} from 'node:fs';
import path from 'node:path';
import {digest} from './index.js';

const calculator = `export function calculate(a, operation, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Invalid number');
  if (operation === '+') return a + b;
  if (operation === '-') return a - b;
  if (operation === '*') return a * b;
  if (operation === '/' && b !== 0) return a / b;
  throw new Error('Invalid operation or zero divisor');
}
`;
export const acceptanceSuite = `import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {calculate} = await import(pathToFileURL(process.env.SOVRAD_CALCULATOR).href);
test('whole nonnegative first input', () => {
  assert.equal(calculate(0,'+',2),2);
  assert.throws(()=>calculate(1.5,'+',2));
  assert.throws(()=>calculate(-1,'+',2));
});
test('preserve other arithmetic', () => {
  assert.equal(calculate(3,'+',-1.5),1.5);
  assert.equal(calculate(3,'-',1.5),1.5);
  assert.equal(calculate(3,'*',1.5),4.5);
  assert.equal(calculate(3,'/',1.5),2);
  assert.throws(()=>calculate(3,'/',0));
  assert.throws(()=>calculate(NaN,'+',2));
});
`;
export type RepositoryIdentity = {directory: string; commonDirectory: string; baseCommit: string; id: string};
export function canonical(location: string): string { return realpathSync.native(location); }
function comparable(location: string): string {
  const result = canonical(location).replaceAll('\\','/');
  return process.platform === 'win32' ? result.toLowerCase() : result;
}
export function git(directory: string, args: string[]): string {
  return gitBytes(directory,args).toString('utf8').trim();
}
export function gitBytes(directory: string, args: string[]): Buffer {
  // No inherited Git hooks, credential helpers, fsmonitor, shell, global/system config or API key.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR)$/i.test(key)));
  return execFileSync('git', ['-c','core.hooksPath='+path.join(directory,'.disabled-hooks'),
    '-c','core.fsmonitor=false','-c','credential.helper=', ...args], {
    cwd: directory, timeout: 10000, maxBuffer: 2 * 1024 * 1024,
    windowsHide: true, env: {...env, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:process.platform==='win32'?'NUL':'/dev/null'},
    stdio: ['ignore','pipe','pipe'],
  });
}
export function identity(directory: string): RepositoryIdentity {
  directory = canonical(directory);
  if (comparable(git(directory,['rev-parse','--show-toplevel'])) !== comparable(directory)) throw new Error('Repository identity mismatch');
  const commonDirectory = canonical(git(directory,['rev-parse','--path-format=absolute','--git-common-dir']));
  const baseCommit = git(directory,['rev-parse','HEAD']);
  if (!/^[a-f0-9]{40}$/.test(baseCommit) || git(directory,['status','--porcelain','--untracked-files=all'])) throw new Error('Repository changed');
  return {directory,commonDirectory,baseCommit,id:digest(comparable(directory)+'\n'+comparable(commonDirectory))};
}
export function prepareCalculator(privateDirectory: string, taskId: string): {repository: RepositoryIdentity; acceptanceDigest: string} {
  const root = path.join(privateDirectory,'implementation',taskId);
  const repo = path.join(root,'source');
  mkdirSync(repo,{recursive:true,mode:0o700});
  const template = path.join(root,'empty-template');
  mkdirSync(template,{mode:0o700});
  git(repo,['init','--template='+template]);
  writeFileSync(path.join(repo,'calculator.mjs'),calculator,{mode:0o600});
  git(repo,['add','--','calculator.mjs']);
  git(repo,['-c','user.name=Sovrad synthetic fixture','-c','user.email=fixture@example.invalid','commit','-m','Synthetic calculator baseline']);
  const trusted = path.join(root,'trusted');
  mkdirSync(trusted,{mode:0o700});
  writeFileSync(path.join(trusted,'calculator.test.mjs'),acceptanceSuite,{mode:0o400});
  return {repository:identity(repo),acceptanceDigest:digest(acceptanceSuite)};
}
export function verifyRepository(expected: RepositoryIdentity): void {
  const actual = identity(expected.directory);
  if (actual.id !== expected.id || actual.baseCommit !== expected.baseCommit ||
    comparable(actual.commonDirectory)!==comparable(expected.commonDirectory)) throw new Error('Repository changed');
}
export function prepareWorktree(expected: RepositoryIdentity, destination: string): string {
  verifyRepository(expected);
  const parent = canonical(path.dirname(destination));
  if (lstatSync(path.dirname(destination)).isSymbolicLink() || comparable(parent)!==comparable(path.dirname(expected.directory)) ||
      path.basename(destination)!=='execution') throw new Error('Worktree destination refused');
  git(expected.directory,['worktree','add','--detach',destination,expected.baseCommit]);
  const actual = identity(destination);
  if (comparable(actual.commonDirectory)!==comparable(expected.commonDirectory) || actual.baseCommit!==expected.baseCommit ||
      comparable(actual.directory)===comparable(expected.directory)) throw new Error('Worktree verification failed');
  return actual.directory;
}

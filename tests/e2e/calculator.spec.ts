import {test, expect} from '@playwright/test';
import {spawn, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync, rmSync, mkdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';

const root = path.resolve(import.meta.dirname, '../..');
const directory = mkdtempSync(path.join(os.tmpdir(), 'sovrad-browser-'));
const inherited = ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'CI'];
const env = {
  ...Object.fromEntries(inherited.flatMap(key => process.env[key] ? [[key, process.env[key]]] : [])),
  SOVRAD_DATA_DIR: directory, SOVRAD_AI_ENABLED: 'false', OPENAI_API_KEY: '', WEB_PORT: '5175', API_PORT: '4319',
};
let api: ChildProcess;
let web: ChildProcess;
let logs = '';
function launch(args: string[]): ChildProcess {
  const child = spawn(process.execPath, args, {cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
  child.stdout?.on('data', data => { logs += String(data); });
  child.stderr?.on('data', data => { logs += String(data); });
  return child;
}
async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}
async function waitForURL(url: string): Promise<void> {
  await expect.poll(async () => {
    try { return (await fetch(url)).ok; } catch { return false; }
  }, {timeout: 20000, message: 'Test server did not start: ' + logs}).toBe(true);
}
async function assertPortAvailable(port: number): Promise<void> {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', () => reject(new Error('Scratch port ' + port + ' is unavailable. E2E will not stop an existing process.')));
    probe.listen(port, '127.0.0.1', () => probe.close(error => error ? reject(error) : resolve()));
  });
}
test.beforeAll(async () => {
  for (const port of [4319, 5175]) await assertPortAvailable(port);
  api = launch(['--import', 'tsx', 'apps/api/src/server.ts']);
  web = launch(['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts', 'apps/web']);
  await waitForURL('http://127.0.0.1:4319/api/health');
  await waitForURL('http://127.0.0.1:5175');
});
test.afterAll(async () => {
  await stop(web);
  await stop(api);
  rmSync(directory, {recursive: true, force: true});
});
test('select, propose, approve, reject and retain revision after API process restart', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('Sovrad by Renvarel');
  await expect(page.getByRole('heading', {name: 'First number', exact: true})).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
  await page.locator('.react-flow__node').filter({hasText: 'Second number'}).click();
  await expect(page.getByRole('heading', {name: 'Second number', exact: true})).toBeVisible();
  await expect(page.locator('.exception')).toContainText('division by zero');
  await page.locator('.react-flow__node').filter({hasText: 'First number'}).click();
  await page.getByLabel('What should change?').fill('Accept only whole numbers in this synthetic example');
  await page.getByLabel('Proposed rules (one per line)').fill('Accept only whole numbers.');
  await page.getByRole('button', {name: 'Save proposal for review'}).click();
  await expect(page.locator('.status-tag')).toHaveText('DRAFT');
  await expect(page.locator('.rev-pill')).toContainText('Revision 1');
  await page.getByRole('button', {name: 'Approve', exact: true}).click();
  await expect(page.locator('.rev-pill')).toContainText('Revision 2');
  await page.getByRole('button', {name: 'Rules & conditions', exact: true}).click();
  await expect(page.locator('.rules-list')).toContainText('Accept only whole numbers.');
  await page.getByLabel('What should change?').fill('Reject this synthetic suggestion');
  await page.getByLabel('Proposed rules (one per line)').fill('Accept any text.');
  await page.getByRole('button', {name: 'Save proposal for review'}).click();
  await page.getByRole('button', {name: 'Reject', exact: true}).click();
  await expect(page.locator('.status-tag.rejected')).toHaveText('REJECTED');
  await expect(page.locator('.rev-pill')).toContainText('Revision 2');
  const previousPID = api.pid;
  await stop(api);
  await expect.poll(async () => { try { await fetch('http://127.0.0.1:4319/api/health'); return true; } catch { return false; } }).toBe(false);
  api = launch(['--import', 'tsx', 'apps/api/src/server.ts']);
  await waitForURL('http://127.0.0.1:4319/api/health');
  expect(api.pid).not.toBe(previousPID);
  await page.reload();
  await expect(page.locator('.rev-pill')).toContainText('Revision 2');
  await expect(page.locator('.rules-list')).toContainText('Accept only whole numbers.');
  await expect(page.getByRole('button', {name: 'Ask AI to draft rules'})).toBeDisabled();
  await page.getByRole('button', {name: /Proposals/}).click();
  await expect(page.locator('.status-tag.approved')).toHaveText('APPROVED');
  await expect(page.locator('.status-tag.rejected')).toHaveText('REJECTED');
  expect(errors).toEqual([]);
  mkdirSync(path.join(root, 'outputs'), {recursive: true});
  await page.screenshot({path: path.join(root, 'outputs', 'sovrad-calculator.png'), fullPage: true});
});
test('narrow layout can edit a workflow without horizontal page overflow', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'First number', exact: true})).toBeVisible();
  await page.getByLabel('What should change?').scrollIntoViewIfNeeded();
  await expect(page.getByLabel('What should change?')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('AI consent resets when the selected step changes', async ({page}) => {
  await page.goto('/');
  const consent = page.getByRole('checkbox', {name: 'I approve sending these selected details to OpenAI.'});
  await consent.check();
  await expect(consent).toBeChecked();
  await page.locator('.react-flow__node').filter({hasText: 'Second number'}).click();
  await expect(page.getByRole('heading', {name: 'Second number', exact: true})).toBeVisible();
  await expect(consent).not.toBeChecked();
});

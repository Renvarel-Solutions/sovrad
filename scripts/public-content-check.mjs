import {readdirSync, readFileSync, lstatSync, realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const generated = new Set(['.git', 'node_modules', 'dist', 'work', 'outputs', 'coverage', 'test-results', 'playwright-report']);
const roots = new Set(['apps', 'packages', 'scripts', 'docs', 'tests', '.github']);
const rootFiles = new Set(['.gitignore', '.env.example', 'package.json', 'package-lock.json', 'playwright.config.ts',
  'README.md', 'AGENTS.md', 'LICENSE', 'CONTRIBUTING.md', 'SECURITY.md', 'CODE_OF_CONDUCT.md', 'PLAN.md', 'TODO.md', 'DECISIONS.md']);
const privateName = /^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|local\.properties|id_rsa|project-data|local-projects|workspaces|backups|exports|\.private(?:-.*)?)$|\.(?:sqlite(?:-.*)?|db(?:-.*)?|pem|key|jks|keystore|p12|pfx|log|csv|zip)$/i;
const secret = /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|\d{6,}:[A-Za-z0-9_-]{25,})\b/;

export function checkPublicFiles(root) {
  root = realpathSync.native(root);
  const violations = [];
  let candidates;
  let git = false;
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
    if (top.replaceAll('\\', '/').toLowerCase() === root.replaceAll('\\', '/').toLowerCase()) {
      candidates = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
      git = true;
    }
  } catch { /* Extracted archives have no Git index. */ }
  if (!candidates) {
    candidates = [];
    function walk(folder) {
      for (const item of readdirSync(folder)) {
        if (generated.has(item)) continue;
        const file = path.join(folder, item);
        if (lstatSync(file).isDirectory()) walk(file);
        else candidates.push(path.relative(root, file).replaceAll('\\', '/'));
      }
    }
    walk(root);
  }
  for (const rel of new Set(candidates)) {
    const parts = rel.replaceAll('\\', '/').split('/');
    if ((parts.length === 1 && !rootFiles.has(rel)) || (parts.length > 1 && !roots.has(parts[0]))) violations.push('Unapproved publication path: ' + rel);
    if (parts.some(part => privateName.test(part) && part !== '.env.example') || parts.some(part => generated.has(part))) violations.push('Private/generated publication path: ' + rel);
    let stat;
    try { stat = lstatSync(path.join(root, rel)); } catch { violations.push('Missing publication file: ' + rel); continue; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) {
      violations.push('Unsupported publication file: ' + rel);
      continue;
    }
    if (secret.test(readFileSync(path.join(root, rel), 'utf8'))) violations.push('Potential credential: ' + rel);
    if (git) {
      let staged;
      try { staged = execFileSync('git', ['show', ':' + rel], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}); } catch { /* Untracked file. */ }
      if (staged && secret.test(staged)) violations.push('Potential staged credential: ' + rel);
    }
  }
  return {files: candidates.length, violations};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkPublicFiles(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  if (result.violations.length) {
    result.violations.forEach(message => console.error(message));
    process.exitCode = 1;
  } else console.log('Publication scan passed for ' + result.files + ' files (heuristic; manual review still required).');
}

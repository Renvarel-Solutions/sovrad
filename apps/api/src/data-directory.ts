import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const SOURCE_ROOT = path.resolve(import.meta.dirname, '../../..');

// Resolve existing ancestors too: a not-yet-created directory can be below a
// junction that points into the public source checkout.
function canonicalPath(input: string): string {
  let ancestor = path.resolve(input);
  const missing: string[] = [];
  while (!existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error('Data directory has no existing ancestor');
    missing.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  return path.resolve(realpathSync.native(ancestor), ...missing);
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

export function validateDataDirectory(input: string, sourceRoot = SOURCE_ROOT): string {
  if (!path.isAbsolute(input)) throw new Error('Private data directory must be an absolute path');
  const directory = canonicalPath(input);
  const source = canonicalPath(sourceRoot);
  if (contains(source, directory) || contains(directory, source)) {
    throw new Error('Private data directory must be outside the public application repository and its ancestors');
  }
  return directory;
}

export function dataDirectory(): string {
  const base = process.env.LOCALAPPDATA || path.join(homedir(), '.local', 'share');
  return validateDataDirectory(process.env.SOVRAD_DATA_DIR || path.join(base, 'Renvarel', 'Sovrad'));
}

import {createHash,randomUUID} from 'node:crypto';
import type Database from 'better-sqlite3';
import {identity,git,gitBytes} from '../../runner/src/repository.js';
import {containsPrivateContent} from './privacy.js';
export type Snapshot = {
  id: string; sourceCommit: string; repositoryId: string; capturedAt: string;
  readOnly: true; executable: false;
  files: {path: string; sha256: string; gitBlob: string; content: string; category: 'documented'|'unknown'}[];
};
type Selection = {repository: string; commit: string; files: string[]};

function validateSelection(input: Selection): void {
  if (!/^[a-f0-9]{40}$/.test(input.commit) || input.files.length<1 || input.files.length>100 ||
      new Set(input.files).size!==input.files.length) throw new Error('Invalid snapshot selection');
  for (const file of input.files) {
    if (!/^[A-Za-z0-9_-][A-Za-z0-9_./-]*\.(md|txt|ts|tsx|js|jsx|mjs|json|kt|dart|py|html|css)$/.test(file) ||
      file.split('/').some(part=>part==='..'||part==='.'||!part) || /(^|\/)(\.git|node_modules|vendor|dist|credentials?|secrets?)(\/|\.)/i.test(file) ||
      /(^|\/)(package-lock|pnpm-lock|yarn.lock|local.properties)/i.test(file)) throw new Error('Invalid snapshot path');
  }
}

export class ImportStore {
  private readonly protectedSecrets = new Set<string>();
  constructor(private readonly db: Database.Database) {}
  protectSecret(secret?: string): void {
    if (secret) this.protectedSecrets.add(secret);
  }
  list(): Snapshot[] {
    return (this.db.prepare('SELECT payload FROM imported_snapshots ORDER BY rowid DESC').all() as {payload:string}[])
      .map(row=>JSON.parse(row.payload) as Snapshot);
  }
  get(id: string): Snapshot {
    const row=this.db.prepare('SELECT payload FROM imported_snapshots WHERE id=?').get(id) as {payload:string}|undefined;
    if (!row) throw new Error('Snapshot not found');
    return JSON.parse(row.payload) as Snapshot;
  }
  capture(input: Selection): Snapshot {
    validateSelection(input);
    const repository=identity(input.repository);
    if (git(repository.directory,['cat-file','-t',input.commit])!=='commit') throw new Error('Commit required');
    const files: Snapshot['files']=[];
    let total=0;
    for (const filename of input.files) {
      const entry=gitBytes(repository.directory,['ls-tree','-z',input.commit,'--',filename]).toString('utf8');
      const match=/^(100644|100755) blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(entry);
      if (!match || match[3]!==filename) throw new Error('Non-regular committed file refused');
      const size=Number(git(repository.directory,['cat-file','-s',match[2]]));
      total+=size;
      if (!Number.isSafeInteger(size)||size>256*1024||total>1024*1024) throw new Error('Snapshot size exceeded');
      const blob=gitBytes(repository.directory,['cat-file','blob',match[2]]);
      const sha256=createHash('sha256').update(blob).digest('hex');
      const content=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(blob);
      if (content.includes('\0')) throw new Error('Binary content refused');
      if (containsPrivateContent(content) || [...this.protectedSecrets].some(secret=>containsPrivateContent(content, secret))) {
        this.db.prepare('INSERT INTO import_quarantines(id,time,file_hash,reason) VALUES (?,?,?,?)')
          .run(randomUUID(),new Date().toISOString(),sha256,'Credential-like blob refused; content not retained');
        throw new Error('Credential-like input quarantined');
      }
      files.push({path:filename,gitBlob:match[2],sha256,content,
        category:filename.endsWith('.md')?'documented':'unknown'});
    }
    const snapshot: Snapshot={id:randomUUID(),sourceCommit:input.commit,repositoryId:repository.id,
      capturedAt:new Date().toISOString(),readOnly:true,executable:false,files};
    this.db.prepare('INSERT INTO imported_snapshots(id,payload) VALUES (?,?)').run(snapshot.id,JSON.stringify(snapshot));
    return snapshot;
  }
}

import {createHash} from 'node:crypto';
export {createProtocol} from './protocol.js';
export type TaskState = 'awaiting_approval' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted';
export type Manifest = {
  workflowId: string; specRevision: number; specDigest: string; specReceiptId: string;
  repositoryId: string; baseCommit: string; allowedFiles: string[];
  acceptanceSuite: 'calculator-v1'; acceptanceDigest: string; maxSeconds: 600;
};
export type ImplementationTask = {
  id: string; manifest: Manifest; manifestDigest: string; state: TaskState;
  approval: {id: string; manifestDigest: string; actor: 'delegated-review'; time: string} | null;
  findings: string[]; diff: string | null; tests: {name: string; passed: boolean}[];
};
export type TaskEvent = {sequence: number; kind: string; time: string; detail: string};
export const digest = (text: string): string => createHash('sha256').update(text).digest('hex');
export const CODEX_VERSION = '0.166.0-alpha.5.1';

export function isolationPreflight(): {ready: false; findings: string[]} {
  // TODO: implement a native boundary and adversarial probes before enabling turns.
  // Worktree separation and workspace-write alone do not deny credential reads or loopback access.
  return {ready: false, findings: [
    'Native isolation is not verified: unrelated credential reads must be denied.',
    'Original-checkout writes, control-API access and network expansion must be denied.',
    'Coding stays disabled until native probes pass; approvals cannot override this gate.',
  ]};
}

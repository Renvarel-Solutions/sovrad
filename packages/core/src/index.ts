/** Public-safe, synthetic workflow model. No customer or client data is bundled. */
export type StepKind = 'input' | 'decision' | 'process' | 'output';
export type Step = {
  id: string;
  title: string;
  purpose: string;
  kind: StepKind;
  rules: string[];
  errorBehavior: string;
  position: {x: number; y: number};
};
export type Connection = {id: string; source: string; target: string; label?: string};
export type Workflow = {
  id: string;
  projectId: string;
  name: string;
  description: string;
  revision: number;
  steps: Step[];
  connections: Connection[];
};
export type Project = {id: string; name: string; description: string; visibility: 'local-private'};
export type ProposalStatus = 'draft' | 'approved' | 'rejected';
export type Proposal = {
  id: string;
  workflowId: string;
  stepId: string;
  baseRevision: number;
  text: string;
  proposedRules: string[];
  explanation: string;
  provenance: 'manual' | 'openai-api';
  status: ProposalStatus;
  createdAt: string;
};
export const CALCULATOR_PROJECT: Project = {
  id: 'sample-calculator', name: 'Calculator (sample)',
  description: 'Fictional example — safe to include in public software.',
  visibility: 'local-private'
};
export const CALCULATOR_WORKFLOW: Workflow = {
  id: 'sample-calculator-arithmetic', projectId: CALCULATOR_PROJECT.id,
  name: 'Basic arithmetic', description: 'User enters two numbers and chooses an operation.',
  revision: 1,
  steps: [
    {id:'number-a',title:'First number',purpose:'Collect the first numeric value.',kind:'input', position:{x:40,y:160},rules:['Accept finite decimal numbers and negative numbers.','Reject letters, invalid symbols and empty input.'],errorBehavior:'Explain the invalid value without deleting the user input.'},
    {id:'operator',title:'Choose operation',purpose:'Choose what calculation to perform.',kind:'decision',position:{x:320,y:160},rules:['Allow addition (+).','Allow subtraction (−).','Allow multiplication (×).','Allow division (÷).'],errorBehavior:'Require a valid operation before calculating.'},
    {id:'number-b',title:'Second number',purpose:'Collect the other numeric value.',kind:'input',position:{x:600,y:160},rules:['Apply the same numeric validation as for the first number.','Zero is allowed except as a divisor.'],errorBehavior:'For division by zero, show an error instead of a number.'},
    {id:'calculate',title:'Calculate',purpose:'Evaluate the selected operation after confirmation.',kind:'process',position:{x:880,y:160},rules:['Use both validated numbers and the selected operation.','Do not calculate if required information is missing.'],errorBehavior:'Show a clear error without crashing.'},
    {id:'result',title:'Show result',purpose:'Present the calculated value on the screen.',kind:'output',position:{x:1160,y:160},rules:['Display the result in readable number formatting.','Allow another calculation.'],errorBehavior:'Do not show an invalid calculation as successful.'}
  ],
  connections: [
    {id:'a-op',source:'number-a',target:'operator'},
    {id:'op-b',source:'operator',target:'number-b'},
    {id:'b-calc',source:'number-b',target:'calculate'},
    {id:'calc-result',source:'calculate',target:'result'}
  ]
};
export function assertValidWorkflow(workflow: Workflow): void {
  if (!workflow.id || !workflow.projectId || workflow.revision < 1) throw new Error('Invalid workflow identity');
  const ids = new Set<string>();
  for (const step of workflow.steps) {
    if (!step.id || ids.has(step.id)) throw new Error('Invalid or repeated step identifier');
    ids.add(step.id);
    if (!step.title.trim() || !Array.isArray(step.rules) || step.rules.some(r => !r.trim())) throw new Error('Invalid step rules');
    if (!Number.isFinite(step.position.x) || !Number.isFinite(step.position.y)) throw new Error('Invalid layout position');
  }
  for (const edge of workflow.connections) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error('Broken workflow connection');
  }
}
/** Only approves a proposal against the exact revision it was written for. */
export function applyApprovedProposal(workflow: Workflow, proposal: Proposal): Workflow {
  if (proposal.status !== 'draft') throw new Error('Proposal has already been resolved');
  if (workflow.id !== proposal.workflowId) throw new Error('Workflow identity mismatch');
  if (workflow.revision !== proposal.baseRevision) throw new Error('Stale proposal: review latest workflow first');
  const step = workflow.steps.find(s => s.id === proposal.stepId);
  if (!step) throw new Error('Selected step no longer exists');
  if (proposal.proposedRules.length < 1 || proposal.proposedRules.some(s => !s.trim())) throw new Error('Invalid proposed rules');
  const changed: Workflow = {...workflow,revision:workflow.revision+1,steps:workflow.steps.map(s=>s.id===proposal.stepId?{...s,rules:[...proposal.proposedRules]}:s)};
  assertValidWorkflow(changed);
  return changed;
}

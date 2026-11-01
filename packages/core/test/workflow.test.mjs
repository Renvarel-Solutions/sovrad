import test from 'node:test';
import assert from 'node:assert/strict';
import {CALCULATOR_WORKFLOW,assertValidWorkflow,applyApprovedProposal} from '../src/index.ts';
const proposed = {id:'p1',workflowId:CALCULATOR_WORKFLOW.id,stepId:'number-a',baseRevision:1,text:'Only whole numbers',proposedRules:['Accept only whole numbers.'],explanation:'Manual requirement',provenance:'manual',status:'draft',createdAt:'2026-01-01T00:00:00Z'};
test('synthetic calculator is structurally valid',()=>assert.doesNotThrow(()=>assertValidWorkflow(CALCULATOR_WORKFLOW)));
test('approval updates only the selected step and increments revision',()=>{
  const updated=applyApprovedProposal(CALCULATOR_WORKFLOW,proposed);
  assert.equal(updated.revision,2);
  assert.deepEqual(updated.steps[0].rules,['Accept only whole numbers.']);
  assert.deepEqual(updated.steps[1],CALCULATOR_WORKFLOW.steps[1]);
  assert.equal(CALCULATOR_WORKFLOW.revision,1);
});
test('stale proposals cannot overwrite newer work',()=>assert.throws(()=>applyApprovedProposal({...CALCULATOR_WORKFLOW,revision:2},proposed),/Stale proposal/));
test('previously approved proposals cannot be approved twice',()=>assert.throws(()=>applyApprovedProposal(CALCULATOR_WORKFLOW,{...proposed,status:'approved'}),/already been resolved/));
test('cross-project proposals are rejected',()=>assert.throws(()=>applyApprovedProposal({...CALCULATOR_WORKFLOW,id:'different'},proposed),/mismatch/));
test('connections to missing steps are invalid',()=>assert.throws(()=>assertValidWorkflow({...CALCULATOR_WORKFLOW,connections:[{id:'x',source:'number-a',target:'unknown'}]}),/Broken workflow/));
test('invalid rules are not accepted',()=>assert.throws(()=>applyApprovedProposal(CALCULATOR_WORKFLOW,{...proposed,proposedRules:['']}),/Invalid proposed rules/));

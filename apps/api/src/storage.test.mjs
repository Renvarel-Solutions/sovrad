import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Runs when npm dependencies are installed; TS executes with Node's built-in strip-types support.
import {Storage} from './storage.ts';
test('saved workflows survive reopening and an approved proposal is auditable',()=>{
  const temp=mkdtempSync(path.join(os.tmpdir(),'architect-test-'));
  try{
    let db=new Storage(temp);
    const original=db.workflow('sample-calculator-arithmetic');
    assert.ok(original);
    const proposal=db.propose({workflowId:original.id,stepId:'number-a',baseRevision:1,text:'Allow whole numbers only',proposedRules:['Accept only whole numbers.'],explanation:'User decision',provenance:'manual'});
    const approved=db.decide(proposal.id,'approve');
    assert.equal(approved.workflow.revision,2);
    assert.equal(approved.proposal.status,'approved');
    db.close();
    db=new Storage(temp);
    assert.equal(db.workflow(original.id)?.revision,2);
    assert.equal(db.proposals(original.id)[0].status,'approved');
    assert.throws(()=>db.decide(proposal.id,'approve'),/already resolved/);
    db.close();
  }finally{rmSync(temp,{recursive:true,force:true});}
});

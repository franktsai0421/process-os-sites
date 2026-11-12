const test=require('node:test'),assert=require('node:assert/strict');
const prepare=require('../scripts/prepare-routine-fqc-page.cjs');
const fixture=require('../scripts/test-routine-whole-page.cjs').fixture;
const load=require('../scripts/ipqc-ab-import-harness.cjs')(),domain=load('lib/routine-fqc.ts');
const actor={id:'synthetic',name:'Synthetic',admin:true},context={actor,at:'2026-11-12T00:00:00Z',today:'2026-11-12',allowed:()=>true,create:true,delete:true,revise:true,revoke:true,settings:true};
void test('offline preparation preserves original document IDs, working input and old receipts without forging a Save',()=>{
 const root=fixture().root;delete root.page;delete root.pageDraftLayout;
 const id=domain.executeRoutine(root,{action:'create-plan',operationId:crypto.randomUUID(),expectedRevision:root.revision,jobIds:['job-a']},[],context).documentId;
 const old=JSON.stringify(root),candidate=prepare(root);
 assert.equal(JSON.stringify(root),old);assert.equal(JSON.stringify(candidate.documents),JSON.stringify(root.documents));assert.equal(JSON.stringify(candidate.receipts),JSON.stringify(root.receipts));
 assert.equal(candidate.page.workflow.working.documents[0].id,id);assert.equal(candidate.page.workflow.saved,null);assert.equal(candidate.page.workflow.saves.length,0);assert.equal(candidate.page.workflow.cases.length,0);assert.equal(candidate.page.baseline.content.documents.length,0);
 assert.throws(()=>prepare(candidate),/ALREADY_PREPARED/);
 root.documents[0].flow.pendingId='synthetic-pending';assert.throws(()=>prepare(root),/PENDING_REVIEW/);
});

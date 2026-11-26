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

function approvedLegacyFixture(){
 const f=fixture(),root=f.root;delete root.page;delete root.pageDraftLayout;
 const reviewer={...context,actor:{id:'synthetic-reviewer',name:'Synthetic reviewer',admin:false}};
 const run=(action,extra={},ctx=context)=>domain.executeRoutine(root,{action,operationId:crypto.randomUUID(),expectedRevision:root.revision,...extra},[],ctx);
 const id=run('create-plan',{jobIds:['job-a']}).documentId,doc=root.documents.find(row=>row.id===id);let sequence=0;
 const draft=(action,extra={},ctx=context)=>{const operationId=crypto.randomUUID();return run('draft',{documentId:id,operationId,command:{action,operationId,clientId:'legacy-rehearsal',sequence:++sequence,generation:doc.flow.generation,expectedRevision:doc.flow.revision,...extra}},ctx);};
 draft('save');draft('submit',{savedId:doc.flow.saved.id});draft('approve',{caseId:doc.flow.pendingId},reviewer);
 return {root,doc,id};
}
void test('approved legacy rehearsal retains immutable history/receipts and permits only a new explicit page Save',()=>{
 const {root,doc,id}=approvedLegacyFixture();
 const original=JSON.stringify(root),archive=JSON.stringify(root.documents),receipts=JSON.stringify(root.receipts);
 const prepared=prepare(root);assert.equal(JSON.stringify(root),original);
 assert.equal(JSON.stringify(prepared.documents),archive);assert.equal(JSON.stringify(prepared.receipts),receipts);
 assert.equal(prepared.page.baseline.content.documents[0].id,id);
 assert.deepEqual(prepared.page.baseline.content.documents[0].content,JSON.parse(JSON.stringify(doc.flow.active.content)));
 assert.equal(prepared.page.workflow.saved,null);assert.equal(prepared.page.workflow.saves.length,0);assert.equal(prepared.page.workflow.cases.length,0);
 const api=load('lib/routine-fqc-page.ts'),row=prepared.page.workflow.working.documents.find(value=>value.id===id),path=['documents',{id},'content','notes'];
 const batch={patches:[{op:'set',path,value:'Synthetic isolated post-preparation edit'}],guards:[{path,value:row.content.notes}]};
 const command={action:'save',moduleAction:'save-page-v1',operationId:crypto.randomUUID(),clientId:'isolated-page-rehearsal',sequence:1,generation:prepared.page.workflow.generation,expectedRevision:prepared.page.workflow.revision,patches:batch.patches,input:{creates:[],batches:[batch],cancels:[]}};
 const before=JSON.stringify(prepared);
 assert.throws(()=>api.executeRoutinePage(prepared,command,context),error=>error.code==='FORMAL_DOCUMENT_IMMUTABLE');
 assert.equal(JSON.stringify(prepared),before,'preparation never permits overwriting an approved document');
 const newId=crypto.randomUUID(),create={...command,operationId:crypto.randomUUID(),patches:[],input:{creates:[{id:newId,type:'plan',jobIds:['job-b']}],batches:[],cancels:[]}};
 const saved=api.executeRoutinePage(prepared,create,context);
 assert.equal(JSON.stringify(prepared),before,'explicit Save stages on its own candidate');
 assert.equal(saved.root.page.workflow.saves.length,1);assert.equal(saved.root.page.workflow.pendingId,null);
 assert.deepEqual(JSON.parse(JSON.stringify(saved.root.page.workflow.saved.content.documents.find(value=>value.id===id))),JSON.parse(JSON.stringify(prepared.page.baseline.content.documents[0])));
 assert.equal(saved.root.page.workflow.saved.content.documents.find(value=>value.id===newId).id,newId);
 assert.equal(JSON.stringify(saved.root.documents),archive,'old approved document flow and full history are immutable');
 for(const [key,value] of Object.entries(JSON.parse(receipts)))assert.deepEqual(JSON.parse(JSON.stringify(saved.root.receipts[key])),value);
 const replay=api.executeRoutinePage(saved.root,create,context);assert.equal(replay.replayed,true);assert.equal(JSON.stringify(replay.root),JSON.stringify(saved.root));
 assert.throws(()=>prepare(saved.root),/ALREADY_PREPARED/);
 const pending=JSON.parse(original);pending.documents[0].flow.cases.push({...pending.documents[0].flow.cases[0],id:crypto.randomUUID(),status:'pending'});
 assert.throws(()=>prepare(pending),/PENDING_REVIEW/);
});

for(const record of [false,true])void test(`isolated prepared legacy data reaches actual page route without rewriting history: ${record?'records':'inline'}`,async t=>{
 const h=await require('../scripts/test-routine-whole-page-route.cjs')(record);t.after(()=>h.close());
 const {root,id}=approvedLegacyFixture(),prepared=prepare(root),archive=JSON.stringify(root.documents),receipts=JSON.stringify(root.receipts);
 const state=await h.core.readState();await h.install({...state.values,routineFqcControl:JSON.stringify(prepared)},state.revision+1);
 const row=()=>({...h.db.prepare('SELECT * FROM shared_state WHERE id=1').get()}),before=row(),counts=h.metrics();
 const view=await h.read();assert.equal(view.control.workflow.saved,null);assert.equal(view.control.workflow.pendingId,null);
 assert.deepEqual(row(),before,'GET never adopts or rewrites a layout');assert.deepEqual(h.metrics(),counts);
 const newId=crypto.randomUUID(),cmd=await h.save([{id:newId,type:'plan',jobIds:['job-b']}]),ack=await h.accepted(cmd),saved=await h.stored();
 assert.equal(saved.page.workflow.saved.content.documents.find(value=>value.id===id).id,id);
 assert.equal(saved.page.workflow.saved.content.documents.find(value=>value.id===newId).id,newId);
 assert.equal(saved.page.workflow.pendingId,null);assert.equal(saved.page.workflow.saves.length,1);
 assert.equal(JSON.stringify(saved.documents),archive);
 for(const [key,value] of Object.entries(JSON.parse(receipts)))assert.deepEqual(saved.receipts[key],value);
 const published=row(),acceptedCounts=h.metrics();assert.deepEqual((await h.accepted(cmd)).receipt,ack.receipt);
 assert.deepEqual(row(),published);assert.deepEqual(h.metrics(),acceptedCounts,'known successful receipt replay adds no writes');
});

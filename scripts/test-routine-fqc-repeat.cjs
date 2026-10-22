/* oxlint-disable typescript/no-require-imports -- Existing isolated production-kernel harness. */
const assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const m=require('./ipqc-ab-import-harness.cjs')()('lib/routine-fqc.ts');
const id=()=>webcrypto.randomUUID(),copy=x=>structuredClone(x),actor={id:'fixture',name:'Fixture',admin:true};
let c=m.emptyRoutine(),tick=0,seq=0;
const source={id:'fixture',name:'Fixture check',line:'A',category:'Fixture',code:'TEST',errorCode:'TEST',frequency:'monthly',frequencyText:'Monthly',versionId:'v1',version:'1',description:'Fixture',products:[{code:'A',name:'Original sample'},{code:'B',name:'Other sample'}]};
const ctx=()=>({actor,at:new Date(1791800000000+tick++*1000).toISOString(),today:'2026-10-12',allowed:()=>true,settings:true,revoke:true,revise:true});
function run(cmd){const next=copy(c),result=m.executeRoutine(next,{operationId:id(),expectedRevision:c.revision,...cmd},[source],ctx());c=next;return result;}
const doc=key=>c.documents.find(d=>d.id===key);
function draft(key,action,extra={}){const d=doc(key),operationId=id();return run({action:'draft',documentId:key,operationId,command:{action,operationId,generation:d.flow.generation,clientId:'sample-policy',sequence:++seq,...extra}});}
function approve(key){draft(key,'save',{expectedRevision:doc(key).flow.revision});draft(key,'submit',{savedId:doc(key).flow.saved.id,reason:''});draft(key,'approve',{caseId:doc(key).flow.pendingId,selfReviewConfirmed:true});}
const result=(outcome,sample='A')=>({id:id(),samples:[sample],outcome,value:outcome==='pass'?'12 mm':'',notes:outcome==='pass'?'':'Recorded issue',photos:outcome==='pass'?[]:['a'.repeat(64)]});
function setRows(key,rows){const line=doc(key).flow.working.lines[0],path=['lines',{id:line.id},'results'];draft(key,'apply',{patches:[{op:'set',path,value:rows}],guards:[{path,value:line.results}]});}
run({action:'configure',startDate:'2026-10-12'});run({action:'generate'});
const job=c.jobs[0],plan=run({action:'create-plan',jobIds:[job.id]}).documentId;approve(plan);
const first=run({action:'create-report',documentId:plan}).documentId;assert.match(doc(first).number,/^FQC-RPT-/);
let before=JSON.stringify(c);
assert.throws(()=>setRows(first,[{...result('pass'),samples:['A','B']}]),e=>e.code==='SINGLE_SAMPLE_REQUIRED');assert.equal(JSON.stringify(c),before);
assert.throws(()=>setRows(first,[result('fail'),result('pass')]),e=>e.code==='SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE');assert.equal(JSON.stringify(c),before);
setRows(first,[result('fail'),result('pass','B')]);approve(first);
const caseId=c.cases[0].id,original=copy(doc(first).flow.active.content);
assert.deepEqual(Array.from(c.cases[0].requiredSamples),['A']);
const rt=run({action:'followup',caseId,kind:'report',notes:'Repair original samples'}).documentId;
assert.match(doc(rt).number,/^FQC-RTS-/);assert.equal(doc(rt).flow.working.lines[0].results.length,1);
assert.deepEqual(Array.from(doc(rt).flow.working.lines[0].results,r=>Array.from(r.samples)),[['A']]);assert.ok(doc(rt).flow.working.lines[0].results.every(r=>!r.outcome&&!r.value&&!r.photos.length));
assert.throws(()=>setRows(rt,[result('pass','B')]),e=>e.code==='RETEST_SAMPLE_FIXED');
const fixedLine=doc(rt).flow.working.lines[0];delete fixedLine.requiredSamples;assert.throws(()=>setRows(rt,[result('pass','B')]),e=>e.code==='RETEST_SAMPLE_FIXED');doc(rt).flow.working.lines[0].requiredSamples=['A'];
before=JSON.stringify(c);assert.throws(()=>setRows(rt,[result('pass','OUTSIDE')]),e=>e.code==='SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE');assert.equal(JSON.stringify(c),before);
assert.throws(()=>setRows(rt,[result('pass'),result('pass')]),e=>e.code==='SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE');
const requiredPath=['lines',{id:doc(rt).flow.working.lines[0].id},'requiredSamples'];
assert.throws(()=>draft(rt,'apply',{patches:[{op:'set',path:requiredPath,value:[]}],guards:[{path:requiredPath,value:['A']}]}),e=>e.code==='PATCH_NOT_ALLOWED');
setRows(rt,[{...result('fail'),photos:[]}]);draft(rt,'save',{expectedRevision:doc(rt).flow.revision});
assert.throws(()=>draft(rt,'submit',{savedId:doc(rt).flow.saved.id,reason:''}),e=>/VALIDATION/.test(e.code));assert.equal(doc(rt).flow.pendingId,null);
setRows(rt,[result('fail')]);approve(rt);assert.equal(c.cases[0].status,'open');
const rt2=run({action:'followup',caseId,kind:'report',notes:'Second authorized repair'}).documentId;
setRows(rt2,[result('pass')]);approve(rt2);assert.equal(c.cases[0].status,'ready-close');
assert.deepEqual(copy(doc(first).flow.active.content),original);
run({action:'close',caseId,reason:'Explicit closure'});assert.equal(c.cases[0].status,'closed');
assert.throws(()=>draft(first,'apply',{patches:[],guards:[]}),e=>e.code==='FORMAL_DOCUMENT_IMMUTABLE');
// Legacy selections remain unchanged when another field is saved; new submissions expose blockers.
const legacy=copy(original);legacy.lines[0].results=[{...result('fail'),samples:['A','B']},{...result('pass'),samples:['A']}];
const legacyEdit=copy(legacy);legacyEdit.notes='Unrelated draft edit';assert.doesNotThrow(()=>m.structure(legacyEdit,legacy));
assert.ok(m.reportIssues(legacyEdit,'report').some(i=>i.code==='SINGLE_SAMPLE_REQUIRED'));
assert.ok(m.reportIssues(legacyEdit,'report').some(i=>i.code==='SAMPLE_OUTSIDE_COVERAGE_OR_DUPLICATE'));
const history=copy(c);history.documents.find(d=>d.id===first).flow.active.content=legacy;
assert.ok(Array.from(m.unresolvedFailureSamples(history,{...history.cases[0],reportIds:[first]})).includes('A'));
console.log('PASS sample policy: singleton and cross-row duplicate guards; RPT/RTS numbers; fixed original rows; missing photo blocks submit; later failure/pass and explicit close; formal immutability and legacy selection preservation');

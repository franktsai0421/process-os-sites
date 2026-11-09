import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';

const require=createRequire(import.meta.url),load=require('../scripts/ipqc-ab-import-harness.cjs')();
const routine=load('lib/routine-fqc.ts'),draft=load('lib/shared-draft.ts'),copy=structuredClone;
const predecessor=JSON.parse(fs.readFileSync('tests/fixtures/routine-fqc-validator-predecessor.json','utf8'));
// Genuine 7ef lexical helper/body, frozen with provenance. No outside checkout or
// historical Git object is needed at test time, including shallow CI clones.
assert.equal(predecessor.sourceCommit,'7ef04ed741249816aac2f1336cf15f888ff92fa0');
for(const key of ['linkedCase','structureBody','demand'])assert.equal(createHash('sha256').update(predecessor[key]).digest('hex'),predecessor[key+'Sha256']);
const lexical=ts.transpileModule(predecessor.demand+'\n'+predecessor.linkedCase,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const oldValidate=vm.runInNewContext(lexical+'\n(c,doc,content,previous)=>{'+predecessor.structureBody+'}',{structure:routine.structure,stableDraftJSON:draft.stableDraftJSON,DraftConflict:draft.DraftConflict});
const actor={id:'validator-editor',name:'Synthetic editor',admin:false};
function fixture(){
 const source={id:'source',name:'Source',code:'S',line:'A',category:'Fixture',errorCode:'E',description:'Source snapshot',versionId:'approved-source',version:'1',effectiveDate:'2026-11-09',frequency:'monthly',frequencyText:'monthly',products:['A','B'].map(code=>({code,name:code}))};
 const content={title:'Report',date:'2026-11-09',notes:'',reason:'',disposition:'',evidence:[],lines:[{id:'line',jobId:'job',source,results:[{id:'result',samples:['A'],outcome:'pass',value:'1',notes:'',photos:[]}]}]};
 const domain=routine.emptyRoutine(),doc={id:'document',number:'R1',kind:'report',planId:null,caseId:'case',correctionOf:null,owner:actor,createdAt:'fixture',flow:draft.createSharedDraft('routine-fqc:document',content,null,'generation')};
 domain.documents.push(doc);domain.cases.push({id:'case',number:'C1',jobId:'job',planId:'plan',originReportId:'origin',reportIds:['origin'],status:'retest',result:'fail',requiredSamples:['A'],improvements:[],events:[]});
 return {domain,doc,previous:copy(content),content:copy(content)};
}
function outcome(validator,f){try{validator(f.domain,f.doc,f.content,f.previous);return null;}catch(error){return {code:error.code||error.message,status:error.status};}}
function equivalent(f,expected){const before=JSON.stringify(f);const result=expected===null?null:{code:expected,status:422};assert.deepEqual(outcome(oldValidate,f),result,'actual predecessor outcome');assert.deepEqual(outcome(routine.validateRoutineContentEdit,f),result,'extracted production outcome');assert.equal(JSON.stringify(f),before,'validation never mutates domain, original flow, receipts or input');}
void test('valid text/result/photo edits are pure and equivalent to the actual predecessor',()=>{const f=fixture();f.content.notes='Changed';f.content.lines[0].results[0].value='2';f.content.lines[0].results[0].photos=['a'.repeat(64)];equivalent(f,null);});
for(const [name,change,error]of [
 ['source snapshot',f=>f.content.lines[0].source.versionId='other','SOURCE_SNAPSHOT_IMMUTABLE'],
 ['document membership',f=>f.content.lines=[],'DOCUMENT_ITEMS_IMMUTABLE'],
 ['duplicate result identity',f=>f.content.lines[0].results.push(copy(f.content.lines[0].results[0])),'RESULT_ID_INVALID'],
 ['invalid photo',f=>f.content.evidence=['not-uploaded'],'PHOTO_ID_INVALID'],
 ['invalid text',f=>f.content.notes=42,'TEXT_INVALID'],
 ['new covered but unrequested retest sample',f=>f.content.lines[0].results[0].samples=['B'],'RETEST_SAMPLE_FIXED'],
 ['new result cannot borrow another row original sample exemption',f=>{f.previous.lines[0].results[0].samples=['B'];f.content.lines[0].results[0].samples=['B'];f.content.lines[0].results[0].id='new-result';},'RETEST_SAMPLE_FIXED'],
])void test(name+' keeps original rejection and all source data',()=>{const f=fixture();change(f);equivalent(f,error);});
void test('unchanged legacy retest samples are retained while a new selection is constrained',()=>{const f=fixture();f.previous.lines[0].results[0].samples=['B'];f.content.lines[0].results[0].samples=['B'];f.content.lines[0].results[0].notes='New observation';equivalent(f,null);f.content.lines[0].results[0].samples=['A'];equivalent(f,null);});
void test('correction linkage uses the original case reportIds, without inventing another source',()=>{const f=fixture();f.doc.caseId=null;f.doc.correctionOf='origin';f.content.lines[0].results[0].samples=['B'];equivalent(f,'RETEST_SAMPLE_FIXED');f.doc.correctionOf='unlinked';equivalent(f,null);});
void test('nonreport documents and absent/empty retest requirement retain original admission',()=>{for(const mode of ['plan','empty','other-job']){const f=fixture();f.content.lines[0].results[0].samples=['B'];if(mode==='plan')f.doc.kind='plan';if(mode==='empty')f.domain.cases[0].requiredSamples=[];if(mode==='other-job')f.domain.cases[0].jobId='other';equivalent(f,null);}});
function command(f,patches){const operationId=randomUUID();return {action:'draft',documentId:f.doc.id,operationId,expectedRevision:f.domain.revision,command:{action:'save',moduleAction:'save-local-v1',operationId,generation:f.doc.flow.generation,clientId:'validator-client',sequence:1,expectedRevision:f.doc.flow.revision,patches,guards:patches.map(p=>({path:p.path,value:p.path.length===1?copy(f.previous[p.path[0]]):copy(f.previous.lines[0].results)}))}};}
const context={actor,at:'2026-11-09T00:00:00Z',today:'2026-11-09',allowed:()=>true,settings:false,revoke:false,revise:false};
void test('actual per-document atomic Save uses extracted retest validation with no partial result',()=>{const f=fixture(),results=copy(f.content.lines[0].results);results[0].samples=['B'];const request=command(f,[{op:'set',path:['notes'],value:'must not leak'},{op:'set',path:['lines',{id:'line'},'results'],value:results}]),before=JSON.stringify(f.domain);assert.throws(()=>routine.executeRoutine(f.domain,request,[],context),error=>error.code==='RETEST_SAMPLE_FIXED');assert.equal(JSON.stringify(f.domain),before);});
void test('actual per-document Save retains one revision, full command receipt and exact replay',()=>{const f=fixture(),request=command(f,[{op:'set',path:['notes'],value:'Saved observation'}]),first=routine.executeRoutine(f.domain,request,[],context);assert.equal(f.doc.flow.revision,1);assert.equal(f.doc.flow.saves.length,1);assert.equal(f.doc.flow.saved.content.notes,'Saved observation');assert.equal(f.doc.flow.receipts[request.operationId].fingerprint,draft.stableDraftJSON(request.command));assert.equal(Object.keys(f.domain.receipts).length,1);const before=JSON.stringify(f.domain);assert.deepEqual(routine.executeRoutine(f.domain,request,[],context),first);assert.equal(JSON.stringify(f.domain),before);});
void test('negative control: structural-only validation would wrongly accept a covered unrequested sample',()=>{const f=fixture();f.content.lines[0].results[0].samples=['B'];assert.doesNotThrow(()=>routine.structure(f.content,f.previous));assert.deepEqual(outcome(oldValidate,f),{code:'RETEST_SAMPLE_FIXED',status:422});assert.deepEqual(outcome(routine.validateRoutineContentEdit,f),{code:'RETEST_SAMPLE_FIXED',status:422});});

import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),fixture=require('../scripts/test-master-page-runtime.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
async function setup(t){const f=await fixture();t.after(()=>f.close());const draft=f.load('lib/shared-draft.ts'),api=f.load('lib/master-catalog-handoff.ts'),source={revision:10,root:plain(f.root)},hash=v=>createHash('sha256').update(draft.stableDraftJSON(v)).digest('hex');return{f,api,source,hash,pin:()=>({revision:source.revision,rootDigest:hash(source.root),versions:{AB:'approved-AB',C:'approved-C',PROCESS:'approved-PROCESS'}})};}
void test('read-only catalog handoff inventories original drafts/saves/cases/receipts and never reassigns identities',async t=>{
 const {f,api,source,pin,hash}=await setup(t),flow=source.root.workflowScopes.AB;
 flow.working.products.push({id:'retained-product',code:'OLD',name:'Original private working',line:'A',category:'',stages:['A-1']});flow.saved={id:'retained-save',content:plain(flow.working)};flow.saves.push(plain(flow.saved));flow.cases.push({id:'retained-case',savedId:flow.saved.id,status:'pending',content:plain(flow.working)});flow.pendingId='retained-case';
 const before=JSON.stringify(source),metrics=f.metrics(),op={endpoint:'/api/master/workflow?scope=AB&caseMetadata=1',actorId:'writer',operationId:f.legacyId,generation:'legacy-AB'},r=await api.previewMasterCatalogHandoff(source,pin(),[op]);
 assert.equal(r.activationAvailable,false);assert.equal(r.retentionDigest,hash(source.root));assert.equal(JSON.stringify(source),before);assert.deepEqual(f.metrics(),metrics);assert(r.issues.some(i=>i.code==='OPEN_REVIEW_CASE'));assert(r.issues.some(i=>i.code==='LEGACY_WORKING_REQUIRES_EXPLICIT_CUTOFF_DECISION'));assert(r.issues.some(i=>i.code==='LEGACY_SAVED_REQUIRES_RETENTION_PLAN'));
 for(const [kind,id]of [['save','retained-save'],['case','retained-case'],['receipt',f.legacyId]]){const row=r.inventory.find(i=>i.kind===kind&&i.id===id);assert.equal(row.owner,'AB');assert.deepEqual(plain(row.proposedPages),['AB.catalog','LINES']);assert.match(row.digest,/^[a-f0-9]{64}$/);}
 assert.equal(r.operations[0].status,'ORIGINAL_RECEIPT_PRESENT');assert.equal(r.operations[0].originalOwner,'AB');assert.equal(r.operations[0].replayAllowed,false);assert(!JSON.stringify(r).includes('Original private working'));
});
void test('receipt absence, actor/generation mismatch and endpoint ambiguity never authorize replay or look in another owner',async t=>{
 const {f,api,source,pin}=await setup(t),base={endpoint:'/api/master/workflow?scope=AB',actorId:'writer',operationId:f.legacyId,generation:'legacy-AB'};
 const markers=[base,{...base,actorId:'other'},{...base,generation:'new'},{...base,operationId:'absent'},{...base,endpoint:'/api/master/pages?scope=AB'},{...base,endpoint:'/api/master/workflow?scope=C'},{...base,endpoint:'/api/master/workflow?scope=AB&scope=C'}];
 const r=await api.previewMasterCatalogHandoff(source,pin(),markers);assert.deepEqual(plain(r.operations.map(o=>o.status)),['ORIGINAL_RECEIPT_PRESENT','IDENTITY_MISMATCH','IDENTITY_MISMATCH','UNRESOLVED_QUERY_ORIGINAL_RECEIPT','UNRESOLVED_QUERY_ORIGINAL_RECEIPT','UNRESOLVED_QUERY_ORIGINAL_RECEIPT','UNCLASSIFIED_ORIGINAL_ENDPOINT']);assert(r.operations.every(o=>o.replayAllowed===false));
});
void test('exact pins reject changed source or unhydrated records; frozen clone protects async audit from caller mutation',async t=>{
 const {api,source,pin}=await setup(t),pins=pin();await assert.rejects(api.previewMasterCatalogHandoff(source,{...pins,revision:9}),/MASTER_PAGE_SOURCE_CHANGED/);await assert.rejects(api.previewMasterCatalogHandoff({...source,root:{...source.root,active:{...source.root.active,AB:{__immutableBody:'not-hydrated'}}}},pin()),/MASTER_PAGE_SOURCE_CHANGED|MASTER_PAGE_SOURCE_NOT_HYDRATED/);
 const work=api.previewMasterCatalogHandoff(source,pins);source.root.workflowScopes.AB.working.products.push({id:'late'});const r=await work;assert.equal(r.sourcePins.rootDigest,pins.rootDigest);assert.notEqual(r.retentionDigest,pin().rootDigest);
 await assert.rejects(api.previewMasterCatalogHandoff(source,pin(),[{actorId:'writer'}]),/MASTER_HANDOFF_OPERATIONS_INVALID/);
});

/* Exact pre-Begin-v1 handlers, current dependencies, synthetic SQLite/R2 only.
 * This is a backward-protocol rejection proof, not a historical release replay. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {fixture}=require('./ipqc-c-operation-fixture.cjs');
const {withoutDurableBegin}=require('./workflow-begin-source-contract.cjs');
const root=path.resolve(__dirname,'..');
const files=['app/api/ipqc-c/workflow/route.ts','lib/versioned-shared-workflow.ts'];
(async()=>{
 const overrides={};
 for(const file of files){
  const bytes=fs.readFileSync(path.join(root,file));
  overrides[file]=withoutDurableBegin(bytes,file).toString();
  assert.throws(()=>withoutDurableBegin(Buffer.concat([bytes,Buffer.from('\n// unknown change')]),file),/differs from pinned bytes/);
  assert.throws(()=>withoutDurableBegin(Buffer.from(bytes.toString().replace('receipt.actorId!==actor.id','false')),file),/differs from pinned bytes/);
  const altered=Buffer.from(bytes.toString().replace("action==='begin'","action==='begin-unsafe'"));
  assert.notDeepEqual(altered,bytes);
  assert.throws(()=>withoutDurableBegin(altered,file),/differs from pinned bytes/);
  const reviewedCatalogBytes=file==='lib/versioned-shared-workflow.ts'?require('node:child_process').execFileSync('git',['show','f0ab66fc27b7c9615c42a28fcc40a4864fb3a047:'+file],{cwd:root}):bytes;
  if(file==='lib/versioned-shared-workflow.ts'){
   withoutDurableBegin(reviewedCatalogBytes,file);
   for(const [before,after]of [["['master:AB','master:C','master:PROCESS']","['master:AB','master:C','bom']"],["'master:C','master:PROCESS'].includes(adapter.scope)","'master:C','bom'].includes(adapter.scope)"]]){const unsafe=Buffer.from(bytes.toString().replace(before,after));assert.notDeepEqual(unsafe,bytes);assert.throws(()=>withoutDurableBegin(unsafe,file),/differs from pinned bytes/);}
  }
  if(file==='lib/versioned-shared-workflow.ts')for(const [before,after]of [
   ["['master:AB','master:C']","['master:AB','master:PROCESS']"],
   ["defaults.save=defaults.save||defaults.edit","defaults.save=defaults.save||defaults.approve"],
   ["adapter.key==='toolingMasterControl'&&adapter.scope==='tooling'","adapter.key==='toolingMasterControl'"],
   ["adapter.key==='bomMasterControl'&&adapter.scope==='bom'&&body.command?.action==='save'","false&&body.command?.action==='save'"],
   ["'master:AB','master:C'].includes(adapter.scope)","'master:AB','master:PROCESS'].includes(adapter.scope)"]
  ]){
   const unsafe=Buffer.from(reviewedCatalogBytes.toString().replace(before,after));assert.notDeepEqual(unsafe,reviewedCatalogBytes);
   assert.throws(()=>withoutDurableBegin(unsafe,file),/differs from pinned bytes/,'Unknown changes in reviewed opt-in spans still fail closed');
  }
 }
 const abInverse=require('./ipqc-ab-local-save-source-contract.cjs').withoutABLocalAtomicSave;
 const abBytes=require('node:child_process').execFileSync('git',['show','4f810663174fe9c0a2e275c5f17dec3d5080522b:lib/versioned-shared-workflow.ts'],{cwd:root});
 assert.equal(createHash('sha256').update(abInverse(abBytes)).digest('hex'),'8734ac32aa54f02f2d19b94bd7b0ecbec849907867a9638a4f5afd34a4e244d1','AB inverse restores exact PR77 bytes before the unchanged historical Begin inverse');
 for(const token of ['adapter.requiresCreate?.(control,command)||',"'ipqc-ab:module'",'limited.save=limited.save||limited.edit']){
  const altered=Buffer.from(abBytes.toString().replace(token,'UNRECOGNIZED_SOURCE'));assert.notDeepEqual(altered,abBytes);
  assert.throws(()=>abInverse(altered),/differs from pinned bytes/);assert.throws(()=>withoutDurableBegin(altered,files[1]),/differs from pinned bytes/);
 }
 const atomicInverse=require('./ipqc-c-local-save-source-contract.cjs').withoutLocalAtomicSave;
 const historical=atomicInverse(fs.readFileSync(path.join(root,files[0])));
 assert.equal(createHash('sha256').update(historical).digest('hex'),'8e02233a3928309f28d478814610e4862fc8b331f20e273292f4f87f24c8eb07','Begin inverse composes with unchanged historical Local Save proof');
 const h=await fixture();
 try{
  // Elevate only this private synthetic editor, using its existing normal login.
  const state=await h.core.readState(),users=JSON.parse(state.values.platformUsers);
  const editor=users.find(u=>u.id==='preview-editor');editor.role='admin';editor.inheritRole=true;delete editor.accessOverrides;
  const snapshot={workspaces:[]};
  const authoring={schemaVersion:1,activeVersionId:'active',versions:[{id:'active',number:1,status:'approved',snapshot,revision:1,history:[]}],workflow:h.load('lib/shared-draft.ts').createSharedDraft('process:platform',snapshot,'active',randomUUID())};
  const values={...state.values,masterDataControl:JSON.stringify({active:{}}),platformUsers:JSON.stringify(users),processAuthoringControl:JSON.stringify(authoring)};
  const encoded=await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,values);
  h.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(encoded);
  const legacy=require('./fqc-bootstrap-projection-fixture.cjs')(root,h.env,null,overrides);
  for(const moduleName of ['fqc','iqc','ipqc-c','process-authoring','bom','routine-equipment']){
   const before=h.snapshot(),body={action:'begin-v1',begin:{operationId:randomUUID(),basis:{generation:null,activeVersionId:null,openVersionId:null,openVersionStatus:null,openVersionRevision:null}}};
   const api=legacy.load('app/api/'+moduleName+'/workflow/route.ts');
   const response=await api.POST(new Request('http://fixture/api/'+moduleName+'/workflow',{method:'POST',headers:h.sessions.editor,body:JSON.stringify(body)}));
   const result=await response.json();assert.equal(response.status,422,JSON.stringify(result));assert.equal(result.error,'COMMAND_REQUIRED');
   assert.deepEqual(h.snapshot(),before,moduleName+' old server rejects unknown Begin action without D1/R2/receipt writes');
   console.log('PASS '+moduleName+' exact old handler rejects begin-v1: 422 COMMAND_REQUIRED, zero D1/R2 changes');
  }
  assert.deepEqual([...legacy.overrideUsed].sort((a,b)=>a.localeCompare(b)),files.slice().sort((a,b)=>a.localeCompare(b)));
  console.log('PASS original historical hashes, exact reviewed integrated/BOM projections and unknown-source/permission/scope mutations');
 }finally{h.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

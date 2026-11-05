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
  const altered=Buffer.from(bytes.toString().replace("action==='begin'","action==='begin-unsafe'"));
  assert.notDeepEqual(altered,bytes);
  assert.throws(()=>withoutDurableBegin(altered,file),/differs from pinned bytes/);
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
  for(const moduleName of ['fqc','iqc','ipqc-c','process-authoring','bom']){
   const before=h.snapshot(),body={action:'begin-v1',begin:{operationId:randomUUID(),basis:{generation:null,activeVersionId:null,openVersionId:null,openVersionStatus:null,openVersionRevision:null}}};
   const api=legacy.load('app/api/'+moduleName+'/workflow/route.ts');
   const response=await api.POST(new Request('http://fixture/api/'+moduleName+'/workflow',{method:'POST',headers:h.sessions.editor,body:JSON.stringify(body)}));
   const result=await response.json();assert.equal(response.status,422,JSON.stringify(result));assert.equal(result.error,'COMMAND_REQUIRED');
   assert.deepEqual(h.snapshot(),before,moduleName+' old server rejects unknown Begin action without D1/R2/receipt writes');
   console.log('PASS '+moduleName+' exact old handler rejects begin-v1: 422 COMMAND_REQUIRED, zero D1/R2 changes');
  }
  assert.deepEqual([...legacy.overrideUsed].sort((a,b)=>a.localeCompare(b)),files.slice().sort((a,b)=>a.localeCompare(b)));
  console.log('PASS exact historical inverse and two unknown-source mutations per handler');
 }finally{h.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

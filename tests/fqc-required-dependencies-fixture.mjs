import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const fixture=createRequire(import.meta.url)('../scripts/fqc-apply-fixture.cjs');

export const scopedEndpoint='/api/fqc/workflow?caseMetadata=1&compact=1';
export const authKeys=['platformUsers','processCustomRoles','processRoleTemplateOverrides','processAccessControl','maintenanceMode'];
export const businessKeys=['qualityMasterControl','masterDataControl','routineEquipmentControl'];
export const requiredKeys=[...authKeys,...businessKeys];
export const nameEdit=(value='Scoped change',before='Synthetic error')=>({patches:[{op:'set',path:['errors',{id:'error'},'name'],value}],guards:[{path:['errors',{id:'error'},'name'],value:before}]});
export const storedRow=f=>f.db.prepare('SELECT * FROM shared_state WHERE id=1').get();
export const storedEnvelope=f=>JSON.parse(storedRow(f).values);
export function updateEnvelope(f,change){const envelope=storedEnvelope(f);change(envelope);f.db.prepare('UPDATE shared_state SET "values"=? WHERE id=1').run(JSON.stringify(envelope));return envelope;}
export function rawRef(f,raw){const sha256=createHash('sha256').update(raw).digest('hex'),ref={key:'state-records/v1/'+sha256+'.json',sha256};f.objects.set(ref.key,Buffer.from(raw));return ref;}
export function replaceAggregate(f,key,raw){const ref=rawRef(f,raw);updateEnvelope(f,envelope=>{envelope.__processRecords.values[key]=ref;});return ref;}
export function injectRequiredFault(f,key,mode){
 const ref=storedEnvelope(f).__processRecords.values[key];assert(ref,`fixture requires ${key}`);
 if(mode==='missing')f.objects.delete(ref.key);
 else if(mode==='sha')f.objects.set(ref.key,Buffer.from('{"synthetic":"wrong SHA"}'));
 else if(mode==='json')replaceAggregate(f,key,'[');
 else throw Error('Unknown synthetic fault');
 return ref;
}
export async function setup(options){const f=await fixture(options);try{const a=f.realm(),begun=await a.client.begin();return{f,a,generation:begun.control.workflow.generation};}catch(error){f.close();throw error;}}
export function send(context,action='apply',detail=nameEdit(),url=scopedEndpoint){const command=context.a.client.prepare(context.generation,action,detail);return context.f.call(url,{method:'POST',body:JSON.stringify({command})});}
export function resetEvents(f){f.events.length=0;f.requests.length=0;}
export function noMutation(f,before){
 assert.deepEqual(storedRow(f),before,'shared-state row must stay byte-identical');
 assert(!f.events.some(event=>event.kind==='put'),'failure must precede immutable writes');
 assert(!f.events.some(event=>event.kind==='sql'&&event.sql.startsWith('UPDATE shared_state')),'failure must precede CAS');
}
export function businessRefSet(f){const values=storedEnvelope(f).__processRecords.values;return new Set(businessKeys.map(key=>values[key]?.key).filter(Boolean));}

// These private-capability fixtures deliberately stand in for the trusted
// authorization callback. They test writer provenance, not HTTP authorization;
// the route tests above separately execute the genuine session/permission gates.
export async function setupCapability(action='apply'){
 const context=await setup(),{f,a,generation}=context;
 try{
  const peer=f.realm('other');await peer.client.read();
  const peerResult=await peer.client.command(generation,'apply',{patches:[{op:'set',path:['items',{id:'item'},'description'],value:'Peer retained'}],guards:[{path:['items',{id:'item'},'description'],value:'Synthetic description'}]});
  const peerCommand=JSON.parse(f.requests.find(request=>request.actor==='other'&&request.method==='POST').body).command;
  await a.client.command(generation,'save');
  if(action==='save')await a.client.command(generation,'apply',nameEdit('Pending explicit Save'));
  return{...context,peerReceiptId:peerResult.receipt.operationId,peerSequenceKey:JSON.stringify(['other',peerCommand.clientId])};
 }catch(error){f.close();throw error;}
}
export async function makeCapability(context,action='apply',{lowLevel=false,seal=true}={}){
 const{f,a,generation}=context,required=f.load('lib/fqc-required-dependencies.ts'),workflow=f.load('lib/versioned-shared-workflow.ts');
 const command=a.client.prepare(generation,action,action==='apply'?nameEdit():{}),actor={id:'editor',name:'Synthetic editor',admin:false},at='2026-11-01T00:00:00.000Z';
 const issued=lowLevel?await f.records.readFqcRequiredRecordMutation(f.env.STATE_ARCHIVE,storedEnvelope(f),storedRow(f).revision,{action,allocate:false},()=>Promise.resolve({actorId:actor.id,operationId:command.operationId,clientId:command.clientId,sequence:command.sequence})):null;
 const state=issued?.state||await required.readFqcRequiredMutationState(command,()=>Promise.resolve(actor.id));assert(state);
 const adapter=f.load('lib/fqc-workflow.ts').fqcWorkflowAdapter(),control=adapter.parse(state.values.qualityMasterControl,state.recordStorage.models.get('qualityMasterControl'));
 if(!lowLevel)required.captureFqcRequiredBasis(state,command,control);
 const ctx=adapter.context(control,state,{actor,at,id:randomUUID,allowed:()=>true});
 ctx.commandFingerprint=await f.load('lib/workflow-wire.ts').workflowCommandFingerprint(command);ctx.allocationIndex=state.recordStorage.allocations.get('qualityMasterControl');
 const result=await adapter.apply(control,command,ctx);control.workflow=result.state;
 const cap={f,required,command,state,actor,at,control,result,issued,values:{...state.values},models:null,project:expected=>workflow.projectSharedVersion(expected,actor,at),seal(){
  if(!lowLevel)required.captureFqcRequiredResult(state,command,result.state,result.receipt);
  workflow.projectSharedVersion(control,actor,at);cap.models=new Map([['qualityMasterControl',adapter.serializeModel(control)]]);return cap;
 },encode(overrides={}){
  if(lowLevel)return f.records.encodeFqcRequiredRecordMutation(overrides.bucket||f.env.STATE_ARCHIVE,overrides.handle||issued.handle,overrides.revision??state.revision,overrides.values||cap.values,overrides.storage||state.recordStorage,overrides.model||cap.models.get('qualityMasterControl'));
  return required.encodeFqcRequiredMutationState(overrides.state||state,overrides.values||cap.values,overrides.models||cap.models,cap.project);
 }};
 if(seal)cap.seal();return cap;
}

// Go through the production serializer: a hand-built inline authority fixture
// cannot reproduce the audit.before representation produced by normal writes.
export async function addAuthorityAudit(f){
 await f.mutate(values=>{values.processAccessControl=JSON.stringify({schemaVersion:2,audit:[{id:'synthetic-audit',action:'update-user',actor:{id:'editor'},before:{enabled:true,accessOverrides:{'fqc.edit':true}},after:{enabled:true}}]});});
 const pointer=storedEnvelope(f).__processRecords.values.processAccessControl;
 const aggregate=JSON.parse(f.objects.get(pointer.key).toString());
 assert(aggregate.audit[0].before.__immutableBody,'normal serializer must produce the incident shape');
 return aggregate.audit[0].before.__immutableBody;
}

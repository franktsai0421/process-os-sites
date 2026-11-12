/* Actual C comparison function + real handlers, isolated synthetic data only. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const {fixture}=require('./ipqc-c-operation-fixture.cjs');
const source=fs.readFileSync('public/process/ipqc-c.js','utf8');
const begin=source.indexOf('  function compareLocalSave('),end=source.indexOf('  function chooseSaveConflicts(',begin);
const compare=vm.runInNewContext(source.slice(begin,end)+';compareLocalSave');
const plain=value=>JSON.parse(JSON.stringify(value)),copy=structuredClone;
const base={errors:[{id:'e1',code:'E1',productCode:'C100',stageCode:'CUT',name:'名稱',note:'',reason:'',deleted:false},{id:'e2',code:'E2',productCode:'C100',stageCode:'CUT',name:'Tên',note:'',reason:'',deleted:false}],items:[]};
const item=(id,errorId)=>({id,code:id,errorId,productCode:'C100',stageCode:'CUT',standard:'10',description:'Đo',note:'',reason:'',tool:'',method:'',frequency:'',cpkEnabled:false,standardEnabled:true,notApplicable:false,notApplicableReason:'',equipmentGroupId:'',equipmentId:'',equipmentSnapshot:null,mediaItems:[],rule:{cadence:'batch',batchKind:'fixed_count',fixedCount:'3'},deleted:false});
base.items=[item('i1','e1'),item('i2','e2')];delete base.items[1].notApplicableReason;
const photo=(id,name)=>({id,name,note:'',afterParagraph:0});
let checks=0;const check=(yes,message)=>{assert(yes,message);checks++;};
// Independent edits, same-value convergence and explicit conflicting choices.
let local=copy(base),remote=copy(base);local.items[0].note='我的';remote.items[0].description='Người khác';
let result=compare(base,local,remote);check(!result.clashes.length,'different fields merge');check(result.changes[0].patches[0].value==='我的','local field retained');
remote.items[0].note='對方';result=compare(base,local,remote);check(result.clashes.length===1,'one conflicting field');
const key=result.clashes[0].key;check(compare(base,local,remote,{[key]:'theirs'}).changes.length===0,'theirs keeps remote');
check(compare(base,local,remote,{[key]:'mine'}).changes[0].patches[0].path[1].id==='i1','mine retains ID');
// New peer child conflicts only with whole-group deletion; another parent survives.
local=copy(base);local.errors[0].deleted=true;local.items[0].deleted=true;
remote=copy(base);remote.items.push(item('peer-child','e1'));remote.items[1].note='Independent peer';
result=compare(base,local,remote);check(result.clashes.length===1,'peer-added child conflicts with group deletion');
const deleteKey=result.clashes[0].key;check(compare(base,local,remote,{[deleteKey]:'theirs'}).changes.length===0,'retain complete peer group');
result=compare(base,local,remote,{[deleteKey]:'mine'});check(result.changes[0].input.id==='e1','delete preserves parent ID');check(result.changes[0].guards[1].value.some(r=>r.id==='peer-child'),'mine explicitly guards peer-added child');
// Local change then delete folds to a deletion against the original exact row.
local=copy(base);local.items[0].equipmentId='new-gauge';local.items[0].deleted=true;
result=compare(base,local,base);check(result.changes.length===1&&result.changes[0].moduleAction==='delete-item','gauge-change then delete is one guarded deletion');check(result.changes[0].guards[0].value.equipmentId==='','original gauge baseline retained');
local=copy(base);local.items.push(item('local-newchild-000001','e1'));local.errors[0].deleted=true;for(const row of local.items)if(row.errorId==='e1')row.deleted=true;
result=compare(base,local,base);check(result.changes.length===1,'new child then parent delete creates no orphan allocation');
// Ambiguous duplicate hashes are resolved as one group, other photographs merge.
const photosBase=copy(base);photosBase.items[0].mediaItems=[photo('a','A1'),photo('a','A2'),photo('b','B'),photo('c','C')];
local=copy(photosBase);remote=copy(photosBase);local.items[0].mediaItems[0].name='本機';remote.items[0].mediaItems[1].note='Ghi chú';remote.items[0].mediaItems[2].name='Peer B';local.items[0].mediaItems[3].note='Local C';
result=compare(photosBase,local,remote);check(result.clashes.length===1,'only duplicate group conflicts');
for(const choice of ['mine','theirs']){const merged=compare(photosBase,local,remote,{[result.clashes[0].key]:choice}).changes[0].patches[0].value;check(merged.filter(p=>p.id==='a').length===2,'duplicate references retained');check(merged.find(p=>p.id==='b').name==='Peer B','unrelated peer photo retained');check(merged.find(p=>p.id==='c').note==='Local C','unrelated local photo retained');}
local=copy(photosBase);local.items[0].mediaItems.push(photo('a','A3'));result=compare(photosBase,local,photosBase);check(!result.clashes.length&&result.changes[0].patches[0].value.length===5,'repeated addition not deduplicated');
const handlerBase=copy(base);handlerBase.errors.push({...copy(base.errors[0]),id:'e3',code:'E3',productCode:'C200',stageCode:'OTHER'});handlerBase.items.push({...item('i3','e3'),productCode:'C200',stageCode:'OTHER'});
const initial={schemaVersion:1,activeVersionId:null,source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'initial',number:1,status:'draft',snapshot:handlerBase,baseVersionId:null,revision:1,creatorId:'fixture',creatorName:'fixture',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
(async()=>{const h=await fixture({ipqcABMasterControl:JSON.stringify({schemaVersion:1,scopes:{},reservedErrorCodes:[],reservedItemCodes:[]}),bomMasterControl:JSON.stringify({schemaVersion:1,activeVersionId:null,versions:[]}),qualityMasterControl:JSON.stringify({schemaVersion:1,libraries:{}}),ipqcCMasterControl:JSON.stringify(initial),masterDataControl:JSON.stringify({active:{C:{products:[{code:'C100',stages:['CUT']},{code:'C200',stages:['OTHER']}],lines:[{stages:[{code:'CUT'},{code:'OTHER'}]}]}}})});try{
 await h.begin('ipqc-c');let sequence=0;
 const state=async()=>h.flow(await h.read('ipqc-c'));
 const send=(flow,changes,who='editor',status=200)=>h.call('ipqc-c/workflow','POST',{command:{action:'save',generation:flow.generation,expectedRevision:flow.revision,operationId:randomUUID(),clientId:'comparison-'+who,sequence:++sequence,localChanges:plain(changes)}},who,status,'?caseMetadata=1');
 let flow=await state(),mine=copy(flow.working);mine.items[0].note='我的';const peer=copy(flow.working);peer.items[1].note='Đối tác';
 await send(flow,compare(flow.working,peer,flow.working).changes,'edit-only');
 const latest=await state(),compiled=compare(flow.working,mine,latest.working);await send(latest,compiled.changes);
 flow=await state();check(flow.working.items[0].note==='我的'&&flow.working.items[1].note==='Đối tác','two synthetic identities preserve independent edits');
 // A peer writes after choices: strict expected revision rejects, no side effects.
 const old=flow;mine=copy(flow.working);mine.items[0].note='Late mine';
 const stale=compare(flow.working,mine,flow.working).changes;const next=copy(flow.working);next.items[1].note='Late peer';await send(flow,compare(flow.working,next,flow.working).changes,'edit-only');
 const before=h.snapshot();const rejected=await send(old,stale,'editor',409);check(rejected.error==='DRAFT_REVISION_CHANGED_RECONFIRM','post-choice peer race rejects');assert.deepEqual(h.snapshot(),before);
 // Existing permissions and pending locks still apply to compared batches.
 flow=await state();await send(flow,[],'save-only',403);assert.deepEqual(h.snapshot(),before);
 mine=copy(flow.working);mine.items[0].equipmentId='never-selected';mine.items[0].deleted=true;
 await send(flow,compare(flow.working,mine,flow.working).changes);flow=await state();check(flow.working.items[0].deleted,'gauge then delete actual handler succeeds without snapshot forgery');
 const optional=copy(flow.working);optional.items[1].notApplicableReason='Optional field';
 await send(flow,compare(flow.working,optional,flow.working).changes);flow=await state();check(flow.working.items[1].notApplicableReason==='Optional field','optional field remains guarded');
 // Compose comparison choices with the real handler: a peer-added child is
 // guarded and deleted only after explicit whole-group mine consent.
 let groupBase=copy(flow.working),groupMine=copy(groupBase),groupPeer=copy(groupBase);
 groupMine.errors[0].deleted=true;for(const row of groupMine.items)if(row.errorId==='e1')row.deleted=true;
 groupPeer.items.push(item('local-peer-child-000001','e1'));
 await send(flow,compare(groupBase,groupPeer,groupBase).changes);flow=await state();
 let grouped=compare(groupBase,groupMine,flow.working);check(grouped.clashes.length===1,'actual peer child creates one group conflict');
 check(compare(groupBase,groupMine,flow.working,Object.fromEntries(grouped.clashes.map(row=>[row.key,'theirs']))).changes.length===0,'whole-group theirs retains peer children');
 const peerChild=flow.working.items.find(row=>row.errorId==='e1'&&!row.deleted);assert(peerChild&&!peerChild.id.startsWith('local-'));
 grouped=compare(groupBase,groupMine,flow.working,Object.fromEntries(grouped.clashes.map(row=>[row.key,'mine'])));await send(flow,grouped.changes);flow=await state();
 check(flow.working.errors[0].deleted&&flow.working.items.find(row=>row.id===peerChild.id).deleted,'consented cascade deletes peer child and preserves its original ID');
 // Peer tombstones the other group. Mine revives only the required same IDs,
 // with retained identity/relationships rather than an old snapshot replacement.
 groupBase=copy(flow.working);groupMine=copy(groupBase);groupPeer=copy(groupBase);
 groupMine.errors[1].name='Original-ID mine';groupMine.items.find(row=>row.id==='i2').note='Retained child mine';
 groupPeer.errors[1].deleted=true;for(const row of groupPeer.items)if(row.errorId==='e2')row.deleted=true;
 await send(flow,compare(groupBase,groupPeer,groupBase).changes);flow=await state();
 grouped=compare(groupBase,groupMine,flow.working);check(grouped.clashes.length===1,'deleted parent/child is one conflict group');
 grouped=compare(groupBase,groupMine,flow.working,Object.fromEntries(grouped.clashes.map(row=>[row.key,'mine'])));
 await send(flow,grouped.changes);flow=await state();
 check(flow.working.errors.find(row=>row.id==='e2').name==='Original-ID mine'&&!flow.working.errors.find(row=>row.id==='e2').deleted,'same parent ID revived');
 const revived=flow.working.items.find(row=>row.id==='i2');check(!revived.deleted&&revived.errorId==='e2'&&revived.note==='Retained child mine','same child ID/relation revived with mine content');
 check(flow.working.items.find(row=>row.id===peerChild.id).deleted,'unrelated deleted group stays deleted');
 const pending=await h.command('ipqc-c','submit',{savedId:flow.saved.id,reason:'Synthetic'},'editor');
 const locked=h.snapshot();await send(await state(),[],'editor',409);assert.deepEqual(h.snapshot(),locked);
 await h.command('ipqc-c','withdraw',{caseId:pending.receipt.caseId,reason:'Synthetic'},'editor');
 // Query selectors cannot split C or target AB/BOM/FQC persisted models.
 const boundaryFlow=await state(),beforeQueries=h.snapshot();
 for(const query of ['&productCode=C100&stageCode=CUT','&productCode=C200&stageCode=OTHER','&scope=ipqc-ab%3AA%3AG']){
  const sameFlow=h.flow(await h.call('ipqc-c/workflow','GET',undefined,'editor',200,'?caseMetadata=1'+query));
  assert.equal(sameFlow.scope,'ipqc-c');assert.equal(sameFlow.generation,boundaryFlow.generation);assert.deepEqual(sameFlow.working,boundaryFlow.working);
 }
 assert.deepEqual(h.snapshot(),beforeQueries);
 const beforeValues=(await h.core.readState()).values,withoutC=values=>Object.fromEntries(Object.entries(values).filter(([key])=>key!=='ipqcCMasterControl'));
 const wholeC=copy(boundaryFlow.working);wholeC.items.find(row=>row.id==='i2').note='C100 retained together';wholeC.items.find(row=>row.id==='i3').note='C200 retained together';
 await send(boundaryFlow,compare(boundaryFlow.working,wholeC,boundaryFlow.working).changes);const afterBoundary=await state();
 check(afterBoundary.scope==='ipqc-c'&&afterBoundary.generation===boundaryFlow.generation,'C products share one fixed module generation');
 const savedModel=JSON.parse((await h.core.readState()).values.ipqcCMasterControl),savedBoundary=savedModel.workflow.saves.find(row=>row.id===afterBoundary.saved.id);assert(savedBoundary,'readback saved ID names the actual persisted immutable snapshot');
 check(savedBoundary.content.items.find(row=>row.id==='i2').note==='C100 retained together'&&savedBoundary.content.items.find(row=>row.id==='i3').note==='C200 retained together','one C Save includes edits from both products');
 assert.deepEqual(withoutC((await h.core.readState()).values),withoutC(beforeValues),'all non-C persisted model values remain byte-for-byte unchanged');
 console.log('PASS '+checks+' comparison assertions plus atomic rollback, permissions, pending and two-account handler checks');
}finally{h.close();}})().catch(error=>{console.error(error);process.exitCode=1;});

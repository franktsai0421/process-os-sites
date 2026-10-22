/* oxlint-disable typescript/no-require-imports -- isolated real handlers; no server or business writes. */
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const fixture=require('./ipqc-assignment-fixture.cjs');
const modules=[['AB master','/api/master/workflow?scope=AB'],['C master','/api/master/workflow?scope=C'],['Process master','/api/master/workflow?scope=PROCESS'],['FQC','/api/fqc/workflow'],['IQC','/api/iqc/workflow'],['Equipment','/api/routine-equipment/workflow'],['IPQC-AB','/api/ipqc-ab/workflow?module=1'],['IPQC-C','/api/ipqc-c/workflow'],['Process authoring','/api/process-authoring/workflow'],['Tooling','/api/tooling/workflow']];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const at=(value,path)=>path.reduce((row,key)=>typeof key==='string'?row[key]:row.find(x=>x.id===key.id),value);
const alive=row=>!row.deleted&&!row.isDeleted&&!row.archived;
// Select genuinely distinct categories/groups, not just two adjacent rows.
function pair(rows,key){const first=rows.find(alive);assert.ok(first,'fixture must contain editable rows');const second=rows.find(row=>alive(row)&&key(row)!==key(first));assert.ok(second,'fixture must contain two distinct categories/groups');return[first,second];}
function patchesFor(name,content){
 let rows,collection,field,key;
 if(name.endsWith(' master')&&name!=='Process master'){collection='products';field='name';key=r=>r.category;}
 else if(name==='FQC'){collection='items';field='name';key=r=>r.category;}
 else if(name==='IQC'){collection='parts';field='nameVi';key=r=>r.categoryId;}
 else if(name==='Equipment'){collection='equipment';field='notes';key=r=>r.groupId;}
 else if(name==='IPQC-C'){collection='items';field='standard';key=r=>r.productCode;}
 else if(name==='Tooling'){collection='tools';field='notes';key=r=>r.categoryId;}
 else if(name==='Process master'){
  rows=Object.entries(content).filter(([,list])=>Array.isArray(list)&&list.length).slice(0,2);assert.equal(rows.length,2);
  return rows.map(([stage,list],i)=>({op:'set',path:[stage,{id:list[0].id},'name'],value:list[0].name+' · isolated employee '+i}));
 }else if(name==='Process authoring'){
  return pair(content.workspaces,w=>w.category).map((w,i)=>{const [stage,ops]=Object.entries(w.stages).find(([,list])=>list.length);return{op:'set',path:['workspaces',{id:w.id},'stages',stage,{id:ops[0].id},'name'],value:ops[0].name+' · isolated employee '+i};});
 }
 return pair(content[collection],key).map((r,i)=>({op:'set',path:[collection,{id:r.id},field],value:(r[field]||'')+' · isolated employee '+i}));
}
(async()=>{
 const f=await fixture(process.argv[2]),sequences={};
 if(process.env.V3_STORAGE==='records'){const state=await f.core.readState();f.db.prepare('UPDATE shared_state SET "values"=?').run(await f.load('lib/state-records.ts').encodeRecordValues(f.env.STATE_ARCHIVE,state.values));}
 const good=r=>{assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};
 const read=async(endpoint,user='employee')=>{const body=good(await f.request(endpoint,'GET',undefined,user));return{...body,control:body.control||{workflow:body.workflow}};};
 const begin=async(endpoint,user='employee')=>good(await f.request(endpoint,'POST',{action:'begin'},user));
 async function send(endpoint,action,fields={},user='employee'){
  const current=await read(endpoint,user),flow=current.control.workflow;
  return good(await f.request(endpoint,'POST',{command:{operationId:randomUUID(),generation:flow.generation,clientId:'review-'+user,sequence:sequences[user]=(sequences[user]||0)+1,action,expectedRevision:flow.revision,input:{stateRevision:current.revision},...fields}},user));
 }
 const apply=async(endpoint,patches)=>{const content=(await read(endpoint)).control.workflow.working;return send(endpoint,'apply',{patches,guards:patches.map(p=>({path:p.path,value:at(content,p.path)})).filter(g=>g.value!==undefined)});};
 try{
  for(const [name,endpoint]of modules.filter(([name])=>!process.argv[3]||process.argv[3].split(',').includes(name))){
   await begin(endpoint);let expected;
   if(name==='Tooling'&&!(await read(endpoint)).control.workflow.working.tools.length){
    // The pre-tooling captured source has no tools. Create explicit disposable
    // fixtures through normal employee Apply, never seed a live service.
    const ids=['isolated-review-category-a','isolated-review-category-b'];
    await send(endpoint,'apply',{patches:ids.map((id,i)=>({op:'insert',path:['categories'],value:{id,nameVi:'Isolated category '+i,nameZh:'隔離類別 '+i}}))});
    await send(endpoint,'apply',{patches:ids.map((categoryId,i)=>({op:'insert',path:['tools'],value:{id:'isolated-review-tool-'+i,categoryId,nameVi:'Isolated tool '+i,nameZh:'隔離器具 '+i,assetCode:'ISOLATED-'+i,specification:'',quantity:1,unit:'piece',manufacturerId:'',location:{kind:'internal',holderId:''},inboundDate:'',inboundDateLost:true,enabled:true,inactiveReason:'',archived:false,archiveReason:'',notes:'',frequencyMonths:null,photos:[],iqcIds:[]}}))});
    console.log('FIXTURE Tooling: two explicit isolated categories/tools created via employee Apply; original capture had no tools');
   }
   if(name==='IPQC-AB'){
    const state=await f.core.readState(),root=JSON.parse(state.values.ipqcABMasterControl),keys=Object.keys(root.scopes).filter(k=>{const s=root.scopes[k];return(s.workflow?.working||s.versions.find(v=>v.status==='draft')?.snapshot||s.versions.find(v=>v.id===s.activeVersionId)?.snapshot)?.items?.some(alive);}).slice(0,2);assert.equal(keys.length,2);
    for(const [i,key]of keys.entries()){const group='/api/ipqc-ab/workflow?scope='+encodeURIComponent(key);const opened=await begin(group),item=opened.control.workflow.working.items.find(alive);await apply(group,[{op:'set',path:['items',{id:item.id},'standard'],value:item.standard+' · isolated employee '+i}]);}
    const changed=JSON.parse((await f.core.readState()).values.ipqcABMasterControl);expected=Object.fromEntries(Object.entries(changed.scopes).map(([key,s])=>[key,s.workflow?.working||s.versions.find(v=>v.status==='draft')?.snapshot||s.versions.find(v=>v.id===s.activeVersionId)?.snapshot||{errors:[],items:[]} ]));
   }else{
    const initial=(await read(endpoint)).control.workflow.working,patches=patchesFor(name,initial);
    await apply(endpoint,patches);expected=(await read(endpoint)).control.workflow.working;
    for(const p of patches)assert.equal(at(expected,p.path),p.value);
   }
   const saved=await send(endpoint,'save'),fixed=saved.control.workflow.saved;
   assert.deepEqual(name==='IPQC-AB'?fixed.content.scopes:fixed.content,expected,name+' full saved content');
   const reopen=await read(endpoint);assert.equal(reopen.control.workflow.saved.id,fixed.id,name+' manual Save ID survives fresh handler GET');
   const persistedC=async()=>JSON.parse((await f.core.readState()).values.ipqcCMasterControl).workflow;
   assert.equal(hash(name==='IPQC-C'?(await persistedC()).saved:reopen.control.workflow.saved),hash(fixed),name+' full saved snapshot persists');
   // Unsaved edits must not leak into Submit; withdrawal must restore the fixed Save.
   if(name!=='IPQC-AB'){const unsaved=patchesFor(name,expected).slice(0,1);await apply(endpoint,unsaved);}
   const submitted=await send(endpoint,'submit',{savedId:fixed.id,reason:'Isolated employee actual cross-category edits'}),caseId=submitted.receipt.caseId;
   assert.deepEqual(submitted.control.workflow.cases.find(c=>c.id===caseId).content,fixed.content);
   await send(endpoint,'withdraw',{caseId,reason:'Employee withdraw with full content verification'});
   const withdrawn=(await read(endpoint)).control.workflow;
   assert.equal(withdrawn.pendingId,null);assert.deepEqual(withdrawn.working,fixed.content);assert.equal(hash(name==='IPQC-C'?(await persistedC()).saved.content:withdrawn.saved.content),hash(fixed.content));
   const auditedCase=name==='IPQC-C'?good(await f.request(endpoint+'?caseId='+caseId,'GET',undefined,'admin2')).reviewCase:(await read(endpoint,'admin2')).control.workflow.cases.find(c=>c.id===caseId);
   assert.equal(auditedCase.status,'withdrawn');
   console.log('PASS '+name+': employee real Apply across two categories/groups; whole manual Save; fresh GET; fixed Submit; own Withdraw; full-content SHA '+hash(fixed.content));
   if(name==='IPQC-AB'){
    async function verifyGroups(id,status){
     const current=await f.core.readState(),root=JSON.parse(current.values.ipqcABMasterControl),all=Object.keys(fixed.content.scopes);assert.equal(root.moduleDraft.workflow.pendingId,null);
     assert.deepEqual(root.moduleDraft.workflow.working,fixed.content);
     for(const key of all){const s=root.scopes[key],v=s.versions.find(v=>v.id===id);assert.ok(v,key);assert.equal(v.status,status,key);assert.deepEqual(v.snapshot,fixed.content.scopes[key]);assert.equal(s.activeVersionId,fixed.content.bases[key]);assert.equal(s.versions.some(v=>['pending','pending-test'].includes(v.status)),false,key);assert.equal(v.history.filter(h=>h.action===status).length,1,key);
      const reopened=await begin('/api/ipqc-ab/workflow?scope='+encodeURIComponent(key));assert.equal(reopened.control.workflow.pendingId,null);assert.deepEqual(reopened.control.workflow.working,fixed.content.scopes[key],key+' reopens exact submitted content');}
     console.log('PASS IPQC-AB '+status+': all '+all.length+' groups unlocked, exact content, active IDs retained, one history result, editable fresh begin');
    }
    await verifyGroups(caseId,'withdrawn');
    const savedAgain=await send(endpoint,'save'),again=await send(endpoint,'submit',{savedId:savedAgain.control.workflow.saved.id,reason:'Isolated whole return verification'});
    await send(endpoint,'return',{caseId:again.receipt.caseId,reason:'ADMIN 2 returns employee whole module'},'admin2');
    await verifyGroups(again.receipt.caseId,'returned');
    const final=await read(endpoint,'admin2');assert.equal(final.control.workflow.cases.find(c=>c.id===caseId).status,'withdrawn');assert.equal(final.control.workflow.cases.find(c=>c.id===again.receipt.caseId).result.actor.id,'admin2');
   }
  }
 }finally{f.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

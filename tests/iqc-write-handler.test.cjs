/* oxlint-disable typescript/no-require-imports -- Isolated actual Workers handlers. */
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const fixture=require('../scripts/fqc-apply-fixture.cjs');
void test('IQC actual records writer: new item/photo/tool, replay, 404, CAS and revocation retain boundaries',async()=>{
 const f=await fixture(),logs=[],info=console.info;console.info=line=>logs.push(JSON.parse(line));
 try{
  const snapshot={categories:[{id:'c',nameVi:'Cat'}],suppliers:[],parts:[{id:'p',code:'P',nameVi:'Part',categoryId:'c',supplierIds:[],photos:[]}],errors:[{id:'e',code:'P-IQC-L1',partCode:'P',nameVi:'Error'}],items:[]};
  await f.mutate(values=>{const users=JSON.parse(values.platformUsers);for(const user of users)for(const op of ['view','edit','create','save','submit','withdraw','approve','return','delete'])user.accessOverrides['iqc.'+op]=true;values.platformUsers=JSON.stringify(users);values.iqcMasterControl=JSON.stringify({schemaVersion:1,activeVersionId:'a',versions:[{id:'a',number:1,status:'approved',snapshot,revision:1,history:[]}],issues:[],reservedErrorCodes:['P-IQC-L1'],reservedCheckNos:[]});const equipment=JSON.parse(values.routineEquipmentControl);equipment.versions[0].equipment=[{id:'tool-new',enabled:true,name:'New tool',assetCode:'SYN-2',pieceMark:'2'}];values.routineEquipmentControl=JSON.stringify(equipment);});
  const api=f.load('app/api/iqc/workflow/route.ts'),origin='https://synthetic.invalid',url=origin+'/api/iqc/workflow?caseMetadata=1&compact=1&projection=iqc-edit-v1';
  const call=async(body,query='')=>{const response=await api[body?'POST':'GET'](new Request(url+query,{method:body?'POST':'GET',headers:{cookie:f.cookies.editor,origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return {status:response.status,body:await response.json()};};
  const begin=await call({action:'begin'});assert.equal(begin.status,200);const generation=begin.body.control.workflow.generation;
  const photoId='a'.repeat(64);await f.env.STATE_ARCHIVE.put('iqc/photos/'+photoId,Buffer.from('synthetic-photo'));
  const command={operationId:randomUUID(),clientId:'iqc-isolated',sequence:1,generation,action:'apply',moduleAction:'createItem',input:{errorId:'e',nameVi:'Kiểm tra 中文',inspectionMode:'equipment',equipmentId:'tool-new',mediaItems:[{id:photoId,src:'/api/iqc/photo?id='+photoId}],rules:[{id:'r',cadence:'batch',kind:'aql',value:'1'}]}};
  // Force one ordinary CAS retry. The original command/ID remains identical.
  let raced=false;f.hooks.run=sql=>{if(!raced&&sql.startsWith('UPDATE shared_state')){raced=true;f.db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();}};
  const applied=await call({command});assert.equal(applied.status,200);assert(raced);delete f.hooks.run;
  const read=async()=>JSON.parse((await f.core.readState()).values.iqcMasterControl).workflow;
  let flow=await read();assert.equal(flow.working.items.length,1);assert.equal(flow.working.items[0].equipmentId,'tool-new');assert.equal(flow.working.items[0].mediaItems[0].id,photoId);assert.equal(flow.saved,null);
  const before=f.db.prepare('SELECT * FROM shared_state').get();const replay=await call({command});assert.equal(replay.status,200);assert.equal(replay.body.receipt.operationId,command.operationId);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);
  assert.equal((await call(null,'&operationId='+randomUUID())).status,404);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);
  f.revoke();const denied=await call({command:{...command,operationId:randomUUID(),sequence:2}});assert.equal(denied.status,401);assert.deepEqual(f.db.prepare('SELECT * FROM shared_state').get(),before);
  flow=await read();assert.equal(flow.working.items.length,1);assert.equal(flow.saved,null);
  const success=logs.find(log=>log.requestId===applied.body.requestId);assert(success);assert.equal(success.status,200);for(const stage of ['state-read','authorization','adapter-context','adapter-apply','photo-validation','version-projection','record-encode','state-cas','response'])assert(stage in success.stagesMs,stage);
  assert(!JSON.stringify(logs).includes('Kiểm tra'));assert(!JSON.stringify(logs).includes(photoId));assert(!JSON.stringify(logs).includes(command.operationId));
 }finally{console.info=info;f.close();}
});
void test('IQC timing is request-local, disabled for other scopes and failure-safe',()=>{
 const f=require('../scripts/ipqc-ab-import-harness.cjs')(),{iqcWriteTiming}=f('lib/iqc-write-timing.ts');let now=0;const lines=[];
 const timing=iqcWriteTiming(true,'request',()=>now,line=>lines.push(JSON.parse(line)));now=7;timing.mark('state-read');now=30;timing.finish(500);assert.equal(lines[0].stagesMs['state-read'],23);assert.equal(lines[0].totalMs,30);assert.equal(lines[0].lastStage,'state-read');
 iqcWriteTiming(false,'other',()=>now,()=>assert.fail()).finish(200);assert.doesNotThrow(()=>iqcWriteTiming(true,'failure',()=>now,()=>{throw Error('sink failed');}).finish(200));
});

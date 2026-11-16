// Actual handlers, isolated owned fixture; profiles are not Office measurements.
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('../scripts/quality-replacement-preview-fixture.cjs');
const {loadAt,base}=require('../scripts/quality-operation-speed-fixture.cjs');
const master={active:{AB:{products:[{code:'A1',name:'Synthetic',line:'A',category:'G',stages:['A-CUT']}],lines:[{code:'A',stages:[{code:'A-CUT',name:'Cut'}]}],categoryGroups:[{line:'A',name:'G',defaultStages:['A-CUT']}]},C:{products:[{code:'C1',name:'Synthetic',stages:['C-CUT']}],lines:[{code:'C',stages:[{code:'C-CUT',name:'Cut'}]}]}}};
const initialC={schemaVersion:1,activeVersionId:'synthetic-initial',source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'synthetic-initial',number:1,status:'approved',snapshot:{errors:[],items:[]},baseVersionId:null,revision:1,creatorId:'synthetic',creatorName:'Synthetic',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
async function setup(t,moduleName){const f=await fixture({masterDataControl:JSON.stringify(master),ipqcCMasterControl:JSON.stringify(initialC),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',processAccessControl:'{}',maintenanceMode:'0',...Object.fromEntries(Array.from({length:20},(_,i)=>['unrelated-'+i,JSON.stringify({id:i,keep:'synthetic'.repeat(1000)})]))},{includeIPQCC:true});t.after(()=>f.close());f.env.PROCESS_SESSION_REVOCATION_ENABLED='1';const scope=moduleName==='ipqc-ab'?'&scope=A%3AG':'';
 await f.begin(moduleName,'editor',200,scope);await f.command(moduleName,'apply',{moduleAction:'create-error',input:moduleName==='ipqc-ab'?{stageCode:'A-CUT',name:'Synthetic'}:{productCode:'C1',stageCode:'C-CUT',name:'Synthetic'}},'editor',200,scope);
 if(moduleName==='ipqc-ab')await f.begin(moduleName,'editor',200,'&module=1');return f;
}
const snap=f=>({row:{...f.db.prepare('SELECT * FROM shared_state').get()},objects:new Map(f.objects)});
function restore(f,s){f.db.prepare('UPDATE shared_state SET revision=?,"values"=?,updated_at=? WHERE id=1').run(s.row.revision,s.row.values,s.row.updated_at);f.objects.clear();for(const [key,value]of s.objects)f.objects.set(key,value);}
async function call(load,f,endpoint,method='GET',body,who='editor',query=''){const response=await load('app/api/'+endpoint+'/route.ts')[method](new Request('http://fixture/api/'+endpoint+query,{method,headers:f.sessions[who],...(body?{body:JSON.stringify(body)}:{})}));return{status:response.status,body:JSON.parse(JSON.stringify(load('lib/workflow-wire.ts').expandWorkflowPayload(await response.json())))};}

for(const moduleName of ['ipqc-ab','ipqc-c'])void test(moduleName+' current-main paired operation/readback profile',async t=>{
 const f=await setup(t,moduleName),query='?caseMetadata=1&compact=1'+(moduleName==='ipqc-ab'?'&module=1':'');let sequence=0;
 const get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE),prepare=f.env.DB.prepare.bind(f.env.DB),report=[];let metrics,labels;
 const delay=Number(process.env.QUALITY_FIXTURE_DELAY_MS||0),jitter=process.env.QUALITY_FIXTURE_JITTER==='1';
 f.env.STATE_ARCHIVE.get=async key=>{const label=labels.get(key)||'immutable-body';metrics.gets[label]=(metrics.gets[label]||0)+1;if(delay)await new Promise(r=>setTimeout(r,delay*(jitter?1+parseInt(key.slice(-7,-5),16)%8:1)));const obj=await get(key);return obj&&{...obj,text:async()=>{const raw=await obj.text();metrics.bytes[label]=(metrics.bytes[label]||0)+Buffer.byteLength(raw);return raw;}};};
 f.env.DB.prepare=sql=>{const s=prepare(sql);if(sql.includes('FROM process_revoked_sessions')){const first=s.first.bind(s);s.first=async()=>{metrics.revocations++;if(delay)await new Promise(r=>setTimeout(r,delay));return first();};}return s;};
 function reset(){metrics={gets:{},bytes:{},revocations:0};labels=new Map();for(const [key,ref]of Object.entries(JSON.parse(snap(f).row.values).__processRecords?.values||{}))labels.set(ref.key,[labels.get(ref.key),key].filter(Boolean).join('|'));}reset();
 async function pair(action,command,actor='editor',endpoint=moduleName+'/workflow',readQuery=query){
  const snapshot=snap(f),now=Date.now(),rows=[];let expected,state;
  for(const old of [true,false]){restore(f,snapshot);const load=loadAt(f.env,old,now);load('app/api/'+endpoint+'/route.ts');reset();const start=performance.now(),result=await call(load,f,endpoint,command?'POST':'GET',command?{command}:undefined,actor,readQuery),ms=performance.now()-start;
   assert.equal(result.status,200,action+':'+JSON.stringify(result));if(old){expected=result;state=snap(f).row;}else{assert.deepEqual(result,expected);assert.deepEqual(snap(f).row,state);}rows.push({source:old?base:'candidate',ms,...structuredClone(metrics)});
  }assert.deepEqual(rows[1].gets,rows[0].gets);assert.deepEqual(rows[1].bytes,rows[0].bytes);report.push({action,measurements:rows});
 }
 for(const action of ['save','submit','withdraw']){
  const read=await f.read(moduleName,'editor',moduleName==='ipqc-ab'?'&module=1':''),flow=f.flow(read);
  const command={action,operationId:randomUUID(),clientId:'quality-profile',sequence:++sequence,generation:flow.generation,expectedRevision:flow.revision,input:{stateRevision:read.revision},reason:'Synthetic profile',...(action==='submit'?{savedId:flow.saved.id}:{}),...(action==='withdraw'?{caseId:flow.pendingId}:{})};
  if(action==='save'&&moduleName==='ipqc-ab'){
   const group=await f.read(moduleName,'editor','&scope=A%3AG'),g=group.control.workflow,row=g.working.errors[0],path=['errors',{id:row.id},'name'];
   command.moduleAction='save-local-v1';command.input.scopes=[{scope:'A:G',generation:g.generation,baseId:group.control.activeVersionId,changes:[{patches:[{op:'set',path,value:'Profile renamed'}],guards:[{path,value:row.name}]}]}];
  }
  await pair(action,command);await pair(action+' workflow GET');await pair(action+' domain GET',undefined,'editor',moduleName,'?caseMetadata=1');await pair(action+' permissions GET',undefined,'editor',moduleName+'/workflow',query+'&permissions=1');
 }
 t.diagnostic(JSON.stringify({fixture:{normalCreatedErrors:1,unrelatedAggregates:20,unrelatedStringCharactersEach:9000,delayMs:delay,jitter},report}));
});

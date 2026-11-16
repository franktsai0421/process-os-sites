/* Paired real handlers over isolated generated records. No hosted timing claim. */
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const fixture=require('../scripts/fqc-apply-fixture.cjs'),{base,loadAt,snap,restore}=require('../scripts/quality-operation-speed-fixture.cjs');
for(const moduleName of ['fqc','process-authoring'])void test(moduleName+' same-snapshot lifecycle, content checks and bootstrap comparisons',async t=>{
 const f=await fixture();t.after(()=>f.close());const w=JSON.stringify(['Synthetic','A']),size=Number(process.env.QUALITY_FIXTURE_OPERATIONS||100);
 if(moduleName==='process-authoring')await f.mutate(values=>{
  const users=JSON.parse(values.platformUsers),keys=require('../public/process/access-policy.mjs').accessKeys;for(const u of users){u.lines=['A','B','C'];u.role='admin';for(const key of keys)u.accessOverrides[key]=true;}values.platformUsers=JSON.stringify(users);
  const rows=Array.from({length:size},(_,i)=>({id:'op'+i,stageCode:'S',name:'Operation '+i,editorType:'manual',productCodes:[],nextIds:i+1<size?['op'+(i+1)]:[],x:i})),content={workspaces:[{id:w,category:'Synthetic',line:'A',stages:{S:rows}}]},workflow=f.load('lib/shared-draft.ts').createSharedDraft('process:platform',content,null,randomUUID());
  values.masterDataControl=JSON.stringify({active:{AB:{products:[],lines:[{code:'A',stages:[{code:'S'}]}],categoryGroups:[]},C:{products:[],lines:[],categoryGroups:[]},PROCESS:{}},versions:[]});values.bomOverrides=JSON.stringify({replaceAll:true,data:{}});
  values.processAuthoringControl=JSON.stringify({activeVersionId:null,versions:[{id:'draft',number:1,status:'draft',snapshot:content,history:[],revision:0}],workflow});
 });
 await f.mutate(values=>{for(let i=0;i<20;i++)values['unrelated-'+i]=JSON.stringify({id:i,working:{text:'synthetic'.repeat(1000)}});});
 const query='?caseMetadata=1&compact=1'+(moduleName==='process-authoring'?'&channel=canvas-v2':'');
 async function call(load,body,suffix=query){const response=await load('app/api/'+moduleName+'/workflow/route.ts')[body?'POST':'GET'](new Request('https://synthetic.invalid/api/'+moduleName+'/workflow'+suffix,{method:body?'POST':'GET',headers:{cookie:f.cookies.editor,origin:'https://synthetic.invalid','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));return{status:response.status,body:JSON.parse(JSON.stringify(load('lib/workflow-wire.ts').expandWorkflowPayload(await response.json())))};}
 if(moduleName==='fqc')assert.equal((await call(f.load,{action:'begin'})).status,200);
 const delay=Number(process.env.QUALITY_FIXTURE_DELAY_MS||0),get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE),prepare=f.env.DB.prepare.bind(f.env.DB);let counts={},seq=0;
 const reset=()=>{counts={gets:0,bytes:0,revocation:0,cas:0};};reset();
 f.env.STATE_ARCHIVE.get=async key=>{counts.gets++;if(delay)await new Promise(r=>setTimeout(r,delay));const obj=await get(key);return obj&&{...obj,text:async()=>{const raw=await obj.text();counts.bytes+=Buffer.byteLength(raw);return raw;}};};
 f.env.DB.prepare=sql=>{const s=prepare(sql);if(sql.includes('FROM process_revoked_sessions')){const first=s.first.bind(s);s.first=async()=>{counts.revocation++;if(delay)await new Promise(r=>setTimeout(r,delay));return first();};}if(sql.startsWith('UPDATE shared_state')){const run=s.run.bind(s);s.run=async()=>{counts.cas++;return run();};}return s;};
 const report=[];
 async function paired(label,body,suffix=query){const snapshot=snap(f),now=Date.now(),measurements=[];let expected,row;
  for(const old of [true,false]){restore(f,snapshot);const load=loadAt(f.env,old,now);load('app/api/'+moduleName+'/workflow/route.ts');reset();const start=performance.now(),result=await call(load,body,suffix),ms=performance.now()-start;assert.equal(result.status,200,label+JSON.stringify(result));
   if(old){expected=result;row=snap(f).row;}else{assert.deepEqual(result,expected);assert.deepEqual(snap(f).row,row);}assert.equal(counts.cas,body?1:0);measurements.push({source:old?base:'candidate',ms,...counts});
  }assert.equal(measurements[1].gets,measurements[0].gets);assert.equal(measurements[1].bytes,measurements[0].bytes);report.push({label,measurements});return expected.body;
 }
 for(const action of ['save','submit','withdraw']){
  const current=(await call(f.load)).body,flow=current.control.workflow,path=moduleName==='fqc'?['items',{id:'item'},'description']:['workspaces',{id:w},'stages','S',{id:'op0'},'nextIds'];
  const command={action,operationId:randomUUID(),clientId:'quality-process-paired',sequence:++seq,generation:flow.generation,expectedRevision:flow.revision,reason:'Synthetic',...(action==='save'?{action:moduleName==='fqc'?'save':'apply',moduleAction:moduleName==='fqc'?'save-local-v1':'save-canvas-v1',...(moduleName==='process-authoring'?{source:'canvas-v2:'+JSON.stringify([w,'S'])}:{}),patches:[{op:'set',path,value:moduleName==='fqc'?'Changed':[]}],guards:[{path,value:moduleName==='fqc'?'Synthetic description':['op1']}]}:{}),...(action==='submit'?{savedId:flow.saved.id}:{}),...(action==='withdraw'?{caseId:flow.pendingId}:{} )};
  if(moduleName==='fqc'&&action==='save')command.input={matrixCells:[]};
  await paired(action,{command},action==='save'?query:'?caseMetadata=1&compact=1');await paired(action+' readback');if(moduleName==='process-authoring')await paired(action+' contentIssues',undefined,'?contentIssues=1');
 }
 if(moduleName==='process-authoring'){
  const before=snap(f),now=Date.now(),measurements=[];let expected;
  for(const old of [true,false]){const load=loadAt(f.env,old,now),route=load('app/api/process-bootstrap/route.ts');reset();const start=performance.now(),response=await route.GET(new Request('https://synthetic.invalid/api/process-bootstrap?view=editor',{headers:{cookie:f.cookies.editor,'X-Process-Media':'deferred-v1'}})),text=await response.text(),ms=performance.now()-start;assert.equal(response.status,200,text);if(old)expected=text;else assert.equal(text,expected);assert.deepEqual(snap(f).row,before.row);measurements.push({source:old?base:'candidate',ms,responseBytes:Buffer.byteLength(text),...counts});}
  report.push({label:'editor bootstrap',measurements});
 }
 t.diagnostic(JSON.stringify({moduleName,size,delayMs:delay,method:'same initial snapshot/command/clock/UUID, complete DTO and persisted bytes equality; artificial GET/revocation latency',report}));
});

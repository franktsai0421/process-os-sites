const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('../scripts/quality-replacement-preview-fixture.cjs');
const json=value=>JSON.parse(JSON.stringify(value));
const browser={};vm.runInNewContext(fs.readFileSync('public/process/quality-read-wire.js','utf8'),{window:browser});
const expand=value=>json(browser.expandQualityReadPayload(value));
const master={active:{AB:{products:[{code:'A1',name:'Synthetic',line:'A',category:'G',stages:['A-CUT']}],lines:[{code:'A',stages:[{code:'A-CUT',name:'Cut'}]}],categoryGroups:[{line:'A',name:'G',defaultStages:['A-CUT']}]},C:{products:[{code:'C1',name:'Synthetic',stages:['C-CUT']}],lines:[{code:'C',stages:[{code:'C-CUT',name:'Cut'}]}]}}};
const initialC={schemaVersion:1,activeVersionId:'synthetic-initial',source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[{id:'synthetic-initial',number:1,status:'approved',snapshot:{errors:[],items:[]},baseVersionId:null,revision:1,creatorId:'synthetic',creatorName:'Synthetic',createdAt:'fixture',updatedAt:'fixture',history:[]}]};
async function setup(t,moduleName){const f=await fixture({masterDataControl:JSON.stringify(master),ipqcCMasterControl:JSON.stringify(initialC),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',processAccessControl:'{}',maintenanceMode:'0',...Object.fromEntries(Array.from({length:20},(_,i)=>['unrelated-'+i,JSON.stringify({id:i,keep:'synthetic'.repeat(1000)})]))},{includeIPQCC:true});t.after(()=>f.close());f.env.PROCESS_SESSION_REVOCATION_ENABLED='1';const scope=moduleName==='ipqc-ab'?'&scope=A%3AG':'';
 await f.begin(moduleName,'editor',200,scope);await f.command(moduleName,'apply',{moduleAction:'create-error',input:moduleName==='ipqc-ab'?{stageCode:'A-CUT',name:'Synthetic'}:{productCode:'C1',stageCode:'C-CUT',name:'Synthetic'}},'editor',200,scope);
 if(moduleName==='ipqc-ab')await f.begin(moduleName,'editor',200,'&module=1');return f;
}

for(const moduleName of ['ipqc-ab','ipqc-c'])void test(moduleName+' actual domain read transport, body identity, no writes and denied reads',async t=>{
 const f=await setup(t,moduleName),qualityModule=moduleName==='ipqc-ab'?'AB':'C',route=f.load('app/api/'+moduleName+'/route.ts');
 const reads=[],get=f.env.STATE_ARCHIVE.get.bind(f.env.STATE_ARCHIVE);
 f.env.STATE_ARCHIVE.get=async key=>{reads.push(key);return get(key);};
 async function call(enabled,who='editor',query='?caseMetadata=1'){
  reads.length=0;const start=performance.now();const r=await route.GET(new Request('http://fixture/api/'+moduleName+query,{headers:{...f.sessions[who],...(enabled?{'X-Process-Quality-Read':'compact-v1'}:{})}}));const raw=await r.text();return{status:r.status,body:JSON.parse(raw),bytes:Buffer.byteLength(raw),ms:performance.now()-start,reads:[...reads]};
 }
 const snapshot=f.snapshot(),plain=await call(false),wire=await call(true);
 assert.equal(plain.status,200);assert.equal(wire.status,200);assert.equal(wire.body.qualityReadWire,1);assert.deepEqual(expand(wire.body),plain.body);assert.deepEqual(wire.reads,plain.reads);assert.deepEqual(f.snapshot(),snapshot);
 for(const who of ['no-view']){const a=await call(false,who),b=await call(true,who);assert.equal(a.status,403);assert.equal(b.status,a.status);assert.deepEqual(b.body,a.body);assert.deepEqual(b.reads,a.reads);}
 const legacy=await call(true,'editor','');assert.equal(legacy.status,200);assert.equal(legacy.body.qualityReadWire,undefined);
 // Scale a complete handler-produced DTO, retaining all fields; this is an
 // isolated transport/serialization fixture, not a storage or live latency claim.
 const large=json(plain.body),controls=qualityModule==='AB'?[...Object.values(large.control.scopes),large.control.moduleDraft].filter(Boolean):[large.control];
 for(const control of controls){const flow=control.workflow;if(!flow)continue;const seed=flow.working.errors?.[0];if(!seed)continue;
  const content={...flow.working,errors:Array.from({length:1000},(_,i)=>({...seed,id:'synthetic-'+i,name:'Synthetic '+i+' '+ '檢驗說明'.repeat(400)}))};
  flow.working=json(content);flow.active.content=json(content);if(flow.saved)flow.saved.content=json(content);
  for(const version of control.versions)version.snapshot=json(content);
 }
 const codec=f.load('lib/quality-read-wire.ts'),rows=[];
 for(let round=1;round<=3;round++)for(const enabled of [false,true]){const start=performance.now(),raw=JSON.stringify(codec.qualityReadPayload(large,qualityModule,enabled)),encodedMs=performance.now()-start,decodeStart=performance.now(),decoded=expand(JSON.parse(raw));assert.deepEqual(decoded,large);rows.push({round,enabled,bytes:Buffer.byteLength(raw),encodedMs,decodeMs:performance.now()-decodeStart});}
 assert(rows[1].bytes<rows[0].bytes,'large live versions actually deduplicated');
 const decoded=expand(codec.qualityReadPayload(large,qualityModule,true)),c=qualityModule==='AB'?Object.values(decoded.control.scopes).find(c=>c.workflow):decoded.control;
 c.workflow.working.errors[0].name='mutable edit';assert.notEqual(c.workflow.active.content.errors[0].name,'mutable edit');assert.notEqual(c.versions[0].snapshot.errors[0].name,'mutable edit');
 assert.deepEqual(f.snapshot(),snapshot);t.diagnostic(JSON.stringify({qualityModule,actualSmall:{plainBytes:plain.bytes,wireBytes:wire.bytes},syntheticTransport:{items:1000,rows}}));
 // Storage failure remains a failure through both representations.
 const key=wire.reads.find(key=>f.objects.has(key));assert(key);f.objects.delete(key);
 const a=await call(false),b=await call(true);assert.equal(a.status,503);assert.equal(b.status,a.status);assert.deepEqual(b.body,a.body);
});
void test('quality read transport rejects malformed envelopes and references',()=>{
 for(const body of [
 {qualityReadWire:2,payload:{}},{qualityReadWire:1,module:'bad',payload:{}},
 {qualityReadWire:1,module:'AB',payload:{control:{}},scopes:[['a',{control:{}}],['a',{control:{}}]]},
 {qualityReadWire:1,module:'C',payload:{wireVersion:1,liveContent:{},control:{body:{__liveContent:'missing'}}}},
 {qualityReadWire:1,module:'C',payload:{wireVersion:1,liveContent:{a:{}},control:{body:{__liveContent:'a#missing'}}}},
 {qualityReadWire:1,module:'C',payload:{wireVersion:1,liveContent:{a:{}},control:{body:{__liveContent:'a#b#c'}}}},
 ])assert.throws(()=>expand(body),/INVALID_QUALITY_READ_RESPONSE/);
 assert.deepEqual(expand({old:true}),{old:true});
});

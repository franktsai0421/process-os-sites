/* Actual GET, private SQLite/R2, representative C. Optional delay models remote GET; not live timing. */
const assert=require('node:assert/strict');const {fixture}=require('./ipqc-c-operation-fixture.cjs');
const delayMs=Number(process.env.IPQCC_MODEL_GET_DELAY_MS||0);
assert(Number.isFinite(delayMs)&&delayMs>=0&&delayMs<=1000);
const snapshot={errors:Array.from({length:869},(_,i)=>({id:'e'+i,code:'C100-C-CUT-L'+(i+1),productCode:'C100',stageCode:'C-CUT',name:'Synthetic '+i,note:'',reason:'',deleted:false})),items:Array.from({length:866},(_,i)=>({id:'i'+i,code:'C100-C-CUT-L'+(i+1)+'-01',errorId:'e'+i,productCode:'C100',stageCode:'C-CUT',standard:'10',standardEnabled:true,cpkEnabled:false,description:'Synthetic '+i,note:'',reason:'',tool:'',method:'',frequency:'',rule:{cadence:'batch',batchKind:'fixed_count',fixedCount:'3'},notApplicable:false,deleted:false,mediaItems:[]}))};
const version={id:'formal',number:27,status:'approved',snapshot,baseVersionId:null,revision:1,creatorId:'synthetic',creatorName:'Synthetic',createdAt:'fixture',updatedAt:'fixture',history:[]};
(async()=>{const extras={};for(let i=0;i<5;i++)extras['syntheticModule'+i]=JSON.stringify({activeVersionId:'a'+i,workflow:{},versions:[{...version,id:'a'+i,snapshot:{errors:[{id:'other'+i}],items:[]}}]});
 const h=await fixture({...extras,ipqcCMasterControl:JSON.stringify({schemaVersion:1,activeVersionId:'formal',source:null,issues:[],reservedErrorCodes:[],reservedItemCodes:[],versions:[version]}),masterDataControl:JSON.stringify({active:{C:{products:[{code:'C100',stages:['C-CUT']}]}}})});try{
 await h.begin('ipqc-c');await h.command('ipqc-c','apply',{patches:[{op:'set',path:['items',{id:'i0'},'note'],value:'Synthetic archive change'}],guards:[{path:['items',{id:'i0'},'note'],value:''}]});await h.command('ipqc-c','save');
 for(let i=0;i<2;i++){const f=h.flow(await h.read('ipqc-c'));const s=await h.command('ipqc-c','submit',{savedId:f.saved.id,reason:'synthetic archive'});await h.command('ipqc-c','withdraw',{caseId:s.receipt.caseId,reason:'synthetic archive'});}
 h.env.PROCESS_SESSION_REVOCATION_ENABLED='1';
 const flow=h.flow(await h.read('ipqc-c')),since=flow.generation+':'+flow.revision,query='?caseMetadata=1&compact=1';
 const originalGet=h.env.STATE_ARCHIVE.get.bind(h.env.STATE_ARCHIVE),originalRead=h.core.readState;let modelEnabled=true,overlap=false,events=[],inFlight=0,maximum=0,dbReads=0,dbKinds={},onGet=null;
 const prepare=h.env.DB.prepare.bind(h.env.DB);h.env.DB.prepare=sql=>{const statement=prepare(sql),first=statement.first.bind(statement);statement.first=async(...args)=>{dbReads++;const kind=sql.includes('process_revoked_sessions')?'session-revocation':sql.includes('shared_state')?'shared-state':'other';dbKinds[kind]=(dbKinds[kind]||0)+1;return first(...args);};return statement;};
 h.core.readState=options=>originalRead(overlap?options:{...options,aggregateReadAhead:false});
 h.env.STATE_ARCHIVE.get=async key=>{const event={key,start:performance.now()};events.push(event);maximum=Math.max(maximum,++inFlight);try{if(delayMs&&modelEnabled)await new Promise(resolve=>setTimeout(resolve,delayMs));if(onGet)await onGet(key);return await originalGet(key);}finally{event.end=performance.now();inFlight--;}};
 async function run(mode,q=query,who='editor',expected=200){overlap=mode==='after';events=[];maximum=0;dbReads=0;dbKinds={};const before=h.snapshot(),start=performance.now();const body=await h.call('ipqc-c/workflow','GET',undefined,who,expected,q);const result={mode,ms:performance.now()-start,gets:events.length,maxInFlight:maximum,dbReads,dbKinds,keys:events.map(e=>e.key).sort((a,b)=>a<b?-1:a>b?1:0),body};assert.deepEqual(h.snapshot(),before);return result;}
 const before=await run('before'),after=await run('after');modelEnabled=false;assert.deepEqual(after.body,before.body);assert.equal(after.body.workflow.generation,flow.generation);assert(after.body.workflow.working.items.length===866);assert.deepEqual(after.keys,before.keys);assert(after.maxInFlight>before.maxInFlight);
 // The supported normal read benefits without a timer or since. Other selectors stay excluded.
 const observed=[],savedRead=h.core.readState;h.core.readState=options=>{observed.push(options);return savedRead(options);};
 await run('after','?caseMetadata=1');assert(!observed.at(-1).aggregateReadAhead);
 await run('after',query+'&operationId=not-an-operation','editor',404);assert(!observed.at(-1).aggregateReadAhead);
 for(const suffix of ['&permissions=1','&history=cases','&caseId=missing','&versionId=missing','&restoreSaveId=missing','&legacyHistory=1','&readback=ipqc-c-create-v1','&uiHistory=1','&unrecognized=1']){
  const outputs=[];for(const mode of ['before','after']){overlap=mode==='after';const response=await h.load('app/api/ipqc-c/workflow/route.ts').GET(new Request('http://fixture/api/ipqc-c/workflow'+query+suffix,{headers:h.sessions.editor}));outputs.push({status:response.status,body:await response.json()});assert(!observed.at(-1).aggregateReadAhead);}
  assert.deepEqual(outputs[0],outputs[1]);
 }
 const unchangedBefore=await run('before',query+'&since='+encodeURIComponent(since)),unchangedAfter=await run('after',query+'&since='+encodeURIComponent(since));assert.deepEqual(unchangedBefore.body,unchangedAfter.body);assert.equal(unchangedAfter.body.unchanged,true);
 await run('after',query,'viewer');assert.equal(observed.at(-1).aggregateReadAhead,true);
 let faultCases=0;
 for(const key of before.keys){const original=h.objects.get(key);for(const missing of [false,true]){
  if(missing)h.objects.delete(key);else h.objects.set(key,Buffer.from('synthetic corrupt object'));
  const a=await run('before',query,'editor',503),b=await run('after',query,'editor',503);assert.deepEqual(a.body,b.body);faultCases++;
  h.objects.set(key,original);
 }}
 const users=JSON.parse((await originalRead()).values.platformUsers);users.find(u=>u.id==='preview-viewer').enabled=false;
 const current=await originalRead();const values={...current.values,platformUsers:JSON.stringify(users)};const encoded=await h.core.encodeValues(values,current);h.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(encoded);
 await run('after',query,'viewer',403);
 const cookie=h.sessions['edit-only'].Cookie,token=cookie.slice(cookie.indexOf('=')+1);
 await h.load('lib/session-revocation.ts').revokeSession(token,Date.now()+600000);
 await run('before',query,'edit-only',403);await run('after',query,'edit-only',403);
 for(const [mode,who]of [['before','save-only'],['after','submit-only']]){
  let changed=false;onGet=async()=>{if(changed)return;changed=true;const cookie=h.sessions[who].Cookie;await h.load('lib/session-revocation.ts').revokeSession(cookie.slice(cookie.indexOf('=')+1),Date.now()+600000);};
  await run(mode,query,who,403);assert(changed);onGet=null;
 }
 console.log(JSON.stringify({rows:1735,archiveCases:2,faultCases,midReadSessionRevocationChecks:2,sessionRevocationEnabled:true,delayMs,before:{ms:before.ms,gets:before.gets,maxInFlight:before.maxInFlight,dbReads:before.dbReads,dbKinds:before.dbKinds},after:{ms:after.ms,gets:after.gets,maxInFlight:after.maxInFlight,dbReads:after.dbReads,dbKinds:after.dbKinds},equalPayload:true,equalObjectReadSet:true,limits:'Synthetic per-GET delay only; no live or CPU/storage decomposition. All selected aggregates/bodies retained; no cross-request cache. Normal compact reads need no since/timer. Tests also cover unchanged since, excluded selectors, fresh view revocation and revoked sessions.'},null,2));
 }finally{h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

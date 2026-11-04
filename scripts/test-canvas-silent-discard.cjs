const assert=require('node:assert/strict');
const {setup}=require('./test-canvas-unknown-recovery.cjs');
(async()=>{
 const scopeFixture=await setup(),J=scopeFixture.context.CanvasJournal;
 const base={workspaces:[{id:'w',stages:{S:[{id:'a',x:0}],T:[{id:'b',x:0}]}}]},j=new J(base);
 j.edit('w','S',[{id:'a',f:'x',value:1}]);const sentScope=j.freeze('w','S');j.sent(sentScope);
 j.edit('w','S',[{id:'a',f:'x',value:2}]);j.edit('w','T',[{id:'b',f:'x',value:3}]);
 j.forms[JSON.stringify(['w','S','a'])]={draft:'unsent form'};j.forms[JSON.stringify(['w','T','b'])]={draft:'other form'};
 j.discardUnsent('w','S');assert.equal(j.pending,sentScope);assert.equal(j.project('w','S')[0].x,1);assert.equal(j.project('w','T')[0].x,3);assert.equal(Object.keys(j.forms).length,1);assert.equal(j.unsent(),true);
 const f=await setup();f.edit();f.setPhase('committed-lost');await assert.rejects(f.local.sync());
 const original=f.record(),sent=f.isolated().sent,command=f.command(),transport=f.local.departureTransports()[0];
 f.local.edit(f.w,'A-CUT',[{id:'node-0',f:'x',value:999},{id:'node-0',f:'name',value:'unsent'}]);
 f.local.flushRecovery();
 const lease=f.local.lockForDeparture();assert.equal(f.local.departureReady(lease),false);
 await f.local.discardUnsentForDeparture(f.context.ProcessAuthoringV3.flow(),lease);
 assert.equal(f.local.departureReady(lease),true);assert.equal(f.local.pending(),true);assert.equal(f.local.dirty(),true);assert.equal(f.unknown().unknown,true);
 assert.deepEqual(f.record(),original);assert.deepEqual(f.isolated().sent,sent);assert.deepEqual(f.isolated().payload.entries,sent.entries);
 assert.equal(f.requests.filter(r=>r.method==='POST').length,1);
 lease.release();f.setPhase('recovery-success');await f.local.sync();
 assert.equal(f.local.pending(),false);assert.equal(f.local.dirty(),false);assert.equal(f.requests.filter(r=>r.method==='POST').length,1);
 const g=await setup();g.edit();g.setPhase('not-committed-lost');await assert.rejects(g.local.sync());
 const originalMissing=g.record(),lease2=g.local.lockForDeparture();await g.local.discardUnsentForDeparture(g.context.ProcessAuthoringV3.flow(),lease2);
 g.local.resetForDeparture(lease2);assert.deepEqual(g.record(),originalMissing);assert.equal(g.unknown().unknown,true);lease2.release();
 for(const unknown of [false,true])for(const quota of [false,true]){
  const n=await setup();n.edit();if(unknown){n.setPhase('committed-lost');await assert.rejects(n.local.sync());n.local.edit(n.w,'A-CUT',[{id:'node-0',f:'name',value:'native unsent'}]);}n.local.flushRecovery();
  const beforeNative=[...n.store],anchorBefore=unknown?n.record():null,originalSet=n.context.localStorage.setItem;
  if(quota)n.context.localStorage.setItem=()=>{throw Error('quota');};
  let held=null,abandoned=false;
  n.context.ProcessDeliveryNavigation={canUnloadWithoutPrompt(){if(abandoned)return true;try{held=n.local.lockForDeparture();n.local.discardUnsentForDeparture(n.context.ProcessAuthoringV3.flow(),held);abandoned=true;return true;}catch{held?.release();held=null;return false;}}};
  let prevented=false;n.emit('beforeunload',{preventDefault(){prevented=true;}});
  assert.equal(prevented,quota,'native warning is suppressed only after durable cleanup');
  if(quota){assert.deepEqual([...n.store],beforeNative);assert.equal(n.local.dirty(),true);n.context.localStorage.setItem=originalSet;}
  else {n.emit('pagehide');if(unknown){assert.deepEqual(n.record(),anchorBefore);assert.deepEqual(n.isolated().payload.entries,n.isolated().sent.entries);assert.equal(n.unknown().unknown,true);}else assert.equal(Object.keys(n.record().payload.entries).length,0);
   held?.release();n.emit('pageshow',{persisted:true});await n.local.recoveryReady();
   const restored=n.local.project(n.w,'A-CUT',n.model().working.workspaces[0].stages['A-CUT'])[0];assert.equal(restored.name,undefined,'BFCache cannot resurrect abandoned native input');assert.equal(restored.x,unknown?500:100);
  }
  held?.release();
 }
 const late=await setup();late.edit();late.setPhase('committed-lost');await assert.rejects(late.local.sync());late.local.edit(late.w,'A-CUT',[{id:'node-0',f:'name',value:'Retain after late tamper'}]);late.local.flushRecovery();
 const lateAnchor=[...late.store].find(([,raw])=>JSON.parse(raw).kind==='unknown'),lateSet=late.context.localStorage.setItem,lateLease=late.local.lockForDeparture();let tampered=false;
 late.context.localStorage.setItem=(key,value)=>{lateSet(key,value);if(!tampered&&JSON.parse(value).kind==='isolated'){tampered=true;late.store.set(lateAnchor[0],lateAnchor[1]+' ');}};
 assert.throws(()=>late.local.discardUnsentForDeparture(late.context.ProcessAuthoringV3.flow(),lateLease),/CANVAS_RECEIPT_REQUIRED/);
 assert.equal(late.local.project(late.w,'A-CUT',late.model().working.workspaces[0].stages['A-CUT'])[0].name,'Retain after late tamper');assert.equal(late.store.get(lateAnchor[0]),lateAnchor[1]+' ','late external evidence is untouched');assert.equal(late.unknown().unknown,true);lateLease.release();
 const rollback=await setup();rollback.edit();rollback.local.flushRecovery();const rollbackBytes=[...rollback.store],rollbackLease=rollback.local.lockForDeparture();assert.throws(()=>rollback.local.discardUnsentForDeparture(rollback.context.ProcessAuthoringV3.flow(),rollbackLease,()=>{throw Error('editor changed');}),/editor changed/);assert.equal(rollback.local.dirty(),true);assert.deepEqual([...rollback.store],rollbackBytes);rollbackLease.release();
 assert(command.operationId&&transport);console.log('PASS silent discard retains sent batch, unknown marker, GET recovery; runtime release retains missing-receipt marker');
})().catch(error=>{console.error(error);process.exitCode=1;});

import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
const require=createRequire(import.meta.url),{fixture}=require('../scripts/equipment-atomic-fixture.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
const path=field=>['equipment',{id:'source'},field];
const change=(field,before,value)=>({patches:[{op:'set',path:path(field),value}],guards:[{path:path(field),value:before}]});
const atomic=(h,detail,who='editor',expected=200)=>h.command('routine-equipment','save',{moduleAction:'save-local-v1',...detail},who,expected);
const source=c=>c.workflow.working.equipment.find(r=>r.id==='source');

void test('one atomic Save includes hierarchy, server allocation, calibration and photos; exact replay never allocates twice',async()=>{
 const h=await fixture();try{
 const before=await h.state(),png=require('./photo-fixtures.mjs').pngFixture({width:8,height:8});
 const put=await h.call('/api/routine-equipment/photo',{method:'PUT',headers:{'Content-Type':'image/png'},body:png});assert.equal(put.status,200);const {id:photoId}=await put.json();
 const patches=[{op:'insert',path:['categories'],value:{id:'new-cat',name:'新類別',photoId}},{op:'insert',path:['subcategories'],value:{id:'new-sub',categoryId:'new-cat',name:'Phân nhóm',photoId}},{op:'insert',path:['groups'],value:{id:'new-group',categoryId:'new-cat',subcategoryId:'new-sub',name:'新群組',photoId}},...['a','b'].map(id=>({op:'insert',path:['equipment'],value:{id:'new-'+id,assetCode:'SYN-SAME',groupId:'new-group',name:'設備 '+id,unit:'台',enabled:true,confirmed:false,calibrationMethod:'internal',calibrationCycle:'monthly',calibratedAt:'2026-11-01',expiresAt:'2026-12-01',photoId}}))];
 const command={operationId:randomUUID(),clientId:'atomic-fixture',sequence:1,generation:before.workflow.generation,action:'save',moduleAction:'save-local-v1',patches,guards:[]};
 const revision=h.db.prepare('SELECT revision FROM shared_state').get().revision;
 const r=await h.call('/api/routine-equipment/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command})});assert.equal(r.status,200,await r.clone().text());const result=await r.json(),after=await h.state();
 assert.equal(h.db.prepare('SELECT revision FROM shared_state').get().revision,revision+1);assert.deepEqual(after.workflow.saved.content,after.workflow.working);assert.equal((await h.persisted()).workflow.saves.length,2);assert.equal(after.workflow.working.categories.find(r=>r.id==='new-cat').code,'C02');assert.deepEqual(after.workflow.working.equipment.filter(r=>r.assetCode==='SYN-SAME').map(r=>r.pieceMark),['01','02']);
 const replay=await h.call('/api/routine-equipment/workflow?caseMetadata=1',{method:'POST',body:JSON.stringify({command})});assert.equal(replay.status,200);assert.deepEqual((await replay.json()).receipt,result.receipt);assert.deepEqual(await h.state(),after);
 const image=await h.load('app/api/routine-equipment/photo/route.ts').GET(new Request('http://fixture/api/routine-equipment/photo?id='+photoId,{headers:h.sessions.editor}));assert.equal(image.status,200);assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 }finally{h.close();}
});

void test('failed final Save cannot leak partial Apply or allocation',async()=>{const h=await fixture();try{const before=await h.state(),r=await atomic(h,{...change('name',source(before).name,'must roll back'),reason:42},'editor',500);assert(r.error);assert.deepEqual(await h.state(),before);}finally{h.close();}});

void test('different fields merge, same field rejects against original guard and Save keeps peer content',async()=>{const h=await fixture();try{
 const before=await h.state(),name=source(before).name;await atomic(h,change('owner',source(before).owner,'Peer'));await atomic(h,change('name',name,'Local'));
 let c=await h.state();assert.equal(source(c).owner,'Peer');assert.equal(source(c).name,'Local');assert.deepEqual(c.workflow.saved.content,c.workflow.working);
 await atomic(h,change('name',name,'Stale'),'editor',409);c=await h.state();assert.equal(source(c).name,'Local');
 }finally{h.close();}});

void test('edit permits Save, distinct create/delete/submit grants and photo backend remain enforced',async()=>{const h=await fixture();try{
 const before=await h.state();await atomic(h,change('name',source(before).name,'Edit only'),'edit-only');
 await atomic(h,{patches:[{op:'insert',path:['categories'],value:{id:'no-create',name:'Denied'}}],guards:[]},'edit-only',403);
 await atomic(h,{patches:[{op:'remove',path:['equipment',{id:'source'}]}],guards:[{path:['equipment',{id:'source'}],value:source(await h.state())}]},'edit-only',403);
 await h.command('routine-equipment','submit',{savedId:(await h.state()).workflow.saved.id,reason:'Denied'},'edit-only',403);
 await atomic(h,change('name','Edit only','save-only cannot edit'),'save-only',403);
 for(const who of ['viewer','save-only']){const response=await h.call('/api/routine-equipment/photo',{method:'PUT',headers:{'Content-Type':'image/png'},body:new Uint8Array([1,2,3])},who);assert.equal(response.status,403);}
 await h.rights('revocable',['view']);await atomic(h,change('name','Edit only','revoked'),'revocable',403);
 }finally{h.close();}});

void test('pending lock; withdraw, resubmit, independent approval, no-change and source delete protections',async()=>{const h=await fixture();try{
 await atomic(h,change('name',source(await h.state()).name,'Lifecycle'));
 let c=await h.state(),submitted=await h.command('routine-equipment','submit',{savedId:c.workflow.saved.id,reason:'Synthetic submit'});const pending=await h.state();
 await atomic(h,change('name','Lifecycle','Denied pending'),'editor',409);assert.deepEqual(await h.state(),pending);
 await h.command('routine-equipment','withdraw',{caseId:submitted.receipt.caseId,reason:'Synthetic withdraw'});c=await h.state();assert.equal(c.workflow.saved.content.equipment[0].name,'Lifecycle');
 submitted=await h.command('routine-equipment','submit',{savedId:c.workflow.saved.id,reason:'Synthetic resubmit'});await h.command('routine-equipment','approve',{caseId:submitted.receipt.caseId},'reviewer');
 await h.begin('routine-equipment');await atomic(h,{patches:[],guards:[]});c=await h.state();await h.command('routine-equipment','submit',{savedId:c.workflow.saved.id,reason:'No change'},'editor',422);
 await atomic(h,{patches:[{op:'remove',path:['equipment',{id:'source'}]}],guards:[{path:['equipment',{id:'source'}],value:source(c)}]},'editor',422);
 }finally{h.close();}});

void test('UI form completion makes zero POST; Save is one POST and retained search does not lose input',async()=>{const h=await fixture();try{
 const f=await h.connect(),row=f.test.working.equipment.find(r=>r.id==='source');row.notes='本機編輯';const count=h.requests.filter(r=>r.method==='POST').length;
 assert(await f.test.writeShared('apply'));assert.equal(h.requests.filter(r=>r.method==='POST').length,count);assert.notEqual(source(await h.state()).notes,'本機編輯');
 const input=f.host.querySelector('#routine-search');input.value='不存在';input.dispatchEvent({type:'input',target:input});assert.equal(row.notes,'本機編輯');
 assert(await f.test.writeShared('save'),f.test.message);assert.equal(h.requests.filter(r=>r.method==='POST').length,count+1);assert.equal(source(await h.state()).notes,'本機編輯');assert.equal(h.requests.at(-2)?.body?.command?.action||'save','save');
 }finally{h.close();}});

for(const kind of ['save','begin'])void test(`lost ${kind} ACK keeps marker through 404, permits departure, and queries original receipt without re-POST`,async()=>{
 const h=await fixture();try{
 const f=await h.connect(),realFetch=f.c.fetch;let lost=false,down=true,posts=0;
 f.c.fetch=async(url,options={})=>{const u=new URL(url,'http://fixture'),body=options.body&&JSON.parse(options.body);if(down&&u.searchParams.has('operationId'))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});const result=await realFetch(url,options);if(options.method==='POST'&&(kind==='save'?body.command?.action==='save':body.action==='begin-v1')){posts++;if(!lost){lost=true;throw Error('Synthetic ACK lost');}}return result;};
 f.test.working.equipment.find(r=>r.id==='source').notes='未知結果仍保留';assert.equal(await f.test.writeShared(kind),null);assert.equal(posts,1);
 const markers=()=>JSON.stringify([...f.storage].filter(([key])=>key.startsWith('shared-draft')));const marker=markers();assert.notEqual(marker,'[]');
 const departure=f.c.RoutineEquipmentUI.navigation.departure;assert.equal(departure.inspect().canAbandon,true);
 await f.test.writeShared(kind);await f.test.enterExistingDraft();assert.equal(posts,1);assert.equal(markers(),marker);
 down=false;await f.test.enterExistingDraft();assert.equal(posts,1);assert.equal(markers(),'[]');assert.equal(f.c.sharedDraftAccountState().unknown,false);
 if(kind==='save'){assert.equal(source(await h.state()).notes,'未知結果仍保留');assert(await f.test.writeShared('save'),f.test.message);assert.equal((await h.state()).workflow.working.equipment.length,2);}
 }finally{h.close();}
});

void test('unknown Save can abandon local input while retaining exact command, generation and original guards',async()=>{const h=await fixture();try{
 const f=await h.connect(),realFetch=f.c.fetch;f.c.fetch=async(url,options={})=>{if(new URL(url,'http://fixture').searchParams.has('operationId'))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});const r=await realFetch(url,options);if(options.method==='POST')throw Error('Lost ACK');return r;};
 f.test.working.equipment.find(r=>r.id==='source').notes='sent';await f.test.writeShared('save');const marker=JSON.stringify([...f.storage]);const departure=f.c.RoutineEquipmentUI.navigation.departure,lease=await departure.abandon();assert.equal(departure.inspect().state,'departing');departure.closeClean();lease.release();assert.equal(JSON.stringify([...f.storage]),marker);assert.equal(f.c.sharedDraftAccountState().unknown,true);
 }finally{h.close();}});

void test('Save in flight preserves subsequent input, original peer guard, and only one batch under rapid clicks',async()=>{const h=await fixture();try{
 const f=await h.connect(),realFetch=f.c.fetch;let release,started;const gate=new Promise(r=>release=r),wait=new Promise(r=>started=r);
 f.c.fetch=async(url,options={})=>{const result=await realFetch(url,options);if(options.method==='POST'&&JSON.parse(options.body).command?.action==='save'){started();await gate;}return result;};
 f.test.working.equipment[0].notes='first batch';const save=f.test.writeShared('save');await wait;assert.equal(await f.test.writeShared('save'),null);f.test.working.equipment[0].notes='later input';release();assert(await save,f.test.message);
 assert.equal(source(await h.state()).notes,'first batch');assert.equal(f.test.working.equipment[0].notes,'later input');assert(await f.test.writeShared('save'),f.test.message);assert.equal(source(await h.state()).notes,'later input');
 }finally{h.close();}});

void test('legacy unidentified Begin is never settled by current draft or 404 and departure retains its bytes',async()=>{const h=await fixture();try{
 const f=await h.connect(),key='routine-equipment-begin-recovery:'+f.c.ProcessSync.identity.id,raw=JSON.stringify({schema:1,actorId:f.c.ProcessSync.identity.id,activeVersionId:null,generation:null});f.storage.set(key,raw);const count=h.requests.length;
 await f.test.enterExistingDraft();assert.equal(h.requests.length,count);assert.equal(f.storage.get(key),raw);assert.equal(await f.test.writeShared('begin'),null);
 const departure=f.c.RoutineEquipmentUI.navigation.departure;assert.equal(departure.inspect().state,'unknown');assert.equal(departure.inspect().canAbandon,true);const lease=await departure.abandon();departure.closeClean();assert.equal(f.storage.get(key),raw);lease.release();
 }finally{h.close();}});

void test('cross-generation Begin readback preserves original receipt and repeated Save never rebinds or sends',async()=>{const h=await fixture();try{
 const f=await h.connect(),realFetch=f.c.fetch;let original;
 f.c.fetch=async(url,options={})=>{const r=await realFetch(url,options);if(options.method==='POST'&&JSON.parse(options.body).action==='begin-v1'){original=(await r.clone().json()).receipt;await h.mutate(values=>{const c=JSON.parse(values.routineEquipmentControl);c.workflow.generation='synthetic-next-generation';c.workflow.revision++;values.routineEquipmentControl=JSON.stringify(c);});}return r;};
 f.test.working.equipment[0].notes='retained';const before=clone(f.test.working);assert.equal(await f.test.writeShared('begin'),null);assert.match(f.test.message,/STALE_GENERATION/);for(let n=0;n<2;n++)assert.equal(await f.test.writeShared('save'),null);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);assert.deepEqual(clone(f.test.working),before);assert((await h.persisted()).workflow.receipts[original.operationId]);
 }finally{h.close();}});

void test('Submit rechecks local changes after asynchronous confirmation and never saves for the user',async()=>{const h=await fixture();try{
 const f=await h.connect();f.test.working.equipment[0].notes='saved';assert(await f.test.writeShared('save'));
 let release,started;const gate=new Promise(r=>release=r),wait=new Promise(r=>started=r);f.c.VersionDraftUI.confirmSubmit=async()=>{started();await gate;return 'confirmed';};const count=h.requests.filter(r=>r.method==='POST').length,submit=f.test.writeShared('submit');await wait;f.test.working.equipment[0].notes='new input after confirmation';release();assert.equal(await submit,null);assert.equal(h.requests.filter(r=>r.method==='POST').length,count);assert.equal((await h.state()).workflow.pendingId,null);assert.equal(f.test.working.equipment[0].notes,'new input after confirmation');
 }finally{h.close();}});
void test('atomic Save retries a real CAS miss without duplicate allocation or partial saved snapshots',async()=>{const h=await fixture();try{
 const f=await h.connect();f.test.working.equipment.push({id:'cas-insert',assetCode:'SYN-CAS',name:'CAS fixture',groupId:'group',unit:'支',enabled:true,confirmed:false,calibrationMethod:'none',calibratedAt:'',expiresAt:''});
 const prepare=h.env.DB.prepare.bind(h.env.DB);let missed=false;h.env.DB.prepare=function(sql){const statement=prepare.call(this,sql);if(!sql.startsWith('UPDATE shared_state SET revision='))return statement;const bind=statement.bind.bind(statement);statement.bind=function(...args){bind.apply(statement,args);const run=statement.run.bind(statement);statement.run=async()=>{if(!missed){missed=true;return {meta:{changes:0}};}return run();};return statement;};return statement;};
 const before=(await h.persisted()).workflow.saves.length;assert(await f.test.writeShared('save'),f.test.message);assert(missed);const after=await h.persisted();assert.equal(after.workflow.working.equipment.filter(r=>r.id==='cas-insert').length,1);assert.equal(after.workflow.working.equipment.find(r=>r.id==='cas-insert').pieceMark,'01');assert.equal(after.workflow.saves.length,before+1);
 }finally{h.close();}});
void test('insert relationship dependencies reject changes; group photo removal is explicit and preserves old immutable photo',async()=>{const h=await fixture();try{
 const before=await h.state(),group=before.workflow.working.groups[0],detail={patches:[{op:'insert',path:['equipment'],value:{id:'dependent-new',assetCode:'SYN-DEPENDENT',name:'Dependent',groupId:group.id,unit:'支',enabled:true,confirmed:false,calibrationMethod:'none',calibratedAt:'',expiresAt:''}}],guards:[{path:['groups',{id:group.id}],value:group}]};
 const groupPath=['groups',{id:group.id},'name'];await atomic(h,{patches:[{op:'set',path:groupPath,value:'Peer group name'}],guards:[{path:groupPath,value:group.name}]});await atomic(h,detail,'editor',409);assert(!(await h.state()).workflow.working.equipment.some(r=>r.id==='dependent-new'));
 const png=require('./photo-fixtures.mjs').pngFixture({width:8,height:8}),response=await h.call('/api/routine-equipment/photo',{method:'PUT',headers:{'Content-Type':'image/png'},body:png}),photoId=(await response.json()).id,path=['groups',{id:group.id},'photoId'];await atomic(h,{patches:[{op:'set',path,value:photoId}],guards:[{path,value:group.photoId}]});const saved=(await h.persisted()).workflow.saved;await atomic(h,{patches:[{op:'set',path,value:''}],guards:[{path,value:photoId}]});const final=await h.persisted();assert.equal(final.workflow.saved.content.groups[0].photoId,'');assert.equal(final.workflow.saves.find(row=>row.id===saved.id).content.groups[0].photoId,photoId);assert(h.objects.has('routine-equipment/photos/'+photoId));
 }finally{h.close();}});
void test('session revoked during immutable storage cannot commit equipment Save or its receipt',async()=>{const h=await fixture();try{
 h.env.PROCESS_SESSION_REVOCATION_ENABLED='1';const before=await h.persisted(),revision=h.db.prepare('SELECT revision FROM shared_state').get().revision,put=h.env.STATE_ARCHIVE.put.bind(h.env.STATE_ARCHIVE);let revoked=false;
 h.env.STATE_ARCHIVE.put=async(...args)=>{await put(...args);if(!revoked){revoked=true;const token=h.sessions.editor.Cookie.split('=').slice(1).join('=');h.db.prepare('INSERT OR REPLACE INTO process_revoked_sessions VALUES(?,?,?)').run(createHash('sha256').update(token).digest('hex'),Date.now()+3600000,Date.now());}};
 await atomic(h,change('name',before.workflow.working.equipment[0].name,'revoked during storage'),'editor',401);assert(revoked);assert.equal(h.db.prepare('SELECT revision FROM shared_state').get().revision,revision);assert.deepEqual(await h.persisted(),before);
 }finally{h.close();}});

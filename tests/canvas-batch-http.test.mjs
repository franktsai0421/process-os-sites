// Entire production HTTP route with signed synthetic actors and isolated SQLite/R2.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {accessKeys} from '../public/process/access-policy.mjs';
const require=createRequire(import.meta.url),harness=require('../scripts/ipqc-ab-import-harness.cjs');
for(const storage of ['inline','records-v1'])void test(storage+': scoped atomic canvas apply, safe deletion, actor binding and exact replay',async()=>{
 const db=new DatabaseSync(':memory:'),objects=new Map();let writes=0;db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,"values" TEXT NOT NULL,updated_at TEXT NOT NULL)');
 const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const changes=Number(db.prepare(sql).run(...args).changes);writes+=changes;return{meta:{changes}};}};}},STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async head(k){return objects.has(k)?{}:null;},async get(k){return objects.has(k)?{text:async()=>String(objects.get(k))}:null;}}};
 const h=harness(env),core=h('lib/process-state.ts'),users=['actor-a','actor-b'].map(id=>({id,name:id,role:'admin',enabled:true,authMode:'platform',accessOverrides:Object.fromEntries(accessKeys.map(k=>[k,true]))}));
 const w=JSON.stringify(['Synthetic','A']),rows=[{id:'a',stageCode:'S',name:'A',editorType:'manual',productCodes:[],nextIds:['b'],x:0},{id:'b',stageCode:'S',name:'B',editorType:'manual',productCodes:[],nextIds:[],x:1}];const content={workspaces:[{id:w,category:'Synthetic',line:'A',stages:{S:rows,T:[]}}]},flow=h('lib/shared-draft.ts').createSharedDraft('process:platform',content,null,randomUUID());
 const values={platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify({active:{AB:{products:[],lines:[{code:'A',stages:[{code:'S'},{code:'T'}]}]},C:{products:[],lines:[]},PROCESS:{}},versions:[]}),bomOverrides:JSON.stringify({replaceAll:true,data:{}}),processAuthoringControl:JSON.stringify({activeVersionId:null,versions:[{id:'draft',number:1,status:'draft',snapshot:content,history:[],revision:0}],workflow:flow})};
 const raw=storage==='records-v1'?await h('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE,values):JSON.stringify(values);db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(raw,'synthetic');
 const endpoint='https://fixture.invalid/api/process-authoring/workflow?channel=canvas-v2&caseMetadata=1',api=h('app/api/process-authoring/workflow/route.ts'),tokens=Object.fromEntries(await Promise.all(users.map(async u=>[u.id,await core.demoSession(new Request(endpoint),u.id,false)])));
 let seq=0;const path=id=>['workspaces',{id:w},'stages','S',{id}],cmd=(patches,guards)=>({action:'apply',generation:flow.generation,operationId:randomUUID(),clientId:'http-canvas-client',sequence:++seq,source:'canvas-v2:'+JSON.stringify([w,'S']),patches,guards});
 const send=async(command,who='actor-a')=>{const r=await api.POST(new Request(endpoint,{method:'POST',headers:{Origin:'https://fixture.invalid','Content-Type':'application/json',Cookie:'process_demo='+tokens[who]},body:JSON.stringify({command})}));return {status:r.status,body:await r.json()};};
 const stored=()=>db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get();
 try{
  const first=cmd([{op:'set',path:[...path('a'),'name'],value:'Changed'}],[{path:[...path('a'),'name'],value:'A'}]);const saved=await send(first);assert.equal(saved.status,200,JSON.stringify(saved.body));const before=stored(),count=writes;
  const conflict=await send(cmd([{op:'set',path:[...path('b'),'name'],value:'Must not apply'},{op:'set',path:[...path('a'),'name'],value:'Stale'}],[{path:[...path('b'),'name'],value:'B'},{path:[...path('a'),'name'],value:'A'}]),'actor-b');assert.equal(conflict.status,409,JSON.stringify(conflict.body));assert.equal(conflict.body.error,'DEPENDENCY_CHANGED_RECONFIRM');assert.deepEqual(stored(),before);assert.equal(writes,count);
  const dangling=await send(cmd([{op:'remove',path:path('b')}],[{path:path('b'),value:rows[1]}]));assert.equal(dangling.status,409);assert.deepEqual(stored(),before);
  const cross=await send(cmd([{op:'set',path:['workspaces',{id:w},'stages','T'],value:[]}],[{path:['workspaces',{id:w},'stages','T'],value:[]}]));assert.equal(cross.status,422);assert.deepEqual(stored(),before);
  const replay=await send(first);assert.equal(replay.status,200);assert.deepEqual(stored(),before);assert.equal(writes,count);
  const other=await send(first,'actor-b');assert.equal(other.status,409);assert.equal(other.body.error,'OPERATION_ID_REUSED');assert.deepEqual(stored(),before);
  assert.equal(!!JSON.parse(stored().values).__processRecords,storage==='records-v1','no implicit format conversion');
  const removed=await send(cmd([{op:'set',path:[...path('a'),'nextIds'],value:[]},{op:'remove',path:path('b')}],[{path:[...path('a'),'nextIds'],value:['b']},{path:path('b'),value:rows[1]}]));assert.equal(removed.status,200,JSON.stringify(removed.body));assert.equal(removed.body.control.workflow.working.workspaces[0].stages.S.length,1);
 }finally{db.close();}
});

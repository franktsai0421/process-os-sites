// Real BOM route/kernel + primary browser transport. SQLite/R2 and fetch are
// in-memory fixture ports; never an application server, socket or real account.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import * as D from '../public/process/bom-domain.mjs';
const require=createRequire(import.meta.url),harness=require('../scripts/ipqc-ab-import-harness.cjs');
const source=fs.readFileSync(new URL('../public/process/shared-draft-client.js',import.meta.url),'utf8');
async function fixture(t){
 const db=new DatabaseSync(':memory:'),objects=new Map(),storage=new Map(),calls=[];t.after(()=>db.close());for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 require('../scripts/automatic-backup-fixture.cjs')(db);
 const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return {bind(...next){args=next;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async put(key,value){objects.set(key,Buffer.from(value));},async head(key){return objects.has(key)?{}:null;},async get(key){const value=objects.get(key);return value?{text:async()=>value.toString(),arrayBuffer:async()=>value.buffer.slice(value.byteOffset,value.byteOffset+value.byteLength),body:new ReadableStream({start(controller){controller.enqueue(value);controller.close();}})}:null;}}};
 const load=harness(env),core=load('lib/process-state.ts'),values={platformUsers:JSON.stringify([{id:'actor1',name:'Synthetic actor',role:'admin',enabled:true,inheritRole:true,accessOverrides:{}}])};
 const encoded=await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE,values);db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(encoded,'fixture');
 const route=load('app/api/bom/workflow/route.ts'),headers={'Content-Type':'application/json',Origin:'http://localhost',Cookie:'process_demo='+await core.demoSession(new Request('http://localhost'),'actor1',false)};
 const request=(method,body,url='/api/bom/workflow?caseMetadata=1')=>route[method](new Request(new URL(url,'http://localhost'),{method,headers,...(body?{body:JSON.stringify(body)}:{})}));
 assert.equal((await request('POST',{action:'begin'})).status,200);let initial=await (await request('GET')).json();
 const sheets=[{name:'SYNTHETIC',rows:[D.columns,['ROOT','0','','','Root','','PCS','0','0','0'],['ROOT','.1','0010','PART','Old name','','PCS','2','1','0']]}];
 const seed={action:'apply',generation:initial.control.workflow.generation,clientId:'synthetic-seed-client',sequence:1,operationId:randomUUID(),moduleAction:'import-digiwin',input:{sheets,base:{},decisions:[{decision:'accept'}]}};
 const imported=await request('POST',{command:seed});assert.equal(imported.status,200,await imported.clone().text());initial=await (await request('GET')).json();
 const box={window:null,console,crypto:webcrypto,TextEncoder,URL,URLSearchParams,AbortController,Response,performance,location:{origin:'http://localhost',pathname:'/process/'},document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>null,querySelectorAll:()=>[]},setTimeout:()=>1,clearTimeout(){},addEventListener(){},sessionStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},ProcessSync:{identity:{id:'actor1'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,requiresReload:false}};box.window=box;
 box.fetch=async(url,options)=>{calls.push({url,method:options.method,body:options.body});return route[options.method](new Request(new URL(url,'http://localhost'),{...options,headers:{...headers,...options.headers}}));};vm.runInNewContext(source,box);
 const client=box.createSharedDraftClient({endpoint:'/api/bom/workflow?caseMetadata=1',actorId:'actor1',headers:()=>headers,externalDurableBounded:{scope:'BOM'},guardAccessResults:true});await client.read();calls.length=0;
 return {db,objects,storage,calls,client,box,initial,sheets,generation:initial.control.workflow.generation,row:initial.control.workflow.working.bom.ROOT[1],state:()=>db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get()};
}
void test('actual BOM route pre-CAS audited refusals leave DB/R2 unchanged and privately release original marker',async t=>{
 const f=await fixture(t),path=['bom','ROOT',{id:f.row.id},'itemName'];
 const cases=[
  ['BOM_MANUAL_STRUCTURE_FORBIDDEN',422,{patches:[{op:'set',path:['bom','ROOT',{id:f.row.id},'itemCode'],value:'FORGED'}]}],
  ['BOM_EDIT_FIELD_INVALID',422,{patches:[{op:'set',path:['bom','ROOT',{id:'missing'},'itemName'],value:'new'}],guards:[]}],
  ['DEPENDENCY_GUARD_REQUIRED',422,{patches:[{op:'set',path,value:'new'}]}],
  ['DEPENDENCY_CHANGED_RECONFIRM',409,{patches:[{op:'set',path,value:'new'}],guards:[{path,value:'not old'}]}],
  ['BOM_NUMBER_INVALID',422,{patches:[{op:'set',path:['bom','ROOT',{id:f.row.id},'quantity'],value:'NaN'}],guards:[{path:['bom','ROOT',{id:f.row.id},'quantity'],value:'2'}]}],
  ['BOM_IMPORT_REQUIRED',422,{moduleAction:'import-digiwin',input:{sheets:f.sheets}}],
  ['BOM_IMPORT_MODE_INVALID',422,{moduleAction:'import-digiwin',input:{sheets:f.sheets,decisions:[],importMode:'unexpected'}}],
  ['BOM_IMPORT_BASE_CHANGED',409,{moduleAction:'import-digiwin',input:{sheets:f.sheets,decisions:[],baseDigest:'0'.repeat(64)}}],
  ['COMMAND_TOO_LARGE',413,{moduleAction:'import-digiwin',input:{sheets:f.sheets,decisions:[],file:'x'.repeat(2_000_100)}}]
 ];
 for(const [code,status,detail]of cases){const before=f.state(),beforeObjects=[...f.objects],command=f.client.prepareRecovery(f.generation,detail),cap=f.client.rejectionCapability(command),flight=f.client.sendPrepared(command,{assertDispatch:()=>true});let error;try{await flight;}catch(value){error=value;}assert.equal(error?.message,code);assert.equal(error.status,status);assert.match(error.requestId,/^[\da-f-]{36}$/i);assert.equal(f.client.hasUnknown(),false,code);assert.equal(f.box.SharedDraftRejectionProof.verify(cap,error,command,flight),true,code);assert.deepEqual(f.state(),before,code);assert.deepEqual([...f.objects],beforeObjects,code);}
 assert.equal(f.calls.filter(call=>call.method==='POST').length,cases.length);assert.equal(f.calls.filter(call=>call.method==='GET').length,0,'refused mutations do not auto retry/GET');
});
void test('actual BOM selected Save and no-op Save retain receipt/base contract with one terminal GET each',async t=>{
 const f=await fixture(t);for(let i=0;i<2;i++){const command=f.client.prepareRecoverySave(f.generation),before=f.calls.length,result=await f.client.sendPrepared(command,{assertDispatch:()=>true});assert.equal(result.receipt.unchanged,i===1);assert.equal(result.control.workflow.scope,'bom');assert.equal(result.control.workflow.generation,f.generation);const read=f.client.verifiedReadback(result,command.operationId);assert.equal(read.control.workflow.saved.id,result.receipt.savedId);assert.equal(read.control.workflow.revision,result.receipt.revision);assert.equal(read.permissions.view,true);assert.deepEqual(f.calls.slice(before).map(call=>call.method),['POST','GET']);assert.equal(f.client.hasUnknown(),false);}
});

void test('actual BOM manual body-limit413 occurs before state reads/CAS/R2 and leaves full input only in RAM',async t=>{
 const f=await fixture(t),path=['bom','ROOT',{id:f.row.id},'itemName'],value='𠜎'.repeat(500_100),command=f.client.prepareRecovery(f.generation,{patches:[{op:'set',path,value}],guards:[{path,value:f.row.itemName}]}),cap=f.client.rejectionCapability(command),before=f.state(),objects=[...f.objects],prepare=f.db.prepare.bind(f.db),queries=[];
 f.db.prepare=sql=>{queries.push(sql);return prepare(sql);};const flight=f.client.sendPrepared(command,{assertDispatch:()=>true});let error;try{await flight;}catch(failure){error=failure;}const requestQueries=queries.slice();f.db.prepare=prepare;
 assert.equal(error?.status,413);assert.equal(error?.message,'COMMAND_TOO_LARGE');assert.match(error.requestId,/^[\da-f-]{36}$/i);assert.deepEqual(requestQueries,[],'commandBody rejects before any state SQL');assert.deepEqual(f.state(),before);assert.deepEqual([...f.objects],objects);assert.equal(f.client.hasUnknown(),false);assert.equal(f.box.SharedDraftRejectionProof.verify(cap,error,command,flight),true);assert.equal(command.patches[0].value,value);assert.equal(f.storage.size,0);assert.deepEqual(f.calls.map(call=>call.method),['POST']);assert(new TextEncoder().encode(f.calls[0].body).byteLength>2_000_000);
});

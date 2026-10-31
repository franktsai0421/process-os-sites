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
 const box={window:null,console,crypto:webcrypto,URL,URLSearchParams,AbortController,Response,performance,location:{origin:'http://localhost',pathname:'/process/'},document:{documentElement:{lang:'zh'},body:{style:{}},querySelector:()=>null,querySelectorAll:()=>[]},setTimeout:()=>1,clearTimeout(){},addEventListener(){},sessionStorage:{get length(){return storage.size;},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},ProcessSync:{identity:{id:'actor1'},identityGeneration:()=>1,captureDelivery:()=>1,isCurrentDelivery:v=>v===1,requiresReload:false}};box.window=box;
 box.fetch=async(url,options)=>{calls.push({url,method:options.method,body:options.body});return route[options.method](new Request(new URL(url,'http://localhost'),{...options,headers:{...headers,...options.headers}}));};vm.runInNewContext(source,box);
 const client=box.createSharedDraftClient({endpoint:'/api/bom/workflow?caseMetadata=1',actorId:'actor1',headers:()=>headers,externalDurableBounded:{scope:'BOM'},guardAccessResults:true});await client.read();calls.length=0;
 return {db,objects,storage,calls,client,box,initial,sheets,async deny(permission){const state=await core.readState(),users=JSON.parse(state.values.platformUsers);users[0].accessOverrides[permission]=false;state.values.platformUsers=JSON.stringify(users);const encoded=await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE,state.values,state.recordStorage);db.prepare('UPDATE shared_state SET revision=?,"values"=? WHERE id=1').run(state.revision+1,encoded);},generation:initial.control.workflow.generation,row:initial.control.workflow.working.bom.ROOT[1],state:()=>db.prepare('SELECT revision,"values" FROM shared_state WHERE id=1').get()};
}

void test('real BOM route CAS Apply authority skips intermediate GET while final Save still reads',async t=>{
 const f=await fixture(t),path=['bom','ROOT',{id:f.row.id},'itemName'];let before='Old name';
 for(const next of ['First','Second','Third']){const command=f.client.prepareRecovery(f.generation,{patches:[{op:'set',path,value:next}],guards:[{path,value:before}]}),start=f.calls.length,result=await f.client.sendPrepared(command,{assertDispatch:()=>true});const proof=f.client.verifiedApplyAuthority(result,command.operationId);assert(proof);assert.equal(proof.response.control.workflow.working.bom.ROOT[1].itemName,next);assert.equal(result.permissions,undefined);assert.equal(proof.priorPermissions.view,true);assert.equal(f.client.verifiedReadback(result,command.operationId),null);assert.deepEqual(f.calls.slice(start).map(call=>call.method),['POST']);assert.equal(f.client.hasUnknown(),false);before=next;}
 const save=f.client.prepareRecoverySave(f.generation),start=f.calls.length,result=await f.client.sendPrepared(save,{assertDispatch:()=>true});assert(f.client.verifiedReadback(result,save.operationId));assert.equal(f.client.verifiedApplyAuthority(result,save.operationId),null);assert.deepEqual(f.calls.slice(start).map(call=>call.method),['POST','GET']);assert.equal(f.client.hasUnknown(),false);assert.equal(result.control.workflow.saved.content.bom.ROOT[1].itemName,'Third');
});
void test('real BOM guard refusal gives no ACK proof or data mutation',async t=>{
 const f=await fixture(t),path=['bom','ROOT',{id:f.row.id},'itemName'],state=f.state(),objects=[...f.objects];
 const command=f.client.prepareRecovery(f.generation,{patches:[{op:'set',path,value:'new'}],guards:[{path,value:'wrong base'}]});let error;try{await f.client.sendPrepared(command,{assertDispatch:()=>true});}catch(e){error=e;}assert.equal(error.message,'DEPENDENCY_CHANGED_RECONFIRM');assert.equal(f.client.verifiedApplyAuthority(error,command.operationId),null);assert.deepEqual(f.state(),state);assert.deepEqual([...f.objects],objects);assert.deepEqual(f.calls.map(call=>call.method),['POST']);
});

for(const permission of ['bom.view','bom.edit'])void test(`real BOM ${permission} revoke prevents CAS and fast authority`,async t=>{
 const f=await fixture(t);await f.deny(permission);const before=f.state(),objects=[...f.objects],path=['bom','ROOT',{id:f.row.id},'itemName'];const cmd=f.client.prepareRecovery(f.generation,{patches:[{op:'set',path,value:'new'}],guards:[{path,value:'Old name'}]});let error;try{await f.client.sendPrepared(cmd,{assertDispatch:()=>true});}catch(e){error=e;}assert.equal(error?.status,403);assert.equal(f.client.verifiedApplyAuthority(error,cmd.operationId),null);assert.equal(f.client.hasUnknown(),true);assert.deepEqual(f.state(),before);assert.deepEqual([...f.objects],objects);assert.deepEqual(f.calls.map(call=>call.method),['POST']);
});
void test('real new no-op Apply may use CAS authority but never attributes own write',async t=>{
 const f=await fixture(t),path=['bom','ROOT',{id:f.row.id},'itemName'],command=f.client.prepareRecovery(f.generation,{patches:[{op:'set',path,value:'Old name'}],guards:[{path,value:'Old name'}]}),revision=f.initial.control.workflow.revision,result=await f.client.sendPrepared(command,{assertDispatch:()=>true});assert.equal(result.receipt.unchanged,true);assert.equal(result.receipt.revision,revision);assert(f.client.verifiedApplyAuthority(result,command.operationId));assert.equal(f.client.verifiedReadback(result,command.operationId),null);assert.equal(f.box.SharedDraftDeparture.owns(result.control.workflow),false);assert.equal(f.client.hasUnknown(),false);assert.deepEqual(f.calls.map(call=>call.method),['POST']);
});

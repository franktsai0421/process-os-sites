// Actual authorized routes and immutable-record codec, synthetic in-memory DB/R2.
import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(import.meta.url),harness=require('../scripts/ipqc-ab-import-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
async function fixture(recordBacked=false){
 const db=new DatabaseSync(':memory:'),objects=new Map(),reads=[];let readOnly=false;
 db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT)');
 const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){assert(/^SELECT /i.test(sql),'route must not write SQL');let args=[];return{bind(...xs){args=xs;return this;},async first(){return db.prepare(sql).get(...args)||null;}};}},STATE_ARCHIVE:{async put(k,v){assert(!readOnly,'route must not write R2');objects.set(k,v);},async get(k){reads.push(k);const value=objects.get(k);return value===undefined?null:{text:async()=>String(value)};}}};
 const load=harness(env),core=load('lib/process-state.ts'),codec=load('lib/state-records.ts'),{createSharedDraft}=load('lib/shared-draft.ts');
 const snapshot=standard=>({errors:[{id:'error',code:'E',name:'Exact error',line:'A',group:'SYN',stageCode:'CUT',deleted:false}],items:[{id:'item',code:'I',errorId:'error',standard,methodText:'Method',sourceTool:'Tool',sourceMethod:'Method',sourceFrequency:'Each',equipmentSnapshot:null,rules:[],standardPhotos:[],methodPhotos:[],productCodes:['P'],isEnabled:true,deleted:false}]});
 const old={id:'same-version-id',number:1,status:'superseded',snapshot:snapshot('Exact old standard')},active={id:'active',number:2,status:'approved',snapshot:snapshot('Current standard')};
 const scope={line:'A',group:'SYN',activeVersionId:'active',versions:[old,active],workflow:createSharedDraft('ipqc-ab:A:SYN',active.snapshot,'active','quality-generation')};
 const quality={schemaVersion:1,scopes:{'A:SYN':scope,'B:OTHER':{line:'B',group:'OTHER',activeVersionId:null,versions:[{...old,snapshot:snapshot('Wrong scope standard')}]}},source:null,reservedErrorCodes:[],reservedItemCodes:[]};
 const users=[{id:'reader',name:'Reader',role:'staff',enabled:true,inheritRole:false,lines:['A'],views:['editor'],permissions:[],accessOverrides:{'editor.view':true,'ipqc-ab.view':true}},{id:'editor-only',name:'Editor only',role:'staff',enabled:true,inheritRole:false,lines:['A'],views:['editor'],permissions:[],accessOverrides:{'editor.view':true,'ipqc-ab.view':false}},{id:'denied',name:'Denied',role:'staff',enabled:true,inheritRole:false,lines:[],views:[],permissions:[],accessOverrides:{'editor.view':false,'ipqc-ab.view':false}}];
 const values={platformUsers:JSON.stringify(users),ipqcABMasterControl:JSON.stringify(quality),masterDataControl:JSON.stringify({active:{AB:{products:[{code:'P',line:'A',category:'SYN',stages:['CUT']}],lines:[],categoryGroups:[]}},versions:[]}),processAuthoringControl:JSON.stringify({activeVersionId:null,versions:[]})};
 db.prepare('INSERT INTO shared_state VALUES(1,7,?)').run(recordBacked?await codec.encodeRecordValues(env.STATE_ARCHIVE,values):JSON.stringify(values));
 const cookies={};for(const user of users)cookies[user.id]='process_demo='+await core.demoSession(new Request('http://127.0.0.1'),user.id,false);
 const routes={'/api/ipqc-ab/workflow':load('app/api/ipqc-ab/workflow/route.ts'),'/api/process-ipqc':load('app/api/process-ipqc/route.ts')};
 const before=db.prepare('SELECT * FROM shared_state').get(),stored=[...objects];readOnly=true;
 return{reads,async get(path,actor='reader'){const url=new URL(path,'http://127.0.0.1'),response=await routes[url.pathname].GET(new Request(url,{headers:actor?{Cookie:cookies[actor]}:{}}));const body=await response.json();assert.deepEqual(db.prepare('SELECT * FROM shared_state').get(),before);assert.deepEqual([...objects],stored);return{status:response.status,body};},close:()=>db.close()};
}
for(const records of [false,true])void test(`${records?'record-backed':'inline'} actual route returns only the requested scope/exact version; choices remain current approved`,async()=>{
 const f=await fixture(records);try{const history=await f.get('/api/ipqc-ab/workflow?scope=A%3ASYN&versionId=same-version-id');assert.equal(history.status,200);assert.equal(history.body.version.id,'same-version-id');assert.equal(history.body.version.snapshot.items[0].standard,'Exact old standard');assert.equal(history.body.control,undefined);assert.equal(history.body.version.snapshot.items.some(row=>row.standard==='Wrong scope standard'),false);
 const current=await f.get('/api/process-ipqc?mode=choices&line=A&category=SYN&stage=CUT&product=P');assert.equal(current.status,200);assert.equal(current.body.choices[0].sourceVersionId,'active');assert.equal(current.body.choices[0].standard,'Current standard');assert.equal((await f.get('/api/ipqc-ab/workflow?scope=A%3ASYN&versionId=missing')).status,404);assert.equal((await f.get('/api/ipqc-ab/workflow?scope=missing&versionId=same-version-id')).status,404);
 }finally{f.close();}
});
void test('editor choice permission does not grant quality history permission; 403/anonymous remain denied',async()=>{
 const f=await fixture();try{assert.equal((await f.get('/api/process-ipqc?mode=choices&line=A&category=SYN&stage=CUT&product=P','editor-only')).status,200);assert.equal((await f.get('/api/ipqc-ab/workflow?scope=A%3ASYN&versionId=same-version-id','editor-only')).status,403);assert.equal((await f.get('/api/ipqc-ab/workflow?scope=A%3ASYN&versionId=same-version-id','denied')).status,403);assert.equal((await f.get('/api/ipqc-ab/workflow?scope=A%3ASYN&versionId=same-version-id',null)).status,403);}finally{f.close();}
});
void test('PROCESS reference history is metadata, never a substitute for quality historical contents',async()=>{
 const f=await fixture();try{const response=await f.get('/api/process-ipqc?mode=history&source=AB&scope=A%3ASYN&itemId=item');assert.equal(response.status,200);assert.deepEqual(plain(response.body.references),[]);assert.equal(response.body.version,undefined);assert.equal(response.body.choices,undefined);}finally{f.close();}
});

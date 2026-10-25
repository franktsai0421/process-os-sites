import __esmImport0 from "node:fs";
import __esmImport1 from "node:path";
import __esmImport2 from "node:assert/strict";
import __esmImport3 from "node:sqlite";
import __esmImport4 from "node:crypto";
import {createRequire as __esmFactory} from 'node:module';
import {fileURLToPath as __esmPath} from 'node:url';
const __esmOldFilename=__esmPath(new URL("./test-bom-workflow.cjs",import.meta.url));
const __esmRequire=__esmFactory(__esmOldFilename);
/* Isolated handler tests: in-memory SQLite and R2; no daily storage. */
const fs=__esmImport0,path=__esmImport1,assert=__esmImport2,{DatabaseSync}=__esmImport3,{randomUUID}=__esmImport4;
const harness=__esmRequire('./ipqc-ab-import-harness.cjs');
(async()=>{
 const db=new DatabaseSync(':memory:'),objects=new Map();for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',file),'utf8'));
 const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{async put(k,v){objects.set(k,Buffer.from(v));},async head(k){return objects.has(k)?{}:null;},async get(k){const b=objects.get(k);return b?{text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),body:new ReadableStream({start(c){c.enqueue(b);c.close();}})}:null;}}};
 const load=harness(env),core=load('lib/process-state.ts'),D=await import('../public/process/bom-domain.mjs');
 // BOM exchange now intentionally combines import AND export; noimport lacks both.
 const users=['editor','reviewer','viewer','noimport'].map(id=>({id,name:id,role:'admin',enabled:true,inheritRole:true,accessOverrides:id==='viewer'?Object.fromEntries(['edit','save','submit','withdraw','approve','return','exchange'].map(op=>['bom.'+op,false])):id==='noimport'?{'bom.exchange':false}:{}}));
 const legacy={__format:'PROCESS_OS_BOM_OVERRIDES_V2',replaceAll:true,data:{OLD:[{level:0,itemCode:'',itemName:'Old'}]}};
 const values={platformUsers:JSON.stringify(users),bomOverrides:JSON.stringify(legacy),processEditorFixture:JSON.stringify({id:'operation-1',bomSelections:{OLD:['part-old']}})};
 const encoded=await load('lib/state-records.ts').encodeRecordValues(env.STATE_ARCHIVE,values);db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,1,?,?)').run(encoded,'fixture');
 const route=load('app/api/bom/workflow/route.ts'),headers={};for(const u of users)headers[u.id]={Cookie:'process_demo='+await core.demoSession(new Request('http://localhost'),u.id,false),Origin:'http://localhost','Content-Type':'application/json'};
 const req=async(method,body,user='editor')=>{const r=await route[method](new Request('http://localhost/api/bom/workflow',{method,headers:headers[user],...(body?{body:JSON.stringify(body)}:{})}));return{status:r.status,body:await r.json()};};
 let current,n=0;async function read(){const r=await req('GET');assert.equal(r.status,200,JSON.stringify(r.body));current=r.body.control;return r.body;}
 async function cmd(action,detail={},user='editor',status=200){const r=await req('POST',{command:{action,generation:current.workflow.generation,operationId:randomUUID(),clientId:'fixture-'+user,sequence:++n,...detail}},user);assert.equal(r.status,status,JSON.stringify(r.body));if(status===200)await read();return r;}
 assert.equal((await req('POST',{action:'begin'},'viewer')).status,403);assert.equal((await req('POST',{action:'begin'})).status,200);await read();
 const sheets=[{name:'ERP',rows:[D.columns,['001','0','','','Root','','PCS','0','0','0'],['001','.1','0020','P','Tên','','PCS','2','1','0'],['001','..2','0010','Q','Deep','','PCS','5','10','99']]}];
 const input={sheets,file:'employee.xlsx',base:{},decisions:[{decision:'accept'}]};
 await cmd('apply',{moduleAction:'import-digiwin',input},'noimport',403);await cmd('apply',{moduleAction:'import-digiwin',input});assert.equal(current.workflow.working.bom['001'][2].quantity,'');assert.equal(current.workflow.working.referenceIssues[0].status,'missing-root');
 const stateBefore=await core.readState();assert.deepEqual(JSON.parse(stateBefore.values.bomOverrides),legacy);
 await cmd('apply',{moduleAction:'import-digiwin',input},'editor',409);
 const r=current.workflow.working.bom['001'][1],p=['bom','001',{id:r.id},'itemName'];
 await cmd('apply',{patches:[{op:'set',path:p,value:'Updated'}],guards:[{path:p,value:'Tên'}]});
 await cmd('apply',{patches:[{op:'set',path:p,value:'stale'}],guards:[{path:p,value:'Tên'}]},'editor',409);
 await cmd('apply',{patches:[{op:'set',path:['bom','001',{id:r.id},'itemCode'],value:'FORGED'}]},'editor',422);
 await cmd('apply',{patches:[{op:'set',path:p,value:'Forbidden'}],guards:[{path:p,value:'Updated'}]},'viewer',403);
 await cmd('save');assert.equal(current.workflow.saved.content.bom['001'][1].itemName,'Updated');const saved=current.workflow.saved.id;
 await cmd('submit',{savedId:saved,reason:'BOM fixture'});const caseId=current.workflow.pendingId;
 await cmd('apply',{patches:[]},'editor',409);
 await cmd('approve',{caseId,reason:'Reviewed'},'reviewer');assert.equal(current.activeVersionId,caseId);
 const after=await core.readState(),projected=JSON.parse(after.values.bomOverrides);assert.equal(projected.replaceAll,true);assert.deepEqual(Object.keys(projected.data),['001']);assert.equal(after.values.processEditorFixture,values.processEditorFixture);
 const publicValue=core.publicState(after);assert(!JSON.parse(publicValue.values?.bomMasterControl||publicValue.bomMasterControl).workflow);
 assert.equal((await req('POST',{action:'begin'})).status,200);await read();await cmd('save');const beforeNoChange=await core.readState(),unchanged=await cmd('submit',{savedId:current.workflow.saved.id,reason:'No substantive change'},'editor',422);assert.equal(unchanged.body.error,'NO_SUBSTANTIVE_CHANGE');const afterNoChange=await core.readState();assert.equal(afterNoChange.revision,beforeNoChange.revision);assert.deepEqual(afterNoChange.values,beforeNoChange.values);
 console.log('PASS: import privilege, unchanged active before approval, occurrence identity, L2 exclusion, stale import/edit conflict, manual structure rejection, save/submit/pending lock/review, preserved process references, private draft projection; active no-change422 preserves values');
 if(process.argv.includes('--serve')){db.prepare('UPDATE shared_state SET revision=1,"values"=? WHERE id=1').run(encoded);__esmRequire('./bom-ui-fixture.cjs')({load,headers,core,db});}
})().catch(e=>{console.error(e);process.exitCode=1;});

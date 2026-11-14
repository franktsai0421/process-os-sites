// Generated accounts and ephemeral SQL/R2 only. Never print request bodies or verifiers.
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {workerSource} from './helpers/native-worker-source.mjs';
export async function passwordFixture(format='records'){
 const db=new DatabaseSync(':memory:'),objects=new Map(),cookies=new Map(),secret=randomUUID(),warnings=[];
 let failure=null,beforeCAS=null,gets=[],puts=0;
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...a){args=a;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args),success:true};},async run(){if(sql.startsWith('UPDATE shared_state')){beforeCAS?.();if(failure==='before-cas')throw Error('SYNTHETIC_DB_UNAVAILABLE');}const changes=Number(db.prepare(sql).run(...args).changes);if(sql.startsWith('UPDATE shared_state')&&failure==='after-cas')throw Error('SYNTHETIC_ACK_LOST');return{meta:{changes}};}};},async batch(statements){return Promise.all(statements.map(s=>s.all()));}},STATE_ARCHIVE:{async put(k,v){puts++;if(failure==='put')throw Error('SYNTHETIC_R2_UNAVAILABLE');objects.set(k,Buffer.from(v));},async get(k){gets.push(k);if(failure===k)throw Error('SYNTHETIC_READ_UNAVAILABLE');const v=objects.get(k);return v?{size:v.length,text:async()=>v.toString(),arrayBuffer:async()=>v.buffer.slice(v.byteOffset,v.byteOffset+v.byteLength),body:new ReadableStream({start(c){c.enqueue(v);c.close();}})}:null;},async head(k){return objects.has(k)?{}:null;}}};
 const source=workerSource(env,{consolePort:{warn:v=>warnings.push(v)}}),core=await source.load('lib/process-state.ts'),records=await source.load('lib/state-records.ts'),chunks=await source.load('lib/state-chunks.ts'),pw=await source.load('lib/passwords.ts'),route=await source.load('app/api/user-access/route.ts'),login=await source.load('app/api/platform-login/route.ts');
 const users=[{id:'frank',name:'Synthetic primary',role:'admin',password:secret},{id:'manager',name:'Synthetic manager',role:'admin',password:secret},{id:'legacy',role:'staff',password:secret},{id:'hashed',role:'staff',passwordHash:await pw.passwordHash(secret)},{id:'missing',role:'staff'},{id:'disabled',role:'staff',enabled:false},{id:'other',role:'staff',password:secret}].map(u=>({name:'Synthetic account',enabled:true,inheritRole:true,authEpoch:1,...u}));
 const values={platformUsers:JSON.stringify(users),processCustomRoles:'[]',processRoleTemplateOverrides:'{}',processAccessControl:JSON.stringify({schemaVersion:2,primaryAdminId:'frank',audit:[]}),masterDataControl:JSON.stringify({pageDraftLayout:'page-v1',active:{LINES:{synthetic:true}},versions:[]}),publishedProcess:JSON.stringify({immutableBusiness:'synthetic',versions:[{id:'synthetic',snapshot:{content:'unchanged'}}]})};
 const stored=format==='records'?await records.encodeRecordValues(env.STATE_ARCHIVE,values):format==='chunks'?await chunks.encodeChunkedValues(env.STATE_ARCHIVE,values):format==='monolith'?await core.encodeValues({...values,publishedProcess:JSON.stringify({content:'x'.repeat(600000)})}):JSON.stringify(values);
 db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(stored,'synthetic');
 for(const user of users)cookies.set(user.id,'process_demo='+await core.demoSession(new Request('https://synthetic.invalid'),user.id,false,1));
 const snapshot=()=>({...db.prepare('SELECT * FROM shared_state').get()});
 const request=(actor,method,body)=>new Request('https://synthetic.invalid/api/user-access',{method,headers:{Origin:'https://synthetic.invalid','Content-Type':'application/json',Cookie:cookies.get(actor)||''},...(body?{body:JSON.stringify({baseRevision:snapshot().revision,...body})}:{})});
 const post=(actor,body)=>route.POST(request(actor,'POST',body));
 const get=actor=>route.GET(request(actor,'GET'));
 async function sign(id,password=secret){return login.POST(new Request('https://synthetic.invalid/api/platform-login',{method:'POST',headers:{Origin:'https://synthetic.invalid','Content-Type':'application/json'},body:JSON.stringify({id,password})}));}
 gets=[];puts=0;
 return{db,objects,source,core,records,pw,users,values,secret,cookies,warnings,snapshot,post,get,sign,request,fault(value){failure=value;},beforeCAS(fn){beforeCAS=fn;},io:()=>({gets:[...gets],puts}),resetIO(){gets=[];puts=0;},close(){db.close();}};
}

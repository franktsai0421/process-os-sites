/* oxlint-disable typescript/no-require-imports -- isolated real handlers; no Local business writes. */
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto');
const harness=require('./ipqc-ab-import-harness.cjs');
module.exports=async function fixture(source,options={}){
 const input=JSON.parse(fs.readFileSync(source,'utf8')),values={...input.values},objects=new Map(),db=new DatabaseSync(':memory:');
 let authDb=null,sessionSecret=randomUUID();
 if(options.sessionStore){
  if(!options.sessionSecretFile)throw Error('Durable sessions require a persistent signing secret');
  fs.mkdirSync(path.dirname(options.sessionStore),{recursive:true});
  if(fs.existsSync(options.sessionSecretFile)){sessionSecret=JSON.parse(fs.readFileSync(options.sessionSecretFile,'utf8')).secret;if(typeof sessionSecret!=='string'||sessionSecret.length<32)throw Error('Invalid isolated signing secret');}
  else fs.writeFileSync(options.sessionSecretFile,JSON.stringify({secret:sessionSecret}),{flag:'wx',mode:0o600});
  authDb=new DatabaseSync(options.sessionStore);authDb.exec(fs.readFileSync('scripts/session-revocation-schema.sql','utf8'));
 }
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(path.join('drizzle',file),'utf8'));
 const env={PROCESS_SESSION_SECRET:sessionSecret,...(authDb?{PROCESS_SESSION_REVOCATION_ENABLED:'1'}:{}),DB:{prepare(sql){let args=[];const target=authDb&&sql.includes('process_revoked_sessions')?authDb:db;return{bind(...a){args=a;return this;},async first(){return target.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(target.prepare(sql).run(...args).changes)}};}};}},STATE_ARCHIVE:{
  async put(k,v){objects.set(k,typeof v==='string'?Buffer.from(v):Buffer.from(v));},async head(k){return objects.has(k)?{}:null;},async get(k){const b=objects.get(k);return b?{text:async()=>b.toString(),arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),body:new ReadableStream({start(c){c.enqueue(b);c.close();}}),httpMetadata:{contentType:'image/png'},writeHttpMetadata(h){h.set('Content-Type','image/png');}}:null;}
 }};
 const photoRoot=options.photoRoot||path.join(path.dirname(source),'isolated-photos');function photos(dir,prefix=''){if(!fs.existsSync(dir))return;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const k=prefix+e.name;if(e.isDirectory())photos(path.join(dir,e.name),k+'/');else objects.set(k,fs.readFileSync(path.join(dir,e.name)));}}photos(photoRoot);
 if(options.feedback){env.WEB_FEEDBACK_ENABLED='1';db.exec(fs.readFileSync('scripts/web-feedback-schema.sql','utf8'));}
 const load=harness(env),core=load('lib/process-state.ts'),{createSharedDraft}=load('lib/shared-draft.ts');
 let users=['a','b','reviewer','admin','admin2','employee','disabled','viewer'].map(id=>({id,name:'Isolated '+id,role:id.startsWith('admin')?'admin':id==='reviewer'?'rd':'staff',enabled:id!=='disabled',inheritRole:false,lines:['A','B','C'],views:['editor','approval','data','dispatch','player','productStatus'],permissions:id==='viewer'?[]:id==='employee'?[]:['approval.submit','approval.withdraw','approval.approve','approval.reject','approval.compare','master.delete']}));
 users.push({id:'withdrawer',name:'Isolated withdrawal only',role:'staff',enabled:true,inheritRole:false,lines:['A','B','C'],views:['approval'],permissions:['approval.withdraw']});
 if(input.isolatedResume&&options.normalLogin)users=JSON.parse(input.values.platformUsers);
 if(options.normalLogin){const {createDemoUsers}=await import('../lib/demo-identities.mjs'),{roleDefaults}=load('lib/user-access.ts');for(const user of createDemoUsers(roleDefaults))if(!users.some(existing=>existing.id===user.id))users.push(user);}
 values.platformUsers=JSON.stringify(users);
 // Isolated acceptance uses the captured business snapshot, never browser sample seeding.
 values.versionSampleSeed4='true';
 const master=JSON.parse(values.masterDataControl),c=JSON.parse(values.ipqcCMasterControl),cv=c.versions.find(v=>v.id===c.activeVersionId),ci=cv.snapshot.items.find(i=>!i.deleted&&i.standardEnabled&&i.productCode==='3012902')||cv.snapshot.items.find(i=>!i.deleted&&i.standardEnabled),cp=master.active.C.products.find(p=>p.code===ci.productCode);
 const original=JSON.parse(values.processAuthoringControl),a=original.workflow.working.workspaces.find(w=>w.line==='A'&&w.category==='BORUAXE1021'),aw=structuredClone(a);
 const cstage=ci.stageCode,op={id:'isolated-c-1',stageCode:cstage,number:cstage+'-01',name:'Kiểm tra sản phẩm · 隔離驗收流程',productCodes:[ci.productCode],nextIds:[],mode:'human',people:1,ipqc:'Legacy IPQC text retained',instructions:'Kiểm tra theo tiêu chuẩn',instructionSteps:[{text:'Kiểm tra theo tiêu chuẩn',standard:'Theo tiêu chuẩn đã duyệt'}],machineIds:[],bomItems:[],bomSelections:{},mediaItems:[],x:30,y:30};
 const cw={id:JSON.stringify([cp.category,'C']),category:cp.category,line:'C',stages:{[cstage]:[op,{...structuredClone(op),id:'isolated-c-2',number:cstage+'-02',x:460}]}};
 const content={workspaces:[aw,cw]},flow=createSharedDraft('process:platform',content,'isolated-base',randomUUID()),stamp={creatorId:'reviewer',creatorName:'Isolated reviewer',createdAt:'2026-10-06T00:00:00Z',updatedAt:'2026-10-06T00:00:00Z',revision:1,history:[]};
 values.processAuthoringControl=input.isolatedResume?input.values.processAuthoringControl:JSON.stringify({activeVersionId:'isolated-base',versions:[{...stamp,id:'isolated-base',number:1,status:'approved',snapshot:structuredClone(content)},{...stamp,id:'shared-'+flow.generation,number:2,status:'draft',snapshot:flow.working}],workflow:flow});
 if(!input.isolatedResume)values.dispatchBoard=JSON.stringify({A:aw.stages[Object.keys(aw.stages)[0]][0].productCodes,C:[ci.productCode]});
 db.prepare('INSERT INTO shared_state(id,revision,"values",updated_at) VALUES(1,?,?,?)').run(input.isolatedResume?input.revision:1,JSON.stringify(values),'isolated');
 const sessions={};for(const u of users)sessions[u.id]={Cookie:'process_demo='+await core.demoSession(new Request('http://127.0.0.1'),u.id,false),Origin:'http://127.0.0.1','Content-Type':'application/json'};
 const routes=new Map();const api=endpoint=>{const name=endpoint.replace(/^\/api\//,'');if(!routes.has(name))routes.set(name,load('app/api/'+name+'/route.ts'));return routes.get(name);};
 async function request(endpoint,method='GET',body,user='a'){const response=await api(endpoint.split('?')[0])[method](new Request('http://127.0.0.1'+endpoint,{method,headers:sessions[user],...(body===undefined?{}:{body:JSON.stringify(body)})}));return{status:response.status,body:await response.json()};}
 return{db,env,load,core,values,sessions,api,request,metadata:{sourceRevision:input.revision,abScope:'A:BORUAXE1021',cItemId:ci.id,cProduct:ci.productCode,cStage:cstage,cCategory:cp.category,cWorkspace:cw.id,abApproved:false,cApproved:true},close:()=>{db.close();authDb?.close();}};
};

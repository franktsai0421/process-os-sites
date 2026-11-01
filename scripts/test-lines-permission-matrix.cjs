/* oxlint-disable typescript/no-require-imports -- isolated real API / CAS; no Local writes. */
const assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),{randomUUID}=require('node:crypto'),harness=require('./ipqc-ab-import-harness.cjs');
const db=new DatabaseSync(':memory:'),objects=new Map();db.exec('CREATE TABLE shared_state(id INTEGER PRIMARY KEY,revision INTEGER,"values" TEXT,updated_at TEXT);CREATE TABLE state_backups(id TEXT PRIMARY KEY,revision INTEGER,"values" TEXT,reason TEXT,actor TEXT,created_at TEXT)');
const env={PROCESS_SESSION_SECRET:randomUUID(),STATE_ARCHIVE:{async put(k,v){objects.set(k,v);},async get(k){return objects.has(k)?{text:async()=>objects.get(k)}:null;},async head(k){return objects.has(k)?{}:null;}},DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async run(){return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};}}};
const load=harness(env),core=load('lib/process-state.ts'),api=load('app/api/master/workflow/route.ts'),link=load('lib/master-stage-link.ts'),copy=v=>JSON.parse(JSON.stringify(v)),sessions={},seq={};
 let accessKeys;const users=['a','b','reviewer'].map(id=>({id,name:'Synthetic '+id,role:'admin',enabled:true,accessOverrides:{}}));
const catalog=line=>({products:[{code:line+'1',name:'Sản phẩm',line,category:'G',stages:[line+'-CUT']}],lines:[{code:line,name:line,stages:[{code:line+'-CUT',name:'Cắt'}]}],categoryGroups:[{line,name:'G'}]});
const active={AB:catalog('A'),C:catalog('C'),PROCESS:{'A-CUT':link.stageDefaultTemplates('A-CUT'),'C-CUT':link.stageDefaultTemplates('C-CUT')}},root={active:copy(active),versions:Object.entries(active).map(([scope,snapshot])=>({scope,snapshot:copy(snapshot),id:scope+'-active',number:1,status:'approved',revision:1,creatorId:'system',creatorName:'system',createdAt:'fixture',updatedAt:'fixture',history:[]}))};
db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify({platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(root),processMasterData:JSON.stringify(root.active.PROCESS)}),'fixture');
const url=scope=>'http://fixture/api/master/workflow?scope='+scope+'&caseMetadata=1';
async function get(scope,who='a',query=''){const r=await api.GET(new Request(url(scope)+query,{headers:sessions[who]}));assert.equal(r.status,200);return r.json();}
async function post(scope,who,body,expected=200){const r=await api.POST(new Request(url(scope),{method:'POST',headers:sessions[who],body:JSON.stringify(body)})),data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;}
async function cmd(scope,who,action,detail={}){const flow=(await get(scope,who)).control.workflow;return{action,expectedRevision:flow.revision,...detail,operationId:randomUUID(),clientId:'stage-link-'+who,sequence:seq[scope+who]=(seq[scope+who]||0)+1,generation:flow.generation};}
async function run(scope,who,action,detail={},expected=200){return post(scope,who,{command:await cmd(scope,who,action,detail)},expected);}
async function state(){const s=await core.readState();return{s,root:JSON.parse(s.values.masterDataControl)};}

void(async()=>{const results=[];try{
 accessKeys=(await import('../public/process/access-policy.mjs')).accessKeys;
 async function reset(role,scope,denied){
  for(const user of users){user.role=user.id==='b'?role:'admin';user.accessOverrides=Object.fromEntries(accessKeys.map(k=>[k,true]));}
  if(denied)users[1].accessOverrides[scope.toLowerCase()+'.'+denied]=false;
  const clean=copy(root);db.prepare('UPDATE shared_state SET revision=1,"values"=?').run(JSON.stringify({platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(clean),processMasterData:JSON.stringify(clean.active.PROCESS)}));
  objects.clear();for(const user of users)sessions[user.id]={Cookie:'process_demo='+await core.demoSession(new Request(url(scope)),user.id,false),Origin:'http://fixture','Content-Type':'application/json'};
 }
 for(const role of ['admin','staff'])for(const scope of ['AB','C'])for(const action of ['view','create','edit','delete','save','submit','withdraw','return','approve'])for(const allowed of [false,true]){
  await reset(role,scope,allowed?null:action);
  const endpoint=url(scope),lineCode=scope==='AB'?'A':'C';
  if(action==='view'){
   const response=await api.GET(new Request(endpoint,{headers:sessions.b}));assert.equal(response.status,allowed?200:403);
  }else{
   await post(scope,'a',{action:'begin'});const flow=(await get(scope)).control.workflow,line=flow.working.lines.find(l=>l.code===lineCode),stage=line.stages[0];
   const namePath=['lines',{id:line.id},'stages',{id:stage.id},'name'];
   let commandAction=action,detail={};
   if(action==='create'){commandAction='apply';detail={patches:[{op:'insert',path:['lines',{id:line.id},'stages'],value:{id:'synthetic-new',code:lineCode+'-NEW',name:'New'}}]};}
   if(action==='edit'){commandAction='apply';detail={patches:[{op:'set',path:namePath,value:'Edited'}],guards:[{path:namePath,value:stage.name}]};}
   if(action==='delete'){
    const added={id:'synthetic-unused',code:lineCode+'-UNUSED',name:'Unused'};await run(scope,'a','apply',{patches:[{op:'insert',path:['lines',{id:line.id},'stages'],value:added}]});
    const path=['lines',{id:line.id},'stages',{id:added.id}];commandAction='apply';detail={patches:[{op:'remove',path}],guards:[{path,value:added}]};
   }
   if(['submit','withdraw','return','approve'].includes(action)){
    await run(scope,'a','apply',{patches:[{op:'set',path:namePath,value:'Changed for review'}],guards:[{path:namePath,value:stage.name}]});
    const saved=(await run(scope,'a','save')).control.workflow.saved;detail={savedId:saved.id,reason:'Synthetic matrix'};
    if(action!=='submit'){const sent=await run(scope,'a','submit',detail);detail={caseId:sent.receipt.caseId,reason:'Synthetic matrix',selfReviewConfirmed:true};}
   }
   const before=JSON.stringify((await state()).s),response=await run(scope,'b',commandAction,detail,allowed?200:403);
   if(!allowed){assert.equal(response.error,'FORBIDDEN');assert.equal(JSON.stringify((await state()).s),before);}
  }
  results.push({role,scope,action,allowed,status:'PASS'});
 }
 const validation=[];
 await reset('admin','AB',null);await post('AB','a',{action:'begin'});
 const working=(await get('AB')).control.workflow.working,line=working.lines[0],stage=line.stages[0];
 for(const [label,patches,guards,code] of [
  ['invalid new stage',[{op:'insert',path:['lines',{id:line.id},'stages'],value:{id:'invalid',code:'BAD CODE !',name:'New'}}],[],'STAGE_CODE_INVALID'],
  ['invalid new line',[{op:'insert',path:['lines'],value:{id:'invalid',code:'BAD CODE !',name:'New',stages:[]}}],[],'LINE_CODE_INVALID'],
  ['blank new stage name',[{op:'insert',path:['lines',{id:line.id},'stages'],value:{id:'invalid',code:'A-VALID',name:'  '}}],[],'NAME_REQUIRED'],
  ['blank existing stage name',[{op:'set',path:['lines',{id:line.id},'stages',{id:stage.id},'name'],value:'  '}],[{path:['lines',{id:line.id},'stages',{id:stage.id},'name'],value:stage.name}],'NAME_REQUIRED'],
  ['blank existing line name',[{op:'set',path:['lines',{id:line.id},'name'],value:'  '}],[{path:['lines',{id:line.id},'name'],value:line.name}],'NAME_REQUIRED']
 ]){const before=(await state()).s.revision,response=await run('AB','a','apply',{patches,guards},422);assert.equal(response.error,code);assert.equal((await state()).s.revision,before);validation.push({label,status:'PASS'});}
 await reset('admin','AB',null);
 const legacy=copy(root);legacy.active.AB.lines[0].stages[0].code='LEGACY CODE';legacy.active.AB.products[0].stages=['LEGACY CODE'];legacy.active.PROCESS['LEGACY CODE']=legacy.active.PROCESS['A-CUT'];delete legacy.active.PROCESS['A-CUT'];for(const v of legacy.versions)v.snapshot=copy(legacy.active[v.scope]);
 db.prepare('UPDATE shared_state SET "values"=?').run(JSON.stringify({platformUsers:JSON.stringify(users),masterDataControl:JSON.stringify(legacy),processMasterData:JSON.stringify(legacy.active.PROCESS)}));
 await post('AB','a',{action:'begin'});const legacyFlow=(await get('AB')).control.workflow,l=legacyFlow.working.lines[0],st=l.stages[0],p=['lines',{id:l.id},'stages',{id:st.id},'name'];
 await run('AB','a','apply',{patches:[{op:'set',path:p,value:'Legacy renamed without recoding'}],guards:[{path:p,value:st.name}]});assert.equal((await get('AB')).control.workflow.working.lines[0].stages[0].code,'LEGACY CODE');validation.push({label:'untouched legacy code survives name edit',status:'PASS'});
 console.log(JSON.stringify({status:'PASS',cases:results.length,results,validation},null,2));
}catch(error){console.error(error);process.exitCode=1;}finally{db.close();}})();

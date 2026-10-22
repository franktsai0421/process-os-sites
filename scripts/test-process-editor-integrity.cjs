const assert=require('node:assert/strict'),fixture=require('./ipqc-assignment-fixture.cjs'),{randomUUID}=require('node:crypto');
const source=require('./local-evidence-paths.cjs').configuredPath('PROCESS_EDITOR_FIXTURE_SOURCE',""),wid=JSON.stringify(['EDITOR ACCEPTANCE','A']),base=['workspaces',{id:wid},'stages'],seq={},evidence=[];let f;
const norm=v=>JSON.parse(JSON.stringify(v));
async function read(){return (await f.request('/api/process-authoring/workflow','GET',undefined,'admin')).body.control;}
async function send(user,action,detail={}){const c=await read();return f.request('/api/process-authoring/workflow','POST',{command:{operationId:randomUUID(),clientId:'editor-test-'+user,sequence:seq[user]=(seq[user]||0)+1,generation:c.workflow.generation,action,...detail}},user);}
async function change(user,id,fields,stage='A-CUT',original){const c=await read(),o=original||c.workflow.working.workspaces.find(w=>w.id===wid).stages[stage].find(o=>o.id===id),p=[...base,stage,{id}],patches=Object.entries(fields).map(([k,value])=>({op:'set',path:[...p,k],value})),guards=Object.keys(fields).map(k=>({path:[...p,k],value:o[k]}));return send(user,'apply',{patches,guards});}
function ok(name,r,status=200){assert.equal(r.status,status,JSON.stringify({name,...r}));evidence.push({name,status:r.status,error:r.body.error||null,details:r.body.details||null});}
(async()=>{f=await fixture(source);try{
 const _before=await read();ok('BM01 common code only valid products',await change('admin','pe-1',{bomSelections:{'PED-A':['P001'],'PED-B':['P001']}}));
 ok('BM09 reject nonexistent product component',await change('admin','pe-1',{bomSelections:{'PED-A':['P001'],'PED-B':['P001'],'PED-C':['P001']}}),409);
 ok('BM02 reject other stage occupancy',await change('admin','pe-2',{bomSelections:{'PED-A':['P002']}}),409);
 ok('BM03 other product same code allowed',await change('admin','pe-2',{bomSelections:{'PED-B':['P002']}}));
 const _original=(await read()).workflow.working.workspaces[0].stages['A-CUT'].find(o=>o.id==='pe-4');
 const race=await Promise.all([change('admin','pe-3',{bomSelections:{'PED-C':['P003']}}),change('admin2','pe-4',{bomSelections:{'PED-C':['P003']}})]);assert.deepEqual(race.map(r=>r.status).sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }),[200,409]);evidence.push({name:'BM10 concurrent allocation',statuses:race.map(r=>r.status)});
 ok('BM06 release after removing product',await change('admin','pe-1',{productCodes:['PED-B','PED-C'],bomSelections:{'PED-B':['P001']}}));ok('BM06 released allocation usable elsewhere',await change('admin2','pe-2',{bomSelections:{'PED-A':['P001'],'PED-B':['P002']}}));
 ok('BM08 readd requires explicit BOM',await change('admin','pe-1',{productCodes:['PED-A','PED-B','PED-C']}));assert.equal((await read()).workflow.working.workspaces[0].stages['A-CUT'][1].bomSelections['PED-A'],undefined);
 ok('LN01 duplicate entry rejected',await change('admin','pe-4',{editorType:'entry',productCodes:[],bomSelections:{}}),409);
 ok('LN02 exit cannot have multiple predecessors',await change('admin','pe-1',{nextIds:['pe-5']}),409);
 ok('LN03 cycle rejected',await change('admin','pe-4',{nextIds:['pe-1']}),409);
 ok('LN03 self link rejected',await change('admin','pe-1',{nextIds:['pe-1']}),409);
 ok('LN03 cross-stage rejected',await change('admin','pe-1',{nextIds:['pe-occupied']}),409);
 ok('LN03 duplicate edge rejected',await change('admin','pe-0',{nextIds:['pe-1','pe-1']}),409);
 ok('LN02 regular extra successor rejected',await change('admin','pe-1',{nextIds:['pe-3','pe-4']}),409);
 const current=(await read()).workflow.working.workspaces[0].stages['A-CUT'].find(o=>o.id==='pe-4');ok('SH01 admin edits block one',await change('admin','pe-1',{name:'Changed by admin'}));ok('SH01 employee edits different block',await change('employee','pe-4',{name:'Changed by employee'}));
 const stale=await send('admin2','apply',{patches:[{op:'set',path:[...base,'A-CUT',{id:'pe-4'},'name'],value:'stale'}],guards:[{path:[...base,'A-CUT',{id:'pe-4'}],value:current}]});ok('SH03 stale same block rejected',stale,409);
 const saved=await send('employee','save');ok('MD03 employee manual save',saved);const saveId=saved.body.control.workflow.saved.id;ok('SH02 submit fixed snapshot',await send('employee','submit',{savedId:saveId,reason:'Synthetic editor acceptance only'}));ok('SH02 pending locked',await change('admin','pe-1',{name:'blocked'}),409);const pending=(await read()).workflow.pendingId;ok('SH02 cross-account withdrawal',await send('admin2','withdraw',{caseId:pending,reason:'Synthetic editor acceptance withdrawal'}));
 const reopened=await f.load('app/api/process-authoring/workflow/route.ts').GET(new Request('http://127.0.0.1/api/process-authoring/workflow',{headers:f.sessions.admin}));assert.equal(reopened.status,200);assert.equal((await reopened.json()).control.workflow.saved.id,saveId);
 assert.equal((await read()).workflow.working.workspaces[0].stages['A-CUT'][1].name,'Changed by admin');
 // Save re-evaluates a changed source as an advisory; it must not erase the original association.
 const state=await f.core.readState(),bom=JSON.parse(state.values.bomOverrides);bom.data['PED-B']=bom.data['PED-B'].filter(r=>r.itemCode!=='P001');f.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=?').run(JSON.stringify({...state.values,bomOverrides:JSON.stringify(bom)}));ok('BM11 source change save preserves advisory',await send('admin','save'));const issues=await f.request('/api/process-authoring/workflow?contentIssues=1','GET',undefined,'admin');assert.ok(issues.body.working.issues.some(i=>i.message.includes('BOM_REFERENCE_INVALID')));assert.deepEqual(norm((await read()).workflow.working.workspaces[0].stages['A-CUT'][1].bomSelections),{'PED-B':['P001']});
 console.log(JSON.stringify({result:'PASS',checks:evidence,liveBusinessWrites:0},null,2));
}finally{f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

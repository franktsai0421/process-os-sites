/* oxlint-disable typescript/no-require-imports -- Actual isolated handler tests. */
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const fixture=require('../scripts/tooling-local-save-fixture.cjs');
const cmd=(generation,patches=[],guards=[])=>({action:'save',moduleAction:'save-local-v1',generation,operationId:randomUUID(),clientId:randomUUID(),sequence:1,patches,guards});
const set=(id,field,value,old)=>({patches:[{op:'set',path:['tools',{id},field],value}],guards:[{path:['tools',{id},field],value:old}]});
void test('tooling atomic Save, permissions, conflict, allocation, history and replay',async()=>{
 const f=await fixture();try{
 const started=await f.call({action:'begin'});assert.equal(started.status,200);const g=started.body.control.workflow.generation;
 assert.equal((await f.call()).body.permissions.save,true,'edit grants Save even explicit Save false');
 const change=set('one','notes','editor change',''),command=cmd(g,change.patches,change.guards);
 const revision=()=>f.db.prepare('SELECT revision FROM shared_state').get().revision;
 const before=revision(),result=await f.call({command});assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(revision(),before+1,'one CAS');
 let flow=(await f.read()).workflow;assert.deepEqual(flow.saved.content,flow.working);assert.equal(flow.saved.content.tools[0].notes,'editor change');assert.equal(Object.keys(flow.receipts).length,1,'only outer Save receipt');
 const saved=flow.saved.id,unchanged=revision();assert.equal((await f.call({command})).status,200);assert.equal(revision(),unchanged,'replay never writes');
 const other=set('one','specification','other field','Synthetic');assert.equal((await f.call({command:cmd(g,other.patches,other.guards)},'other')).status,200);
 flow=(await f.read()).workflow;assert.equal(flow.saved.content.tools[0].notes,'editor change');assert.equal(flow.saved.content.tools[0].specification,'other field');
 const conflict=set('one','notes','stale',''),intact=await f.read();assert.equal((await f.call({command:cmd(g,conflict.patches,conflict.guards)},'other')).status,409);assert.deepEqual(await f.read(),intact);
 assert.equal((await f.call({command:{...cmd(g),action:'submit',savedId:saved,expectedRevision:flow.revision,reason:'not authorized'}})).status,403);
 await f.rights('other',{edit:false,save:false,submit:true});assert.equal((await f.call({command:cmd(g)},'other')).status,403);
 await f.rights('other',{save:true});assert.equal((await f.call({command:{...cmd(g),moduleAction:undefined}},'other')).status,200,'explicit Save-only still supported');assert.equal((await f.call({command:cmd(g)},'other')).status,403,'Save-only cannot apply edits');
 const newTool=f.tool('new');delete newTool.code;newTool.categoryId='new-cat';newTool.iqcIds=['part'];const photo='a'.repeat(64);await f.env.STATE_ARCHIVE.put('tooling/photos/'+photo,Buffer.from('synthetic'));newTool.photos=[{id:photo}];
 const inserts=[{op:'insert',path:['categories'],value:{id:'new-cat',nameVi:'New'}},{op:'insert',path:['tools'],value:newTool},{op:'insert',path:['tools'],value:{...newTool,id:'new-2'}}];
 const allocation=await f.call({command:cmd(g,inserts)});assert.equal(allocation.status,200,JSON.stringify(allocation.body));flow=(await f.read()).workflow;assert.equal(flow.working.categories.at(-1).code,'DC02');assert.deepEqual(flow.working.tools.slice(-2).map(t=>t.code),['DC02-0001','DC02-0002']);
 for(const [field,value]of [['photos',[{id:'b'.repeat(64)}]],['iqcIds',['missing']],['quantity',0],['inactiveReason','']]){
  const c=set('one',field,value,flow.working.tools[0][field]);if(field==='inactiveReason'){c.patches.push({op:'set',path:['tools',{id:'one'},'enabled'],value:false});c.guards.push({path:['tools',{id:'one'},'enabled'],value:true});}
  const prior=await f.read();assert.equal((await f.call({command:cmd(g,c.patches,c.guards)})).status,422);assert.deepEqual(await f.read(),prior);
 }
 const protectedTool=flow.working.tools[0],remove={op:'remove',path:['tools',{id:'one'}]};assert.equal((await f.call({command:cmd(g,[remove],[{path:remove.path,value:protectedTool}])})).status,422);
 const cat=flow.working.categories[0],delCat={op:'remove',path:['categories',{id:cat.id}]};assert.equal((await f.call({command:cmd(g,[delCat],[{path:delCat.path,value:cat}])})).status,422);
 let raced=false;f.hooks.run=sql=>{if(!raced&&sql.startsWith('UPDATE shared_state')){raced=true;f.db.prepare('UPDATE shared_state SET revision=revision+1 WHERE id=1').run();}};
 const c=set('two','notes','raced','');assert.equal((await f.call({command:cmd(g,c.patches,c.guards)})).status,200);assert(raced);delete f.hooks.run;
 await f.rights('editor',{submit:true,withdraw:true,approve:true,return:true});flow=(await f.read()).workflow;
 const submit=await f.call({command:{...cmd(g),moduleAction:undefined,action:'submit',savedId:flow.saved.id,expectedRevision:flow.revision,reason:'Synthetic review'}});assert.equal(submit.status,200,JSON.stringify(submit.body));
 assert.equal((await f.call({command:cmd(g,c.patches,c.guards)})).status,409,'pending lock');
 const review=await f.call({command:{...cmd(g),moduleAction:undefined,action:'withdraw',caseId:submit.body.control.workflow.pendingId,reason:'Synthetic withdrawal'}});assert.equal(review.status,200);assert.equal((await f.call({command:cmd(g)})).status,409,'stale generation');
 f.revoke();assert.equal((await f.call({command:cmd(g)})).status,401);
 }finally{f.close();}
});
void test('atomic transfer Save preserves approved history, correction and no-change restriction',async()=>{
 const f=await fixture();try{
 await f.rights('editor',{submit:true,withdraw:true});await f.rights('other',{approve:true,return:true});
 const begin=await f.call({action:'begin'});let g=begin.body.control.workflow.generation;
 const move={id:'move',toolId:'one',from:{kind:'internal',holderId:'holder'},to:{kind:'external',holderId:'supplier'},reason:'Synthetic transfer'};
 const saved=await f.call({command:cmd(g,[{op:'insert',path:['suppliers'],value:{id:'supplier',nameVi:'Synthetic supplier',nameZh:'',erp:'',addresses:[],phones:[],contacts:[]}},{op:'insert',path:['transfers'],value:move}])});assert.equal(saved.status,200,JSON.stringify(saved.body));
 let flow=(await f.read()).workflow;assert.equal(flow.working.transfers[0].createdById,'editor');assert.equal(flow.working.transfers[0].quantity,1);assert.equal(flow.active.content.transfers.length,0);
 const submit=await f.call({command:{...cmd(g),action:'submit',moduleAction:undefined,savedId:flow.saved.id,expectedRevision:flow.revision,reason:'Synthetic approval'}});assert.equal(submit.status,200);
 const approve=await f.call({command:{...cmd(g),action:'approve',moduleAction:undefined,caseId:submit.body.control.workflow.pendingId}},'other');assert.equal(approve.status,200,JSON.stringify(approve.body));
 const retained=await f.read(),again=await f.call({action:'begin'});g=again.body.control.workflow.generation;flow=(await f.read()).workflow;
 assert.equal((await f.call({command:{...cmd(g),moduleAction:undefined}})).status,200);flow=(await f.read()).workflow;
 assert.equal((await f.call({command:{...cmd(g),action:'submit',moduleAction:undefined,savedId:flow.saved.id,expectedRevision:flow.revision,reason:'unchanged'}})).status,422);
 const correction={...move,id:'correction',correctionOf:'move',reason:'Synthetic correction',to:{kind:'internal',holderId:'holder'}};
 assert.equal((await f.call({command:cmd(g,[{op:'insert',path:['transfers'],value:correction}])})).status,200);
 const after=await f.read();assert.deepEqual(after.workflow.working.transfers[0],retained.workflow.active.content.transfers[0]);assert.deepEqual(after.workflow.cases,retained.workflow.cases);assert.deepEqual(after.transferApprovals,retained.transferApprovals);
 const prior=await f.read(),tool=prior.workflow.working.tools[0],transfer=prior.workflow.working.transfers[0];const removals=[['transfers',transfer],['tools',tool]].map(([key,row])=>({op:'remove',path:[key,{id:row.id}]}));assert.equal((await f.call({command:cmd(g,removals,removals.map((p,i)=>({path:p.path,value:[transfer,tool][i]})))})).status,422);assert.deepEqual(await f.read(),prior);
 }finally{f.close();}
});
void test('tooling photo write requires live edit permission',async()=>{const f=await fixture();try{await f.rights('editor',{edit:false,save:true});const api=f.load('app/api/tooling/photo/route.ts');const r=await api.PUT(new Request('https://synthetic.invalid/api/tooling/photo',{method:'PUT',headers:{origin:'https://synthetic.invalid',cookie:f.cookies.editor,'Content-Type':'image/png'},body:Buffer.from('synthetic')}));assert.equal(r.status,403);}finally{f.close();}});

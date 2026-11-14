const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('./process-ipqc-link-fixture.cjs');
const tuple=c=>Object.fromEntries(['source','scope','itemId','sourceVersionId','productCodes'].map(k=>[k,c[k]]));
const processURL='/api/process-authoring/workflow';
const choices=(f,line,products=[],category='SYN',stage=line==='C'?'TIEN':'A-CUT')=>f.request('/api/process-ipqc?'+new URLSearchParams({mode:'choices',line,category,stage})+products.map(p=>'&product='+encodeURIComponent(p)).join(''));
function edit(f,line,id,links,before=[],extra={}){const w=JSON.stringify(['SYN',line]),stage=line==='C'?'TIEN':'A-CUT',path=['workspaces',{id:w},'stages',stage,{id},'ipqcAssignments'];return f.command(processURL,'apply',{moduleAction:'save-canvas-v1',source:'canvas-v2:'+JSON.stringify([w,stage]),patches:[{op:'set',path,value:links}],guards:[{path,value:before}],...extra});}
for(const storage of ['inline','records-v1'])for(const source of ['AB','C'])void test(`${storage} ${source}: new error+item → Save/Submit/approve → choose → atomic Save/reload; approval remains independent`,async()=>{
 const f=await fixture(storage);try{const x=await f.create(source),line=source==='AB'?'A':'C',products=line==='C'?['001']:[];
 assert.equal((await choices(f,line,products)).body.reason,'SOURCE_NOT_APPROVED');await f.promote(x.url);
 const c=(await choices(f,line,products)).body.choices;assert.equal(c.length,1);assert.equal(c[0].itemId,x.item.id);assert.equal(c[0].errorId,x.error.id);const a=tuple(c[0]);
 const saved=await edit(f,line,'one',[a]);assert.equal(saved.control.workflow.saved.content.workspaces.find(w=>w.line===line).stages[x.error.stageCode][0].ipqcAssignments[0].itemId,x.item.id);
 const reload=(await f.request(processURL)).body.control;assert.equal(reload.activeVersionId,null,'IPQC approval cannot approve PROCESS');assert.deepEqual(reload.workflow.working,reload.workflow.saved.content);
 assert.deepEqual(reload.workflow.working.workspaces.find(w=>w.line===line).stages[x.error.stageCode][0].ipqcAssignments,[a]);
 const refs=await f.request('/api/process-ipqc?source='+source+'&itemId='+x.item.id);assert(refs.body.references.some(r=>r.operationId==='one'&&r.saved));
 const denied=await f.request(processURL,'POST',{command:{action:'apply',generation:reload.workflow.generation,operationId:randomUUID(),clientId:'denied',sequence:1,patches:[]}},'reader');assert.equal(denied.status,403);
 }finally{f.close();}
});
void test('A/B independent of none, different, multiple products/routes; exact line/category/stage and approved enabled children only',async()=>{
 const f=await fixture();try{const x=await f.create('AB');await f.promote(x.url);const baseline=(await choices(f,'A')).body;
 for(const products of [['A1'],['A2'],['A1','A2'],['unknown']])assert.deepEqual((await choices(f,'A',products)).body,baseline);
 for(const [line,category,stage]of [['B','SYN','A-CUT'],['A','OTHER','A-CUT'],['A','SYN','OTHER']])assert.equal((await choices(f,line,[],category,stage)).body.choices.length,0);
 const ipqc=f.load('lib/process-ipqc.ts'),values=await f.values(),q=JSON.parse(values.ipqcABMasterControl),v=q.scopes['A:SYN'].versions.find(v=>v.id===q.scopes['A:SYN'].activeVersionId),a=tuple(baseline.choices[0]),w=structuredClone(f.workspaces[0]);w.stages['A-CUT'][0].ipqcAssignments=[a];
 for(const productCodes of [[],['A1'],['A2'],['A1','A2']]){w.stages['A-CUT'][0].productCodes=productCodes;ipqc.validateIPQCAssignments([w],[],values);assert(!ipqc.ipqcIssues([w],values).some(i=>i.message.startsWith('IPQC_REFERENCE_CHANGED')));}
 for(const change of ['disabled','deleted','empty']){const c=structuredClone(q),s=c.scopes['A:SYN'].versions.find(row=>row.id===v.id);if(change==='empty')s.snapshot.items=[];else s.snapshot.items[0][change==='disabled'?'isEnabled':'deleted']=change!=='disabled';const current={...values,ipqcABMasterControl:JSON.stringify(c)};assert.equal(ipqc.ipqcChoices(current,w,'A-CUT',[]).choices.length,0);assert.equal(ipqc.ipqcChoices(current,w,'A-CUT',[]).reason,'NO_MATCHING_ITEMS');ipqc.validateIPQCAssignments([w],[w],current);assert(ipqc.ipqcIssues([w],current).some(i=>i.message.startsWith('IPQC_REFERENCE_CHANGED')));}
 }finally{f.close();}
});
void test('C product union, no hidden route, exact identity/category/stage, same names retain distinct IDs; disabled/not-applicable preserved and flagged',async()=>{
 const f=await fixture();try{await f.create('C','001');await f.create('C','002');await f.promote(f.endpoint('C'));assert.equal((await choices(f,'C')).body.reason,'NO_PRODUCTS');
 const a=(await choices(f,'C',['001'])).body.choices,b=(await choices(f,'C',['002'])).body.choices,all=(await choices(f,'C',['001','002'])).body.choices;assert.equal(a.length,1);assert.equal(b.length,1);assert.equal(all.length,2);assert.notEqual(a[0].itemId,b[0].itemId);assert.equal(a[0].errorName,b[0].errorName);
 const ipqc=f.load('lib/process-ipqc.ts'),values=await f.values(),master=JSON.parse(values.masterDataControl);master.active.C.products.forEach(p=>p.stages=[]);values.masterDataControl=JSON.stringify(master);
 assert.equal(ipqc.ipqcChoices(values,{line:'C',category:'SYN'},'TIEN',['001','002']).choices.length,2);assert.equal((await choices(f,'C',['001'],'OTHER')).body.choices.length,0);assert.equal((await choices(f,'C',['001'],'SYN','OTHER')).body.choices.length,0);
 const w=structuredClone(f.workspaces[1]),old=structuredClone(w);w.stages.TIEN[0].ipqcAssignments=[tuple(a[0])];ipqc.validateIPQCAssignments([w],[],values);old.stages.TIEN[0]=structuredClone(w.stages.TIEN[0]);w.stages.TIEN[0].productCodes=['002'];ipqc.validateIPQCAssignments([w],[old],values);assert(ipqc.ipqcIssues([w],values).some(i=>i.message.startsWith('IPQC_REFERENCE_CHANGED')));assert.throws(()=>ipqc.validateIPQCAssignments([w],[],values),/IPQC_SOURCE_CHANGED/);
 for(const field of ['standardEnabled','notApplicable','deleted']){const c=JSON.parse(values.ipqcCMasterControl),v=c.versions.find(v=>v.id===c.activeVersionId);v.snapshot.items.find(i=>i.id===a[0].itemId)[field]=field!=='standardEnabled';const next={...values,ipqcCMasterControl:JSON.stringify(c)};assert.equal(ipqc.ipqcChoices(next,{line:'C',category:'SYN'},'TIEN',['001']).choices.length,0);ipqc.validateIPQCAssignments([old],[old],next);assert(ipqc.ipqcIssues([old],next).some(i=>i.message.startsWith('IPQC_REFERENCE_CHANGED')));}
 }finally{f.close();}
});
for(const source of ['AB','C'])void test(`${source}: atomic peer race, own remove, required saved release then transfer, source version race`,async()=>{
 const f=await fixture('records-v1');try{const x=await f.create(source);await f.promote(x.url);const line=source==='AB'?'A':'C',c=(await choices(f,line,line==='C'?['001']:[])).body.choices[0],a=tuple(c),flow=(await f.request(processURL)).body.control.workflow,w=JSON.stringify(['SYN',line]),stage=x.error.stageCode;
 const cmd=id=>{const path=['workspaces',{id:w},'stages',stage,{id},'ipqcAssignments'];return{action:'apply',moduleAction:'save-canvas-v1',source:'canvas-v2:'+JSON.stringify([w,stage]),generation:flow.generation,expectedRevision:flow.revision,operationId:randomUUID(),clientId:'race-'+id,sequence:1,patches:[{op:'set',path,value:[a]}],guards:[{path,value:[]}]};};
 const replies=await Promise.all(['one','two'].map((id,i)=>f.request(processURL,'POST',{command:cmd(id)},i?'peer':'editor')));assert.deepEqual(replies.map(r=>r.status).sort((a,b)=>a-b),[200,409]);const owner=replies[0].status===200?'one':'two',target=owner==='one'?'two':'one';
 const path=id=>['workspaces',{id:w},'stages',stage,{id},'ipqcAssignments'];
 await f.command(processURL,'apply',{moduleAction:'save-canvas-v1',source:'canvas-v2:'+JSON.stringify([w,stage]),patches:[{op:'set',path:path(owner),value:[]},{op:'set',path:path(target),value:[a]}],guards:[{path:path(owner),value:[a]},{path:path(target),value:[]}]},'editor',409);
 await edit(f,line,owner,[],[a]);await edit(f,line,target,[a]);
 const values=await f.values(),ipqc=f.load('lib/process-ipqc.ts'),next=structuredClone(f.workspaces.find(w=>w.line===line));next.stages[stage][0].ipqcAssignments=[{...a,sourceVersionId:'stale-version'}];assert.throws(()=>ipqc.validateIPQCAssignments([next],[],values),/IPQC_SOURCE_CHANGED/);
 }finally{f.close();}
});
void test('C duplicates span category workspaces (legacy membership retained), A/B remains category scoped',async()=>{
 const f=await fixture();try{for(const s of ['AB','C']){await f.create(s);await f.promote(f.endpoint(s));}const ipqc=f.load('lib/process-ipqc.ts'),values=await f.values(),a=tuple((await choices(f,'C',['001'])).body.choices[0]);
 const w=structuredClone(f.workspaces[1]),other=structuredClone(w);other.id=JSON.stringify(['OTHER','C']);other.category='OTHER';other.stages.TIEN[0].id='legacy-other';other.stages.TIEN[0].ipqcAssignments=[a];const previous=structuredClone([w,other]);w.stages.TIEN[0].ipqcAssignments=[a];assert.throws(()=>ipqc.validateIPQCAssignments([w,other],previous,values),/IPQC_(ALREADY_ASSIGNED|TRANSFER_REQUIRES_SAVED_RELEASE)/);
 other.stages.TIEN[0].ipqcAssignments=[];assert.throws(()=>ipqc.validateIPQCAssignments([w,other],previous,values),/IPQC_TRANSFER_REQUIRES_SAVED_RELEASE/);
 const ab=tuple((await choices(f,'A')).body.choices[0]),first=structuredClone(f.workspaces[0]),second=structuredClone(first);first.stages['A-CUT'][0].ipqcAssignments=[ab];second.id=JSON.stringify(['OTHER','A']);second.category='OTHER';second.stages['A-CUT'][0].ipqcAssignments=[ab];ipqc.validateIPQCAssignments([first,second],[first,second],values);
 }finally{f.close();}
});
void test('legacy Apply cancellation without Save cannot release a saved owner for reassignment',async()=>{
 const f=await fixture();try{const x=await f.create('C');await f.promote(x.url);const a=tuple((await choices(f,'C',['001'])).body.choices[0]);await edit(f,'C','one',[a]);const w=JSON.stringify(['SYN','C']),path=id=>['workspaces',{id:w},'stages','TIEN',{id},'ipqcAssignments'];
 await f.command(processURL,'apply',{patches:[{op:'set',path:path('one'),value:[]}],guards:[{path:path('one'),value:[a]}]});
 await f.command(processURL,'apply',{moduleAction:'save-canvas-v1',source:'canvas-v2:'+JSON.stringify([w,'TIEN']),patches:[{op:'set',path:path('two'),value:[a]}],guards:[{path:path('two'),value:[]}]},'editor',409);
 await f.command(processURL,'save');await edit(f,'C','two',[a]);
 }finally{f.close();}
});
void test('C legacy cross-workspace owner: signed-route denial, concurrent saved release, then explicit transfer',async()=>{
 const f=await fixture('records-v1');try{const x=await f.create('C');await f.promote(x.url);const a=tuple((await choices(f,'C',['001'])).body.choices[0]);await edit(f,'C','one',[a]);
 // Generated legacy fixture only: product moved category while historical assignment was retained.
 const values=await f.values(),control=JSON.parse(values.processAuthoringControl),main=control.workflow.working.workspaces.find(w=>w.line==='C'),legacy=structuredClone(main);legacy.id=JSON.stringify(['OLD','C']);legacy.category='OLD';legacy.stages.TIEN[0].number='OLD-C-OWNER';main.stages.TIEN.forEach(o=>o.ipqcAssignments=[]);control.workflow.working.workspaces.push(legacy);control.workflow.saved.content=structuredClone(control.workflow.working);control.versions.find(v=>v.status==='draft').snapshot=structuredClone(control.workflow.working);values.processAuthoringControl=JSON.stringify(control);
 f.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(await f.load('lib/state-records.ts').encodeRecordValues(f.env.STATE_ARCHIVE,values));
 const before=f.db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision,flow=(await f.request(processURL)).body.control.workflow;
 const command=(workspace,id,from,to,actor)=>{const path=['workspaces',{id:workspace},'stages','TIEN',{id},'ipqcAssignments'];return{action:'apply',moduleAction:'save-canvas-v1',source:'canvas-v2:'+JSON.stringify([workspace,'TIEN']),generation:flow.generation,expectedRevision:flow.revision,operationId:randomUUID(),clientId:'cross-'+actor,sequence:1,patches:[{op:'set',path,value:to}],guards:[{path,value:from}]};};
 const allocate=command(main.id,'one',[],[a],'allocate'),release=command(legacy.id,'one',[a],[],'release');const denied=await f.request(processURL,'POST',{command:allocate});assert.equal(denied.status,409);assert.match(denied.body.error,/IPQC_TRANSFER_REQUIRES_SAVED_RELEASE/);assert.equal(f.db.prepare('SELECT revision FROM shared_state WHERE id=1').get().revision,before);
 const replies=await Promise.all([f.request(processURL,'POST',{command:{...allocate,operationId:randomUUID()}},'editor'),f.request(processURL,'POST',{command:release},'peer')]);assert.deepEqual(replies.map(r=>r.status),[409,200]);const stored=(await f.request(processURL)).body.control.workflow;assert.equal(stored.saved.content.workspaces.find(w=>w.id===legacy.id).stages.TIEN[0].ipqcAssignments.length,0);assert.equal(stored.working.workspaces.find(w=>w.id===main.id).stages.TIEN[0].ipqcAssignments.length,0);
 await edit(f,'C','one',[a]);assert.equal((await f.request(processURL)).body.control.workflow.saved.content.workspaces.find(w=>w.id===main.id).stages.TIEN[0].ipqcAssignments[0].itemId,a.itemId);
 }finally{f.close();}
});

void test('merged page-v1 C choices and new route-less product Save use approved catalog + LINES, never stale compatibility products',async()=>{
 const f=await fixture('records-v1');try{const ab=await f.create('AB');await f.promote(ab.url);const c=await f.create('C','002');await f.promote(c.url);const root=await f.generatedMasterPages(['002']);
 const q=await choices(f,'C',['002']);assert.equal(q.status,200);assert.equal(q.body.choices.length,1);assert.equal(q.body.choices[0].itemId,c.item.id);assert.equal((await choices(f,'C',['PHANTOM'])).body.reason,'NO_PRODUCTS');
 const a=tuple(q.body.choices[0]),w=JSON.stringify(['SYN','C']),base=['workspaces',{id:w},'stages','TIEN',{id:'one'}],links=[...base,'ipqcAssignments'],products=[...base,'productCodes'];
 await f.command(processURL,'apply',{moduleAction:'save-canvas-v1',source:'canvas-v2:'+JSON.stringify([w,'TIEN']),patches:[{op:'set',path:products,value:['002']},{op:'set',path:links,value:[a]}],guards:[{path:products,value:['001']},{path:links,value:[]}]});
 const saved=(await f.request(processURL)).body.control.workflow.saved.content.workspaces.find(w=>w.line==='C').stages.TIEN[0];assert.deepEqual(saved.productCodes,['002']);assert.deepEqual(saved.ipqcAssignments,[a]);
 for(const change of ['C.catalog','LINES','duplicate-id','catalog-pointer','lines-pointer','active-drift']){const bad=structuredClone(root);if(change==='duplicate-id')bad.versions.push(structuredClone(bad.versions.find(v=>v.scope==='C.catalog')));else if(change==='catalog-pointer'||change==='lines-pointer')bad.workflowScopes[change==='catalog-pointer'?'C.catalog':'LINES'].active.id='unknown-approved-owner';else if(change==='active-drift')bad.active['C.catalog'].products[0].name='drift';else bad.versions.find(v=>v.scope===change).status='pending';const values=await f.values();values.masterDataControl=JSON.stringify(bad);f.db.prepare('UPDATE shared_state SET revision=revision+1,"values"=? WHERE id=1').run(await f.load('lib/state-records.ts').encodeRecordValues(f.env.STATE_ARCHIVE,values));assert.equal((await choices(f,'C',['002'])).status,503,'unapproved/ambiguous companion cannot grant C choices');const ownAB=await choices(f,'A');assert.equal(ownAB.status,200);assert.equal(ownAB.body.choices[0].itemId,ab.item.id,'AB choices do not acquire unrelated product/page eligibility');}
 }finally{f.close();}
});

for(const storage of ['inline','records-v1'])for(const source of ['AB','C'])void test(`${storage} ${source}: new unrelated source approval retains old stable link; explicit replacement persists current pin`,async()=>{
 const f=await fixture(storage);try{
  const x=await f.create(source);await f.promote(x.url);const line=source==='C'?'C':'A',products=source==='C'?['001']:[],a=tuple((await choices(f,line,products)).body.choices[0]);await edit(f,line,'one',[a]);
  const extra=await f.create(source);await f.promote(extra.url);const current=tuple((await choices(f,line,products)).body.choices.find(c=>c.itemId===a.itemId));assert.equal(current.itemId,a.itemId);assert.notEqual(current.sourceVersionId,a.sourceVersionId);assert.deepEqual(current.productCodes,a.productCodes);
  const flow=(await f.request(processURL)).body.control.workflow,w=flow.working.workspaces.find(w=>w.line===line);assert.deepEqual(w.stages[x.error.stageCode][0].ipqcAssignments,[a]);
  const ipqc=f.load('lib/process-ipqc.ts');assert(ipqc.ipqcIssues([w],await f.values()).some(i=>i.message==='IPQC_REFERENCE_CHANGED:'+a.itemId));
  // An unrelated explicit Canvas Save must neither discard nor auto-upgrade the historical tuple.
  const name=['workspaces',{id:w.id},'stages',x.error.stageCode,{id:'one'},'name'];await f.command(processURL,'apply',{moduleAction:'save-canvas-v1',source:'canvas-v2:'+JSON.stringify([w.id,x.error.stageCode]),patches:[{op:'set',path:name,value:'Unrelated synthetic edit'}],guards:[{path:name,value:w.stages[x.error.stageCode][0].name}]});
  let read=(await f.request(processURL)).body.control.workflow;assert.deepEqual(read.saved.content.workspaces.find(w=>w.line===line).stages[x.error.stageCode][0].ipqcAssignments,[a]);
  await edit(f,line,'one',[current],[a]);read=(await f.request(processURL)).body.control.workflow;const saved=read.saved.content.workspaces.find(w=>w.line===line);assert.deepEqual(saved.stages[x.error.stageCode][0].ipqcAssignments,[current]);assert(!ipqc.ipqcIssues([saved],await f.values()).some(i=>i.message==='IPQC_REFERENCE_CHANGED:'+a.itemId));
 }finally{f.close();}
});

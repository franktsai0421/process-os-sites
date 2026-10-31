import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fixture:routeFixture,json}=require('../scripts/quality-replacement-preview-fixture.cjs');
const {connect}=require('../scripts/test-routine-equipment-isolated-workflow.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const insert=(collection,value)=>({op:'insert',path:[collection],value});
const settle=async()=>{for(let i=0;i<30;i++)await tick();};
async function fixture(){
 const h=await routeFixture();
 await h.begin('routine-equipment');
 await h.command('routine-equipment','apply',{patches:[insert('categories',{id:'category',name:'Synthetic category'}),insert('subcategories',{id:'subcategory',categoryId:'category',name:'Synthetic subcategory'}),insert('groups',{id:'group',categoryId:'category',subcategoryId:'subcategory',name:'Synthetic group'})]});
 await h.promote('routine-equipment');
 const f=await connect(h);assert(await f.test.writeShared('begin'));
 for(const [kind,id]of[['category','category'],['subcategory','subcategory'],['group','group']]){const button=f.host.querySelector(`[data-node-select="${kind}"][data-id="${id}"]`);assert(button);button.click();}
 const raw=f.c.fetch,commands=[],receiptReads=[];let reply=null,hold=null,posted,responses=0,inflight=0;
 f.c.fetch=async(url,options={})=>{
  inflight++;try{
  const body=typeof options.body==='string'?JSON.parse(options.body):null;
  if(String(url).includes('operationId=')){receiptReads.push(String(url));if(reply?.blockReceipt)return Response.json({error:'SYNTHETIC_RECEIPT_UNAVAILABLE'},{status:503});}
  const response=await raw(url,options);
  if(body?.command?.action!=='apply')return response;
  commands.push(json(body.command));posted?.();
  if(hold)await hold;
  const data=h.load('lib/workflow-wire.ts').expandWorkflowPayload(await response.json());
  if(reply)await reply(data,body.command);
  responses++;return Response.json(data,{status:response.status});
  }finally{inflight--;}
 };
 const field=(id,value)=>{const node=f.host.querySelector('#routine-add-'+id);assert(node,id);node.value=value;node.dispatchEvent({type:node.tagName==='SELECT'?'change':'input',target:node});};
 const open=()=>{const button=f.host.querySelector('#routine-add');assert(button&&!button.disabled);button.click();field('asset-code','SYN-UI-1');field('name','Actual UI new equipment');field('unit','支');field('enabled','true');field('confirmed','true');field('group-select','group');field('calibration-method','none');};
 const submit=async()=>{const before=responses,button=f.host.querySelector('#routine-add-submit');assert(button&&!button.disabled,'actual enabled Add button');button.click();for(let i=0;i<2000&&responses===before;i++)await new Promise(resolve=>setTimeout(resolve,2));assert.equal(responses,before+1,'actual route reply completed');await settle();for(let i=0;i<2000&&inflight;i++){await new Promise(resolve=>setTimeout(resolve,2));await settle();}assert.equal(inflight,0,'fallback/receipt reads completed');await settle();};
 return{h,f,commands,receiptReads,field,open,submit,setReply(fn){reply=fn;},pause(){let release;hold=new Promise(resolve=>release=resolve);const reached=new Promise(resolve=>posted=resolve);return{reached,release};},close:()=>h.close()};
}
const row=data=>data.control.workflow.working.equipment[0];
const projection=data=>data.control.workflow.working;
function expectRetained(x){assert.equal(x.commands.length,1);assert.equal(x.f.test.readUnavailable,true);assert.match(x.f.test.message,/尚未核對/);assert.equal(x.f.test.working.equipment.length,1);}

void test('actual bound Add + default client + real equipment adapter confirms canonical defaults and null provenance without extra reads',async()=>{
 const x=await fixture();try{
  const before=x.f.requests.length;x.open();await x.submit();
  assert.equal(x.commands.length,1);assert.equal(x.f.test.readUnavailable,false,x.f.test.message);
  const sent=x.commands[0].patches[0].value,actual=x.h.flow(await x.h.read('routine-equipment')).working.equipment[0];
  assert.equal(sent.sourceRow,null);assert.equal(sent.effectiveAt,null);assert.equal(Object.hasOwn(sent,'photoHidden'),false);
  assert.equal(Object.hasOwn(actual,'sourceRow'),false);assert.equal(actual.photoHidden,false);assert.equal(actual.id,sent.id);
  assert.equal(x.f.host.querySelector('#routine-add-submit'),null,'confirmed original drawer closes');
  assert.equal(x.f.requests.slice(before).filter(r=>r.method==='POST').length,1);
  assert.equal(x.f.requests.slice(before).filter(r=>r.method==='GET').length,0,'canonical ACK adds no confirmation GET');
 }finally{x.close();}
});

void test('actual category/subcategory/group handlers confirm allocated codes, canonical group fields and key-order differences',async()=>{
 const x=await fixture();try{
  // Reserve a code then remove only that unapproved empty category. The next UI
  // guess is stale; allocation remains the actual server's responsibility.
  await x.h.command('routine-equipment','apply',{patches:[insert('categories',{id:'reserved',name:'Reserve code'})]});
  const reserved=x.h.flow(await x.h.read('routine-equipment')).working.categories.find(r=>r.id==='reserved');
  await x.h.command('routine-equipment','apply',{patches:[{op:'remove',path:['categories',{id:'reserved'}]}],guards:[{path:['categories',{id:'reserved'}],value:reserved}]});
  await x.f.test.read();x.f.test.render();
  for(const kind of ['category','subcategory','group']){
   x.f.test.openNodeDialog(kind);
   const name=x.f.host.querySelector('#routine-dialog-name');assert(name);name.value='Actual '+kind;name.dispatchEvent({type:'input',target:name});
   if(kind==='group'){const spec=x.f.host.querySelector('#routine-dialog-spec');spec.value='Exact spec';spec.dispatchEvent({type:'input',target:spec});}
   await x.f.test.confirmNodeDialog();assert.equal(x.f.test.readUnavailable,false,x.f.test.message);
   assert.equal(x.f.host.querySelector('#routine-dialog-confirm'),null,'same unchanged dialog closes');
  }
  assert.equal(x.commands.length,3);
  const current=x.h.flow(await x.h.read('routine-equipment')).working;
  const category=current.categories.find(r=>r.name==='Actual category');assert.equal(category.code,'C03');assert.equal(x.commands[0].patches[0].value.code,'C02');
  const group=current.groups.find(r=>r.name==='Actual group');assert.equal(group.categoryCode,'C03');assert.equal(group.nameZh,'');assert.equal(group.sourceStatus,'');assert.equal(group.spec,'Exact spec');
  assert.equal(x.receiptReads.length,0);
 }finally{x.close();}
});

void test('real adapter mutableFields final copy preserves explicit whitespace/null, while reordered ACK keys still settle',async()=>{
 const x=await fixture();try{
  x.f.test.working.equipment.push({id:'raw',assetCode:'  syn-raw  ',groupId:'group',name:' untrimmed name ',owner:' untrimmed owner ',unit:'支',spec:null,enabled:true,confirmed:true,calibrationMethod:'none'});
  x.setReply(data=>{const r=row(data);data.control.workflow.working.equipment[0]=Object.fromEntries(Object.entries(r).reverse());});
  assert(await x.f.test.writeShared('apply'),x.f.test.message);
  const actual=x.h.flow(await x.h.read('routine-equipment')).working.equipment[0];
  assert.equal(actual.assetCode,'SYN-RAW');assert.equal(actual.name,' untrimmed name ');assert.equal(actual.owner,' untrimmed owner ');assert.equal(actual.spec,null);
  assert.equal(x.commands.length,1);assert.equal(x.receiptReads.length,0);
 }finally{x.close();}
});

for(const [name,mutate]of[
 ['exact raw sent row instead of canonical result',(data,command)=>{projection(data).equipment[0]=json(command.patches[0].value);}],
 ['noncanonical padded assigned mark',data=>{row(data).pieceMark='001';}],
 ['zero assigned mark',data=>{row(data).pieceMark='00';}],
 ['peer user name',data=>{row(data).name='Peer name';}],
 ['peer user unit',data=>{row(data).unit='台';}],
 ['peer user photo',data=>{row(data).photoId='a'.repeat(64);}],
 ['null user field',data=>{row(data).name=null;}],
 ['missing canonical default',data=>{delete row(data).photoHidden;}],
 ['wrong canonical default',data=>{row(data).photoHidden=true;}],
 ['arbitrary extra field',data=>{row(data).unrelated='not submitted';}],
 ['missing user field',data=>{delete row(data).notes;}],
 ['wrong row id',data=>{row(data).id='other-row';}],
 ['duplicate row id',data=>{projection(data).equipment.push(json(row(data)));}],
 ['wrong derived parent',data=>{row(data).categoryId='different-category';}],
 ['null assigned mark',data=>{row(data).pieceMark=null;}],
 ['no-op receipt',data=>{data.receipt.unchanged=true;}],
 ['stale receipt revision',data=>{data.receipt.revision=0;data.receipt.unchanged=true;}],
 ['ACK behind receipt',data=>{data.control.workflow.revision=data.receipt.revision-1;}],
])void test('insert ACK rejects '+name+' without losing RAM or creating a second POST',async()=>{
 const x=await fixture();try{x.open();x.setReply(mutate);await x.submit();expectRetained(x);const old=x.f.test.working;assert.equal(await x.f.test.writeShared('apply'),null);assert.equal(x.commands.length,1);assert.equal(x.f.test.working,old);}finally{x.close();}
});

for(const mismatch of ['operation','generation'])void test('default transport rejects wrong '+mismatch+' receipt and retains UNKNOWN for original receipt GET only',async()=>{
 const x=await fixture();try{
  const tamper=data=>{if(mismatch==='operation')data.receipt.operationId='wrong-operation';else data.receipt.generation='wrong-generation';};tamper.blockReceipt=true;x.setReply(tamper);x.open();await x.submit();
  assert.equal(x.commands.length,1);assert.equal(x.receiptReads.length,1);assert.match(x.f.test.message,/RESULT_UNKNOWN|尚未確認|結果未知/);
  const markers=[...x.f.storage.entries()];assert(markers.length);const old=x.f.test.working;
  await x.f.test.writeShared('apply');assert.equal(x.commands.length,1);assert.equal(x.receiptReads.length,2);assert.equal(x.f.test.working,old);assert.deepEqual([...x.f.storage.entries()],markers);
  assert(x.receiptReads.every(url=>url.includes(x.commands[0].operationId)),'never follows the mismatching response operation');
 }finally{x.close();}
});

for(const change of ['actor','epoch','delivery'])void test('late canonical insert ACK after '+change+' never adopts or closes the retained form',async()=>{
 const x=await fixture();try{
  const pause=x.pause();x.open();const action=x.submit();await pause.reached;const before=x.f.test.model,local=x.f.test.working;
  if(change==='actor')x.f.rotateActor();if(change==='epoch')x.f.rotateEpoch();if(change==='delivery')x.f.rotateDelivery();pause.release();await action;
  assert.equal(x.commands.length,1);assert.equal(x.f.test.model,before);assert.equal(x.f.test.working,local);assert(x.f.host.querySelector('#routine-add-submit'),'late owner cannot close original dialog');
 }finally{x.close();}
});

void test('input typed after canonical insertion remains on the same UUID and next explicit Apply updates instead of reinserting',async()=>{
 const x=await fixture();try{
  const pause=x.pause();x.open();const action=x.submit();await pause.reached;x.field('name','Second explicit name');pause.release();await action;
  assert.equal(x.f.test.readUnavailable,false,x.f.test.message);assert.equal(x.commands.length,1);assert(x.f.host.querySelector('#routine-add-submit'));
  assert.equal(x.f.host.querySelector('#routine-add-name').value,'Second explicit name');
  await x.submit();assert.equal(x.commands.length,2);assert.equal(x.f.test.readUnavailable,false,x.f.test.message);
  const next=x.commands[1];assert(next.patches.every(p=>p.op!=='insert'));assert(next.guards.some(g=>g.path.at(-1)==='name'&&g.value==='Actual UI new equipment'));
  const rows=x.h.flow(await x.h.read('routine-equipment')).working.equipment;assert.equal(rows.length,1);assert.equal(rows[0].id,x.commands[0].patches[0].value.id);assert.equal(rows[0].name,'Second explicit name');
 }finally{x.close();}
});

for(const kind of ['category','subcategory','group'])void test('actual new '+kind+' refuses peer-modified user name, not just equipment inserts',async()=>{
 const x=await fixture();try{
  x.f.test.openNodeDialog(kind);const input=x.f.host.querySelector('#routine-dialog-name');input.value='User '+kind;input.dispatchEvent({type:'input',target:input});
  x.setReply((data,command)=>{const patch=command.patches.find(p=>p.op==='insert');projection(data)[patch.path[0]].find(r=>r.id===patch.value.id).name='Peer '+kind;});
  await x.f.test.confirmNodeDialog();assert.equal(x.f.test.readUnavailable,true);assert.equal(x.commands.length,1);assert(x.f.host.querySelector('#routine-dialog-confirm'));assert.equal(x.f.host.querySelector('#routine-dialog-name').value,'User '+kind);
 }finally{x.close();}
});

void test('receipt-only insertion ACK uses its original receipt and one existing fallback read without replay',async()=>{
 const x=await fixture();try{
  const before=x.f.requests.length;x.setReply(data=>{delete data.control;});x.open();await x.submit();
  assert.equal(x.commands.length,1);assert.equal(x.f.test.readUnavailable,false,x.f.test.message);assert.equal(x.f.test.working.equipment.length,1);
  assert.equal(x.f.requests.slice(before).filter(r=>r.method==='GET').length,1);assert.equal(x.receiptReads.length,0);
 }finally{x.close();}
});

void test('next input after a real inserted row keeps sent guard and conflicts with peer change rather than rebasing',async()=>{
 const x=await fixture();try{
  const pause=x.pause();x.open();const action=x.submit();await pause.reached;x.field('name','My next name');
  const id=x.commands[0].patches[0].value.id,path=['equipment',{id},'name'];
  await x.h.command('routine-equipment','apply',{patches:[{op:'set',path,value:'Peer name'}],guards:[{path,value:'Actual UI new equipment'}]});
  pause.release();await action;assert.equal(x.f.test.readUnavailable,false);assert.equal(x.commands.length,1);
  await x.submit();assert.equal(x.commands.length,2);assert.equal(x.commands[1].guards.find(g=>g.path.at(-1)==='name').value,'Actual UI new equipment');
  assert.equal(x.f.test.working.equipment.find(r=>r.id===id).name,'My next name');assert.equal(x.h.flow(await x.h.read('routine-equipment')).working.equipment.find(r=>r.id===id).name,'Peer name');
  assert.equal(x.f.requests.filter(r=>r.action==='apply').at(-1).status,409);
 }finally{x.close();}
});

for(const code of ['C00','C001'])void test('new category rejects impossible server allocation '+code,async()=>{
 const x=await fixture();try{
  x.f.test.openNodeDialog('category');const input=x.f.host.querySelector('#routine-dialog-name');input.value='User category';input.dispatchEvent({type:'input',target:input});
  x.setReply((data,command)=>{const sent=command.patches.find(p=>p.op==='insert').value;projection(data).categories.find(r=>r.id===sent.id).code=code;});
  await x.f.test.confirmNodeDialog();assert.equal(x.f.test.readUnavailable,true);assert.equal(x.commands.length,1);assert(x.f.host.querySelector('#routine-dialog-confirm'));
 }finally{x.close();}
});

for(const collection of ['categories','subcategories','groups'])for(const shape of ['object','null','missing','null entry','primitive entry'])void test('malformed insert parent '+collection+' '+shape+' latches confirmation before another explicit Apply',async()=>{
 const x=await fixture();try{
  x.open();x.setReply(data=>{const snapshot=projection(data);if(shape==='object')snapshot[collection]={};if(shape==='null')snapshot[collection]=null;if(shape==='missing')delete snapshot[collection];if(shape==='null entry')snapshot[collection].push(null);if(shape==='primitive entry')snapshot[collection].push('not a row');});
  await x.submit();expectRetained(x);const local=x.f.test.working;assert.equal(await x.f.test.writeShared('apply'),null);assert.equal(x.commands.length,1);assert.equal(x.f.test.working,local);
 }finally{x.close();}
});

for(const shape of ['object','null row'])void test('mixed existing set before insert rejects malformed target '+shape+' with zero repeated POST',async()=>{
 const x=await fixture();try{
  await x.h.command('routine-equipment','apply',{patches:[insert('equipment',{id:'existing',assetCode:'SYN-EXISTING',groupId:'group',name:'Existing tool',unit:'支',enabled:true,confirmed:true,calibrationMethod:'none'})]});
  await x.f.test.read();x.f.test.render();x.f.test.working.equipment.find(r=>r.id==='existing').name='Edited existing';
  x.open();x.setReply(data=>{if(shape==='object')projection(data).equipment={};else projection(data).equipment.unshift(null);});await x.submit();
  assert.equal(x.commands.length,1);assert.equal(x.commands[0].patches[0].op,'set');assert(x.commands[0].patches.some(p=>p.op==='insert'));
  assert.equal(x.f.test.readUnavailable,true);assert.match(x.f.test.message,/尚未核對/);const local=x.f.test.working;assert.equal(local.equipment.length,2);
  assert.equal(await x.f.test.writeShared('apply'),null);assert.equal(x.commands.length,1);assert.equal(x.f.test.working,local);
 }finally{x.close();}
});

for(const [collection,field,derived]of[['categories','code','categoryCode'],['categories','name','category'],['subcategories','name','subcategory']])for(const invalid of [null,7,'   '])void test('same-graph canonical parent '+collection+'.'+field+' '+JSON.stringify(invalid)+' cannot bless malformed derived fields',async()=>{
 const x=await fixture();try{
  x.open();x.setReply(data=>{const snapshot=projection(data);snapshot[collection][0][field]=invalid;snapshot.groups[0][derived]=invalid;snapshot.equipment[0][derived]=invalid;});
  await x.submit();expectRetained(x);await x.f.test.writeShared('apply');assert.equal(x.commands.length,1);
 }finally{x.close();}
});

for(const missing of ['equipment object','issues missing'])void test('category-only ACK rejects whole-model '+missing+' before adoption or another POST',async()=>{
 const x=await fixture();try{
  x.f.test.openNodeDialog('category');const input=x.f.host.querySelector('#routine-dialog-name');input.value='New category';input.dispatchEvent({type:'input',target:input});
  x.setReply(data=>{if(missing==='equipment object')projection(data).equipment={};else delete projection(data).issues;});
  const before=x.f.test.model,local=x.f.test.working;await x.f.test.confirmNodeDialog();assert.equal(x.f.test.readUnavailable,true);assert.equal(x.commands.length,1);assert.equal(x.f.test.model,before);assert.equal(x.f.test.working,local);
  assert.equal(await x.f.test.writeShared('apply'),null);assert.equal(x.commands.length,1);
 }finally{x.close();}
});

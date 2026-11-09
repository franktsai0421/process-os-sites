// Full BOM closure, recovery helpers and primary transport routed through the
// real handler/kernel; all accounts, SQLite, R2, DOM and requests are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fixture,posts,clone,domain as D} from './bom-navigation-actual-fixture.mjs';
const require=createRequire(import.meta.url),serverFixture=require('./bom-atomic-fixture.cjs');
async function setup(t){
 const server=await serverFixture(),f=await fixture({initialize:false});t.after(()=>{server.close();return f.close();});f.actor('editor');let lost=false,blockedReceipt=false;
 f.box.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null,method=options.method||'GET';f.calls.push({url,method,body});
  if(blockedReceipt&&url.includes('operationId='))return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});
  const response=await server.api[method](new Request(new URL(url,'https://synthetic.invalid'),{...options,headers:{origin:'https://synthetic.invalid',cookie:server.cookies.editor,...options.headers}}));
  if(lost&&body?.command?.action==='save'&&response.ok){lost=false;blockedReceipt=true;throw Error('SYNTHETIC_LOST_ACK');}return response;
 };
 await f.api.read();await f.session()?.ready;f.calls.length=0;
 return {f,server,loseAck(){lost=true;},receiptsAvailable(){blockedReceipt=false;},async peer(field,value,index=0){const before=(await server.read()).workflow.working.bom.ROOT[index][field],result=await server.call({command:server.command([server.manual(field,value,before,index)])},'other');assert.equal(result.status,200,JSON.stringify(result));},async import(){const sheets=[{name:'ERP',rows:D.exportRows(f.api.editor())}];sheets[0].rows[1][4]='My root name';sheets[0].rows.push(['ROOT','1','30','NEW','New component','New specification','ea','1','1','0']);const batch={...D.compare(f.api.editor(),D.parseMatrices(sheets,{file:'source.xlsx'})),sheets,file:'source.xlsx'};batch.changes.forEach(change=>change.decision='accept');f.api.setBatch(batch);await f.api.finishImport();}};
}
async function dialog(f){for(let i=0;i<300;i++){const node=f.document.querySelector('dialog.bw-save-conflicts');if(node)return node;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Expected structural chooser');}
for(const choice of ['mine','theirs'])void test('actual finishImport → '+choice+' chooser → handler uses one normalized reviewed payload',async t=>{
 const x=await setup(t),{f,server}=x;await x.import();
 assert(f.api.state().pending[0].input.decisions.some(d=>Object.hasOwn(d,'value')&&d.value===undefined),'fixture exercises actual undefined own key');
 await x.peer('itemName','Their root name');await x.peer('unit','Their disjoint unit',1);
 const pending=f.save(),node=await dialog(f);node.querySelector('[data-bw-conflict="'+choice+'"]').click();await pending;
 const flow=(await server.read()).workflow;assert.equal(flow.saved.content.bom.ROOT[0].itemName,choice==='mine'?'My root name':'Their root name');assert.equal(flow.saved.content.bom.ROOT[1].unit,'Their disjoint unit');assert(flow.saved.content.bom.ROOT.some(row=>row.itemCode==='NEW'));
 assert.equal(posts(f).length,1);const command=posts(f)[0].body.command;assert.equal(command.input.reconciliation.decision.choice,choice);assert.equal(flow.receipts[command.operationId].result.savedId,flow.saved.id);assert.equal(f.api.state().pending.length,0);assert.equal(f.api.flight(),null);
});
for(const late of [false,true])void test('actual lost Save ACK then peer Save settles original receipt'+(late?' and retains later typing':''),async t=>{
 const x=await setup(t),{f,server}=x;f.start();f.edit('itemName','Sent original');x.loseAck();await assert.rejects(f.save(),/UNKNOWN|LOST_ACK/);
 const flight=f.api.flight(),operation=flight.command.operationId,key=f.session().key,originalSaved=(await server.read()).workflow.saved.id;
 if(late)f.edit('itemName','Typed after lost ACK');await x.peer('specification','Peer saved spec');
 assert.notEqual((await server.read()).workflow.saved.id,originalSaved);x.receiptsAvailable();await f.api.settleRecord(key);
 assert.equal(posts(f).length,1);assert.equal(f.api.flight(),null);assert.equal(f.api.state().pending.length,0);assert.equal(f.api.transport().hasUnknown(),false);assert.equal(f.data.has(key),false);
 const after=(await server.read()).workflow;assert.equal(after.receipts[operation].result.savedId,originalSaved);assert.equal(after.saved.content.bom.ROOT[0].itemName,'Sent original');assert.equal(after.saved.content.bom.ROOT[0].specification,'Peer saved spec');
 if(late){assert.equal(f.api.editor().ROOT[0].itemName,'Typed after lost ACK');await f.save();assert.equal(posts(f).length,2);const saved=(await server.read()).workflow.saved.content.bom.ROOT[0];assert.equal(saved.itemName,'Typed after lost ACK');assert.equal(saved.specification,'Peer saved spec');}
 else assert.equal(f.api.editor().ROOT[0].specification,'Peer saved spec');
});
void test('actual all-theirs lost ACK, peer Save and late input preserve original comparison rather than silently choosing mine',async t=>{
 const x=await setup(t),{f,server}=x;f.start();f.edit('itemName','My first');f.finish();await x.peer('itemName','Their selected');x.loseAck();const first=f.save(),node=await dialog(f);node.querySelector('[data-bw-conflict="theirs"]').click();await assert.rejects(first,/UNKNOWN|LOST_ACK/);
 f.edit('itemName','My late input');await x.peer('unit','Peer newer unit',1);x.receiptsAvailable();await f.api.settleRecord(f.session().key);assert.equal(posts(f).length,1);assert.equal(f.api.editor().ROOT[0].itemName,'My late input');
 const before=clone((await server.read()).workflow),second=f.save(),again=await dialog(f);assert.equal(posts(f).length,1);again.querySelector('[data-bw-conflict="cancel"]').click();assert.equal(await second,false);assert.deepEqual((await server.read()).workflow,before);assert.equal(f.api.editor().ROOT[0].itemName,'My late input');
});

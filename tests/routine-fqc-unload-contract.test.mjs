// Modern beforeunload capability contract only; synthetic cancellation is not
// proof of a native prompt, user activation, browser floor or mobile delivery.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const file='public/process/routine-fqc.js',current=fs.readFileSync(file,'utf8'),previous=execFileSync('git',['show','51bda3eda99c98ab30d3c46b6615065588be564c'],{encoding:'utf8'});
assert.equal(createHash('sha256').update(previous).digest('hex'),'ed342c34242df88c2b6edb71d2f2025b284a4fe41026ffbd92d0fb614f03c3f7');
const lf=text=>text.replace(/\r\n/g,'\n');
// Among the pinned functions, only Save changed in checkpoint1ab4ccf: ownership,
// cloned batch, current revision and verified saved readback before retirement.
// Pin its COMPLETE normalized function, not a permissive substring projection.
const reviewedSaveSHA='2b085f67fcfe5d5fa250624abba7ed5bc1dc3bcfb65b66ecc815119fa60ba29b';
function assertPreservedContract(source){
 const actual=functions(lf(source)),baseline=functions(lf(previous));
 for(const key of ['dirty','docs','leave'])assert.equal(actual[key],baseline[key],key+' retains its existing behavior');
 assert.equal(createHash('sha256').update(actual.save).digest('hex'),reviewedSaveSHA,'complete reviewed per-document Save contract is preserved');
 assert.equal(actual.unload,baseline.unload.replace("      e.returnValue = '';\n",''),'only the legacy returnValue assignment is removed from beforeunload');
}
void test('dirty/docs/SPA/unload remain exact; manual Save matches reviewed per-document contract',()=>{assertPreservedContract(current);});
void test('LF and CRLF contracts agree; removing any retained guard or Save revision still fails',()=>{
 for(const text of [current,lf(current).replace(/\n/g,'\r\n')])assertPreservedContract(text);
 const text=lf(current),code=functions(text);
 for(const [key,changed]of [
  ['unload',code.unload.replace('e.preventDefault();','')],
  ['save',code.save.replace("{ expectedRevision: latest.flow.revision }",'{}')],
  ['save',code.save.replace('clone(buffer(d))','buffer(d)')],
  ['save',code.save.replace('const d = target;','const d = doc();')],
  ['save',code.save.replace('!window.ProcessSync?.requiresReload&&','')],
  ['save',code.save.replace('JSON.stringify(saved.saved.content)!==JSON.stringify(saved.working)','false')],
  ['save',code.save.replace('if(JSON.stringify(s.buffers.get(d.id))===JSON.stringify(c))','if(true)')],
  ['dirty',code.dirty.replace('s.buffers.has(d.id)','false')],
  ['docs',code.docs.replace('documents','otherDocuments')],
  ['leave',code.leave.replace('!s.retry&&','')],
 ]){const target=key==='docs'?code[key].slice(6,-1):code[key],replacement=key==='docs'?changed.slice(6,-1):changed;assert.notEqual(replacement,target,key+' negative fixture changed');assert.ok(text.includes(target),key+' mutation locates actual source');assert.throws(()=>assertPreservedContract(text.replace(target,replacement)),key+' protection is required');}
});
function functions(source){const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);const out={};function visit(n){if(ts.isFunctionDeclaration(n)&&['dirty','save','draft','buffer'].includes(n.name?.text))out[n.name.text]=n.getText(tree);if(ts.isVariableDeclaration(n)&&['docs','doc','status'].includes(n.name.getText(tree))&&ts.isArrowFunction(n.initializer))out[n.name.getText(tree)]='const '+n.getText(tree)+';';if(ts.isPropertyAssignment(n)&&n.name.getText(tree)==='canLeave')out.leave=n.initializer.getText(tree);if(ts.isCallExpression(n)&&n.expression.getText(tree)==='window.addEventListener'&&n.arguments[0]?.text==='beforeunload')out.unload=n.getText(tree);ts.forEachChild(n,visit);}visit(tree);for(const key of ['dirty','docs','leave','save','unload'])assert.ok(out[key],key);return out;}
function fixture(source){const code=functions(source),s={buffers:new Map(),bases:new Map(),busy:false,retry:false,dialogOpen:false},data={control:{documents:[{id:'a'},{id:'b'}]}},listeners=[];const c={s,data,inFlightMutation:false,window:{addEventListener:(name,fn)=>listeners.push({name,fn})}};vm.createContext(c);vm.runInContext(code.dirty+'\n'+code.docs+'\n'+code.unload+';this.canLeave='+code.leave,c);assert.equal(listeners.length,1);assert.equal(listeners[0].name,'beforeunload');return{s,c,handler:listeners[0].fn};}
for(const mode of ['no-buffer','equal-buffer','dirty-first','dirty-second','reverted'])void test('actual dirty and beforeunload handler '+mode,()=>{
 const result=[];for(const source of [previous,current]){const f=fixture(source);if(mode!=='no-buffer'){f.s.bases.set('a',{notes:'saved'});f.s.buffers.set('a',{notes:mode==='dirty-first'?'new':'saved'});}if(mode==='dirty-second'){f.s.bases.set('b',{notes:'saved'});f.s.buffers.set('b',{notes:'new'});}if(mode==='reverted'){f.s.buffers.get('a').notes='new';f.s.buffers.get('a').notes='saved';}
 const event=new Event('beforeunload',{cancelable:true});let writes=0;Object.defineProperty(event,'returnValue',{get:()=>true,set:()=>writes++});const snapshot=JSON.stringify([...f.s.buffers]);const value=f.handler(event);assert.equal(value,undefined);assert.equal(JSON.stringify([...f.s.buffers]),snapshot);const dirty=mode.startsWith('dirty');assert.equal(event.defaultPrevented,dirty);assert.equal(f.c.canLeave(),!dirty);assert.equal(writes,source===previous&&dirty?1:0);result.push({cancelled:event.defaultPrevented,leave:f.c.canLeave()});}assert.deepEqual(result[1],result[0]);
});
void test('remaining SPA busy/retry/dialog/inflight guards are independently retained',()=>{const f=fixture(current);for(const key of ['busy','retry','dialogOpen']){f.s[key]=true;assert.equal(f.c.canLeave(),false);f.s[key]=false;}f.c.inFlightMutation=true;assert.equal(f.c.canLeave(),false);f.c.inFlightMutation=false;assert.equal(f.c.canLeave(),true);});
void test('modern handler never touches legacy returnValue even when accessor would throw',()=>{const f=fixture(current);f.s.bases.set('a',{});f.s.buffers.set('a',{notes:'dirty'});const event=new Event('beforeunload',{cancelable:true});Object.defineProperty(event,'returnValue',{get(){throw Error('LEGACY_READ');},set(){throw Error('LEGACY_WRITE');}});assert.doesNotThrow(()=>f.handler(event));assert.equal(event.defaultPrevented,true);});


// Execute actual extracted Save/draft/buffer/dirty/status. Only the acknowledged
// server store and read boundaries are synthetic; this is not network acceptance.
const copy=value=>JSON.parse(JSON.stringify(value));
function saveFixture({changeAt,change,failAt,mismatchedReadback=false}={}){
 const content=id=>({title:id,date:'2026-10-30',notes:id+'-saved',reason:'',disposition:'',evidence:[],lines:[{id:id+'-line',results:[]}]});
 const server={identity:{id:'A'},permissions:{save:true,edit:true},control:{revision:10,documents:['a','b'].map((id,index)=>({id,kind:'plan',flow:{generation:id+'-generation',revision:index?17:3,working:content(id),saved:{id:id+'-saved',content:content(id)},active:{id:null},pendingId:null}}))}};
 const s={selected:'b',buffers:new Map(),bases:new Map(),client:'unload-fixture',seq:0};
 for(const d of server.control.documents){s.bases.set(d.id,copy(d.flow.working));s.buffers.set(d.id,{...copy(d.flow.working),notes:d.id+'-local'});}
 let epoch=1,delivery=1,reads=0,operation=0;
 const calls=[],sync={identity:{id:'A'},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:token=>token===delivery};
 const c={s,data:copy(server),root:{},window:{ProcessSync:sync},clone:copy,id:()=>`operation-${++operation}`};
 const mutate=()=>{
  if(change==='page')c.root={};else if(change==='actor')sync.identity={id:'B'};else if(change==='data-actor')c.data.identity.id='B';
  else if(change==='epoch')epoch++;else if(change==='delivery')delivery++;else if(change==='reload')sync.requiresReload=true;
  else if(change==='generation')c.data.control.documents.find(d=>d.id==='a').flow.generation='new-generation';
  else if(change==='new-input')s.buffers.get('a').notes='new input during Save';
 };
 async function boundary(name){if(changeAt===name)mutate();if(failAt===name)throw Error('RESULT_UNKNOWN');}
 c.post=async body=>{
  calls.push(copy(body));assert.equal(body.action,'draft');const d=server.control.documents.find(row=>row.id===body.documentId),cmd=body.command;assert(d);assert.equal(cmd.generation,d.flow.generation);
  if(cmd.action==='apply')for(const p of cmd.patches){const get=path=>path.length===1?d.flow.working[path[0]]:d.flow.working.lines.find(row=>row.id===path[1].id).results;
   const guard=cmd.guards.find(g=>JSON.stringify(g.path)===JSON.stringify(p.path));assert(guard);assert.deepEqual(copy(guard.value),copy(get(p.path)),'real original-value guard');
   if(p.path.length===1)d.flow.working[p.path[0]]=copy(p.value);else d.flow.working.lines.find(row=>row.id===p.path[1].id).results=copy(p.value);
  }else{assert.equal(cmd.action,'save');assert.equal(cmd.expectedRevision,d.flow.revision,'Save targets current document revision');d.flow.saved={id:'confirmed-'+d.id,content:copy(d.flow.working)};}
  d.flow.revision++;server.control.revision++;await boundary(cmd.action);return{documentId:d.id,operationId:body.operationId};
 };
 c.read=async()=>{reads++;await boundary('read'+reads);const next=copy(server);if(mismatchedReadback&&reads===2)next.control.documents.find(d=>d.id==='a').flow.saved.content.notes='different saved content';return next;};
 const code=functions(lf(current));vm.createContext(c);vm.runInContext([code.docs,code.doc,code.status,code.dirty,code.buffer,code.draft,code.save].join('\n'),c);
 return{c,s,calls,server,target:()=>c.data.control.documents.find(d=>d.id==='a'),get reads(){return reads;}};
}
void test('actual Save targets explicit document with original guards/latest revision, not selected other document',async()=>{
 const f=saveFixture(),other=copy(f.server.control.documents[1]),otherBuffer=copy(f.s.buffers.get('b'));
 f.s.buffers.get('a').lines[0].results=[{id:'result-a',outcome:'pass'}];
 const result=await f.c.save(f.target());assert.equal(result.documentId,'a');
 assert.deepEqual(f.calls.map(call=>[call.documentId,call.command.action]),[['a','apply'],['a','save']]);assert.equal(f.calls[1].command.expectedRevision,4);
 assert.deepEqual(f.calls[0].command.patches.map(p=>p.path),[['notes'],['lines',{id:'a-line'},'results']]);assert.equal(f.reads,2);
 assert.equal(f.s.buffers.has('a'),false);assert.equal(f.s.bases.has('a'),false);assert.deepEqual(f.s.buffers.get('b'),otherBuffer);assert.deepEqual(f.server.control.documents[1],other);
});
void test('actual Save keeps edits made after its cloned batch and leaves them dirty',async()=>{
 const f=saveFixture({changeAt:'apply',change:'new-input'});await f.c.save(f.target());
 assert.equal(f.server.control.documents[0].flow.saved.content.notes,'a-local');assert.equal(f.s.buffers.get('a').notes,'new input during Save');assert.equal(f.s.bases.get('a').notes,'a-local');assert.equal(f.c.dirty(f.target()),true);
});
for(const changeAt of ['apply','read1','save','read2'])for(const change of ['page','actor','data-actor','epoch','delivery','reload','generation'])void test(`actual Save ${changeAt} ${change} refuses late retirement or further writes`,async()=>{
 const f=saveFixture({changeAt,change}),inputs=copy([...f.s.buffers]);await assert.rejects(f.c.save(f.target()),/DELIVERY_SUPERSEDED/);
 assert.deepEqual(copy([...f.s.buffers]),inputs);assert.deepEqual(f.calls.map(call=>call.command.action),changeAt==='apply'||changeAt==='read1'?['apply']:['apply','save']);
 assert.equal(f.reads,{apply:0,read1:1,save:1,read2:2}[changeAt]);
});
for(const failAt of ['apply','read1','save','read2'])void test('actual Save unknown '+failAt+' retains input without retry',async()=>{
 const f=saveFixture({failAt}),inputs=copy([...f.s.buffers]);await assert.rejects(f.c.save(f.target()),/RESULT_UNKNOWN/);assert.deepEqual(copy([...f.s.buffers]),inputs);
 assert.deepEqual(f.calls.map(call=>call.command.action),failAt==='apply'||failAt==='read1'?['apply']:['apply','save']);
});
for(const denied of ['missing-target','pending','save-permission','edit-permission'])void test('actual Save '+denied+' rejects before any write',async()=>{
 const f=saveFixture(),inputs=copy([...f.s.buffers]);if(denied==='pending')f.target().flow.pendingId='pending';if(denied==='save-permission')f.c.data.permissions.save=false;if(denied==='edit-permission')f.c.data.permissions.edit=false;
 await assert.rejects(f.c.save(denied==='missing-target'?null:f.target()),/FORBIDDEN/);assert.equal(f.calls.length,0);assert.equal(f.reads,0);assert.deepEqual(copy([...f.s.buffers]),inputs);
});
void test('actual Save permits save-only for clean local input and rejects mismatched saved readback',async()=>{
 const clean=saveFixture();clean.s.buffers.set('a',copy(clean.s.bases.get('a')));clean.c.data.permissions.edit=false;await clean.c.save(clean.target());assert.deepEqual(clean.calls.map(call=>call.command.action),['save']);
 const f=saveFixture({mismatchedReadback:true}),inputs=copy([...f.s.buffers]);await assert.rejects(f.c.save(f.target()),/SAVE_RECHECK_REQUIRED/);assert.deepEqual(copy([...f.s.buffers]),inputs);assert.equal(f.calls.length,2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('public/process/routine-fqc.js','utf8');
const part=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const code=part('  async function save(target = doc()) {','  function dialog(');
const copy=structuredClone;
function fixture(){
 const make=id=>({id,flow:{generation:'gen-'+id,revision:1,pendingId:null,working:{title:'old',date:'2026-10-30',notes:'',reason:'',disposition:'',evidence:[],lines:[]},saved:null}});
 const first=make('a'),second=make('b');
 const s={selected:'a',buffers:new Map(),bases:new Map()},data={identity:{id:'owner'},permissions:{save:true,edit:true},control:{revision:1,documents:[first,second]}};
 let epoch=1,delivery=1,onApply=()=>{},onSave=()=>{},onRead=()=>{};const calls=[];
 const sync={identity:{id:'owner'},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery};
 const box={s,data,window:{ProcessSync:sync},root:{},clone:copy,JSON,
  doc:()=>box.data.control.documents.find(d=>d.id===s.selected),docs:()=>box.data.control.documents,status:d=>d.flow.pendingId?'pending':'draft',
  dirty:d=>s.buffers.has(d.id)&&JSON.stringify(s.buffers.get(d.id))!==JSON.stringify(s.bases.get(d.id)),
  buffer:d=>{if(!s.buffers.has(d.id)){s.buffers.set(d.id,copy(d.flow.working));s.bases.set(d.id,copy(d.flow.working));}return s.buffers.get(d.id);},
  async draft(action,details,target){calls.push({action,details:copy(details),id:target.id});const d=box.data.control.documents.find(row=>row.id===target.id);if(action==='apply'){await Promise.resolve(onApply());for(const patch of details.patches)d.flow.working[patch.path[0]]=copy(patch.value);d.flow.revision++;}else{await Promise.resolve(onSave());assert.equal(details.expectedRevision,d.flow.revision);d.flow.saved={id:'saved-'+d.id,content:copy(d.flow.working)};d.flow.revision++;}box.data.control.revision++;return{receipt:{operationId:'original-'+action}};},
  async read(){await Promise.resolve(onRead());return copy(box.data);},
 };
 vm.createContext(box);vm.runInContext(code,box);
 const change=(d=first,value='mine')=>{box.buffer(d).title=value;};
 return {box,s,calls,first,second,change,save:d=>box.save(d),onApply:fn=>onApply=fn,onSave:fn=>onSave=fn,onRead:fn=>onRead=fn,epoch:()=>epoch++,delivery:()=>delivery++,sync};
}
test('routine actual Save applies own buffer then confirms saved document before clearing it',async()=>{const f=fixture();f.change();await f.save();assert.deepEqual(f.calls.map(x=>x.action),['apply','save']);assert.equal(f.box.data.control.documents[0].flow.saved.content.title,'mine');assert.equal(f.s.buffers.has('a'),false);assert.equal(f.calls[0].details.guards[0].value,'old');});
test('routine Save pins original document even if selection changes while Apply awaits',async()=>{const f=fixture();f.change();f.onApply(()=>{f.s.selected='b';});await f.save(f.first);assert.deepEqual(f.calls.map(x=>x.id),['a','a']);assert.equal(f.box.data.control.documents[1].flow.saved,null);});
test('routine newer local input remains after the captured batch is saved',async()=>{const f=fixture();f.change();f.onApply(()=>{f.s.buffers.get('a').title='newer local';});await f.save();assert.equal(f.s.buffers.get('a').title,'newer local');assert.equal(f.box.data.control.documents[0].flow.saved.content.title,'mine');assert.equal(f.box.dirty(f.box.data.control.documents[0]),true);});
for(const change of ['identity','epoch','delivery','generation'])test('routine late '+change+' after Apply cannot continue Save or erase local input',async()=>{const f=fixture();f.change();f.onApply(()=>{if(change==='identity')f.sync.identity={id:'other'};if(change==='epoch')f.epoch();if(change==='delivery')f.delivery();if(change==='generation')f.first.flow.generation='replaced';});await assert.rejects(f.save(),/DELIVERY_SUPERSEDED/);assert.deepEqual(f.calls.map(x=>x.action),['apply']);assert.equal(f.s.buffers.get('a').title,'mine');});
test('routine unknown Apply retains exact input and does not issue Save',async()=>{const f=fixture();f.change();f.onApply(()=>{throw Error('RESULT_UNKNOWN');});await assert.rejects(f.save(),/RESULT_UNKNOWN/);assert.equal(f.calls.length,1);assert.equal(f.s.buffers.get('a').title,'mine');});
test('routine late unsaved remote change after Save acknowledgement keeps input and blocks leave',async()=>{const f=fixture();f.change();f.onRead(()=>{const d=f.box.data.control.documents[0];if(d.flow.saved)d.flow.working.notes='new remote change';});await assert.rejects(f.save(),/SAVE_RECHECK_REQUIRED/);assert.equal(f.s.buffers.get('a').title,'mine');});
test('routine independent Save-only permission can save shared data, but cannot publish a local edit',async()=>{const f=fixture();f.box.data.permissions.edit=false;await f.save();assert.deepEqual(f.calls.map(x=>x.action),['save']);const g=fixture();g.change();g.box.data.permissions.edit=false;await assert.rejects(g.save(),/FORBIDDEN/);assert.equal(g.calls.length,0);});

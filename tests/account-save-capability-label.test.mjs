// Actual account matrix/sync functions with synthetic data; no browser or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import * as P from '../public/process/access-policy.mjs';
const source=fs.readFileSync('public/process/user-access.js','utf8');
const includesSave=['ab','c','templates','bom','fqc','iqc','ipqc-ab','ipqc-c','tooling','equipment'];
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function renderer(language='zh'){
 const context={P,h:escape,t:(zh,vi)=>language==='zh'?zh:vi,normalized:v=>String(v??'').toLowerCase(),fields:()=>({}),button:()=>'',setIndeterminate:()=>{}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf(' const primaryOps='),source.indexOf(' function reviewChanges('))+source.slice(source.indexOf(' function syncCells('),source.indexOf(' function setIndeterminate(')),context);
 return context;
}
function draft(){return {role:'synthetic',cells:Object.fromEntries(P.accessKeys.map(k=>[k,false])),roleCells:{},editable:Object.fromEntries(P.accessKeys.map(k=>[k,true])),accessOverrides:{'bom.save':false}};}
function note(html,key){return html.match(new RegExp('<small data-ua-save-included="'+key+'"[^>]*>([^<]*)</small>'))?.[1];}
void test('matrix explains backend edit-implies-save in both languages without modifying raw grants',()=>{
 for(const language of ['zh','vi'])for(const individual of [false,true])for(const view of [false,true])for(const edit of [false,true])for(const save of [false,true]){
  const d=draft();for(const id of includesSave){d.cells[id+'.view']=view;d.cells[id+'.edit']=edit;d.cells[id+'.save']=save;}
  const before=JSON.stringify(d),html=renderer(language).matrix(d,individual);
  for(const id of includesSave){const expected=view&&edit?(language==='zh'?'修改權已包含':'Đã gồm trong quyền Sửa'):'';assert.equal(note(html,id+'.save'),expected,id);}
  assert.equal(JSON.stringify(d),before,'render must preserve raw cells and explicit deny overrides');
 }
});
void test('unsupported derivations and independent save-only grants never claim edit includes save',()=>{
 const d=draft();for(const id of ['editor','routine','lines']){d.cells[id+'.view']=true;d.cells[id+'.edit']=true;}
 const html=renderer().matrix(d,false);
 for(const id of ['editor','routine','lines'])assert.equal(note(html,id+'.save'),undefined);
 d.cells['bom.view']=true;d.cells['bom.save']=true;
 assert.equal(note(renderer().matrix(d,true),'bom.save'),'');
});
void test('raw checkbox values and editable flags stay identical for every permission',()=>{
 const d=draft();for(const [i,k]of P.accessKeys.entries()){d.cells[k]=i%3!==0;d.editable[k]=i%4!==0;}
 for(const individual of [false,true]){
  const html=renderer().matrix(d,individual),inputs=[...html.matchAll(/<input type="checkbox"([^>]*data-ua-cell="([^" ]+)"[^>]*)>/g)];
  assert.equal(inputs.length,P.accessKeys.length);
  for(const [,attributes,key]of inputs){assert.equal(/(?:^|\s)checked(?:\s|$)/.test(attributes),d.cells[key],key);assert.equal(/(?:^|\s)disabled(?:\s|$)/.test(attributes),key.startsWith('lines.')&&key!=='lines.view'||!d.editable[key],key);}
 }
});
void test('sync updates the note after view/edit changes without replacing inputs or changing draft',()=>{
 const context=renderer('vi'),d=draft(),node={dataset:{uaSaveIncluded:'bom.save'},textContent:''};
 const input={dataset:{uaCell:'bom.save'},checked:false,disabled:false,closest:()=>({querySelector:()=>null})};
 const root={querySelectorAll:s=>s==='[data-ua-cell]'?[input]:s==='[data-ua-save-included]'?[node]:[]};
 for(const [view,edit]of [[true,true],[true,false],[false,true],[true,true]]){
  d.cells['bom.view']=view;d.cells['bom.edit']=edit;const before=JSON.stringify(d);context.syncCells(root,d);
  assert.equal(node.textContent,view&&edit?'Đã gồm trong quyền Sửa':'');assert.equal(input.checked,false);assert.equal(input.disabled,false);assert.equal(JSON.stringify(d),before);
 }
});
void test('a denied or readonly raw save cell retains its management boundary',()=>{
 const d=draft();d.cells['bom.view']=true;d.cells['bom.edit']=true;d.editable={};
 const html=renderer().matrix(d,true);
 assert.equal(note(html,'bom.save'),'修改權已包含');assert.match(html,/data-ua-cell="bom.save"[^>]*disabled/);assert.equal(d.accessOverrides['bom.save'],false);
});

void test('displayed inclusion agrees with actual workflow GET capabilities; no data writes',async()=>{
 const db=new DatabaseSync(':memory:');
 for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+name,'utf8'));
 const d=draft();for(const row of P.catalog){if(row.ops.includes('view'))d.cells[row.id+'.view']=true;if(row.ops.includes('edit'))d.cells[row.id+'.edit']=true;}
 let writes=0;
 const env={PROCESS_SESSION_SECRET:randomUUID(),DB:{prepare(sql){let args=[];return{bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args),success:true};},async run(){writes++;return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}};},async batch(statements){return Promise.all(statements.map(s=>s.all()));}},STATE_ARCHIVE:{async get(){throw Error('Unexpected archive read');},async put(){throw Error('Unexpected archive write');}}};
 const load=createRequire(import.meta.url)('../scripts/ipqc-ab-import-harness.cjs')(env),core=load('lib/process-state.ts');
 const user={id:'synthetic-save-label',name:'Synthetic save label',role:'staff',enabled:true,authEpoch:1,accessOverrides:d.cells};
 db.prepare('INSERT INTO shared_state VALUES(1,1,?,?)').run(JSON.stringify({platformUsers:JSON.stringify([user]),processCustomRoles:'[]',processRoleTemplateOverrides:'{}'}),'synthetic');
 const cookie='process_demo='+await core.demoSession(new Request('https://synthetic.invalid'),user.id,false,user.authEpoch);
 const routes={ab:'master/workflow?scope=AB',c:'master/workflow?scope=C',templates:'master/workflow?scope=PROCESS',bom:'bom/workflow',fqc:'fqc/workflow',iqc:'iqc/workflow','ipqc-ab':'ipqc-ab/workflow?module=1','ipqc-c':'ipqc-c/workflow',tooling:'tooling/workflow',equipment:'routine-equipment/workflow',editor:'process-authoring/workflow'};
 const before=JSON.stringify(db.prepare('SELECT * FROM shared_state').all()),html=renderer().matrix(d,false);
 try{
  for(const [id,route]of Object.entries(routes)){
   const path=route.split('?')[0],response=await load('app/api/'+path+'/route.ts').GET(new Request('https://synthetic.invalid/api/'+route+(route.includes('?')?'&':'?')+'permissions=1',{headers:{Cookie:cookie}}));
   assert.equal(response.status,200,id);
   const body=await response.json();assert.equal(body.permissions.edit,true,id);
   assert.equal(note(html,id+'.save')==='修改權已包含',body.permissions.save,id+' actual backend capability');
  }
  assert.equal(writes,0);assert.equal(JSON.stringify(db.prepare('SELECT * FROM shared_state').all()),before);
 }finally{db.close();}
});

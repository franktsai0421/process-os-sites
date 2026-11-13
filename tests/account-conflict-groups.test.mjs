// Actual editUser/editRole + submit functions, injected DOM and JSON transport only.
// No real accounts, browser, network, backup or restore operation.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import * as P from '../public/process/access-policy.mjs';
const source=fs.readFileSync('public/process/user-access.js','utf8'),copy=value=>JSON.parse(JSON.stringify(value));
const off=Object.fromEntries(P.accessKeys.map(key=>[key,false]));
class Node{
 constructor(){this.dataset={};this.children=[];this.disabled=false;this.textContent='';this.value='';this.isConnected=true;this.open=true;this.scrollLeft=0;this.scrollTop=0;}
 setAttribute(){}removeAttribute(){}append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}before(node){this.inserted||=[];this.inserted.push(node);}remove(){this.isConnected=false;this.parent?.children.splice(this.parent.children.indexOf(this),1);}querySelectorAll(){return [];}focus(){}set innerHTML(value){this.markup=value;}get innerHTML(){return this.markup||'';}
}
function fixture(kind='user',language='zh'){
 const actor={id:'owner',role:'admin',cells:Object.fromEntries(P.accessKeys.map(key=>[key,true]))},role={id:'staff',name:'Staff',description:'Base description',views:[],permissions:[],access:{...off,'bom.view':true}},user={id:'target',name:'Base name',role:'staff',enabled:true,accessOverrides:{},editable:Object.fromEntries(P.accessKeys.map(key=>[key,!key.startsWith('lines.')])),actions:{edit:true}};
 user.cells=P.effectiveCells(user,{staff:role});user.configuredCells={...user.cells};const remote={actor,canRoles:true,users:[user],roles:[role],revision:1},posts=[];let reads=0,readHook=null,currentDraft;
 const form=new Node(),submitButton=new Node(),errorBox=new Node(),progressBox=new Node(),validationHost=new Node(),matrix=new Node(),wrap=new Node(),fields={id:new Node(),name:new Node(),role:new Node(),description:new Node()};fields.id.value=user.id;fields.name.value=kind==='user'?user.name:role.name;fields.role.value=role.id;fields.description.value=role.description;form.elements=fields;
 const events={};form.addEventListener=(name,fn)=>{(events[name]||=[]).push(fn);};matrix.querySelector=()=>wrap;
 const dialog=new Node();dialog.classList={add(){}};dialog.addEventListener=(name,fn)=>{(events['dialog:'+name]||=[]).push(fn);};dialog.close=()=>{dialog.open=false;dialog.isConnected=false;};dialog.querySelector=selector=>selector==='form'?form:selector==='.ua-error'?errorBox:selector==='.ua-progress'?progressBox:selector==='[data-ua-matrix]'?matrix:selector.includes('type=')?submitButton:selector==='footer'?validationHost:selector==='[name="name"]'?fields.name:selector==='[name="description"]'?fields.description:new Node();dialog.querySelectorAll=()=>[submitButton,...Object.values(fields)];dialog.dataset={};
 const owner={},ctx={P,structuredClone,JSON,Error,console,model:copy(remote),modelStamp:owner,writeUncertain:false,identityStamp:()=>owner,sameIdentity:value=>value===owner,active:()=>true,h:String,t:(zh,vi)=>language==='vi'?vi:zh,document:{createElement:()=>new Node(),querySelector:()=>null,activeElement:null},window:{},roleOptions:()=>ctx.model.roles.map(role=>'<option value="'+role.id+'">'+role.name+'</option>').join(''),roleName:id=>id,permissionLabel:key=>key,button:()=>'',matrix:()=>'',bindSearch(){},setIndeterminate(){},fields:()=>Object.fromEntries(ctx.model.roles.map(row=>[row.id,row])),dialog:()=>dialog,reviewChanges:(_dialog,draft)=>{currentDraft=draft;},syncCells:()=>{},message:code=>code,accountToast(){},paint(){},async load(){reads++;if(readHook)await readHook();ctx.model=copy(remote);return ctx.model;},async send(payload){assert.equal(ctx.model.revision,remote.revision,'must use latest revision');posts.push(copy(payload));const target=payload.action==='update-role'?remote.roles[0]:remote.users[0];assert(target);if(payload.name!==undefined)target.name=payload.name;if(payload.description!==undefined)target.description=payload.description;if(payload.role)target.role=payload.role;const key=payload.action==='update-role'?'access':'accessOverrides';target[key]||={};for(const [cell,value]of Object.entries(payload.changes||payload.access||{})){if(value===null)delete target[key][cell];else target[key][cell]=value;}remote.revision++;return copy(remote);}};
 vm.createContext(ctx);vm.runInContext('let resultNotice=null;'+source.slice(source.indexOf(' function rememberResultNotice('),source.indexOf(' function paint(')),ctx);
 vm.runInContext(source.slice(source.indexOf(' function previewCells('),source.indexOf('\n const active=')),ctx);
 vm.runInContext(source.slice(source.indexOf(' function submit('),source.indexOf(' function password(')),ctx);
 if(kind==='user'){vm.runInContext(source.slice(source.indexOf(' function editUser('),source.indexOf(' function syncCells(')),ctx);ctx.editUser(copy(user));}
 else{vm.runInContext(source.slice(source.indexOf(' function editRole('),source.indexOf(' function more(')),ctx);ctx.editRole(copy(role));}
 const target=()=>kind==='user'?remote.users[0]:remote.roles[0],choose=choice=>{const box=errorBox.inserted?.findLast(node=>node.isConnected&&node.className==='ua-conflict');assert(box,'comparison must be visible');const button=box.children.find(node=>node.dataset.uaConflictChoice===choice);assert(button);button.onclick();return button;};
 return{ctx,dialog,errorBox,submitButton,fields,events,posts,target,remote,readCount:()=>reads,run:()=>form.onsubmit({preventDefault(){}}),choose,input(){for(const fn of events.input||[])fn({});},draft:()=>currentDraft,peer(fn){fn(target(),remote);remote.revision++;},setName(value){fields.name.value=value;},setCell(key,value){dialog.onchange({target:{dataset:{uaCell:key},checked:value}});},hook(fn){readHook=fn;}};
}
for(const kind of ['user','role'])for(const language of ['zh','vi'])for(const choice of ['mine','theirs','cancel'])void test(kind+' '+language+' grouped '+choice+' preserves independent changes and never posts from a choice',async()=>{
 const f=fixture(kind,language);f.setName('Mine name');f.setCell('bom.edit',true);f.peer(target=>{target.name='Peer name';if(kind==='role')target.description='Peer description';});
 await f.run();assert.equal(f.posts.length,0);assert.equal(f.submitButton.disabled,true);f.choose(choice);assert.equal(f.posts.length,0);assert.equal(f.submitButton.disabled,false);
 if(choice==='cancel'){assert.equal(f.fields.name.value,'Mine name');assert.equal(f.draft().cells['bom.edit'],true);return;}
 assert.equal(f.fields.name.value,choice==='mine'?'Mine name':'Peer name');await f.run();assert.equal(f.posts.length,1);assert.equal(f.dialog.open,false);assert.equal(f.target().name,choice==='mine'?'Mine name':'Peer name');
 if(kind==='user')assert.equal(f.target().accessOverrides['bom.edit'],true,'mine nonconflicting permission group survives name choice');
 else assert.equal(f.target().access['bom.edit'],true,'mine nonconflicting permission group survives profile choice');
});
for(const kind of ['user','role'])for(const choice of ['mine','theirs'])void test(kind+' permission conflicts choose the complete group, not per-cell silent merge: '+choice,async()=>{
 const f=fixture(kind);f.setCell('bom.edit',true);f.peer(target=>{target[kind==='user'?'accessOverrides':'access']['bom.exchange']=true;target.name='Peer independent name';});await f.run();f.choose(choice);assert.equal(f.fields.name.value,'Peer independent name');assert.equal(f.posts.length,0);await f.run();const rights=f.target()[kind==='user'?'accessOverrides':'access'];assert.equal(rights['bom.edit']===true,choice==='mine');assert.equal(rights['bom.exchange']===true,choice==='theirs');assert.equal(f.target().name,'Peer independent name');
});
for(const kind of ['user','role'])void test(kind+' second peer version triggers a new choice; stale buttons cannot apply after cancellation or newer input',async()=>{
 const f=fixture(kind);f.setName('Mine');f.peer(target=>target.name='Peer1');await f.run();const stale=f.choose('cancel');stale.onclick();assert.equal(f.fields.name.value,'Mine');await f.run();f.choose('mine');f.peer(target=>target.name='Peer2');await f.run();assert.equal(f.posts.length,0);f.choose('theirs');assert.equal(f.fields.name.value,'Peer2');f.setName('New input');f.input();stale.onclick();assert.equal(f.fields.name.value,'New input');await f.run();assert.equal(f.posts.length,1);assert.equal(f.target().name,'New input');
});
for(const fault of ['actor','target-protected','target-deleted','editable-revoked','late-peer','input'])void test('fresh '+fault+' cannot force a user write or replace newer input',async()=>{
 const f=fixture();f.setCell('bom.edit',true);f.peer(target=>target.accessOverrides['bom.exchange']=true);await f.run();
 if(fault==='actor')f.ctx.model.actor={...f.ctx.model.actor,name:'Changed authority'};
 if(fault==='target-protected')f.ctx.model.users[0].primary=true;
 if(fault==='target-deleted')f.ctx.model.users=[];
 if(fault==='editable-revoked')f.ctx.model.users[0].editable['bom.edit']=false;
 if(fault==='late-peer')f.ctx.model.users[0].name='New peer reply';
 if(fault==='input')f.setName('Input after comparison');
 f.choose('mine');assert.equal(f.posts.length,0);if(fault==='input')assert.equal(f.fields.name.value,'Input after comparison');
 if(fault==='editable-revoked')assert.notEqual(f.errorBox.textContent,'');
});
for(const kind of ['user','role'])void test(kind+' nonconflicting peer version retains both groups, requires another explicit Save and rechecks current authority',async()=>{
 const f=fixture(kind);f.setCell('bom.edit',true);f.peer(target=>target.name='Peer metadata');await f.run();assert.equal(f.posts.length,0);assert.equal(f.fields.name.value,'Peer metadata');assert.equal(f.draft().cells['bom.edit'],true);assert.equal(f.submitButton.disabled,false);f.peer((_target,model)=>model.actor={...model.actor,name:'Authority changed'});await f.run();assert.equal(f.posts.length,0);assert.equal(f.errorBox.textContent,'ACTOR_CHANGED');
});
void test('a newly created peer-assigned role is displayed from fresh options and retained by a name-only Save',async()=>{
 const f=fixture();f.setName('Mine name');f.peer((target,model)=>{model.roles.push({id:'custom_new',name:'Fresh role',description:'',views:[],permissions:[],access:{...off}});target.role='custom_new';target.cells=P.effectiveCells(target,Object.fromEntries(model.roles.map(role=>[role.id,role])));target.configuredCells={...target.cells};});await f.run();assert.equal(f.posts.length,0);assert.equal(f.fields.role.value,'custom_new');assert.match(f.fields.role.innerHTML,/custom_new/);assert.equal(f.fields.name.value,'Mine name');await f.run();assert.equal(f.posts.length,1);assert.equal(f.target().role,'custom_new');
});
void test('mine cannot recreate a role removed from the fresh role catalog',async()=>{
 const f=fixture();f.setCell('bom.edit',true);f.peer((target,model)=>{model.roles=[{id:'custom_new',name:'Fresh role',description:'',views:[],permissions:[],access:{...off}}];target.role='custom_new';});await f.run();f.choose('mine');assert.equal(f.posts.length,0);assert.equal(f.errorBox.textContent,'INVALID_ROLE');assert.equal(f.draft().role,'staff');
});
for(const kind of ['user','role'])void test(kind+' late prewrite response cannot reopen a closed form or replace newer input',async()=>{
 const f=fixture(kind);f.setName('Original input');f.peer(target=>target.name='Peer version');let release;const held=new Promise(resolve=>release=resolve);f.hook(()=>held);const saving=f.run();assert.equal(f.readCount(),1);f.dialog.open=false;f.fields.name.value='New page input';release();await saving;assert.equal(f.posts.length,0);assert.equal(f.fields.name.value,'New page input');assert.equal(f.errorBox.textContent,'DIALOG_CLOSED');assert.equal(f.errorBox.inserted?.some(node=>node.className==='ua-conflict'&&node.isConnected)||false,false);
});

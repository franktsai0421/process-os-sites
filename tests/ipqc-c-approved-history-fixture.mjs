// Actual primary transport + helper + session + complete IPQC-C module. Synthetic
// fetch, DOM, Web Locks and Web Storage only; no browser/server/live data.
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {canvasDOM} from '../scripts/login-reentry-dom.mjs';
const source=name=>fs.readFileSync(new URL('../public/process/'+name,import.meta.url),'utf8');
const helperSource=process.env.IPQCC_HELPER_SOURCE?fs.readFileSync(process.env.IPQCC_HELPER_SOURCE,'utf8'):source('local-draft-recovery.js');
const sessionSource=process.env.IPQCC_SESSION_SOURCE?fs.readFileSync(process.env.IPQCC_SESSION_SOURCE,'utf8'):source('local-draft-recovery-session.js');
const transport=process.env.IPQCC_TRANSPORT_SOURCE?fs.readFileSync(process.env.IPQCC_TRANSPORT_SOURCE,'utf8'):source('shared-draft-client.js');
const clone=value=>JSON.parse(JSON.stringify(value)),turn=()=>new Promise(setImmediate);
function lockManager(){const held=new Set();return{request(name,_options,callback){if(held.has(name))return Promise.resolve(callback(null));held.add(name);return Promise.resolve(callback({name})).finally(()=>held.delete(name));}};}
function remoteState(){return{scope:'ipqc-c',generation:'g1',revision:1,working:{errors:[{id:'E1',name:'Original',note:'Old note',code:'C-1-L1',productCode:'P1',stageCode:'S1'}],items:[]},saved:{id:'s1',revision:1,actor:{id:'actor-a',name:'Fixture'},at:'fixture'},pendingId:null,activeId:null,contributors:{},editable:true};}
async function fixture({data=new Map(),locks=lockManager(),remote=remoteState(),mode='ok',cold=false}={}){
 const {document,events,Node}=canvasDOM();document.createTreeWalker=root=>{const nodes=[];const visit=n=>{if(n._text)nodes.push({get nodeValue(){return n._text;},set nodeValue(v){n._text=v;}});for(const child of n.children)visit(child);};visit(root);let i=0;return{nextNode:()=>nodes[i++]||null};};Node.prototype.before=function(node){const p=this.parentElement;node.remove();node.parentElement=p;p.children.splice(p.children.indexOf(this),0,node);};Node.prototype.getClientRects=()=>[{}];// DOM adapter delegates with the receiving node as this.
 // eslint-disable-next-line typescript/unbound-method
 const insert=Node.prototype.insertAdjacentHTML;Node.prototype.insertAdjacentHTML=function(position,html){if(position!=='afterend')return insert.call(this,position,html);const tmp=document.createElement('div');tmp.innerHTML=html;while(tmp.children.length)this.after(tmp.children[0]);};const calls=[],storageCalls=[],timers=new Map(),receipts=new Map();let actor={id:'preview-editor'},epoch=1,delivery=1,nextMode=mode,hook=null,responseHook=null,removeHook=null,setHook=null,getHook=null,serial=0;
 let permissions={view:true,edit:true,save:true,submit:true,history:true,restore:true,create:true,delete:true,withdraw:true,approve:true,return:true};
 const storage={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem(key){storageCalls.push(['get',key]);getHook?.(key);return data.get(key)??null;},setItem(key,value){setHook?.(key,value);storageCalls.push(['set',key,value]);data.set(key,String(value));},removeItem(key){storageCalls.push(['remove',key]);removeHook?.(key);data.delete(key);},clear(){throw Error('UNRELATED_CLEAR');}};
 const control=()=>({activeVersionId:null,versions:[{id:'shared-g1',status:'draft',snapshot:clone(remote.working),number:1,history:[]}],workflow:{...clone(remote),cases:[],saved:{...clone(remote.saved),content:clone(remote.working)}}});
 const state=()=>({revision:remote.revision,permissions:{...permissions},workflow:clone(remote)});
 const box=events({console,document,crypto:webcrypto,TextEncoder,Uint8Array,URL,URLSearchParams,Response,AbortController,performance,location:{origin:'https://fixture.invalid',pathname:'/process/'},localStorage:storage,sessionStorage:storage,navigator:locks?{locks}:{},NodeFilter:{SHOW_TEXT:4},MutationObserver:class{observe(){}},scrollTo(){},hasPermission:()=>true,bindDataInner(){},CustomEvent:class{constructor(type){this.type=type;}},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);},confirm:()=>true,alert(){},toast(){}});box.window=box;
 box.ProcessSync={get identity(){return actor;},identityGeneration:()=>epoch,captureDelivery:()=>delivery,isCurrentDelivery:value=>value===delivery,platformHeaders:()=>({'Content-Type':'application/json'})};
 box.VersionDraftUI={preserveView:()=>()=>{},t:key=>key,date:()=>'',reasonFor:()=>'',confirmSubmit:async()=> 'fixture submit',confirmReview:async()=>({reason:'fixture review'})};
 box.ProcessIPQC={mountReferences:async()=>{},referenceMarkup:()=>''};
 box.fetch=async(url,options={})=>{const params=new URL(url,'https://fixture.invalid').searchParams,body=options.body?JSON.parse(options.body):null,event={url,method:options.method||'GET',body};calls.push(event);await hook?.(event);const intercepted=await responseHook?.(event);if(intercepted)return intercepted;
  if(body?.action==='begin')return Response.json({control:control(),revision:remote.revision});
  if(body?.command){const command=body.command;
   if(['pending','stale'].includes(nextMode))return Response.json({error:nextMode==='pending'?'PENDING_LOCKED':'STALE_GENERATION',requestId:'12345678-1234-4234-8234-123456789abc'},{status:409});
   if(nextMode==='unknown404')throw Error('LOST_RESPONSE');
   for(const guard of command.guards||[]){let value=remote.working;for(const part of guard.path)value=typeof part==='object'?value?.find(row=>row.id===part.id):value?.[part];if(JSON.stringify(value)!==JSON.stringify(guard.value))return Response.json({error:'DEPENDENCY_CHANGED_RECONFIRM',requestId:'12345678-1234-4234-8234-123456789abc',details:{path:guard.path}},{status:409});}
   for(const patch of command.patches||[]){let target=remote.working;for(const part of patch.path.slice(0,-1))target=typeof part==='object'?target.find(row=>row.id===part.id):target[part];target[patch.path.at(-1)]=clone(patch.value);}
   remote.revision++;const receipt={operationId:command.operationId,generation:command.generation,revision:remote.revision,savedId:remote.saved?.id||null,caseId:null,unchanged:false};receipts.set(command.operationId,receipt);
   if(nextMode==='unknown')throw Error('LOST_RESPONSE');return Response.json({control:control(),revision:remote.revision,receipt,permissions:{...permissions}});
  }
  if(params.has('operationId')){const receipt=receipts.get(params.get('operationId'));if(nextMode.startsWith('unknown')||!receipt)return Response.json({error:'OPERATION_NOT_FOUND'},{status:404});return Response.json({receipt});}
  if(url.startsWith('/api/ipqc-c?'))return Response.json({control:control(),revision:remote.revision,catalog:{products:[{code:'P1',stages:['S1']}],stages:[{code:'S1'}]}});
  if(params.has('permissions'))return Response.json({permissions:{...permissions},revision:remote.revision});
  return Response.json(state());
 };
 vm.createContext(box);for(const [name,text] of [['transport',transport],['helper',helperSource],['session',sessionSource]])vm.runInContext(text,box,{filename:name+'.js'});
 const area=document.createElement('section');area.id='data-content';area.dataset.activeTab='quality-ipqc-c';area.innerHTML='<section id="ipqcc-page"><form id="ipqcc-editor"><input name="name"><textarea name="note"></textarea></form></section>';document.body.append(area);
 const hookSource=`\nwindow.__errorRecoveryTest={setup(value,element){control=value;working=copy(value.workflow.working);revision=value.workflow.revision;selectedVersionId='shared-'+value.workflow.generation;host=element;catalog={products:[{code:'P1',stages:['S1']}],stages:[{code:'S1'}]};},sharedTransport,retireApprovedHistory,mountApprovedHistory,read,upload,equipment(value){equipment=value;},legacyReceipts,queryLegacyReceipt,openLegacyReceipts,startEditor,closeEditor,bind,writeShared,write,checkPreviousOperation,draw,render(lang){language=lang;host.innerHTML=mainHTML();bind();},\nstate:()=>({modal,control,working,message,localChanges}),flight:()=>localSaveAttempt,\nedit(name,value){modal.fields[name]=value;modal.dirty=true;},setModal(value){modal=value;},selected(value){selectedVersionId=value;},\napply(){const target=modal,keys=['name','note','reason'].filter(key=>String(target.fields[key]??'')!==target.base[key]);return write('apply',{patches:keys.map(key=>({op:'set',path:['errors',{id:target.existingId},key],value:target.fields[key]??''})),guards:keys.map(key=>({path:['errors',{id:target.existingId},key],value:target.base[key]}))},true);}};\n`;
 const moduleSource=source('ipqc-c.js'),end=moduleSource.lastIndexOf('})();');vm.runInContext(moduleSource.slice(0,end)+hookSource+moduleSource.slice(end),box,{filename:'ipqc-c.js'});
 const api=box.__errorRecoveryTest;api.setup(control(),area);if(cold)await api.sharedTransport().permissions();else await api.sharedTransport().read();api.bind();
 const initialStorageCalls=storageCalls.slice();calls.length=0;storageCalls.length=0;
 return{api,box,document,area,data,remote,locks,calls,storageCalls,initialStorageCalls,receipts,timers,common(){vm.runInContext(source('version-draft-ui.js'),box,{filename:'version-draft-ui.js'});api.draw();},response:value=>responseHook=value,start(){api.startEditor('error',api.state().working.errors[0]);},edit(value='Local'){api.edit('name',value);},tick(){const run=[...timers].filter(([,v])=>v.ms===250);for(const [id,{fn}]of run){timers.delete(id);fn();}},async close(){box.dispatchEvent({type:'pagehide'});await turn();},mode:value=>nextMode=value,hook:value=>hook=value,removeHook:value=>removeHook=value,setHook:value=>setHook=value,getHook:value=>getHook=value,permissions:value=>permissions={...permissions,...value},epoch:value=>epoch=value,actor:value=>actor={id:value},delivery:()=>delivery++};
}
const posts=f=>f.calls.filter(call=>call.method==='POST');


export {fixture,clone,turn,posts};

/* oxlint-disable typescript/no-require-imports -- transport unit test without a browser or service. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
(async()=>{
 const notices=[],root={prepend:n=>{n.isConnected=true;notices.push(n);}};
 const controls=Object.fromEntries(['save','delete'].map(k=>[k,{disabled:false,setAttribute(){},closest:()=>root}]));
 let permissions={save:true,delete:false};
 const document={documentElement:{lang:'zh-TW'},querySelectorAll:s=>[controls[s]],querySelector:()=>root,createElement:()=>({setAttribute(){}})};
 const window={ProcessSync:{identity:{id:'employee'}},addEventListener(){}};
 const context={window,document,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},crypto:{randomUUID},AbortController,setTimeout,clearTimeout,fetch:async()=>({ok:true,status:200,json:async()=>({permissions})})};
 vm.runInNewContext(fs.readFileSync('public/process/shared-draft-client.js','utf8'),context);
 const client=window.createSharedDraftClient({endpoint:'/fixture',actorId:'employee',headers:()=>({}),permissionGates:{save:'save',delete:'delete'}});
 await client.read();assert.equal(controls.delete.disabled,true);assert.equal(controls.save.disabled,false);assert.equal(notices.length,0);
 controls.delete.disabled=false;client.gatePermissions();assert.equal(notices.length,0);
 permissions={save:false,delete:false};await client.read();assert.equal(controls.save.disabled,true);assert.equal(notices.length,1);assert.match(notices[0].textContent,/權限已變更/);assert.doesNotMatch(notices[0].textContent,/Quyền/);
 window.ProcessSync.identity={id:'another'};await assert.rejects(client.read(),/ACCOUNT_CHANGED_REOPEN_REQUIRED/);
 await equipmentDeletePermissionCases();
 console.log('PASS initial denied controls stay disabled without a false revocation alert; real revocation blocks Save and shows localized notice; stale account read rejected');
})().catch(e=>{console.error(e);process.exitCode=1;});

// Actual equipment functions + actual shared client; only DOM/fetch/ref/apply boundaries are fake.
async function equipmentDeletePermissionCases() {
 const ts=require('typescript');
 const source=fs.readFileSync('public/process/routine-equipment.js','utf8');
 const clientSource=fs.readFileSync('public/process/shared-draft-client.js','utf8');
 const ast=ts.createSourceFile('routine-equipment.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const expression=ast.statements[0].expression.expression;
 const body=(ts.isParenthesizedExpression(expression)?expression.expression:expression).body;
 assert.ok(body&&ts.isBlock(body),'Actual equipment module IIFE');
 const declarations=new Map();
 for(const node of body.statements){
  if(ts.isFunctionDeclaration(node)&&node.name)declarations.set(node.name.text,source.slice(node.getStart(ast),node.end));
  if(ts.isVariableStatement(node))for(const declaration of node.declarationList.declarations)
   if(ts.isIdentifier(declaration.name)&&declaration.initializer)declarations.set(declaration.name.text,'const '+source.slice(declaration.getStart(ast),declaration.end)+';');
 }
 const names=['identity','permitted','open','active','selected','visible','editable','sharedTransport','form','deleteEquipment'];
 const actual=names.map(name=>{assert.ok(declarations.has(name),'Actual declaration '+name);return declarations.get(name);}).join('\n');
 const emptyReferences=()=>Object.fromEntries(['fqc','iqc','ipqcC','ipqcAB'].map(module=>[module,{active:[],pending:[],draft:[]}]));
 async function fixture(actor,deleteAllowed,language='zh') {
  let access={view:true,edit:true,save:true,submit:true,withdraw:true,approve:actor!=='staff',return:actor!=='staff',history:true,delete:deleteAllowed};
  const calls={fetch:[],references:0,confirm:0,apply:0,render:0,alerts:0},notices=[];
  let controls=[];
  const host={prepend(element){element.isConnected=true;notices.push(element);}};
  class Control {
   constructor(attributes){this.attributes=attributes;this.disabled=Object.hasOwn(attributes,'disabled');}
   setAttribute(key,value){this.attributes[key]=value;}
   closest(){return host;}
  }
  function renderControls(html) {
   controls=[];
   for(const tag of html.matchAll(/<(?:button|input|select|textarea)\b([^>]*)>/g)){
    const attributes={};
    for(const attr of tag[1].matchAll(/([-\w]+)(?:="([^"]*)")?/g))attributes[attr[1]]=attr[2]??'';
    controls.push(new Control(attributes));
   }
  }
  function matches(control,selector) {
   if(selector.startsWith('#'))return control.attributes.id===selector.slice(1);
   const attribute=/^\[([-\w]+)(?:="([^"]*)")?\]$/.exec(selector);
   return !!attribute&&Object.hasOwn(control.attributes,attribute[1])&&(attribute[2]===undefined||control.attributes[attribute[1]]===attribute[2]);
  }
  const document={documentElement:{lang:language},querySelector:selector=>selector==='#data-content'?host:null,
   querySelectorAll:selector=>controls.filter(control=>selector.split(',').some(part=>matches(control,part.trim()))),
   createElement:()=>({setAttribute(){}})};
  const row={id:'synthetic-target',assetCode:'QA-DELETE',name:'Synthetic target',groupId:'g',unit:'piece',calibrationMethod:'internal',enabled:true};
  const other={id:'synthetic-other',assetCode:'QA-OTHER',name:'Unchanged synthetic row'};
  const working={equipment:[row,other],groups:[{id:'g',categoryId:'c',subcategoryId:'s',name:'G'}],categories:[{id:'c',code:'C',name:'C'}],subcategories:[{id:'s',categoryId:'c',name:'S'}],issues:[]};
  const draft={id:'draft',status:'draft',equipment:JSON.parse(JSON.stringify(working.equipment))};
  const control={activeVersionId:'active',versions:[draft,{id:'active',status:'approved',equipment:[]}]};
  const photo={syntheticPhoto:true},otherPhoto={syntheticOtherPhoto:true};
  const window={ProcessSync:{identity:{id:actor,role:actor,sessionType:'platform'}},addEventListener(){},VersionDraftUI:{t:()=>language==='vi'?'Áp dụng':'套用'}};
  const storage=new Map();
  const context={window,document,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
   crypto:{randomUUID},AbortController,setTimeout,clearTimeout,
   fetch:async(url,options)=>{calls.fetch.push({method:options.method,url:String(url)});return{ok:true,status:200,json:async()=>({permissions:{...access},revision:1})};},
   api:'/api/routine-equipment',headers:()=>({}),control,working,readUnavailable:false,controlActor:actor,
   selectedVersionId:'draft',syncGeneration:'generation',sharedClient:null,sharedActor:'',selectedEquipmentId:row.id,editingEquipmentId:row.id,formSnapshot:{notes:'original'},
   equipmentRefCache:new Map(),pendingPhotos:new Map([[row.id,photo],[other.id,otherPhoto]]),message:'',submitProblems:[],problemSnapshot:null,
   localDelete:true,refHook:null,confirmHook:null,
   t:(zh,vi)=>language==='vi'?vi:zh,h:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
   structure:value=>value,getProblem:()=>null,problemMessage:value=>String(value),methodCode:value=>value,details:item=>item.name,displayName:item=>item.name,
   unitLabels:{piece:['件','Cái']},unitCode:value=>value,label:labels=>labels[language==='vi'?1:0],methodLabels:{internal:['內校','Nội bộ']},
   renderEditCalibrationFields:()=>'',equipmentReferencesSectionHTML:()=>'',photo:()=>null,status:value=>value,
   queryAllQualityReferences:async(id,options)=>{calls.references++;assert.equal(id,row.id);assert.equal(options.strict,true);return context.refHook?context.refHook():emptyReferences();},
   confirm:()=>{calls.confirm++;if(context.confirmHook)context.confirmHook(calls.confirm);return true;},
   alert:()=>{calls.alerts++;},
   writeShared:async action=>{assert.equal(action,'apply');calls.apply++;return{syntheticAcknowledgement:true};}
  };
  // Keep local edit permission true; deletion can be revoked independently.
  window.hasPermission=key=>key==='master.delete'?context.localDelete:true;
  vm.createContext(context);
  vm.runInContext(clientSource,context,{timeout:1000});
  vm.runInContext(actual+'\nglobalThis.equipmentActual={sharedTransport,deleteEquipment,form,editable};',context,{timeout:1000});
  const client=context.equipmentActual.sharedTransport();
  await client.read();
  context.render=()=>{
   calls.render++;
   renderControls(context.equipmentActual.form(row)+'<button data-equipment-delete="synthetic-target"></button><button data-node-delete="group"></button>');
   client.gatePermissions();
  };
  context.render();
  const find=selector=>{const found=document.querySelectorAll(selector);assert.equal(found.length,1,'Actual rendered control '+selector);return found[0];};
  const before=JSON.stringify(working),originalSnapshot=context.formSnapshot;
  function unchanged(){
   assert.equal(JSON.stringify(working),before,'Denied deletion retains all local data');
   assert.equal(working.equipment[0],row);assert.equal(working.equipment[1],other);
   assert.equal(context.pendingPhotos.get(row.id),photo);assert.equal(context.pendingPhotos.get(other.id),otherPhoto);
   assert.equal(context.editingEquipmentId,row.id);assert.equal(context.selectedEquipmentId,row.id);assert.equal(context.formSnapshot,originalSnapshot);
   assert.equal(calls.apply,0);
  }
  async function refreshDelete(value){access={...access,delete:value};await client.permissions();assert.equal(client.permission('edit'),true);assert.equal(client.permission('delete'),value);}
  return{context,client,calls,find,row,other,photo,otherPhoto,working,unchanged,refreshDelete};
 }
 for(const language of ['zh','vi']){
  const staff=await fixture('staff',false,language);
  assert.equal(staff.find('#routine-delete').disabled,true,'Actual modal must honor server delete=false');
  assert.equal(staff.find('#routine-delete').attributes['aria-disabled'],'true');
  assert.equal(staff.find('[data-equipment-delete]').disabled,true);
  assert.equal(staff.find('[data-node-delete]').disabled,true);
  assert.equal(staff.find('#routine-form-apply').disabled,false,'Delete-only denial must not revoke editing');
  assert.equal(staff.context.equipmentActual.editable(),true);
  const rd=await fixture('rd',true,language);
  assert.equal(rd.find('#routine-delete').disabled,false);
  assert.equal(rd.find('[data-equipment-delete]').disabled,false);
  assert.equal(rd.find('[data-node-delete]').disabled,false);
  assert.equal(rd.find('#routine-form-apply').disabled,false);
 }
 const denied=await fixture('staff',false);
 await denied.context.equipmentActual.deleteEquipment(denied.row.id);
 assert.equal(denied.calls.references,0,'Delete-only denial must stop before strict-reference GET');
 assert.equal(denied.calls.confirm,0);denied.unchanged();
 const revoked=await fixture('rd',true);
 let release,entered;
 const started=new Promise(resolve=>{entered=resolve;});
 const pendingReferences=new Promise(resolve=>{release=resolve;});
 revoked.context.refHook=()=>{entered();return pendingReferences;};
 const deletion=revoked.context.equipmentActual.deleteEquipment(revoked.row.id);
 await started;
 await revoked.refreshDelete(false);
 release(emptyReferences());await deletion;
 assert.equal(revoked.calls.references,1);assert.equal(revoked.calls.confirm,0);
 assert.equal(revoked.find('#routine-form-apply').disabled,false);revoked.unchanged();
 for(const confirmation of [1,2]){
  const f=await fixture('rd',true);
  f.context.confirmHook=count=>{if(count===confirmation)f.context.localDelete=false;};
  await f.context.equipmentActual.deleteEquipment(f.row.id);
  assert.equal(f.client.permission('edit'),true);assert.equal(f.context.equipmentActual.editable(),true);
  assert.equal(f.calls.confirm,2,'Retain both original confirmation calls; final authority recheck denies local remove');
  f.unchanged();
 }
 const allowed=await fixture('rd',true);
 await allowed.context.equipmentActual.deleteEquipment(allowed.row.id);
 assert.equal(allowed.calls.references,1);assert.equal(allowed.calls.confirm,2);assert.equal(allowed.calls.apply,1);
 assert.equal(allowed.working.equipment.length,1);assert.equal(allowed.working.equipment[0],allowed.other);
 assert.equal(allowed.context.pendingPhotos.has(allowed.row.id),false);
 assert.equal(allowed.context.pendingPhotos.get(allowed.other.id),allowed.otherPhoto);
 for(const f of [denied,revoked,allowed])assert.ok(f.calls.fetch.every(call=>call.method==='GET'),'Only fake permission GETs; apply seam never calls a real transport');
}

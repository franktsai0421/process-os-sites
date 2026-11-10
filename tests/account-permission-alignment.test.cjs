const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../public/process/access-policy.mjs'),off=Object.fromEntries(P.accessKeys.map(k=>[k,false])),roles={staff:{id:'staff',views:[],permissions:[],access:{...off}},admin:{id:'admin',views:[],permissions:[],access:{...off}}};
const user={id:'synthetic',role:'staff',enabled:true,accessOverrides:{...off}};
void test('fixed feedback view admits only effective known-role enabled accounts, without business grants or config mutation',()=>{
 const original=JSON.stringify(user),cells=P.effectiveCells(user,roles);assert.equal(cells['feedback.view'],true);assert.equal(Object.values(cells).filter(Boolean).length,1);assert.equal(P.roleEditable('staff')['feedback.view'],false);assert.equal(P.roleEditable('admin')['feedback.view'],false);
 for(const actor of [{...user,enabled:false},{...user,deletedAt:'synthetic'},{...user,role:'absent'}])assert(Object.values(P.effectiveCells(actor,roles)).every(v=>!v));
 assert.equal(JSON.stringify(user),original);
});
for(const id of P.editIncludesSave)void test(id+' effective Edit includes Save with view, preserves standalone Save and never infers view or workflow approval',()=>{
 const raw={...off,[id+'.view']:true,[id+'.edit']:true},original=JSON.stringify(raw),cells=P.withEditSave(raw);
 assert.equal(cells[id+'.save'],true);assert.equal(raw[id+'.save'],false);assert.equal(JSON.stringify(raw),original);
 assert.equal(P.withEditSave({...raw,[id+'.edit']:false})[id+'.save'],false);
 assert.equal(P.withEditSave({...off,[id+'.save']:true})[id+'.save'],true);
 assert.equal(P.withEditSave({...raw,[id+'.view']:false})[id+'.save'],false);
 for(const op of ['submit','withdraw','approve','return'])assert.equal(cells[id+'.'+op],false);
 assert.equal(P.effectiveCells({...user,accessOverrides:raw},roles)[id+'.save'],true);
});
void test('unestablished authoring/routine/lines boundaries remain explicit dependencies; filters do not create permissions',()=>{
 for(const id of ['editor','routine','lines'])assert.equal(P.withEditSave({...off,[id+'.view']:true,[id+'.edit']:true})[id+'.save'],false);
 for(const query of ['?view=data&dataTab=bom&line=A&group=x&stage=one','?view=data&dataTab=bom&line=C&group=y&stage=two'])assert.equal(P.moduleForURL('http://fixture/process/'+query),'bom');
 for(const row of P.catalog){assert.equal(new Set(row.ops).size,row.ops.length);for(const op of P.columns.map(c=>c[0]))assert.equal(P.accessKeys.includes(row.id+'.'+op),row.ops.includes(op));}
});
const source=fs.readFileSync('public/process/user-access.js','utf8');
for(const language of ['zh','vi'])void test(language+' actual role dialog recomputes effective Save, sends only raw explicit choices, and keeps fixed feedback view read-only',()=>{
 const role={id:'staff',name:'Synthetic',access:{...off,'bom.view':true}};
 const matrix={innerHTML:''},submit={textContent:'',hidden:false},d={dataset:{},classList:{add(){}},querySelector:s=>s==='[data-ua-matrix]'?matrix:s.includes('type=')?submit:s==='[name="name"]'?{value:'Synthetic'}:{value:''},querySelectorAll:()=>[]};let payload,review;
 const ctx={P,model:{canRoles:true},fields:()=>roles,crypto:require('node:crypto').webcrypto,structuredClone,t:(zh,vi)=>language==='vi'?vi:zh,h:s=>s,matrix:draft=>JSON.stringify(draft.cells),dialog:()=>d,reviewChanges:(d,draft)=>{review=draft.cells;},bindSearch(){},setIndeterminate(){},syncCells:(d,draft)=>{review=draft.cells;},submit:(d,fn)=>{payload=fn;}};
 vm.createContext(ctx);const start=source.indexOf(' function editRole(');vm.runInContext(source.slice(start,source.indexOf(' function more(',start)),ctx);ctx.editRole(role);
 assert.equal(JSON.parse(matrix.innerHTML)['feedback.view'],true);
 d.onchange({target:{dataset:{uaCell:'bom.edit'},checked:true}});assert.equal(review['bom.save'],true);
 let body=payload();assert.equal(body.access['bom.edit'],true);assert.equal(Object.hasOwn(body.access,'bom.save'),false);
 d.onchange({target:{dataset:{uaCell:'bom.edit'},checked:false}});assert.equal(review['bom.save'],false);body=payload();assert.equal(body.access['bom.edit'],false);
 d.onchange({target:{dataset:{uaCell:'feedback.view'},checked:false}});assert.equal(review['feedback.view'],true);assert.equal(Object.hasOwn(payload().access,'feedback.view'),false);
});
for(const language of ['zh','vi'])void test(language+' account feedback link uses delivery coordinator and rejects invalidated/device/disabled shells',()=>{
 let button,navigations=0,toasts=0;const menu={querySelector:()=>button,classList:{remove(){}},append:b=>{button=b;}};const ctx={currentUser:{role:'staff',enabled:true,cells:{'feedback.view':true}},window:{ProcessSync:{identity:{id:'synthetic'},deliveryProjection:true,features:{webFeedback:true}},ProcessDeliveryNavigation:{navigate(...args){assert.deepEqual(args,['data','web-feedback','process']);navigations++;return true;}}},document:{querySelector:()=>menu,createElement:()=>({dataset:{},remove(){button=undefined;}})},t:(zh,vi)=>language==='vi'?vi:zh,accountToast(){toasts++;}};
 vm.createContext(ctx);const start=source.indexOf(' function accountFeedback(');vm.runInContext(source.slice(start,source.indexOf(' const previousBindView',start)),ctx);ctx.accountFeedback();assert(button);if(language==='vi')assert.doesNotMatch(button.textContent,/[\u3400-\u9fff]/);button.onclick();assert.equal(navigations,1);
 ctx.window.ProcessSync.requiresReload=true;button.onclick();assert.equal(navigations,1);ctx.accountFeedback();assert.equal(button,undefined);
 ctx.window.ProcessSync.requiresReload=false;for(const role of ['viewer','device']){ctx.currentUser.role=role;ctx.accountFeedback();assert.equal(button,undefined);}ctx.currentUser.role='staff';ctx.currentUser.enabled=false;ctx.accountFeedback();assert.equal(button,undefined);assert.equal(toasts,0);
});

for(const language of ['zh','vi'])void test(language+' actual matrix describes derived Save and fixed feedback, without unsupported operation toggles',()=>{
 const ctx={P,t:(zh,vi)=>language==='vi'?vi:zh,h:s=>String(s),normalized:s=>String(s).toLowerCase(),fields:()=>roles,button:()=>''};vm.createContext(ctx);
 const start=source.indexOf(' const primaryOps='),end=source.indexOf(' function reviewChanges(',start);vm.runInContext(source.slice(start,end),ctx);
 const cells=P.effectiveCells({...user,accessOverrides:{...off,'bom.view':true,'bom.edit':true}},roles),html=ctx.matrix({role:'staff',cells,editable:P.roleEditable('staff')},false);
 assert.match(html,/data-ua-included="bom.save"/);assert.match(html,language==='vi'?/Sửa đã bao gồm lưu/:/修改已包含保存/);
 assert.match(html,language==='vi'?/Mọi tài khoản hợp lệ/:/所有有效啟用帳號/);
 for(const row of P.catalog)for(const op of P.columns.map(c=>c[0]))assert.equal(html.includes('data-ua-cell="'+row.id+'.'+op+'"'),row.ops.includes(op));
 if(language==='vi')assert.doesNotMatch(html,/[\u3400-\u9fff]/);
});
for(const language of ['zh','vi'])void test(language+' hidden archive history uses an explicit source-permission status, never a false empty-history message',()=>{
 const feedback=fs.readFileSync('public/process/web-feedback.js','utf8'),start=feedback.indexOf(' function renderHistory(');assert(start>0);
 const close=feedback.indexOf('\n async function ',start),code=feedback.slice(start,close);
 const host={innerHTML:'',querySelectorAll:()=>[],replaceChildren(node){this.notice=node;this.innerHTML='';},prepend(node){this.notice=node;}},ctx={document:{createElement:()=>({setAttribute(){}})},t:(zh,vi)=>language==='vi'?vi:zh,wire(){},esc:s=>s,api:'/synthetic',guard:fn=>fn};vm.createContext(ctx);vm.runInContext(code,ctx);ctx.renderHistory(host,[],{},()=>true,1);
 assert.equal(host.innerHTML,'');assert(host.notice.textContent);if(language==='vi')assert.doesNotMatch(host.notice.textContent,/[\u3400-\u9fff]/);
});
void test('actual shared kernel keeps approved cases immutable against withdraw/return and ends return/withdraw consistently',()=>{
 const {randomUUID}=require('node:crypto'),K=require('../scripts/ipqc-ab-import-harness.cjs')()('lib/shared-draft.ts');
 for(const terminal of ['approve','return','withdraw']){
  let state=K.createSharedDraft('bom',{note:'original'},'active-initial',randomUUID()),seq=0;
  const run=(action,details={})=>{const cmd={action,operationId:randomUUID(),clientId:'synthetic-client',generation:state.generation,sequence:++seq,...(action==='submit'?{expectedRevision:state.revision}:{}),...details},result=K.applyDraftCommand(state,cmd,{actor:{id:action===terminal?'reviewer':'editor',name:'Synthetic',admin:false},at:'2026-11-10',id:randomUUID,allowed:()=>true,activeId:state.active.id,semantic:x=>x,structure(){},validate:()=>[]});state=result.state;return result.receipt;};
  run('apply',{patches:[{op:'set',path:['note'],value:'changed'}]});run('save');run('submit',{savedId:state.saved.id,reason:'Synthetic review'});const id=state.pendingId;
  run(terminal,{caseId:id,reason:'Synthetic terminal'});const fixed=K.stableDraftJSON(state);assert.equal(state.pendingId,null);
  for(const action of ['withdraw','return','approve']){assert.throws(()=>run(action,{caseId:id,reason:'Cannot rewrite terminal'}),/CASE_NOT_PENDING/);assert.equal(K.stableDraftJSON(state),fixed);}
 }
});

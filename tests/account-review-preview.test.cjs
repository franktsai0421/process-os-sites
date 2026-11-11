// Actual account-dialog event handlers and the shared server projection.
// Synthetic subjects only; no HTTP client, account mutation or real storage.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const P=require('../public/process/access-policy.mjs'),A=require('../public/process/account-review-preview.mjs'),off=Object.fromEntries(P.accessKeys.map(key=>[key,false]));
const source=fs.readFileSync('public/process/user-access.js','utf8');
function setup(){const role={id:'custom_review',name:'Synthetic review',views:[],permissions:[],access:{...off,'approval.view':true,'ab.view':true,'ab.edit':true,'ab.approve':true}},roles={[role.id]:role},user={id:'synthetic',role:role.id,enabled:true},control={schemaVersion:2,primaryAdminId:'frank',draftReviewPolicy:'page-v1',audit:[]};return{role,roles,user,control};}
function proof(kind,id){const field=kind==='role'?'access':'accessOverrides';return{id:'synthetic-proof',at:'private-time',actor:{id:'frank',role:'admin',name:'private actor name'},action:'update-'+kind,target:id,before:{[field]:{'approval.approve':false},passwordHash:'private hash',notes:'private before'},after:{[field]:{'approval.approve':true},password:'private password',notes:'private after'},approvalConfirmation:{schemaVersion:1,permission:'approval.approve',granted:true,subjectKind:kind,subjectId:id}};}
void test('minimal authorized review evidence preserves decisions without exporting audit snapshots or unrelated subjects',()=>{
 const {role,roles,user,control}=setup();role.access['approval.approve']=true;control.audit=[proof('role',role.id),{...proof('user','private-other'),id:'private-audit'}];
 const context=A.publicAccountReviewContext([user],roles,control,{id:'frank',role:'admin',enabled:true}),json=JSON.stringify(context);
 for(const privateValue of ['private-time','private actor name','private hash','private password','private before','private after','private-other','private-audit'])assert(!json.includes(privateValue),privateValue);
 assert.equal(context.canConfirm,true);assert.equal(context.control.audit.length,1);assert.deepEqual(A.previewAccountCells(user,roles,context),A.resolveAccountReview(user,roles,control).cells);
 assert.equal(A.previewAccountCells(user,roles,context)['approval.approve'],true);
 const viewerContext=A.publicAccountReviewContext([user],roles,control,user);assert.equal(viewerContext.canConfirm,false);assert.deepEqual(A.previewAccountCells(user,roles,viewerContext),A.resolveAccountReview(user,roles,control).cells);
 const before=JSON.stringify(control);A.previewAccountCells(user,roles,context,{kind:'role',id:role.id});assert.equal(JSON.stringify(control),before);
});
void test('missing or unsupported policy is explicit; malformed history cannot manufacture approval in a preview',()=>{
 const {roles,user,control}=setup();roles[user.role].access['approval.approve']=true;
 assert.equal(A.publicAccountReviewContext([user],roles,{},user),undefined);assert.deepEqual(A.previewAccountCells(user,roles),P.effectiveCells(user,roles));
 for(const change of [{draftReviewPolicy:'unsupported'},{schemaVersion:1},{primaryAdminId:'other'},{audit:null},{audit:{fake:proof('role',user.role)}}]){
  const candidate={...control,...change},context=A.publicAccountReviewContext([user],roles,candidate,user),preview=A.previewAccountCells(user,roles,context,{kind:'role',id:user.role});assert.equal(preview['approval.approve'],false);assert.equal(preview['ab.approve'],false);assert.equal(preview['ab.view'],true);assert.equal(preview['ab.edit'],true);
 }
});
for(const language of ['zh','vi'])void test(language+' actual primary role dialog separates module review, previews explicit final confirmation and sends the exact confirmation flag',()=>{
 const {role,roles,user,control}=setup(),before=JSON.stringify(roles),context=A.publicAccountReviewContext([user],roles,control,{id:'frank',role:'admin',enabled:true});let build,cells;
 const matrix={innerHTML:''},submitButton={},d={dataset:{},classList:{add(){}},querySelector:s=>s==='[data-ua-matrix]'?matrix:s.includes('type=')?submitButton:s==='[name="name"]'?{value:role.name}:{value:''},querySelectorAll:()=>[]};
 const ctx={P,window:{ProcessAccountReview:A},model:{canRoles:true,reviewContext:context},fields:()=>roles,crypto:require('node:crypto').webcrypto,structuredClone,t:(zh,vi)=>language==='vi'?vi:zh,h:String,matrix:draft=>JSON.stringify(draft.cells),dialog:()=>d,reviewChanges:(_d,draft)=>{cells=draft.cells;},bindSearch(){},setIndeterminate(){},syncCells:(_d,draft)=>{cells=draft.cells;},submit:(_d,fn)=>{build=fn;}};
 vm.createContext(ctx);const helper=source.indexOf(' function previewCells(');vm.runInContext(source.slice(helper,source.indexOf('\n const active=',helper)),ctx);const start=source.indexOf(' function editRole(');vm.runInContext(source.slice(start,source.indexOf(' function more(',start)),ctx);ctx.editRole(role);
 assert.equal(cells['ab.submit'],true);assert.equal(cells['ab.withdraw'],true);assert.equal(cells['ab.approve'],false);assert.equal(cells['approval.approve'],false);assert.equal(Object.hasOwn(build(),'confirmFinalApproval'),false);
 d.onchange({target:{dataset:{uaCell:'approval.approve'},checked:true}});assert.equal(cells['approval.approve'],true);assert.equal(cells['ab.approve'],true);let body=build();assert.equal(body.confirmFinalApproval,true);assert.deepEqual(JSON.parse(JSON.stringify(body.access)),{'approval.approve':true});
 d.onchange({target:{dataset:{uaCell:'approval.approve'},checked:false}});assert.equal(cells['approval.approve'],false);assert.equal(cells['ab.approve'],false);assert.equal(cells['ab.submit'],true);assert.equal(cells['ab.withdraw'],true);body=build();assert.equal(Object.hasOwn(body,'confirmFinalApproval'),false);assert.equal(JSON.stringify(roles),before);
 delete ctx.window.ProcessAccountReview;assert.throws(()=>ctx.previewCells(user,roles),/REVIEW_POLICY_RELOAD_REQUIRED/);
});
for(const language of ['zh','vi'])void test(language+' active matrix keeps derived final/correction and unresolved legacy configuration read-only, while clean lower grants remain editable',()=>{
 const {roles,user,control}=setup(),context=A.publicAccountReviewContext([user],roles,control,{id:'frank',role:'admin',enabled:true}),ctx={P,window:{ProcessAccountReview:A},model:{reviewContext:context},fields:()=>roles,t:(zh,vi)=>language==='vi'?vi:zh,h:String,normalized:value=>String(value).toLowerCase(),button:()=>''};vm.createContext(ctx);const helpers=source.indexOf(' function previewCells(');vm.runInContext(source.slice(helpers,source.indexOf('\n const active=',helpers)),ctx);const start=source.indexOf(' const primaryOps=');vm.runInContext(source.slice(start,source.indexOf(' function reviewChanges(',start)),ctx);
 const draft={...user,cells:A.previewAccountCells(user,roles,context),editable:P.roleEditable(user.role)},html=ctx.matrix(draft,false),input=key=>html.match(new RegExp('<input[^>]+data-ua-cell="'+key.replace('.','\\.')+'"[^>]*>'))?.[0];for(const key of ['ab.submit','ab.withdraw','ab.approve','ab.return'])assert(input(key)?.includes('disabled'),key);if(language==='vi')assert.doesNotMatch(html,/[\u3400-\u9fff]/);
 roles[user.role].access['ab.approve']=false;const clean={...draft,cells:A.previewAccountCells(user,roles,context)};assert.equal(ctx.editableNow('ab.submit',clean.editable,clean),true);assert.equal(ctx.editableNow('ab.withdraw',clean.editable,clean),true);assert.equal(ctx.editableNow('ab.approve',clean.editable,clean),false);assert.equal(ctx.editableNow('ab.return',clean.editable,clean),false);
});

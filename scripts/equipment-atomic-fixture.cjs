/* oxlint-disable typescript/no-require-imports -- Synthetic handler/DOM fixture. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const {fixture:apiFixture}=require('./ipqc-c-operation-fixture.cjs');
const {fixture:uiFixture,copy}=require('./test-routine-equipment-transfer-intent.cjs');
const moduleId='routine-equipment';
async function fixture(){
 const empty={AB:{products:[],lines:[],categoryGroups:[]},C:{products:[],lines:[],categoryGroups:[]},PROCESS:{}};
 const master={active:copy(empty),versions:Object.entries(empty).map(([scope,snapshot])=>({id:'empty-'+scope,scope,number:1,status:'approved',snapshot,revision:1,creatorId:'fixture',creatorName:'Synthetic fixture',createdAt:'synthetic',updatedAt:'synthetic',history:[]}))};
 const h=await apiFixture({masterDataControl:JSON.stringify(master),processMasterData:'{}'}, {iqcReferenceView:true});
 async function mutate(change){const state=await h.core.readState();await change(state.values);h.db.prepare('UPDATE shared_state SET "values"=?,revision=revision+1').run(await h.load('lib/state-records.ts').encodeRecordValues(h.env.STATE_ARCHIVE,state.values));}
 async function rights(who,keys){await mutate(values=>{const users=JSON.parse(values.platformUsers),user=users.find(u=>u.id==='preview-'+who);for(const key of Object.keys(user.accessOverrides))if(key.startsWith('equipment.'))user.accessOverrides[key]=keys.includes(key.slice(10));values.platformUsers=JSON.stringify(users);});}
 await rights('edit-only',['view','edit']);await rights('save-only',['view','save']);await rights('revocable',['view','edit','save','submit','create','delete']);
 await h.begin(moduleId);
 await h.command(moduleId,'apply',{patches:[{op:'insert',path:['categories'],value:{id:'cat',name:'合成類別'}},{op:'insert',path:['subcategories'],value:{id:'sub',categoryId:'cat',name:'合成子類別'}},{op:'insert',path:['groups'],value:{id:'group',categoryId:'cat',subcategoryId:'sub',name:'合成群組'}}]});
 await h.command(moduleId,'apply',{patches:['source','target'].map(id=>({op:'insert',path:['equipment'],value:{id,assetCode:'SYN-'+id.toUpperCase(),groupId:'group',name:'合成設備 '+id,unit:'支',enabled:true,confirmed:true,calibrationMethod:'none',calibratedAt:'',expiresAt:''}}))});
 await h.promote(moduleId);await h.begin(moduleId);
 const requests=[];
 async function call(url,options={},who='editor'){
  const parsed=new URL(url,'http://fixture'),method=options.method||'GET',body=options.body&&typeof options.body==='string'?JSON.parse(options.body):null;
  const start=performance.now(),r=await h.load('app'+parsed.pathname+'/route.ts')[method](new Request(parsed,{method,headers:{...h.sessions[who],...options.headers},...(method==='GET'?{}:{body:options.body})}));
  requests.push({url:String(url),method,body,who,status:r.status,ms:performance.now()-start});return r;
 }
 async function connect(who='editor'){
  const f=await uiFixture({openTransfer:false});
  f.c.ProcessSync.identity=await h.core.identity(new Request('http://fixture/api/routine-equipment',{headers:h.sessions[who]}),await h.core.readState());f.rotateEpoch();f.c.fetch=(url,options)=>call(url,options,who);
  f.c.CustomEvent=class{constructor(type,detail){this.type=type;this.detail=detail?.detail;}};
  f.c.bindDataInner=()=>{};vm.runInContext(fs.readFileSync('public/process/version-draft-ui.js','utf8'),f.c);
  f.c.VersionDraftUI.mount=()=>{};f.c.VersionDraftUI.confirmSubmit=async()=> '合成送審';f.c.VersionDraftUI.reasonFor=()=> '合成送審';f.c.VersionDraftUI.confirmReview=async()=>({reason:'合成撤回',selfReviewConfirmed:false});
  f.c.RoutineEquipmentUI.navigation.reset();await f.c.RoutineEquipmentUI.mount(f.host);
  return f;
 }
 async function state(){return (await h.read(moduleId)).control;}
 async function persisted(){return JSON.parse((await h.core.readState()).values.routineEquipmentControl);}
 const close=()=>h.close();return {...h,mutate,rights,requests,call,connect,state,persisted,close,copy,randomUUID,assert};
}
module.exports={fixture};

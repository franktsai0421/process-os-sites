import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
// Read the actual public implementation; fake transport/storage only, never SDK/HTTP/DOM or file writes.
const scriptRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let selectedTest='SOURCE_SETUP';const results=[];
const check=(value)=>{if(!value)throw Error('REGRESSION_ASSERTION');};
const copy=value=>JSON.parse(JSON.stringify(value));
function slice(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);check(a>=0&&b>a);return source.slice(a,b);}
async function test(name,run){selectedTest=name;await run();results.push({name,pass:true});}
try{
 const args=process.argv.slice(2);check(args.length===0||args.length===2&&args[0]==='--source'&&path.isAbsolute(args[1]));
 const file=args.length?args[1]:path.join(scriptRoot,'public/process/fqc-master.js');
 const source=fs.readFileSync(file,'utf8');new vm.Script(source,{filename:'fqc-master.js'});
 const noStorage=()=>{throw Error('STORAGE_ACCESS_REFUSED');};
 const equipmentBox={Error,AbortSignal,mountSequence:0,window:{ProcessSync:{identity:{id:'TEST-ACTOR'},identityGeneration:()=>0}},console:{error(){}},isVi:()=>false,fetch:null,localStorage:{getItem:noStorage,setItem:noStorage,removeItem:noStorage},sessionStorage:{getItem:noStorage,setItem:noStorage,removeItem:noStorage}};
 equipmentBox.identity=()=>equipmentBox.window.ProcessSync.identity;
 vm.createContext(equipmentBox);
 const ownerSource=slice(source,'  function currentReadOwner(','  async function loadEquipmentCatalog(');
 const loader=slice(source,'  async function loadEquipmentCatalog(','  function getCachedEquipment(');
 vm.runInContext('let equipmentCache=null,equipmentLoadError=null,equipmentSequence=0,equipmentCacheCurrent=()=>false;'+ownerSource+loader+';this.load=loadEquipmentCatalog;this.reset=()=>{equipmentCache=null;equipmentLoadError=null;equipmentSequence=0;equipmentCacheCurrent=()=>false;};this.state=()=>({equipmentCache,equipmentLoadError});',equipmentBox);
 const empty={control:{schemaVersion:1,activeVersionId:null,versions:[],issues:[],reservedMarks:{}}};
 const approved={control:{schemaVersion:1,activeVersionId:'active-tool',versions:[{id:'active-tool',status:'approved',equipment:[{id:'TEST-TOOL',enabled:true}],categories:[],subcategories:[],groups:[],issues:[]}],issues:[],reservedMarks:{}}};
 async function equipment(name,status,body,reject=false,nonJSON=false){await test(name,async()=>{equipmentBox.reset();let calls=0;equipmentBox.fetch=async(url,options)=>{check(url==='/api/routine-equipment?catalog=effective'&&options.cache==='no-store');calls++;return{status,ok:status>=200&&status<300,json:async()=>{if(nonJSON)throw Error('SYNTHETIC_NON_JSON');return copy(body);}};};let failed=false,result;try{result=await equipmentBox.load();}catch{failed=true;}check(calls===1&&failed===reject);if(!reject){check(result&&Array.isArray(result.equipment));if(body.control.versions.length===0)check(result.activeVersionId===null&&['equipment','categories','subcategories','groups'].every(key=>result[key].length===0));else check(result.activeVersionId==='active-tool'&&result.equipment[0].id==='TEST-TOOL');}else check(equipmentBox.state().equipmentLoadError!==null);});}
 await equipment('legal empty200 returns empty choices',200,empty);
 for(const [name,status,body,nonJSON] of [
 ['equipment403 remains failure',403,{error:'FORBIDDEN'}],['equipment503 remains failure',503,{error:'UNAVAILABLE'}],
 ['equipment nonJSON200 remains failure',200,null,true],['equipment missing control',200,{}],
 ['equipment wrong schema',200,{control:{...empty.control,schemaVersion:2}}],
 ['equipment missing active pointer',200,{control:{schemaVersion:1,versions:[],issues:[],reservedMarks:{}}}],
 ['equipment broken active pointer',200,{control:{...empty.control,activeVersionId:'MISSING'}}],
 ['equipment versions object',200,{control:{...empty.control,versions:{}}}],['equipment versions null',200,{control:{...empty.control,versions:null}}],
 ['equipment draft-only is not effective',200,{control:{...empty.control,versions:[{id:'DRAFT',status:'draft'}]}}],
 ['equipment missing issues',200,{control:{schemaVersion:1,activeVersionId:null,versions:[],reservedMarks:{}}}],
 ['equipment reservedMarks array',200,{control:{...empty.control,reservedMarks:[]}}],['equipment206 cannot create empty success',206,empty]
 ])await equipment(name,status,body,true,nonJSON);
 await equipment('existing approved equipment preserved',200,approved);
 await test('forced equipment403 never returns cached empty success',async()=>{equipmentBox.reset();equipmentBox.fetch=async()=>({status:200,ok:true,json:async()=>copy(empty)});await equipmentBox.load();equipmentBox.fetch=async()=>({status:403,ok:false,json:async()=>({error:'FORBIDDEN'})});let refused=false;try{await equipmentBox.load({force:true});}catch{refused=true;}check(refused&&equipmentBox.state().equipmentLoadError!==null);});
 const box={Error,Map,mountSequence:0,console:{error(){}},isVi:()=>false,clone:copy,read:noStorage,localStorage:{getItem:noStorage,setItem:noStorage,removeItem:noStorage},sessionStorage:{getItem:noStorage,setItem:noStorage,removeItem:noStorage},window:{ProcessSync:{identity:{id:'TEST-ACTOR'},platformHeaders:()=>({'Content-Type':'application/json','x-test-header':'normal'})}}};
 // Match the real IIFE host and grant only explicit AB/equipment read cells.
 let dependencyCells={'ab.view':true,'equipment.view':true};
 box.host=box.window;box.window.hasPermission=key=>dependencyCells[key]===true;
 box.identity=()=>box.window.ProcessSync.identity;
 vm.createContext(box);
 const abSource=slice(source,'  let masterCatalogCache =','  function snapshotFromCanonical(');
 vm.runInContext(ownerSource+abSource+';this.load=loadMasterCatalog;this.catalogRead=catalog;this.reset=()=>{masterCatalogCache=null;masterCatalogActor="";masterCatalogSequence=0;};this.state=()=>({cache:masterCatalogCache,actor:masterCatalogActor});',box);
 const ab={permissions:{view:true},control:{activeVersionId:'AB-APPROVED-V3',versions:[{id:'AB-APPROVED-V3',status:'approved',snapshot:{products:[{code:'TEST-P',name:'TEST PRODUCT',category:'TEST-CATEGORY',line:'QA-R20'}],lines:[{code:'QA-R20',stages:[]}],categoryGroups:[{name:'TEST-CATEGORY',line:'QA-R20'}]}},{id:'AB-DRAFT-V4',status:'draft',snapshot:{products:[{code:'NEVER-DRAFT'}],lines:[],categoryGroups:[]}}]}};
 function reset(){box.reset();box.window.ProcessSync.identity={id:'TEST-ACTOR'};dependencyCells={'ab.view':true,'equipment.view':true};}
 function normalClient(read){box.window.createSharedDraftClient=options=>{check(options.endpoint==='/api/master/workflow?scope=AB&catalog=effective'&&options.actorId==='TEST-ACTOR'&&options.legacyArchive===true);check(options.headers()['x-test-header']==='normal');return{read,...Object.fromEntries(['command','begin','retryUnknown','resolveUnknown'].map(key=>[key,()=>{throw Error('WRITE_API_REFUSED');}]))};};}
 async function abCase(name,mutate,reject=false){await test(name,async()=>{reset();const reply=copy(ab);mutate?.(reply);normalClient(async()=>reply);let failed=false;try{await box.load();}catch{failed=true;}check(failed===reject);if(reject)check(box.state().cache===null);else{const result=box.catalogRead();check(result.comparisonReady===true&&!result.products.some(row=>row.code==='NEVER-DRAFT'));if(reply.control.versions[0].snapshot.products.length)check(result.products[0].code==='TEST-P'&&result.categories[0].name==='TEST-CATEGORY'&&result.products[0].line==='QA-R20');}});}
 for(const dependency of ['ab.view','equipment.view'])for(const mode of ['missing','false'])await test('AB dependency '+dependency+' '+mode+' refuses before any request without changing owner',async()=>{
  reset();if(mode==='missing')delete dependencyCells[dependency];else dependencyCells[dependency]=false;
  const owner=box.window.ProcessSync.identity,before=JSON.stringify(dependencyCells);let creates=0,reads=0,failure;
  box.window.createSharedDraftClient=()=>{creates++;return{read:async()=>{reads++;return copy(ab);}};};
  try{await box.load();}catch(error){failure=error;}
  check(failure instanceof Error&&/FQC 載入目錄需要 AB 與檢具查看權限/.test(failure.message));
  check(creates===0&&reads===0&&box.state().cache===null&&box.state().actor===''&&box.catalogRead().comparisonReady===false);
  check(box.window.ProcessSync.identity===owner&&JSON.stringify(dependencyCells)===before&&box.window.hasPermission('users.view')===false);
 });
 await abCase('effective AB approved snapshot instead of later draft',null);
 for(const [name,mutate] of [
 ['AB view denied',r=>r.permissions.view=false],['AB permissions missing',r=>delete r.permissions],['AB control missing',r=>delete r.control],
 ['AB null pointer',r=>r.control.activeVersionId=null],['AB broken pointer',r=>r.control.activeVersionId='MISSING'],
 ['AB pending never used',r=>{r.control.activeVersionId='AB-DRAFT-V4';r.control.versions[1].status='pending';}],
 ['AB duplicate active version',r=>r.control.versions.push(copy(r.control.versions[0]))],['AB malformed products',r=>r.control.versions[0].snapshot.products={}],
 ['AB malformed lines',r=>r.control.versions[0].snapshot.lines=null],['AB missing categories',r=>delete r.control.versions[0].snapshot.categoryGroups],['AB malformed versions',r=>r.control.versions={}]
 ])await abCase(name,mutate,true);
 for(const status of [403,503,'NON_JSON'])await test('AB client '+status+' failure does not become empty',async()=>{reset();normalClient(async()=>{throw Error('SYNTHETIC_FAILURE');});let failed=false;try{await box.load();}catch{failed=true;}check(failed&&box.state().cache===null);});
 await test('actor change during AB read refuses old projection',async()=>{reset();normalClient(async()=>{box.window.ProcessSync.identity={id:'OTHER-ACTOR'};return copy(ab);});let failed=false;try{await box.load();}catch{failed=true;}check(failed&&box.state().cache===null);});
 await test('unmounted AB read cannot adopt',async()=>{reset();normalClient(async()=>copy(ab));await box.load(()=>false);check(box.state().cache===null);});
 await abCase('real approved empty AB baseline remains comparisonReady',r=>{r.control.versions[0].snapshot={products:[],lines:[],categoryGroups:[]};});
 await test('later AB sequence wins without stale adoption',async()=>{reset();const pending=[];normalClient(()=>new Promise(resolve=>pending.push(resolve)));const first=box.load(),second=box.load();const newest=copy(ab);newest.control.versions[0].snapshot.products[0].code='NEWEST';pending[1](newest);await second;pending[0](copy(ab));let failed=false;try{await first;}catch{failed=true;}check(failed&&box.catalogRead().products[0].code==='NEWEST');});
 await test('AB failure clears prior RAM catalog and never marks empty ready',async()=>{reset();normalClient(async()=>copy(ab));await box.load();normalClient(async()=>{throw Error('SYNTHETIC_FAILURE');});let failed=false;try{await box.load();}catch{failed=true;}check(failed&&box.state().cache===null&&box.catalogRead().comparisonReady===false);});
 await test('actor no longer matches RAM catalog cannot view previous catalog',async()=>{reset();normalClient(async()=>copy(ab));await box.load();box.window.ProcessSync.identity={id:'OTHER-ACTOR'};check(box.catalogRead().comparisonReady===false);});
 await test('missing login cannot read AB',async()=>{reset();box.window.ProcessSync.identity=null;let failed=false;try{await box.load();}catch{failed=true;}check(failed&&box.state().cache===null);});
 console.log(JSON.stringify({format:'FQC_CATALOG_READ_REGRESSION_V1',status:'PASS_PURE_EXTRACTED_SOURCE_NOT_GUI',source:{bytes:Buffer.byteLength(source),sha256:crypto.createHash('sha256').update(source).digest('hex')},cases:results.length,tests:results,network:false,SDK:false,storageWrites:false,fileWrites:false}));
}catch{console.log(JSON.stringify({format:'FQC_CATALOG_READ_REGRESSION_V1',status:'FAIL_PURE_SOURCE',test:selectedTest,completed:results.length,network:false,SDK:false,fileWrites:false}));process.exitCode=1;}

/* Actual TypeScript adapter/kernel/integrity/IPQC, synthetic immutable values.
 * Optional exact before sources compare DTO/error ordering and work counts.
 * Counts are not native Worker/API/browser performance measurements. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),{webcrypto,createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..'),copy=structuredClone,hash=x=>createHash('sha256').update(x).digest('hex');
const candidate=fs.readFileSync(path.join(root,'lib/process-authoring-workflow.ts'),'utf8'),before=process.env.AUTHORING_CONTEXT_BASELINE?fs.readFileSync(process.env.AUTHORING_CONTEXT_BASELINE,'utf8'):null;
const ipqc=fs.readFileSync(path.join(root,'lib/process-ipqc.ts'),'utf8'),beforeIPQC=process.env.AUTHORING_IPQC_BASELINE?fs.readFileSync(process.env.AUTHORING_IPQC_BASELINE,'utf8'):ipqc;
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
function loader(adapterSource,ipqcSource){
 const cache=new Map(),stats={parses:{},stableCalls:0,stableCodeUnits:0,bomFactories:0,bomReads:0};let tracked={};
 const measuredJSON={...JSON,stringify:JSON.stringify,parse(input,...args){for(const [key,value]of Object.entries(tracked))if(input===value){stats.parses[key]=(stats.parses[key]||0)+1;break;}return JSON.parse(input,...args);}};
 function load(file){file=path.resolve(root,file);if(cache.has(file))return cache.get(file);const mod={exports:{}};cache.set(file,mod.exports);
  let raw=file===path.join(root,'lib/process-authoring-workflow.ts')?adapterSource:file===path.join(root,'lib/process-ipqc.ts')?ipqcSource:fs.readFileSync(file,'utf8');
  if(file===path.join(root,'lib/process-authoring-workflow.ts')){
   const factory='export function bomRootReader(values:Record<string,string>){',lookup='return(code:string)=>{';
   assert.equal(raw.split(factory).length,2);assert.equal(raw.split(lookup).length,2);
   raw=raw.replace(factory,factory+'probe.bomFactories++;').replace(lookup,lookup+'probe.bomReads++;');
  }
  const code=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{module:mod,exports:mod.exports,require(id){if(id==='cloudflare:workers')return{env:{}};if(id.startsWith('node:'))return require(id);const target=id.startsWith('@/')?path.join(root,id.slice(2)):path.resolve(path.dirname(file),id);if(target.endsWith('.json'))return JSON.parse(fs.readFileSync(target,'utf8'));return target.endsWith('.mjs')?require(target):load(target.endsWith('.ts')?target:target+'.ts');},Request,Response,ReadableStream,Headers,URL,crypto:webcrypto,Date,TextEncoder,TextDecoder,atob,btoa,structuredClone,console,JSON:measuredJSON,probe:stats});
  if(file===path.join(root,'lib/shared-draft.ts')){const original=mod.exports.stableDraftJSON;mod.exports.stableDraftJSON=value=>{stats.stableCalls++;const result=original(value);stats.stableCodeUnits+=result?.length||0;return result;};}
  return mod.exports;
 }
 const domain=load('lib/process-authoring-workflow.ts'),kernel=load('lib/shared-draft.ts');
 return{domain,kernel,stats,run(f,method){tracked=f.values;stats.parses={};stats.stableCalls=stats.stableCodeUnits=stats.bomFactories=stats.bomReads=0;const original=JSON.stringify(f);let result;
  try{const adapter=domain.processAuthoringAdapter(),context=adapter.context(f.control,{revision:1,values:f.values},{actor:{id:'fixture-admin',name:'Synthetic',admin:f.admin!==false},at:'synthetic',id:()=> 'synthetic-new',allowed:()=>true});
   if(method==='validate')result={status:'PASS',issues:context.validate(f.next)};
   else if(method==='structure')result={status:'PASS',result:context.structure(f.next,f.previous)};
   else{context.structure(f.next,f.previous);result={status:'PASS',previous:context.validate(f.previous),next:context.validate(f.next)};}
  }catch(error){result={status:'ERROR',name:error.name,code:error.code||null,message:error.message,details:error.details===undefined?null:JSON.parse(JSON.stringify(error.details))};}
  assert.equal(JSON.stringify(f),original,'context must not mutate input');tracked={};return{result:JSON.parse(JSON.stringify(result)),counts:copy(stats)};
 }};
}
function fixture(){
 const photos='data:image/png;base64,'+'A'.repeat(16384),products=[],lines=[],workspaces=[],abErrors=[],abItems=[],cErrors=[],cItems=[];
 for(const line of ['A','C']){
  const stage=line+'-CUT',category='SYN',product=line+'-P';products.push({code:product,line,category,stages:[stage]});lines.push({code:line,stages:[{code:stage}]});
  const ops=Array.from({length:4},(_,n)=>({id:line+'-'+n,number:line+'-'+n,name:'Synthetic '+n,stageCode:stage,editorType:n===0?'entry':n===3?'exit':'manual',mode:'human',productCodes:n===0||n===3?[]:[product],nextIds:n<3?[line+'-'+(n+1)]:[],machineIds:[],instructionSteps:[{text:'Synthetic',standard:'Synthetic'}],mediaItems:[{src:photos}],bomSelections:n===1?{[product]:['PART-'+line]}:{}}));
  const assignment={source:line==='C'?'C':'AB',scope:line==='C'?'C':'A:SYN',itemId:line+'-ITEM',sourceVersionId:line+'-APPROVED',productCodes:[product]};ops[1].ipqcAssignments=[assignment];
  workspaces.push({id:JSON.stringify([category,line]),category,line,stages:{[stage]:ops}});
  if(line==='A'){abErrors.push({id:'A-ERR',code:'A-ERR',name:'Synthetic error',line,group:category,stageCode:stage});abItems.push({id:'A-ITEM',code:'A-ITEM',errorId:'A-ERR',isEnabled:true,productCodes:[product],standard:'Synthetic',methodText:'Synthetic',rules:[],standardPhotos:[],methodPhotos:[]});}
  else{cErrors.push({id:'C-ERR',code:'C-ERR',name:'Synthetic error',stageCode:stage,productCode:product});cItems.push({id:'C-ITEM',code:'C-ITEM',errorId:'C-ERR',stageCode:stage,productCode:product,standardEnabled:true,standard:'Synthetic',description:'Synthetic',mediaItems:[]});}
 }
 const master={active:{AB:{products:products.filter(p=>p.line==='A'),lines:lines.filter(l=>l.code==='A')},C:{products:products.filter(p=>p.line==='C'),lines:lines.filter(l=>l.code==='C')},PROCESS:{'A-CUT':[{id:'master',mediaItems:[{src:photos}]}],'C-CUT':[]}}};
 const previous={workspaces},next=copy(previous);next.workspaces[0].stages['A-CUT'][1].name='Edited synthetic';
 const values={platformUsers:JSON.stringify([{id:'fixture-admin',role:'admin',enabled:true}]),masterDataControl:JSON.stringify(master),bomOverrides:JSON.stringify({replaceAll:true,data:{'A-P':[{level:1,itemCode:'PART-A'}],'C-P':[{level:1,itemCode:'PART-C'}]}}),ipqcABMasterControl:JSON.stringify({scopes:{'A:SYN':{activeVersionId:'A-APPROVED',versions:[{id:'A-APPROVED',status:'approved',snapshot:{items:abItems,errors:abErrors}}]}}}),ipqcCMasterControl:JSON.stringify({activeVersionId:'C-APPROVED',versions:[{id:'C-APPROVED',status:'approved',snapshot:{items:cItems,errors:cErrors}}]})};
 return{values,previous,next,control:{activeVersionId:'active',versions:[],workflow:{working:previous}},admin:true};
}
const current=loader(candidate,ipqc),baseline=before?loader(before,beforeIPQC):null,rows=[];
function check(name,modify,method='combined',expected='PASS'){
 const f=fixture();modify?.(f);freeze(f);const after=current.run(f,method),prior=baseline?.run(f,method);
 assert.equal(after.result.status,expected,name);if(prior)assert.deepEqual(after.result,prior.result,name+' exact DTO/error order');rows.push({name,method,before:prior,after});return{after,prior};
}
const normal=check('normal two-workspace changed content and inspections');
check('position-only apply retains unchanged historical IPQC',f=>{f.next=copy(f.previous);f.next.workspaces[0].stages['A-CUT'][1].x=100;},'structure');
check('same JSON content reordered keys is unchanged',f=>{f.next=JSON.parse(JSON.stringify(f.previous),(_key,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).reverse()):value);},'structure');
check('nonadmin line restrictions preserved',f=>{f.admin=false;f.values.platformUsers=JSON.stringify([{id:'fixture-admin',role:'staff',enabled:true}]);f.next.workspaces[0].line='Z';f.next.workspaces[0].id=JSON.stringify(['SYN','Z']);},'structure','ERROR');
check('invalid scope fails before corrupt BOM',f=>{f.next.workspaces[0].id='wrong';f.values.bomOverrides='{bad';},'structure','ERROR');
check('invalid operation fails before corrupt BOM',f=>{f.next.workspaces[0].stages['A-CUT'][1].productCodes='wrong';f.values.bomOverrides='{bad';},'structure','ERROR');
check('empty validation still requires complete BOM',f=>{f.next.workspaces=[];f.values.bomOverrides='{bad';},'validate','ERROR');
check('corrupt BOM exact original failure boundary',f=>f.values.bomOverrides='{bad','combined','ERROR');
check('corrupt master fails before BOM',f=>{f.values.masterDataControl='{bad';f.values.bomOverrides='{bad';},'combined','ERROR');
check('duplicate BOM root normalized first match remains authoritative',f=>{const b=JSON.parse(f.values.bomOverrides);b.data={' a-p ':b.data['A-P'],'A-P':[{level:1,itemCode:'WRONG'}],'C-P':b.data['C-P']};f.values.bomOverrides=JSON.stringify(b);});
check('BOM fallback to longest matching branch preserves order',f=>{f.values.bomOverrides=JSON.stringify({replaceAll:true,data:{ROOT:[{level:1,itemCode:'A-P'},{level:2,itemCode:'PART-A'},{level:1,itemCode:'C-P'},{level:2,itemCode:'PART-C'}]}});});
check('new invalid IPQC assignment remains rejected',f=>f.next.workspaces[0].stages['A-CUT'][1].ipqcAssignments[0].sourceVersionId='wrong','structure','ERROR');
check('unchanged malformed IPQC source retains original advisory failure',f=>f.values.ipqcABMasterControl='{bad','validate','ERROR');
check('mutually occupied IPQC retains rejection',f=>f.next.workspaces[0].stages['A-CUT'][2].ipqcAssignments=copy(f.next.workspaces[0].stages['A-CUT'][1].ipqcAssignments),'structure','ERROR');
check('new BOM double allocation remains rejected',f=>f.next.workspaces[0].stages['A-CUT'][2].bomSelections=copy(f.next.workspaces[0].stages['A-CUT'][1].bomSelections),'structure','ERROR');
check('missing machine source still produces original advisory',f=>{const op=f.next.workspaces[0].stages['A-CUT'][1];op.editorType='machine';op.mode='machine';op.machineIds=['missing'];},'validate');
if(baseline){assert(normal.after.counts.parses.masterDataControl<normal.prior.counts.parses.masterDataControl,'reuse already parsed master');assert(normal.after.counts.bomFactories<normal.prior.counts.bomFactories,'one BOM reader per context');assert(normal.after.counts.bomReads<normal.prior.counts.bomReads,'memoize repeated normalized product lookup');assert(normal.after.counts.stableCodeUnits<normal.prior.counts.stableCodeUnits,'no whole authoring snapshot canonical string allocation');}
// A second call has a different context; no previous dependency result survives.
check('separate context sees changed dependency',f=>{const b=JSON.parse(f.values.bomOverrides);b.data['A-P']=[];f.values.bomOverrides=JSON.stringify(b);},'validate');
const report={status:'PASS',cases:rows.length,paired:!!baseline,sourceHashes:{candidate:hash(candidate),ipqc:hash(ipqc),...(before?{before:hash(before),beforeIPQC:hash(beforeIPQC)}:{})},rows,limits:['Actual adapter/kernel/domain code with synthetic immutable JSON; not real route authentication, D1/R2, native Worker or browser timing.','Counters are separate work evidence and must not be reported as CPU or end-to-end speed.','Optional exact before sources required for paired result/error/count comparison.']};
const out=process.env.AUTHORING_CONTEXT_REPORT||'.sites-runtime/process-platform-round5/authoring-context.json';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases,paired:report.paired,normalCounts:{before:normal.prior?.counts,after:normal.after.counts},output:out}));

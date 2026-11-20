/* Source-bound pure validation parity and call counts. No server, browser or timing claim. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=process.cwd(),loaderFile=path.join(root,'scripts/ipqc-ab-import-harness.cjs'),loaderRequire=createRequire(loaderFile),loaderText=fs.readFileSync(loaderFile,'utf8');
assert(loaderText.includes("fs.readFileSync(file,'utf8')"));assert(loaderText.includes('{module:mod,exports:mod.exports'));
const factory=vm.runInThisContext('(function(module,exports,require,overrides,probe){'+loaderText.replace("fs.readFileSync(file,'utf8')","(overrides.get(file)??fs.readFileSync(file,'utf8'))").replace('{module:mod,exports:mod.exports','{__probe:probe,module:mod,exports:mod.exports')+'\n})');
function replaceOnce(source,needle,replacement) {
  const parts=source.split(needle);
  assert.equal(parts.length,2,'expected one IQC validation anchor: '+needle);
  return parts.join(replacement);
}
function arm(candidate) {
  const probe={calls:0},overrides=new Map();
  const file=path.join(root,'lib/iqc.ts');
  let text=fs.readFileSync(file,'utf8');
  if(!candidate) {
    const fresh='const errors=iqcSubmitErrors(content,approved),blocked=new Set(iqcSubmitBlockingErrors(content,errors,approved));return [';
    text=replaceOnce(text,fresh,'const blocked=new Set(iqcSubmitBlockingErrors(content,undefined,approved));return [');
    text=replaceOnce(text,'...errors.map(message=>{','...iqcSubmitErrors(content,approved).map(message=>{');
  }
  const signature='export function iqcSubmitErrors(snapshot: IqcSnapshot, approved?: IqcSnapshot): string[] {';
  text=replaceOnce(text,signature,signature+'(globalThis as unknown as {__probe:{calls:number}}).__probe.calls++;');
  overrides.set(file,text);
  const mod={exports:{}};
  factory(mod,mod.exports,loaderRequire,overrides,probe);
  const load=mod.exports(),iqc=load('lib/iqc.ts'),adapter=load('lib/iqc-workflow.ts').iqcWorkflowAdapter;
  const equipment={activeVersionId:'active',versions:[{id:'active',status:'approved',equipment:[{id:'good',enabled:true},{id:'off',enabled:false}]}]};
  return {probe,iqc,validate(snapshot,approved) {
    const control=iqc.emptyIqcControl();
    if(approved) {
      control.activeVersionId='approved-fixture';
      control.versions.push({id:control.activeVersionId,status:'approved',snapshot:approved});
    }
    const context=adapter.context(control,{values:{routineEquipmentControl:JSON.stringify(equipment)}},{});
    probe.calls=0;
    const output=context.validate(snapshot);
    return {output:structuredClone(output),calls:probe.calls};
  }};
}
function seed(n=3){return{categories:[{id:'c',nameVi:'Category'}],suppliers:[{id:'s',nameVi:'Supplier'}],parts:Array.from({length:n},(_,i)=>({id:'p'+i,code:'P'+i,nameVi:'Part '+i,categoryId:'c',supplierIds:['s'],photos:[]})),errors:Array.from({length:n},(_,i)=>({id:'e'+i,code:'E'+i,partCode:'P'+i,nameVi:'Error '+i})),items:Array.from({length:n},(_,i)=>({id:'i'+i,checkNo:'CHECK'+i,partCode:'P'+i,errorId:'e'+i,nameVi:'Check '+i,rules:[{id:'r'+i,cadence:'batch',kind:'fixed_count',value:'5'}],isEnabled:true,equipmentId:''}))};}
const cases=[];function add(name,change,n=3){const data=seed(n);change(data);cases.push({name,data});}
add('valid',()=>{});add('missing content',d=>{d.parts[0].nameVi='';d.parts[1].categoryId='';d.items[0].rules=[];d.items[1].nameVi='';});add('bad category and equipment',d=>{d.parts[0].categoryId='unknown';d.items[0].equipmentId='missing';d.items[1].equipmentId='off';d.items[2].equipmentId='good';});
for(const [cadence,kind,value,nameVi] of [['batch','fixed_count','x',''],['batch','custom','4',''],['batch','bad','2',''],['time','custom','x',''],['time','bad','',''],['source','source','','']])add('rule '+[cadence,kind,value].join('/'),d=>{d.items[0].rules=[{id:'r',cadence,kind,value,nameVi}];});
add('duplicate messages retain order',d=>{d.items[1].checkNo=d.items[0].checkNo;d.items[0].rules=[];d.items[1].rules=[];d.items[2].nameVi='';});add('deleted rows',d=>{d.parts[0].isDeleted=true;d.parts[0].categoryId='bad';d.items[0].isDeleted=true;d.items[0].rules=[];});add('prefix ambiguous codes preserve first match',d=>{d.items[0].checkNo='A';d.items[1].checkNo='A B';d.items[1].rules=[];});add('large valid',()=>{},5000);add('large missing rules',d=>{for(const item of d.items)item.rules=[];},5000);
const approved=seed();
approved.items[0].rules=[{id:'legacy-batch',cadence:'batch',kind:'all',value:'1'}];
const carried=structuredClone(approved),edited=structuredClone(approved);
edited.items[0].rules[0].nameVi='Edited legacy rule';
const legacyIssue={kind:'error',path:['items',{id:'i0'},'rules'],message:'CHECK0 按批次規則缺少有效數值或自訂名稱'};
cases.push(
  {name:'approved legacy batch rule is accepted unchanged',data:carried,approved,expected:[]},
  {name:'same legacy batch rule without an approved source is invalid',data:carried,expected:[legacyIssue]},
  {name:'edited legacy batch rule is invalid',data:edited,approved,expected:[legacyIssue]}
);
const baseline=arm(false),candidate=arm(true),results=[];
for(const {name,data,approved,expected} of cases) {
  const before=structuredClone(data),beforeApproved=structuredClone(approved);
  const a=baseline.validate(data,approved),b=candidate.validate(data,approved);
  assert.deepEqual(b.output,a.output,name);
  if(expected)assert.deepEqual(b.output,expected,name+' expected full result');
  assert.deepEqual(data,before,name+' mutation');
  assert.deepEqual(approved,beforeApproved,name+' approved snapshot mutation');
  assert.equal(a.calls,2,name+' original scans');
  assert.equal(b.calls,1,name+' candidate scans');
  candidate.probe.calls=0;
  const defaultBlocking=candidate.iqc.iqcSubmitBlockingErrors(data,undefined,approved);
  assert.equal(candidate.probe.calls,1,'default helper still computes');
  baseline.probe.calls=0;
  assert.deepEqual(structuredClone(defaultBlocking),structuredClone(baseline.iqc.iqcSubmitBlockingErrors(data,undefined,approved)));
  assert.equal(baseline.probe.calls,1,'baseline default helper still computes');
  results.push({name,issues:a.output.length,baselineCalls:a.calls,candidateCalls:b.calls});
}
console.log(JSON.stringify({status:'PASS',checks:results.length,results,scope:'pure actual adapter validation + helper, same complete issues/order/duplicates/equipment policy; not full Submit timing'},null,2));

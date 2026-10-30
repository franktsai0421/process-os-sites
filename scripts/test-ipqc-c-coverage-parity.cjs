// Semantic parity and non-mutation regression; no wall-time threshold in CI.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{performance:_performance}=require('node:perf_hooks');
// Frozen pre-optimization semantic oracle.
const base="const coverageIssues=()=>version()?.status==='draft'?catalog.products.flatMap(p=>(p.stages||[]).filter(stage=>!(snapshot()?.items||[]).some(i=>!i.deleted&&i.standardEnabled&&!i.notApplicable&&i.productCode===p.code&&i.stageCode===stage)).map(stage=>({product:p.code,stage}))):[];\n  const photoUrl";
const path=require('node:path'),root=process.env.IPQCC_READ_SOURCE||path.resolve(__dirname,'..');
const candidate=fs.readFileSync(path.join(root,'public/process/ipqc-c.js'),'utf8');
const extract=s=>s.slice(s.indexOf('const coverageIssues='),s.indexOf('  const photoUrl',s.indexOf('const coverageIssues=')));
function load(source,data){const context={catalog:data.catalog,version:()=>data.version,snapshot:()=>data.snapshot};vm.createContext(context);vm.runInContext(extract(source)+'\nthis.run=coverageIssues;',context);return context.run;}
const results=[],parity=[];
const check=(name,data)=>{const before=load(base,data),after=load(candidate,data);const original=structuredClone(data);const expected=structuredClone(before());assert.deepStrictEqual(data,original,name+' baseline input retained');const actual=structuredClone(after());assert.deepStrictEqual(actual,expected,name);assert.deepStrictEqual(data,original,name+' candidate input retained');parity.push(name);return{before,after};};
check('non-draft',{catalog:{products:[]},version:{status:'approved'},snapshot:{items:[]}});
const data={catalog:{products:[{code:'C1',stages:['S1','S1','S2']},{code:'C2',stages:[]},{code:'C|S',stages:['1']},{code:'C',stages:['S|1']},{code:'空白',stages:['測試']}]},version:{status:'draft'},snapshot:{items:[{productCode:'C1',stageCode:'S1',standardEnabled:true},{productCode:'C1',stageCode:'S2',standardEnabled:true,deleted:true},{productCode:'C|S',stageCode:'1',standardEnabled:true},{productCode:'空白',stageCode:'測試',standardEnabled:true,notApplicable:true}]}};
const pair=check('duplicates-empty-route-delimiter-unicode-deleted-inapplicable',data);
data.snapshot.items[0].standardEnabled=false;{const original=structuredClone(data);assert.deepStrictEqual(structuredClone(pair.after()),structuredClone(pair.before()));assert.deepStrictEqual(data,original);}parity.push('mutated-same-array-no-stale-index');
data.snapshot={items:[{productCode:'C1',stageCode:'S2',standardEnabled:true}]};{const original=structuredClone(data);assert.deepStrictEqual(structuredClone(pair.after()),structuredClone(pair.before()));assert.deepStrictEqual(data,original);}parity.push('replaced-snapshot-no-stale-index');
for(const [name,code,stage] of [['NaN-product',NaN,'s'],['NaN-stage','p',NaN],['null-product',null,'s'],['numeric-product',1,'s'],['undefined-product',undefined,'s'],['undefined-stage','p',undefined]])check(name,{catalog:{products:[{code,stages:[stage]}]},version:{status:'draft'},snapshot:{items:[{productCode:code,stageCode:stage,standardEnabled:true}]}});
for(const n of [100,500,1000]){
 const products=Array.from({length:n},(_,i)=>({code:'C'+i,stages:['C-CUT','C-PACK','C-END']}));
 const items=products.flatMap(p=>p.stages.map(stageCode=>({productCode:p.code,stageCode,standardEnabled:true,notApplicable:false,deleted:false})));
 const _pair=check('complete-'+n,{catalog:{products},version:{status:'draft'},snapshot:{items}});

}
console.log(JSON.stringify({parity,results,limits:'CPU extracted functions only; no DOM, request, DB, live or browser evidence'},null,2));

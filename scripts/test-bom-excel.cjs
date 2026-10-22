/* oxlint-disable typescript/no-require-imports -- VM regression fixture uses the existing CommonJS test runtime. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const sandbox={document:{documentElement:{lang:'zh-Hant'}}};sandbox.window=sandbox;vm.createContext(sandbox);
for(const f of ['vendor/xlsx.full.min.js','data/imported-data.js','bom-excel.js'])vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),sandbox,{filename:f});
const api=sandbox.BOMExcel;
const bom={P:[{level:0,itemCode:'',itemName:'Product',custom:'保留'},{level:1,itemCode:'C',itemName:'Component',quantity:'0,014',unit:'KG'},{level:2,itemCode:'R',itemName:'Raw',quantity:0,unit:'KG'},{level:1,itemCode:'S',itemName:'Sibling'}]};
const matrix=api.exportRows(bom);let parsed=api.parseRows(matrix);
assert.equal(parsed.P.length,4);assert.equal(parsed.P[0].custom,'保留');assert.equal(parsed.P[1].quantity,'0,014');assert.equal(parsed.P[2].quantity,'0');
assert.throws(()=>api.parseRows([matrix[0],['P',1,'C','Component']]),/L0/);
assert.throws(()=>api.parseRows([matrix[0],matrix[1],['P',2,'C','Component']]),/層級跳號/);
assert.throws(()=>api.parseRows([matrix[0],matrix[1],matrix[1]]),/重複/);
assert.throws(()=>api.parseRows([matrix[0],['P',0,'DIFFERENT','Product']]),/L0/);
assert.throws(()=>api.parseRows([matrix[0],['__proto__',0,'','Product']]),/無效/);
assert.throws(()=>api.parseRows([matrix[0],matrix[1],['P',1,'','Missing']]),/缺少/);
assert.throws(()=>api.parseRows([['wrong']]));
const bytes=sandbox.XLSX.write(api.workbook(bom),{type:'array',bookType:'xlsx'}),book=sandbox.XLSX.read(bytes,{type:'array'});
assert.equal(api.workbookInfo(book).complete,true);
parsed=api.parseRows(sandbox.XLSX.utils.sheet_to_json(book.Sheets.BOM,{header:1,defval:'',raw:true}));assert.equal(parsed.P.length,4);assert.equal(parsed.P[1].quantity,'0,014');
const data=vm.runInContext('IMPORTED_DATA',sandbox),all=api.parseRows(api.exportRows(data.bom));
assert.equal(Object.keys(all).length,Object.keys(data.bom).length);assert.equal(Object.values(all).reduce((s,r)=>s+r.length,0),Object.values(data.bom).reduce((s,r)=>s+r.length,0));
sandbox.document.documentElement.lang='vi';assert.match(api.toolbar(),/Nhập Excel/);assert.match(api.toolbar(),/Xuất toàn bộ Excel/);
assert.doesNotMatch(api.toolbar(),/bom-excel-current|bom-excel-template/);
for(const saved of [{B:[{level:0,itemCode:'B'},{level:1,itemCode:'C'}],EMPTY:[]},{replaceAll:true,data:{B:[{level:0,itemCode:'B'},{level:1,itemCode:'C'}],EMPTY:[]}}]){
 const context={data:{bom:{A:[{level:0,itemCode:'A'}]},meta:{bomProductCount:99,bomRowCount:999}},readStore:()=>saved};
 context.window=context;vm.createContext(context);
 vm.runInContext(fs.readFileSync(path.join(base,'bom-excel.js'),'utf8'),context);
 assert.equal(context.data.meta.bomProductCount,saved.replaceAll?1:2,'count effective nonempty roots after persisted override');
 assert.equal(context.data.meta.bomRowCount,saved.replaceAll?2:3,'count effective rows after persisted override');
}
// Same active-only read projection is reusable after authenticated hydration.
let persisted={},reads=0;const active={ROOT:[{level:0,itemCode:'',quantity:''},{level:1,itemCode:'PART',quantity:'0,014',waste:0}],EMPTY:[]},originalActive=JSON.stringify(active),working={bom:{UNSAVED:[{quantity:'do not replace'}]}},originalWorking=JSON.stringify(working),projection={data:{bom:{STATIC:[{quantity:'1'}]},meta:{}},readStore:(key,fallback)=>{assert.equal(key,'bomOverrides');reads++;return persisted??fallback;},localStorage:{setItem(){throw Error('projection must not write storage');}},fetch(){throw Error('projection must not fetch');},BOMWorkspace:new Proxy({},{get(){throw Error('projection must not touch editor');}}),working};projection.window=projection;vm.createContext(projection);vm.runInContext(fs.readFileSync(path.join(base,'bom-excel.js'),'utf8'),projection);
const bomIdentity=projection.data.bom;assert.equal(projection.data.meta.bomProductCount,1);persisted={replaceAll:true,data:active};projection.BOMExcel.refreshProjection();assert.equal(projection.data.bom,bomIdentity);assert.equal(projection.data.meta.bomProductCount,1);assert.equal(projection.data.meta.bomRowCount,2);assert.equal(projection.data.bom.STATIC,undefined);assert.equal(projection.data.bom.ROOT[1].quantity,'0,014');assert.equal(projection.data.bom.ROOT[1].waste,0);assert.equal(projection.data.bom.ROOT[0].quantity,'');assert.equal(JSON.stringify(active),originalActive);assert.equal(JSON.stringify(working),originalWorking);
const beforeMissing=JSON.stringify(projection.data.bom);persisted=null;projection.BOMExcel.refreshProjection();assert.equal(JSON.stringify(projection.data.bom),beforeMissing,'missing override keeps existing fallback projection');persisted={LEGACY:[{quantity:'0'}]};projection.BOMExcel.refreshProjection();assert.equal(projection.data.meta.bomProductCount,2);assert.equal(projection.data.meta.bomRowCount,3);assert.equal(projection.data.bom.ROOT,active.ROOT,'legacy overrides merge without clearing other roots');persisted={replaceAll:true,data:{}};projection.BOMExcel.refreshProjection();assert.equal(Object.keys(projection.data.bom).length,0,'valid empty replacement clears old imported roots');assert.equal(projection.data.meta.bomProductCount,0);assert.equal(projection.data.meta.bomRowCount,0);assert.equal(reads,5);assert.equal(JSON.stringify(working),originalWorking);
for(const context of [{},{data:{bom:{KEEP:[]},meta:{}}}]){context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(base,'bom-excel.js'),'utf8'),context);assert.doesNotThrow(()=>context.BOMExcel.refreshProjection(),'missing data/readStore remains optional');}
console.log('PASS: real XLSX roundtrip, complete source roundtrip, decimal and zero preservation, invalid headers/levels/root/code rejected, bilingual toolbar; actual reusable active BOM projection/late hydration/empty replaceAll/legacy/missing fallback preserves editor, values and object identity with no IO.');

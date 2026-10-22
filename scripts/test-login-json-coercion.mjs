import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';
const source=process.env.ACTUAL_SOURCE||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const loadNode=createRequire(pathToFileURL(path.join(source,'package.json')));
const ts=loadNode('typescript'),input=fs.readFileSync(path.join(source,'lib/legacy-login-json.ts'),'utf8');
const compiled=ts.transpileModule(input,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const fixture={exports:{}};
vm.runInNewContext(compiled,{module:fixture,exports:fixture.exports});
const {legacyJsonLoginText}=fixture.exports;
const json=['null','false','true','0','-0','1','-1','1e400','-1e400','0.25','""','" ADMIN "','"\u0061"','"密碼"','"\\n"','[]','[null]','[false]','[0]','[false,0,null]','[[]]','[[],[null]]','[[1,2],[3]]','[{},null]','{"id":1}','{}','{"toString":null}','{"toString":""}','{"toString":3}','{"toString":{}}','{"valueOf":null}','{"valueOf":3}','{"valueOf":{}}','{"toString":null,"valueOf":3}','{"__proto__":{"toString":null}}','[{"toString":null}]','[{"valueOf":3}]','[[{"toString":null}]]','["a",null,"b"]','[[false,0],null,["x"]]','{"constructor":"test"}','"\\ud800"','" false "','["",false,true,0,1]','[null,[null],{}]','{"toString":[],"valueOf":null}'];
const cases=[undefined,...json.map(text=>JSON.parse(text))];assert.ok(cases.length<=50);
const outcome=fn=>{try{return{kind:'value',value:fn()}}catch(error){return{kind:'throw',name:error.name,message:error.message}}};
let throws=0;for(const [index,value]of cases.entries()){const original=outcome(()=>String(value||'')),proposal=outcome(()=>legacyJsonLoginText(value));assert.deepEqual(proposal,original,'JSON coercion mismatch at case '+index);if(original.kind==='throw')throws++;}
const report={status:'PASS',cases:cases.length,throws,productionHelper:'lib/legacy-login-json.ts',scope:'Actual TS helper transpiled and invoked in memory; pure JSON values, no handlers/DB/HTTP/browser/services or filesystem writes',limits:'JSON.parse ordinary Object/Array prototype assumption; does not claim exotic prototype mutation compatibility.'};
console.log(JSON.stringify(report));

/* Fixed baseline equivalence, no timing threshold, network or live data. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
process.chdir(path.resolve(__dirname,'..'));
const raw=execFileSync('git',['show','2cac307f29b8017a2bb6dc5229d47720f2deab33:public/process/ipqc-ab.js']);
assert.equal(createHash('sha256').update(raw).digest('hex'),'640d6a2f308edd3b2dc4ef1eab6c736a141ee3e581ff30d1b3c6c2dcda2e5c55');
const ts=require('typescript');
const source=fs.readFileSync('public/process/ipqc-ab.js','utf8');
function fn(s){const ast=ts.createSourceFile('ipqc-ab.js',s,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),found=[];assert.equal(ast.parseDiagnostics.length,0,'valid source syntax');function walk(n){if(ts.isFunctionDeclaration(n)&&n.name?.text==='changes')found.push(n.getText(ast));ts.forEachChild(n,walk);}walk(ast);assert.equal(found.length,1,'one exact changes function');return vm.runInNewContext('('+found[0]+')');}
assert.throws(()=>fn(source.replace('function changes(', 'function missingChanges(')),/one exact/);assert.throws(()=>fn(source+'\nfunction changes(){}'),/one exact/);assert.throws(()=>fn(source+'\nlet = ;'),/valid source syntax/);
const before=fn(raw.toString()),after=fn(source);
const cases=[{errors:[],items:[]},{errors:[{id:'x',name:'first'},{id:'x',name:'second'}],items:[{id:NaN,a:1},{id:undefined,a:2},{id:'__proto__',a:3},{id:1,a:4},{id:false,a:5}]},{errors:[{id:'e',name:'e'}],items:[{id:'i',standard:'old',equipmentSnapshot:{id:'eq'},rules:[{id:'r',value:'1'}],productCodes:['P'],deleted:false}]}];
for(const original of cases){const next=structuredClone(original);for(const row of [...next.errors,...next.items]){row.name='new';row.equipmentSnapshot={id:'other'};}next.items.push({id:'new',name:'ignore'});const prior=structuredClone(original),incoming=structuredClone(next);assert.deepEqual(structuredClone(before(original,next)),structuredClone(after(original,next)));assert.deepEqual(original,prior);assert.deepEqual(next,incoming);}
for(const malformed of [{errors:null,items:[]},{errors:[],items:[null]}]){const outcome=f=>{try{f(malformed,malformed);return 'no error';}catch(e){return e.name;}};assert.equal(outcome(before),outcome(after));assert.notEqual(outcome(before),'no error');}
console.log(JSON.stringify({status:'PASS_CHANGES_EQUIVALENCE',semanticCases:cases.length,malformedCases:2,inputEquality:'structuredClone plus strict deepEqual',limits:'Synthetic algorithm semantics only; no wall-time assertion.'}));

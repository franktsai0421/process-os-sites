/* Pure proposed AB choices lookup equivalence; no production change or caching. */
const assert=require('node:assert/strict');
const key=a=>JSON.stringify([a.source,a.scope,a.itemId]);
function baseline(choices,assigned){let comparisons=0;const stale=assigned.filter(a=>{const c=choices.find(c=>{comparisons++;return key(c)===key(a);});return !c||c.sourceVersionId!==a.sourceVersionId||JSON.stringify([...a.productCodes].sort((a,b)=>a.localeCompare(b)))!==JSON.stringify([...c.productCodes].sort((a,b)=>a.localeCompare(b)));});return{stale,comparisons};}
function indexed(choices,assigned){let comparisons=0;const byKey=new Map();for(const c of choices){comparisons++;const k=key(c);if(!byKey.has(k))byKey.set(k,c);}const stale=assigned.filter(a=>{comparisons++;const c=byKey.get(key(a));return !c||c.sourceVersionId!==a.sourceVersionId||JSON.stringify([...a.productCodes].sort((a,b)=>a.localeCompare(b)))!==JSON.stringify([...c.productCodes].sort((a,b)=>a.localeCompare(b)));});return{stale,comparisons,byKey};}
const results=[];
for(const n of [10,100,1000]){const choices=Array.from({length:n},(_,i)=>({source:'AB',scope:'A',itemId:'item'+i,sourceVersionId:'v1',productCodes:['產品甲','P2']})),assigned=structuredClone(choices);assigned[0].sourceVersionId='old';assigned[1].productCodes=['different'];assigned[2].productCodes.reverse();assigned.push({...assigned[0],itemId:'missing'});choices.push({...choices[0],sourceVersionId:'duplicate-must-not-win'});const old=baseline(choices,assigned),next=indexed(choices,assigned);assert.deepEqual(next.stale,old.stale);for(const c of choices)assert.equal(next.byKey.get(key(c)),choices.find(x=>key(x)===key(c)));results.push({choices:choices.length,assigned:assigned.length,oldLookupVisits:old.comparisons,indexVisits:next.comparisons,stale:next.stale.length});}
console.log(JSON.stringify({status:'PASS',meaning:'lookup count only, not network or browser performance',results},null,2));
for(const ids of [[null,undefined,NaN,Infinity,-Infinity],[0,-0,'0',false,true],[{},[],['x'],{id:'x'}]]){const choices=ids.map((itemId,i)=>({source:'AB',scope:'A',itemId,sourceVersionId:'v'+i,productCodes:['a','b']})),assigned=structuredClone(choices),old=baseline(choices,assigned),next=indexed(choices,assigned);assert.deepEqual(next.stale,old.stale);for(const a of assigned)assert.deepEqual(next.byKey.get(key(a)),choices.find(c=>key(c)===key(a)));}
console.log('non-string/NaN JSON-tuple collision and first-match equivalence PASS');
// Source-bound differential: execute the actual per-response setup/stale and
// checkbox lookup expressions, without DOM/network or extracting new authority.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const baselineFile=path.join(__dirname,'fixtures/process-ipqc.pre-fourth.js');
function sourceParts(input){
 const s=input.replaceAll('\r\n','\n'),start='const choices=result.choices',end='const groups=new Map()',handlerAnchor="panel.querySelectorAll('[data-ipqc-choice]').forEach(";
 for(const anchor of [start,end,handlerAnchor])assert.equal(s.split(anchor).length,2,'unique IPQC source boundary: '+anchor);
 assert(s.indexOf(start)<s.indexOf(end),'ordered IPQC setup boundaries');
 const setup=s.slice(s.indexOf(start),s.indexOf(end)),staleMatches=[...s.matchAll(/const stale=\(op.ipqcAssignments\|\|\[\]\)\.filter\(a=>\{[^\n]+/g)];
 const renderer='  function renderAssignmentWarnings(',hasRenderer=s.includes(renderer);let renderSource='',stale='';
 if(hasRenderer){
  assert.equal(staleMatches.length,0,'current renderer cannot also carry a legacy stale expression');
  for(const anchor of [renderer,'  const referenceReasons=','  const key='])assert.equal(s.split(anchor).length,2,'unique retained source boundary: '+anchor);
  const from=s.indexOf(renderer),to=s.indexOf('  const key=');assert(from<to,'ordered retained renderer boundaries');
  const helpers=['h','text','label','referenceReasons'].map(name=>{const lines=s.split('\n').filter(line=>line.startsWith('  const '+name+'='));assert.equal(lines.length,1,'unique retained helper: '+name);return lines[0];}).join('\n');
  renderSource=helpers+'\n'+s.slice(from,to);
  const wiring="warnings.innerHTML=(op.ipqcAssignments||[]).map(a=>{const c=byKey.get(key(a)),reasons=referenceReasons(a,c);if(!reasons.length)return '';";
  assert.equal(renderSource.split(wiring).length,2,'actual warning renderer must consume the retained reasons once');
 }else{assert.equal(staleMatches.length,1,'unique stale expression');stale=staleMatches[0][0];}
 const handlerStart=s.indexOf(handlerAnchor),handlerEnd=s.indexOf('\n',handlerStart);assert(handlerEnd>handlerStart,'complete checkbox handler line');
 const handler=s.slice(handlerStart,handlerEnd).trim(),lookups=[...handler.matchAll(/const choice=([^;]+);/g)];assert.equal(lookups.length,1,'unique checkbox lookup inside actual handler');
 return{setup,stale,lookup:lookups[0][1],handler,renderSource,hasRenderer};
}
function viewPorts(){
 const warnings={innerHTML:'',querySelectorAll(selector){assert.equal(selector,'[data-ipqc-remove]');return[];}};
 return{warnings,panel:{querySelector(selector){assert.equal(selector,'[data-ipqc-warnings]');return warnings;}},document:{documentElement:{lang:'zh'},querySelector(selector){assert.equal(selector,'#apply-operation');return{disabled:false};}},escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')};
}
function actualSource(source){
 const p=sourceParts(source),ports=viewPorts();
 // Observe which real map callbacks emit warnings, retaining native map return,
 // row identity/order and the entire production renderer. No predicate is copied.
 const render=p.hasRenderer?`const stale=[];let maps=0;const assigned=Array.from(op.ipqcAssignments||[]);Object.defineProperty(assigned,'map',{value:function(callback){maps++;return Array.prototype.map.call(this,(row,index,array)=>{const markup=callback(row,index,array);if(markup)stale.push(row);return markup;});}});renderAssignmentWarnings(panel,{...op,ipqcAssignments:assigned},choicesByKey,null,()=>{throw Error('RENDER_MUST_NOT_EDIT');});assert.equal(maps,1);`:p.stale;
 return vm.runInNewContext(p.renderSource+'\n(result,op,input)=>{'+p.setup+render+'return {stale,choice:'+p.lookup+'};}',{assert,...ports,key,window:{},state:{editorLine:'A',category:'SYN'},editor:null,ensureCategoryEditor:()=>({}),fetch(){throw Error('UNEXPECTED_REQUEST');}});
}
function actual(file){return actualSource(fs.readFileSync(file,'utf8'));}
const oldActual=actual(baselineFile),newActual=actual(process.env.IPQC_CANDIDATE||path.resolve('public/process/process-ipqc.js'));
for(const ids of [['a','b','a'],[null,undefined,NaN,Infinity,-Infinity],[0,-0,'0',false,true],[{},[],['x'],{id:'x'}]]){const choices=ids.map((itemId,i)=>({source:'AB',scope:'A',itemId,sourceVersionId:'v'+i,productCodes:['b','a']})),assigned=structuredClone(choices);assigned.push({source:'AB',scope:'A',itemId:'missing',sourceVersionId:'v',productCodes:[]});const op={ipqcAssignments:assigned};for(const a of assigned){const input={dataset:{ipqcChoice:key(a)}},before=oldActual({choices},op,input),after=newActual({choices},op,input);assert.deepEqual(Array.from(after.stale),Array.from(before.stale));assert.equal(after.choice,before.choice);}}
console.log('actual baseline/candidate source stale order and checkbox first match PASS');

// Explicit AB rule delta: only C compares assignment product membership.
// All other historical stale/first-match behavior remains under the original comparisons.
const currentFile=process.env.IPQC_CANDIDATE||path.resolve('public/process/process-ipqc.js'),currentSource=fs.readFileSync(currentFile,'utf8');
const sample=(source='AB')=>({source,scope:source==='C'?'C':'A',itemId:'stable',sourceVersionId:'v1',productCodes:['P1','P2']});
function retainedMatrix(run){
 for(const source of ['AB','C']){
  const c=sample(source),selected={...c,productCodes:['different']},input={dataset:{ipqcChoice:key(c)}};
  assert.deepEqual(Array.from(run({choices:[c]},{ipqcAssignments:[selected]},input).stale),source==='C'?[selected]:[],'only C products alter current retention');
  const old={...c,sourceVersionId:'old'},missing={...c,itemId:'missing'};
  for(const assigned of [[c],[{...c,productCodes:['P2','P1']}],[old],[missing],[old,missing]]){
   const expected=assigned.filter(a=>a===old||a===missing);assert.deepEqual(Array.from(run({choices:[c]},{ipqcAssignments:assigned},input).stale),expected);
  }
  assert.equal(run({choices:[c,{...c,sourceVersionId:'later-duplicate'}]},{ipqcAssignments:[c]},input).choice,c);
 }
}
retainedMatrix(newActual);
for(const eol of ['\n','\r\n'])retainedMatrix(actualSource(currentSource.replaceAll('\r\n','\n').replaceAll('\n',eol)));
const change=(before,after)=>{assert.equal(currentSource.split(before).length,2,'unique fault-injection anchor');return currentSource.replace(before,after);};
for(const source of [currentSource+'\n'+sourceParts(currentSource).renderSource,change('reasons=referenceReasons(a,c);if(!reasons.length)',"reasons=[];if(!reasons.length)")])assert.throws(()=>sourceParts(source),/unique retained|consume the retained/);
for(const source of [change("a.sourceVersionId!==c.sourceVersionId","a.sourceVersionId===c.sourceVersionId"),change("a.source==='C'&&JSON.stringify",'JSON.stringify'),change("!c?['unavailable']","!c?[]")])assert.throws(()=>retainedMatrix(actualSource(source)),/current retention|Expected values/);
assert.throws(()=>retainedMatrix(actualSource(change('if(!choicesByKey.has(k))',''))),{code:'ERR_ASSERTION'},'last duplicate must not replace the first source row');
console.log('actual complete warning renderer: AB product delta, C membership, versions, missing source, order and LF/CRLF; binding/semantic negative controls PASS');

// Lookup equivalence does not remove the newer owner/edit/duplicate guard.
// Execute that exact production handler separately, with network calls forbidden.
const candidateSource=fs.readFileSync(process.env.IPQC_CANDIDATE||path.resolve('public/process/process-ipqc.js'),'utf8'),parts=sourceParts(candidateSource);
assert.throws(()=>sourceParts(candidateSource+'\n'+parts.handler),/unique IPQC source boundary/,'ambiguous extraction must fail rather than select the first handler');
function checkbox({selected=false,checked=true,current=true,canEdit=true,missing=false}={}){
 const original={source:'AB',scope:'A',itemId:'item',sourceVersionId:'original-version',productCodes:['original-product']},choice={...original,sourceVersionId:'new-source-version',productCodes:['new-product']},op={stageCode:'stage',ipqcAssignments:selected?[original]:[]},before=op.ipqcAssignments;
 let updates=0,events=0,requests=0;const article={dataset:{}},label={querySelector:()=>({outerHTML:''})},input={checked,dataset:{ipqcChoice:key(missing?{...choice,itemId:'missing'}:choice)},closest:selector=>selector==='article'?article:label};
 const ports=viewPorts();let renders=0;Object.defineProperty(ports.warnings,'innerHTML',{set(){renders++;}});
 const box={...ports,window:{},state:{editorLine:'A',category:'SYN'},key,result:{choices:[choice]},op,input,ensureCategoryEditor:()=>({stage:[op]}),valid:()=>current,editor:{canEdit:()=>canEdit},badge:status=>status,updateOverview:()=>updates++,Event:class{constructor(type){this.type=type;}},panel:{querySelector:selector=>ports.panel.querySelector(selector),querySelectorAll:()=>[input],dispatchEvent(event){assert.equal(event.type,'input');events++;}},fetch(){requests++;throw Error('UNEXPECTED_REQUEST');}};
 vm.runInNewContext(parts.renderSource+parts.setup+parts.handler,box);input.onchange();return{op,original,before,updates,events,requests,renders,article};
}
for(const options of [{selected:true},{selected:true,checked:false,current:false},{selected:true,checked:false,canEdit:false},{missing:true}]){const f=checkbox(options);assert.equal(f.op.ipqcAssignments,f.before,'guard must not replace the original assignment array');if(options.selected)assert.equal(f.op.ipqcAssignments[0],f.original);assert.equal(f.updates,0);assert.equal(f.events,0);assert.equal(f.requests,0);assert.equal(f.renders,0);}
const chosen=checkbox();assert.equal(chosen.op.ipqcAssignments.length,1);assert.equal(chosen.op.ipqcAssignments[0].sourceVersionId,'new-source-version');assert.equal(chosen.updates,1);assert.equal(chosen.events,1);assert.equal(chosen.requests,0);assert.equal(chosen.renders,1);assert.equal(chosen.article.dataset.status,'selected');
const removed=checkbox({selected:true,checked:false});assert.equal(removed.op.ipqcAssignments.length,0);assert.equal(removed.updates,1);assert.equal(removed.events,1);assert.equal(removed.requests,0);assert.equal(removed.renders,1);assert.equal(removed.article.dataset.status,'available');
console.log('actual checkbox duplicate/owner/edit/missing-choice guards retain original assignments; select/unselect remain local with zero requests PASS');

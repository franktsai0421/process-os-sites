import __esmImport0 from "node:assert/strict";
import __esmImport1 from "node:fs";
import __esmImport2 from "node:vm";
import __esmImport3 from "node:perf_hooks";
import {createRequire as __esmFactory} from 'node:module';
const __esmRequire=__esmFactory(import.meta.url);
/* User feedback regression: variable-height cards, partial overlap and routing cost. */
const assert=__esmImport0,fs=__esmImport1,vm=__esmImport2,{performance}=__esmImport3;
const source='public/process/editor-graph.js',load=file=>{const c={};vm.runInNewContext(fs.readFileSync(file,'utf8'),c);return c.ProcessEditorGraph;},G=load(source);
const baseline=process.argv[2],old=baseline?load(baseline):null,evidence=[];
function verify(name,ops,sizes,positions){
 const before=JSON.stringify(ops),pos=positions||G.layout(ops,sizes),boxes=Object.fromEntries(ops.map(o=>[o.id,{...pos[o.id],...sizes[o.id]}]));
 const started=performance.now(),routes=G.routes(ops,boxes),ms=performance.now()-started;
 assert.equal(JSON.stringify(ops),before);
 for(const [id,a]of Object.entries(boxes))for(const [other,b]of Object.entries(boxes))if(id!==other)assert.equal(G.overlap(a,b),false,name+': card overlap');
 for(const r of routes){assert.equal(r.blocked,false,name+': blocked '+r.from+' -> '+r.to);for(let i=1;i<r.points.length;i++)for(const [id,b]of Object.entries(boxes)){if(i===1&&id===r.from||i===r.points.length-1&&id===r.to)continue;assert.equal(G.intersects(r.points[i-1],r.points[i],b,0),false,name+': through card');}}
 let crossings=0;for(let a=0;a<routes.length;a++)for(let b=a+1;b<routes.length;b++)for(let i=1;i<routes[a].points.length;i++)for(let j=1;j<routes[b].points.length;j++){const r=G.segmentRelation(routes[a].points[i-1],routes[a].points[i],routes[b].points[j-1],routes[b].points[j]);assert.equal(r.shared,0,name+': overlapping or indistinguishable parallel wires');crossings+=r.cross;}
 let oldMs=null;if(old){const t=performance.now();old.routes(ops,boxes);oldMs=performance.now()-t;}
 const bends=routes.reduce((n,r)=>n+Math.max(0,r.points.length-2),0);evidence.push({name,nodes:ops.length,edges:routes.length,bends,crossings,routeMs:+ms.toFixed(2),beforeRouteMs:oldMs===null?null:+oldMs.toFixed(2),overlap:0,throughCards:0});return routes;
}
assert.equal(G.segmentRelation({x:0,y:20},{x:100,y:20},{x:30,y:20},{x:140,y:20}).shared,70);
for(const language of ['zh','vi'])for(const n of [5,10,15,20]){
 const ops=Array.from({length:n},(_,i)=>({id:'n'+i,nextIds:i===0?['n1','n2']:i===1||i===2?['n3']:i<n-1?['n'+(i+1)]:[]}));
 const sizes=Object.fromEntries(ops.map((o,i)=>[o.id,{width:320,height:230+(i%4)*85+(language==='vi'?70:0)}]));
 verify(language+'-branch-'+n,ops,sizes);assert.deepEqual(G.layout(ops,sizes),G.layout(ops,sizes));
 const chain=ops.map((o,i)=>({...o,nextIds:i<n-1?['n'+(i+1)]:[]}));
 assert.ok(verify(language+'-chain-'+n,chain,sizes).every(r=>r.points.length===2),'variable-height chain should be straight');
}
const raw={a:{x:30,y:30,width:320,height:365},b:{x:30,y:390,width:320,height:338},c:{x:30,y:750,width:320,height:338}},before=JSON.stringify(raw),separated=G.separate(raw);
assert.equal(JSON.stringify(raw),before);assert.equal(separated.a.y,30);assert.equal(separated.b.y,427);assert.equal(separated.c.y,797);assert.deepEqual(G.separate(separated),separated);
const fork=[{id:'a',nextIds:['c']},{id:'b',nextIds:['c']},{id:'c',nextIds:[]}],sizes={a:{width:320,height:580},b:{width:320,height:330},c:{width:320,height:380}};
verify('reported-converging-photos',fork,sizes,{a:{x:80,y:80},b:{x:80,y:800},c:{x:580,y:180}});
console.log(JSON.stringify({result:'PASS',displaySeparationDoesNotMutate:true,partialOverlapDetected:true,cases:evidence},null,2));

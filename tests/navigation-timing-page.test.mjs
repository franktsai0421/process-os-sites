import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
// Actual TSX and JSX elements; controlled hooks/HTTP/storage ports, not a DOM or
// browser acceptance. A transport deliberately ignores abort to expose races.
async function fixture(){
 const slots=[],effects=[],gates=[],storage=new Map(),counts={stop:0,clear:0,download:0,reload:0};let cursor=0,mounted=false,fetches=0,rows=[{kind:'ready',route:'shell',doc:'synthetic',at:1}];
 const config=()=>({ok:true,json:async()=>({enabled:true,until:Date.now()+600000})});
 const hooks={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=value;}];},useRef(initial){const i=cursor++;return slots[i]??=( {current:initial} );},useEffect(fn){if(!mounted)effects.push(fn);}};
 const mod={exports:{}};const code=ts.transpileModule(fs.readFileSync('app/navigation-timing/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(code,{module:mod,exports:mod.exports,require:id=>id==='react'?hooks:require(id),AbortController,Date,JSON,Number,Error,Blob,URL:{createObjectURL:()=> 'blob:synthetic',revokeObjectURL(){}},location:{reload(){counts.reload++;}},document:{createElement:()=>({click(){counts.download++;}})},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{ProcessNavigationTiming:{snapshot:()=>({version:1,until:Date.now()+600000,rows:[...rows]}),stop(){counts.stop++;storage.delete('process-navigation-timing-v1');},clear(){counts.clear++;rows=[];storage.clear();}}},fetch(_url,init){if(fetches++===0)return Promise.resolve(config());return new Promise((resolve,reject)=>gates.push({resolve,reject,signal:init.signal}));}});
 const render=()=>{cursor=0;return mod.exports.default();},flush=()=>new Promise(resolve=>setImmediate(resolve));
 const walk=(node,predicate)=>{if(Array.isArray(node)){for(const child of node){const found=walk(child,predicate);if(found)return found;}}else if(node&&typeof node==='object'){if(predicate(node))return node;return walk(node.props?.children,predicate);}return null;};
 const button=label=>{const b=walk(render(),n=>n.type==='button'&&typeof n.props.children==='string'&&n.props.children.startsWith(label));assert(b,label);return b;};
 render();mounted=true;const cleanup=effects[0]();await flush();
 return {button,render,walk,flush,config,gates,storage,counts,cleanup};
}
for(const operation of ['開始','更新摘要','匯出 JSON'])for(const control of ['停止 /','停止並清除'])await test(operation+' pending → '+control+' stays usable and fences late success',async()=>{
 const f=await fixture();f.button(operation).props.onClick();const gate=f.gates[0];assert(gate);assert.equal(f.button('停止 /').props.disabled,undefined);assert.equal(f.button('停止並清除').props.disabled,undefined);
 f.button(control).props.onClick();assert.equal(gate.signal.aborted,true);assert.equal(f.counts[control==='停止 /'?'stop':'clear'],1);
 gate.resolve(f.config());await f.flush();assert.equal(f.counts.reload,0);assert.equal(f.counts.download,0);assert.equal(f.storage.size,0);assert.equal(f.button('更新摘要').props.disabled,false);
 if(control==='停止並清除')assert.equal(f.walk(f.render(),n=>n.type==='p'&&n.props.children==='1 筆 / mục'),null);
});
await test('late failure/finally cannot clobber a newer authorized action after Stop',async()=>{
 const f=await fixture();f.button('匯出 JSON').props.onClick();const old=f.gates[0];f.button('停止 /').props.onClick();f.button('匯出 JSON').props.onClick();const current=f.gates[1];old.reject(Error('synthetic failure'));await f.flush();assert.equal(f.button('匯出 JSON').props.disabled,true);assert.equal(current.signal.aborted,false);assert.equal(f.counts.stop,1);current.resolve(f.config());await f.flush();assert.equal(f.counts.download,1);assert.equal(f.button('匯出 JSON').props.disabled,false);
});
await test('unmount aborts pending action and prevents late export',async()=>{
 const f=await fixture();f.button('匯出 JSON').props.onClick();const gate=f.gates[0];f.cleanup();assert.equal(gate.signal.aborted,true);gate.resolve(f.config());await f.flush();assert.equal(f.counts.download,0);
});

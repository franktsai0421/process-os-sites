import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
void test('outside click closes open sidebar, inside/toggle click and closed menu are untouched',()=>{
 const source=fs.readFileSync(new URL('../public/process/app.js',import.meta.url),'utf8');
 const start=source.indexOf("document.addEventListener('click', (event) =>",source.indexOf('// Close mobile navigation'));
 const end=source.indexOf('\n});',start)+4;
 let handler,open=true,removed=0;
 const sidebar={classList:{contains:()=>open,remove:()=>{open=false;removed++;}}};
 vm.runInNewContext(source.slice(start,end),{document:{addEventListener:(_,f)=>handler=f,querySelector:()=>sidebar}});
 for(const inside of [true,true])handler({target:{closest:()=>inside}});
 assert.equal(open,true);assert.equal(removed,0);
 handler({target:{closest:()=>false}});assert.equal(open,false);assert.equal(removed,1);
 handler({target:{closest:()=>false}});assert.equal(removed,1);
});

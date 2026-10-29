import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimeCatalog,legacyBom} from '../lib/process-bootstrap.mjs';
const active={AB:{products:[{code:'AB1',name:'A',category:'CAT',line:'A',stages:['A-CUT'],privateNote:'not a runtime field'}],lines:[{code:'A',name:'Line A',stages:[{code:'A-CUT',name:'Cut',machine:'Machine A',assetNumber:'ASSET-A',operators:2,privateNote:'not public'}]}]},C:{products:[{code:'C1',name:'C',category:'C-CAT',line:'C',stages:['C-CUT']}],lines:[{code:'C',name:'Line C',stages:[{code:'C-CUT',name:'Cut'}]}]}};
const values={masterDataControl:JSON.stringify({active,versions:[{id:'draft',snapshot:{secret:'draft'}}]}),bomOverrides:JSON.stringify({replaceAll:true,data:{AB1:[]}})};
void test('quality-only bootstrap does not need process catalogs or legacy seeds',async()=>{
  let reads=0;const result=await runtimeCatalog({},p=>p==='iqc.view',()=>{reads++;throw Error('not allowed');});
  assert.deepEqual(result.loadedScopes,[]);assert.equal(result.imported.products.length,0);assert.equal(reads,0);
});
void test('approved runtime dependencies omit draft/version/private fields and respect module scope',async()=>{
  const c=await runtimeCatalog(values,p=>p==='c.view',()=>{throw Error('not allowed');});
  assert.deepEqual(c.loadedScopes,['C']);assert.deepEqual(c.imported.products.map(p=>p.code),['C1']);
  const player=await runtimeCatalog(values,p=>p==='player.view',()=>{throw Error('not required');});
  assert.equal(player.imported.products.length,2);assert(!JSON.stringify(player).includes('privateNote'));assert(!JSON.stringify(player).includes('draft'));
  assert.equal(player.routing.productRoutes.AB1.stages[0],'A-CUT');
  assert.deepEqual(player.routing.lines[0].stages[0],{code:'A-CUT',name:'Cut',machine:'Machine A',assetNumber:'ASSET-A',operators:2});
  assert.equal(player.routing.meta.finishedCount,1);assert.equal(player.routing.meta.semiFinishedCount,1);assert.equal(player.imported.meta.bomSource,'目前 BOM 全量版本');
  await assert.rejects(()=>runtimeCatalog({},p=>p==='player.view',()=>({})),/CATALOG_UNAVAILABLE/);
});
void test('legacy BOM compatibility is exact verified JSON, not script execution or silent empty state',async()=>{
  const raw='window.IMPORTED_DATA = '+JSON.stringify({bom:{AB1:[{itemCode:'OLD'}]},products:[{secret:'omit'}]})+';';
  const bytes=new TextEncoder().encode(raw),sha=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
  const bucket={get:async()=>({size:bytes.length,text:async()=>raw})};
  const base=await legacyBom(bucket,{bytes:bytes.length,sha256:sha});assert.deepEqual(Object.keys(base),['AB1']);
  const result=await runtimeCatalog({...values,bomOverrides:JSON.stringify({AB1:[{itemCode:'NEW'}]})},p=>p==='bom.view',()=>base);
  assert.equal(result.imported.bom.AB1[0].itemCode,'NEW');
  await assert.rejects(()=>legacyBom(bucket,{bytes:bytes.length,sha256:'f'.repeat(64)}),/CORRUPT/);
});

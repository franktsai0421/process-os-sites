import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync('public/process/ipqc-c.js','utf8'),start=source.indexOf('  function equipmentForDisplay('),end=source.indexOf('  async function loadCaseHistory(',start);
const registry=[{id:'old',assetCode:'REGISTRY-OLD',pieceMark:'01',name:'New registry name',photoId:'b'.repeat(64)},{id:'next',assetCode:'NEXT',pieceMark:'02',name:'Next',photoId:'c'.repeat(64)},{id:'disabled',assetCode:'OFF',available:false,photoId:'d'.repeat(64)}];
const ctx={equipment:registry,h:v=>String(v??''),t:(vi,zh)=>zh,encodeURIComponent};vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
const snapshot=Object.freeze({id:'old',assetCode:'HISTORICAL',pieceMark:'00',name:'Historical name',photoId:'a'.repeat(64)});
void test('matching snapshot wins over changed registry; mismatched snapshot never supplies caption/photo',()=>{
 const row=Object.freeze({equipmentId:'old',equipmentSnapshot:snapshot});assert.equal(ctx.equipmentForDisplay(row),snapshot);assert(ctx.equipmentDetailHTML(row).includes('Historical name'));assert(ctx.equipmentListPreview(row).includes(snapshot.photoId));
 const local=Object.freeze({...row,equipmentId:'next'}),before=JSON.stringify(local);assert.equal(ctx.equipmentForDisplay(local),registry[1]);for(const html of [ctx.equipmentDetailHTML(local),ctx.equipmentListPreview(local)]){assert(html.includes('NEXT'));assert(html.includes(registry[1].photoId));assert(!html.includes(snapshot.photoId));assert(!html.includes('HISTORICAL'));}assert.equal(JSON.stringify(local),before);
});
void test('cleared/missing/unavailable selected IDs never fabricate another gauge or mutate snapshots',()=>{
 for(const id of ['', 'missing', 'disabled']){const item=Object.freeze({equipmentId:id,equipmentSnapshot:snapshot}),raw=JSON.stringify(item),eq=ctx.equipmentForDisplay(item);assert.equal(eq,id==='disabled'?registry[2]:null);const html=ctx.equipmentDetailHTML(item)+ctx.equipmentListPreview(item);assert(!html.includes('HISTORICAL'));assert(!html.includes(snapshot.photoId));if(id==='missing')assert(html.includes('missing'));assert.equal(JSON.stringify(item),raw);}
});

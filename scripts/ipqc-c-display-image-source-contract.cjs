/* Test-only inverse of the reviewed C gauge display change. Product execution
 * always uses the real source. Exact file hashes and unique byte spans prevent
 * this compatibility projection from accepting other source or image changes. */
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const file='ipqc-c.js';
const beforeHash='cc9e17f5b7cfd0d77a6a785440a1868453969efb46f0f8d8b2924f25836e6909',afterHash='7c79731412465f368b73d0058075caadd9d52ccfcecea3babcb12563370029f8';
const rules=[
  {
    "name": "display helpers",
    "offset": 69014,
    "before": "",
    "after": "  // A local equipmentId patch deliberately does not rewrite the server snapshot.\n  // Reuse a snapshot only for its own ID; otherwise preview the selected registry row.\n  function equipmentForDisplay(item) {\n    if(!item.equipmentId)return null;\n    return item.equipmentSnapshot?.id===item.equipmentId?item.equipmentSnapshot:equipment.find(row=>row.id===item.equipmentId)||null;\n  }\n  function equipmentDetailHTML(item) {\n    const eq=equipmentForDisplay(item);\n    return `<div class=\"ipqcc-selected-equipment\">${item.equipmentId?eq?`${eq.photoId?`<img decoding=\"async\" loading=\"lazy\" src=\"/api/routine-equipment/photo?id=${h(eq.photoId)}\" alt=\"\">`:''}<span>${h(eq.assetCode||'')} / ${h(eq.pieceMark||'')} · ${h(eq.name||'')}</span>`:`<span>${h(item.equipmentId)}</span>`:t('Kiểm tra trực quan','目視檢查')}</div>`;\n  }\n"
  },
  {
    "name": "list display resolver",
    "offset": 69846,
    "before": "  function equipmentListPreview(item) {\n    if (!item.equipmentId) return '';\n    const eq=item.equipmentSnapshot || equipment.find(row=>row.id===item.equipmentId);",
    "after": "  function equipmentListPreview(item) {\n    if (!item.equipmentId) return '';\n    const eq=equipmentForDisplay(item);"
  },
  {
    "name": "detail display call",
    "offset": 87995,
    "before": "<div class=\"ipqcc-selected-equipment\">${i.equipmentId?`${i.equipmentSnapshot?.photoId?`<img decoding=\"async\" loading=\"lazy\" src=\"/api/routine-equipment/photo?id=${h(i.equipmentSnapshot.photoId)}\" alt=\"\">`:''}<span>${h(i.equipmentSnapshot?.assetCode||'')} / ${h(i.equipmentSnapshot?.pieceMark||'')} · ${h(i.equipmentSnapshot?.name||'')}</span>`:t('Kiểm tra trực quan','目視檢查')}</div>",
    "after": "${equipmentDetailHTML(i)}"
  }
];
const hash=source=>createHash('sha256').update(source).digest('hex');
const hasDisplay=source=>source.includes('equipmentForDisplay(')||source.includes('equipmentDetailHTML(');
function withoutDisplay(source){
 assert.equal(hash(source),afterHash,'C display source differs from exact reviewed bytes');
 let result=Buffer.from(source);
 for(const rule of [...rules].reverse()){
  const after=Buffer.from(rule.after),before=Buffer.from(rule.before),at=rule.offset;
  assert.deepEqual(result.subarray(at,at+after.length),after,'C display span changed: '+rule.name);
  assert.equal(result.indexOf(after),at,'C display span moved: '+rule.name);
  assert.equal(result.indexOf(after,at+after.length),-1,'C display span repeated: '+rule.name);
  result=Buffer.concat([result.subarray(0,at),before,result.subarray(at+after.length)]);
 }
 assert.equal(hash(result),beforeHash,'C display inverse differs from exact prior source');
 return result.toString('utf8');
}
function imagePolicySource(name,source,{sourceMode='current',headSource}={}){
 assert(['current','readonly-fixture'].includes(sourceMode),'explicit image policy source mode');
 if(name!==file){assert(!hasDisplay(source),'C display projection requires ipqc-c.js');return source;}
 if(sourceMode==='current'){
  assert(Buffer.isBuffer(headSource),'C display current mode requires raw HEAD blob');
  const committed=headSource.toString('utf8');
  assert(source===committed||source.replace(/\r\n/g,'\n')===committed,'C display worktree differs from HEAD beyond CRLF checkout');
  return withoutDisplay(headSource);
 }
 // Current-source checks never infer legacy mode from absent display markers.
 // Explicit external fixtures retain the original assertion on untouched bytes.
 if(sourceMode==='readonly-fixture'&&hash(source)!==afterHash&&!hasDisplay(source))return source;
 return withoutDisplay(source);
}
module.exports={imagePolicySource,withoutDisplay,file,beforeHash,afterHash,rules};

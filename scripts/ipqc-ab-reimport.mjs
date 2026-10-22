import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {connect,hash} from './ipqc-ab-local-context.mjs';
const require=createRequire(import.meta.url);
const {mergeAbImport,sourceRules,AB_LATEST_SHA,AB_LEGACY_SHA}=require('./ipqc-ab-import-harness.cjs')()('lib/ipqc-ab-import.ts');
const args=process.argv.slice(2),has=x=>args.includes(x),opt=x=>has(x)?args[args.indexOf(x)+1]:'';
const mode=has('--apply')?'apply':has('--dry-run')?'dry-run':has('--verify')?'verify':'';
if(!mode) throw Error('Use --dry-run / --apply / --verify --url http://127.0.0.1:3000 --audit <latest report> --report <result>');
const url=opt('--url')||'http://127.0.0.1:3000';
const reportPath=path.resolve(opt('--report')||'.wrangler/local-only/ipqc-ab-reimport/result.json');
const audit=JSON.parse(fs.readFileSync(opt('--audit'),'utf8'));
if(audit.format!=='ipqc-ab-audit/v2'||audit.source.sha256!==AB_LATEST_SHA ||
  hash(fs.readFileSync(audit.source.path))!==AB_LATEST_SHA) throw Error('Pinned workbook/audit mismatch');
const client=await connect(url);
const state=await client.request('/api/ipqc-ab');
if(JSON.stringify(state.catalog)!==JSON.stringify(audit.catalog)) throw Error('Effective Local master changed; regenerate audit');
let legacy;
if(opt('--legacy')) {
  const old=JSON.parse(fs.readFileSync(opt('--legacy'),'utf8'));
  if(old.source.sha256!==AB_LEGACY_SHA) throw Error('Legacy comparison baseline SHA differs');
  const allItems=Map.groupBy(old.rows,r=>r.itemCode),byItem=Map.groupBy(old.rows.filter(r=>!r.reasons.length),r=>r.itemCode);
  const errors=[...Map.groupBy(old.rows.filter(r=>!r.reasons.length),r=>r.errorCode)].map(([code,rs])=>({
    id:`ipqc-ab-error:${code}`,code,line:rs[0].line,group:rs[0].sourceGroup,stageCode:rs[0].stageCode,
    name:rs[0].errorName,sourceRows:[...new Set(old.rows.filter(r=>r.errorCode===code).map(r=>r.row))],deleted:false}));
  const items=[...byItem].map(([code,rs])=>{
    const f=rs[0]; return {id:`ipqc-ab-item:${code}`,code,errorId:`ipqc-ab-error:${f.errorCode}`,standard:f.standard,
      methodText:'',inspectionMode:'visual',equipmentId:'',equipmentSnapshot:null,isEnabled:f.sourceEnabled==='YES',
      rules:sourceRules(f.sourceFrequency,code),standardPhotos:[],methodPhotos:[],productCodes:[...new Set(rs.map(r=>r.productCode))],
      sourceRows:[...new Set(allItems.get(code).map(r=>r.row))],sourceTool:f.sourceTool,sourceMethod:f.sourceMethod,
      sourceFrequency:f.sourceFrequency,sourceVersion:f.sourceVersion,sourceChangedAt:f.sourceChangedAt,
      sourceReason:f.sourceReason,sourceCreator:f.sourceCreator,sourceNote:f.sourceNote,reason:'',deleted:false};
  });
  legacy={sha256:AB_LEGACY_SHA,errors,items};
}
const payload={source:{fileName:audit.source.fileName,sha256:audit.source.sha256,rows:audit.source.rows},
  variants:audit.variants,catalog:audit.catalog,...(legacy?{legacy}:{})};
if(opt('--payload-out')) fs.writeFileSync(opt('--payload-out'),JSON.stringify(payload,null,2));
const plan=mergeAbImport(state.control,state.catalog,payload,{id:'local-preview',name:'Local preview'},'preview');
const activeSignatures=s=>Object.fromEntries(Object.entries(s.scopes).map(([key,scope])=>[key,
  {activeVersionId:scope.activeVersionId,versions:scope.versions.filter(v=>!['draft','pending','pending-test'].includes(v.status))}]));
const assets=s=>Object.values(s.scopes).flatMap(sc=>sc.versions.filter(v=>['draft','pending','pending-test'].includes(v.status))
  .flatMap(v=>v.snapshot.items.filter(i=>i.standardPhotos.length||i.methodPhotos.length||i.equipmentId)
    .map(i=>({id:i.id,code:i.code,errorId:i.errorId,standard:i.standard,standardPhotos:i.standardPhotos,
      methodPhotos:i.methodPhotos,inspectionMode:i.inspectionMode,equipmentId:i.equipmentId,equipmentSnapshot:i.equipmentSnapshot}))));
const backupPath=opt('--backup');
const comparison=mode==='verify' && backupPath ? JSON.parse(fs.readFileSync(path.join(backupPath,'ipqc-ab-state.json'),'utf8')):state;
const beforeAssets=assets(comparison.control),beforeActive=activeSignatures(comparison.control);
let result=mode==='verify'?mergeAbImport(comparison.control,state.catalog,payload,{id:'verify',name:'verify'},'verified-plan'):plan;
let revision=state.revision;
if(mode==='apply') {
  if(!backupPath) throw Error('Apply needs a verified physical --backup directory');
  const manifest=JSON.parse(fs.readFileSync(path.join(backupPath,'manifest.json'),'utf8'));
  if(!manifest.physical||manifest.root!==process.cwd()||manifest.url!==client.base ||manifest.revision!==state.revision)
    throw Error('Backup does not match this Local revision; take a new snapshot');
  for(const file of manifest.files) if(hash(fs.readFileSync(path.join(backupPath,file.path)))!==file.sha256)
    throw Error(`Backup hash mismatch: ${file.path}`);
  // Keep a logical comparison baseline and the exact request privately, never sessions/credentials.
  fs.writeFileSync(path.join(backupPath,'reimport-payload.json'),JSON.stringify(payload,null,2));
  fs.mkdirSync(path.dirname(reportPath),{recursive:true});
  fs.writeFileSync(reportPath+'.preflight.json',JSON.stringify({summary:plan.summary,entries:plan.entries},null,2));
  const response=await client.request('/api/ipqc-ab',{action:'reimport',baseRevision:state.revision,import:payload});
  fs.writeFileSync(reportPath+'.response.json',JSON.stringify(response,null,2));
  result=response.importReport;revision=response.revision;
}
const after=mode==='dry-run'?{control:plan.control,revision:state.revision}:await client.request('/api/ipqc-ab');
const afterActive=activeSignatures(after.control);
const activeUnchanged=Object.entries(beforeActive).every(([key,value])=>JSON.stringify(value)===JSON.stringify(afterActive[key])) &&
  Object.entries(afterActive).filter(([key])=>!Object.hasOwn(beforeActive,key)).every(([,value])=>value.activeVersionId===null&&!value.versions.length);
if(mode!=='dry-run' && (!activeUnchanged||
  JSON.stringify(beforeAssets)!==JSON.stringify(assets(after.control)))) throw Error('Approved version or asset association changed; retain backup and investigate');
const repeated=mergeAbImport(after.control,after.catalog||state.catalog,payload,{id:'verify',name:'verify'},'repeat');
if(repeated.changed) throw Error('Repeat-import is not idempotent; no further writes performed');
for(const entry of result.entries.filter(e=>e.key&&['added','updated'].includes(e.status))) {
  const found=Object.values(after.control.scopes).flatMap(s=>s.versions.filter(v=>v.status==='draft').flatMap(v=>v.snapshot.items)).find(i=>i.sourceImport?.key===entry.key);
  if(!found || found.code!==entry.code || JSON.stringify(found.productCodes)!==JSON.stringify(entry.productCodes)) throw Error('Draft read-back mapping differs from verified merge plan');
}
let unrelatedKeysUnchanged=true;
if(mode!=='dry-run'&&backupPath) {
  const keyHashes=JSON.parse(fs.readFileSync(path.join(backupPath,'shared-key-hashes.json'),'utf8'));
  const shared=await client.request('/api/shared-state');
  unrelatedKeysUnchanged=Object.entries(keyHashes).filter(([key])=>key!=='ipqcABMasterControl').every(([key,digest])=>hash(shared.values[key])===digest);
  if(!unrelatedKeysUnchanged) throw Error('Unrelated shared-state changed since backup; investigate concurrent work without overwriting it');
}
const report={mode,url:client.base,backup:backupPath,source:audit.source,revisionBefore:comparison.revision,revisionAfter:revision,
  auditSummary:audit.summary,summary:result.summary,entries:result.entries,errors:result.errors,
  verification:{repeatUnchanged:true,approvedVersionsUnchanged:activeUnchanged,unrelatedKeysUnchanged,assetAssociationsPreserved:beforeAssets.length,
    newItemsVisual:Object.values(after.control.scopes).flatMap(s=>s.versions.filter(v=>v.status==='draft').flatMap(v=>v.snapshot.items))
      .filter(i=>result.entries.some(e=>e.status==='added'&&e.code===i.code)).every(i=>i.inspectionMode==='visual'&&!i.equipmentId)},
  unresolvedGroups:audit.unresolvedGroups,basicConflicts:audit.basicConflicts,standardConflicts:audit.standardConflicts};
fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
if(has('--csv')) {
  const destination=path.resolve(opt('--csv'));fs.mkdirSync(destination,{recursive:true});
  const mapped=new Map(result.entries.filter(e=>e.key).map(e=>[e.key,e]));
  const csv=(filename,rows)=>{
    const columns=[...new Set(rows.flatMap(row=>Object.keys(row)))];
    const quote=v=>'"'+String(Array.isArray(v)?v.join(' | '):v??'').replaceAll('"','""')+'"';
    fs.writeFileSync(path.join(destination,filename),'\ufeff'+[columns.map(quote).join(','),...rows.map(row=>columns.map(c=>quote(row[c])).join(','))].join('\r\n')+'\r\n');
  };
  csv('解析_群組_待核對.csv',[...Map.groupBy(audit.rows,r=>r.line+':'+r.sourceGroup)].map(([key,rs])=>({
    scope:key,line:rs[0].line,group:rs[0].sourceGroup,sourceRows:[...new Set(rs.map(r=>r.row))],
    assignedItemCodes:[...new Set(rs.map(r=>mapped.get(r.key)?.code).filter(Boolean))],
    status:rs.some(r=>!r.reasons.length)?'matched':'excluded',reasons:[...new Set(rs.flatMap(r=>r.reasons))]})));
  csv('解析_錯誤代碼_待核對.csv',[...Map.groupBy(audit.rows,r=>r.errorCode)].map(([code,rs])=>({
    errorCode:code,name:rs[0].errorName,line:rs[0].line,group:rs[0].sourceGroup,stage:rs[0].stageCode,
    sourceRows:[...new Set(rs.map(r=>r.row))],assignedCodes:[...new Set(rs.map(r=>mapped.get(r.key)?.errorCode).filter(Boolean))],
    assignedItemCodes:[...new Set(rs.map(r=>mapped.get(r.key)?.code).filter(Boolean))],reasons:[...new Set(rs.flatMap(r=>r.reasons))],
    status:rs.some(r=>!r.reasons.length)?'matched':'excluded'})));
  csv('解析_檢查項目_待核對.csv',audit.variants.map(v=>({key:v.key,errorCode:v.errorCode,sourceItemCodes:v.sourceItemCodes,
    assignedItemCode:mapped.get(v.key)?.code,standard:v.standard,sourceRows:v.sourceRows,productCodes:v.productCodes,
    methodText:v.methodText,sourceTool:v.sourceTool,sourceFrequency:v.sourceFrequency,sourceEnabled:v.sourceEnabled,
    status:mapped.get(v.key)?.status||'excluded',reasons:[...new Set([...(mapped.get(v.key)?.reasons||[]),
      ...audit.rows.filter(r=>r.key===v.key).flatMap(r=>r.reasons),...(!v.productCodes.length?['no_valid_products']:[])])]})));
  const relationRows=audit.rows.map(r=>({sourceRow:r.row,line:r.line,group:r.sourceGroup,product:r.productCode,
    stage:r.stageCode,errorCode:r.errorCode,sourceItemCode:r.itemCode,assignedItemCode:mapped.get(r.key)?.code,
    key:r.key,standard:r.standard,productAnchor:r.productAnchor,status:r.reasons.length?'excluded':mapped.get(r.key)?.status||'deferred',
    reasons:[...r.reasons,...(mapped.get(r.key)?.status==='deferred'?mapped.get(r.key).reasons:[])]}));
  csv('解析_產品關聯_待核對.csv',relationRows);
  csv('新版_逐筆排除與暫緩.csv',relationRows.filter(r=>r.status==='excluded'||r.status==='deferred'));
  csv('新版_無有效關聯項目.csv',audit.variants.filter(v=>!v.productCodes.length).map(v=>({key:v.key,errorCode:v.errorCode,
    sourceItemCodes:v.sourceItemCodes,standard:v.standard,sourceRows:v.sourceRows,reason:v.blocked?'basic_fields_conflict':'no_valid_products'})));
  csv('新版_合併差異.csv',result.entries.filter(e=>e.fields?.length||['deferred','deleted','preserved'].includes(e.status)));
}
console.log(JSON.stringify({report:reportPath,mode,summary:report.summary,verification:report.verification},null,2));

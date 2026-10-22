// Mechanically generate reproducible source/audit evidence; does not open a DB or change source Excel.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [auditFile,resultFile]=process.argv.slice(2);
if(!auditFile||!resultFile) throw Error('Use <audit.json> <verified result.json>');
const audit=JSON.parse(fs.readFileSync(auditFile,'utf8')),result=JSON.parse(fs.readFileSync(resultFile,'utf8'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
if(hash(fs.readFileSync(audit.source.path))!==audit.source.sha256||result.source.sha256!==audit.source.sha256||
  !result.verification.repeatUnchanged||!result.verification.approvedVersionsUnchanged||!result.verification.unrelatedKeysUnchanged)
  throw Error('Evidence/source verification mismatch');
const root=path.resolve('KD/IPQC-AB'),destination=path.join(root,'01_最新資料');
const write=(name,value)=>fs.writeFileSync(path.join(destination,name),JSON.stringify(value,null,2)+'\n');
const fields=audit.basicConflicts.map(conflict=>({...conflict,variants:audit.variants.filter(v=>conflict.keys.includes(v.key))}));
write('新版_拆分與衝突.json',{source:audit.source,summary:audit.summary,standardConflicts:audit.standardConflicts,basicConflicts:fields,
  errorConflicts:audit.errorConflicts,unresolvedGroups:audit.unresolvedGroups});
write('新版_未匹配資料.json',{source:audit.source,unresolvedGroups:audit.unresolvedGroups,
  missingProducts:[...Map.groupBy(audit.rows.filter(r=>r.reasons.includes('product_missing')),r=>r.productCode)].map(([code,rows])=>({
    code,sourceRows:[...new Set(rows.map(r=>r.row))],groups:[...new Set(rows.map(r=>r.line+':'+r.sourceGroup))],
    stages:[...new Set(rows.map(r=>r.stageCode))],reasons:[...new Set(rows.flatMap(r=>r.reasons))]}))});
write('新版_匯入結果.json',result);
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
  if(entry.isSymbolicLink()) throw Error('Refuse manifest symlink');
  const file=path.join(dir,entry.name);return entry.isDirectory()?walk(file):[file];
});
const files=walk(root).filter(file=>path.basename(file)!=='檔案清單_SHA256.json').map(file=>({
  path:path.relative(root,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,sha256:hash(fs.readFileSync(file))}));
fs.writeFileSync(path.join(root,'檔案清單_SHA256.json'),JSON.stringify({latestSource:{path:'01_最新資料/'+audit.source.fileName,
  sheet:'IPQC',sha256:audit.source.sha256,referenceOnlySheet:'RA_SOAT_NHOM'},files},null,2)+'\n');
console.log(JSON.stringify({files:files.length,source:audit.source.fileName,sourceSHA:audit.source.sha256,
  actualSummary:result.summary,backup:result.backup},null,2));

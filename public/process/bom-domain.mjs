// Shared browser/server BOM rules. Original ERP levels and occurrence paths are authoritative.
export const columns = ['Mã NVL chính','Cấp','Số thứ tự','Mã NVL','Tên VP','Quy cách','ĐV','Lượng dùng tổ hợp','Mẫu số','Tỷ lệ khấu hao %'];
export const fields = ['rootCode','levelLabel','ordinal','itemCode','itemName','specification','unit','quantity','denominator','waste'];
export const editableFields = ['itemName','specification','unit','quantity','denominator','waste'];
export const numericFields = ['quantity','denominator','waste'];
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
const text = value => String(value ?? '');
const header = value => normalize(value).trim().replace(/\s+/g,' ');
const copy = value => JSON.parse(JSON.stringify(value));
const numeric = value => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)&&Number.isFinite(Number(value));
export const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const fail = (sheet,row,reason) => { throw Error(`${sheet} · ${row}: ${reason}`); };
export function parseLevel(value) {
  const raw = text(value).trim(), match = /^(\.*)(\d+)$/.exec(raw);
  if (!match || (match[1] && match[1].length !== Number(match[2]))) throw Error('Cấp / 層級格式無效');
  const level = Number(match[2]);
  if (!Number.isSafeInteger(level) || level < 0) throw Error('Cấp / 層級格式無效');
  return level;
}
// Identity is a collision-free encoded structural path, never name or worksheet row.
export function identify(rows) {
  const stack = [], used = new Set();
  return rows.map(source => {
    const row = {...source}, parent = row.level ? stack[row.level-1] : null;
    if (row.level && !parent) throw Error('BOM_PARENT_MISSING');
    const segment = JSON.stringify([row.ordinal,row.itemCode]);
    row.id = row.level ? parent.id+'/'+encodeURIComponent(segment) : 'bom:'+encodeURIComponent(row.rootCode);
    if (used.has(row.id)) throw Error(`BOM_OCCURRENCE_AMBIGUOUS: ${row.rootCode} / ${row.ordinal} / ${row.itemCode}`);
    used.add(row.id); row.parentId = parent?.id || null;
    row.path = parent ? [...parent.path,{ordinal:row.ordinal,itemCode:row.itemCode}] : [];
    stack.length = row.level; stack[row.level] = row;
    return row;
  });
}
export function parseMatrices(sheets, provenance = {}) {
  const bom = Object.create(null); let total = 0;
  for (const {name,rows} of sheets) {
    let indexes = null, current = null;
    for (const [index,cells] of rows.entries()) {
      if (!cells.some(v=>text(v).trim())) continue;
      const normalized = cells.map(header), candidate = columns.map(c=>normalized.indexOf(header(c)));
      if (candidate.every(i=>i>=0)) { indexes=candidate; continue; }
      if (!indexes) {
        if(candidate.filter(i=>i>=0).length>=2) fail(name,index+1,'缺少欄位 / Thiếu cột: '+columns.filter((_,i)=>candidate[i]<0).join(', '));
        continue; // Report title before the first recognized header.
      }
      const values=indexes.map(i=>text(cells[i])), record=Object.fromEntries(fields.map((f,i)=>[f,values[i]]));
      if (!values.some(v=>v.trim())) continue;
      let level; try { level=parseLevel(record.levelLabel); } catch(e) { fail(name,index+1,e.message); }
      const root=record.rootCode;
      if (!root.trim() || ['__proto__','constructor','prototype'].includes(root)) fail(name,index+1,'Mã NVL chính / 主件編碼無效');
      if (level===0) {
        if (Object.hasOwn(bom,root)) fail(name,index+1,'重複主件 / SKU gốc trùng');
        current=root; bom[root]=[];
      }
      if (current!==root || !bom[root]) fail(name,index+1,'缺少主件 / Thiếu SKU gốc');
      const previous=bom[root].at(-1);
      if (level>0 && (!record.itemCode.trim() || level>(previous?.level??-1)+1)) fail(name,index+1,'缺料號或父層 / Thiếu mã hoặc cấp cha');
      if (level>1) for(const field of numericFields) record[field]='';
      else for(const field of numericFields) if(record[field]!==''&&!numeric(record[field])) fail(name,index+1,`${field}: 數值格式無效 / Số không hợp lệ`);
      bom[root].push({...record,level,source:{file:text(provenance.file),worksheet:name,row:index+1}});
      if (++total>200000) fail(name,index+1,'BOM_ROW_LIMIT');
    }
  }
  if (!total) throw Error('BOM_NO_ERP_ROWS');
  for(const root of Object.keys(bom)) { try { bom[root]=identify(bom[root]); } catch(e) { throw Error(`${root}: ${e.message}`); } }
  return bom;
}
export function workbookMatrices(XLSX,book) {
  return book.SheetNames.map(name=>{
    const sheet=book.Sheets[name],rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:true}),raw=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:true});
    let indexes=[];
    rows.forEach((row,i)=>{const candidate=columns.map(c=>row.map(header).indexOf(header(c)));if(candidate.every(n=>n>=0)){indexes=candidate.slice(7);return;}for(const column of indexes)if(typeof raw[i]?.[column]==='number')row[column]=String(raw[i][column]);});
    return {name,rows};
  });
}
export function parseWorkbook(XLSX, book, provenance) {
  return parseMatrices(workbookMatrices(XLSX,book),provenance);
}
export function validate(bom) {
  if (!bom || Array.isArray(bom) || typeof bom!=='object') throw Error('BOM_INVALID');
  for(const [root,rows] of Object.entries(bom)) {
    if(!root || !Array.isArray(rows) || !rows.length || rows[0].level!==0) throw Error('BOM_ROOT_INVALID');
    for(const [index,row] of rows.entries()) {
      if(row.rootCode!==root||!Number.isInteger(row.level)||row.level<0||index>0&&(row.level===0||row.level>rows[index-1].level+1)) throw Error('BOM_LEVEL_INVALID');
      if(fields.some(f=>typeof row[f]!=='string')||parseLevel(row.levelLabel)!==row.level||row.level>0&&!row.itemCode.trim()) throw Error('BOM_FIELDS_INVALID');
      if(row.level>1&&numericFields.some(f=>row[f]!=='')) throw Error('BOM_DEEP_NUMERIC_FORBIDDEN');
      if(row.level<=1&&numericFields.some(f=>row[f]!==''&&!numeric(row[f]))) throw Error('BOM_NUMBER_INVALID');
    }
    const inferred=identify(rows);
    if(rows.some((r,i)=>r.id!==inferred[i].id||r.parentId!==inferred[i].parentId||!same(r.path,inferred[i].path))) throw Error('BOM_IDENTITY_INVALID');
  }
  return true;
}
export const semantic = bom => Object.fromEntries(Object.entries(bom).map(([root,rows])=>[root,rows.map(r=>Object.fromEntries([...fields,'id','parentId','level','path'].map(f=>[f,r[f]])))]));
// Canonical digest replaces the full optimistic-import baseline on the wire.
// Arrays retain occurrence order; object keys are independent of insertion order.
export const canonical = value => value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
export async function semanticDigest(bom) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(semantic(bom))));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export const exportRows = bom => [columns,...Object.values(bom).flatMap(rows=>rows.map(r=>fields.map(f=>numericFields.includes(f)&&r.level>1?'':r[f])))];
// A partial report never implies deletion. Match immutable occurrence paths,
// retain omitted siblings/subtrees, and append new occurrences to their parent.
export function mergeOccurrences(old,incoming) {
  if(!old.length)return copy(incoming);
  const rows=new Map(old.map(row=>[row.id,copy(row)])),children=new Map();
  const append=row=>{if(!children.has(row.parentId))children.set(row.parentId,[]);children.get(row.parentId).push(row.id);};
  old.forEach(append);
  for(const row of incoming){if(!rows.has(row.id))append(row);rows.set(row.id,copy(row));}
  const result=[],visit=id=>{const row=rows.get(id);result.push(row);for(const child of children.get(id)||[])visit(child);};
  visit(old[0].id);return result;
}
export function compare(base,incoming,{replaceAll=false,incremental=true}={}) {
  validate(incoming);
  const changes=[];
  for(const root of new Set([...Object.keys(incoming),...(replaceAll?Object.keys(base):[])])) {
    const old=base[root]||[],next=replaceAll||!incremental?incoming[root]||[]:mergeOccurrences(old,incoming[root]||[]),oldIds=new Map(old.map(r=>[r.id,r]));
    // Structural additions/deletions/order changes are accepted as one root group.
    // This keeps every parent and descendant together, without guessing moved identities.
    if(!same(old.map(r=>r.id),next.map(r=>r.id))) {
      changes.push({kind:'structure',root,before:copy(old),after:copy(next),decision:'keep'}); continue;
    }
    for(const row of next) for(const field of editableFields) {
      const previous=oldIds.get(row.id);
      if(row.level>1&&numericFields.includes(field)) continue;
      if(previous[field]!==row[field]) changes.push({kind:'field',root,id:row.id,field,before:previous[field],after:row[field],decision:'keep'});
    }
  }
  return {base:copy(base),incoming:copy(incoming),changes,replaceAll};
}
export function applyComparison(current,batch) {
  if(!same(semantic(current),semantic(batch.base))) throw Error('BOM_IMPORT_BASE_CHANGED');
  const next=copy(current);
  for(const change of batch.changes) {
    if(change.decision==='keep') continue;
    if(change.kind==='structure') { if(change.decision!=='accept') throw Error('BOM_STRUCTURE_ERP_ONLY'); if(change.after.length) next[change.root]=copy(change.after);else delete next[change.root]; }
    else {
      if(!['accept','edit'].includes(change.decision)) throw Error('BOM_DECISION_REQUIRED');
      const row=next[change.root].find(r=>r.id===change.id);
      row[change.field]=change.decision==='edit'?text(change.value):change.after;
    }
  }
  validate(next); return next;
}
export function createIndex(bom) {
  const all=Object.values(bom).flat(), byId=new Map(all.map(r=>[r.id,r])), byCode=new Map();
  for(const row of all) { const code=row.level===0?row.rootCode:row.itemCode; if(!byCode.has(code)) byCode.set(code,[]); byCode.get(code).push(row); }
  const occurrences=code=>byCode.get(code)||[];
  return {
    occurrences,byId,
    search(query='') { const tokens=normalize(query).split(/\s+/).filter(Boolean);return [...byCode].filter(([code,rows])=>tokens.every(q=>normalize(code+' '+rows.map(r=>r.itemName+' '+r.specification).join(' ')).includes(q))).map(([code,rows])=>({code,name:rows[0].itemName,specification:rows[0].specification,roots:new Set(rows.map(r=>r.rootCode)).size,count:rows.length,levels:[...new Set(rows.map(r=>r.level))]})); },
    parents(code){return occurrences(code).filter(r=>r.parentId).map(row=>({row,parent:byId.get(row.parentId)}));},
    children(code){const groups=new Map();for(const row of occurrences(code)){const source=bom[row.rootCode]||[],at=source.indexOf(row),descendants=[];for(let i=at+1;i<source.length&&source[i].level>row.level;i++)descendants.push(source[i]);const signature=JSON.stringify(descendants.map(r=>[r.level-row.level,r.ordinal,r.itemCode,r.itemName,r.specification,r.unit,...numericFields.map(f=>r.level<=1?r[f]:'')]));if(!groups.has(signature))groups.set(signature,{rows:descendants,positions:[]});groups.get(signature).positions.push(row);}return [...groups.values()];},
    forest(code){return [...new Set(occurrences(code).map(r=>r.rootCode))].map(root=>({root,rows:bom[root]}));}
  };
}
// Read-only reference audit: legacy code-only selections are never silently remapped.
export function auditReferences(values,bom) {
  const issues=[],seen=new Set();
  function walk(value,path) {
    if(!value||typeof value!=='object')return;
    if(value.bomSelections||value.bomProductCode) {
      const selections=value.bomSelections||{[value.bomProductCode]:value.bomItems||[]};
      for(const [root,ids]of Object.entries(selections)) for(const reference of Array.isArray(ids)?ids:[]) {
        const rows=(bom[root]||[]).filter(r=>r.level===1),exact=rows.filter(r=>r.id===reference);
        const candidates=rows.filter(r=>r.itemCode===reference);
        if(exact.length===1)continue;
        const status=!bom[root]?'missing-root':candidates.length>1?'ambiguous':candidates.length===1?'legacy-unmapped':'missing-occurrence';
        const item={path:path.join('/'),operationId:value.id||'',root,reference,status,candidateIds:candidates.map(r=>r.id)};
        const key=JSON.stringify(item);if(!seen.has(key)){seen.add(key);issues.push(item);}
      }
    }
    for(const [key,next]of Object.entries(value)) if(key!=='bomSelections')walk(next,[...path,key]);
  }
  for(const [key,raw]of Object.entries(values)) if(key!=='bomMasterControl'&&key!=='bomOverrides'&&(/process|approvalVersions|dispatch/i.test(key))) {try{walk(typeof raw==='string'?JSON.parse(raw):raw,[key]);}catch{ /* Unrelated non-JSON setting. */ }}
  return issues;
}

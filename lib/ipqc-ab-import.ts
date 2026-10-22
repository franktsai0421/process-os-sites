import { activeAb, copyAb, nextAbCode, openAb, scopeKey, type AbCatalog, type AbControl,
  type AbItem, type AbRule, type AbSnapshot, type AbVersion } from './ipqc-ab';

export const AB_LATEST_SHA = 'e5bb57abfbe5ea9221a7e15ed1fd8ab964b9211968fdae872facc7ece8c712b3';
export const AB_LEGACY_SHA = 'a8549d51092026364efaff759bceac327a3e113ceb795cc3a0bd7fe8e4246a78';
export type AbImportVariant = { key:string; line:string; group:string; stageCode:string;
  errorCode:string; errorName:string; standard:string; methodText:string; sourceEnabled:string;
  sourceTool:string; sourceMethod:string; sourceFrequency:string; sourceVersion:string;
  sourceChangedAt:string; sourceReason:string; sourceCreator:string; sourceNote:string;
  sourceRows:number[]; sourceItemCodes:string[]; productCodes:string[]; blocked:boolean };
export type AbImportPayload = { source:{fileName:string;sha256:string;rows:number}; variants:AbImportVariant[];
  legacy?: {sha256:string;items:AbItem[];errors:AbSnapshot['errors']}; catalog:AbCatalog };
type Entry = { key?:string; code?:string; errorCode?:string; sourceRows?:number[]; status:string;
  reasons?:string[]; fields?:string[]; productCodes?:string[]; sourceItemCodes?:string[] };
const same = (a:unknown,b:unknown) => JSON.stringify(a) === JSON.stringify(b);
const norm = (text:string) => text.normalize('NFC');
const compare=(a:unknown,b:unknown)=>JSON.stringify(a).localeCompare(JSON.stringify(b));
const catalogSignature=(c:AbCatalog)=>JSON.stringify([
  c.groups.map(g=>[g.line,g.name]).sort(compare),
  c.products.map(p=>[p.code,p.name,p.line,p.category,[...p.stages].sort()]).sort(compare),
  c.stages.map(s=>[s.line,s.code,s.name]).sort(compare)]);
const sourceFields = ['sourceTool','sourceMethod','sourceFrequency','sourceVersion','sourceChangedAt',
  'sourceReason','sourceCreator','sourceNote'] as const;
const editable = ['standard','methodText','isEnabled','rules','productCodes'] as const;
export function sourceRules(raw:string, code:string):AbRule[] {
  const aql = /^AQL\s*:\s*(\d+(?:\.\d+)?)$/i.exec(raw);
  if (aql && Number(aql[1])>0) return [{id:`source:${code}:1`,cadence:'batch',kind:'aql',value:aql[1]}];
  const fixed = /^(\d+)\s*pcs\s*\/\s*lô(?:\s*SX)?$/i.exec(raw);
  return fixed && Number(fixed[1])>0 ? [{id:`source:${code}:1`,cadence:'batch',kind:'fixed',value:fixed[1]}] : [];
}
function baseline(v:AbImportVariant, code:string):Partial<AbItem> {
  return { standard:v.standard, methodText:v.methodText, isEnabled:v.sourceEnabled==='YES',
    rules:sourceRules(v.sourceFrequency,code),productCodes:[...v.productCodes],
    ...Object.fromEntries(sourceFields.map(f=>[f,v[f]])) };
}
const unmodified = (item:AbItem, base:Partial<AbItem>) => editable.every(f=>same(item[f],base[f])) &&
  !item.standardPhotos.length && !item.methodPhotos.length && item.inspectionMode==='visual' &&
  !item.equipmentId && !item.equipmentSnapshot && !item.reason && !item.deleted &&
  sourceFields.every(f=>same(item[f]||'',base[f]||''));

/** Pure, atomic group-draft merger. No assets or approved snapshots are ever rewritten. */
export function mergeAbImport(input:AbControl, catalog:AbCatalog, payload:AbImportPayload,
  actor:{id:string;name:string}, at:string) {
  if (payload?.source?.sha256!==AB_LATEST_SHA || payload.source.fileName!=='IPQC_CHUAN_29092026_V.xlsx' ||
      payload.source.rows!==1461 || !Array.isArray(payload.variants) || payload.variants.length>5000 ||
      !payload.catalog || catalogSignature(payload.catalog)!==catalogSignature(catalog)) throw Error('新版來源或生效主資料不一致；停止匯入');
  const control=copyAb(input), entries:Entry[]=[], errors:Entry[]=[];
  const keys=new Set<string>();
  for(const v of payload.variants) {
    if(!v || !/^[a-f0-9]{64}$/.test(v.key) || keys.has(v.key) || typeof v.standard!=='string' ||
      typeof v.errorName!=='string' || typeof v.methodText!=='string' || typeof v.blocked!=='boolean' ||
      sourceFields.some(f=>typeof v[f]!=='string') || !Array.isArray(v.sourceRows) || !v.sourceRows.length ||
      v.sourceRows.some(r=>!Number.isInteger(r)||r<2||r>1462) || !Array.isArray(v.sourceItemCodes) ||
      !v.sourceItemCodes.length || v.sourceItemCodes.some(c=>!c.startsWith(v.errorCode+'-')||!/^\d+$/.test(c.slice(v.errorCode.length+1))) ||
      !Array.isArray(v.productCodes) || new Set(v.productCodes).size!==v.productCodes.length)
      throw Error('來源項目格式或父子關係錯誤');
    keys.add(v.key);
    if(v.productCodes.length && (v.blocked || !['YES','NO'].includes(v.sourceEnabled) ||
      !catalog.groups.some(g=>g.line===v.line&&g.name===v.group) ||
      !catalog.stages.some(s=>s.line===v.line&&s.code===v.stageCode) ||
      !v.errorCode.startsWith(`${v.line}-${v.group}-${v.stageCode.slice(2)}-L`) ||
      !/^\d+$/.test(v.errorCode.slice(`${v.line}-${v.group}-${v.stageCode.slice(2)}-L`.length)) ||
      v.productCodes.some(code=>{
        const matches=catalog.products.filter(p=>p.code===code);
        return matches.length!==1||matches[0].line!==v.line||matches[0].category!==v.group||!matches[0].stages.includes(v.stageCode);
      }))) throw Error('來源產品、群組、工段或基本資料衝突；停止匯入');
  }
  // Independently reject conflicting shared fields; the parser's blocked flag is not trusted.
  for (const v of payload.variants.filter(v=>v.productCodes.length)) {
    if(payload.variants.some(o=>o.errorCode===v.errorCode &&
      (o.errorName!==v.errorName||o.line!==v.line||o.group!==v.group||o.stageCode!==v.stageCode)))
      throw Error('錯誤代碼有不同父項基本資料，不能合併');
    const conflicts=payload.variants.filter(o=>o.errorCode===v.errorCode&&norm(o.standard)===norm(v.standard)&&o.key!==v.key);
    if(conflicts.length) throw Error('相同標準有共用基本資料衝突，不能合併');
  }
  const legacy=payload.legacy;
  if(legacy && (legacy.sha256!==AB_LEGACY_SHA || !Array.isArray(legacy.items)||!Array.isArray(legacy.errors)))
    throw Error('舊資料僅能作已匯入身分核對');
  const legacyItems=new Map((legacy?.items||[]).map(i=>[i.id,i]));
  const legacyErrors=new Map((legacy?.errors||[]).map(e=>[e.id,e]));
  const legacyBase=(item:AbItem, version:AbVersion):AbItem|undefined => {
    const prior=legacyItems.get(item.id), error=version.snapshot.errors.find(e=>e.id===item.errorId);
    const parent=legacyErrors.get(prior?.errorId||'');
    return prior && error && parent && prior.id===`ipqc-ab-item:${prior.code}` && prior.code===item.code &&
      prior.errorId===item.errorId && parent.code===error.code && same(prior.sourceRows,item.sourceRows) &&
      version.history.some(h=>h.action==='initial-import'&&h.comment===AB_LEGACY_SHA) ? prior : undefined;
  };
  const scopeKeys=new Set([...payload.variants.filter(v=>v.productCodes.length).map(v=>scopeKey(v.line,v.group)),
    ...Object.keys(control.scopes)]);
  for(const key of [...scopeKeys].sort()) {
    const relevant=payload.variants.filter(v=>scopeKey(v.line,v.group)===key);
    const valid=relevant.filter(v=>v.productCodes.length).sort((a,b)=>a.errorCode.localeCompare(b.errorCode)||a.key.localeCompare(b.key));
    let scope=control.scopes[key];
    if(!scope && !valid.length) continue;
    if(!scope) { const v=valid[0]; scope={line:v.line,group:v.group,activeVersionId:null,versions:[]}; }
    let version=openAb(scope);
    if(version && version.status!=='draft') {
      for(const v of valid) entries.push({key:v.key,status:'deferred',sourceRows:v.sourceRows,reasons:['scope_pending']});
      continue;
    }
    const newlyOpened=!version;
    if(!version) {
      const active=activeAb(scope);
      version={id:crypto.randomUUID(),number:Math.max(0,...scope.versions.map(v=>v.number))+1,status:'draft',revision:1,
        snapshot:copyAb(active?.snapshot||{errors:[],items:[]}),baseVersionId:active?.id||null,
        creatorId:actor.id,creatorName:actor.name,createdAt:at,updatedAt:at,history:[]};
    }
    const before=JSON.stringify(version.snapshot), snapshot=version.snapshot;
    const oldItems=[...snapshot.items];
    const bases=new Map(oldItems.map(i=>[i.id,i.sourceImport?.baseline||legacyBase(i,version!)]));
    const used=new Set<string>();
    for(const v of valid) {
      const baseName=norm(v.standard);
      const candidates=oldItems.filter(item=>{
        const parent=snapshot.errors.find(e=>e.id===item.errorId), base=bases.get(item.id);
        return parent?.code===v.errorCode && (item.sourceImport?.key===v.key ||
          base && norm(base.standard||'')===baseName);
      });
      // A changed source standard can retain identity only with a unique parent/source alias
      // and a verified untouched legacy baseline. Never infer ownership for manual assets.
      if(!candidates.length && relevant.filter(o=>o.errorCode===v.errorCode).length===1) {
        const clean=oldItems.filter(item=>{
          const parent=snapshot.errors.find(e=>e.id===item.errorId), base=bases.get(item.id);
          const aliases=item.sourceImport?.sourceItemCodes||[item.code];
          return parent?.code===v.errorCode && base && aliases.some(c=>v.sourceItemCodes.includes(c)) && unmodified(item,base);
        });
        if(clean.length===1) candidates.push(clean[0]);
      }
      const ambiguous=oldItems.filter(item=>{
        const parent=snapshot.errors.find(e=>e.id===item.errorId), base=bases.get(item.id);
        return parent?.code===v.errorCode && !candidates.includes(item) &&
          (norm(item.standard)===baseName || base && item.sourceRows.some(r=>v.sourceRows.includes(r)));
      });
      if(candidates.length>1 || candidates.some(i=>used.has(i.id)) || (!candidates.length&&ambiguous.length)) {
        entries.push({key:v.key,errorCode:v.errorCode,sourceRows:v.sourceRows,status:'deferred',
          reasons:['identity_or_asset_ambiguous'],code:[...candidates,...ambiguous].map(i=>i.code).join(';')}); continue;
      }
      let item=candidates[0];
      if(item?.deleted) {
        used.add(item.id); entries.push({key:v.key,code:item.code,status:'preserved',reasons:['manual_or_prior_deletion']}); continue;
      }
      let parent=snapshot.errors.find(e=>e.code===v.errorCode);
      if(parent && (parent.deleted||parent.line!==v.line||parent.group!==v.group||parent.stageCode!==v.stageCode)) {
        entries.push({key:v.key,status:'deferred',reasons:['error_identity_conflict']});continue;
      }
      const priorName=parent?.sourceImport?.nameBaseline||legacyErrors.get(parent?.id||'')?.name;
      const nameConflict=parent && parent.name!==v.errorName && parent.name!==priorName;
      if(!parent) {
        const reserved=control.reservedErrorCodes.includes(v.errorCode)||Object.values(control.scopes).some(s=>s.versions.some(x=>x.snapshot.errors.some(e=>e.code===v.errorCode)));
        if(reserved) {entries.push({key:v.key,status:'deferred',reasons:['error_code_reserved']});continue;}
        parent={id:crypto.randomUUID(),code:v.errorCode,line:v.line,group:v.group,stageCode:v.stageCode,
          name:v.errorName,sourceRows:[],deleted:false};
        snapshot.errors.push(parent); control.reservedErrorCodes.push(parent.code);
        errors.push({code:parent.code,status:'added'});
      }
      if(!nameConflict) parent.name=v.errorName;
      parent.sourceImport={sha256:payload.source.sha256,nameBaseline:v.errorName};
      const fields:string[]=nameConflict?['errorName']:[];
      const isNew=!item;
      if(!item) {
        const code=nextAbCode(control,'item',`${parent.code}-`);
        item={id:crypto.randomUUID(),code,errorId:parent.id,standard:v.standard,methodText:v.methodText,
          inspectionMode:'visual',equipmentId:'',equipmentSnapshot:null,isEnabled:v.sourceEnabled==='YES',
          rules:sourceRules(v.sourceFrequency,code),standardPhotos:[],methodPhotos:[],productCodes:[...v.productCodes],
          sourceRows:v.sourceRows,...Object.fromEntries(sourceFields.map(f=>[f,v[f]])),
          sourceTool:v.sourceTool,sourceMethod:v.sourceMethod,sourceFrequency:v.sourceFrequency,reason:'',deleted:false};
        snapshot.items.push(item);
      }
      const old=JSON.stringify(item), prior=bases.get(item.id), nextBase=baseline(v,item.code);
      if(!isNew) for(const field of editable) {
        const equal=field==='productCodes' ? same([...(item[field] as string[])].sort(),[...((prior?.[field]||[]) as string[])].sort()) : same(item[field],prior?.[field]);
        if(equal) Object.assign(item,{[field]:nextBase[field]});
        else if(!same(item[field],nextBase[field])) fields.push(field);
      }
      // Source metadata is separate from editable/manual fields. Record former source keys for provenance.
      item.sourceRows=[...v.sourceRows];
      for(const field of sourceFields) Object.assign(item,{[field]:v[field]});
      const previousKeys=[...(item.sourceImport?.previousKeys||[])];
      if(item.sourceImport?.key&&item.sourceImport.key!==v.key&&!previousKeys.includes(item.sourceImport.key)) previousKeys.push(item.sourceImport.key);
      item.sourceImport={key:v.key,sha256:payload.source.sha256,sourceItemCodes:[...v.sourceItemCodes],baseline:nextBase,previousKeys};
      used.add(item.id);
      entries.push({key:v.key,code:item.code,errorCode:v.errorCode,sourceRows:v.sourceRows,sourceItemCodes:v.sourceItemCodes,
        status:isNew?'added':old!==JSON.stringify(item)?'updated':'unchanged',fields,
        productCodes:item.productCodes,reasons:fields.length?['manual_content_preserved']:[]});
    }
    for(const item of oldItems.filter(i=>!used.has(i.id))) {
      const parent=snapshot.errors.find(e=>e.id===item.errorId), base=bases.get(item.id);
      const stillPresent=relevant.some(v=>v.errorCode===parent?.code &&
        (norm(v.standard)===norm(base?.standard||item.standard) || v.sourceRows.some(r=>item.sourceRows.includes(r))));
      if(base && !stillPresent && unmodified(item,base)) {
        item.deleted=true;entries.push({code:item.code,status:'deleted',reasons:['confirmed_import_absent_unmodified']});
      } else entries.push({code:item.code,status:'preserved',reasons:[stillPresent?'excluded_or_deferred_source_preserved':base?'manual_content_preserved':'manual_or_unknown_origin']});
    }
    // Parent source rows include every source variant, even excluded variants; manual names remain intact.
    for(const parent of snapshot.errors) {
      const sourceRows=[...new Set(relevant.filter(v=>v.errorCode===parent.code).flatMap(v=>v.sourceRows))].sort((a,b)=>a-b);
      if(sourceRows.length && parent.sourceRows.length) parent.sourceRows=sourceRows;
      else if(sourceRows.length && errors.some(e=>e.code===parent.code)) parent.sourceRows=sourceRows;
    }
    if(before!==JSON.stringify(snapshot)) {
      if(newlyOpened) scope.versions.push(version); else version.revision+=1;
      version.updatedAt=at; version.history.push({action:'reimport',actorId:actor.id,actorName:actor.name,at,comment:payload.source.sha256});
      control.scopes[key]=scope;
    }
  }
  const uniqueRelations=Object.values(control.scopes).flatMap(s=>openAb(s)?.snapshot.items||[])
    .filter(i=>!i.deleted&&i.sourceImport?.sha256===payload.source.sha256).reduce((n,i)=>n+i.productCodes.length,0);
  const changed=!same(input,control);
  if(changed) control.source={...payload.source,importedRelations:uniqueRelations,builtAt:at};
  return {control,changed,entries,errors,uniqueRelations,summary:{added:entries.filter(e=>e.status==='added').length,
    updated:entries.filter(e=>e.status==='updated').length,deleted:entries.filter(e=>e.status==='deleted').length,
    deferred:entries.filter(e=>e.status==='deferred').length,preserved:entries.filter(e=>e.status==='preserved').length,
    unchanged:entries.filter(e=>e.status==='unchanged').length,manualDifferences:entries.filter(e=>e.fields?.length).length,
    addedErrors:errors.length,uniqueRelations}};
}

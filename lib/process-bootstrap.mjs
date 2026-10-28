import {permitsAny} from './site-security.mjs';

const productFields = ['code','name','category','specification','unit','line','stages'];
const pick = (row, fields) => Object.fromEntries(fields.filter(key=>row[key]!==undefined).map(key=>[key,structuredClone(row[key])]));
// Current approved catalogs, not the archived executable seed files. These are
// delivery-only dependencies for existing modules; no drafts/history/auth rows.
export async function runtimeCatalog(values, canRead, readLegacyBom, purpose) {
  const master=JSON.parse(values.masterDataControl||'null');
  const dependency=['dashboard.view','player.view','dispatch.view','status.view','editor.view','bom.view','lines.view','templates.view'];
  const shared=await permitsAny(dependency,canRead);
  const scopes=[];
  if((!purpose||purpose.scopes.includes('AB'))&&(shared||await canRead('ab.view')||await canRead('approval.view')))scopes.push('AB');
  if((!purpose||purpose.scopes.includes('C'))&&(shared||await canRead('c.view')||await canRead('approval.view')))scopes.push('C');
  const products=[],lines=[],groups=[];
  for(const scope of scopes){
    const active=master?.active?.[scope];
    if(!active||!Array.isArray(active.products)||!Array.isArray(active.lines))throw Error('BOOTSTRAP_CATALOG_UNAVAILABLE');
    products.push(...active.products.map(row=>pick(row,productFields)));
    lines.push(...active.lines.map(row=>({code:row.code,name:row.name,stages:(row.stages||[]).map(stage=>pick(stage,['code','name','machine','assetNumber','operators']))})));
    groups.push(...(active.categoryGroups||[]).map(row=>pick(row,['line','name'])));
  }
  const categories=[...new Set([...groups.map(row=>row.name),...products.map(row=>row.category)].filter(Boolean))];
  const mayBom=(!purpose||purpose.includeBom)&&await permitsAny(['bom.view','editor.view','player.view','status.view','dispatch.view'],canRead);
  const override=mayBom?JSON.parse(values.bomOverrides||'null'):null;
  // A legacy delta cannot replace an absent base BOM. Refuse to manufacture an
  // empty authoritative BOM; a compatibility reader must supply its base first.
  const bom=!mayBom?{}:override?.replaceAll===true?override.data:{...await readLegacyBom(),...override};
  const routes=Object.fromEntries(products.map(row=>[row.code,{...row,stages:row.stages||[],routeCode:(row.stages||[]).join(' / ')}]));
  return {
    format:'PROCESS_RUNTIME_CATALOG_V1',loadedScopes:scopes,
    imported:{meta:{productCount:products.length,categoryCount:categories.length,bomProductCount:Object.keys(bom).length,bomRowCount:Object.values(bom).reduce((n,rows)=>n+rows.length,0),productSource:'目前已核准主資料',bomSource:!mayBom?'未載入':override?.replaceAll===true?'目前 BOM 全量版本':'已核對 R1 BOM 與目前增量'},categories,products:products.map(row=>pick(row,['code','name','category','specification','unit'])),bom},
    routing:{meta:{source:'目前已核准主資料',finishedCount:products.filter(row=>row.line==='A'||row.line==='B').length,semiFinishedCount:products.filter(row=>row.line==='C').length,matchedCategoryCount:products.filter(row=>row.category&&row.category!=='待補').length,unmatchedCount:products.filter(row=>!row.category||row.category==='待補').length},lines,productRoutes:routes,semiFinishedRoutes:{},categoryRouteCounts:{},unmatched:products.filter(row=>!row.category||row.category==='待補').map(row=>row.code)},
    lineC:{products:products.filter(row=>row.line==='C'),stages:lines.find(row=>row.code==='C')?.stages||[]},
  };
}

// Server-only compatibility read of the already approved, immutable R1 source.
// Parse a JSON assignment, never execute a script. No unfiltered source is sent.
export async function legacyBom(bucket, pin) {
  const object=await bucket.get('company-assets/objects/'+pin.sha256);
  if(!object||object.size!==pin.bytes)throw Error('BOOTSTRAP_LEGACY_SOURCE_MISSING');
  const raw=await object.text(),bytes=new TextEncoder().encode(raw);
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(bytes.length!==pin.bytes||sha!==pin.sha256)throw Error('BOOTSTRAP_LEGACY_SOURCE_CORRUPT');
  const match=/^\s*window\.IMPORTED_DATA\s*=\s*([\s\S]*?)\s*;?\s*$/.exec(raw);
  if(!match)throw Error('BOOTSTRAP_LEGACY_SOURCE_FORMAT');
  const value=JSON.parse(match[1]);
  if(!value.bom||typeof value.bom!=='object'||Array.isArray(value.bom)||!Object.values(value.bom).every(Array.isArray))throw Error('BOOTSTRAP_LEGACY_BOM_INVALID');
  return value.bom;
}

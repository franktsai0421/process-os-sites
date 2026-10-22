import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {validateImageRecords,validateImageTransition,webManifest,readWebImage,imageUrl} from './canonical-images.mjs';

export const schemaVersion=1, bootstrapVersion=1;
export const domainFiles={products:'products.json',categories:'categories.json',lines:'lines.json',stages:'stages.json',parts:'parts.json',bom:'bom.json',processes:'processes.json',processVersions:'process-versions.json',masterVersions:'master-versions.json',roles:'permissions/role-templates.json',dispatch:'dispatch.json',settings:'settings.json',fqc:'quality/fqc.json',iqc:'quality/iqc.json',ipqc:'quality/ipqc.json',assets:'assets/manifest.json'};
export class CanonicalError extends Error { constructor(code,domain){super(code+(domain?': '+domain:''));this.code=code;this.domain=domain;} }
export const sha256=value=>crypto.createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));return value;}
export const serialize=value=>JSON.stringify(stable(value),null,2)+'\n';
const id=(kind,...keys)=>kind+':'+sha256(keys).slice(0,24);
const parse=value=>typeof value==='string'?JSON.parse(value):value;
const copy=value=>JSON.parse(JSON.stringify(value));
const privateField=/^(password|passwordHash|.*Secret|.*Token|secret|token|privateKey|apiKey|session|sessionType|cookie|authorization|email|phone|telephone|address|creatorId|creatorName|reviewerId|reviewerName|actor|actorId|actorName|createdBy|updatedBy|deletedBy|ownerId|ownerName|history|audit|sourceFile|sourcePath|absolutePath)$/i;
export function sanitize(value,options={},key='') {
  if(Array.isArray(value))return value.map(item=>sanitize(item,options,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!privateField.test(k)).map(([k,v])=>[k,sanitize(v,options,k)]));
  if(typeof value!=='string')return value;
  if(/^[{[]/.test(value.trim())){let nested;try{nested=JSON.parse(value);}catch{}if(nested&&typeof nested==='object')return JSON.stringify(stable(sanitize(nested,options,key)));}
  if(/(?:[A-Z]:[\\/]|\/Users\/|\/home\/)/i.test(value))return '[local path removed]';
  if(/^(?:data:(?:image|video)\/|asset:)/.test(value)||/#asset-[a-f0-9]{64}$/.test(value)||(['media','src','asset'].includes(key)&&value&&/^(?:https?:\/\/|\/?(?:process\/)?assets\/)/.test(value)))return options.asset?options.asset(value):value;
  for(const name of options.personalNames||[])if(name.length>1)value=value.replaceAll(name,'[identity removed]');
  if(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value))throw new CanonicalError('UNCLASSIFIED_PERSONAL_DATA');
  return value;
}
export function loadBundled(root){const context={window:{}};vm.createContext(context);for(const file of ['imported-data.js','line-c-master.js','line-process-data.js'])vm.runInContext(fs.readFileSync(path.join(root,'public/process/data',file),'utf8'),context);return context.window;}
export function projectValues(values,{root,roleDefaults,previous={},assetSink}={}) {
  const parsed=Object.fromEntries(Object.entries(values).map(([k,v])=>[k,parse(v)])),control=parsed.masterDataControl||{active:{},versions:[]};
  const domains=Object.fromEntries(Object.keys(domainFiles).map(k=>[k,[]]));
  const assets=new Map((previous.assets||[]).map(r=>[r.id,r]));
  const users=parsed.platformUsers||[];
  const personalNames=users.map(u=>String(u.name||'')).filter(n=>!/^ADMIN$|^RD|STAFF|管理員|主管|人員/i.test(n));
  const asset=value=>{
    let digest,mime='application/octet-stream',bytes=0,content;
    const preserved=value.match(/^(?:asset:)([a-f0-9]{64})$/)||value.match(/#asset-([a-f0-9]{64})$/);
    if(preserved){digest=preserved[1];if(!assets.has('asset:'+digest))throw new CanonicalError('ASSET_INDEX_MISSING');return 'asset:'+digest;}
    if(value.startsWith('data:')){const match=value.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);if(!match)throw new CanonicalError('UNPORTABLE_ASSET');mime=match[1];content=Buffer.from(match[2],'base64');digest=sha256(content);bytes=content.length;}
    else if(/^https?:/.test(value)){const url=new URL(value);if(url.username||url.password||[...url.searchParams.keys()].some(k=>/token|secret|password|signature|authorization/i.test(k)))throw new CanonicalError('SENSITIVE_ASSET_REFERENCE');digest=sha256(value);}
    else {const relative=value.replace(/^\//,'').replace(/^process\//,'');const file=path.resolve(root,'public/process',relative);const allowed=path.resolve(root,'public/process/assets')+path.sep;if(!file.startsWith(allowed))throw new CanonicalError('ASSET_PATH_ESCAPES_PROJECT');if(fs.existsSync(file)){content=fs.readFileSync(file);digest=sha256(content);bytes=content.length;mime=/\.svg$/i.test(file)?'image/svg+xml':/\.png$/i.test(file)?'image/png':/\.jpe?g$/i.test(file)?'image/jpeg':'application/octet-stream';}else digest=sha256(value);}
    const record={id:'asset:'+digest,sha256:digest,mime,bytes,storage:content?'controlled-local-package':'placeholder-only',placeholder:'/process/assets/canonical-placeholder.svg'};
    const prior=assets.get(record.id);if(prior&&prior.sha256!==digest)throw new CanonicalError('ASSET_ID_HASH_CONFLICT');
    const revived={...prior,...record};delete revived.deletedAt;assets.set(record.id,revived);if(content&&assetSink)assetSink(record,content);return record.id;
  };
  const clean=value=>sanitize(value,{asset,personalNames});
  const productMap=new Map(),categoryMap=new Map(),lineMap=new Map(),stageMap=new Map();
  const historical=(control.versions||[]).filter(v=>['approved','superseded'].includes(v.status)&&['AB','C'].includes(v.scope));
  function catalog(scope,catalog,active){
    if(!catalog)return;
    for(const line of catalog.lines||[]){const lineId=line.id||'line:'+line.code;const {stages=[],...data}=line;const record={id:lineId,scope,code:line.code,data:clean({...data,id:lineId}),stageIds:stages.map(stage=>'stage:'+(typeof stage==='string'?stage:stage.code))};if(active||!lineMap.has(line.code))lineMap.set(line.code,record);for(const stage of stages){const data=typeof stage==='string'?{code:stage,name:stage}:stage;const stageId=data.id||'stage:'+data.code;const record={id:stageId,lineId,code:data.code,data:clean({...data,id:stageId})};if(active||!stageMap.has(data.code))stageMap.set(data.code,record);}}
    for(const group of catalog.categoryGroups||[]){const lineId='line:'+group.line;const key=scope+'\0'+group.line+'\0'+group.name;const categoryId=group.id||id('category',scope,group.line,group.name);categoryMap.set(key,{id:categoryId,scope,lineId,name:group.name,data:clean({...group,id:categoryId})});}
    for(const product of catalog.products||[]){const key=scope+'\0'+product.line+'\0'+product.category;let category=categoryMap.get(key);if(!category){const categoryId=id('category',scope,product.line,product.category);category={id:categoryId,scope,lineId:'line:'+product.line,name:product.category,data:{id:categoryId,line:product.line,name:product.category}};categoryMap.set(key,category);}const productId=product.id||'product:'+product.code;const record={id:productId,scope,code:product.code,categoryId:category.id,lineId:'line:'+product.line,stageIds:(product.stages||[]).map(code=>'stage:'+code),archived:!active,data:clean({...product,id:productId})};if(active||!productMap.has(product.code))productMap.set(product.code,record);}
  }
  for(const version of historical)catalog(version.scope,version.snapshot,false);
  for(const scope of ['AB','C'])catalog(scope,control.active?.[scope],true);
  domains.products=[...productMap.values()];domains.categories=[...categoryMap.values()];domains.lines=[...lineMap.values()];domains.stages=[...stageMap.values()];
  const bundled=loadBundled(root),overrides=parsed.bomOverrides,bom=overrides?.replaceAll&&overrides.data?overrides.data:overrides||bundled.IMPORTED_DATA.bom,parts=new Map();
  for(const [rootCode,rows]of Object.entries(bom).sort(([a],[b])=>a.localeCompare(b,'en'))){
    if(!Array.isArray(rows))throw new CanonicalError('INVALID_BOM');
    if(!productMap.has(rootCode))parts.set(rootCode,{id:'part:'+rootCode,code:rootCode,kind:'semi-finished',data:{code:rootCode}});
    for(const [order,row]of rows.entries()){const code=String(row.itemCode||(order===0?rootCode:''));if(!code)throw new CanonicalError('BOM_COMPONENT_ID_MISSING');if(!parts.has(code))parts.set(code,{id:'part:'+code,code,kind:'part',data:clean({code,name:row.itemName,specification:row.specification,unit:row.unit})});domains.bom.push({id:row.id?.startsWith('bom:')?row.id:id('bom',rootCode,order,code),rootCode,...(productMap.has(rootCode)?{productId:productMap.get(rootCode).id}:{rootPartId:'part:'+rootCode}),partId:'part:'+code,order,data:clean(row)});}
  }
  domains.parts=[...parts.values()];
  const processMap=control.active?.PROCESS||parsed.processMasterData||{};
  for(const [stageCode,templates]of Object.entries(processMap))for(const [order,template]of templates.entries())domains.processes.push({id:id('process',stageCode,template.id),stageId:'stage:'+stageCode,order,data:clean(template)});
  const versionRecords=(parsed.approvalVersions||[]).filter(v=>['approved','superseded'].includes(v.status));
  for(const version of versionRecords){const codes=new Set();for(const nodes of Object.values(version.stages||{}))for(const node of nodes)for(const code of node.productCodes||[])codes.add(code);domains.processVersions.push({id:version.id,productIds:[...codes].map(code=>productMap.get(code)?.id||'product:'+code).sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }),stageIds:Object.keys(version.stages||{}).map(code=>'stage:'+code).sort((a, b) => { const left = String(a), right = String(b); return left < right ? -1 : left > right ? 1 : 0; }),data:clean(version)});}
  domains.masterVersions=(control.versions||[]).filter(v=>['approved','superseded'].includes(v.status)).map(v=>({id:v.id,scope:v.scope,data:clean(v)}));
  domains.roles=Object.entries({...roleDefaults,...parsed.processRoleTemplateOverrides,...Object.fromEntries((parsed.processCustomRoles||[]).map(r=>[r.id,r])),admin:roleDefaults.admin}).map(([role,data])=>({id:'role:'+role,role,data:clean(data)}));
  domains.dispatch=Object.entries(parsed.dispatchBoard||{}).map(([line,codes])=>({id:'dispatch:'+line,lineId:'line:'+line,productIds:codes.map(code=>productMap.get(code)?.id||'product:'+code)}));
  const quality=parsed.canonicalQuality||{};for(const kind of ['fqc','iqc','ipqc'])domains[kind]=(quality[kind]||[]).map(clean);
  domains.settings=[{id:'catalog-labels',data:Object.fromEntries(['AB','C'].filter(k=>control.active?.[k]).map(k=>[k,control.active[k].name||k]))}];
  // Retain explicit tombstones; absence never turns into deletion.
  for(const [domain,records]of Object.entries(previous))if(domains[domain])for(const record of records)if(record.deletedAt&&!domains[domain].some(r=>r.id===record.id))domains[domain].push(copy(record));
  const used=new Set();function collect(v){if(typeof v==='string'&&/^asset:[a-f0-9]{64}$/.test(v))used.add(v);else if(Array.isArray(v))v.filter(r=>!r?.deletedAt).forEach(collect);else if(v&&typeof v==='object')Object.values(v).forEach(collect);}Object.values(domains).forEach(collect);
  domains.assets=[...assets.values()].map(r=>!used.has(r.id)&&!r.deletedAt&&(previous.assets||[]).some(p=>p.id===r.id)?{...r,deletedAt:new Date().toISOString()}:r);
  for(const records of Object.values(domains))records.sort((a,b)=>a.id.localeCompare(b.id,'en'));
  validateDomains(domains);return stable(domains);
}
export function validateDomains(domains){
  validateImageRecords(domains.assets||[]);
  const sets=Object.fromEntries(Object.entries(domains).map(([name,records])=>{if(!Array.isArray(records)||records.some(r=>!r||typeof r.id!=='string'||!r.id))throw new CanonicalError('INVALID_RECORD_ID',name);const ids=new Set(records.map(r=>r.id));if(ids.size!==records.length)throw new CanonicalError('DUPLICATE_RECORD_ID',name);return[name,new Set(records.filter(r=>!r.deletedAt).map(r=>r.id))];}));
  const ref=(domain,value,from)=>{if(value&&!sets[domain]?.has(value))throw new CanonicalError('MISSING_RELATION_'+domain.toUpperCase(),from);};
  for(const r of domains.products||[]){if(r.deletedAt)continue;ref('categories',r.categoryId,'products');ref('lines',r.lineId,'products');for(const value of r.stageIds||[])ref('stages',value,'products');}
  for(const r of domains.categories||[])if(!r.deletedAt)ref('lines',r.lineId,'categories');
  for(const r of domains.stages||[])if(!r.deletedAt)ref('lines',r.lineId,'stages');
  for(const r of domains.lines||[])if(!r.deletedAt)for(const value of r.stageIds||[])ref('stages',value,'lines');
  for(const r of domains.bom||[]){if(r.deletedAt)continue;ref('products',r.productId,'bom');ref('parts',r.rootPartId,'bom');ref('parts',r.partId,'bom');}
  for(const r of domains.processes||[])if(!r.deletedAt)ref('stages',r.stageId,'processes');
  for(const domain of ['processVersions','dispatch'])for(const r of domains[domain]||[]){if(r.deletedAt)continue;for(const value of r.productIds||[])ref('products',value,domain);for(const value of r.stageIds||[])ref('stages',value,domain);ref('lines',r.lineId,domain);}
  for(const kind of ['fqc','iqc','ipqc'])for(const r of domains[kind]||[]){if(r.deletedAt)continue;if(!r.productId&&!r.partId&&!r.categoryId&&!(r.productIds||[]).length&&!(r.partIds||[]).length)throw new CanonicalError('QUALITY_APPLICABILITY_REQUIRED',kind);ref('products',r.productId,kind);ref('parts',r.partId,kind);ref('categories',r.categoryId,kind);for(const value of r.productIds||[])ref('products',value,kind);for(const value of r.partIds||[])ref('parts',value,kind);ref('stages',r.stageId,kind);}
  for(const r of domains.processVersions||[]){if(r.deletedAt)continue;for(const nodes of Object.values(r.data.stages||{})){const ids=new Set(nodes.map(n=>n.id));if(ids.size!==nodes.length)throw new CanonicalError('DUPLICATE_PROCESS_NODE_ID');for(const node of nodes)for(const next of node.nextIds||[])if(!ids.has(next))throw new CanonicalError('MISSING_PROCESS_NODE_RELATION');}}
  const checkAssets=value=>{if(typeof value==='string'&&/^asset:[a-f0-9]{64}$/.test(value))ref('assets',value,'image');else if(Array.isArray(value))value.forEach(checkAssets);else if(value&&typeof value==='object')Object.values(value).forEach(checkAssets);};for(const [domain,records]of Object.entries(domains))if(domain!=='assets')for(const record of records)if(!record.deletedAt)checkAssets(record);
  const forbidden=value=>{if(Array.isArray(value))value.forEach(forbidden);else if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){if(privateField.test(k))throw new CanonicalError('PRIVATE_FIELD_IN_PACKAGE');forbidden(v);}else if(typeof value==='string'&&/data:(image|video)\/|(?:[A-Z]:[\\/])|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value))throw new CanonicalError('SENSITIVE_OR_INLINE_CONTENT');};forbidden(domains);
}
export function readPackage(root){
  const dir=path.join(root,'data/canonical'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
  if(manifest.schemaVersion!==schemaVersion||manifest.bootstrapVersion!==bootstrapVersion)throw new CanonicalError('UNSUPPORTED_PACKAGE_VERSION');
  const domains={};
  for(const[domain,file]of Object.entries(domainFiles)){
    const raw=fs.readFileSync(path.join(dir,file),'utf8');
    if(sha256(raw)!==manifest.files[file])throw new CanonicalError('PACKAGE_HASH_MISMATCH',domain);
    const record=JSON.parse(raw);
    if(record.domain!==domain||record.schemaVersion!==schemaVersion)throw new CanonicalError('DOMAIN_SCHEMA_MISMATCH',domain);
    domains[domain]=record.records;
  }
  validateDomains(domains);
  if(domains.assets.some(r=>r.web)){
    const raw=fs.readFileSync(path.join(dir,'assets/web-manifest.json'),'utf8');
    if(sha256(raw)!==manifest.files['assets/web-manifest.json']||raw!==serialize(webManifest(domains.assets)))throw new CanonicalError('WEB_MANIFEST_HASH_MISMATCH');
    for(const r of domains.assets)if(r.web)readWebImage(root,r);
  }
  if(sha256(stable(manifest.files))!==manifest.dataVersion)throw new CanonicalError('DATA_VERSION_MISMATCH');
  return{manifest,domains};
}
export function writePackage(root,domains,{sourceClassification='approved-local-and-bundled-business',previousManifest}={}){
  validateDomains(domains);
  const dir=path.join(root,'data/canonical'),files={};
  function write(file,record){
    const raw=serialize(record);files[file]=sha256(raw);const target=path.join(dir,file);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==raw)fs.writeFileSync(target,raw);
  }
  for(const[domain,file]of Object.entries(domainFiles))write(file,{schemaVersion,domain,records:[...(domains[domain]||[])].sort((a,b)=>a.id.localeCompare(b.id,'en'))});
  if(domains.assets.some(r=>r.web))write('assets/web-manifest.json',webManifest(domains.assets));
  const dataVersion=sha256(stable(files));
  const manifest={schemaVersion,bootstrapVersion,dataVersion,generatedAt:previousManifest?.dataVersion===dataVersion?previousManifest.generatedAt:new Date().toISOString(),sourceClassification,files:stable(files)};
  const raw=serialize(manifest),target=path.join(dir,'manifest.json');
  if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==raw)fs.writeFileSync(target,raw);
  return manifest;
}
export function differences(before={},after={}){const result={added:0,updated:0,deleted:0,unchanged:0,conflicts:[]};for(const domain of Object.keys(domainFiles)){const old=new Map((before[domain]||[]).map(r=>[r.id,r])),now=new Map((after[domain]||[]).map(r=>[r.id,r]));for(const[id,r]of now){const prior=old.get(id);if(r.deletedAt&&!prior?.deletedAt)result.deleted++;else if(!prior)result.added++;else if(serialize(prior)!==serialize(r))result.updated++;else result.unchanged++;}for(const[id,r]of old)if(!now.has(id)&&!r.deletedAt)result.conflicts.push({domain,id,kind:'missing explicit tombstone'});}return result;}
export function mergeThreeWay(base,local,incoming){validateImageTransition(base.assets||[],incoming.assets||[]);const result={},conflicts=[];for(const domain of Object.keys(domainFiles)){const b=new Map((base[domain]||[]).map(r=>[r.id,r])),l=new Map((local[domain]||[]).map(r=>[r.id,r])),n=new Map((incoming[domain]||[]).map(r=>[r.id,r]));result[domain]=[];for(const id of new Set([...b.keys(),...l.keys(),...n.keys()])){const old=b.get(id),here=l.get(id),next=n.get(id),equal=(a,z)=>serialize(a??null)===serialize(z??null);if(equal(here,old)){if(next)result[domain].push(next);else if(here)result[domain].push(here);}else if(equal(here,next)){if(here)result[domain].push(here);}else if(equal(next,old)){conflicts.push({domain,id,kind:'unexported local change'});}else conflicts.push({domain,id,kind:'both local and canonical changed'});}result[domain].sort((a,b)=>a.id.localeCompare(b.id,'en'));}if(conflicts.length)return{conflicts};validateDomains(result);return{domains:result,conflicts};}
export function materialize(current,domains,{previousDomains,root}={}){
  validateDomains(domains);const result={...current};
  const available=domain=>(domains[domain]||[]).filter(r=>!r.deletedAt);
  const localAssets=new Map();
  function remember(value,key=''){if(Array.isArray(value))value.forEach(v=>remember(v,key));else if(value&&typeof value==='object')Object.entries(value).forEach(([k,v])=>remember(v,k));else if(typeof value==='string'){const inline=value.match(/^data:((?:image|video)\/[^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);if(inline)localAssets.set('asset:'+sha256(Buffer.from(inline[2],'base64')),value);else if(['src','media','asset'].includes(key)&&/^https?:\/\//.test(value))localAssets.set('asset:'+sha256(value),value);else if(root&&['src','media','asset'].includes(key)&&/^(?:\/?(?:process\/)?assets\/)/.test(value)){const file=path.resolve(root,'public/process',value.replace(/^\//,'').replace(/^process\//,''));if(file.startsWith(path.resolve(root,'public/process/assets')+path.sep)&&fs.existsSync(file))localAssets.set('asset:'+sha256(fs.readFileSync(file)),value);}}}
  for(const value of Object.values(current))try{remember(parse(value));}catch{}
  const imageRecords=new Map(available('assets').map(r=>[r.id,r]));
  const asset=value=>{if(typeof value==='string'&&/^asset:[a-f0-9]{64}$/.test(value)){const r=imageRecords.get(value);return localAssets.get(value)||(r?.web?imageUrl(r):'/process/assets/canonical-placeholder.svg#asset-'+value.slice(6));}if(Array.isArray(value))return value.map(asset);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,asset(v)]));return value;};
  const control=current.masterDataControl?parse(current.masterDataControl):{active:{},versions:[]};
  const active={};for(const scope of ['AB','C']){const lines=available('lines').filter(r=>r.scope===scope).map(r=>({...asset(r.data),id:r.id,stages:(r.stageIds||[]).map(id=>asset(available('stages').find(s=>s.id===id)?.data)).filter(Boolean)}));active[scope]={name:available('settings').find(r=>r.id==='catalog-labels')?.data[scope]||scope,lines,products:available('products').filter(r=>r.scope===scope&&!r.archived).map(r=>({...asset(r.data),id:r.id,category:available('categories').find(c=>c.id===r.categoryId).name,line:available('lines').find(l=>l.id===r.lineId).code,stages:r.stageIds.map(id=>available('stages').find(s=>s.id===id).code)})),categoryGroups:available('categories').filter(r=>r.scope===scope).map(r=>({...asset(r.data),id:r.id,line:available('lines').find(l=>l.id===r.lineId).code,name:r.name}))};}
  const process={};for(const r of available('processes').sort((a,b)=>a.order-b.order)){const code=available('stages').find(s=>s.id===r.stageId).code;(process[code]||=[]).push(asset(r.data));}active.PROCESS=process;
  const preserve=records=>records.filter(v=>!['approved','superseded'].includes(v.status));
  if(previousDomains){if(serialize(previousDomains.processes)===serialize(domains.processes)&&control.active?.PROCESS)active.PROCESS=control.active.PROCESS;for(const scope of['AB','C']){const scoped=(all,domain)=>all[domain].filter(r=>r.scope===scope||(domain==='stages'&&all.lines.some(line=>line.id===r.lineId&&line.scope===scope)));if(['products','categories','lines','stages','settings'].every(domain=>domain==='settings'?serialize(previousDomains.settings)===serialize(domains.settings):serialize(scoped(previousDomains,domain))===serialize(scoped(domains,domain)))&&control.active?.[scope])active[scope]=control.active[scope];}}
  // Private identities/audit belong to this Local only, never to Canonical.
  const retainPrivate=(old,next)=>{if(Array.isArray(next))return next.map((v,i)=>retainPrivate(Array.isArray(old)?old.find(x=>x?.id&&x.id===v?.id)||old[i]:undefined,v));if(next&&typeof next==='object')return {...Object.fromEntries(Object.entries(old||{}).filter(([key])=>privateField.test(key))),...Object.fromEntries(Object.entries(next).map(([key,value])=>[key,retainPrivate(old?.[key],value)]))};return next;};
  result.masterDataControl=JSON.stringify({...control,active,versions:previousDomains&&serialize(previousDomains.masterVersions)===serialize(domains.masterVersions)?control.versions:[...preserve(control.versions||[]),...available('masterVersions').map(r=>retainPrivate((control.versions||[]).find(v=>v.id===r.id),asset(r.data)))]});
  const existing=current.approvalVersions?parse(current.approvalVersions):[];result.approvalVersions=JSON.stringify([...preserve(existing),...available('processVersions').map(r=>retainPrivate(existing.find(v=>v.id===r.id),asset(r.data)))]);
  result.processMasterData=JSON.stringify(process);
  const productCode=id=>available('products').find(r=>r.id===id)?.code;
  result.dispatchBoard=JSON.stringify(Object.fromEntries(available('dispatch').map(r=>[available('lines').find(l=>l.id===r.lineId).code,r.productIds.map(productCode)])));
  const roleRecords=available('roles');result.processRoleTemplateOverrides=JSON.stringify(Object.fromEntries(roleRecords.filter(r=>['rd','staff'].includes(r.role)).map(r=>[r.role,asset(r.data)])));result.processCustomRoles=JSON.stringify(roleRecords.filter(r=>!['admin','rd','staff'].includes(r.role)).map(r=>asset(r.data)));
  const bom={};for(const r of available('bom').sort((a,b)=>a.order-b.order))(bom[r.rootCode]||=[]).push(asset(r.data));result.bomOverrides=JSON.stringify(bom);
  if(current.bomMasterControl){const prior=parse(current.bomOverrides||'{}'),active=prior.replaceAll?prior.data:prior;if(serialize(bom)!==serialize(active))throw new CanonicalError('BOM_WORKFLOW_REQUIRED','bom');result.bomOverrides=current.bomOverrides;}
  result.canonicalQuality=JSON.stringify(Object.fromEntries(['fqc','iqc','ipqc'].map(k=>[k,available(k).map(asset)])));
  result.versionSampleSeed4='true';
  if(previousDomains){const ownership={masterDataControl:['products','categories','lines','stages','processes','masterVersions','settings'],approvalVersions:['processVersions'],processMasterData:['processes'],dispatchBoard:['dispatch'],processRoleTemplateOverrides:['roles'],processCustomRoles:['roles'],bomOverrides:['bom','parts'],canonicalQuality:['fqc','iqc','ipqc']};for(const[key,owners]of Object.entries(ownership))if(owners.every(d=>serialize(previousDomains[d])===serialize(domains[d]))){if(key in current)result[key]=current[key];else delete result[key];}if('versionSampleSeed4'in current)result.versionSampleSeed4=current.versionSampleSeed4;}
  return result;
}

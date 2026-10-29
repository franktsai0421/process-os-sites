import fs from 'node:fs';
import path from 'node:path';
import {sha256} from './snapshot-contract.mjs';
import {assertPlainDirectory} from './snapshot-files.mjs';
import {createNormalizationPlan,openNormalizationView} from './snapshot-normalize.mjs';
import {hostedAuditContext,auditHostedResource,finishHostedAudit} from './snapshot-hosted-audit.mjs';
const encode=v=>new TextEncoder().encode(JSON.stringify(v));
const fail=(v,c)=>{if(!v)throw Error(c);};
const maxPlanBytes=64*1024*1024;
function atomic(file,bytes){const temporary=file+'.tmp-'+crypto.randomUUID();fs.writeFileSync(temporary,bytes,{flag:'wx'});fs.renameSync(temporary,file);}
function readJson(file,limit=maxPlanBytes){const stat=fs.lstatSync(file);fail(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=limit,'NORMALIZE_PRIVATE_FILE_BOUNDARY');return JSON.parse(fs.readFileSync(file,'utf8'));}
async function rawTables(source){const manifest=await source.manifest(),tables={};for(const name of ['shared_state','state_backups','web_feedback_store']){const descriptors=manifest.chunks.filter(c=>c.resource==='db/'+name);fail(descriptors[0]?.totalBytes<=8*1024*1024,'NORMALIZE_TABLE_LIMIT');const raw=new Uint8Array(descriptors[0].totalBytes);for(const c of descriptors){const bytes=await source.readChunk(c.id);fail(bytes.length===c.bytes&&await sha256(bytes)===c.sha256,'NORMALIZE_INPUT_INTEGRITY');raw.set(bytes,c.offset);}tables[name]=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}return tables;}
function expectedValue(value,rewrite,depth=0){fail(depth<=48,'NORMALIZE_SEMANTIC_DEPTH');if(Array.isArray(value))return value.map(v=>expectedValue(v,rewrite,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,expectedValue(v,rewrite,depth+1)]));if(typeof value!=='string')return value;if(rewrite.has(value))return rewrite.get(value);if(/^[[{]/.test(value.trimStart())){let parsed;try{parsed=JSON.parse(value);}catch{return value;}return JSON.stringify(expectedValue(parsed,rewrite,depth+1));}return value;}
export async function auditNormalizedView(source,view,plan,{onProgress=async()=>{}}={}){
 const ctx=await hostedAuditContext(view),receipts=[];let bytes=0;
 for(const name of ctx.resources.keys()){const receipt=await auditHostedResource(ctx,name);receipts.push(receipt);bytes+=receipt.bytes;if(receipts.length%16===0)await onProgress({stage:'output-audit',checkedResources:receipts.length,totalResources:ctx.resources.size,verifiedLogicalBytes:bytes});}
 const summary=await finishHostedAudit(ctx,receipts),original=await rawTables(source),rewrite=new Map(plan.rewrites),zipPlans=new Map(plan.zipPlans);
 for(const [name,rows]of Object.entries(original)){
  const column=name==='web_feedback_store'?'payload':'values',expected=rows.map(row=>{const value=expectedValue(JSON.parse(row[column]),rewrite);if(name==='web_feedback_store')for(const handoff of value.handoffs){const pin=zipPlans.get('web-feedback/v1/'+handoff.id+'.zip');fail(pin,'NORMALIZE_FEEDBACK_COVERAGE');handoff.size=pin.bytes;handoff.sha256=pin.sha256;}return {...row,[column]:JSON.stringify(value)};});
  fail(JSON.stringify(expected)===JSON.stringify(ctx.tables[name]),'NORMALIZE_BUSINESS_OR_HISTORY_CHANGED');
 }
 const accounts=tables=>{const current=JSON.parse(tables.shared_state[0].values);return typeof current.platformUsers==='string'?JSON.parse(current.platformUsers):current.platformUsers;};
 fail(JSON.stringify(accounts(original))===JSON.stringify(accounts(ctx.tables)),'NORMALIZE_ACCOUNT_OR_ROLE_CHANGED');
 fail(plan.sourceMappings.length===new Set((await source.manifest()).chunks.filter(c=>c.resource.startsWith('r2/')).map(c=>c.resource)).size,'NORMALIZE_SOURCE_OBJECT_COVERAGE');
 return {status:'PASS_PRIVATE_NORMALIZED_VIEW_ONLY',...summary,credentialFieldsExcluded:true,currentAndAllHistoryBusinessRowsMatch:true,accountsAndRolesPreserved:true,allSourceObjectsMapped:true,sourceObjects:plan.sourceMappings.length,normalizedObjects:summary.objects,logicalBytes:bytes,copiedPayloadBytes:0,DBOpened:false,platformAccepted:false};
}
export async function createNormalizationDirectory({source,sourceRoot,output,programCommit,sourceManifestSha256,resume=false,onProgress=async()=>{}}){
 const root=assertPlainDirectory(output),originalRoot=sourceRoot?assertPlainDirectory(sourceRoot):null;
 if(originalRoot)fail(root!==originalRoot&&!root.startsWith(originalRoot+path.sep)&&!originalRoot.startsWith(root+path.sep),'NORMALIZE_DIRECTORY_OVERLAP');
 let owner;
 if(fs.existsSync(root)){
  fail(resume&&fs.existsSync(path.join(root,'OWNER.json')),'NORMALIZE_NEW_OUTPUT_REQUIRED');owner=readJson(path.join(root,'OWNER.json'),16384);
  fail(owner.format==='PROCESS_OS_NORMALIZATION_DIRECTORY_V1'&&owner.sourceManifestSha256===sourceManifestSha256&&owner.programCommit===programCommit,'NORMALIZE_RESUME_IDENTITY');
  fail(owner.state!=='RUNNING','NORMALIZE_PRIOR_RUN_OUTCOME_UNCERTAIN');
  if(fs.existsSync(path.join(root,'COMPLETE')))return openNormalizationDirectory({source,output:root});
 }else{
  fs.mkdirSync(root);fs.mkdirSync(path.join(root,'recipes'));
  owner={format:'PROCESS_OS_NORMALIZATION_DIRECTORY_V1',programCommit,sourceManifestSha256,state:'PREPARED',inheritedPermissionsUnchanged:true};
  fs.writeFileSync(path.join(root,'OWNER.json'),encode(owner),{flag:'wx'});fs.writeFileSync(path.join(root,'INCOMPLETE'),'Incomplete normalization view; source remains unchanged.\n',{flag:'wx'});
 }
 const reportPath=path.join(root,'RESULT.json');owner.state='RUNNING';atomic(path.join(root,'OWNER.json'),encode(owner));
 try{
  const manifest=await source.manifest(),names=[...new Set(manifest.chunks.filter(c=>c.resource.startsWith('r2/')).map(c=>c.resource))],recipes=[];
  for(const name of names){const file=path.join(root,'recipes',await sha256(encode(name))+'.json');if(fs.existsSync(file)){const record=readJson(file,2*1024*1024);fail(record.recipe.sourceResource===name&&await sha256(encode(record.recipe))===record.sha256,'NORMALIZE_RESUME_RECIPE_INTEGRITY');recipes.push(record.recipe);}}
  const progress=async dto=>{atomic(path.join(root,'PROGRESS.json'),encode({at:new Date().toISOString(),...dto}));await onProgress(dto);};
  const plan=await createNormalizationPlan(source,{programCommit,sourceManifestSha256,resumeRecipes:recipes,onProgress:progress,onRecipe:async recipe=>{const file=path.join(root,'recipes',await sha256(encode(recipe.sourceResource))+'.json'),record={recipe,sha256:await sha256(encode(recipe))},bytes=encode(record);fail(bytes.length<=2*1024*1024,'NORMALIZE_RECIPE_LIMIT');if(fs.existsSync(file)){fail(JSON.stringify(readJson(file))===JSON.stringify(record),'NORMALIZE_RESUME_RECIPE_CHANGED');}else atomic(file,bytes);}});
  const bytes=encode(plan);fail(bytes.length<=maxPlanBytes,'NORMALIZE_PLAN_LIMIT');atomic(path.join(root,'PLAN.json'),bytes);atomic(path.join(root,'PLAN.sha256'),new TextEncoder().encode(await sha256(bytes)));
  const view=await openNormalizationView(source,plan);let audit;try{audit=await auditNormalizedView(source,view,plan,{onProgress:progress});}finally{await view.close();}
  const manifestBytes=encode(plan.manifest),result={status:audit.status,programCommit,sourceManifestSha256,planSha256:plan.planSha256,manifestSha256:await sha256(manifestBytes),planBytes:bytes.length,audit,inheritedPermissionsUnchanged:true};
  atomic(path.join(root,'manifest.json'),manifestBytes);atomic(reportPath,encode(result));atomic(path.join(root,'NORMALIZATION-VERIFIED.json'),encode(result));
  owner.state='COMPLETE';atomic(path.join(root,'OWNER.json'),encode(owner));fs.renameSync(path.join(root,'INCOMPLETE'),path.join(root,'COMPLETE'));
  await onProgress({stage:'normalization-complete',...audit,planBytes:bytes.length});return {root,result,plan,view:await openNormalizationView(source,plan)};
 }catch(error){owner.state='STOPPED';atomic(path.join(root,'OWNER.json'),encode(owner));const code=error instanceof Error&&/^[A-Z0-9_]+$/.test(error.message)?error.message:'NORMALIZE_UNAVAILABLE';atomic(reportPath,encode({status:'FAIL_RETAIN_PARTIAL_VIEW',code,programCommit,sourceManifestSha256,copiedPayloadBytes:0}));throw Error(code);}
}
export async function openNormalizationDirectory({source,output}){
 const root=assertPlainDirectory(output);fail(fs.existsSync(path.join(root,'COMPLETE'))&&!fs.existsSync(path.join(root,'INCOMPLETE'))&&fs.existsSync(path.join(root,'NORMALIZATION-VERIFIED.json')),'NORMALIZE_DIRECTORY_NOT_VERIFIED');
 const bytes=fs.readFileSync(path.join(root,'PLAN.json'));fail(bytes.length<=maxPlanBytes&&await sha256(bytes)===fs.readFileSync(path.join(root,'PLAN.sha256'),'utf8'),'NORMALIZE_PLAN_FILE_INTEGRITY');
 const plan=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)),result=readJson(path.join(root,'NORMALIZATION-VERIFIED.json'),16384),manifestBytes=fs.readFileSync(path.join(root,'manifest.json'));
 fail(result.planSha256===plan.planSha256&&await sha256(manifestBytes)===result.manifestSha256&&new TextDecoder().decode(manifestBytes)===JSON.stringify(plan.manifest),'NORMALIZE_VIEW_RECEIPT_MISMATCH');
 return {root,result,plan,view:await openNormalizationView(source,plan)};
}

#!/usr/bin/env node
// Offline preparation only: stdin JSON -> stdout candidate. Never opens a database/network.
const {createHash,randomUUID}=require('node:crypto');
const load=require('./ipqc-ab-import-harness.cjs')();
const domain=load('lib/routine-fqc.ts'),page=load('lib/routine-fqc-page.ts'),kernel=load('lib/shared-draft.ts');
function prepare(input){
 const root=domain.parseRoutine(JSON.stringify(input));
 if(root.pageDraftLayout||root.page)throw Error('ROUTINE_PAGE_ALREADY_PREPARED');
 if(root.documents.some(doc=>doc.flow.pendingId||doc.flow.cases.some(review=>review.status==='pending')))throw Error('ROUTINE_PENDING_REVIEW_REQUIRES_RESOLUTION');
 const copy=value=>JSON.parse(JSON.stringify(value));
 const row=(doc,content)=>({id:doc.id,metadata:page.routinePageMetadata(doc),content:copy(content),cancelled:false});
 const baseline={documents:root.documents.filter(doc=>doc.flow.active.id&&!doc.cancelled).map(doc=>row(doc,doc.flow.active.content))};
 const baselineId='routine-page-baseline:'+createHash('sha256').update(kernel.stableDraftJSON(baseline)).digest('hex');
 const flow=kernel.createSharedDraft(page.ROUTINE_PAGE_SCOPE,baseline,baselineId,randomUUID());
 flow.working={documents:root.documents.filter(doc=>!doc.cancelled).map(doc=>row(doc,doc.flow.working))};
 const candidate={...copy(root),pageDraftLayout:'page-v1',page:{baseline:{id:baselineId,content:baseline},workflow:flow,documentState:{},caseDependencies:{}}};
 for(const doc of root.documents){const state=Object.fromEntries(['cancelled','reopened','lifecycle','impact'].filter(key=>Object.hasOwn(doc,key)).map(key=>[key,copy(doc[key])]));Object.defineProperty(candidate.page.documentState,doc.id,{value:state,enumerable:true,writable:true,configurable:true});}
 page.parseRoutinePage(candidate);
 if(JSON.stringify(candidate.documents)!==JSON.stringify(root.documents)||JSON.stringify(candidate.receipts)!==JSON.stringify(root.receipts))throw Error('ROUTINE_LEGACY_ARCHIVE_CHANGED');
 return candidate;
}
module.exports=prepare;
if(require.main===module){let raw='';process.stdin.setEncoding('utf8');process.stdin.on('data',part=>{raw+=part;if(Buffer.byteLength(raw)>100_000_000)throw Error('OFFLINE_INPUT_TOO_LARGE');});process.stdin.on('end',()=>{try{process.stdout.write(JSON.stringify(prepare(JSON.parse(raw)))+'\n');}catch(error){process.stderr.write(error.message+'\n');process.exitCode=1;}});}

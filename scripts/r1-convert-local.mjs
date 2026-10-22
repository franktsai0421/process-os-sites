// One selected real R1 -> one fresh LOCAL snapshot, using owner-accepted ACLs.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openR1Zip} from '../lib/r1-zip-reader.mjs';
import {decodeStrictR1Layout} from '../lib/r1-strict-layout.mjs';
import {createR1LogicalSource} from '../lib/r1-logical-bridge.mjs';
import {parseR1Json} from '../lib/r1-contract.mjs';
import {createSnapshotDirectorySink,assertPlainDirectory,openSnapshotDirectory} from '../lib/snapshot-files.mjs';
import {exportSnapshot} from '../lib/snapshot-contract.mjs';
import {auditSnapshotDirectory} from '../lib/snapshot-audit.mjs';
import {validateR1LocalDestination} from '../lib/r1-local-destination.mjs';
import {openR1CheckedResumeSink} from '../lib/r1-resume-sink.mjs';
const workspace='C:/Users/Admin/Documents/Codex/2026-10-21/task-3',root=fileURLToPath(new URL('../',import.meta.url)),parent='E:/ProcessOS-Sites-Private-20261022',output=path.join(parent,'r1-rev496-snapshot-v1');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),baselineM1='7f5dc57239d6db483f096d96df6bd6cdd7357f5a';
function codePin(){const entries=[];for(const sub of ['lib','scripts'])for(const name of fs.readdirSync(path.join(root,sub)).sort())if(/\.(mjs|ts)$/.test(name)){const relative=sub+'/'+name,bytes=fs.readFileSync(path.join(root,relative));entries.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});}return hash(JSON.stringify(entries));}
const report={format:'PROCESS_OS_R1_LOCAL_CONVERSION_V1',startedAt:new Date().toISOString(),input:null,output,baselineM1,programCommitQualification:'M1_BASELINE_ONLY_DERIVATIVE_UNCOMMITTED',scope:{SQLExecuted:false,DBOpened:false,R2Opened:false,SDK:false,network:false,credentialsMigrated:false,runtimeAccepted:false,uploaded:false}};
let reader,sink,phase='inherited-destination-preflight',lastProgress=0;
const progress=value=>{if(Date.now()-lastProgress>5000||['input-pinned','directory-validated'].includes(value.stage)){lastProgress=Date.now();console.log(JSON.stringify(value));}};
try{
 const receiptPath=process.env.R1_LOCAL_DESTINATION_RECEIPT;if(!receiptPath)throw Error('R1_OWNER_ACCEPTED_LOCAL_DESTINATION_REQUIRED');const isolation=validateR1LocalDestination(JSON.parse(fs.readFileSync(receiptPath,'utf8')),parent);
 const resume=process.env.R1_RESUME_CHECKED_STAGE==='1';assertPlainDirectory(parent);if(fs.existsSync(output)!==resume)throw Error('R1_FRESH_OR_CHECKED_RESUME_TARGET_REQUIRED');
 const statfs=fs.statfsSync(path.parse(parent).root,{bigint:true}),available=statfs.bavail*statfs.bsize,estimate=18_000_000_000n,margin=10_000_000_000n;
 report.space={availableBytes:Number(available),estimatedNewBytes:Number(estimate),safetyMarginBytes:Number(margin)};if(available<estimate+margin)throw Error('R1_LOCAL_SPACE_INSUFFICIENT');
 const ownerFile=path.join(parent,'TASK-OWNER.json'),owner={taskRoot:workspace,inputSha256:'b986fdf80859488aaf5f712f591b9fbeb53a1ec2752102e9c310c826e4765714',mode:isolation.mode};
 if(fs.existsSync(parent)){if(!fs.statSync(parent).isDirectory()||!fs.existsSync(ownerFile)||JSON.stringify(JSON.parse(fs.readFileSync(ownerFile,'utf8')))!==JSON.stringify(owner))throw Error('R1_EXISTING_PARENT_NOT_OWNED');}else{fs.mkdirSync(parent);fs.writeFileSync(ownerFile,JSON.stringify(owner),{flag:'wx'});}
 report.executedCodeFingerprint=codePin();report.isolation={...isolation,receiptPath};
 phase='input-pin';const pair=JSON.parse(fs.readFileSync('D:/中控系統_私有交付/process-os-local-acceptance-20261020-r1/PAIR-RESULT.json','utf8')),input=pair.data;
 if(input.bytes!==1781028009||input.sha256!=='b986fdf80859488aaf5f712f591b9fbeb53a1ec2752102e9c310c826e4765714')throw Error('R1_PAIR_PIN_MISMATCH');report.input={bytes:input.bytes,sha256:input.sha256};
 reader=await openR1Zip({file:input.path,expectedBytes:input.bytes,expectedSha256:input.sha256,onProgress:progress});const inventory=await reader.members.list();
 const read=async name=>{const item=inventory.find(item=>item.path===name);if(!item||item.bytes>8*1024*1024)throw Error('R1_METADATA_BOUND');const result=new Uint8Array(item.bytes);for(let at=0;at<result.length;at+=65536)result.set(await reader.members.readRange(name,at,Math.min(65536,result.length-at)),at);return result;};
 const manifestBytes=await read('pack-v5/manifest.json'),manifest=parseR1Json(manifestBytes),database=parseR1Json(await read('pack-v5/database.json')),manifestSha256=hash(manifestBytes);
 if(manifestSha256!=='4e0ce0d0a38c721af52d507c93138b1a4d8f2a76961b49224575ae33a8da6140')throw Error('R1_SELECTED_MANIFEST_PIN');
 const programAssetPins={};for(const name of ['public/favicon.svg','public/process/assets/canonical-placeholder.svg']){const bytes=fs.readFileSync(path.join(root,name));programAssetPins[name]={bytes:bytes.length,sha256:hash(bytes)};}
 phase='strict-metadata';const decoded=await decodeStrictR1Layout({members:reader.members,manifestSha256,programAssetPins});
 report.input={...report.input,manifestSha256,revision:manifest.sourceRevision,zipMembers:inventory.length,logicalObjects:manifest.objects.length,logicalBytes:manifest.objects.reduce((n,item)=>n+item.bytes,0),privateImages:decoded.layout.assets.length,historyRows:database.tables.state_backups.length,accounts:manifest.accounts.original};
 phase='new-or-checked-local-output';sink=resume?await openR1CheckedResumeSink(output):createSnapshotDirectorySink(output);if(resume)report.resumePrefix={...sink.storage};
 phase='all-source-members-and-format-plan';const source=await createR1LogicalSource({...decoded,programCommit:baselineM1});source.origin.delivery=decoded.delivery;
 let pendingManifest,outBytes=0;const pendingSink={scope:sink.scope,async writeChunk(id,bytes){await sink.writeChunk(id,bytes);outBytes+=bytes.length;progress({stage:'private-snapshot-write',bytes:outBytes,chunks:Number(id.slice(1))+1});},async complete(manifest){pendingManifest=manifest;},abort:sink.abort};
 phase='streaming-conversion';await exportSnapshot(source,pendingSink);if(!pendingManifest)throw Error('R1_OUTPUT_MANIFEST_MISSING');
 phase='readback-and-reference-audit';report.audit=await auditSnapshotDirectory({scope:'private-snapshot',async manifest(){return pendingManifest;},async readChunk(id){if(!/^c[0-9]+$/.test(id))throw Error('R1_OUTPUT_CHUNK_ID');const file=path.join(output,'chunks',id);if(fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>1048576)throw Error('R1_OUTPUT_CHUNK_BOUND');return new Uint8Array(fs.readFileSync(file));}},{expectedTables:database.tables,expectedObjectKeys:new Set(manifest.objects.map(object=>object.key)),expectedAssets:decoded.layout.assets,expectedAccounts:manifest.accounts.original,onProgress:progress});
 if(report.audit.feedbackArchives!==manifest.archiveObjects||report.audit.feedbackArchiveEntries!==manifest.archiveEntries)throw Error('R1_ARCHIVE_COUNT_MISMATCH');
 phase='final-input-and-code-pin';report.zip=await reader.verifyInput();if(codePin()!==report.executedCodeFingerprint)throw Error('R1_CONVERTER_SOURCE_CHANGED');
 phase='complete-marker';await sink.complete(pendingManifest);report.outputManifestSha256=fs.readFileSync(path.join(output,'manifest.sha256'),'utf8');await openSnapshotDirectory(output,report.outputManifestSha256);
 report.outputStorage={physicalChunks:pendingManifest.chunks.length,physicalBytes:outBytes,fullExtractionCopies:0};if(resume)report.resumeStorage={...sink.storage};report.status='PASS_TRUE_R1_LOCAL_SNAPSHOT_CONVERSION_ONLY';report.authReady=false;report.sourceUnchanged=true;report.finishedAt=new Date().toISOString();
 fs.writeFileSync(path.join(output,'CONVERSION-VERIFIED.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
}catch(error){report.status='STOPPED_TRUE_R1_LOCAL_CONVERSION';report.phase=phase;report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:typeof error.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'R1_LOCAL_IO_OR_PARSE_ERROR';if(sink)await sink.abort().catch(()=>{});report.outputExists=fs.existsSync(output);report.finishedAt=new Date().toISOString();process.exitCode=1;}finally{if(reader)await reader.close();if(process.env.R1_CONVERSION_REPORT)fs.writeFileSync(process.env.R1_CONVERSION_REPORT,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));}

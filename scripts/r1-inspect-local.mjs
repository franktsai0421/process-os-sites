// Approved local metadata-only preflight; emits types/counts, never row values.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {openR1Zip} from '../lib/r1-zip-reader.mjs';
import {parseR1Json} from '../lib/r1-contract.mjs';
import {decodeStrictR1Layout} from '../lib/r1-strict-layout.mjs';
import {readR1InspectPairPath} from '../lib/r1-inspect-cli.mjs';
const source=new URL('../',import.meta.url),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const pair=JSON.parse(fs.readFileSync(readR1InspectPairPath(process.argv.slice(2)),'utf8'));
const input=pair.data;if(input.bytes!==1781028009||input.sha256!=='b986fdf80859488aaf5f712f591b9fbeb53a1ec2752102e9c310c826e4765714')throw Error('R1_PAIR_PIN_MISMATCH');
const report={phase:'R1_ZIP_METADATA_PREFLIGHT',input:{bytes:input.bytes,sha256:input.sha256},scope:{readOnly:true,rowsLogged:false,SQLExecuted:false,outputData:false,SDK:false,network:false}};let reader;
const shape=value=>Object.fromEntries(Object.entries(value).map(([key,value])=>[key,Array.isArray(value)?'array':value===null?'null':typeof value]));
try{
 reader=await openR1Zip({file:input.path,expectedBytes:input.bytes,expectedSha256:input.sha256,onProgress:event=>console.log(JSON.stringify(event))});
 const inventory=await reader.members.list(),read=async name=>{const item=inventory.find(item=>item.path===name);if(!item||item.bytes>8*1024*1024)throw Error('R1_METADATA_BOUND');const result=new Uint8Array(item.bytes);for(let at=0;at<result.length;at+=65536)result.set(await reader.members.readRange(name,at,Math.min(65536,result.length-at)),at);return result;};
 const manifestBytes=await read('pack-v5/manifest.json'),manifest=parseR1Json(manifestBytes),database=parseR1Json(await read('pack-v5/database.json'));
 report.manifestSha256=sha(manifestBytes);report.manifestShape=shape(manifest);report.databaseShape=shape(database);report.schemas=Array.isArray(database.schemas)?database.schemas.map(item=>({name:item.name,shape:shape(item)})):null;
 report.tableRows=database.tables&&Object.fromEntries(Object.entries(database.tables).map(([name,rows])=>[name,Array.isArray(rows)?rows.length:null]));
 report.objectDescriptors={count:manifest.objects?.length,shape:manifest.objects?.[0]?shape(manifest.objects[0]):null,logicalBytes:manifest.objects?.reduce((n,item)=>n+item.bytes,0)};
 report.counters=Object.fromEntries(['sourceObjects','outputObjects','jsonObjects','mediaObjects','archiveObjects','archiveEntries','packBytes','currentRows','historyRows','feedbackRows'].filter(key=>Object.hasOwn(manifest,key)).map(key=>[key,manifest[key]]));
 report.machineFormats=Object.fromEntries(['format','sourceFormat'].map(key=>[key,manifest[key]]));
 report.headerContainers=Object.fromEntries(['accounts','formatSupport','bootstrapPolicy','credentialPolicy','verification','runtimeAcceptance','sourceBinding','sourceCurrentness','curation'].filter(key=>manifest[key]&&typeof manifest[key]==='object').map(key=>[key,shape(manifest[key])]));
 report.limitItemTypes=Array.isArray(manifest.limits)?[...new Set(manifest.limits.map(value=>typeof value))]:null;
 const programAssetPins={};for(const name of ['public/favicon.svg','public/process/assets/canonical-placeholder.svg']){const bytes=fs.readFileSync(new URL(name,source));programAssetPins[name]={bytes:bytes.length,sha256:sha(bytes)};}
 if(process.env.R1_PREFLIGHT_STRUCTURE_ONLY==='1'){report.status='STRUCTURAL_EVIDENCE_ONLY';report.zip={...reader.stats};}else{const decoded=await decodeStrictR1Layout({members:reader.members,manifestSha256:report.manifestSha256,programAssetPins});report.status='PASS_METADATA_CONTRACT_ONLY';report.staticAssets=decoded.layout.assets.length;report.auxiliary=decoded.layout.auxiliary.length;report.zip={...reader.stats};}
}catch(error){report.status='STOPPED_METADATA_CONTRACT';report.error=/^[A-Z0-9_]+$/.test(error.message)?error.message:'R1_LOCAL_IO_OR_PARSE_ERROR';process.exitCode=1;}finally{if(reader)await reader.close();const target=process.env.R1_PREFLIGHT_REPORT;if(target)fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));}

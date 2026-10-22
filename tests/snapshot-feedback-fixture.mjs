import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {sha256} from '../lib/snapshot-contract.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),encode=v=>new TextEncoder().encode(typeof v==='string'?v:JSON.stringify(v));
export async function addFeedbackFixture(f){
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../lib/web-feedback-zip.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,TextEncoder,Uint8Array,DataView,crypto:webcrypto});
 const id='H-normalize-fixture-0001',issueId='issue_normalize_0001',attachmentId='attachment_normalize_0001',image=encode('synthetic feedback image'),imageHash=await sha256(image);
 const attachment={id:attachmentId,owner:'fixture-owner',name:'fixture.png',type:'image/png',size:image.length,sha256:imageHash,location:{display:'fixture'},access:{adminOnly:false,lines:[],views:['editor'],permissions:[]}};
 const issue={id:issueId,reporter:'Fixture',createdAt:'fixture-time',location:{display:'Fixture page'},description:JSON.stringify({ref:f.childKey,note:'保留 / Giữ lại',password:'SYNTHETIC_EXCLUDED'}),attachments:[attachmentId],secret:'SYNTHETIC_EXCLUDED'};
 const imagePath='images/'+issueId+'_'+attachmentId+'.png',files=[{path:imagePath,bytes:image},{path:'issues/'+issueId+'.md',bytes:encode('synthetic old description')},{path:'README.md',bytes:encode('synthetic old readme')}];
 for(const [path,value]of Object.entries({'issues.json':{schemaVersion:1,handoffId:id,issues:[issue],attachments:[{...attachment,issueId,relativePath:imagePath}]},'locations.json':[],'environment.json':[],'history.json':{history:[{password:'SYNTHETIC_EXCLUDED',note:'preserve history'}]}}))files.push({path,bytes:encode(value)});
 files.push({path:'manifest.json',bytes:encode({schemaVersion:1,handoffId:id,generatedAt:'fixture-time',files:await Promise.all(files.map(async file=>({path:file.path,size:file.bytes.length,sha256:await sha256(file.bytes)})))})});
 const zip=module.exports.zipFiles(files),record={id,operationId:'operation_normalize_0001',owner:'fixture-owner',digest:await sha256(encode([issueId])),generatedAt:'fixture-time',status:'generated',issues:[issue],sha256:await sha256(zip),size:zip.length};
 f.db.tables.web_feedback_store[0].payload=JSON.stringify({issues:[issue],attachments:[attachment],batches:[],handoffs:[record]});
 f.bucket.objects.set('web-feedback/v1/'+id+'.zip',{key:'web-feedback/v1/'+id+'.zip',data:zip,etag:'fixture-feedback',httpMetadata:{contentType:'application/zip'}});
 f.bucket.objects.set('web-feedback/v1/'+attachmentId,{key:'web-feedback/v1/'+attachmentId,data:image,etag:'fixture-feedback-image',httpMetadata:{contentType:'image/png'}});
}

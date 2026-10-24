import {createHash} from 'node:crypto';
import {sha256} from './snapshot-contract.mjs';
const partBytes=5*1024*1024,fail=(v,c)=>{if(!v)throw Error(c);};
async function objectPin(bucket,key,stage,prefix){stage(prefix+'-get');const object=await bucket.get(key);if(!object?.body)return null;stage(prefix+'-body');const reader=object.body.getReader(),hash=createHash('sha256');let bytes=0;try{for(;;){const next=await reader.read();if(next.done)break;hash.update(next.value);bytes+=next.value.length;fail(bytes<=object.size,'IMPORT_COPY_READBACK');}}finally{void reader.cancel().catch(()=>{});reader.releaseLock();}fail(bytes===object.size,'IMPORT_COPY_READBACK');return {bytes,sha256:hash.digest('hex'),etag:object.etag};}
// Shared bounded writer for an audited business object or the private owner
// account object. Caller supplies only pinned ranges, never a URL/credential.
export async function copyPinnedObject({store,bucket,transferId,resourceName,key,bytes,sha256:expectedSha,metadata,readRange,receipt,onComplete,stage=()=>{}}){
 stage('copy-plan');let row=receipt||await store.resource(transferId,resourceName);fail(row&&row.resource===resourceName&&row.transfer_id===transferId&&row.sha256===expectedSha&&row.bytes===bytes,'IMPORT_COPY_PLAN');let state=row.copy_state?JSON.parse(row.copy_state):null;
 async function save(value){row=await store.copy(transferId,resourceName,row.copy_version,value);state=value;}
 async function complete(pin){stage('copy-complete');const value={phase:'complete',etag:pin.etag};if(onComplete)await onComplete(row,value);else if(state?.phase!=='complete')await save(value);}
 const existing=await objectPin(bucket,key,stage,'copy-target');
 if(existing){fail(existing.bytes===bytes&&existing.sha256===expectedSha,'IMPORT_ORIGINAL_OBJECT_CONFLICT');await complete(existing);return true;}
 fail(state?.phase!=='complete','IMPORT_COPY_OBJECT_MISSING');
 const options={httpMetadata:{...metadata.httpMetadata},customMetadata:metadata.customMetadata};if(options.httpMetadata.expires)options.httpMetadata.expires=new Date(options.httpMetadata.expires);
 if(bytes<=partBytes){stage('copy-source-range');const value=await readRange(0,bytes);stage('copy-source-hash');fail(value.length===bytes&&await sha256(value)===expectedSha,'IMPORT_COPY_SOURCE');stage('copy-put');await bucket.put(key,value,{...options,onlyIf:{etagDoesNotMatch:'*'}});const pin=await objectPin(bucket,key,stage,'copy-readback');fail(pin&&pin.bytes===bytes&&pin.sha256===expectedSha,'IMPORT_COPY_READBACK');await complete(pin);return true;}
 if(!state){await save({phase:'creating'});const upload=await bucket.createMultipartUpload(key,options);await save({phase:'uploading',uploadId:upload.uploadId,nextOffset:0,parts:[]});return false;}
 fail(state.phase!=='creating','IMPORT_UPLOAD_CREATION_UNCERTAIN');fail(state.phase==='uploading'&&typeof state.uploadId==='string'&&Number.isSafeInteger(state.nextOffset),'IMPORT_UPLOAD_STATE');
 const upload=bucket.resumeMultipartUpload(key,state.uploadId);
 if(state.nextOffset<bytes){fail(state.parts.length<10000,'IMPORT_MULTIPART_LIMIT');const length=Math.min(partBytes,bytes-state.nextOffset),value=await readRange(state.nextOffset,length);fail(value.length===length,'IMPORT_COPY_SOURCE');const part=await upload.uploadPart(state.parts.length+1,value);fail(part.partNumber===state.parts.length+1&&typeof part.etag==='string','IMPORT_MULTIPART_RECEIPT');await save({...state,nextOffset:state.nextOffset+length,parts:[...state.parts,part]});return false;}
 await upload.complete(state.parts);const pin=await objectPin(bucket,key,stage,'copy-readback');fail(pin&&pin.bytes===bytes&&pin.sha256===expectedSha,'IMPORT_COPY_READBACK');await complete(pin);return true;
}

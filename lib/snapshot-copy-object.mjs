import {createHash} from 'node:crypto';
import {sha256} from './snapshot-contract.mjs';
const partBytes=5*1024*1024,fail=(v,c)=>{if(!v)throw Error(c);};
async function objectPin(bucket,key){const object=await bucket.get(key);if(!object?.body)return null;const reader=object.body.getReader(),hash=createHash('sha256');let bytes=0;try{for(;;){const next=await reader.read();if(next.done)break;hash.update(next.value);bytes+=next.value.length;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}fail(bytes===object.size,'IMPORT_COPY_READBACK');return {bytes,sha256:hash.digest('hex'),etag:object.etag};}
// Shared bounded writer for an audited business object or the private owner
// account object. Caller supplies only pinned ranges, never a URL/credential.
export async function copyPinnedObject({store,bucket,transferId,resourceName,key,bytes,sha256:expectedSha,metadata,readRange}){
 let row=await store.resource(transferId,resourceName);fail(row&&row.sha256===expectedSha&&row.bytes===bytes,'IMPORT_COPY_PLAN');let state=row.copy_state?JSON.parse(row.copy_state):null;
 async function save(value){row=await store.copy(transferId,resourceName,row.copy_version,value);state=value;}
 const existing=await objectPin(bucket,key);
 if(existing){fail(existing.bytes===bytes&&existing.sha256===expectedSha,'IMPORT_ORIGINAL_OBJECT_CONFLICT');if(state?.phase!=='complete')await save({phase:'complete',etag:existing.etag});return true;}
 fail(state?.phase!=='complete','IMPORT_COPY_OBJECT_MISSING');
 const options={httpMetadata:{...metadata.httpMetadata},customMetadata:metadata.customMetadata};if(options.httpMetadata.expires)options.httpMetadata.expires=new Date(options.httpMetadata.expires);
 if(bytes<=partBytes){const value=await readRange(0,bytes);fail(value.length===bytes&&await sha256(value)===expectedSha,'IMPORT_COPY_SOURCE');await bucket.put(key,value,{...options,onlyIf:{etagDoesNotMatch:'*'}});const pin=await objectPin(bucket,key);fail(pin&&pin.bytes===bytes&&pin.sha256===expectedSha,'IMPORT_COPY_READBACK');await save({phase:'complete',etag:pin.etag});return true;}
 if(!state){await save({phase:'creating'});const upload=await bucket.createMultipartUpload(key,options);await save({phase:'uploading',uploadId:upload.uploadId,nextOffset:0,parts:[]});return false;}
 fail(state.phase!=='creating','IMPORT_UPLOAD_CREATION_UNCERTAIN');fail(state.phase==='uploading'&&typeof state.uploadId==='string'&&Number.isSafeInteger(state.nextOffset),'IMPORT_UPLOAD_STATE');
 const upload=bucket.resumeMultipartUpload(key,state.uploadId);
 if(state.nextOffset<bytes){fail(state.parts.length<10000,'IMPORT_MULTIPART_LIMIT');const length=Math.min(partBytes,bytes-state.nextOffset),value=await readRange(state.nextOffset,length);fail(value.length===length,'IMPORT_COPY_SOURCE');const part=await upload.uploadPart(state.parts.length+1,value);fail(part.partNumber===state.parts.length+1&&typeof part.etag==='string','IMPORT_MULTIPART_RECEIPT');await save({...state,nextOffset:state.nextOffset+length,parts:[...state.parts,part]});return false;}
 await upload.complete(state.parts);const pin=await objectPin(bucket,key);fail(pin&&pin.bytes===bytes&&pin.sha256===expectedSha,'IMPORT_COPY_READBACK');await save({phase:'complete',etag:pin.etag});return true;
}

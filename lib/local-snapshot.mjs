import crypto from 'node:crypto';
import {fileURLToPath}from'node:url';
import {loadTypeScript}from'../scripts/local-init.mjs';
import {LocalSetupError}from'./local-runtime.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const codecs=new Map();
function codec(name){if(!codecs.has(name))codecs.set(name,loadTypeScript(root,'lib/'+name+'.ts'));return codecs.get(name);}
export async function decodeLocalSnapshot(bucket,stored){
 if(stored.__processRecords)return codec('state-records').decodeRecordValues(bucket,stored);
 if(stored.__processChunks){const decoded=await codec('state-chunks').decodeChunkedValues(bucket,stored);return{values:decoded.values,chunkStorage:decoded.storage};}
 if(!stored.__processR2)return{values:stored};
 const ref=stored.__processR2;if(!/^snapshots\/[a-f0-9]{64}\.json$/.test(ref.key))throw new LocalSetupError('Invalid Local R2 reference');
 const object=await bucket.get(ref.key);if(!object)throw new LocalSetupError('Local R2 snapshot missing');const raw=await object.text();if(crypto.createHash('sha256').update(raw).digest('hex')!==ref.sha256)throw new LocalSetupError('Local R2 snapshot integrity failed');
 const values=JSON.parse(raw);if(stored.maintenanceMode!==undefined)values.maintenanceMode=stored.maintenanceMode;return{values};
}
export async function encodeLocalValues(bucket,values,{forceR2=false,recordStorage,chunkStorage}={}){if(recordStorage)return codec('state-records').encodeRecordValues(bucket,values,recordStorage);if(chunkStorage)return codec('state-chunks').encodeChunkedValues(bucket,values,chunkStorage);const raw=JSON.stringify(values);if(Buffer.byteLength(raw)<512*1024&&!forceR2)return raw;const digest=crypto.createHash('sha256').update(raw).digest('hex'),key=`snapshots/${digest}.json`;const old=await bucket.get(key);if(old){if(crypto.createHash('sha256').update(await old.text()).digest('hex')!==digest)throw new LocalSetupError('Local R2 object hash conflict');}else await bucket.put(key,raw,{httpMetadata:{contentType:'application/json'}});return JSON.stringify({__processR2:{key,sha256:digest},platformUsers:values.platformUsers,...(values.maintenanceMode!==undefined?{maintenanceMode:values.maintenanceMode}:{})});}

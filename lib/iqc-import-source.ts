// Optional legacy Excel bootstrap baseline. Never bundled business data or a
// fallback to mutable current IQC records. Configuration alone grants no access.
import type {IqcSnapshot} from './iqc';
type Bucket={get(key:string):Promise<{size:number;body:ReadableStream<Uint8Array>}|null>};
export async function readIqcImportSource(bucket:Bucket,config:{key?:string;sha256?:string}){
 if(!config.key||!/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,500}$/.test(config.key)||config.key.includes('..')||!config.sha256||!/^[a-f0-9]{64}$/.test(config.sha256))throw Error('IQC_IMPORT_SOURCE_CONFIGURATION_REQUIRED');
 const object=await bucket.get(config.key),limit=8*1024*1024;
 if(!object||!Number.isSafeInteger(object.size)||object.size<1||object.size>limit)throw Error('IQC_IMPORT_SOURCE_UNAVAILABLE');
 const reader=object.body.getReader(),bytes=new Uint8Array(object.size);let size=0;
 try{for(;;){const result=await reader.read();if(result.done)break;const next=size+result.value.byteLength;if(next>limit||next>object.size)throw Error('IQC_IMPORT_SOURCE_SIZE');bytes.set(result.value,size);size=next;}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 if(size!==object.size)throw Error('IQC_IMPORT_SOURCE_SIZE');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
 if(hash!==config.sha256)throw Error('IQC_IMPORT_SOURCE_HASH');
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(value?.ready!==true||!/^[a-f0-9]{64}$/.test(value.mappingSha256||'')||!value.snapshot||!['categories','suppliers','parts','errors','items'].every(key=>Array.isArray(value.snapshot[key])))throw Error('IQC_IMPORT_SOURCE_FORMAT');
 return value as {ready:true;mappingSha256:string;snapshot:IqcSnapshot};
}

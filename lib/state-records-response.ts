import {isImmutableRecordBody,readImmutableRecord} from './state-records';
type Bucket=Parameters<typeof readImmutableRecord>[0];
// Compatibility-only full history delivery. Current pages use metadata/detail
// requests; old clients may still need complete JSON. Resolve immutable bodies
// serially into the stream, never reconstruct every closed snapshot in memory.
export function recordJSONResponse(payload:unknown,bucket:Bucket,headers:HeadersInit){
 const memo=new WeakMap<object,boolean>();
 function containsRef(value:unknown):boolean{
  if(!value||typeof value!=='object')return false;if(isImmutableRecordBody(value))return true;
  const cached=memo.get(value);if(cached!==undefined)return cached;
  const result=Object.values(value).some(containsRef);memo.set(value,result);return result;
 }
 async function* fragments(value:unknown):AsyncGenerator<string>{
  if(isImmutableRecordBody(value)){yield await readImmutableRecord(bucket,value.__immutableBody);return;}
  if(!containsRef(value)){yield JSON.stringify(value)??'null';return;}
  if(Array.isArray(value)){yield '[';for(let i=0;i<value.length;i++){if(i)yield ',';yield*fragments(value[i]);}yield ']';return;}
  yield '{';let comma=false;for(const [key,child]of Object.entries(value as Record<string,unknown>)){if(child===undefined)continue;if(comma)yield ',';comma=true;yield JSON.stringify(key)+':';yield*fragments(child);}yield '}';
 }
 const encoder=new TextEncoder(),iterator=fragments(payload),jsonHeaders=new Headers(headers);jsonHeaders.set('Content-Type','application/json');let bytes:Uint8Array|null=null,offset=0;
 return new Response(new ReadableStream<Uint8Array>({async pull(controller){try{
   if(!bytes||offset>=bytes.length){const next=await iterator.next();if(next.done){controller.close();return;}bytes=encoder.encode(next.value);offset=0;}
   const end=Math.min(bytes.length,offset+64*1024);controller.enqueue(bytes.subarray(offset,end));offset=end;
  }catch(error){bytes=null;await iterator.return(undefined);controller.error(error);}},async cancel(){bytes=null;await iterator.return(undefined);}}),{headers:jsonHeaders});
}

// Process OS JSON profile: typed records and explicitly JSON-encoded state
// fields. Chunk packs and arbitrary containers are not guessed by this codec.
import {createHash} from 'node:crypto';
import {cleanJson,cleanChunkReference,isSecretField} from './snapshot-redaction.mjs';
import {photoContextForField,explicitPhotoPlan,rewritePhotoValue} from './snapshot-photo-references.mjs';
const encodedFields=new Set(['platformUsers','values','payload','processMasterData','masterDataControl','bomOverrides','bomMasterControl','processAuthoringControl','qualityMasterControl','iqcMasterControl','ipqcABMasterControl','ipqcCMasterControl','routineEquipmentControl','routineFqcControl','toolingMasterControl','publishedProcess','approvalVersions','dispatchBoard','canonicalQuality','processRoleTemplateOverrides','processCustomRoles','backupSettings']);
const encoder=new TextEncoder(),sliceSize=16384;
class Characters {
  constructor(parts,metrics){this.parts=parts[Symbol.asyncIterator]();this.text='';this.index=0;this.metrics=metrics;}
  async fill(){while(this.index>=this.text.length){const next=await this.parts.next();if(next.done)return false;this.text=next.value;this.index=0;this.metrics.maxBufferChars=Math.max(this.metrics.maxBufferChars,this.text.length);}return true;}
  async peek(){return await this.fill()?this.text[this.index]:null;}
  async take(){const value=await this.peek();if(value===null)throw Error('SNAPSHOT_JSON_TRUNCATED');this.index++;return value;}
  async expect(value){if(await this.take()!==value)throw Error('SNAPSHOT_JSON_SYNTAX');}
  async spaces(){while(await this.fill()){let end=this.index;while(end<this.text.length&&/[\t\r\n ]/.test(this.text[end]))end++;this.index=end;if(end<this.text.length)break;}}
  canonicalObject(options,depth){
    if(depth===0&&options.ownerAccountReplacement)return null;
    // Only an entire canonical object already inside the current bounded text
    // buffer qualifies. Encoded JSON/chunk envelopes fall back to the old parser.
    if(this.text[this.index]!=='{')return null;let nesting=0,string=false,end=-1;
    for(let at=this.index;at<this.text.length;at++){const c=this.text[at];if(string){if(c==='\\'){at++;continue;}if(c==='"')string=false;continue;}if(c==='"'){string=true;continue;}if(c==='{')nesting++;if(c==='}'&&--nesting===0){end=at+1;break;}}
    if(end<0)return null;const raw=this.text.slice(this.index,end);let parsed;try{parsed=JSON.parse(raw);}catch{return null;}if(JSON.stringify(parsed)!==raw)return null;
    function compatible(value,level){if(level>48)throw Error('SNAPSHOT_JSON_DEPTH');if(typeof value==='string')return !/^[[{]/.test(value.trimStart());if(Array.isArray(value))return value.every(child=>compatible(child,level+1));if(value&&typeof value==='object'){for(const [key,child]of Object.entries(value)){if(key.length>2048)throw Error('SNAPSHOT_JSON_KEY_LIMIT');if(['__proto__','constructor','prototype'].includes(key))throw Error('SNAPSHOT_JSON_KEY');if(key==='__processChunks'||!compatible(child,level+1))return false;}}return true;}
    if(!compatible(parsed,depth))return null;const output=JSON.stringify(cleanJson(parsed,{...options,depth}));this.index=end;this.metrics.fastObjects++;return output;
  }
  async *string(){
    await this.expect('"');
    let pending='';
    while(await this.fill()){
      const start=this.index,limit=Math.min(this.text.length,start+sliceSize);let end=start;
      while(end<limit){const code=this.text.charCodeAt(end);if(code===34||code===92||code<32)break;end++;}
      if(end>start){this.index=end;pending+=this.text.slice(start,end);if(pending.length>=sliceSize){yield pending;pending='';}continue;}
      const c=await this.take();if(c==='"'){if(pending)yield pending;return;}if(c!=='\\')throw Error('SNAPSHOT_JSON_STRING');
      const escape=await this.take();
      if(escape==='u'){let hex='';for(let i=0;i<4;i++)hex+=await this.take();if(!/^[a-f0-9]{4}$/i.test(hex))throw Error('SNAPSHOT_JSON_ESCAPE');pending+=String.fromCharCode(parseInt(hex,16));}
      else {const value={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'}[escape];if(value===undefined)throw Error('SNAPSHOT_JSON_ESCAPE');pending+=value;}
      if(pending.length>=sliceSize){yield pending;pending='';}
    }
    throw Error('SNAPSHOT_JSON_TRUNCATED');
  }
}
async function* decodedBody(body,metrics,maxInputBytes){
  const reader=body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});
  try{while(true){const {value,done}=await reader.read();if(done)break;metrics.inputBytes+=value.length;if(metrics.inputBytes>maxInputBytes)throw Error('SNAPSHOT_CAPACITY');for(let i=0;i<value.length;i+=65536){const text=decoder.decode(value.subarray(i,i+65536),{stream:true});if(text)yield text;}}const tail=decoder.decode();if(tail)yield tail;}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function smallString(reader){let result='';for await(const part of reader.string()){result+=part;if(result.length>2048)throw Error('SNAPSHOT_JSON_KEY_LIMIT');}return result;}
async function* quoted(parts){yield '"';for await(const part of parts)yield JSON.stringify(part).slice(1,-1);yield '"';}
const descriptorFields=new Set(['id','key','url','src','sha256','size','bytes']);
function photoScalar(raw,options,depth,field){
 const d=options.photoDescriptor;if(d?.depth===depth-1&&descriptorFields.has(field)){if(typeof raw==='string'&&raw.length>4096){if(!['url','src'].includes(field))throw Error('PHOTO_COPY_REFERENCE_FIELD_LIMIT');d.value[field]='unmapped-large-explicit-address';}else d.value[field]=raw;}
 const p=options.photoEntryPlan;if(!p||options.photoEntryDepth!==depth-1)return raw;
 if(field==='id'&&raw===p.oldKey.slice(-64))return p.newKey.slice(-64);
 if(field==='sha256'){if(raw!==p.oldSha256)throw Error('PHOTO_COPY_REFERENCE_CHECKSUM');return p.sha256;}
 if(field==='size'||field==='bytes'){if(raw!==p.oldBytes)throw Error('PHOTO_COPY_REFERENCE_SIZE');return p.bytes;}
 return raw;
}
async function* value(reader,options,depth=0,field='',discard=false){
  if(depth>48)throw Error('SNAPSHOT_JSON_DEPTH');
  await reader.spaces();const first=await reader.peek();
  // Two bounded passes collect only direct descriptor scalars. Large inline
  // image strings and unrelated row fields are never buffered as one object.
  const state=options.photoReferences?.streamState;let descriptor;
  if(first==='{'&&options.photoReferences?.entry&&state&&!discard){const index=state.next++;if(index>=100000)throw Error('PHOTO_COPY_REFERENCE_INDEX_LIMIT');if(state.mode==='scan'){descriptor={value:{},depth,index,context:options.photoReferences};options={...options,photoDescriptor:descriptor,photoEntryPlan:null,photoEntryDepth:depth};}else{if(!state.entries.has(index))throw Error('PHOTO_COPY_REFERENCE_PLAN');options={...options,photoDescriptor:null,photoEntryPlan:state.entries.get(index),photoEntryDepth:depth};}}
  if(first==='{'&&!discard&&!options.rawChunkRef&&!state){const fast=reader.canonicalObject(options,depth);if(fast!==null){yield fast;return;}}
  if(first==='{'){
    await reader.take();if(!discard)yield '{';await reader.spaces();let emitted=false;
    if(await reader.peek()==='}'){await reader.take();if(descriptor)state.entries.set(descriptor.index,null);if(!discard)yield '}';return;}
    while(true){
      const key=await smallString(reader);await reader.spaces();await reader.expect(':');
      if(!discard&&key==='__processChunks'){
        if(!options.chunkRewrites)throw Error('SNAPSHOT_CHUNKED_FORMAT_REQUIRES_REDACTION_ADAPTER');
        let raw='';for await(const part of value(reader,{...options,rawChunkRef:true},depth+1)){raw+=part;if(raw.length>1024)throw Error('SNAPSHOT_CHUNK_MANIFEST_REF');}
        if(emitted)yield ',';yield JSON.stringify(key)+':'+JSON.stringify(cleanChunkReference(JSON.parse(raw),options));emitted=true;
        await reader.spaces();const delimiter=await reader.take();if(delimiter==='}')break;if(delimiter!==',')throw Error('SNAPSHOT_JSON_SYNTAX');await reader.spaces();continue;
      }
      if(['__proto__','constructor','prototype'].includes(key))throw Error('SNAPSHOT_JSON_KEY');
      const ownerReplacement=depth===0&&key==='platformUsers'&&options.ownerAccountReplacement;
      if(ownerReplacement){
        if(discard||++options.metrics.ownerReplacements!==1)throw Error('SNAPSHOT_OWNER_ACCOUNT_FIELD');
        await reader.spaces();if(await reader.peek()!=='"')throw Error('SNAPSHOT_OWNER_ACCOUNT_FIELD');
        let original='';for await(const part of reader.string()){original+=part;if(original.length>8*1024*1024)throw Error('SNAPSHOT_OWNER_ACCOUNT_LIMIT');}
        if(original!==ownerReplacement.expected)throw Error('SNAPSHOT_OWNER_ACCOUNT_MISMATCH');
        if(emitted)yield ',';yield JSON.stringify(key)+':'+JSON.stringify(ownerReplacement.replacement);emitted=true;
      }else{
        const omit=discard||!options.rawChunkRef&&isSecretField(key);
        if(!omit){if(emitted)yield ',';yield JSON.stringify(key)+':';emitted=true;}
        yield* value(reader,{...options,photoReferences:photoContextForField(options.photoReferences,key)},depth+1,key,omit);
      }
      await reader.spaces();const delimiter=await reader.take();if(delimiter==='}')break;if(delimiter!==',')throw Error('SNAPSHOT_JSON_SYNTAX');await reader.spaces();
    }
    if(descriptor){rewritePhotoValue(descriptor.value,descriptor.context,depth);state.entries.set(descriptor.index,explicitPhotoPlan(descriptor.context,descriptor.value)||null);}if(!discard)yield '}';return;
  }
  if(first==='['){
    await reader.take();if(!discard)yield '[';await reader.spaces();
    if(await reader.peek()===']'){await reader.take();if(!discard)yield ']';return;}
    let emitted=false;while(true){if(!discard&&emitted)yield ',';yield* value(reader,{...options,photoReferences:options.photoReferences?{...options.photoReferences,entry:options.photoReferences.collection===true,collection:false}:null},depth+1,'',discard);emitted=true;await reader.spaces();const delimiter=await reader.take();if(delimiter===']')break;if(delimiter!==',')throw Error('SNAPSHOT_JSON_SYNTAX');}
    if(!discard)yield ']';return;
  }
  if(first==='"'){
    const parts=reader.string()[Symbol.asyncIterator]();
    if(discard){while(!(await parts.next()).done){}return;}
    let prefix='',ended=false;
    while(prefix.length<=4096){const next=await parts.next();if(next.done){ended=true;break;}prefix+=next.value;if(prefix.trimStart())break;}
    if(prefix.length>4096&&!prefix.trimStart())throw Error('SNAPSHOT_JSON_PREFIX_LIMIT');
    async function* allParts(){if(prefix)yield prefix;if(!ended){while(true){const next=await parts.next();if(next.done)break;yield next.value;}}}
    if((encodedFields.has(field)||field.startsWith('processEditor:'))&&/^[[{]/.test(prefix.trimStart())){
      const nested=new Characters(allParts(),options.metrics);
      yield '"';for await(const part of value(nested,options,depth+1))yield JSON.stringify(part).slice(1,-1);await nested.spaces();if(await nested.peek()!==null)throw Error('SNAPSHOT_JSON_TRAILING');yield '"';return;
    }
    // References are small; ordinary large text/media strings are streamed.
    let buffered=prefix;
    if(!ended&&buffered.length<=4096){while(buffered.length<=4096){const next=await parts.next();if(next.done){ended=true;break;}buffered+=next.value;}}
    if(ended){const raw=photoScalar(buffered,options,depth,field),mapped=options.rawChunkRef?raw:cleanJson(raw,options);yield JSON.stringify(mapped);return;}
    if(/^[[{]/.test(buffered.trimStart()))throw Error('SNAPSHOT_JSON_ENCODED_FIELD_UNSUPPORTED');
    // A long src/url is an explicit unsupported address, not an id-only photo.
    if(options.photoDescriptor?.depth===depth-1&&['url','src'].includes(field))options.photoDescriptor.value[field]='unmapped-large-explicit-address';
    if(options.photoDescriptor?.depth===depth-1&&['id','key','sha256'].includes(field))throw Error('PHOTO_COPY_REFERENCE_FIELD_LIMIT');
    async function* plain(){yield buffered;while(true){const next=await parts.next();if(next.done)break;yield next.value;}}
    yield* quoted(plain());return;
  }
  let primitive='';while(true){const c=await reader.peek();if(c===null||/[\s,}\]]/.test(c))break;primitive+=await reader.take();if(primitive.length>128)throw Error('SNAPSHOT_JSON_NUMBER_LIMIT');}
  if(!/^(true|false|null|-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?)$/.test(primitive))throw Error('SNAPSHOT_JSON_SYNTAX');
  if(!discard){if(!options.photoDescriptor&&!options.photoEntryPlan){yield primitive;return;}const parsed=JSON.parse(primitive),raw=photoScalar(parsed,options,depth,field);yield raw===parsed?primitive:JSON.stringify(raw);}
}
export function jsonTransformStream(body,{rewrite=new Map(),references=new Set(),knownKeys=new Set(),chunkRewrites=null,metrics={},maxInputBytes=64*1024**3,photoReferences=null,ownerAccountReplacement=/** @type {{expected:string,replacement:string}|null} */(null)}={}){
  if(photoReferences?.plans?.size&&!photoReferences.streamState)throw Error('PHOTO_COPY_REFERENCE_PLAN_REQUIRED');
  if(ownerAccountReplacement&&(!['expected','replacement'].every(key=>typeof ownerAccountReplacement[key]==='string'&&encoder.encode(ownerAccountReplacement[key]).length<=8*1024*1024)))throw Error('SNAPSHOT_OWNER_ACCOUNT_LIMIT');
  Object.assign(metrics,{inputBytes:0,outputBytes:0,maxBufferChars:0,maxOutputChunk:0,fastObjects:0,ownerReplacements:0});
  const options={rewrite,references,knownKeys,chunkRewrites,metrics,ownerAccountReplacement,photoReferences};
  async function* transform(){const reader=new Characters(decodedBody(body,metrics,maxInputBytes),metrics);let pending='';const emit=text=>{const bytes=encoder.encode(text);metrics.outputBytes+=bytes.length;metrics.maxOutputChunk=Math.max(metrics.maxOutputChunk,bytes.length);return bytes;};try{for await(const text of value(reader,options)){pending+=text;while(pending.length>=sliceSize){let end=sliceSize;if(/[\uD800-\uDBFF]/.test(pending[end-1])&&(end===pending.length||/[\uDC00-\uDFFF]/.test(pending[end])))end--;yield emit(pending.slice(0,end));pending=pending.slice(end);}}if(pending)yield emit(pending);await reader.spaces();if(await reader.peek()!==null)throw Error('SNAPSHOT_JSON_TRAILING');const state=photoReferences?.streamState;if(state?.mode==='apply'&&state.next!==state.entries.size)throw Error('PHOTO_COPY_REFERENCE_PLAN');if(ownerAccountReplacement&&metrics.ownerReplacements!==1)throw Error('SNAPSHOT_OWNER_ACCOUNT_FIELD');}finally{await reader.parts.return?.();}}
  const iterator=transform();
  return new ReadableStream({async pull(controller){try{const next=await iterator.next();if(next.done)controller.close();else controller.enqueue(next.value);}catch(error){controller.error(error);}},async cancel(){await iterator.return();}});
}
export async function photoJsonTransformStream(bodyFactory,options){
 const entries=new Map(),scan={mode:'scan',next:0,entries};await analyzeJsonStream(bodyFactory,{...options,photoReferences:{...options.photoReferences,streamState:scan}});
 return jsonTransformStream(await bodyFactory(),{...options,photoReferences:{...options.photoReferences,streamState:{mode:'apply',next:0,entries}}});
}
export async function analyzeJsonStream(bodyFactory,options={}){
  const references=options.references||new Set(),hash=createHash('sha256'),metrics={};
  const stream=jsonTransformStream(await bodyFactory(),{...options,references,metrics}),reader=stream.getReader();
  try{while(true){const {value,done}=await reader.read();if(done)break;hash.update(value);}}
  finally{reader.releaseLock();}
  if(options.knownKeys)for(const key of references)if(!options.knownKeys.has(key))throw Error('SNAPSHOT_REFERENCE_MISSING');
  return {bytes:metrics.outputBytes,sha256:hash.digest('hex'),references,metrics};
}

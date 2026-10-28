// Lossless-first policy shared by authenticated uploads and the process editor.
// Uses only standard bounded Streams; no sharp/native modules, resize, colour
// conversion, paid image service or background processing in Workers.
const pngSignature=new Uint8Array([137,80,78,71,13,10,26,10]);
const maximumOptimizeBytes=8*1024*1024,maximumInflatedBytes=32*1024*1024;
export const photoPolicy=Object.freeze({version:1,mode:'lossless-first',preserveDimensions:true,reencodeLossyFormats:false,maximumPngBytes:maximumOptimizeBytes});
const fail=(v,c)=>{if(!v)throw Error(c);};
const crcTable=Uint32Array.from({length:256},(_,i)=>{let n=i;for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
const typeText=b=>String.fromCharCode(...b);
export function photoTypeMatches(bytes,type){return bytes instanceof Uint8Array&&(type==='image/png'?pngSignature.every((b,i)=>bytes[i]===b):type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:type==='image/gif'?/^GIF8[79]a$/.test(typeText(bytes.subarray(0,6))):type==='image/webp'?bytes.length>=12&&typeText(bytes.subarray(0,4))==='RIFF'&&typeText(bytes.subarray(8,12))==='WEBP':false);}
function pngParts(bytes){
 const parts=[];let offset=8,idat=false,idatEnded=false,animated=false,width,height,rowBytes,bpp,interlaced=false;
 while(offset<bytes.length){fail(parts.length<4096&&offset+12<=bytes.length,'PHOTO_PNG_INVALID');const view=new DataView(bytes.buffer,bytes.byteOffset+offset,bytes.length-offset),length=view.getUint32(0);fail(length<=bytes.length-offset-12,'PHOTO_PNG_INVALID');const type=typeText(bytes.subarray(offset+4,offset+8));fail(/^[A-Za-z]{4}$/.test(type)&&crc(bytes.subarray(offset+4,offset+8+length))===view.getUint32(8+length),'PHOTO_PNG_INVALID');
  if(parts.length===0){fail(type==='IHDR'&&length===13,'PHOTO_PNG_INVALID');width=view.getUint32(8);height=view.getUint32(12);const bits=bytes[offset+16],colour=bytes[offset+17],channels=({0:1,2:3,3:1,4:2,6:4})[colour];fail(width>0&&height>0&&width<=0x7fffffff&&height<=0x7fffffff&&channels&&({0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]})[colour].includes(bits)&&bytes[offset+18]===0&&bytes[offset+19]===0&&bytes[offset+20]<=1,'PHOTO_PNG_INVALID');rowBytes=Math.ceil(width*channels*bits/8);bpp=Math.ceil(channels*bits/8);interlaced=bytes[offset+20]===1;}
  else fail(type!=='IHDR','PHOTO_PNG_INVALID');
  if(type==='IDAT'){fail(!idatEnded,'PHOTO_PNG_INVALID');idat=true;}else if(idat)idatEnded=true;
  if(['acTL','fcTL','fdAT'].includes(type))animated=true;
  parts.push({type,raw:bytes.subarray(offset,offset+12+length),data:bytes.subarray(offset+8,offset+8+length)});offset+=12+length;
  if(type==='IEND'){fail(length===0&&idat&&offset===bytes.length,'PHOTO_PNG_INVALID');break;}
 }
 fail(parts.at(-1)?.type==='IEND','PHOTO_PNG_INVALID');return{parts,width,height,rowBytes,bpp,interlaced,animated};
}
function paeth(a,b,c){const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;}
const byteCost=n=>{const b=n&255;return b<128?b:256-b;};
function refilterRows(rowBytes,bpp){let previous=new Uint8Array(rowBytes),decoded=new Uint8Array(rowBytes);const row=new Uint8Array(rowBytes+1);let used=0;
 return new TransformStream({transform(part,controller){let at=0;while(at<part.length){const n=Math.min(row.length-used,part.length-at);row.set(part.subarray(at,at+n),used);at+=n;used+=n;if(used!==row.length)continue;const filter=row[0];fail(filter<=4,'PHOTO_PNG_DATA');for(let i=0;i<rowBytes;i++){const a=i>=bpp?decoded[i-bpp]:0,b=previous[i],c=i>=bpp?previous[i-bpp]:0,predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?(a+b)>>1:paeth(a,b,c);decoded[i]=(row[i+1]+predictor)&255;}
  const scores=[0,0,0,0,0];for(let i=0;i<rowBytes;i++){const v=decoded[i],a=i>=bpp?decoded[i-bpp]:0,b=previous[i],c=i>=bpp?previous[i-bpp]:0;scores[0]+=byteCost(v);scores[1]+=byteCost(v-a);scores[2]+=byteCost(v-b);scores[3]+=byteCost(v-((a+b)>>1));scores[4]+=byteCost(v-paeth(a,b,c));}let selected=0;for(let i=1;i<5;i++)if(scores[i]<scores[selected])selected=i;
  const out=new Uint8Array(row.length);out[0]=selected;for(let i=0;i<rowBytes;i++){const a=i>=bpp?decoded[i-bpp]:0,b=previous[i],c=i>=bpp?previous[i-bpp]:0,predictor=selected===0?0:selected===1?a:selected===2?b:selected===3?(a+b)>>1:paeth(a,b,c);out[i+1]=(decoded[i]-predictor)&255;}controller.enqueue(out);const spare=previous;previous=decoded;decoded=spare;used=0;}},flush(){fail(used===0,'PHOTO_PNG_DATA');}});
}
async function validateInflated(stream,expected,rowBytes){const reader=stream.getReader();let size=0;try{for(;;){const r=await reader.read();if(r.done)break;fail(size+r.value.length<=expected,'PHOTO_PNG_DATA');let i=(rowBytes+1-size%(rowBytes+1))%(rowBytes+1);for(;i<r.value.length;i+=rowBytes+1)fail(r.value[i]<=4,'PHOTO_PNG_DATA');size+=r.value.length;}fail(size===expected,'PHOTO_PNG_DATA');}catch{throw Error('PHOTO_PNG_DATA');}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
async function collect(stream,max){const reader=stream.getReader(),parts=[];let size=0;try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;fail(size<=max,'PHOTO_OPTIMIZE_NOT_SMALLER');parts.push(r.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}const out=new Uint8Array(size);let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;}
function idatChunk(data){const out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set([73,68,65,84],4);out.set(data,8);v.setUint32(8+data.length,crc(out.subarray(4,8+data.length)));return out;}
export async function optimizePhoto(bytes,type){
 fail(photoTypeMatches(bytes,type),'PHOTO_IMAGE_FORMAT');const original=reason=>({bytes,type,changed:false,reason});
 if(type!=='image/png')return original('original-format-preserved');
 const p=pngParts(bytes);if(p.animated||p.interlaced)return original('png-animation-or-interlace-preserved');
 // Unsupported runtimes/layout sizes retain their original bytes. No fallback
 // to lossy canvas, native sharp or another service is attempted.
 if(bytes.length>maximumOptimizeBytes||p.rowBytes>256*1024||p.height>Math.floor(maximumInflatedBytes/(p.rowBytes+1)))return original('png-size-preserved');
 if(typeof CompressionStream!=='function'||typeof DecompressionStream!=='function')return original('png-codec-unavailable');
 const compressed=new Blob(p.parts.filter(c=>c.type==='IDAT').map(c=>c.data)),expected=(p.rowBytes+1)*p.height;
 await validateInflated(compressed.stream().pipeThrough(new DecompressionStream('deflate')),expected,p.rowBytes);
 if(bytes.length<128*1024)return original('png-size-preserved');
 let packed;try{packed=await collect(compressed.stream().pipeThrough(new DecompressionStream('deflate')).pipeThrough(refilterRows(p.rowBytes,p.bpp)).pipeThrough(new CompressionStream('deflate')),bytes.length+65536);}catch(e){if(e.message==='PHOTO_OPTIMIZE_NOT_SMALLER')return original('png-not-smaller');throw Error('PHOTO_PNG_DATA');}
 const idat=idatChunk(packed),size=8+idat.length+p.parts.filter(c=>c.type!=='IDAT').reduce((s,c)=>s+c.raw.length,0);if(size+1024>=bytes.length)return original('png-not-smaller');
 const out=new Uint8Array(size);out.set(pngSignature);let offset=8,written=false;for(const c of p.parts){if(c.type==='IDAT'){if(written)continue;out.set(idat,offset);offset+=idat.length;written=true;}else{out.set(c.raw,offset);offset+=c.raw.length;}}
 // Pixel sample bytes stay unchanged; row filters are reversible. All
 // ancillary/profile/palette/transparency chunks stay byte-identical.
 return{bytes:out,type,changed:true,reason:'png-lossless-recompressed'};
}
// Blob/File input: preserve names/MIME/dimensions, including transparent PNG.
// Never run already encoded or unknown-purpose technical images through a
// second lossy canvas pass. Existing 1600px WebP images stay valid.
export async function prepareBrowserPhoto(blob){
 fail(blob&&Number.isSafeInteger(blob.size)&&blob.size>=0&&typeof blob.arrayBuffer==='function','PHOTO_BODY_REQUIRED');
 if(blob.type!=='image/png'||blob.size>maximumOptimizeBytes)return{blob,changed:false,reason:'original-format-or-size-preserved'};
 const result=await optimizePhoto(new Uint8Array(await blob.arrayBuffer()),blob.type);
 return{blob:result.changed?new Blob([result.bytes],{type:result.type}):blob,changed:result.changed,reason:result.reason};
}
export async function readPhotoUpload(request,maxBytes){
 fail(Number.isSafeInteger(maxBytes)&&maxBytes>0&&maxBytes<=25_000_000,'PHOTO_UPLOAD_CONFIGURATION');const declared=request.headers.get('Content-Length');if(declared!==null)fail(/^\d+$/.test(declared)&&Number(declared)<=maxBytes,'PHOTO_BODY_LIMIT');const reader=request.body?.getReader();fail(reader,'PHOTO_BODY_REQUIRED');const parts=[];let size=0;try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;fail(size<=maxBytes,'PHOTO_BODY_LIMIT');parts.push(r.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}fail(size>0,'PHOTO_BODY_REQUIRED');const bytes=new Uint8Array(size);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}const result=await optimizePhoto(bytes,request.headers.get('Content-Type')?.split(';')[0]||'');return result.bytes.slice().buffer;
}
export function photoUploadFailure(error){const code=error instanceof Error?error.message:'';const status=code==='PHOTO_BODY_LIMIT'?413:code==='PHOTO_BODY_REQUIRED'?422:code==='PHOTO_IMAGE_FORMAT'?415:['PHOTO_PNG_INVALID','PHOTO_PNG_DATA'].includes(code)?422:0;return status?Response.json({code,error:status===413?'圖片超過此模組上限 / Ảnh vượt giới hạn của mô-đun':'圖片不完整或格式不符 / Ảnh không đầy đủ hoặc sai định dạng'},{status}):null;}

import {sha256,utf8,zipFiles} from './web-feedback-zip';

export class ProblemExportError extends Error {constructor(code:string,public status=422){super(code);}}
export const problemExportLimits={helper:{records:20,images:30_000_000,zip:32_000_000,selection:200,preview:2_000_000},access:{records:20,images:0,zip:4_000_000,selection:200,preview:2_000_000}} as const;
export type ExportSource=keyof typeof problemExportLimits;
export type ExportImage={id:string;name:string;type:string;size:number;sha256:string};
export type ExportItem={id:string;version:number;data:Record<string,unknown>;images:ExportImage[]};
export type ExportBatch={ids:string[];versions:{id:string;version:number}[];imageIds:string[];count:number;imageBytes:number;metadataBytes:number};
const secretKey=/^(?:password|passwd|pwd|secret|cookie|set-cookie|authorization|(?:access|refresh|session)[_-]?token|token|api[_-]?key|密碼|密码|mật khẩu)$/i;
const formKey=/^(?:rawForm|formData|originalForm|requestBody|rawPayload|input|payload)$/i;
export function exportText(input:unknown,knownSecrets:string[]=[]):string {
 let value=typeof input==='string'?input:'';
 for(const secret of knownSecrets)if(secret.length>0)value=value.split(secret).join('[REDACTED]');
 try{const parsed:unknown=JSON.parse(value);if(parsed&&typeof parsed==='object'){
  const clean=(item:unknown,depth=0):unknown=>{if(depth>20)return'[EXCLUDED]';if(Array.isArray(item))return item.map(value=>clean(value,depth+1));if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([key,value])=>[key,secretKey.test(key)?'[REDACTED]':formKey.test(key)?'[EXCLUDED ORIGINAL FORM]':clean(value,depth+1)]));return item;};
  value=JSON.stringify(clean(parsed));
 }}catch{/* User text remains data, never executable instructions. */}
 return value.replace(/\b(cookie|set-cookie|authorization)\s*[:=]\s*[^\r\n]+/gi,'$1: [REDACTED]')
  .replace(/((?:password|passwd|pwd|secret|(?:access|refresh|session)[_-]?token|token|api[_-]?key|密碼|密码|mật khẩu)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi,'$1[REDACTED]')
  .replace(/\bBearer\s+[a-zA-Z0-9._~+/-]+=*/gi,'Bearer [REDACTED]');
}
export function exportIds(input:unknown,source:ExportSource):string[]{if(!Array.isArray(input)||!input.length||input.length>problemExportLimits[source].selection||input.some(id=>typeof id!=='string'||id.length>120)||new Set(input).size!==input.length)throw new ProblemExportError('INVALID_EXPORT_SELECTION');return input as string[];}
export function selectedImages(input:unknown,items:ExportItem[]):Set<string>{
 const allowed=new Set(items.flatMap(item=>item.images.map(image=>image.id)));
 if(input===undefined)return allowed;
 if(!Array.isArray(input)||input.some(id=>typeof id!=='string'||!allowed.has(id))||new Set(input).size!==input.length)throw new ProblemExportError('INVALID_EXPORT_IMAGES');
 return new Set(input as string[]);
}
export function planProblemExport(items:ExportItem[],source:ExportSource,images:Set<string>){
 const limits=problemExportLimits[source],batches:ExportBatch[]=[];let batch:ExportBatch={ids:[],versions:[],imageIds:[],count:0,imageBytes:0,metadataBytes:0};
 for(const item of items){const imageRows=item.images.filter(image=>images.has(image.id)),imageBytes=imageRows.reduce((sum,image)=>sum+image.size,0),metadataBytes=utf8(JSON.stringify(item.data)).length+utf8(JSON.stringify(imageRows)).length+2048;
  if(imageBytes>limits.images||metadataBytes+imageBytes+8192>limits.zip)throw new ProblemExportError('SINGLE_RECORD_EXPORT_LIMIT',413);
  if(batch.count&&(batch.count>=limits.records||batch.imageBytes+imageBytes>limits.images||batch.metadataBytes+metadataBytes+batch.imageBytes+imageBytes+8192>limits.zip)){batch.imageIds=[...new Set(batch.imageIds)];batches.push(batch);batch={ids:[],versions:[],imageIds:[],count:0,imageBytes:0,metadataBytes:0};}
  batch.ids.push(item.id);batch.versions.push({id:item.id,version:item.version});batch.imageIds.push(...imageRows.map(image=>image.id));batch.count++;batch.imageBytes+=imageBytes;batch.metadataBytes+=metadataBytes;
 }
 if(batch.count){batch.imageIds=[...new Set(batch.imageIds)];batches.push(batch);}
 return{source,selectedCount:items.length,limits,batches,scope:'selected-records-only'};
}
export function validateExportBatch(body:{ids?:unknown;versions?:unknown;imageIds?:unknown},items:ExportItem[],source:ExportSource){
 const ids=exportIds(body.ids,source);if(ids.length>problemExportLimits[source].records)throw new ProblemExportError('EXPORT_BATCH_LIMIT',413);
 if(!Array.isArray(body.versions)||body.versions.length!==ids.length||body.versions.some((entry:unknown,index:number)=>!entry||typeof entry!=='object'||Object.keys(entry).sort().join()!=='id,version'||(entry as {id?:unknown}).id!==ids[index]||(entry as {version?:unknown}).version!==items[index]?.version))throw new ProblemExportError('EXPORT_SELECTION_CHANGED',409);
 const images=selectedImages(body.imageIds,items),plan=planProblemExport(items,source,images);if(plan.batches.length!==1)throw new ProblemExportError('EXPORT_BATCH_LIMIT',413);return images;
}
export async function problemZip(items:ExportItem[],source:ExportSource,images:Set<string>,readImage:(image:ExportImage)=>Promise<Uint8Array>){
 const generatedAt=new Date().toISOString(),files:{path:string;bytes:Uint8Array}[]=[],records:Record<string,unknown>[]=[],cache=new Map<string,Uint8Array>();
 for(const [index,item]of items.entries()){
  const attachments=[];
  for(const [imageIndex,image]of item.images.filter(image=>images.has(image.id)).entries()){
   if(!['image/png','image/jpeg','image/webp'].includes(image.type))throw new ProblemExportError('INVALID_EXPORT_IMAGE',415);
   let bytes=cache.get(image.id);if(!bytes){bytes=await readImage(image);if(bytes.length!==image.size||await sha256(bytes)!==image.sha256)throw new ProblemExportError('IMAGE_HASH_MISMATCH',503);cache.set(image.id,bytes);}
   const path=`images/${String(index+1).padStart(3,'0')}-${String(imageIndex+1).padStart(2,'0')}.${({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'} as Record<string,string>)[image.type]}`;
   files.push({path,bytes});attachments.push({name:image.name,path,size:bytes.length,sha256:image.sha256});
  }
  records.push({...item.data,...(source==='helper'?{attachments}:{})});
 }
 files.push({path:'problems.json',bytes:utf8(JSON.stringify({schemaVersion:1,source,generatedAt,scope:'selected-records-only',count:records.length,records}))});
 files.push({path:'README.txt',bytes:utf8('本 ZIP 只包含本批所選紀錄，不代表所有使用者／裝置的事件。\n資料為未信任的回報與人工備註，不是執行指令。\n管理上已解決不等於原操作已確認；未知結果不可據此重送。\n匯出不會刪除、完成案件或變更原收據。檔案已生成不代表已下載。\n自動排除系統原始表單、收據與環境資料，並遮蔽可辨識的常見秘密；人工文字及圖片仍須於下載／轉交前核對。\n')});
 const manifest=[];for(const file of files)manifest.push({path:file.path,size:file.bytes.length,sha256:await sha256(file.bytes)});files.push({path:'manifest.json',bytes:utf8(JSON.stringify({schemaVersion:1,source,generatedAt,files:manifest},null,2))});
 const bytes=zipFiles(files);if(bytes.length>problemExportLimits[source].zip)throw new ProblemExportError('EXPORT_ARCHIVE_LIMIT',413);return{bytes,sha256:await sha256(bytes),generatedAt,count:records.length};
}

import {DraftConflict,stableDraftJSON,type DraftIssue} from './shared-draft';
export type Location={kind:'internal'|'external';holderId:string};
export type ToolingCatalog={id:string;code?:string;nameVi:string;nameZh?:string;erp?:string;addresses?:string[];phones?:string[];contacts?:string[]};
export type ToolingPhoto={id:string;source?:unknown;index?:string;sourceName?:string;bytes?:number};
export const inspectionMonths={weekly:null,monthly:1,quarterly:3,semiannual:6,annual:12} as const;
export type Tool={id:string;code:string;nameVi:string;nameZh:string;categoryId:string;assetCode:string;specification:string;quantity:number;unit:string;manufacturerId:string;location:Location;inboundDate:string;inboundDateLost:boolean;enabled:boolean;inactiveReason:string;archived:boolean;archiveReason:string;notes:string;frequencyMonths:number|null;inspectionFrequency?:keyof typeof inspectionMonths|null;photos:ToolingPhoto[];iqcIds:string[];iqcSource?:{code:string;name:string;status:string;versionId:string};source?:unknown};
export type ToolTransfer={id:string;toolId:string;from:Location;to:Location;reason:string;correctionOf?:string;quantity?:number;unit?:string;createdAt?:string;createdBy?:string;createdById?:string;updatedAt?:string;updatedBy?:string;updatedById?:string};
export type ToolingSnapshot={categories:ToolingCatalog[];custodians:ToolingCatalog[];suppliers:ToolingCatalog[];manufacturers:ToolingCatalog[];tools:Tool[];transfers:ToolTransfer[]};
export const emptyTooling=():ToolingSnapshot=>({categories:[],custodians:[],suppliers:[],manufacturers:[],tools:[],transfers:[]});
export const same=(a:unknown,b:unknown)=>stableDraftJSON(a)===stableDraftJSON(b);
export function toolingLocation(content:ToolingSnapshot,id:string):Location|undefined{
 const tool=content.tools.find(t=>t.id===id);if(!tool)return;
 const rows=content.transfers.filter(t=>t.toolId===id),effective=new Map<string,ToolTransfer>(),root=new Map<string,string>();
 for(const tr of rows){const key=tr.correctionOf?root.get(tr.correctionOf):tr.id;if(!key)continue;root.set(tr.id,key);effective.set(key,tr);}
 let location=tool.location;
 for(const tr of effective.values())if(tr.to.holderId&&(tr.to.kind==='internal'?content.custodians:content.suppliers).some(h=>h.id===tr.to.holderId))location=tr.to;
 return location;
}
export function toolingIssues(content:ToolingSnapshot):DraftIssue[]{
 const issues:DraftIssue[]=[];const missing=(collection:string,id:string,field:string,message:string)=>issues.push({kind:'missing',code:'TOOLING_BUSINESS_MISSING',path:[collection,{id},field],message});
 for(const t of content.tools){
  for(const field of ['nameVi','nameZh','categoryId','assetCode','specification','unit','manufacturerId'] as const)if(!t[field])missing('tools',t.id,field,'Cần bổ sung / 待補: '+field);
  if(!t.inboundDate&&!t.inboundDateLost)missing('tools',t.id,'inboundDate','Ngày nhập chưa có / 入庫日期待補');
  if(!t.frequencyMonths&&!t.inspectionFrequency)missing('tools',t.id,'frequencyMonths','Tần suất kiểm tra chưa có / 檢查頻率待補');
  if(!t.enabled&&!t.inactiveReason.trim())missing('tools',t.id,'inactiveReason','Lý do ngưng sử dụng / 停用原因待補');
  if(t.archived&&!t.archiveReason.trim())missing('tools',t.id,'archiveReason','Lý do lưu trữ / 封存原因待補');
  if(!content.categories.some(c=>c.id===t.categoryId))missing('tools',t.id,'categoryId','Loại dụng cụ cần xác nhận / 器具類別待確認');
  if(!content.manufacturers.some(c=>c.id===t.manufacturerId))missing('tools',t.id,'manufacturerId','Nhà chế tạo cần xác nhận / 製造商待確認');
  if(!t.photos.length)missing('tools',t.id,'photos','Chưa có ảnh / 照片待補');
  if(t.iqcSource?.code&&!t.iqcIds.length)missing('tools',t.id,'iqcIds','IQC chưa đối chiếu: '+t.iqcSource.code+' / IQC 待映射');
  const location=toolingLocation(content,t.id)!;
  if(!(location.kind==='internal'?content.custodians:content.suppliers).some(c=>c.id===location.holderId))missing('tools',t.id,'location','Đơn vị giữ cần xác nhận / 保管單位待確認');
 }
 for(const group of ['categories','custodians','suppliers','manufacturers'] as const)for(const c of content[group]){
  if(!c.nameVi?.trim())missing(group,c.id,'nameVi','Tên chưa có / 名稱待補');
  if(['suppliers','manufacturers'].includes(group)&&!c.erp?.trim())missing(group,c.id,'erp','Mã ERP chưa có / ERP 待補');
 }
 for(const t of content.transfers){if(!t.reason.trim())missing('transfers',t.id,'reason','Lý do chuyển chưa có / 移轉原因待補');if(!t.to.holderId)missing('transfers',t.id,'to','Đích chưa xác định; giữ vị trí đã biết / 目的位置待補；保留已知位置');}
 return issues;
}
export function checkTooling(content:ToolingSnapshot){
 const fail=(code:string):never=>{throw new DraftConflict(code,422);};
 for(const key of Object.keys(emptyTooling()) as (keyof ToolingSnapshot)[]){const list=content[key];if(!Array.isArray(list)||list.length>10000)fail('TOOLING_INVALID_COLLECTION');const ids=new Set();for(const row of list){if(!row||typeof row.id!=='string'||!row.id||ids.has(row.id))fail('TOOLING_DUPLICATE_ID');ids.add(row.id);}}
 const loc=(value:Location)=>{if(!value||!['internal','external'].includes(value.kind)||typeof value.holderId!=='string')fail('TOOLING_INVALID_LOCATION');};
 for(const key of ['categories','suppliers','manufacturers','tools'] as const){const codes=new Set();for(const row of content[key]){if(typeof row.code!=='string'||!row.code||codes.has(row.code))fail('TOOLING_DUPLICATE_CODE');codes.add(row.code);}}
 for(const t of content.tools){
  if(!Number.isSafeInteger(t.quantity)||t.quantity<1)fail('TOOLING_QUANTITY_INVALID');loc(t.location);
  if(t.inboundDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(t.inboundDate)||Number.isNaN(Date.parse(t.inboundDate))||new Date(t.inboundDate).toISOString().slice(0,10)!==t.inboundDate))fail('TOOLING_DATE_INVALID');
  if(t.inboundDate&&t.inboundDateLost)fail('TOOLING_DATE_LOST_CONFLICT');
  if(t.frequencyMonths!==null&&(!Number.isInteger(t.frequencyMonths)||t.frequencyMonths<1))fail('TOOLING_FREQUENCY_INVALID');
  if(t.inspectionFrequency!=null&&(!Object.hasOwn(inspectionMonths,t.inspectionFrequency)||inspectionMonths[t.inspectionFrequency]!==t.frequencyMonths))fail('TOOLING_FREQUENCY_INVALID');
  for(const k of ['nameVi','nameZh','categoryId','assetCode','specification','unit','manufacturerId','inboundDate','inactiveReason','archiveReason','notes'] as const)if(typeof t[k]!=='string')fail('TOOLING_INVALID_FIELD');
  for(const k of ['enabled','archived','inboundDateLost'] as const)if(typeof t[k]!=='boolean')fail('TOOLING_INVALID_FIELD');
  if(!Array.isArray(t.photos)||t.photos.some(p=>!p||!/^[a-f0-9]{64}$/.test(p.id))||new Set(t.photos.map(p=>p.id)).size!==t.photos.length)fail('TOOLING_PHOTO_INVALID');
  if(!Array.isArray(t.iqcIds)||t.iqcIds.some(id=>typeof id!=='string')||new Set(t.iqcIds).size!==t.iqcIds.length)fail('TOOLING_IQC_INVALID');
 }
 for(const group of ['categories','custodians','suppliers','manufacturers'] as const)for(const c of content[group]){if(typeof c.nameVi!=='string')fail('TOOLING_INVALID_FIELD');if(['suppliers','manufacturers'].includes(group))for(const f of ['addresses','phones','contacts'] as const)if(!Array.isArray(c[f])||c[f]!.some(v=>typeof v!=='string'))fail('TOOLING_CONTACT_INVALID');}
 for(const t of content.transfers){loc(t.from);loc(t.to);if(!content.tools.some(x=>x.id===t.toolId)||typeof t.reason!=='string')fail('TOOLING_TRANSFER_INVALID');if(t.quantity!==undefined&&(!Number.isSafeInteger(t.quantity)||t.quantity<1))fail('TOOLING_QUANTITY_INVALID');if(t.unit!==undefined&&typeof t.unit!=='string')fail('TOOLING_INVALID_FIELD');if(t.correctionOf&&!content.transfers.some(x=>x.id===t.correctionOf&&x.toolId===t.toolId&&x.id!==t.id))fail('TOOLING_CORRECTION_INVALID');}
}

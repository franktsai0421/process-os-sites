import {cloneDraft,DraftConflict,stableDraftJSON} from './shared-draft';

type MatrixItem = Record<string,unknown> & {id:string;category:string;isDeleted?:boolean;productCodes:string[]};
type Product = {code:string;category?:string;name?:string;specification?:string};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const sorted=(rows:unknown[])=>rows.map(row=>stableDraftJSON(row)).sort();
const sameSet=(a:unknown[],b:unknown[])=>stableDraftJSON(sorted(a))===stableDraftJSON(sorted(b));
/** Only changed cells participate; concurrent choices in other cells survive. */
export function mergeFqcMatrixCells(items:MatrixItem[],products:Product[],input:unknown):MatrixItem[]{
  if(!Array.isArray(input)||input.length>100000)throw new DraftConflict('INVALID_FQC_MATRIX',422);
  const rows=new Map(items.filter(row=>!row.isDeleted).map(row=>[row.id,row])),catalog=new Map(products.map(p=>[p.code,p])),seen=new Set<string>();
  const selections=new Map<string,Set<string>>();
  for(const cell of input){
    if(!object(cell)||Object.keys(cell).some(k=>!['itemId','productCode','base','value'].includes(k))||typeof cell.itemId!=='string'||typeof cell.productCode!=='string'||typeof cell.base!=='boolean'||typeof cell.value!=='boolean')throw new DraftConflict('INVALID_FQC_MATRIX',422);
    const key=stableDraftJSON([cell.itemId,cell.productCode]);if(seen.has(key))throw new DraftConflict('INVALID_FQC_MATRIX',422);seen.add(key);
    const row=rows.get(cell.itemId);
    if(!row||!Array.isArray(row.productCodes)||!catalog.has(cell.productCode))throw new DraftConflict('FQC_MATRIX_SCOPE_CHANGED',409);
    const current=row.productCodes.includes(cell.productCode);
    if(current!==cell.base&&current!==cell.value)throw new DraftConflict('DEPENDENCY_CHANGED_RECONFIRM',409,{itemId:cell.itemId,productCode:cell.productCode});
    const codes=selections.get(row.id)||new Set(row.productCodes);selections.set(row.id,codes);
    if(cell.value)codes.add(cell.productCode);else codes.delete(cell.productCode);
  }
  return replaceFqcMatrix(items,products,{products:products.map(p=>({code:p.code,category:p.category||''})),items:items.filter(row=>!row.isDeleted).map(row=>({id:row.id,category:row.category,productCodes:selections.has(row.id)?[...selections.get(row.id)!]:row.productCodes}))});
}
/** Server-only projection: all non-matrix fields come from the current CAS read. */
export function replaceFqcMatrix(items:MatrixItem[],products:Product[],input:unknown):MatrixItem[]{
  if(!object(input)||Object.keys(input).some(k=>!['items','products'].includes(k))||!Array.isArray(input.items)||!Array.isArray(input.products))throw new DraftConflict('INVALID_FQC_MATRIX',422);
  const live=items.filter(row=>!row.isDeleted),catalog=new Map(products.map(p=>[p.code,p]));
  if(catalog.size!==products.length||products.some(p=>typeof p.code!=='string'||!p.code)||new Set(live.map(r=>r.id)).size!==live.length)throw new DraftConflict('FQC_MATRIX_SCOPE_CHANGED',409);
  const expectedProducts=products.map(p=>({code:p.code,category:p.category||''}));
  if(!sameSet(input.products,expectedProducts)||input.items.length!==live.length)throw new DraftConflict('FQC_MATRIX_SCOPE_CHANGED',409);
  const byId=new Map(live.map(item=>[item.id,item])),selections=new Map<string,string[]>();
  for(const row of input.items){
    if(!object(row)||Object.keys(row).some(k=>!['id','category','productCodes'].includes(k))||typeof row.id!=='string'||typeof row.category!=='string'||!Array.isArray(row.productCodes)||row.productCodes.some(c=>typeof c!=='string')||new Set(row.productCodes).size!==row.productCodes.length||selections.has(row.id))throw new DraftConflict('INVALID_FQC_MATRIX',422);
    const current=byId.get(row.id);
    if(!current||current.category!==row.category)throw new DraftConflict('FQC_MATRIX_SCOPE_CHANGED',409);
    if(!Array.isArray(current.productCodes))throw new DraftConflict('INVALID_FQC_MATRIX',422);
    if(row.productCodes.some(code=>!catalog.has(code)&&!current.productCodes.includes(code)))throw new DraftConflict('FQC_MATRIX_SCOPE_CHANGED',409);
    selections.set(row.id,row.productCodes as string[]);
  }
  return items.map(item=>{
    if(item.isDeleted)return cloneDraft(item);
    const codes=selections.get(item.id);if(!codes)throw new DraftConflict('FQC_MATRIX_SCOPE_CHANGED',409);
    const refs=(previous:unknown)=>{
      const old=new Map<string,unknown>();if(Array.isArray(previous))for(const ref of previous){const code=typeof ref==='string'?ref:ref?.code;if(typeof code==='string'&&!old.has(code))old.set(code,ref);}
      return codes.map(code=>{if(item.productCodes.includes(code)&&old.has(code))return cloneDraft(old.get(code));const p=catalog.get(code);return {code,kind:p?'product':'unresolved',name:p?.name||'',specification:p?.specification||''};});
    };
    return {...cloneDraft(item),productCodes:[...codes],productRefs:refs(item.productRefs),...(item.products!==undefined?{products:refs(item.products)}:{})};
  });
}

(function(host){
  'use strict';
  const FORMAT='PROCESS_OS_MASTER_PAGE_EXCEL', VERSION=2;
  const clean=value=>String(value??'').trim();
  const extras=(value,known)=>Object.fromEntries(Object.entries(value||{}).filter(([key])=>!known.includes(key)));
  const json=value=>{try{return value?JSON.parse(String(value)):{};}catch{return {};}};
  function categoryRows(catalog){
    const groups=Array.isArray(catalog.categoryGroups)&&catalog.categoryGroups.length?catalog.categoryGroups:[...new Map((catalog.products||[]).map(product=>[`${product.line}\0${product.category}`,{line:product.line,name:product.category}])).values()];
    return groups.map(group=>({'線別':group.line,'產品類別':group.name,'其他資料JSON':JSON.stringify(extras(group,['line','name']))}));
  }
  function productRows(catalog){return (catalog.products||[]).map(product=>({'產品類別':product.category,'產品編號':product.code,'產品名稱':product.name,'規格':product.specification||'','單位':product.unit||'','線別':product.line,'製程路線':(product.stages||[]).join(' → '),'其他資料JSON':JSON.stringify(extras(product,['category','code','name','specification','unit','line','stages']))}));}
  function workbook(catalog,scope,historyRows=[]){
    const book=XLSX.utils.book_new(),meta=XLSX.utils.aoa_to_sheet([['格式識別',FORMAT],['格式版本',VERSION],['匯出範圍',scope],['產品數',(catalog.products||[]).length],['類別數',categoryRows(catalog).length],['線別數',(catalog.lines||[]).length],['工段數',(catalog.lines||[]).reduce((sum,line)=>sum+(line.stages||[]).length,0)],['匯出時間',new Date().toISOString()],[],['說明','本檔包含目前分頁的產品、類別、線別與工段。再次匯入時會完整取代草稿內相同範圍的頁面資料。']]);
    XLSX.utils.book_append_sheet(book,meta,'格式說明');
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(productRows(catalog)),'產品資料');
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(categoryRows(catalog)),'產品類別');
    const lineSheet=XLSX.utils.json_to_sheet(host.LineStageExcel.rowsFor(catalog.lines||[]));lineSheet['!cols']=[{wch:10},{wch:22},{wch:18},{wch:28},{wch:24},{wch:20},{wch:10},{wch:38},{wch:38}];XLSX.utils.book_append_sheet(book,lineSheet,'線別與工段');
    XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(historyRows),'版本紀錄');return book;
  }
  function metadata(book){const sheet=book.Sheets['格式說明'];if(!sheet)return {complete:false};const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true}),values=Object.fromEntries(rows.filter(row=>row.length>1).map(row=>[clean(row[0]),clean(row[1])]));return {complete:values['格式識別']===FORMAT&&Number(values['格式版本'])>=VERSION,scope:values['匯出範圍']||'',version:Number(values['格式版本'])||0};}
  function parseProducts(sheet){return XLSX.utils.sheet_to_json(sheet,{defval:'',raw:true}).filter(row=>clean(row['產品編號'])).map(row=>({...json(row['其他資料JSON']),category:clean(row['產品類別'])||'待補',code:clean(row['產品編號']),name:clean(row['產品名稱'])||'待補',specification:clean(row['規格']),unit:clean(row['單位'])||'待補',line:clean(row['線別']).toUpperCase()||'待補',stages:clean(row['製程路線']).split(/[/→,，>]+/).map(clean).filter(Boolean).map(value=>value.toUpperCase())}));}
  function parseCategories(sheet){if(!sheet)return [];return XLSX.utils.sheet_to_json(sheet,{defval:'',raw:true}).filter(row=>clean(row['產品類別'])).map(row=>({...json(row['其他資料JSON']),line:clean(row['線別']).toUpperCase()||'待補',name:clean(row['產品類別'])}));}
  function readBuffer(buffer,expectedScope){const book=XLSX.read(buffer,{type:'array'}),info=metadata(book);if(!info.complete)return null;if(expectedScope&&info.scope&&info.scope!==expectedScope)throw new Error('scope');const productSheet=book.Sheets['產品資料'],lineSheet=book.Sheets['線別與工段'];if(!productSheet||!lineSheet)throw new Error('sheets');const products=parseProducts(productSheet),lines=host.LineStageExcel.parseRows(XLSX.utils.sheet_to_json(lineSheet,{header:1,defval:'',raw:true})),categoryGroups=parseCategories(book.Sheets['產品類別']);return {complete:true,scope:info.scope,version:info.version,products,lines,categoryGroups};}
  function exportFile(catalog,scope,historyRows){XLSX.writeFile(workbook(catalog,scope,historyRows),`${scope}_主資料_完整頁面_${new Date().toISOString().slice(0,10)}.xlsx`);}
  host.MasterPageExcel={FORMAT,VERSION,productRows,categoryRows,workbook,metadata,readBuffer,exportFile};
})(typeof window==='undefined'?globalThis:window);

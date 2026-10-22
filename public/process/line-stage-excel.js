(function(host){
  'use strict';
  const FORMAT='PROCESS_OS_LINE_STAGE_EXCEL', VERSION=2;
  const clean=value=>String(value??'').trim();
  const extras=(value,known)=>Object.fromEntries(Object.entries(value||{}).filter(([key])=>!known.includes(key)));
  const json=value=>{try{return value?JSON.parse(String(value)):{};}catch{return {};}};
  function parseRows(rows){
    if(!rows.length)return [];
    const headerIndex=rows.findIndex(row=>row.some(cell=>/線別|CHUYỀN/i.test(clean(cell))));if(headerIndex<0)throw new Error('header');
    const headers=rows[headerIndex].map(clean),find=patterns=>headers.findIndex(v=>patterns.some(p=>p.test(v)));
    const idx={line:find([/^線別$/,/^MÃ CHUYỀN$/i]),lineName:find([/線別名稱/,/TÊN CHUYỀN/i]),stage:find([/工段編號/,/MÃ CÔNG ĐOẠN/i]),stageName:find([/工段名稱/,/TÊN CÔNG ĐOẠN/i]),machine:find([/^設備$/,/^THIẾT BỊ$/i]),asset:find([/固定資產/,/TÀI SẢN/i]),people:find([/^人數$/,/SỐ NGƯỜI/i]),lineJson:find([/線別其他資料JSON/i]),stageJson:find([/工段其他資料JSON/i])};
    if(idx.line<0||idx.lineName<0||idx.stage<0||idx.stageName<0)throw new Error('columns');
    const map=new Map(),stageOwner=new Map();
    rows.slice(headerIndex+1).forEach(row=>{
      const code=clean(row[idx.line]).toUpperCase(),name=clean(row[idx.lineName]);if(!code&&!name)return;if(!code||!name)throw new Error('line');
      if(!map.has(code))map.set(code,{...json(idx.lineJson>=0?row[idx.lineJson]:''),code,name,stages:[]});else if(map.get(code).name!==name)throw new Error('line-name');
      const stageCode=clean(row[idx.stage]).toUpperCase(),stageName=clean(row[idx.stageName]);if(!stageCode&&!stageName)return;if(!stageCode||!stageName)throw new Error('stage');if(stageOwner.has(stageCode))throw new Error('stage-duplicate');stageOwner.set(stageCode,code);
      map.get(code).stages.push({...json(idx.stageJson>=0?row[idx.stageJson]:''),code:stageCode,name:stageName,machine:clean(row[idx.machine])||'待補',assetNumber:clean(row[idx.asset])||'待補',operators:Number(row[idx.people])||null});
    });
    return [...map.values()];
  }
  function rowsFor(lines){return lines.flatMap(line=>{
    const lineJson=JSON.stringify(extras(line,['code','name','stages']));
    const row=stage=>({'線別':line.code,'線別名稱':line.name,'工段編號':stage?.code||'','工段名稱':stage?.name||'','設備':stage?.machine||'','固定資產編號':stage?.assetNumber||'','人數':stage?.operators??'','線別其他資料JSON':lineJson,'工段其他資料JSON':stage?JSON.stringify(extras(stage,['code','name','machine','assetNumber','operators'])):''});
    return line.stages.length?line.stages.map(row):[row(null)];
  });}
  function workbook(lines,scope){
    const book=XLSX.utils.book_new(),meta=XLSX.utils.aoa_to_sheet([['格式識別',FORMAT],['格式版本',VERSION],['匯出範圍',scope],['線別數',lines.length],['工段數',lines.reduce((sum,line)=>sum+line.stages.length,0)],['匯出時間',new Date().toISOString()],[],['說明','本頁匯出的完整格式再次匯入時，會取代目前所選範圍的線別與工段；舊格式仍採新增或更新。']]),sheet=XLSX.utils.json_to_sheet(rowsFor(lines));
    sheet['!cols']=[{wch:10},{wch:22},{wch:18},{wch:28},{wch:24},{wch:20},{wch:10},{wch:38},{wch:38}];
    XLSX.utils.book_append_sheet(book,meta,'格式說明');XLSX.utils.book_append_sheet(book,sheet,'線別與工段');return book;
  }
  function exportFile(lines,scope){XLSX.writeFile(workbook(lines,scope),`${scope}_線別與工段_完整資料_${new Date().toISOString().slice(0,10)}.xlsx`);}
  function metadata(book){const sheet=book.Sheets['格式說明'];if(!sheet)return {complete:false};const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true}),values=Object.fromEntries(rows.filter(row=>row.length>1).map(row=>[clean(row[0]),clean(row[1])]));return {complete:values['格式識別']===FORMAT&&Number(values['格式版本'])>=VERSION,scope:values['匯出範圍']||'',version:Number(values['格式版本'])||0};}
  async function readFile(file){const book=XLSX.read(await file.arrayBuffer(),{type:'array'}),sheet=book.Sheets[book.SheetNames.includes('線別與工段')?'線別與工段':book.SheetNames[0]],result=parseRows(XLSX.utils.sheet_to_json(sheet,{header:1,defval:''})),info=metadata(book);Object.defineProperties(result,{complete:{value:info.complete,enumerable:false},scope:{value:info.scope,enumerable:false},version:{value:info.version,enumerable:false}});return result;}
  function merge(catalog,incoming){const owners=new Map(catalog.lines.flatMap(line=>line.stages.map(stage=>[stage.code,line.code])));incoming.forEach(next=>next.stages.forEach(stage=>{const owner=owners.get(stage.code);if(owner&&owner!==next.code)throw new Error('stage-owner');}));incoming.forEach(next=>{let line=catalog.lines.find(item=>item.code===next.code);if(!line){line={code:next.code,name:next.name,stages:[]};catalog.lines.push(line);}Object.assign(line,next,{stages:line.stages});next.stages.forEach(stage=>{const old=line.stages.find(item=>item.code===stage.code);if(old)Object.assign(old,stage);else line.stages.push(stage);});});}
  function replace(catalog,incoming){catalog.lines=JSON.parse(JSON.stringify(incoming));}
  host.LineStageExcel={FORMAT,VERSION,parseRows,rowsFor,workbook,metadata,exportFile,readFile,merge,replace};
})(typeof window==='undefined'?globalThis:window);

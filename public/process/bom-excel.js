(function(host){
  'use strict';
  const key='bomOverrides', limit=200000, format='PROCESS_OS_BOM_EXCEL', formatVersion=2;
  const columns=['主件SKU','層級','料號','品名','規格','單位','定額／用量','損耗','來源頁','來源類型','其他資料JSON'];
  const aliases=[['主件SKU','根SKU','ROOT SKU','PARENT SKU','SKU GỐC'],['層級','LEVEL','CẤP'],['料號','ITEM CODE','MÃ LINH KIỆN'],['品名','ITEM NAME','TÊN LINH KIỆN'],['規格','SPECIFICATION','QUY CÁCH'],['單位','UNIT','ĐƠN VỊ'],['定額／用量','定額','用量','QUANTITY','SỐ LƯỢNG'],['損耗','WASTE','HAO HỤT'],['來源頁','SOURCE PAGE','TRANG NGUỒN']];
  aliases.push(['來源類型','SOURCE TYPE','LOẠI NGUỒN']);
  aliases.push(['其他資料JSON','OTHER DATA JSON']);
  const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
  const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  function refreshBomCounts(){
    if(!data.meta)return;
    const rows=Object.values(data.bom||{});
    data.meta.bomProductCount=rows.filter(items=>items.length>0).length;
    data.meta.bomRowCount=rows.reduce((total,items)=>total+items.length,0);
  }
  function parseRows(matrix){
    if(matrix.length>limit+1)throw new Error(t(`最多可匯入 ${limit} 列。`,`Tối đa ${limit} dòng.`));
    const header=matrix[0]?.map(x=>String(x).trim().toUpperCase())||[];
    const indexes=aliases.map(names=>header.findIndex(value=>names.some(n=>value===n.toUpperCase())));
    if(indexes.slice(0,4).some(i=>i<0))throw new Error(t('缺少主件SKU、層級、料號或品名欄，請使用匯出格式或範本。','Thiếu SKU gốc, cấp, mã hoặc tên linh kiện. Hãy dùng mẫu xuất.'));
    const result=Object.create(null), errors=[];
    matrix.slice(1).forEach((source,index)=>{
      if(!source.some(x=>String(x??'').trim()))return;
      const cells=indexes.map(i=>i>=0?String(source[i]??'').trim():''),[code,levelText,itemCode,itemName,specification,unit,quantity,waste,sourcePage,sourceType,otherJson]=cells;
      const level=Number(levelText.replace(/^L/i,''));
      const fail=message=>errors.push(`${t('第','Dòng')} ${index+2}: ${message}`);
      if(!code||['__proto__','constructor','prototype'].includes(code))return fail(t('主件 SKU 無效。','SKU gốc không hợp lệ.'));
      if(!levelText||!Number.isInteger(level)||level<0||level>20)return fail(t('層級需為 0–20 的整數。','Cấp phải là số nguyên từ 0–20.'));
      if(level>0&&!itemCode)return fail(t('缺少料號。','Thiếu mã linh kiện.'));
      if(!result[code])result[code]=[];
      const rows=result[code],previous=rows[rows.length-1];
      if(!previous&&level!==0)return fail(t(`${code} 第一列必須是 L0 主件。`,`${code}: dòng đầu phải là SKU gốc L0.`));
      if(previous&&level===0)return fail(t(`${code} 有重複 L0 主件。`,`${code}: trùng SKU gốc L0.`));
      if(previous&&level>previous.level+1)return fail(t(`${code} 層級跳號，請補齊父層。`,`${code}: nhảy cấp, thiếu cấp cha.`));
      if(level===0&&itemCode&&itemCode!==code)return fail(t('L0 料號應為空白或等於主件 SKU。','Mã L0 phải trống hoặc bằng SKU gốc.'));
      let other={};try{other=otherJson?JSON.parse(otherJson):{};}catch{return fail(t('其他資料JSON 格式錯誤。','JSON dữ liệu khác không hợp lệ.'));}
      rows.push({...other,level,levelLabel:`L${level}`,itemCode:level===0?'':itemCode,itemName:itemName||'待補',specification,unit,quantity,waste,sourcePage,source:sourceType});
    });
    if(errors.length)throw new Error(errors.slice(0,12).join('\n')+(errors.length>12?`\n+ ${errors.length-12}`:''));
    if(!Object.keys(result).length)throw new Error(t('檔案沒有可用 BOM 資料。','Tệp không có dữ liệu BOM.'));
    return result;
  }
  function exportRows(bom){const known=new Set(['level','levelLabel','itemCode','itemName','specification','unit','quantity','waste','sourcePage','source']);return [columns,...Object.entries(bom).flatMap(([code,rows])=>rows.map(r=>[code,r.level,r.itemCode||'',r.itemName||'',r.specification||'',r.unit||'',r.quantity??'',r.waste??'',r.sourcePage??'',r.source||'',JSON.stringify(Object.fromEntries(Object.entries(r).filter(([key])=>!known.has(key))))]))];}
  function workbook(bom){const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(exportRows(bom));sheet['!cols']=[{wch:20},{wch:8},{wch:20},{wch:45},{wch:22},{wch:12},{wch:18},{wch:12},{wch:12},{wch:14}];XLSX.utils.book_append_sheet(book,sheet,'BOM');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([
    ['格式識別',format],
    ['格式版本',formatVersion],
    ['匯出範圍','本頁全部 BOM'],
    ['主件數',Object.keys(bom).length],
    ['資料列數',Object.values(bom).reduce((total,rows)=>total+rows.length,0)],
    ['匯出時間',new Date().toISOString()],
    [],
    ['Excel BOM / Hướng dẫn'],
    ['每個主件 SKU 由 L0 開始；子項依出現順序填寫 L1、L2…。 / Mỗi SKU gốc bắt đầu L0; các cấp con theo thứ tự L1, L2…'],
    ['由本頁匯出的檔案再次匯入時，會完整取代本頁 BOM；舊格式檔案仍只更新其中的主件。 / Tệp xuất từ trang này sẽ thay toàn bộ BOM khi nhập lại; tệp cũ chỉ cập nhật SKU có trong tệp.'],
    ['數量、單位照原資料保留，不會自動換算。 / Giữ nguyên số lượng và đơn vị, không tự quy đổi.'],
    ['主件SKU = SKU GỐC; 層級 = CẤP; 料號 = MÃ LINH KIỆN; 品名 = TÊN LINH KIỆN'],
    ['規格 = QUY CÁCH; 單位 = ĐƠN VỊ; 定額／用量 = SỐ LƯỢNG; 損耗 = HAO HỤT; 來源頁 = TRANG NGUỒN'],
    ['其他資料JSON 用來保留未來新增欄位，請勿刪除。 / OTHER DATA JSON preserves future fields.']
  ]),'說明');return book;}
  function workbookInfo(book){
    const sheet=book.Sheets['說明'];
    if(!sheet)return {complete:false};
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});
    const values=Object.fromEntries(rows.filter(row=>row.length>1).map(row=>[String(row[0]).trim(),String(row[1]).trim()]));
    return {complete:values['格式識別']===format&&Number(values['格式版本'])>=formatVersion,version:Number(values['格式版本'])||0};
  }
  const permitted=key=>typeof currentUser==='undefined'||window.hasPermission?.(key);
  function toolbar(){const canImport=permitted('master.import'),canExport=permitted('master.export');return `<section class="bom-excel-toolbar"><b>${t('本頁完整 Excel 資料','Dữ liệu Excel đầy đủ của trang')}</b><div><input hidden type="file" id="bom-excel-file" accept=".xlsx,.xls,.csv">${canImport?`<button class="bom-quiet" id="bom-excel-import">${t('匯入 Excel','Nhập Excel')}</button>`:''}${canExport?`<button class="bom-quiet" id="bom-excel-all">${t('匯出全部 Excel','Xuất toàn bộ Excel')}</button>`:''}</div><p>${canImport||canExport?t('匯出包含本頁全部 BOM；匯回同格式檔案可完整還原本頁資料。','Tệp xuất chứa toàn bộ BOM của trang; nhập lại cùng định dạng để khôi phục đầy đủ.'):t('只有主管可以匯入或匯出資料。','Chỉ quản lý được nhập hoặc xuất dữ liệu.')}</p></section>`;}
  function bind({repaint}){
    const on=(id,event,fn)=>{const element=document.querySelector(id);if(element)element['on'+event]=fn;};
    const write=(bom,name)=>{try{XLSX.writeFile(workbook(bom),`${name}_${new Date().toISOString().slice(0,10)}.xlsx`);toast(t('已產生 Excel，請查看下載。','Đã tạo Excel, hãy xem tệp tải xuống.'));}catch{toast(t('Excel 匯出失敗，請重試。','Xuất Excel thất bại, hãy thử lại.'));}};
    on('#bom-excel-all','click',()=>{if(permitted('master.export'))write(data.bom,'BOM_ALL');});
    on('#bom-excel-import','click',()=>{if(permitted('master.import'))document.querySelector('#bom-excel-file').click();});
    on('#bom-excel-file','change',async event=>{
      const file=event.target.files?.[0];event.target.value='';if(!file||!permitted('master.import'))return;
      const dialog=document.createElement('dialog');dialog.className='master-edit-dialog bom-import-dialog';dialog.dataset.i18nSkip='true';dialog.setAttribute('aria-label',t('匯入 BOM 預覽','Xem trước nhập BOM'));
      document.body.appendChild(dialog);dialog.addEventListener('close',()=>dialog.remove());
      dialog.innerHTML=`<div class="master-dialog-body">${t('正在讀取 Excel…','Đang đọc Excel…')}</div>`;dialog.showModal();
      try{
        if(file.size>25*1024*1024)throw new Error(t('檔案不可超過 25 MB。','Tệp không được vượt quá 25 MB.'));
        const book=XLSX.read(await file.arrayBuffer(),{type:'array'}),sheet=book.Sheets.BOM||book.Sheets[book.SheetNames[0]];
        const info=workbookInfo(book),imported=parseRows(XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true})),codes=Object.keys(imported);
        Object.values(imported).forEach(rows=>rows.forEach(row=>{row.sourceFile=file.name;}));
        if(!dialog.isConnected)return;
        dialog.innerHTML=`<header><h2>${t('確認 BOM 匯入','Xác nhận nhập BOM')}</h2></header><div class="master-dialog-body"><p>${h(file.name)} · ${codes.length} SKU · ${Object.values(imported).reduce((n,r)=>n+r.length,0)} ${t('列','dòng')}</p><p>${info.complete?t('這是本頁完整匯出檔，確認後會完整取代目前 BOM。','Đây là tệp xuất đầy đủ; xác nhận sẽ thay toàn bộ BOM hiện tại.'):t('這是舊格式或外部檔案，只更新檔案內的主件，其他 BOM 保留。','Đây là tệp cũ hoặc bên ngoài; chỉ cập nhật SKU trong tệp và giữ BOM khác.')}</p><div class="bom-import-preview">${codes.slice(0,200).map(c=>`<p><code>${h(c)}</code> · ${imported[c].length-1} ${t('下層組成','thành phần con')} · ${data.bom[c]?t('更新','Cập nhật'):t('新增','Thêm mới')}</p>`).join('')}${codes.length>200?`<p>+ ${codes.length-200}</p>`:''}</div><p class="master-dialog-error" role="alert"></p></div><footer><button class="bom-quiet" data-import-cancel>${t('取消 / Esc','Hủy / Esc')}</button><button class="button signal" data-import-confirm>${t('確認匯入','Xác nhận nhập')}</button></footer>`;
        dialog.querySelector('[data-import-cancel]').onclick=()=>dialog.close();
        dialog.querySelector('[data-import-confirm]').onclick=()=>{
          try{
            const existing=readStore(key,{}),saved=info.complete?{__format:'PROCESS_OS_BOM_OVERRIDES_V2',replaceAll:true,data:imported}:{...(existing?.data||existing),...imported};localStorage.setItem(key,JSON.stringify(saved));
            if(info.complete)Object.keys(data.bom).forEach(code=>delete data.bom[code]);
            Object.assign(data.bom,imported);refreshBomCounts();
            dialog.close();repaint();toast(t(`已匯入 ${codes.length} 個主件 BOM。`,`Đã nhập BOM cho ${codes.length} SKU gốc.`));
          }catch{dialog.querySelector('.master-dialog-error').textContent=t('儲存失敗，未套用本次匯入。請減少檔案大小後重試。','Không lưu được; chưa áp dụng dữ liệu nhập. Hãy giảm kích thước tệp.');}
        };
      }catch(error){if(!dialog.isConnected)return;dialog.innerHTML=`<header><h2>${t('無法匯入 BOM','Không thể nhập BOM')}</h2></header><div class="master-dialog-body"><p>${t('本次未變更任何 BOM。','Không thay đổi BOM nào.')}</p><pre class="master-dialog-error">${h(error.message)}</pre></div><footer><button class="bom-quiet" data-import-close>${t('關閉','Đóng')}</button></footer>`;dialog.querySelector('[data-import-close]').onclick=()=>dialog.close();}
    });
  }
  function refreshProjection(){
    if(typeof data==='undefined'||typeof readStore!=='function')return;
    const saved=readStore(key,{});
    if(saved?.replaceAll&&saved?.data){Object.keys(data.bom).forEach(code=>delete data.bom[code]);Object.assign(data.bom,saved.data);}
    else Object.assign(data.bom,saved||{});
    refreshBomCounts();
  }
  host.BOMExcel={parseRows,exportRows,workbook,workbookInfo,toolbar,bind,refreshProjection};
  refreshProjection();
})(typeof window==='undefined'?globalThis:window);

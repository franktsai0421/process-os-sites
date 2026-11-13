(function(host){
 'use strict';
 const copy=value=>JSON.parse(JSON.stringify(value)),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh,instances=new Map();let activePage;
 function node(tag,text,parent){const result=document.createElement(tag);if(text!==undefined)result.textContent=text;if(parent)parent.append(result);return result;}
 function editor(page){
  const actor=host.ProcessSync?.identity,epoch=host.ProcessSync?.identityGeneration?.(),delivery=host.ProcessSync?.captureDelivery?.();
  if(!actor?.id)throw Error('LOGIN_REQUIRED');
  const owner=()=>actor===host.ProcessSync?.identity&&epoch===host.ProcessSync?.identityGeneration?.()&&(!delivery||host.ProcessSync?.isCurrentDelivery?.(delivery)!==false);
  const client=host.createSharedDraftClient({endpoint:'/api/master/pages?scope='+page+'&caseMetadata=1',actorId:actor.id,durableBegin:true,allowUnknownDeparture:true,guardAccessResults:true,legacyArchive:true,headers:()=>host.ProcessSync?.platformHeaders?.()||{'Content-Type':'application/json'}});
  let container,control,permissions={},base,mine,generation,busy=false,error='',part='AB',filter='',readSequence=0,choiceDialog,pendingImportFile,importApplied=false,lineFilter='',categoryFilter='';
  const history=host.ProcessMasterPageHistory?.create({page,client,owner,control:()=>control,busy:()=>busy,dirty:()=>dirty(),dialog:()=>choiceDialog,permissions:value=>{permissions={...permissions,...value};},render:()=>render()});
  const displayCurrent=()=>history?.mutable()!==false;
  const flow=()=>control?.workflow,dirty=()=>mine!==undefined&&(!same(mine,base)||!!pendingImportFile);
  const current=()=>flow()?.working||control?.versions.find(version=>version.id===control.activeVersionId)?.snapshot;
  const assertOwner=()=>{if(!owner())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');};
  function adopt(result,reset=false){assertOwner();history?.assertMutable();if(!result.control||result.control.page!==page)throw Error('MASTER_PAGE_OWNER_MISMATCH');history?.retire();control=result.control;permissions=result.permissions||permissions;
   if(reset||mine===undefined){base=copy(current());mine=copy(base);generation=flow()?.generation;pendingImportFile=undefined;importApplied=false;}}
  async function read(reset=false){history?.assertMutable();const ticket=history?.stamp(),sequence=++readSequence,result=await client.read(undefined,{isCurrent:()=>history?history.current(ticket):owner()});assertOwner();if(history&&!history.current(ticket)||sequence!==readSequence)throw Error('MASTER_CATALOG_READ_SUPERSEDED');adopt(result,reset);return result;}
  function canEdit(){return displayCurrent()&&!!flow()&&!flow().pendingId&&permissions.edit===true&&!busy&&!client.hasUnknown();}
  function button(parent,label,action,enabled=true){const result=node('button',label,parent);result.type='button';result.className='button ghost';result.disabled=!enabled;result.onclick=()=>void act(action);return result;}
  async function act(action){if(busy)return;busy=true;error='';render();try{assertOwner();history?.assertMutable();await action();}catch(failure){if(owner())error=host.sharedDraftErrorMessage?.(failure)||failure.message;}finally{busy=false;if(owner())render();}}
  function change(row,key,input){input.disabled=!canEdit();input.value=Array.isArray(row[key])?row[key].join(', '):row[key]??'';input.oninput=()=>{if(!canEdit()||!owner())return;row[key]=Array.isArray(row[key])?input.value.split(',').map(value=>value.trim()).filter(Boolean):input.value;showDirty();};}
  function field(parent,label,row,key,type='text'){const cell=node('td',undefined,parent),input=node('input',undefined,cell);input.type=type;input.setAttribute('aria-label',label);change(row,key,input);return input;}
  function showDirty(){const status=container?.querySelector('[data-page-dirty]');if(status)status.textContent=dirty()?t('本機尚未存取','Thay đổi chưa lưu'):t('沒有本機修改','Không có thay đổi cục bộ');}
  function table(parent,labels){const wrap=node('div',undefined,parent);wrap.className='table-wrap';wrap.style.overflowX='auto';const result=node('table',undefined,wrap),head=node('tr',undefined,node('thead',undefined,result));for(const label of labels)node('th',label,head);return node('tbody',undefined,result);}
  function confirmRemoval(message){if(permissions.delete!==true)throw Error('FORBIDDEN');return (host.confirmMasterDeletion||host.confirm)(message);}
  function reorder(parent,rows,row,label){const index=rows.indexOf(row);for(const [offset,caption]of [[-1,t('向前移','Chuyển lên')],[1,t('向後移','Chuyển xuống')]])button(parent,caption+' · '+label,()=>{[rows[index],rows[index+offset]]=[rows[index+offset],rows[index]];},canEdit()&&index+offset>=0&&index+offset<rows.length);}
  function routePicker(parent,route,definitions,apply,label){const wrap=node('div',undefined,parent),list=node('ol',undefined,wrap);wrap.setAttribute('aria-label',label);
   for(let index=0;index<route.length;index++){const item=node('li',route[index]+' · '+(definitions.find(row=>row.code===route[index])?.name||''),list);for(const [delta,caption]of [[-1,'↑'],[1,'↓']])button(item,caption,()=>{const next=[...route];[next[index],next[index+delta]]=[next[index+delta],next[index]];apply(next);},canEdit()&&index+delta>=0&&index+delta<route.length);button(item,t('移除工段','Bỏ công đoạn'),()=>{const next=route.filter((_,i)=>i!==index);if(confirmRemoval(t('刪除路線中的工段？既有流程與歷史保留，核准後才更新適用路線。','Bỏ công đoạn khỏi tuyến? Giữ quy trình và lịch sử; chỉ có hiệu lực sau duyệt.')))apply(next);},canEdit()&&permissions.delete===true);}
   const select=node('select',undefined,wrap);select.setAttribute('aria-label',label+' · '+t('可選工段','Công đoạn có sẵn'));const available=definitions.filter(row=>!route.includes(row.code));for(const stage of available){const option=node('option',stage.code+' · '+stage.name,select);option.value=stage.code;}select.disabled=!canEdit();button(wrap,t('加入工段','Thêm công đoạn'),()=>{if(available.some(row=>row.code===select.value))apply([...route,select.value]);},canEdit()&&!!available.length);
  }
  function groupRoute(group,stages,preserve=false){const before=copy(mine),catalog={...copy(mine),lines:control.references.lines};host.MasterAdminUI.setGroupRoute(catalog,group.line,group.name,stages,preserve);for(const row of catalog.categoryGroups)if(!row.id)row.id=crypto.randomUUID();const order=new Map(mine.categoryGroups.map((row,index)=>[row.id,index]));catalog.categoryGroups.sort((a,b)=>(order.get(a.id)??order.size)-(order.get(b.id)??order.size));const next={products:catalog.products,categoryGroups:catalog.categoryGroups};if(host.MasterPageTransfer.requirements(before,next,page).delete&&!confirmRemoval(t('刪除或移除群組預設路線的工段？產品例外及既有流程、歷史保留。','Bỏ công đoạn hoặc tuyến mặc định? Giữ tuyến ngoại lệ, quy trình và lịch sử.')))return;mine=next;}
  function transferToolbar(parent){
   const bar=node('div',undefined,parent);bar.className='actions';const file=node('input',undefined,bar);file.type='file';file.accept='.xlsx,.xls';file.setAttribute('aria-label',t('匯入 Excel','Nhập Excel'));file.disabled=!canEdit()||permissions.import!==true;
   file.onchange=()=>{if(!canEdit()||permissions.import!==true||!file.files?.[0])return;pendingImportFile=file.files[0];importApplied=false;void act(()=>importFile(pendingImportFile));};
   if(pendingImportFile){node('span',pendingImportFile.name,bar);if(!importApplied)button(bar,t('重新套用匯入檔','Áp dụng lại tệp nhập'),()=>importFile(pendingImportFile),canEdit()&&permissions.import===true);}
   button(bar,t('匯出本頁 Excel','Xuất Excel trang này'),exportFile,!busy&&permissions.export===true&&!!mine&&!client.hasUnknown());
  }
  async function transferAccess(kind,token){const result=await client.permissions({isCurrent:token,requireAcceptedAccess:true});assertOwner();if(!token())throw Error('IMPORT_CONTEXT_CHANGED');permissions=result.permissions||{};if(permissions.view!==true||permissions[kind]!==true)throw Error('FORBIDDEN');}
  async function importFile(file){
   const original=JSON.stringify(mine),initialGeneration=generation,target=container,partition=part,historyTicket=history?.stamp(),token=()=>displayCurrent()&&(!history||history.current(historyTicket))&&owner()&&container===target&&target?.isConnected&&target.dataset.activeTab===(page==='LINES'?'line-admin':page)&&generation===initialGeneration&&part===partition&&JSON.stringify(mine)===original;
   await transferAccess('import',token);if(!permissions.edit||!flow()||flow().pendingId||client.hasUnknown())throw Error('FORBIDDEN');
   const buffer=await file.arrayBuffer();if(!token())throw Error('IMPORT_CONTEXT_CHANGED');const fresh=await client.read(undefined,{isCurrent:token,requireAcceptedAccess:true});assertOwner();if(!token()||fresh.control?.workflow?.generation!==initialGeneration)throw Error('IMPORT_CONTEXT_CHANGED');permissions=fresh.permissions||{};if(!fresh.permissions?.edit||!fresh.permissions?.import||fresh.control.workflow.pendingId)throw Error('FORBIDDEN');
   const parsed=host.MasterPageTransfer.parse(buffer,page,partition),references=fresh.control.references.lines||[],next=host.MasterPageTransfer.stage(mine,parsed,page,references),needs=host.MasterPageTransfer.requirements(mine,next,page);if(needs.create&&fresh.permissions.create!==true||needs.delete&&fresh.permissions.delete!==true)throw Error('FORBIDDEN');
   if(!host.confirm(parsed.complete?t('以檔案取代本頁相同範圍的本機資料？其他頁草稿不變；線別參考不會匯入。按存取草稿才共用保存。','Thay dữ liệu cục bộ cùng phạm vi bằng tệp? Không đổi bản nháp trang khác hoặc chuyền tham khảo. Chỉ chia sẻ khi Lưu bản nháp.'):t('舊格式只新增或更新檔案內資料，其餘保留。先留本機，按存取草稿才共用保存。','Tệp cũ chỉ thêm/cập nhật dữ liệu có trong tệp. Giữ dữ liệu khác; chỉ chia sẻ khi Lưu bản nháp.')))return;
   await transferAccess('import',token);if(!permissions.edit||needs.create&&permissions.create!==true||needs.delete&&permissions.delete!==true)throw Error('FORBIDDEN');if(needs.delete&&!confirmRemoval(t('刪除檔案未保留的本頁項目或路線工段？核准後才套用，既有歷史保留。','Xóa mục hoặc công đoạn không giữ trong tệp? Chỉ áp dụng sau duyệt; giữ lịch sử.')))return;
   if(!token())throw Error('IMPORT_CONTEXT_CHANGED');mine=next;importApplied=true;
  }
  async function exportFile(){const original=JSON.stringify(mine),target=container,historyTicket=history?.stamp(),token=()=>displayCurrent()&&(!history||history.current(historyTicket))&&owner()&&container===target&&target?.isConnected&&target.dataset.activeTab===(page==='LINES'?'line-admin':page)&&JSON.stringify(mine)===original;await transferAccess('export',token);const snapshot=copy(mine),book=host.MasterPageTransfer.workbook(snapshot,page,control.references.lines||[]);if(!token())throw Error('IMPORT_CONTEXT_CHANGED');host.XLSX.writeFile(book,(page==='LINES'?'LINES':page+'_catalog')+'_'+new Date().toISOString().slice(0,10)+'.xlsx');}
  function lines(parent){const tabs=node('div',undefined,parent);for(const scope of ['AB','C'])button(tabs,scope,()=>{part=scope;},!busy);
   const rows=mine[part].lines,body=table(parent,[t('線別代碼','Mã chuyền'),t('名稱','Tên'),t('操作','Thao tác')]);
   for(const line of rows){const row=node('tr',undefined,body);field(row,t('線別代碼','Mã chuyền'),line,'code');field(row,t('線別名稱','Tên chuyền'),line,'name');const actions=node('td',undefined,row);
    reorder(actions,rows,line,line.code);button(actions,t('刪除線別','Xóa chuyền'),()=>{if(confirmRemoval(t('刪除空線別？核准後才套用。','Xóa chuyền trống? Chỉ áp dụng sau duyệt.')))rows.splice(rows.indexOf(line),1);},canEdit()&&permissions.delete===true&&!line.stages.length&&!base[part].lines.find(row=>row.id===line.id)?.stages.length);
    const stageRow=node('tr',undefined,body),cell=node('td',undefined,stageRow);cell.colSpan=3;
    const stages=table(cell,[t('工段代碼','Mã công đoạn'),t('工段名稱','Tên công đoạn'),t('機器','Máy'),t('資產編號','Mã tài sản'),t('人數','Số người'),t('操作','Thao tác')]);
    for(const stage of line.stages){const r=node('tr',undefined,stages);field(r,t('工段代碼','Mã công đoạn'),stage,'code');field(r,t('工段名稱','Tên công đoạn'),stage,'name');field(r,t('機器','Máy'),stage,'machine');field(r,t('資產編號','Mã tài sản'),stage,'assetNumber');const people=field(r,t('人數','Số người'),stage,'operators','number');people.oninput=()=>{if(canEdit()&&owner()){stage.operators=Number(people.value);showDirty();}};
     const actions=node('td',undefined,r);reorder(actions,line.stages,stage,stage.code);button(actions,t('刪除工段','Xóa công đoạn'),()=>{if(confirmRemoval(t('刪除工段？存取時會重新檢查引用，核准後才套用。','Xóa công đoạn? Kiểm tra lại tham chiếu khi lưu; chỉ áp dụng sau duyệt.')))line.stages.splice(line.stages.indexOf(stage),1);},canEdit()&&permissions.delete===true);}
    button(cell,t('新增工段','Thêm công đoạn'),()=>{line.stages.push({id:crypto.randomUUID(),code:'',name:'',machine:'',assetNumber:'',operators:1});},canEdit()&&permissions.create===true);
   }
   button(parent,t('新增線別','Thêm chuyền'),()=>{rows.push({id:crypto.randomUUID(),code:'',name:'',stages:[]});},canEdit()&&permissions.create===true);
  }
  function catalogs(parent){
   const label=node('label',t('搜尋產品 ','Tìm sản phẩm '),parent),search=node('input',undefined,label);search.type='search';search.value=filter;search.onchange=()=>{filter=search.value;render();};
   const refs=control.references.lines;
   const filters=node('div',undefined,parent);for(const [label,values,current,set]of [[t('篩選線別','Lọc chuyền'),refs.map(row=>row.code),lineFilter,value=>{lineFilter=value;}],[t('篩選類別','Lọc nhóm'),[...new Set(mine.products.map(row=>row.category).concat(mine.categoryGroups.map(row=>row.name)))],categoryFilter,value=>{categoryFilter=value;}]]){const select=node('select',undefined,filters);select.setAttribute('aria-label',label);for(const value of ['',...values]){const option=node('option',value||t('全部','Tất cả'),select);option.value=value;}select.value=current;select.onchange=()=>{set(select.value);render();};}

   node('p',t('產品路線僅可使用已核准的線別與工段。','Lộ trình sản phẩm chỉ dùng chuyền và công đoạn đã duyệt.'),parent);
   const body=table(parent,[t('產品代碼','Mã sản phẩm'),t('名稱','Tên'),t('規格','Quy cách'),t('單位','Đơn vị'),t('越文名稱','Tên tiếng Việt'),t('類別','Nhóm'),t('線別','Chuyền'),t('路線模式','Chế độ lộ trình'),t('工段（逗號分隔）','Công đoạn (phân cách bằng dấu phẩy)'),t('操作','Thao tác')]);
   for(const product of mine.products.filter(row=>(!lineFilter||row.line===lineFilter)&&(!categoryFilter||row.category===categoryFilter)&&(!filter||[row.code,row.name,row.category].some(value=>String(value||'').toLowerCase().includes(filter.toLowerCase()))))){
    const row=node('tr',undefined,body);field(row,t('產品代碼','Mã sản phẩm'),product,'code');field(row,t('產品名稱','Tên sản phẩm'),product,'name');field(row,t('規格','Quy cách'),product,'specification');field(row,t('單位','Đơn vị'),product,'unit');field(row,t('越文名稱','Tên tiếng Việt'),product,'nameVi');const category=field(row,t('產品類別','Nhóm sản phẩm'),product,'category');category.oninput=()=>{if(canEdit()&&owner()){product.category=category.value;product.routeMode='exception';showDirty();}};
    const line=node('select',undefined,node('td',undefined,row));line.setAttribute('aria-label',t('線別','Chuyền'));line.disabled=!canEdit();for(const ref of refs){const option=node('option',ref.code,line);option.value=ref.code;}line.value=product.line;line.onchange=()=>{if(canEdit()&&owner()){product.line=line.value;product.stages=[];product.routeMode='exception';render();}};
    const mode=node('select',undefined,node('td',undefined,row));mode.setAttribute('aria-label',t('路線模式','Chế độ lộ trình'));mode.disabled=!canEdit();
    const group=mine.categoryGroups.find(group=>group.line===product.line&&group.name===product.category);
    const own=node('option',t('獨立路線','Lộ trình riêng'),mode);own.value='exception';if(Array.isArray(group?.defaultStages)){const inherited=node('option',t('依類別預設','Theo nhóm mặc định'),mode);inherited.value='group';}mode.value=product.routeMode||'exception';
    mode.onchange=()=>{if(!canEdit()||!owner())return;product.routeMode=mode.value;if(mode.value==='group')product.stages=copy(group.defaultStages);render();};
    const stages=field(row,t('工段代碼','Mã công đoạn'),product,'stages');stages.disabled=!canEdit()||product.routeMode==='group';stages.oninput=()=>{if(canEdit()&&owner()){product.stages=stages.value.split(',').map(value=>value.trim()).filter(Boolean);product.routeMode='exception';showDirty();}};const actions=node('td',undefined,row);button(actions,t('刪除產品','Xóa sản phẩm'),()=>{if(confirmRemoval(t('刪除產品？核准後才套用，既有流程及歷史保留。','Xóa sản phẩm? Chỉ áp dụng sau duyệt; giữ quy trình và lịch sử.')))mine.products.splice(mine.products.indexOf(product),1);},canEdit()&&permissions.delete===true);reorder(actions,mine.products,product,product.code);
    const routeRow=node('tr',undefined,body),cell=node('td',undefined,routeRow);cell.colSpan=10;routePicker(cell,product.stages,refs.find(row=>row.code===product.line)?.stages||[],route=>{product.stages=route;product.routeMode='exception';},t('產品路線','Tuyến sản phẩm')+' · '+product.code);

   }
   button(parent,t('新增產品','Thêm sản phẩm'),()=>{mine.products.push({id:crypto.randomUUID(),code:'',name:'',category:'',line:refs[0]?.code||'',stages:[],routeMode:'exception'});},canEdit()&&permissions.create===true);
   node('h3',t('類別與預設路線','Nhóm và lộ trình mặc định'),parent);
   const groups=table(parent,[t('類別','Nhóm'),t('線別','Chuyền'),t('預設工段（逗號分隔）','Công đoạn mặc định'),t('操作','Thao tác')]);
   for(const group of mine.categoryGroups){const row=node('tr',undefined,groups);let previous=group.name;const name=field(row,t('類別名稱','Tên nhóm'),group,'name');name.oninput=()=>{if(!canEdit()||!owner())return;const next=name.value;for(const product of mine.products)if(product.line===group.line&&product.category===previous)product.category=next;group.name=next;if(categoryFilter===previous)categoryFilter=next;previous=next;showDirty();};
    const line=node('select',undefined,node('td',undefined,row));line.setAttribute('aria-label',t('類別線別','Chuyền nhóm'));for(const ref of refs){const option=node('option',ref.code,line);option.value=ref.code;}line.value=group.line;line.disabled=!canEdit();line.onchange=()=>{if(!canEdit()||!owner())return;if(mine.products.some(product=>product.line===group.line&&product.category===group.name)){error=t('此類別已有產品，請先調整產品線別再移動類別。','Nhóm có sản phẩm; đổi chuyền sản phẩm trước khi chuyển nhóm.');render();return;}group.line=line.value;group.defaultStages=null;render();};
    const route=field(row,t('預設工段','Công đoạn mặc định'),group,'defaultStages');route.onchange=()=>{if(!canEdit()||!owner())return;void act(()=>groupRoute(group,route.value.split(',').map(value=>value.trim()).filter(Boolean)));};route.oninput=()=>{};
    const actions=node('td',undefined,row);button(actions,t('刪除類別','Xóa nhóm'),()=>{if(mine.products.some(product=>product.line===group.line&&product.category===group.name)||group.defaultStages?.length)throw Error(t('類別仍有產品或預設路線，請先移轉或移除設定。','Nhóm còn sản phẩm hoặc tuyến; chuyển hoặc gỡ trước.'));if(confirmRemoval(t('刪除空類別？核准後才套用。','Xóa nhóm trống? Chỉ áp dụng sau duyệt.')))mine.categoryGroups.splice(mine.categoryGroups.indexOf(group),1);},canEdit()&&permissions.delete===true);reorder(actions,mine.categoryGroups,group,group.name);
    const info=host.MasterAdminUI?.groupRoute({...mine,lines:refs},group.line,group.name),routeRow=node('tr',undefined,groups),cell=node('td',undefined,routeRow);cell.colSpan=4;
    if(info){node('p',t('跟隨預設／獨立設定：','Theo mặc định / Riêng: ')+info.inherited.length+' / '+info.independent.length,cell);if(info.conflicts.length)node('p',t('產品順序不同，原路線保留：','Thứ tự khác; giữ tuyến gốc: ')+info.conflicts.join(', '),cell);button(cell,t('採用最大路線','Dùng tuyến đầy đủ'),()=>{if(host.confirm(t('採用產品最大路線？保留各產品目前路線，相同者跟隨預設，其餘保留例外。','Dùng tuyến đầy đủ? Giữ tuyến hiện tại; tuyến trùng theo mặc định, còn lại giữ riêng.')))groupRoute(group,info.maximum,true);},canEdit());button(cell,t('移除預設','Bỏ mặc định'),()=>groupRoute(group,null),canEdit()&&permissions.delete===true&&info.configured);routePicker(cell,info.stages,refs.find(row=>row.code===group.line)?.stages||[],route=>groupRoute(group,route),t('群組路線','Tuyến nhóm')+' · '+group.name);}
   }
   button(parent,t('新增類別','Thêm nhóm'),()=>{mine.categoryGroups.push({id:crypto.randomUUID(),line:refs[0]?.code||'',name:'',defaultStages:[]});},canEdit()&&permissions.create===true);
  }
  async function choose(conflicts){
   return new Promise(resolve=>{const dialog=node('dialog');choiceDialog=dialog;dialog.setAttribute('data-master-page',page);dialog.className='vd-dialog';dialog.style.maxHeight='85dvh';dialog.style.overflowY='auto';dialog.style.width='min(92vw, 800px)';node('h3',t('選擇本次全部衝突','Chọn cho tất cả xung đột'),dialog);node('p',t('無衝突修改會保留。取消會保留目前輸入。','Giữ thay đổi không xung đột. Hủy để giữ nội dung đang nhập.'),dialog);
    for(const conflict of conflicts){node('h4',conflict.label,dialog);node('p',t('我的：','Của tôi: ')+JSON.stringify(conflict.mine??t('已刪除','Đã xóa')),dialog);node('p',t('對方：','Của người khác: ')+JSON.stringify(conflict.theirs??t('已刪除','Đã xóa')),dialog);}
    let closed=false;const finish=value=>{if(closed)return;closed=true;choiceDialog=null;dialog.remove();host.removeEventListener('pagehide',cancel);resolve(value);},cancel=()=>finish('cancel');
    for(const [value,label]of [['mine',t('用我的','Dùng của tôi')],['theirs',t('用對方的','Dùng của người khác')],['cancel',t('取消','Hủy')]]){const b=node('button',label,dialog);b.type='button';b.onclick=()=>finish(value);}
    dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});host.addEventListener('pagehide',cancel);document.body.append(dialog);dialog.showModal();});
  }
  async function save(){
   history?.assertMutable();
   if(pendingImportFile&&!importApplied)throw Error(t('請先套用匯入檔，或取消本機修改後再存取。','Áp dụng tệp nhập hoặc hủy thay đổi cục bộ trước khi lưu.'));if(client.hasUnknown())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');
   const input=copy(mine),original=JSON.stringify(mine),oldBase=copy(base),oldGeneration=generation;
   for(let attempt=0;attempt<8;attempt++){
    const fresh=await client.read();assertOwner();if(JSON.stringify(mine)!==original)throw Error('UNAPPLIED_CHANGES_APPLY_REQUIRED');
    const current=fresh.control?.workflow;if(!current||current.generation!==oldGeneration)throw Error('STALE_GENERATION');
    if(!['view','save'].every(key=>fresh.permissions?.[key]===true)||fresh.permissions.edit!==true&&!same(input,oldBase))throw Error('FORBIDDEN');if(current.pendingId)throw Error('PENDING_LOCKED');
    const comparison=host.ProcessPageDraftMerge.compare(oldBase,input,current.working,page),choice=comparison.conflicts.length?await choose(comparison.conflicts):'mine';assertOwner();if(choice==='cancel')return;
    const confirmed=await client.read();assertOwner();if(!same(confirmed.control?.workflow,current))continue;
    if(JSON.stringify(mine)!==original)throw Error('UNAPPLIED_CHANGES_APPLY_REQUIRED');if(!['view','save'].every(key=>confirmed.permissions?.[key]===true)||confirmed.permissions.edit!==true&&!same(input,oldBase))throw Error('FORBIDDEN');
    const batches=comparison.materialize(choice).filter(batch=>batch.patches.length||batch.guards.length);if(batches.length&&confirmed.permissions.edit!==true)throw Error('FORBIDDEN');const command=client.prepare(current.generation,'save',{expectedRevision:current.revision,moduleAction:'save-local-v1',patches:batches.flatMap(batch=>batch.patches),input:{batches}});
    const result=await client.sendPrepared(command);assertOwner();adopt(result,true);return;
   }
   throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
  }
  async function lifecycle(action){
   history?.assertMutable();
   if(dirty())throw Error('UNSAVED_CHANGES_SAVE_REQUIRED');if(client.hasUnknown())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');
   const fresh=await read(),current=fresh.control.workflow,pending=current?.pendingId;
   if(!same(base,current?.working)){adopt(fresh,true);throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');}
   const reason=host.prompt(t('本次操作包含本頁整份已存內容。請輸入原因：','Thao tác áp dụng toàn bộ nội dung đã lưu của trang. Nhập lý do:'));if(reason===null)return;assertOwner();
   if(dirty())throw Error('UNSAVED_CHANGES_SAVE_REQUIRED');
   const check=await client.read();assertOwner();if(!same(check.control?.workflow,current))throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
   const self=action==='approve'&&current.cases.find(review=>review.id===pending)?.actor.id===actor.id;
   if(self&&!host.confirm(t('這是您送審的案件，確認自行審核？','Đây là hồ sơ bạn gửi. Xác nhận tự duyệt?')))return;
   const result=await client.command(current.generation,action,{reason,expectedRevision:current.revision,...(action==='submit'?host.captureSharedDraftSubmission(current):{caseId:pending}),...(self?{selfReviewConfirmed:true}:{})});adopt(result,true);
  }
  function render(){
   if(!container||!container.isConnected||!owner()||container.dataset.activeTab!==(page==='LINES'?'line-admin':page))return;if(history?.historical())return;container.replaceChildren();container.dataset.masterPage=page;
   const panel=node('section',undefined,container);panel.className='panel';node('h2',page==='LINES'?t('線別與工段管理','Chuyền và công đoạn'):page+t(' 產線與類別',' · Sản phẩm và nhóm'),panel);
   const status=node('p','',panel);status.dataset.pageDirty='';showDirty();if(error){const message=node('p',error,panel);message.setAttribute('role','alert');}
   const toolbar=node('div',undefined,panel);toolbar.className='actions';
   button(toolbar,t('開啟草稿','Mở bản nháp'),async()=>{adopt(await client.begin(),true);},!busy&&!dirty()&&!control?.versions.some(version=>['draft','pending','pending-test'].includes(version.status))&&permissions.edit===true&&!client.hasUnknown());
   button(toolbar,t('存取草稿','Lưu bản nháp'),save,!busy&&!!flow()&&!flow().pendingId&&permissions.save===true&&!client.hasUnknown());
   button(toolbar,t('送審','Gửi duyệt'),()=>lifecycle('submit'),!busy&&!!flow()?.saved&&!flow().pendingId&&permissions.submit===true&&!dirty()&&!client.hasUnknown());
   for(const [action,label]of [['withdraw',t('撤回','Rút lại')],['approve',t('核准','Duyệt')],['return',t('退回','Trả lại')]])button(toolbar,label,()=>lifecycle(action),!busy&&!!flow()?.pendingId&&permissions[action]===true&&!client.hasUnknown());
   if(client.hasUnknown())button(toolbar,t('查詢原操作結果','Tra cứu kết quả thao tác'),async()=>{const result=await client.resolveUnknown();assertOwner();if(result?.control)adopt(result,true);else await read(true);},!busy);
   if(!control){node('p',t('載入中…','Đang tải…'),panel);return;}
   if(flow()?.pendingId)node('p',t('本頁整份草稿待審，無法修改。','Toàn bộ bản nháp của trang đang chờ duyệt, không thể sửa.'),panel);
   transferToolbar(panel);button(toolbar,t('取消本機修改','Hủy thay đổi cục bộ'),()=>{if(host.confirm(t('放棄本頁尚未存取的修改？','Bỏ thay đổi chưa lưu của trang?'))){discardLocal();pendingImportFile=undefined;importApplied=false;}},canEdit()&&dirty());if(page==='LINES')lines(panel);else catalogs(panel);history?.mount(container);history?.guardDOM(container);
  }
  const discardLocal=()=>{if(base!==undefined)mine=copy(base);pendingImportFile=undefined;importApplied=false;};
  const departure=host.VersionDraftUI?.createDeparture({root:()=>container,flow,ownsRuntimeLocal:()=>true,sharedOwned:()=>false,current:owner,
   context:()=>[page,generation,epoch,permissions.edit,permissions.save],busy:()=>busy,unknown:()=>client.hasUnknown(),failed:()=>client.hasSyncFailures(),unknownTransports:()=>[client],
   local:dirty,localSave:()=>true,canSave:()=>permissions.save===true,canDiscard:()=>permissions.edit===true,save,discard:discardLocal,discardUnknown:discardLocal,
   dialogs:()=>choiceDialog?[choiceDialog]:[],closeClean:()=>{if(choiceDialog&&!busy){choiceDialog.remove();choiceDialog=null;}}});
  if(departure){departure.autoAbandon=true;departure.allowUnload=()=>!busy;}
  return {owner,departure,busy:()=>busy,deactivate(){history?.retire();container=null;if(!client.hasUnknown()&&!busy){control=undefined;base=undefined;mine=undefined;generation=undefined;}},mount(element){container=element;render();if(!control||!dirty()&&!busy)void act(()=>read(true));},dirty,save:()=>act(save),reset(){history?.retire();container=null;},inspect:()=>({base:copy(base),mine:copy(mine),generation,pendingImportFile,importApplied,error,permissions})};
 }
 host.ProcessMasterPages={departure:()=>instances.get(activePage)?.departure,leave(){if(activePage)instances.get(activePage)?.deactivate();activePage=null;},mount(container,{page}){if(activePage&&activePage!==page)instances.get(activePage)?.deactivate();activePage=page;if(!['AB','C','LINES'].includes(page))throw Error('SCOPE_INVALID');let instance=instances.get(page);if(!instance?.owner()){instance=editor(page);instances.set(page,instance);}instance.mount(container);return instance;},reset(){for(const instance of instances.values())instance.reset();instances.clear();activePage=null;},busy:()=>[...instances.values()].some(instance=>instance.busy())};
})(window);

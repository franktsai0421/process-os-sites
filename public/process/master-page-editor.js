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
  let container,control,permissions={},base,mine,generation,busy=false,error='',part='AB',filter='',readSequence=0,choiceDialog;
  const flow=()=>control?.workflow,dirty=()=>mine!==undefined&&!same(mine,base);
  const current=()=>flow()?.working||control?.versions.find(version=>version.id===control.activeVersionId)?.snapshot;
  const assertOwner=()=>{if(!owner())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');};
  function adopt(result,reset=false){assertOwner();if(!result.control||result.control.page!==page)throw Error('MASTER_PAGE_OWNER_MISMATCH');control=result.control;permissions=result.permissions||permissions;
   if(reset||mine===undefined){base=copy(current());mine=copy(base);generation=flow()?.generation;}}
  async function read(reset=false){const sequence=++readSequence,result=await client.read();assertOwner();if(sequence!==readSequence)throw Error('MASTER_CATALOG_READ_SUPERSEDED');adopt(result,reset);return result;}
  function canEdit(){return !!flow()&&!flow().pendingId&&permissions.edit===true&&!busy&&!client.hasUnknown();}
  function button(parent,label,action,enabled=true){const result=node('button',label,parent);result.type='button';result.className='button ghost';result.disabled=!enabled;result.onclick=()=>void act(action);return result;}
  async function act(action){if(busy)return;busy=true;error='';render();try{assertOwner();await action();}catch(failure){if(owner())error=host.sharedDraftErrorMessage?.(failure)||failure.message;}finally{busy=false;if(owner())render();}}
  function change(row,key,input){input.disabled=!canEdit();input.value=Array.isArray(row[key])?row[key].join(', '):row[key]??'';input.oninput=()=>{if(!canEdit()||!owner())return;row[key]=Array.isArray(row[key])?input.value.split(',').map(value=>value.trim()).filter(Boolean):input.value;showDirty();};}
  function field(parent,label,row,key,type='text'){const cell=node('td',undefined,parent),input=node('input',undefined,cell);input.type=type;input.setAttribute('aria-label',label);change(row,key,input);return input;}
  function showDirty(){const status=container?.querySelector('[data-page-dirty]');if(status)status.textContent=dirty()?t('本機尚未存取','Thay đổi chưa lưu'):t('沒有本機修改','Không có thay đổi cục bộ');}
  function table(parent,labels){const wrap=node('div',undefined,parent);wrap.className='table-wrap';wrap.style.overflowX='auto';const result=node('table',undefined,wrap),head=node('tr',undefined,node('thead',undefined,result));for(const label of labels)node('th',label,head);return node('tbody',undefined,result);}
  function lines(parent){const tabs=node('div',undefined,parent);for(const scope of ['AB','C'])button(tabs,scope,()=>{part=scope;},!busy);
   const rows=mine[part].lines,body=table(parent,[t('線別代碼','Mã chuyền'),t('名稱','Tên'),t('操作','Thao tác')]);
   for(const line of rows){const row=node('tr',undefined,body);field(row,t('線別代碼','Mã chuyền'),line,'code');field(row,t('線別名稱','Tên chuyền'),line,'name');const actions=node('td',undefined,row);
    button(actions,t('刪除線別','Xóa chuyền'),()=>{rows.splice(rows.indexOf(line),1);},canEdit()&&permissions.delete===true);
    const stageRow=node('tr',undefined,body),cell=node('td',undefined,stageRow);cell.colSpan=3;
    const stages=table(cell,[t('工段代碼','Mã công đoạn'),t('工段名稱','Tên công đoạn'),t('機器','Máy'),t('資產編號','Mã tài sản'),t('人數','Số người'),t('操作','Thao tác')]);
    for(const stage of line.stages){const r=node('tr',undefined,stages);field(r,t('工段代碼','Mã công đoạn'),stage,'code');field(r,t('工段名稱','Tên công đoạn'),stage,'name');field(r,t('機器','Máy'),stage,'machine');field(r,t('資產編號','Mã tài sản'),stage,'assetNumber');const people=field(r,t('人數','Số người'),stage,'operators','number');people.oninput=()=>{if(canEdit()&&owner()){stage.operators=Number(people.value);showDirty();}};
     button(node('td',undefined,r),t('刪除工段','Xóa công đoạn'),()=>{line.stages.splice(line.stages.indexOf(stage),1);},canEdit()&&permissions.delete===true);}
    button(cell,t('新增工段','Thêm công đoạn'),()=>{line.stages.push({id:crypto.randomUUID(),code:'',name:'',machine:'',assetNumber:'',operators:1});},canEdit()&&permissions.create===true);
   }
   button(parent,t('新增線別','Thêm chuyền'),()=>{rows.push({id:crypto.randomUUID(),code:'',name:'',stages:[]});},canEdit()&&permissions.create===true);
  }
  function catalogs(parent){
   const label=node('label',t('搜尋產品 ','Tìm sản phẩm '),parent),search=node('input',undefined,label);search.type='search';search.value=filter;search.onchange=()=>{filter=search.value;render();};
   const refs=control.references.lines;
   node('p',t('產品路線僅可使用已核准的線別與工段。','Lộ trình sản phẩm chỉ dùng chuyền và công đoạn đã duyệt.'),parent);
   const body=table(parent,[t('產品代碼','Mã sản phẩm'),t('名稱','Tên'),t('類別','Nhóm'),t('線別','Chuyền'),t('路線模式','Chế độ lộ trình'),t('工段（逗號分隔）','Công đoạn (phân cách bằng dấu phẩy)'),t('操作','Thao tác')]);
   for(const product of mine.products.filter(row=>!filter||[row.code,row.name,row.category].some(value=>String(value||'').toLowerCase().includes(filter.toLowerCase())))){
    const row=node('tr',undefined,body);field(row,t('產品代碼','Mã sản phẩm'),product,'code');field(row,t('產品名稱','Tên sản phẩm'),product,'name');field(row,t('產品類別','Nhóm sản phẩm'),product,'category');
    const line=node('select',undefined,node('td',undefined,row));line.setAttribute('aria-label',t('線別','Chuyền'));line.disabled=!canEdit();for(const ref of refs){const option=node('option',ref.code,line);option.value=ref.code;}line.value=product.line;line.onchange=()=>{if(canEdit()&&owner()){product.line=line.value;product.stages=[];product.routeMode='exception';render();}};
    const mode=node('select',undefined,node('td',undefined,row));mode.setAttribute('aria-label',t('路線模式','Chế độ lộ trình'));mode.disabled=!canEdit();
    const group=mine.categoryGroups.find(group=>group.line===product.line&&group.name===product.category);
    const own=node('option',t('獨立路線','Lộ trình riêng'),mode);own.value='exception';if(Array.isArray(group?.defaultStages)){const inherited=node('option',t('依類別預設','Theo nhóm mặc định'),mode);inherited.value='group';}mode.value=product.routeMode||'exception';
    mode.onchange=()=>{if(!canEdit()||!owner())return;product.routeMode=mode.value;if(mode.value==='group')product.stages=copy(group.defaultStages);render();};
    const stages=field(row,t('工段代碼','Mã công đoạn'),product,'stages');stages.oninput=()=>{if(canEdit()&&owner()){product.stages=stages.value.split(',').map(value=>value.trim()).filter(Boolean);product.routeMode='exception';showDirty();}};button(node('td',undefined,row),t('刪除產品','Xóa sản phẩm'),()=>{mine.products.splice(mine.products.indexOf(product),1);},canEdit()&&permissions.delete===true);
   }
   button(parent,t('新增產品','Thêm sản phẩm'),()=>{mine.products.push({id:crypto.randomUUID(),code:'',name:'',category:'',line:refs[0]?.code||'',stages:[],routeMode:'exception'});},canEdit()&&permissions.create===true);
   node('h3',t('類別與預設路線','Nhóm và lộ trình mặc định'),parent);
   const groups=table(parent,[t('類別','Nhóm'),t('線別','Chuyền'),t('預設工段（逗號分隔）','Công đoạn mặc định'),t('操作','Thao tác')]);
   for(const group of mine.categoryGroups){const row=node('tr',undefined,groups);field(row,t('類別名稱','Tên nhóm'),group,'name');field(row,t('類別線別','Chuyền nhóm'),group,'line');const route=field(row,t('預設工段','Công đoạn mặc định'),group,'defaultStages');route.oninput=()=>{if(!canEdit()||!owner())return;group.defaultStages=route.value.split(',').map(value=>value.trim()).filter(Boolean);for(const product of mine.products)if(product.line===group.line&&product.category===group.name){if(product.routeMode==='group')product.stages=copy(group.defaultStages);else product.routeMode='exception';}showDirty();};button(node('td',undefined,row),t('刪除類別','Xóa nhóm'),()=>{mine.categoryGroups.splice(mine.categoryGroups.indexOf(group),1);},canEdit()&&permissions.delete===true);}
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
   if(client.hasUnknown())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');
   const input=copy(mine),original=JSON.stringify(mine),oldBase=copy(base),oldGeneration=generation;
   for(let attempt=0;attempt<8;attempt++){
    const fresh=await client.read();assertOwner();if(JSON.stringify(mine)!==original)throw Error('UNAPPLIED_CHANGES_APPLY_REQUIRED');
    const current=fresh.control?.workflow;if(!current||current.generation!==oldGeneration)throw Error('STALE_GENERATION');
    if(!['view','edit','save'].every(key=>fresh.permissions?.[key]===true))throw Error('FORBIDDEN');if(current.pendingId)throw Error('PENDING_LOCKED');
    const comparison=host.ProcessPageDraftMerge.compare(oldBase,input,current.working,page),choice=comparison.conflicts.length?await choose(comparison.conflicts):'mine';assertOwner();if(choice==='cancel')return;
    const confirmed=await client.read();assertOwner();if(!same(confirmed.control?.workflow,current))continue;
    if(JSON.stringify(mine)!==original)throw Error('UNAPPLIED_CHANGES_APPLY_REQUIRED');if(!['view','edit','save'].every(key=>confirmed.permissions?.[key]===true))throw Error('FORBIDDEN');
    const batches=comparison.materialize(choice),command=client.prepare(current.generation,'save',{expectedRevision:current.revision,moduleAction:'save-local-v1',patches:batches.flatMap(batch=>batch.patches),input:{batches}});
    const result=await client.sendPrepared(command);assertOwner();adopt(result,true);return;
   }
   throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
  }
  async function lifecycle(action){
   if(dirty())throw Error('UNSAVED_CHANGES_SAVE_REQUIRED');if(client.hasUnknown())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');
   const fresh=await read(),current=fresh.control.workflow,pending=current?.pendingId;
   if(!same(base,current?.working)){adopt(fresh,true);throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');}
   const reason=host.prompt(t('本次操作包含本頁整份已存內容。請輸入原因：','Thao tác áp dụng toàn bộ nội dung đã lưu của trang. Nhập lý do:'));if(reason===null)return;assertOwner();
   if(dirty())throw Error('UNSAVED_CHANGES_SAVE_REQUIRED');
   const check=await client.read();assertOwner();if(!same(check.control?.workflow,current))throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
   const self=['approve','return'].includes(action)&&current.cases.find(review=>review.id===pending)?.actor.id===actor.id;
   if(self&&!host.confirm(t('這是您送審的案件，確認自行審核？','Đây là hồ sơ bạn gửi. Xác nhận tự duyệt?')))return;
   const result=await client.command(current.generation,action,{reason,expectedRevision:current.revision,...(action==='submit'?host.captureSharedDraftSubmission(current):{caseId:pending}),...(self?{selfReviewConfirmed:true}:{})});adopt(result,true);
  }
  function render(){
   if(!container||!container.isConnected||!owner()||container.dataset.activeTab!==(page==='LINES'?'line-admin':page))return;container.replaceChildren();container.dataset.masterPage=page;
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
   if(page==='LINES')lines(panel);else catalogs(panel);
  }
  const discardLocal=()=>{if(base!==undefined)mine=copy(base);};
  const departure=host.VersionDraftUI?.createDeparture({root:()=>container,flow,ownsRuntimeLocal:()=>true,sharedOwned:()=>false,current:owner,
   context:()=>[page,generation,epoch,permissions.edit,permissions.save],busy:()=>busy,unknown:()=>client.hasUnknown(),failed:()=>client.hasSyncFailures(),unknownTransports:()=>[client],
   local:dirty,localSave:()=>true,canSave:()=>permissions.save===true,canDiscard:()=>permissions.edit===true,save,discard:discardLocal,discardUnknown:discardLocal,
   dialogs:()=>choiceDialog?[choiceDialog]:[],closeClean:()=>{if(choiceDialog&&!busy){choiceDialog.remove();choiceDialog=null;}}});
  if(departure){departure.autoAbandon=true;departure.allowUnload=()=>!busy;}
  return {owner,departure,busy:()=>busy,deactivate(){container=null;if(!client.hasUnknown()&&!busy){control=undefined;base=undefined;mine=undefined;generation=undefined;}},mount(element){container=element;render();if(!control||!dirty()&&!busy)void act(()=>read(true));},dirty,save:()=>act(save),reset(){container=null;},inspect:()=>({base:copy(base),mine:copy(mine),generation})};
 }
 host.ProcessMasterPages={departure:()=>instances.get(activePage)?.departure,leave(){if(activePage)instances.get(activePage)?.deactivate();activePage=null;},mount(container,{page}){if(activePage&&activePage!==page)instances.get(activePage)?.deactivate();activePage=page;if(!['AB','C','LINES'].includes(page))throw Error('SCOPE_INVALID');let instance=instances.get(page);if(!instance?.owner()){instance=editor(page);instances.set(page,instance);}instance.mount(container);return instance;},reset(){for(const instance of instances.values())instance.reset();instances.clear();activePage=null;},busy:()=>[...instances.values()].some(instance=>instance.busy())};
})(window);

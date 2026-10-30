(function (host) {
  'use strict';
  const displayDraftError = error => window.sharedDraftErrorMessage?.(error) ?? (typeof error === 'string' ? error : error?.message || String(error ?? ''));
  const copy = value => JSON.parse(JSON.stringify(value));
  const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const t = (zh, vi) => document.documentElement.lang === 'vi' ? vi : zh;
  const val = value => h(!value || value === '待補' ? t('待補','Cần bổ sung') : value);
  function categoryEntries(catalog) {
    const groups = new Map();
    [...(catalog.categoryGroups || []), ...catalog.products.map(p => ({line:p.line || '待補',name:p.category || '待補'}))].forEach(g => groups.set(JSON.stringify([g.line,g.name]), {...g,...groups.get(JSON.stringify([g.line,g.name]))}));
    return [...groups.values()].sort((a,b) => a.line.localeCompare(b.line) || a.name.localeCompare(b.name));
  }
  function validProduct(catalog, product, originalCode) {
    if (!product.code || !product.name) return 'required';
    if (catalog.products.some(p => p !== catalog.products.find(x => x.code === originalCode) && p.code === product.code)) return 'duplicate';
    const line = catalog.lines.find(l => l.code === product.line);
    if (!line || product.stages.some(code => !line.stages.some(s => s.code === code))) return 'route';
    return '';
  }
  const sameRoute=(a,b)=>JSON.stringify(a||[])===JSON.stringify(b||[]);
  function maximumRoute(catalog,line,products){
    const used=new Set(products.flatMap(p=>p.stages||[]));
    const priority=(catalog.lines.find(l=>l.code===line)?.stages||[]).map(s=>s.code).filter(code=>used.delete(code));
    priority.push(...[...used].sort((a,b)=>a.localeCompare(b)));
    const incoming=new Map(priority.map(code=>[code,new Set()]));
    for(const p of products){const route=p.stages||[];for(let i=1;i<route.length;i++)if(route[i]!==route[i-1])incoming.get(route[i]).add(route[i-1]);}
    // Collapse contradictory cycles before sorting so a downstream stage such
    // as FINAL can never be selected ahead of its entire predecessor cycle.
    const outgoing=new Map(priority.map(code=>[code,[]]));
    for(const [code,parents]of incoming)for(const parent of parents)outgoing.get(parent).push(code);
    const reachable=new Map(priority.map(code=>{
      const seen=new Set(),queue=[code];
      while(queue.length){const next=queue.pop();if(seen.has(next))continue;seen.add(next);queue.push(...outgoing.get(next));}
      return[code,seen];
    }));
    const components=[],owner=new Map();
    for(const code of priority){if(owner.has(code))continue;const members=priority.filter(other=>reachable.get(code).has(other)&&reachable.get(other).has(code));for(const member of members)owner.set(member,components.length);components.push(members);}
    const remaining=new Set(components.map((_,index)=>index)),stages=[];
    while(remaining.size){
      const index=[...remaining].find(i=>components[i].every(code=>[...incoming.get(code)].every(parent=>owner.get(parent)===i||!remaining.has(owner.get(parent)))));
      stages.push(...components[index]);remaining.delete(index);
    }
    const position=new Map(stages.map((code,index)=>[code,index]));
    return{stages,conflicts:products.filter(p=>(p.stages||[]).some((code,index,route)=>index>0&&position.get(route[index-1])>position.get(code))).map(p=>p.code)};
  }
  function groupRoute(catalog,line,name){
    const group=categoryEntries(catalog).find(g=>g.line===line&&g.name===name)||{line,name};
    const products=catalog.products.filter(p=>p.line===line&&p.category===name),counts=new Map();
    for(const p of products){const key=JSON.stringify(p.stages||[]);counts.set(key,(counts.get(key)||0)+1);}
    const ranked=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
    const configured=Array.isArray(group.defaultStages),removed=group.defaultStages===null;
    const maximum=maximumRoute(catalog,line,products);
    const stages=configured?[...group.defaultStages]:removed?[]:maximum.stages;
    const matches=products.filter(p=>!removed&&sameRoute(p.stages,stages));
    const inherited=products.filter(p=>configured?p.routeMode==='group':matches.includes(p)&&p.routeMode!=='exception');
    return{group,products,configured,removed,stages,inherited,matches,exceptions:products.filter(p=>!matches.includes(p)),maximum:maximum.stages,conflicts:maximum.conflicts,candidates:ranked.map(([route,count])=>({stages:JSON.parse(route),count})),tied:!configured&&!removed&&ranked.length>1&&ranked[0][1]===ranked[1][1]};
  }
  function setGroupRoute(catalog,line,name,stages,preserveRoutes=false){
    const info=groupRoute(catalog,line,name),inherited=new Set(info.inherited.map(p=>p.id||p.code));
    catalog.categoryGroups=categoryEntries(catalog);
    const group=catalog.categoryGroups.find(g=>g.line===line&&g.name===name);
    group.defaultStages=stages===null?null:[...stages];
    for(const p of info.products){const usesGroup=stages!==null&&(preserveRoutes?sameRoute(p.stages,stages):inherited.has(p.id||p.code));p.routeMode=usesGroup?'group':'exception';if(usesGroup&&!preserveRoutes)p.stages=[...stages];}
  }
  function install(api) {
    const confirm=message=>String(message).startsWith('刪除')||String(message).startsWith('Xóa')?window.confirmMasterDeletion(message):window.confirm(message);
    const {state,control,versions,draft,pending,persist,record,beginDraft,saveDraft,submitDraft,importExcel,exportExcel,validateCatalog,shared} = api;
    const ui = {scope:state.masterScope,line:'',search:'',category:'',versions:{},linesOpen:true,page:0};
    const permitted=key=>typeof window.hasPermission==='function'?window.hasPermission(key):currentUser?.role==='admin';
    const hasPendingReview=()=>!!pending(state.masterScope);
    const canDelete=()=>!!editable()&&(shared.permissions(state.masterScope)?.delete??permitted('master.delete'))&&!hasPendingReview();
    const canCreate=()=>!!editable()&&permitted(state.masterScope.toLowerCase()+'.create');
    const deletionNote=()=>!(shared.permissions(state.masterScope)?.delete??permitted('master.delete'))?t('此帳號沒有目前範圍的刪除權限。','Tài khoản không có quyền xóa trong phạm vi hiện tại.'):hasPendingReview()?t('目前有主資料正在送審，為避免版本衝突，暫停刪除。','Đang có dữ liệu chờ duyệt; tạm khóa xóa để tránh xung đột.') : '';
    function deletionAccess(){
      if(!permitted('master.delete'))return '';
      if(hasPendingReview())return `<section class="master-delete-access locked"><b>${t('刪除功能已暫停','Chức năng xóa đang tạm khóa')}</b><span>${deletionNote()}</span></section>`;
      if(editable())return `<section class="master-delete-access ready"><b>${t('修改／刪除模式已開啟','Đã bật chế độ sửa / xóa')}</b><span>${t('類別、產品、線別與工段旁已顯示刪除按鈕；所有變更仍需主管核准才會生效。','Nút xóa đã hiển thị cạnh nhóm, sản phẩm, chuyền và công đoạn; thay đổi chỉ có hiệu lực sau khi duyệt.')}</span></section>`;
      return `<section class="master-delete-access"><b>${t('您有刪除主資料權限','Bạn có quyền xóa dữ liệu gốc')}</b><span>${t('按上方「開始修改／刪除資料」建立安全草稿，刪除按鈕就會顯示。','Nhấn “Bắt đầu sửa / xóa dữ liệu” phía trên để tạo bản nháp an toàn và hiện các nút xóa.')}</span></section>`;
    }
    function deletionImpact({products=[],stages=[]}) {
      const productCodes=new Set(products.map(p=>typeof p==='string'?p:p.code)),categories=new Set(products.map(p=>typeof p==='string'?'':p.category).filter(Boolean)),stageCodes=new Set(stages);
      const bomGroups=[...productCodes].filter(code=>typeof data!=='undefined'&&data.bom?.[code]?.length),bomRows=bomGroups.reduce((sum,code)=>sum+(data.bom[code]?.length||0),0);
      const draftSets=typeof state!=='undefined'?Object.entries(state.editorByCategory||{}):[],draftOperations=draftSets.flatMap(([,set])=>Object.values(set||{}).flat());
      const affectedDrafts=draftOperations.filter(op=>stageCodes.has(op.stageCode)||op.productCodes?.some(code=>productCodes.has(code))||Object.keys(op.bomSelections||{}).some(code=>productCodes.has(code))).length;
      const categoryEditors=draftSets.filter(([key])=>[...categories].some(category=>key.startsWith(`${category}:`))).length;
      const versionList=typeof approvalVersions==='undefined'?[]:approvalVersions;
      const affectedVersions=versionList.filter(version=>categories.has(version.category)||Object.keys(version.stages||{}).some(code=>stageCodes.has(code))||Object.values(version.stages||{}).flat().some(op=>op.productCodes?.some(code=>productCodes.has(code)))).length;
      const templateCount=typeof processMaster==='undefined'?0:[...stageCodes].reduce((sum,code)=>sum+(processMaster[code]?.length||0),0);
      const dispatched=typeof dispatchBoard==='undefined'?0:Object.values(dispatchBoard).flat().filter(code=>productCodes.has(code)).length;
      const routeCount=products.filter(product=>typeof product!=='string'&&(product.stages||[]).length).length;
      const zh=[`製程編輯台：${productCodes.size} 個產品選項、${routeCount} 條產品路線`,`${categoryEditors||affectedDrafts?`編輯中草稿：${categoryEditors} 個類別工作區、${affectedDrafts} 個流程引用`:'編輯中草稿：目前沒有引用'}`,`BOM 資料：${bomGroups.length} 組主件 BOM、${bomRows} 筆零件`,`工段流程資料：${templateCount} 個流程範本`,`發送介面：${dispatched} 個正在發送的產品`, `歷史／送審版本：${affectedVersions} 版（保留紀錄，不會刪除）`];
      const vi=[`Trình chỉnh sửa: ${productCodes.size} sản phẩm, ${routeCount} tuyến sản phẩm`,`Bản nháp đang sửa: ${categoryEditors} vùng nhóm, ${affectedDrafts} tham chiếu quy trình`,`BOM: ${bomGroups.length} BOM gốc, ${bomRows} linh kiện`,`Dữ liệu công đoạn: ${templateCount} mẫu quy trình`,`Điều phối: ${dispatched} sản phẩm đang gửi`,`Phiên bản lịch sử/chờ duyệt: ${affectedVersions} (giữ lại, không xóa)`];
      const lines=document.documentElement.lang==='vi'?vi:zh;
      const usedStages=versionList.some(version=>['approved','draft','pending','pending-test'].includes(version.status)&&Object.entries(version.stages||{}).some(([stage,ops])=>stageCodes.has(stage)&&ops.length));
      return {blocked:stages.length>0&&(products.length>0||affectedDrafts>0||usedStages),message:`${t('此刪除會影響下列資料：','Thao tác xóa ảnh hưởng dữ liệu sau:')}\n• ${lines.join('\n• ')}`,warning:zh.join('；')};
    }
    function selected() { return versions().find(v => v.id === ui.versions[state.masterScope]) || draft() || pending() || versions()[0]; }
    function current() { return selected()?.snapshot || control.active[state.masterScope]; }
    function editable() { return selected()?.status === 'draft'&&shared.permissions(state.masterScope)?.edit!==false ? selected().snapshot : null; }
    const stamp = value => window.VersionDraftUI?.date(value) || '—';
    function historyEntryHTML(event) {
      const e=event&&typeof event==='object'?event:{},text=value=>typeof value==='string'?value:'';
      const actions={submit:t('送出主管審核','Gửi quản lý duyệt'),approved:t('主管核准','Quản lý phê duyệt'),returned:t('發回修改','Trả lại để sửa'),withdrawn:t('撤回送審','Rút hồ sơ')};
      const label=typeof e.label==='string'?e.label:Object.hasOwn(actions,e.action)?actions[e.action]:text(e.action);
      const note=typeof e.note==='string'?e.note:text(e.comment),actor=typeof e.actor==='string'?e.actor:text(e.actorName)||text(e.actorId);
      return `<li>${h(label)} ${h(note)} <small>${h(actor)} · ${stamp(e.at)}</small></li>`;
    }
    const status = value => ({draft:t('草稿 · 未送審','Bản nháp · Chưa gửi'),pending:t('主管審核中','Đang chờ duyệt'),approved:t('已核准','Đã duyệt'),superseded:t('歷史核准','Bản đã duyệt trước')})[value] || value;
    function showStageReferences(details){
      document.querySelector('#master-stage-references')?.remove();
      const dialog=document.createElement('dialog');dialog.id='master-stage-references';dialog.className='master-edit-dialog';
      const body=document.createElement('div');body.className='master-dialog-body';
      const heading=document.createElement('h2');heading.textContent=t('工段仍有引用，未刪除。','Công đoạn còn được sử dụng, không xóa.');body.append(heading);
      const list=document.createElement('ul');
      for(const row of details?.references||[]){const item=document.createElement('li');item.textContent=`${row.stage} · ${row.source} · ${row.id} `;
        if(row.resolveUrl?.startsWith('/process/?')){const link=document.createElement('a');link.href=row.resolveUrl+(row.detailQuery?'#stage-reference='+encodeURIComponent(row.detailQuery):'');link.target='_blank';link.rel='noopener';link.textContent=t('定位引用紀錄','Xem đúng bản ghi tham chiếu');item.append(link);}list.append(item);}
      body.append(list);
      if(details?.hidden||details?.truncated){const note=document.createElement('p');note.textContent=t('另有未顯示的引用；請由有權限的人員協助核對。','Còn tham chiếu chưa hiển thị; hãy nhờ người có quyền kiểm tra.');body.append(note);}
      const close=document.createElement('button');close.type='button';close.className='button ghost';close.textContent=t('關閉','Đóng');close.onclick=()=>dialog.close();body.append(close);dialog.append(body);
      dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();close.focus();
    }
    async function commit(label,note,action) {
      if (!editable()) return false;
      const before = copy(selected().snapshot), history = copy(selected().history || []), updated = selected().updatedAt;
      try { action(editable()); record(selected(),label,note); if(state.masterValidationErrors?.length)state.masterValidationErrors=validateCatalog(editable()); await persist(); return true; }
      catch(error) { const dialog=document.querySelector('#master-edit-dialog');if(dialog&&error.rejectedDraftPaths?.length)dialog.rejectedDraftPaths=[...(dialog.rejectedDraftPaths||[]),...error.rejectedDraftPaths];selected().snapshot = before; selected().history = history; selected().updatedAt = updated;
        if(!dialog&&error.rejectedDraftPaths?.length)shared.discardRejected(state.masterScope,error.rejectedDraftPaths);
        if(error.message==='STAGE_IN_USE')showStageReferences(error.details);
        else if(['PROCESS_TEMPLATE_SCOPE_BUSY','LINKED_PROCESS_CASE_PENDING','PROCESS_SOURCE_VERSION_CHANGED'].includes(error.message)){
          const message=t('此工段操作會變更流程範本，但 PROCESS 有草稿或待審案件；請先處理。其他 AB／C 修改不受影響。','Thao tác này thay đổi mẫu quy trình, nhưng PROCESS có bản nháp hoặc hồ sơ chờ duyệt. Hãy xử lý trước; vẫn có thể sửa dữ liệu AB/C khác.');
          const target=document.querySelector('#master-edit-dialog .master-dialog-error')||document.querySelector('#data-content');
          if(target){target.querySelector('[data-process-lock]')?.remove();const notice=document.createElement('section');notice.dataset.processLock='true';notice.setAttribute('role','alert');notice.textContent=message+' ';const link=document.createElement('a');link.href=error.details?.resolveUrl||'/process/?system=process&view=data&dataTab=process-master';link.target='_blank';link.rel='noopener';link.textContent=t('前往處理（新視窗）','Mở để xử lý (cửa sổ mới)');notice.append(link);target.append(notice);}else toast(message);
        }
        else toast(displayDraftError(error)||t('同步失敗，請重試。','Không đồng bộ được, vui lòng thử lại.')); return false; }
    }
    const small = (label,attrs='') => `<button type="button" class="master-small" ${attrs}>${label}</button>`;
    const options = (values,selectedValue) => values.map(v => `<option value="${h(typeof v === 'string' ? v : v.value)}" ${(typeof v === 'string' ? v : v.value) === selectedValue ? 'selected' : ''}>${val(typeof v === 'string' ? v : v.label)}</option>`).join('');
    function preserveView(){
      const root=document.querySelector('.master-organized');if(!root)return()=>{};
      const key=ui.scope+':'+state.masterSection,x=window.scrollX,y=window.scrollY;
      const focused=document.activeElement,focusKey=['data-stage-add','data-stage-edit','data-stage-delete','data-line-edit','data-line-delete','data-history-pick'].find(key=>focused?.hasAttribute?.(key));
      const focus=root.contains(focused)&&(focused.id||focusKey)?{id:focused.id,selector:focusKey?'['+focusKey+'="'+CSS.escape(focused.getAttribute(focusKey))+'"]':null,parent:focused.dataset.parentLine,start:focused.selectionStart,end:focused.selectionEnd}:null;
      const positions=['.master-table-wrap',...Array.from(root.querySelectorAll('.master-category-group')).map((_,i)=>`.master-category-group:nth-child(${i+1})>div`)].map(selector=>{const e=root.querySelector(selector);return{selector,top:e?.scrollTop||0,left:e?.scrollLeft||0};});
      const details=[...root.querySelectorAll('details')].map(e=>({key:e.dataset.routeDetails||e.className,open:e.open}));
      return()=>{if(key!==state.masterScope+':'+state.masterSection)return;const next=document.querySelector('.master-organized');if(!next)return;for(const p of positions){const e=next.querySelector(p.selector);if(e){e.scrollTop=p.top;e.scrollLeft=p.left;}}for(const e of next.querySelectorAll('details')){const old=details.find(d=>d.key===(e.dataset.routeDetails||e.className));if(old)e.open=old.open;}if(focus){const input=focus.id?document.getElementById(focus.id):next.querySelector(focus.selector)||(focus.parent?next.querySelector('[data-stage-add="'+CSS.escape(focus.parent)+'"]'):null);if(input&&next.contains(input)){input.focus({preventScroll:true});if(focus.start!==null&&typeof input.setSelectionRange==='function')input.setSelectionRange(focus.start,focus.end);}}window.scrollTo(x,y);};
    }
    function redraw() { const content = document.querySelector('#data-content'); if(content) {const restore=preserveView();content.innerHTML = masterView(); bindMaster();restore();} }
    function modal(title,body,onSave,setup) {
      document.querySelector('#master-edit-dialog')?.close();
      const previous = document.activeElement, dialog = document.createElement('dialog');
      const openerKey=['data-line-edit','data-stage-edit','data-stage-add'].find(key=>previous?.hasAttribute?.(key));
      const openerCode=openerKey?previous.getAttribute(openerKey):null;
      const openerRow=openerKey==='data-stage-edit'?current().lines.flatMap(line=>line.stages).find(stage=>stage.code===openerCode):current().lines.find(line=>line.code===openerCode);
      const restoreOpener=()=>{let target=previous?.isConnected?previous:null;if(!target&&openerKey){const row=openerKey==='data-stage-edit'?current().lines.flatMap(line=>line.stages).find(stage=>stage.id===openerRow?.id):current().lines.find(line=>line.id===openerRow?.id);target=document.querySelector('['+openerKey+'="'+CSS.escape(row?.code||openerCode)+'"]');}target?.focus({preventScroll:true});};
      dialog.id = 'master-edit-dialog'; dialog.className = 'master-edit-dialog'; dialog.dataset.i18nSkip = 'true';
      dialog.setAttribute('aria-labelledby','master-dialog-title');
      dialog.innerHTML = `<form><header><h2 id="master-dialog-title">${title}</h2>${small('×','data-cancel aria-label="'+t('取消','Hủy')+'"')}</header><div class="master-dialog-body">${body}<p class="master-dialog-error" role="alert"></p></div><footer><small>${t('Esc 取消，不儲存變更','Esc để hủy, không lưu thay đổi')}</small>${small(t('取消','Hủy'),'data-cancel')}<button class="button signal" type="submit">${window.VersionDraftUI.t('apply')}</button></footer></form>`;
      document.body.appendChild(dialog);
      const dialogScope=state.masterScope,dialogActorId=window.ProcessSync?.identity?.id;
      dialog.addEventListener('close',() => {if(dialog.rejectedDraftPaths?.length&&dialogActorId===window.ProcessSync?.identity?.id)shared.discardRejected(dialogScope,dialog.rejectedDraftPaths);dialog.remove();restoreOpener();});
      dialog.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => dialog.close());
      // Native dialog cancel (Escape) closes without ever invoking onSave.
      let applying=false;
      dialog.addEventListener('cancel',event=>{if(applying)event.preventDefault();});
      dialog.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>{if(!applying)dialog.close();});
      dialog.querySelector('form').onsubmit = async event => {
        event.preventDefault();if(applying)return;applying=true;
        dialog.querySelector('.master-dialog-error').replaceChildren();
        const buttons=[...dialog.querySelectorAll('button')].map(button=>({button,disabled:button.disabled}));buttons.forEach(({button})=>button.disabled=true);
        try{const error=await onSave(new FormData(event.target),dialog);
          if(error){const target=dialog.querySelector('.master-dialog-error');if(!target.querySelector('[data-process-lock]'))target.textContent=displayDraftError(error);}
          else{dialog.close();redraw();toast(t('已同步；尚未手動儲存','Đã đồng bộ; chưa lưu thủ công'));}
        }catch(error){dialog.querySelector('.master-dialog-error').textContent=displayDraftError(error);}
        finally{applying=false;buttons.forEach(({button,disabled})=>button.disabled=disabled);}
      };
      if(!onSave){dialog.querySelector('[type=submit]').remove();dialog.querySelector('footer>small').textContent=t('唯讀查看','Chỉ xem');}
      setup?.(dialog); dialog.showModal();
      return dialog;
    }
    const field = (label,name,value='',extra='') => `<label>${label}<input name="${name}" value="${h(value)}" ${extra}></label>`;
    const select = (label,name,items,value) => `<label>${label}<select name="${name}">${options(items,value)}</select></label>`;
    function editCategory(group) {
      if(!editable()) return;
      const line = group?.line || ui.line || current().lines[0]?.code || '待補';
      modal(group ? t('修改產品類別','Sửa nhóm sản phẩm') : t('新增產品類別','Thêm nhóm sản phẩm'),
        select(t('線別','Chuyền'),'line',current().lines.map(l=>({value:l.code,label:`${l.code} · ${l.name}`})),line)+field(t('類別名稱','Tên nhóm'),'name',group?.name,'required maxlength="100"'), async form => {
          const name = form.get('name').trim(), nextLine = form.get('line');
          if(!name || !nextLine) return t('請填寫類別與線別。','Nhập nhóm và chuyền.');
          if(categoryEntries(current()).some(g => g.name===name && g.line===nextLine && !(group?.name===name && group?.line===nextLine))) return t('這個線別已有同名類別。','Chuyền này đã có nhóm cùng tên.');
          if(group && nextLine !== group.line && current().products.some(p=>p.line===group.line&&p.category===group.name)) return t('此類別已有產品，請先調整產品線別再移動類別。','Nhóm đang có sản phẩm. Hãy đổi chuyền của sản phẩm trước.');
          return (await commit(group?'修改產品類別':'新增產品類別',`${nextLine} · ${name}`, catalog=>{
            catalog.categoryGroups=categoryEntries(catalog).filter(g=>!(group&&g.line===group.line&&g.name===group.name));
            catalog.categoryGroups.push({...group,id:group?.id||crypto.randomUUID(),line:nextLine,name,...(group&&nextLine!==group.line?{defaultStages:null}:{})});
            if(group) catalog.products.forEach(p=>{if(p.line===group.line&&p.category===group.name)p.category=name;});
          })) ? '' : t('無法儲存。','Không lưu được.');
        });
    }
    async function removeCategory(group) {
      if(!canDelete()){toast(deletionNote());return;}
      const products=current().products.filter(p=>p.line===group.line&&p.category===group.name),count=products.length,impact=deletionImpact({products});
      if(!confirm(`${t(`刪除 ${group.line} 線「${group.name}」及其 ${count} 筆產品？`,`Xóa nhóm ${group.name} của chuyền ${group.line} và ${count} sản phẩm?`)}\n\n${impact.message}\n\n${t('此變更只會先加入草稿，主管核准後才套用。確定繼續？','Thay đổi chỉ được thêm vào bản nháp và áp dụng sau khi quản lý duyệt. Tiếp tục?')}`))return;
      if(await commit('刪除產品類別',`${group.line} · ${group.name}`,catalog=>{
        catalog.categoryGroups=categoryEntries(catalog).filter(g=>!(g.line===group.line&&g.name===group.name));
        catalog.products=catalog.products.filter(p=>!(p.line===group.line&&p.category===group.name));
        selected().warnings.push(`刪除類別 ${group.line} / ${group.name}（${count} 筆產品）｜${impact.warning}`);
      })) {ui.category='';redraw();}
    }
    function routeDiagram(stages,line){
      const definitions=current().lines.find(l=>l.code===line)?.stages||[];
      return `<ol class="master-route-diagram">${stages.map((code,i)=>`<li><span class="master-route-number">${i+1}</span><span><code>${h(code)}</code><small>${val(definitions.find(s=>s.code===code)?.name||code)}</small></span></li>`).join('')}</ol>`;
    }
    function productRouteSummary(product){
      const info=groupRoute(current(),product.line,product.category);
      return !info.removed&&sameRoute(product.stages,info.stages)?`<span class="master-route-state">${t('使用預設路線','Dùng tuyến mặc định')}${info.configured?'':t('（建議）',' (đề xuất)')}${product.routeMode==='exception'?t(' · 獨立設定',' · cài đặt riêng'):''}</span>`:`<span class="master-product-route-path">${h((product.stages||[]).join(' → ')||t('尚無路線','Chưa có tuyến'))}</span>`;
    }
    function groupRoutePanel(){
      const groups=categoryEntries(current()).filter(g=>(!ui.line||g.line===ui.line)&&g.name===ui.category);
      if(!groups.length)return `<section class="master-group-route"><h3>${t('群組製程路線','Tuyến mặc định của nhóm')}</h3><p>${t('先選擇上方類別，查看或設定共同路線；各產品可另設例外。','Chọn nhóm phía trên để xem hoặc đặt tuyến chung; mỗi sản phẩm có thể dùng tuyến ngoại lệ.')}</p></section>`;
      return groups.map(g=>{const info=groupRoute(current(),g.line,g.name),different=!sameRoute(info.stages,info.maximum),maximumAdopted=info.configured&&!different;
        return `<section class="master-group-route" data-route-group="${h(g.line+':'+g.name)}"><header><div><h3>${h(g.line)} · ${h(g.name)}</h3><span class="master-route-state">${t('群組最大路線','Tuyến đầy đủ của nhóm')} · ${maximumAdopted?t('已設為預設','Đã đặt mặc định'):t('待確認採用','Chờ áp dụng')}</span></div><div class="master-row-actions">${small(t('查看','Xem'),`data-group-route-view="${h(g.name)}" data-route-line="${h(g.line)}"`)}${editable()?`${!maximumAdopted?small(t('採用最大路線','Dùng tuyến đầy đủ'),`data-group-route-maximum="${h(g.name)}" data-route-line="${h(g.line)}"`):''}${small(t('修改路線','Sửa tuyến'),`data-group-route-edit="${h(g.name)}" data-route-line="${h(g.line)}"`)}`:''}${canDelete()&&info.configured?small(t('移除預設','Bỏ mặc định'),`data-group-route-remove="${h(g.name)}" data-route-line="${h(g.line)}"`):''}</div></header>
        ${routeDiagram(info.maximum,g.line)}<p>${t('整合本群組全部產品工段並去重，優先保留產品先後順序；順序衝突時依工段設定排列，不改個別產品路線。','Gộp công đoạn, bỏ trùng và giữ thứ tự sản phẩm; khi mâu thuẫn dùng thứ tự cấu hình, không đổi tuyến sản phẩm.')}</p>
        ${info.conflicts.length?`<p class="master-route-warning">${t('部分產品順序不同，原路線保留：','Một số sản phẩm có thứ tự khác; giữ tuyến gốc: ')}${info.conflicts.map(h).join('、')}</p>`:''}
        ${different?`<details><summary>${t('目前儲存的預設路線（採用前保留）','Tuyến mặc định đã lưu (giữ đến khi áp dụng)')}</summary>${routeDiagram(info.stages,g.line)}</details>`:''}
        <p>${t(`與目前預設相同 ${info.matches.length} 個產品 · 例外 ${info.exceptions.length} 個產品；核准後更新製程畫布工段。`,`Trùng mặc định hiện tại: ${info.matches.length} · Ngoại lệ: ${info.exceptions.length}; cập nhật sơ đồ sau khi duyệt.`)}</p>
        <details data-route-details="${h(g.line+':'+g.name)}"><summary>${t('查看產品例外','Xem sản phẩm ngoại lệ')} · ${info.exceptions.length}</summary>${info.exceptions.map(p=>`<div class="master-route-exception"><code>${h(p.code)}</code><span>${val(p.name)}<span class="master-product-route-path">${h((p.stages||[]).join(' → ')||t('尚無路線','Chưa có tuyến'))}</span></span></div>`).join('')||`<p>${t('全部產品使用預設路線','Tất cả sản phẩm dùng tuyến mặc định')}</p>`}</details></section>`;
      }).join('');
    }
    async function adoptMaximumRoute(line,name){
      const info=groupRoute(current(),line,name);
      if(!confirm(t(`採用最大路線 ${info.maximum.join(' → ')}？保留 ${info.products.length} 個產品原路線；相同者使用預設，不同者保留例外。`,`Dùng tuyến đầy đủ ${info.maximum.join(' → ')}? Giữ tuyến của ${info.products.length} sản phẩm; tuyến trùng dùng mặc định, tuyến khác giữ ngoại lệ.`)))return;
      if(await commit('採用群組最大路線',line+' · '+name,c=>setGroupRoute(c,line,name,info.maximum,true)))redraw();
    }
    function editGroupRoute(line,name,readonly=false){
      const info=groupRoute(current(),line,name),route=[...info.stages];
      const stages=current().lines.find(l=>l.code===line)?.stages||[];
      const body=`<p>${t('核准後依全部產品的最大路線顯示畫布；產品例外維持各自路線。隱藏工段保留原流程，重新加入可恢復。','Sau khi duyệt, sơ đồ dùng tuyến đầy đủ của các sản phẩm; giữ tuyến ngoại lệ. Công đoạn ẩn giữ nguyên nội dung và hiện lại khi được thêm lại.')}</p>${readonly?routeDiagram(route,line):`<section class="master-route-picker"><div class="master-route-add"><select aria-label="${t('可選工段','Công đoạn có sẵn')}" data-group-stage></select>${small(t('加入工段','Thêm công đoạn'),'data-group-add')}</div><ol data-group-route-list></ol></section>`}<details open><summary>${t('本次沿用產品','Sản phẩm theo mặc định')} · ${info.inherited.length}</summary><p>${info.inherited.map(p=>h(p.code)).join('、')||'—'}</p></details><details><summary>${t('保留產品例外','Giữ sản phẩm ngoại lệ')} · ${info.exceptions.length}</summary><p>${info.exceptions.map(p=>h(p.code)).join('、')||'—'}</p></details>`;
      modal(t('群組製程路線','Tuyến mặc định của nhóm')+' · '+h(line)+' / '+h(name),body,readonly?null:async()=>{
        const removed=info.inherited.filter(p=>p.stages.some(s=>!route.includes(s)));
        if(removed.length){if(!canDelete())return deletionNote();if(!window.confirmMasterDeletion(t(`移除路線工段將影響 ${removed.length} 個產品：${removed.map(p=>p.code).join('、')}。保留檢查標準、流程與歷史；核准後這些產品不再經過移除的工段。`,`Bỏ công đoạn ảnh hưởng ${removed.length} sản phẩm: ${removed.map(p=>p.code).join(', ')}. Giữ tiêu chuẩn, quy trình và lịch sử; sau khi duyệt sản phẩm không đi qua công đoạn đã bỏ.`)))return t('已取消','Đã hủy');}
        return await commit('修改群組預設路線',`${line} · ${name} · ${route.join(' → ')}`,c=>setGroupRoute(c,line,name,route))?'':t('套用失敗，請核對衝突後重試。','Áp dụng thất bại; kiểm tra xung đột rồi thử lại.');
      },dialog=>{if(readonly)return;const picker=dialog.querySelector('[data-group-stage]');
        function paint(){const available=stages.filter(s=>!route.includes(s.code));picker.innerHTML=options(available.map(s=>({value:s.code,label:s.code+' · '+s.name})),available[0]?.code);dialog.querySelector('[data-group-add]').disabled=!available.length;
          dialog.querySelector('[data-group-route-list]').innerHTML=route.map((code,i)=>`<li><span>${h(code)} · ${val(stages.find(s=>s.code===code)?.name)}</span>${small('↑',`data-group-up="${i}" ${!i?'disabled':''} aria-label="${t('向前移','Chuyển lên')} ${h(code)}"`)}${small('↓',`data-group-down="${i}" ${i===route.length-1?'disabled':''} aria-label="${t('向後移','Chuyển xuống')} ${h(code)}"`)}${small('×',`data-group-remove="${i}" aria-label="${t('移除工段','Bỏ công đoạn')} ${h(code)}"`)}</li>`).join('')||`<p>${t('尚無工段','Chưa có công đoạn')}</p>`;
          for(const b of dialog.querySelectorAll('[data-group-up],[data-group-down],[data-group-remove]'))b.onclick=()=>{const i=Number(b.dataset.groupUp??b.dataset.groupDown??b.dataset.groupRemove);if(b.hasAttribute('data-group-remove'))route.splice(i,1);else{const j=i+(b.hasAttribute('data-group-up')?-1:1);[route[i],route[j]]=[route[j],route[i]];}paint();};
        }
        dialog.querySelector('[data-group-add]').onclick=()=>{if(picker.value&&!route.includes(picker.value))route.push(picker.value);paint();};paint();
      });
    }
    async function removeGroupRoute(line,name){
      if(!canDelete())return;
      const info=groupRoute(current(),line,name);
      if(!window.confirmMasterDeletion(t(`移除 ${line} / ${name} 的預設路線設定？${info.products.length} 個產品保留目前路線，改為個別設定。既有工段、IPQC 標準、製程與歷史不刪除。`,`Bỏ tuyến mặc định ${line} / ${name}? Giữ tuyến hiện tại cho ${info.products.length} sản phẩm dưới dạng riêng. Không xóa công đoạn, tiêu chuẩn IPQC, quy trình hoặc lịch sử.`)))return;
      if(await commit('移除群組預設路線',`${line} · ${name}`,c=>setGroupRoute(c,line,name,null)))redraw();
    }
    function editProduct(original) {
      if(!editable()) return;
      const catalog = current(), product = copy(original || {code:'',name:'',specification:'',unit:'待補',line:ui.line || catalog.lines[0]?.code,category:ui.category || '待補',stages:[]});
      const initialGroup=groupRoute(catalog,product.line,product.category);
      let mode=original?(product.routeMode||'exception'):(initialGroup.configured?'group':'exception');
      let route = mode==='group'?[...initialGroup.stages]:[...product.stages],adoptRoute=null,routeChoice=false;
      const units=[...new Set(['待補','CAI','BO','KG','M','TO','SET','PCS','個','組','件',...catalog.products.map(p=>p.unit||'待補')])];
      modal(original?t('修改產品','Sửa sản phẩm'):t('新增產品','Thêm sản phẩm'), `<div class="master-form-grid">${field(t('產品編號','Mã sản phẩm'),'code',product.code,'required maxlength="100"')}${field(t('產品名稱','Tên sản phẩm'),'name',product.name,'required maxlength="200"')}${select(t('線別','Chuyền'),'line',catalog.lines.map(l=>({value:l.code,label:`${l.code} · ${l.name}`})),product.line)}<label>${t('產品類別','Nhóm sản phẩm')}<select name="category"></select></label>${field(t('規格','Quy cách'),'specification',product.specification)}${select(t('單位','Đơn vị'),'unit',units,product.unit)}</div><section class="master-route-picker"><h3>${t('製程路線','Tuyến quy trình')}</h3><p>${t('按順序加入工段；可調整順序或移除。','Thêm công đoạn theo thứ tự; có thể đổi thứ tự hoặc bỏ.')}</p><div class="master-route-add"><select name="stage-choice" aria-label="${t('可選工段','Công đoạn có sẵn')}"></select>${small(t('加入工段','Thêm công đoạn'),'data-route-add')}</div><ol data-route-list></ol></section>`, async form=>{
        const next={...product,code:form.get('code').trim(),name:form.get('name').trim(),line:form.get('line'),category:form.get('category')||'待補',unit:form.get('unit')||'待補',specification:form.get('specification').trim()||'待補',stages:route};
        const routeChanged=!original||routeChoice||next.line!==product.line||next.category!==product.category||!sameRoute(route,product.stages);
        if(routeChanged)next.routeMode=mode;
        const error=validProduct(catalog,next,original?.code);
        const removedStages=(original?.stages||[]).filter(code=>!route.includes(code));
        if(removedStages.length){if(!canDelete())return deletionNote();if(!window.confirmMasterDeletion(`刪除產品 ${original.code} 路線中的工段：${removedStages.join('、')}。\n核准後將更新製程編輯台、產品狀態與產線播放的適用路線。`))return t('已取消路線刪除。','Đã hủy xóa tuyến.');}
        if(control.active[state.masterScope==='AB'?'C':'AB'].products.some(p=>p.code===next.code))return t('另一個產線頁籤已使用此產品編號。','Mã sản phẩm đã dùng ở thẻ chuyền khác.');
        if(error) return error==='duplicate'?t('產品編號重複，請使用其他編號。','Mã sản phẩm đã tồn tại.'):error==='route'?t('請選擇有效線別及該線工段。','Chọn chuyền và công đoạn hợp lệ.'):t('請填寫產品編號與名稱。','Nhập mã và tên sản phẩm.');
        return (await commit(original?'修改產品':'新增產品',next.code,c=>{const g=groupRoute(c,next.line,next.category);if(mode==='group'&&(!g.configured||(adoptRoute&&!sameRoute(g.stages,route))))setGroupRoute(c,next.line,next.category,route,true);if(original)c.products[c.products.indexOf(original)]=next;else c.products.unshift(next);}))?'':t('無法儲存。','Không lưu được.');
      }, dialog=>{
        const lineInput=dialog.querySelector('[name=line]'), cat=dialog.querySelector('[name=category]'), choice=dialog.querySelector('[name=stage-choice]');
        const modeLabel=document.createElement('label');modeLabel.textContent=t('路線設定','Cài đặt tuyến');const modeInput=document.createElement('select');modeInput.name='route-mode';modeLabel.append(modeInput);dialog.querySelector('.master-route-picker').prepend(modeLabel);
        const preset=document.createElement('div');preset.className='master-product-preset';preset.innerHTML=`<strong>${t('預設路線','Tuyến mặc định')}</strong><p data-preset-path></p>${small(t('套用預設路線','Áp dụng tuyến mặc định'),'data-apply-default')}<small data-preset-note></small>`;dialog.querySelector('.master-route-picker').insertBefore(preset,dialog.querySelector('.master-route-picker h3'));
        function paintMode(){const g=groupRoute(catalog,lineInput.value,cat.value),available=adoptRoute||(!g.removed?g.stages:[]);if(!available.length)mode='exception';modeInput.innerHTML=options([...(available.length?[{value:'group',label:t('使用預設路線','Dùng tuyến mặc định')}]:[]),{value:'exception',label:t('產品例外路線','Tuyến ngoại lệ sản phẩm')}],mode);if(mode==='group')route=[...available];
          const proposed=g.removed?g.maximum:g.stages;preset.querySelector('[data-preset-path]').textContent=proposed.join(' → ')||t('此類別尚無預設路線，可先在群組設定。','Nhóm chưa có tuyến mặc định; hãy cấu hình ở nhóm.');preset.querySelector('[data-apply-default]').disabled=!proposed.length;
          preset.querySelector('[data-preset-note]').textContent=g.configured?t('套用只改此表單；按「套用至草稿」才會同步。','Chỉ đổi biểu mẫu; nhấn áp dụng vào bản nháp để đồng bộ.'):t('套用至草稿時同時建立群組預設，保留其他產品原路線。','Khi áp dụng bản nháp sẽ tạo mặc định nhóm và giữ tuyến sản phẩm khác.');
        }
        preset.querySelector('[data-apply-default]').onclick=()=>{routeChoice=true;const g=groupRoute(catalog,lineInput.value,cat.value);adoptRoute=[...(g.removed?g.maximum:g.stages)];mode='group';paintMode();paintRoute();};
        function paintRoute() {
          const stages=catalog.lines.find(l=>l.code===lineInput.value)?.stages||[];
          const available=stages.filter(s=>!route.includes(s.code));
          choice.innerHTML=options([{value:'',label:t('選擇工段','Chọn công đoạn')},...available.map(s=>({value:s.code,label:`${s.code} · ${s.name}`}))],'');
          dialog.querySelector('[data-route-add]').disabled=!available.length;
          dialog.querySelector('[data-route-list]').innerHTML=route.map((code,index)=>`<li><span><code>${h(code)}</code> ${val(stages.find(s=>s.code===code)?.name)}</span>${small('↑',`data-route-up="${index}" ${index===0?'disabled':''} aria-label="${t('向前移','Chuyển lên')}"`)}${small('↓',`data-route-down="${index}" ${index===route.length-1?'disabled':''} aria-label="${t('向後移','Chuyển xuống')}"`)}${small('×',`data-route-remove="${index}" aria-label="${t('移除工段','Bỏ công đoạn')}"`)}</li>`).join('')||`<p>${t('尚未選擇工段，可先儲存草稿。','Chưa chọn công đoạn; vẫn có thể lưu nháp.')}</p>`;
          dialog.querySelectorAll('[data-route-up]').forEach(b=>b.onclick=async()=>{const i=+b.dataset.routeUp;[route[i-1],route[i]]=[route[i],route[i-1]];paintRoute();});
          dialog.querySelectorAll('[data-route-down]').forEach(b=>b.onclick=async()=>{const i=+b.dataset.routeDown;[route[i+1],route[i]]=[route[i],route[i+1]];paintRoute();});
          dialog.querySelectorAll('[data-route-remove]').forEach(b=>b.onclick=async()=>{route.splice(+b.dataset.routeRemove,1);paintRoute();});
          if(mode==='group')dialog.querySelectorAll('[data-route-add],[data-route-up],[data-route-down],[data-route-remove],[name=stage-choice]').forEach(e=>e.disabled=true);else choice.disabled=false;
        }
        function paintCategories(value) {cat.innerHTML=options([...new Set(['待補',...categoryEntries(catalog).filter(g=>g.line===lineInput.value).map(g=>g.name),...(value?[value]:[])])],value||'待補');}
        lineInput.onchange=()=>{route=[];adoptRoute=null;paintCategories('待補');paintMode();paintRoute();};
        cat.onchange=()=>{adoptRoute=null;const g=groupRoute(catalog,lineInput.value,cat.value);mode=g.configured&&sameRoute(route,g.stages)?'group':'exception';paintMode();paintRoute();};modeInput.onchange=()=>{routeChoice=true;mode=modeInput.value;if(mode==='exception')adoptRoute=null;paintMode();paintRoute();};
        dialog.querySelector('[data-route-add]').onclick=()=>{if(choice.value&&!route.includes(choice.value))route.push(choice.value);paintRoute();};
        paintCategories(product.category);paintMode();paintRoute();
      });
    }
    function editLine(original) {
      if(!editable())return;
      modal(original?t('修改線別','Sửa chuyền'):t('新增線別','Thêm chuyền'),field(t('線別代碼','Mã chuyền'),'code',original?.code,original&&!/^[A-Za-z0-9_-]+$/.test(original.code)?'required':'required pattern="[A-Za-z0-9_\\-]+"')+field(t('線別名稱','Tên chuyền'),'name',original?.name,'required'),async form=>{
        const entered=form.get('code').trim(),code=original&&entered===original.code?original.code:entered.toUpperCase(),name=form.get('name').trim();
        const target=original&&current().lines.find(l=>original.id?l.id===original.id:l.code===original.code);
        if(original&&(!target||target.code!==original.code||target.name!==original.name))return t('資料已變更，請重新開啟線別後再修改。','Dữ liệu đã thay đổi; hãy mở lại chuyền để sửa.');
        if((!original||code!==original.code)&&!/^[A-Za-z0-9_-]+$/.test(code)||!name)return t('請填寫名稱；代碼只可包含英數字、底線或連字號。','Nhập tên; mã chỉ gồm chữ, số, dấu gạch dưới hoặc gạch nối.');
        if(current().lines.some(l=>l!==target&&l.code===code))return t('線別代碼重複。','Mã chuyền đã tồn tại.');
        const other=control.active[state.masterScope==='AB'?'C':'AB'];
        if(other.lines.some(l=>l.code===code))return t('此線別已由另一個產線頁籤管理。','Chuyền được quản lý ở thẻ khác.');
        return (await commit(original?'修改線別':'新增線別',code,c=>{
          c.categoryGroups=categoryEntries(c);
          if(original){const old=target.code;c.lines[c.lines.indexOf(target)]={...target,code,name};c.products.forEach(p=>{if(p.line===old)p.line=code;});c.categoryGroups.forEach(g=>{if(g.line===old)g.line=code;});if(ui.line===old)ui.line=code;}
          else c.lines.push({code,name,stages:[]});
        }))?'':t('無法儲存。','Không lưu được.');
      });
    }
    function editStage(line,original) {
      if(!editable())return;
      modal(original?t('修改工段','Sửa công đoạn'):t('新增工段','Thêm công đoạn'),`<p>${h(line.code)} · ${val(line.name)}</p><div class="master-form-grid">${field(t('工段編號','Mã công đoạn'),'code',original?.code||`${line.code}-`,original&&!/^[A-Za-z0-9_-]+$/.test(original.code)?'required':'required pattern="[A-Za-z0-9_\\-]+"')}${field(t('工段名稱','Tên công đoạn'),'name',original?.name,'required')}</div>`,async form=>{
        const entered=form.get('code').trim(),code=original&&entered===original.code?original.code:entered.toUpperCase(),name=form.get('name').trim();
        if((!original||code!==original.code)&&!/^[A-Za-z0-9_-]+$/.test(code)||!name)return t('請填寫名稱；代碼只可包含英數字、底線或連字號。','Nhập tên; mã chỉ gồm chữ, số, dấu gạch dưới hoặc gạch nối.');
        // A rejected Apply restores the snapshot with fresh objects. Resolve the
        // original stable identity again; never mutate the detached modal object.
        const target=current().lines.find(item=>line.id?item.id===line.id:item.code===line.code);
        const existing=original&&target?.stages.find(item=>original.id?item.id===original.id:item.code===original.code);
        if(!target||target.code!==line.code||original&&(!existing||JSON.stringify(existing)!==JSON.stringify(original)))
          return t('資料已變更，請重新開啟工段後再修改。','Dữ liệu đã thay đổi; hãy mở lại công đoạn để sửa.');
        if(current().lines.flatMap(l=>l.stages).some(s=>s!==existing&&s.code===code)||control.active[state.masterScope==='AB'?'C':'AB'].lines.flatMap(l=>l.stages).some(s=>s.code===code))return t('工段編號重複。','Mã công đoạn đã tồn tại.');
        return (await commit(original?'修改工段':'新增工段',code,c=>{const next={...existing,code,name};if(!original){next.machine='待補';next.assetNumber='待補';next.operators=null;}if(original){const old=existing.code;target.stages[target.stages.indexOf(existing)]=next;c.products.forEach(p=>p.stages=p.stages.map(s=>s===old?code:s));(c.categoryGroups||[]).forEach(g=>{if(Array.isArray(g.defaultStages))g.defaultStages=g.defaultStages.map(s=>s===old?code:s);});}else target.stages.push(next);}))?'':t('無法儲存。','Không lưu được.');
      });
    }
    function sharedStatus(){const flow=shared.flow(state.masterScope);if(!flow)return '';
      const saved=flow.saved,dirty=JSON.stringify(flow.working)!==JSON.stringify(saved?.content);
      return `<section class="master-edit-note" id="master-shared-status" role="status">${t('共用草稿範圍','Phạm vi bản nháp chung')}: ${h(state.masterScope)} · ${flow.pendingId?t('待審鎖定','Đang chờ duyệt · đã khóa'):dirty?t('尚未儲存','Chưa lưu'):t('已儲存','Đã lưu')} · ${t('儲存者','Người lưu')}: ${h(saved?.actor.name||'—')} · ${stamp(saved?.at)}
      <div class="master-version-actions"><button class="button ghost" id="master-shared-history">${t('送審案件／歷史還原','Hồ sơ / Khôi phục lịch sử')}</button><button class="button ghost" id="master-shared-recover">${t('查詢未知操作結果','Kiểm tra kết quả chưa rõ')}</button></div></section>`;
    }
    function versionBar() {
      const item=selected(), active=versions().find(v=>v.status==='approved'), historical=!!ui.versions[state.masterScope]&&item?.status!=='draft';
      return `${sharedStatus()}<section class="master-version-bar"><div><small>${t('目前查閱','Đang xem')}</small><h3>${state.masterScope} · V${item?.number||1} <span class="master-status ${item?.status}">${status(item?.status)}</span></h3><p>${item?.status==='draft'?t('先儲存草稿，再送主管審核。','Lưu bản nháp trước khi gửi duyệt.'):t('唯讀查閱，不會替換平台正在使用的資料。','Chỉ xem; không thay dữ liệu đang sử dụng.')} ${t('目前生效','Đang sử dụng')}: V${active?.number||1}</p></div><label class="master-version-select">${t('選擇版本／草稿','Chọn phiên bản / bản nháp')}<select id="master-version-choice">${versions().map(v=>`<option value="${h(v.id)}" ${v.id===item?.id?'selected':''}>V${v.number} · ${status(v.status)} · ${stamp(v.updatedAt)}</option>`).join('')}</select></label><div class="master-version-actions">${!draft()&&!pending()?`<button class="button signal" id="master-new-draft">${t('建立新版本草稿','Tạo bản nháp mới')}</button>`:''}${editable()?`<button class="button ghost" id="master-save-draft">${t('儲存草稿','Lưu bản nháp')}</button><button class="button signal" id="master-submit">${t('送出主管審核','Gửi quản lý duyệt')}</button>`:''}${item?.status==='pending'&&shared.permissions(state.masterScope)?.withdraw?`<button class="button ghost" id="master-withdraw">${t('解除送審，繼續修改','Hủy gửi duyệt, sửa tiếp')}</button>`:''}${item?.status==='pending'?small(t('查看送審案件','Xem hồ sơ duyệt'),'id="master-view-review"'):''}${historical&&draft()?small(t('回到草稿','Về bản nháp'),'id="master-return-draft"'):''}</div></section><details class="master-history"><summary>${t('版本紀錄與操作歷程','Lịch sử phiên bản và thao tác')} · ${versions().length}</summary><div>${versions().map(v=>`<button data-history-pick="${h(v.id)}"><b>V${v.number} · ${status(v.status)}</b><small>${stamp(v.createdAt)} · ${h(v.creatorName)}</small></button>`).join('')}</div><ol>${(item?.history||[]).slice().reverse().map(historyEntryHTML).join('')}</ol></details>${!historical&&(state.masterValidationErrors||[]).length?`<div class="master-danger-list">${t('送審前需修正','Cần sửa trước khi gửi')}${state.masterValidationErrors.map(e=>`<p>${h(e.message)} ${small(t("前往修改","Đến sửa"),`data-fix-master="${e.index}"`)}</p>`).join('')}</div>`:''}${item?.warnings?.length?`<div class="master-danger-list"><b>${t('刪除變更：核准後才生效','Thay đổi xóa: chỉ hiệu lực sau khi duyệt')}</b>${item.warnings.map(w=>`<div>${h(w)}</div>`).join('')}</div>`:''}`;
    }
    function categoryBox() {
      const catalog=current(),groups=categoryEntries(catalog),lineCodes=[...new Set([...catalog.lines.map(l=>l.code),...groups.map(g=>g.line)])].filter(l=>!ui.line||l===ui.line);
      return `<section class="master-category-box"><header><h3>${t('產品類別管理','Quản lý nhóm sản phẩm')}</h3>${editable()?small(t('＋ 加入類別','＋ Thêm nhóm'),'id="add-master-category"'):''}</header>${editable()&&deletionNote()?`<p class="master-permission-note">${deletionNote()}</p>`:''}<div class="master-category-groups">${lineCodes.map(line=>`<section class="master-category-group"><header><b>${h(line)} ${t('線','chuyền')}</b><small>${groups.filter(g=>g.line===line).length} ${t('個類別','nhóm')}</small></header><div>${groups.filter(g=>g.line===line).map(g=>`<article><button class="master-category-filter" data-category-pick="${h(g.name)}" data-category-line="${h(line)}"><span>${val(g.name)}</span><small>${catalog.products.filter(p=>p.line===line&&p.category===g.name).length} ${t('產品','sản phẩm')}</small></button>${editable()?`${small('✎',`data-category-edit="${h(g.name)}" data-category-line="${h(line)}" aria-label="${t('修改類別','Sửa nhóm')} ${h(g.name)}"`)}${canDelete()?small('×',`data-category-delete="${h(g.name)}" data-category-line="${h(line)}" aria-label="${t('刪除類別','Xóa nhóm')} ${h(g.name)}"`):''}`:''}</article>`).join('')||`<p>${t('尚未建立類別','Chưa có nhóm')}</p>`}</div></section>`).join('')}</div></section>`;
    }
    function lineExcelToolbar(){return '';}
    function lineEditor() {
      const lines = current()?.lines || [];
      return `<details class="master-line-editor" ${ui.linesOpen?'open':''}><summary>${t('線別與工段管理','Quản lý chuyền và công đoạn')} · ${lines.length}</summary><div class="master-lines-toolbar">${t('在既有線別中管理工段；新增、修改需先建立草稿。','Quản lý công đoạn trong chuyền hiện có; tạo bản nháp để thêm hoặc sửa.')}</div>${editable()&&deletionNote()?`<p class="master-permission-note">${deletionNote()}</p>`:''}${lines.map(line=>`<section class="master-line-block"><div class="master-line-head"><b>${h(line.code)} · ${val(line.name)}</b><div>${editable()?`${small(t('修改','Sửa'),`data-line-edit="${h(line.code)}"`)}${canCreate()?small(t('＋ 新增工段','＋ Thêm công đoạn'),`data-stage-add="${h(line.code)}"`):''}${canDelete()?small(t('刪除線別','Xóa chuyền'),`data-line-delete="${h(line.code)}"`):''}`:''}</div></div><div class="master-stage-grid">${line.stages.map(stage=>`<article class="master-stage-card"><span><code>${h(stage.code)}</code><b>${val(stage.name)}</b></span>${editable()?`<div>${small(t('修改','Sửa'),`data-stage-edit="${h(stage.code)}" data-parent-line="${h(line.code)}"`)}${canDelete()?small('×',`data-stage-delete="${h(stage.code)}" data-parent-line="${h(line.code)}" aria-label="${t('刪除工段','Xóa công đoạn')}"`):''}</div>`:''}</article>`).join('')||`<p>${t('尚無工段，請新增。','Chưa có công đoạn, hãy thêm mới.')}</p>`}</div></section>`).join('')||`<p class="master-empty">${t('尚無線別資料','Chưa có dữ liệu chuyền')}</p>`}</details>`;
    }
    function filtered() {const q=ui.search.trim().toLocaleLowerCase();return current().products.filter(p=>(!ui.line||p.line===ui.line)&&(!ui.category||p.category===ui.category)&&(!q||Object.values(p).flat().join(' ').toLocaleLowerCase().includes(q)));}
    function productRows() {const bad=new Set((state.masterValidationErrors||[]).map(e=>e.code));const products=filtered();ui.page=Math.min(ui.page,Math.max(0,Math.ceil(products.length/40)-1));return products.slice(ui.page*40,(ui.page+1)*40).map(p=>`<tr class="${bad.has(p.code)?'master-invalid-row':''}"><td>${val(p.category)}</td><td><code>${h(p.code)}</code></td><td>${val(p.name)}</td><td>${val(p.specification)}</td><td>${val(p.unit)}</td><td><span class="master-line-tag">${val(p.line)}</span></td><td>${productRouteSummary(p)}<div class="master-row-actions">${editable()?`${small(t('修改','Sửa'),`data-product-edit="${h(p.code)}"`)}${canDelete()?small(t('刪除','Xóa'),`data-product-delete="${h(p.code)}"`):''}`:''}</div></td></tr>`).join('')||`<tr><td colspan="7">${t('沒有符合的產品','Không có sản phẩm phù hợp')}</td></tr>`;}
    function pagination(){const count=filtered().length,pages=Math.max(1,Math.ceil(count/40));return `<nav class="master-pagination" aria-label="${t('產品分頁','Trang sản phẩm')}">${small(t('上一頁','Trước'),`data-product-page="${ui.page-1}" ${ui.page===0?'disabled':''}`)}<span>${ui.page+1} / ${pages} · ${t('每頁 40 筆','40 sản phẩm / trang')}</span>${small(t('下一頁','Tiếp'),`data-product-page="${ui.page+1}" ${ui.page+1>=pages?'disabled':''}`)}</nav>`;}
    function masterView() {
      if(ui.scope!==state.masterScope){ui.scope=state.masterScope;ui.line='';ui.category='';ui.search='';}
      if(state.masterSection==='lines'){
        ui.line='';ui.category='';
        return `<div class="master-shell master-organized" data-i18n-skip="true">${versionBar()}${deletionAccess()}<label class="master-lines-scope">${t('管理範圍','Phạm vi quản lý')}<select id="master-lines-scope">${options([{value:'AB',label:t('A B 產線','Chuyền A B')},{value:'C',label:t('C 產線','Chuyền C')}],state.masterScope)}</select></label><details class="master-lines-rules"><summary>${t('保存、權限與刪除規則','Quy tắc lưu, quyền và xóa')}</summary><p>${t('套用只同步共用草稿；儲存草稿才建立送審快照；核准後才更新正式資料。送審涵蓋目前 AB 或 C 的整份已保存內容，不因畫面篩選縮小。','Áp dụng chỉ đồng bộ bản nháp; Lưu tạo bản gửi duyệt; phê duyệt mới cập nhật dữ liệu hiệu lực. Hồ sơ gồm toàn bộ bản AB hoặc C đã lưu, không giới hạn theo bộ lọc.')}</p><p>${t('線別頁入口使用「線別與工段管理」查看權限；新增、修改、刪除、保存及審核依目前 AB／C 範圍權限。','Quyền xem Chuyền và công đoạn mở trang; thêm, sửa, xóa, lưu và duyệt dùng quyền của phạm vi AB/C hiện tại.')}</p><p>${t('線別有子工段不能刪除。工段仍被生效路線、共用草稿、已保存草稿、待審案件或保留流程引用時，後端會再次阻擋。歷史核准版本保留唯讀，不因僅存在舊歷史就一律禁止刪除；歷史還原仍需重新檢查引用與權限。','Không xóa chuyền còn công đoạn. Tuyến hiệu lực, bản nháp, bản đã lưu, hồ sơ chờ duyệt và quy trình còn tham chiếu được kiểm tra lại trước khi xóa. Lịch sử cũ vẫn chỉ đọc, không tự chặn mọi thao tác xóa; khôi phục vẫn kiểm tra quyền và tham chiếu.')}</p></details>${lineExcelToolbar()}${lineEditor()}</div>`;
      }
      const catalog=current(),cats=categoryEntries(catalog).filter(g=>!ui.line||g.line===ui.line);
      if(ui.category&&!cats.some(g=>g.name===ui.category))ui.category='';
      return `<div class="master-shell master-organized" data-i18n-skip="true">${versionBar()}${deletionAccess()}<section class="master-toolbar"><label>${t('線別','Chuyền')}<select id="master-line-filter">${options([{value:'',label:t('全部線別','Tất cả chuyền')},...catalog.lines.map(l=>({value:l.code,label:`${l.code} · ${l.name}`}))],ui.line)}</select></label><label>${t('產品類別','Nhóm sản phẩm')}<select id="master-category-filter">${options([{value:'',label:t('全部類別','Tất cả nhóm')},...new Set(cats.map(g=>g.name))],ui.category)}</select></label><label>${t('搜尋產品','Tìm sản phẩm')}<input type="search" id="master-product-search" value="${h(ui.search)}" placeholder="${t('編號或名稱','Mã hoặc tên')}"></label></section>${categoryBox()}${groupRoutePanel()}<div class="master-products-heading"><h3>${t('產品清單','Danh sách sản phẩm')}</h3><div class="master-products-actions">${editable()?small(t('＋ 新增產品','＋ Thêm sản phẩm'),'id="master-add-product"'):''}<span id="master-result-count">${filtered().length} / ${catalog.products.length}</span></div></div><div class="master-table-wrap"><table class="master-table"><thead><tr>${[t('類別','Nhóm'),t('產品編號','Mã sản phẩm'),t('名稱','Tên'),t('規格','Quy cách'),t('單位','Đơn vị'),t('線別','Chuyền'),t('操作','Thao tác')].map(s=>`<th>${s}</th>`).join('')}</tr></thead><tbody>${productRows()}</tbody></table></div><div id="master-product-pagination">${pagination()}</div></div>`;
    }
    function bindRows() {
      document.querySelectorAll('[data-product-page]').forEach(b=>b.onclick=()=>{ui.page=Number(b.dataset.productPage);redraw();document.querySelector('.master-products-heading')?.scrollIntoView({block:'start'});});

      document.querySelectorAll('[data-product-edit]').forEach(b=>b.onclick=()=>editProduct(current().products.find(p=>p.code===b.dataset.productEdit)));
      document.querySelectorAll('[data-product-delete]').forEach(b=>b.onclick=async()=>{
        if(!canDelete()){toast(deletionNote());return;}
        const product=current().products.find(p=>p.code===b.dataset.productDelete),impact=deletionImpact({products:product?[product]:[b.dataset.productDelete]});
        if(!confirm(`${t(`刪除產品 ${b.dataset.productDelete}？`,`Xóa sản phẩm ${b.dataset.productDelete}?`)}\n\n${impact.message}\n\n${t('主管核准後才會套用移除，確定加入草稿？','Chỉ xóa sau khi quản lý duyệt. Thêm vào bản nháp?')}`))return;
        if(await commit('刪除產品',b.dataset.productDelete,c=>{c.products=c.products.filter(p=>p.code!==b.dataset.productDelete);selected().warnings.push(`刪除產品 ${b.dataset.productDelete}｜${impact.warning}`);}))redraw();
      });
    }
    function bindMaster() {
      shared.renderValidation(state.masterScope,{after:document.querySelector('#master-shared-status'),onLocate:issue=>{
        if(shared.permissions(state.masterScope)?.edit===false)return;
        const product=shared.flow(state.masterScope)?.working.products?.find(row=>row.id===issue.path?.[1]?.id);if(!product)return;
        ui.versions[state.masterScope]=draft()?.id;ui.line='';ui.category='';ui.search='';redraw();editProduct(current().products.find(row=>row.id===product.id));
      }});
      document.querySelector('#master-shared-history')?.addEventListener('click',()=>shared.history(state.masterScope).catch(e=>toast(e.message)));
      document.querySelector('#master-shared-recover')?.addEventListener('click',()=>shared.recover(state.masterScope).catch(e=>toast(e.message)));
      const on=(id,event,fn)=>document.querySelector(id)?.addEventListener(event,fn);
      const newDraftButton=document.querySelector('#master-new-draft');
      const allowed=shared.permissions(state.masterScope);
      if(newDraftButton&&allowed?.edit===false)newDraftButton.disabled=true;
      for(const [id,permission]of[['#master-save-draft','save'],['#master-submit','submit'],['#master-withdraw','withdraw'],['#master-shared-history','history']]){const button=document.querySelector(id);if(button&&allowed?.[permission]===false)button.disabled=true;}
      if(newDraftButton&&permitted('master.delete'))newDraftButton.textContent=t('開始修改／刪除資料','Bắt đầu sửa / xóa dữ liệu');
      on('#master-version-choice','change',e=>{ui.versions[state.masterScope]=e.target.value;ui.line='';ui.category='';state.masterValidationErrors=[];redraw();});
      document.querySelectorAll('[data-history-pick]').forEach(b=>b.onclick=async()=>{ui.versions[state.masterScope]=b.dataset.historyPick;ui.line='';ui.category='';state.masterValidationErrors=[];redraw();});
      on('#master-return-draft','click',()=>{ui.versions[state.masterScope]=draft()?.id;redraw();});
      on('#master-new-draft','click',()=>{delete ui.versions[state.masterScope];beginDraft();});
      on('#master-save-draft','click',saveDraft);on('#master-submit','click',submitDraft);
      on('#master-view-review','click',()=>host.MasterReview.open(state.masterScope,selected()?.id));
      on('#master-lines-scope','change',async e=>{
        const input=e.target,previous=state.masterScope,next=input.value,identity=window.ProcessSync?.identity,
          actorId=identity?.id,epoch=window.ProcessSync?.identityGeneration?.();
        if(window.MasterDataWorkflow?.canLeave?.()===false){input.value=previous;return;}
        input.disabled=true;
        const ownsView=()=>input.isConnected&&state.view==='data'&&state.masterSection==='lines'&&state.masterScope===previous
          &&window.ProcessSync?.identity===identity&&window.ProcessSync?.identity?.id===actorId&&window.ProcessSync?.identityGeneration?.()===epoch
          &&window.MasterDataWorkflow?.canLeave?.()!==false&&!document.querySelector('#master-edit-dialog[open]');
        try{await (window.MasterDataWorkflow?.loadScope?window.MasterDataWorkflow.loadScope(next):shared.load(next));if(!ownsView())return;state.masterScope=next;ui.line='';ui.category='';redraw();}
        catch(error){if(ownsView()){input.value=previous;toast(displayDraftError(error));}}
        finally{if(input.isConnected){input.disabled=false;if(state.masterScope===previous)input.value=previous;}}
      });
      on('#master-line-export','click',()=>{if(!permitted('master.export')){toast(t('此帳號沒有匯出權限。','Tài khoản này không có quyền xuất.'));return;}LineStageExcel.exportFile(current().lines,state.masterScope);toast(t('線別與工段 Excel 匯出成功','Xuất Excel chuyền và công đoạn thành công'));});
      on('#master-line-import','click',()=>{if(!permitted('master.import')){toast(t('此帳號沒有匯入權限。','Tài khoản này không có quyền nhập.'));return;}if(!editable()){toast(t('請先建立新版本草稿再匯入','Hãy tạo bản nháp mới trước khi nhập'));return;}document.querySelector('#master-line-import-file').click();});
      on('#master-line-import-file','change',async event=>{const file=event.target.files?.[0];if(!file)return;try{const imported=await LineStageExcel.readFile(file);if(!imported.length)throw new Error('empty');if(imported.complete&&imported.scope&&imported.scope!==state.masterScope)throw new Error('scope');const catalog=editable();if(imported.complete){const owners=new Map(imported.flatMap(line=>line.stages.map(stage=>[stage.code,line.code]))),lineCodes=new Set(imported.map(line=>line.code)),invalid=catalog.products.filter(product=>!lineCodes.has(product.line)||product.stages.some(stage=>owners.get(stage)!==product.line));if(invalid.length)throw new Error(`route:${invalid.slice(0,8).map(product=>product.code).join(', ')}`);}const message=imported.complete?t(`找到 ${imported.length} 條線別。這是完整匯出檔，確認後會取代目前所選範圍。`,`Tìm thấy ${imported.length} chuyền. Đây là tệp đầy đủ và sẽ thay phạm vi hiện tại.`):t(`找到 ${imported.length} 條線別。這是舊格式，只會新增或更新檔案內資料。`,`Tìm thấy ${imported.length} chuyền. Đây là định dạng cũ, chỉ thêm hoặc cập nhật dữ liệu trong tệp.`);if(!confirm(message))return;if(imported.complete)LineStageExcel.replace(catalog,imported);else LineStageExcel.merge(catalog,imported);record(draft(),'匯入線別與工段 Excel',`${file.name} · ${imported.length} 條線別 · ${imported.complete?'完整取代':'相容匯入'}`);persist();toast(t('線別與工段匯入成功','Nhập chuyền và công đoạn thành công'));redraw();}catch(error){console.warn(error);toast(error.message?.startsWith('route:')?t(`無法完整取代：產品路線仍使用檔案未包含的線別或工段（${error.message.slice(6)}）。`,`Không thể thay toàn bộ: tuyến sản phẩm vẫn dùng chuyền hoặc công đoạn không có trong tệp (${error.message.slice(6)}).`):t('無法匯入：請確認格式、範圍及線別／工段欄位','Không thể nhập: kiểm tra định dạng, phạm vi và các cột chuyền / công đoạn'));}finally{event.target.value='';}});
      document.querySelectorAll('[data-fix-master]').forEach(b=>b.onclick=()=>editProduct(current().products[Number(b.dataset.fixMaster)]));
      on('#master-withdraw','click',async()=>{const item=selected();if(item?.status!=='pending')return;try{await shared.review(item.scope,'withdraw',item.id);redraw();}catch(error){toast(displayDraftError(error));}});
      for(const b of document.querySelectorAll('[data-group-route-view],[data-group-route-edit],[data-group-route-remove],[data-group-route-maximum]'))b.onclick=()=>{const line=b.dataset.routeLine;if(b.hasAttribute('data-group-route-maximum'))void adoptMaximumRoute(line,b.dataset.groupRouteMaximum);else if(b.hasAttribute('data-group-route-remove'))void removeGroupRoute(line,b.dataset.groupRouteRemove);else editGroupRoute(line,b.dataset.groupRouteView||b.dataset.groupRouteEdit,b.hasAttribute('data-group-route-view'));};
      on('#master-line-filter','change',e=>{ui.line=e.target.value;ui.category='';ui.page=0;redraw();});
      on('#master-category-filter','change',e=>{ui.category=e.target.value;ui.page=0;redraw();});
      on('#master-product-search','input',e=>{ui.search=e.target.value;ui.page=0;document.querySelector('.master-table tbody').innerHTML=productRows();document.querySelector('#master-result-count').textContent=`${filtered().length} / ${current().products.length}`;document.querySelector('#master-product-pagination').innerHTML=pagination();bindRows();});
      on('#master-add-product','click',()=>editProduct());on('#add-master-category','click',()=>editCategory());
      document.querySelectorAll('[data-category-pick]').forEach(b=>b.onclick=async()=>{ui.line=b.dataset.categoryLine;ui.category=b.dataset.categoryPick;ui.page=0;redraw();document.querySelector('.master-group-route')?.scrollIntoView({block:'nearest'});});
      document.querySelectorAll('[data-category-edit]').forEach(b=>b.onclick=()=>editCategory(categoryEntries(current()).find(g=>g.line===b.dataset.categoryLine&&g.name===b.dataset.categoryEdit)));
      document.querySelectorAll('[data-category-delete]').forEach(b=>b.onclick=()=>removeCategory({line:b.dataset.categoryLine,name:b.dataset.categoryDelete}));
      on('.master-line-editor','toggle',e=>ui.linesOpen=e.target.open);
      document.querySelectorAll('[data-line-edit]').forEach(b=>b.onclick=()=>editLine(current().lines.find(l=>l.code===b.dataset.lineEdit)));
      document.querySelectorAll('[data-stage-add]').forEach(b=>b.onclick=()=>editStage(current().lines.find(l=>l.code===b.dataset.stageAdd)));
      document.querySelectorAll('[data-stage-edit]').forEach(b=>b.onclick=async()=>{const l=current().lines.find(l=>l.code===b.dataset.parentLine);editStage(l,l.stages.find(s=>s.code===b.dataset.stageEdit));});
      document.querySelectorAll('[data-line-delete],[data-stage-delete]').forEach(b=>b.onclick=async()=>{
        if(!canDelete()){toast(deletionNote());return;}
        const lineCode=b.dataset.lineDelete,stageCode=b.dataset.stageDelete,code=lineCode||stageCode;
        const products=current().products.filter(p=>lineCode?p.line===lineCode:p.stages.includes(stageCode)),affected=products.length,stages=lineCode?(current().lines.find(l=>l.code===lineCode)?.stages||[]).map(s=>s.code):[stageCode],impact=deletionImpact({products,stages});
        if(lineCode&&stages.length){window.alert(t('線別仍有子工段，請先逐一檢查並移除工段。','Chuyền còn công đoạn con; hãy kiểm tra và xóa từng công đoạn trước.')+'\n'+stages.join('、'));return;}
        if(impact.blocked||lineCode&&categoryEntries(current()).some(g=>g.line===lineCode)){window.alert(t('仍有產品路線、正式作業、草稿或類別引用，禁止刪除。','Còn tuyến sản phẩm, thao tác chính thức, bản nháp hoặc nhóm đang tham chiếu. Không được xóa.')+'\n\n'+impact.message);return;}
        if(!confirm(`${t(`刪除 ${code}？`,`Xóa ${code}?`)}\n\n${impact.message}\n\n${t('變更先加入草稿；核准時依既有規則連動流程範本，不會自動解除引用。','Thay đổi vào bản nháp; khi duyệt sẽ đồng bộ mẫu theo quy tắc hiện có, không tự gỡ tham chiếu.')}`))return;
        if(await commit(lineCode?'刪除線別':'刪除工段',code,c=>{
          if(lineCode){c.lines=c.lines.filter(l=>l.code!==lineCode);ui.line='';}
          else c.lines.forEach(l=>l.stages=l.stages.filter(s=>s.code!==stageCode));
          selected().warnings.push(`刪除 ${code}（影響 ${affected} 筆產品）｜${impact.warning}`);
        }))redraw();
      });
      on('#master-import','click',()=>{if(!permitted('master.import')){toast(t('此帳號沒有匯入權限。','Tài khoản này không có quyền nhập.'));return;}if(!editable()){toast(t('請先建立或切回草稿。','Hãy tạo hoặc mở bản nháp.'));return;}document.querySelector('#master-import-file').click();});
      on('#master-import-file','change',event=>{if(permitted('master.import'))importExcel(event);else event.target.value='';});on('#master-export','click',()=>{if(permitted('master.export'))exportExcel();else toast(t('此帳號沒有匯出權限。','Tài khoản này không có quyền xuất.'));});bindRows();
      window.VersionDraftUI?.mount(document.querySelector('.master-organized'),{header:'.master-version-bar',historyClient:()=>shared.client(state.masterScope),module:state.masterSection==='lines'?t('線別與工段','Chuyền và công đoạn'):state.masterScope+t(' 產線與類別',' · Chuyền và nhóm'),scope:state.masterScope,version:selected(),versions:versions(),active:versions().find(v=>v.status==='approved'),flow:shared.flow(state.masterScope),actions:{begin:'#master-new-draft',back:'#master-return-draft',save:'#master-save-draft',submit:'#master-submit',review:'#master-view-review',withdraw:'#master-withdraw'},errors:'[data-shared-issue-kind="error"],.master-danger-list:has([data-fix-master])',missing:'[data-shared-issue-kind="missing"]',history:['.master-history','#master-shared-history','[data-shared-issue-kind="warning"]'],status:['#master-shared-status'],remove:['.master-delete-access','.master-danger-list:not(:has([data-fix-master]))']});
    }
    let language=document.documentElement.lang;
    new MutationObserver(()=>{if(language!==document.documentElement.lang){language=document.documentElement.lang;if(document.querySelector('.master-organized')&&!document.querySelector('#master-edit-dialog'))redraw();}}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    return {preserveView,redraw,showVersion:(scope,id)=>{state.masterScope=scope;state.masterSection="products";ui.versions[scope]=id;state.view="data";render();},current,editable,masterView,bindMaster,productRows,syncRows:()=>{},categories:(catalog=current())=>[...new Set(categoryEntries(catalog).map(g=>g.name))]};
  }
  host.MasterAdminUI={install,categoryEntries,validProduct,groupRoute,setGroupRoute,maximumRoute};
})(typeof window==='undefined'?globalThis:window);

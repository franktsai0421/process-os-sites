(function (host) {
  'use strict';
  const words = {
    historyGuide:['歷史紀錄','Lịch sử dữ liệu'], viewVersions:['查看版本（唯讀）','Xem phiên bản (chỉ đọc)'], saveRecords:['儲存紀錄（唯讀）','Lịch sử lưu (chỉ đọc)'],
    wholeScope:['儲存／送審範圍','Phạm vi lưu / gửi duyệt'], abScope:['整個 AB（A、B 線）','Toàn bộ AB (chuyền A, B)'], cScope:['整個 C（C 線）','Toàn bộ C (chuyền C)'],
    scopeReminder:['篩選只影響顯示，其他類別與分頁的修改也包含在內。','Bộ lọc chỉ đổi phần hiển thị; thay đổi ở nhóm và trang khác cũng được bao gồm.'],
    draftSynced:['已同步到共用草稿','Đã đồng bộ vào bản nháp chung'], draftUnsaved:['尚未儲存，請儲存後送審','Chưa lưu; hãy lưu trước khi gửi duyệt'],
    historyHelp:['查看版本與儲存紀錄為唯讀。需要取回舊內容時，開啟送審案件並預覽還原到草稿。','Xem phiên bản và lịch sử lưu chỉ để đọc. Muốn lấy lại nội dung cũ, mở hồ sơ và xem trước khôi phục vào bản nháp.'],
    unchanged:['尚無變更','Chưa có thay đổi'], recover:['查詢操作結果','Kiểm tra kết quả thao tác'], menu:['版本／草稿','Phiên bản / bản nháp'], active:['目前正式版本','Phiên bản có hiệu lực'], savedBy:['最後儲存者與時間','Người lưu cuối và thời gian'], unknown:['未記錄','Chưa ghi nhận'],
    begin:['開始修改草稿','Bắt đầu sửa bản nháp'], back:['返回共用草稿','Trở lại bản nháp chung'], save:['儲存草稿','Lưu bản nháp'], submit:['送出審核','Gửi duyệt'], withdraw:['撤回草稿','Rút bản nháp'], withdrawSubmitted:['撤回送審','Rút hồ sơ'], review:['查看送審案件','Xem hồ sơ gửi duyệt'],
    withdrawn:['已撤回','Đã rút'],returned:['已發回','Đã trả lại'],'pending-test':['待審','Chờ duyệt'],draft:['編輯中','Đang chỉnh sửa'], pending:['待審','Chờ duyệt'], approved:['正式版本','Bản có hiệu lực'], superseded:['歷史唯讀','Lịch sử · chỉ đọc'], history:['操作紀錄','Lịch sử thao tác'],
    errors:['報錯','Lỗi'], missing:['待補資料','Dữ liệu cần bổ sung'], unchecked:['尚未檢查','Chưa kiểm tra'], working:['目前工作內容','Nội dung đang làm'], snapshot:['已儲存快照','Bản chụp đã lưu'],
    localOnly:['有本機未共享內容；共用已存版本不變','Có nội dung cục bộ chưa chia sẻ; bản chung đã lưu không đổi'],
    sync:['同步','Đồng bộ'], synced:['已同步','Đã đồng bộ'], syncing:['處理中','Đang xử lý'], failed:['結果未知／同步失敗','Kết quả chưa rõ / lỗi đồng bộ'], rejected:['請求未儲存','Yêu cầu chưa được lưu'], saveState:['儲存','Lưu'], saved:['已儲存','Đã lưu'], unsaved:['尚未儲存','Chưa lưu'], legacy:['舊版案件','Hồ sơ cũ'],
    submitter:['送審者與時間','Người gửi và thời gian'], scope:['共用草稿範圍','Phạm vi bản nháp chung'], filters:['篩選不縮小儲存與送審範圍','Bộ lọc không thu hẹp phạm vi lưu và gửi duyệt'],
    cancel:['取消','Hủy'], apply:['套用至草稿','Áp dụng vào bản nháp'], reason:['整體變更理由（必填）','Lý do thay đổi tổng thể (bắt buộc)'], confirm:['送出下列已儲存版本；確認期間若有人修改共用草稿，會停止送審並請你重新確認。送審後整個範圍暫停修改。','Gửi phiên bản đã lưu bên dưới; nếu bản nháp chung thay đổi trong lúc xác nhận, cần kiểm tra và xác nhận lại. Toàn bộ phạm vi bị khóa sau khi gửi.'],
    prev:['上一頁','Trang trước'], next:['下一頁','Trang sau'], none:['尚無紀錄','Chưa có lịch sử'], locked:['待審鎖定、權限不足或尚未成功儲存；請核對目前狀態。','Đang khóa chờ duyệt, thiếu quyền hoặc chưa lưu thành công; hãy kiểm tra trạng thái.'], allFQC:['FQC 全庫','Toàn bộ FQC'],allIQC:['IQC 全庫','Toàn bộ IQC'],allC:['IPQC-C 全庫','Toàn bộ IPQC-C'],allEquipment:['檢具全庫','Toàn bộ thiết bị'],allProcess:['整個製程平台','Toàn bộ nền tảng quy trình'],editor:['製程編輯台','Trình chỉnh sửa quy trình'],equipment:['檢具與測試設備','Dưỡng kiểm và thiết bị đo'],lines:['線別與工段','Chuyền và công đoạn'],process:['PROCESS 流程資料','Dữ liệu quy trình PROCESS']
  };
  const t=key=>words[key]?.[document.documentElement.lang==='vi'?1:0]||key;
  const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>value&&!Number.isNaN(Date.parse(value))?new Intl.DateTimeFormat(document.documentElement.lang==='vi'?'vi-VN':'zh-TW',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):t('unknown');
  const savedStamp=(name,at)=>!name&&!at?t('unknown'):(name||t('unknown'))+' · '+date(at);
  const number=v=>v?String(v.number).replace(/^V?/,'V'):'—';
  const create=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function decorateIssues(shell){
    for(const section of shell.querySelectorAll('.vd-issues'))for(const node of section.children){
      if(node.matches('h3,.vd-source,.vd-empty,.vd-unchecked'))continue;
      const details=node.matches('details')?node:node.querySelector('details'),summary=details?.querySelector(':scope > summary');if(!summary)continue;
      const title=node!==details?node.querySelector(':scope > h3,:scope > h4,:scope > strong,:scope > b'):null;
      const original=title?.textContent||summary.textContent,match=original.match(/[·・：:]\s*(\d+)/);if(match)node.dataset.issueCount=match[1];
      if(title){summary.textContent=original;title.remove();}
      if(!node.dataset.authoringIssueKind&&!node.dataset.sharedIssueKind&&!summary.dataset.vdSource){const prefix=node.dataset.vdSource==='snapshot'?t('snapshot'):t('working');summary.textContent=prefix+' · '+summary.textContent.replace(/⚠️?\s*/g,'');summary.dataset.vdSource='true';}
    }
  }
  function historyPages(details){
    for(const group of details.querySelectorAll('ol,ul,.vd-log-group > div,:scope > div')){
      const rows=[...group.children];if(rows.length<=8)continue;let page=0;const nav=create('nav','vd-pages'),prev=create('button','button ghost',t('prev')),label=create('span',''),next=create('button','button ghost',t('next'));
      const paint=()=>{rows.forEach((row,i)=>row.hidden=i<page*8||i>=(page+1)*8);prev.disabled=page===0;next.disabled=(page+1)*8>=rows.length;label.textContent=`${page+1} / ${Math.ceil(rows.length/8)}`;};prev.type=next.type='button';prev.onclick=()=>{page--;paint();};next.onclick=()=>{page++;paint();};nav.append(prev,label,next);group.after(nav);paint();
    }
  }
  async function historyMetadata(shell,model,select,log,empty){
    const client=model.historyClient?.();if(!client?.uiHistory||client.permission('history')===false)return;
    empty?.remove();
    const known=new Map(),sections={},pages={},cursors={versions:[''],saves:['']};let loading=false;
    const updateControls=()=>{for(const section of Object.values(sections))for(const button of section.querySelectorAll('button'))button.disabled=loading||button.dataset.historyUnavailable==='true';};
    const view=async row=>{try{const options={client,masterScope:model.masterScope,editable:()=>false,onApplied:async()=>{}};if(row.caseId)options.caseId=row.caseId;else options.versionPreview=(await client.version(row.id)).version;await host.openSharedDraftHistory(options);}catch(error){notice.textContent=t('history')+' · '+error.message;}};
    const notice=create('p','vd-history-load',t('history')+' · '+t('syncing'));log.append(notice);
    for(const kind of ['versions','saves']){sections[kind]=create('section','vd-history-page');log.append(sections[kind]);}
    const paint=(kind,data)=>{pages[kind]=data;const section=sections[kind],rows=create('ol',''),nav=create('nav','vd-pages'),prev=create('button','button ghost',t('prev')),next=create('button','button ghost',t('next'));section.replaceChildren(create('h4','',kind==='saves'?t(model.masterScope?'saveRecords':'save'):t(model.masterScope?'viewVersions':'menu')),rows);
      for(const row of data.rows){const li=create('li','');if(kind==='saves')li.textContent=`${t('saved')} · ${row.actor?.name||t('unknown')} · ${date(row.at)}${row.reason?' · '+row.reason:''}${row.source?' · '+row.source:''}`;else{known.set(row.id,row);const button=create('button','button ghost',`${number(row)} · ${t(row.status)} · ${date(row.createdAt)}`);button.type='button';button.onclick=()=>void view(row);li.append(button);if(select&&!model.masterScope&&![...select.options].some(o=>o.value===row.id||o.value==='history:'+row.id)){let group=select.querySelector('[data-vd-history]');if(!group){group=document.createElement('optgroup');group.dataset.vdHistory='true';group.label=t('history');select.append(group);}const option=document.createElement('option');option.value='history:'+row.id;option.textContent=`${number(row)} · ${t(row.status)}`;group.append(option);}}rows.append(li);}
      if(!data.rows.length)rows.append(create('li','',t('none')));prev.type=next.type='button';prev.dataset.historyUnavailable=String(cursors[kind].length===1);next.dataset.historyUnavailable=String(!data.next);
      prev.onclick=()=>{if(!loading)void load(kind,cursors[kind].slice(0,-1));};next.onclick=()=>{if(!loading)void load(kind,[...cursors[kind],data.next]);};nav.append(prev,create('span','',`${cursors[kind].length} / ${Math.max(1,Math.ceil(data.total/20))}`),next);section.append(nav);updateControls();
    };
    async function load(kind,nextCursors){if(loading)return;loading=true;updateControls();const requested={...cursors,...(kind?{[kind]:nextCursors}:{})};try{notice.textContent=t('history')+' · '+t('syncing');const data=await client.uiHistory({uiVersionId:model.version?.id||'',versionBefore:requested.versions.at(-1),saveBefore:requested.saves.at(-1)});if(!shell.isConnected)return;if(kind)cursors[kind]=requested[kind];for(const key of kind?[kind]:['versions','saves'])paint(key,data[key]);if(data.selectedSave&&!['draft','pending','pending-test'].includes(model.version?.status)){shell.querySelector('[data-vd-saver]').textContent=t('savedBy')+'：'+(data.selectedSave.actor?.name||t('unknown'))+' · '+date(data.selectedSave.at);shell.querySelector('[data-vd-saved]').textContent=t('saveState')+'：'+t('saved');}model.savedMetadata=data.selectedSave;notice.textContent='';shell.dataset.historyLoaded='true';}catch(error){notice.textContent=t('history')+' · '+t('failed')+' · '+error.message;}finally{loading=false;updateControls();}}
    select?.addEventListener('change',event=>{if(!select.value.startsWith('history:'))return;event.stopImmediatePropagation();const row=known.get(select.value.slice(8));select.value=model.version?.id||'';if(row)void view(row);},true);
    shell.refreshHistoryLabels=()=>{for(const [kind,data]of Object.entries(pages))paint(kind,data);const group=select?.querySelector('[data-vd-history]');if(group){group.label=t('history');for(const option of group.children){const row=known.get(option.value.slice(8));if(row)option.textContent=`${number(row)} · ${t(row.status)}`;}}};
    // Closed history is optional; opening a module must not fetch its archives.
    let started=false;
    const start=()=>{if(started)return;started=true;void load();};
    log.addEventListener('toggle',()=>{if(log.open)start();});
    if(!model.masterScope)select?.addEventListener('focus',start,{once:true});
    if(log.open)start();
  }
  // Explicit page adapters supply version data. Move existing controls (and their
  // listeners) rather than creating alternate write paths or replacing inputs.
  function mount(root,model){
    if(!root)return;const old=root.querySelector(model.header);if(!old||old.dataset.vdMounted)return;
    const v=model.version,flow=model.flow,versions=model.versions||[],pending=['pending','pending-test'].includes(v?.status),draft=versions.find(row=>row.status==='draft');
    const statusNodes=(model.status||[]).map(selector=>root.querySelector(selector)).filter(Boolean);
    const shell=create('section','vd-shell');shell.dataset.i18nSkip='true';shell.dataset.module=model.module;if(model.masterScope)shell.dataset.vdMasterScope=model.masterScope;const translations=[];const label=(node,key)=>{translations.push(()=>node.textContent=t(key));return node;};
    const heading=create('header','vd-heading');heading.innerHTML=`<h2>${h(model.module)}</h2><p><span class="vd-scope-help" title="${h(t('filters'))}">${t('scope')}：${h(model.scope)}</span></p>`;
    const card=create('section','vd-card'),top=create('div','vd-top'),title=create('h3','',`${number(v)} · ${t(v?.status||'unchecked')}`),choice=create('label','vd-choice');choice.append(label(create('span','',t('menu')),'menu'));translations.push(()=>title.textContent=`${number(v)} · ${t(v?.status||'unchecked')}`);
    const select=old.querySelector('select')||model.select?.();if(select){choice.append(select);if(model.masterScope)for(const option of Array.from(select.options)){const row=versions.find(item=>item.id===option.value);if(row&&row.id!==v?.id&&row.id!==model.active?.id&&!['draft','pending','pending-test'].includes(row.status))option.remove();}for(const option of select.options){const row=versions.find(item=>item.id===option.value);if(row)option.textContent=`${number(row)} · ${t(row.status)}`;}}
    top.append(title,choice);card.append(top);
    // Only an explicit save event or a saved snapshot establishes a saver.
    const saveEvent=[...(v?.history||[])].reverse().find(e=>['save','saved','draft_saved'].includes(e.action));
    const saved=flow&&['draft','pending','pending-test'].includes(v?.status)?flow.saved:null;
    const saver=saved?.actor?.name||saveEvent?.actorName||saveEvent?.actor||t('unknown'),at=saved?.at||saveEvent?.at;
    const meta=create('div','vd-meta');meta.innerHTML=`<span>${t('active')}：${number(model.active)}</span><span data-vd-saver>${t('savedBy')}：${h(savedStamp(saver===t('unknown')?null:saver,at))}</span><span data-vd-sync>${t('sync')}：${model.failed?t(model.rejected?'rejected':'failed'):model.busy?t('syncing'):model.localUnsaved?t('localOnly'):flow?t(model.masterScope?'draftSynced':'synced'):t('unknown')}</span><span data-vd-saved>${t('saveState')}：${flow&&v?.status==='draft'?(!model.localUnsaved&&JSON.stringify(saved?.content??flow.active?.content)===JSON.stringify(flow.working)?t(saved?'saved':'unchanged'):t(model.masterScope?'draftUnsaved':'unsaved')):saved||saveEvent?t('saved'):t('unknown')}</span>`;
    if(pending){const c=flow?.cases?.find(row=>row.id===v.id);meta.append(create('span','',`${t('submitter')}：${c?.actor?.name||v.submittedBy||t('unknown')} · ${date(c?.at||v.submittedAt)}`));if(!flow)meta.append(create('span','vd-legacy',t('legacy')));}
    card.append(meta);const actions=create('div','vd-actions');
    const used=new Set();for(const key of ['begin','back','save','submit','review','withdraw','recover']){
      if(['save','submit'].includes(key)&&v?.status!=='draft'&&!model.moduleActions)continue;
      let button=model.actions?.[key]?root.querySelector(model.actions[key]):null;
      if(key==='begin'&&(draft||pending)){if(button)button.remove();button=null;}
      if(key==='back'&&draft&&v?.id!==draft.id&&!pending&&!button&&select){button=create('button','button ghost');button.type='button';button.onclick=()=>{select.value=draft.id;select.dispatchEvent(new Event('change',{bubbles:true}));};}
      if(key==='review'&&pending&&!button&&model.review){button=create('button','button ghost');button.type='button';button.onclick=model.review;}
      if(!button||used.has(button))continue;used.add(button);const textKey=key==='withdraw'&&(model.flow?.pendingId||['IPQC-AB','IPQC-C'].includes(model.module))?'withdrawSubmitted':key;button.textContent=t(textKey);label(button,textKey);button.className='button '+(['begin','submit'].includes(key)?'signal':'ghost');if(button.disabled)button.title=button.title||t('locked');actions.append(button);
    }
    card.append(actions);
    if(model.masterScope){const note=create('p','vd-scope-notice');note.dataset.vdScopeNotice='true';const update=()=>note.textContent=t('wholeScope')+'：'+t(model.masterScope==='AB'?'abScope':'cScope')+'。'+t('scopeReminder');update();translations.push(update);card.append(note);}
    shell.append(heading,card);
    for(const kind of ['errors','missing']){
      const section=create('section','vd-issues vd-'+kind);section.append(label(create('h3','',t(kind)),kind));
      const nodes=model[kind]?[...root.querySelectorAll(model[kind])]:[];
      if(nodes.length){for(const node of nodes){const label=create('div','vd-source',node.matches('[data-shared-issue-kind],[data-vd-source="snapshot"]')?t('snapshot'):t('working'));section.append(label,node);}}
      else {const empty=create('span','vd-empty',`${t('working')}：${model.checked?.[kind]?'0':t('unchecked')} · ${t('snapshot')}：${t('unchecked')}`);translations.push(()=>empty.textContent=`${t('working')}：${model.checked?.[kind]?'0':t('unchecked')} · ${t('snapshot')}：${t('unchecked')}`);section.append(empty);}
      shell.append(section);
    }
    const log=create('details','vd-history');log.append(label(create('summary','',t(model.masterScope?'historyGuide':'history')),model.masterScope?'historyGuide':'history'));if(model.masterScope)log.append(label(create('p','vd-history-guide',t('historyHelp')),'historyHelp'));
    for(const selector of model.history||[]){for(const node of root.querySelectorAll(selector)){if(used.has(node))continue;if(node.tagName==='DETAILS'){if(model.masterScope&&model.historyClient&&node.matches('.master-history'))node.querySelector(':scope > div')?.remove();node.querySelector(':scope > summary')?.remove();const group=create('div','vd-log-group');while(node.firstChild)group.append(node.firstChild);node.remove();log.append(group);}else log.append(node);}}
    for(const button of log.querySelectorAll('[data-process-master-history]')){const row=versions.find(v=>v.id===button.dataset.processMasterHistory),title=button.querySelector('b');if(row&&title){const refresh=()=>title.textContent=number(row)+' · '+t(row.status);translations.push(refresh);refresh();}}
    // Keep all legacy records and deletion impact details, tied to this version.
    if(v?.warnings?.length){const detail=create('details','vd-advisory');detail.append(create('summary','',`${number(v)} · ${document.documentElement.lang==='vi'?'Ảnh hưởng thao tác xóa':'刪除操作影響'}`));for(const warning of v.warnings)detail.append(create('p','',warning));log.append(detail);}
    if(!model.historyClient&&flow?.saves?.length){const saves=create('ol','vd-saves');for(const save of [...flow.saves].reverse())saves.append(create('li','',`${t('saved')} · ${save.actor?.name||t('unknown')} · ${date(save.at)} · ${save.id}`));log.append(saves);}
    const empty=log.children.length===1?create('p','vd-history-empty',t('none')):null;if(empty)log.append(empty);historyPages(log);shell.append(log);
    old.before(shell);old.remove();
    for(const node of statusNodes){const buttons=[...node.querySelectorAll('button')];if(buttons.length){const group=create('div','vd-secondary');group.append(...buttons);log.append(group);}node.replaceChildren();node.className='vd-live';card.append(node);}
    for(const selector of model.remove||[])root.querySelectorAll(selector).forEach(node=>node.remove());
    root.querySelectorAll('.shared-validation,.master-version-bar').forEach(node=>{if(!node.children.length&&!node.textContent.trim())node.remove();});
    if(model.failed&&!shell.querySelector('.vd-errors details')){const detail=create('details','has-issues'),summary=create('summary','',t(model.rejected?'rejected':'failed'));detail.append(summary,create('p','',t('locked')));shell.querySelector('.vd-errors').replaceChildren(label(create('h3','',t('errors')),'errors'),detail);}
    decorateIssues(shell);shell.dataset.vdMounted='true';void historyMetadata(shell,model,select,log,empty);let priorLanguage=document.documentElement.lang;
    shell.refreshLabels=()=>{const lang=document.documentElement.lang;if(lang===priorLanguage)return;const before=priorLanguage==='vi'?1:0,after=lang==='vi'?1:0;for(const area of [heading,meta]){const walker=document.createTreeWalker(area,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode())){for(const pair of Object.values(words))node.nodeValue=node.nodeValue.split(pair[before]).join(pair[after]);}}for(const refresh of translations)refresh();for(const option of select?.options||[]){const row=versions.find(item=>item.id===option.value);if(row)option.textContent=`${number(row)} · ${t(row.status)}`;}const recorded=saved||model.savedMetadata;const saverNode=meta.querySelector('[data-vd-saver]');if(saverNode)saverNode.textContent=t('savedBy')+'：'+savedStamp(recorded?.actor?.name||saveEvent?.actorName||saveEvent?.actor,recorded?.at||saveEvent?.at);shell.refreshHistoryLabels?.();priorLanguage=lang;};return shell;
  }
  const issueWords={NO_SUBSTANTIVE_CHANGE:['內容與正式版相同；交由審核者確認','Nội dung giống bản có hiệu lực; người duyệt xác nhận'],IPQC_UNASSIGNED:['IPQC 項目尚未分配','Hạng mục IPQC chưa được phân công'],IPQC_REFERENCE_CHANGED:['IPQC 來源或產品關聯已變更','Nguồn hoặc sản phẩm IPQC đã thay đổi'],IPQC_SOURCE_NOT_APPROVED:['IPQC 來源尚未核准','Nguồn IPQC chưa được duyệt'],PRODUCT_MISSING:['產品主資料不存在','Thiếu dữ liệu gốc sản phẩm'],NAME_REQUIRED:['流程名稱待補','Thiếu tên quy trình'],MACHINE_REQUIRED:['設備待選擇','Chưa chọn thiết bị'],INSTRUCTIONS_REQUIRED:['操作說明待補','Thiếu hướng dẫn thao tác'],STEP_STANDARD_REQUIRED:['步驟標準待補','Thiếu tiêu chuẩn bước'],SINGLE_SUCCESSOR_REQUIRED:['後續流程超過一個','Có nhiều hơn một bước tiếp theo'],CONNECTION_TARGET_MISSING:['連線目標不存在','Đích kết nối không tồn tại'],DISCONNECTED_OPERATIONS:['流程尚未連通','Các bước chưa kết nối'],PRODUCT_ROUTE_CHANGED:['產品路線已變更','Tuyến sản phẩm đã thay đổi'],PRODUCT_STAGE_REQUIRED:['產品缺少工段流程','Thiếu bước tại công đoạn'],BOM_ASSIGNMENT_REQUIRED:['BOM 配置待補','Cần bổ sung phân bổ BOM'],EQUIPMENT_REFERENCE_MISSING:['設備引用待確認','Cần xác nhận liên kết thiết bị']};
  const issueMessage=issue=>{const [code,...rest]=String(issue.message).split(':');return (issueWords[code]?.[document.documentElement.lang==='vi'?1:0]||code)+(rest.length?' · '+rest.join(':'):'');};
  function masterChanges(before={},after={}){
    const changes=[],compare=(kind,oldRows,newRows,prefix='')=>{
      const key=row=>row.id||row.code||JSON.stringify([row.line,row.name]);
      const a=new Map((oldRows||[]).map(row=>[key(row),row])),b=new Map((newRows||[]).map(row=>[key(row),row]));const positions=[new Map((oldRows||[]).map((row,index)=>[key(row),index])),new Map((newRows||[]).map((row,index)=>[key(row),index]))];
      for(const id of new Set([...a.keys(),...b.keys()])){const old=a.get(id),next=b.get(id),moved=old&&next&&positions[0].get(id)!==positions[1].get(id);if(JSON.stringify(old)===JSON.stringify(next)&&!moved)continue;const row=next||old;changes.push({kind,action:!old?'added':!next?'removed':'modified',label:prefix+(kind==='categoryGroups'&&row.line?row.line+' / ':'')+(row.code||row.name||id),fields:[...Object.keys({...old,...next}).filter(k=>JSON.stringify(old?.[k])!==JSON.stringify(next?.[k])),...(moved?['order']:[])]});}
    };
    for(const kind of ['products','categoryGroups','lines'])compare(kind,before?.[kind],after?.[kind]);
    const lines=new Map((before?.lines||[]).map(row=>[row.id||row.code,{before:row}]));for(const row of after?.lines||[]){const key=row.id||row.code;lines.set(key,{...lines.get(key),after:row});}
    for(const pair of lines.values())compare('stages',pair.before?.stages,pair.after?.stages,(pair.after||pair.before).code+' / ');
    return changes;
  }
  function submitSnapshotHTML(snapshot){
    if(!snapshot)return '';
    const vi=document.documentElement.lang==='vi',changes=snapshot.changes||[];
    return `<section class="vd-submit-snapshot" data-submit-snapshot><strong>${vi?'Nội dung gửi lần này':'本次送審內容'}</strong><p>${vi?'Bản đã lưu':'已儲存快照'} · ${h(snapshot.savedAt?date(snapshot.savedAt):t('unknown'))} · ${h(snapshot.savedActor||t('unknown'))}</p>${snapshot.id?`<p class="vd-snapshot-id">${vi?'Mã bản lưu':'儲存編號'}：${h(snapshot.id)}<br>${vi?'Lần sửa bản nháp':'草稿修訂'}：${h(snapshot.revision)}</p>`:''}<p>${vi?'Nội dung bản nháp hiện tại trùng với bản đã lưu.':'目前共用草稿與這份已儲存內容相同。'}</p>${changes.length?`<p>${vi?`So với bản chính thức: ${changes.length} mục thay đổi.`:`相較正式版，共 ${changes.length} 筆變更。`}</p><div data-submit-change-list></div><nav class="vd-pages"><button type="button" data-submit-prev>${t('prev')}</button><span data-submit-page></span><button type="button" data-submit-next>${t('next')}</button></nav>`:''}</section>`;
  }
  function bindSubmitSnapshot(dialog,snapshot){
    if(!snapshot?.changes?.length)return;let page=0;const vi=document.documentElement.lang==='vi',kind=vi?{products:'Sản phẩm',categoryGroups:'Nhóm sản phẩm',lines:'Chuyền',stages:'Công đoạn'}:{products:'產品',categoryGroups:'類別',lines:'線別',stages:'工段'},action=vi?{added:'Thêm',modified:'Sửa',removed:'Bỏ'}:{added:'新增',modified:'修改',removed:'移除'};
    const fields=vi?{order:'Thứ tự',specification:'Quy cách',unit:'Đơn vị',machine:'Thiết bị',assetNumber:'Mã tài sản',operators:'Nhân sự',name:'Tên',code:'Mã',line:'Chuyền',category:'Nhóm',stages:'Tuyến / công đoạn',routeMode:'Chế độ tuyến',defaultStages:'Tuyến nhóm'}:{order:'順序',specification:'規格',unit:'單位',machine:'設備',assetNumber:'資產編號',operators:'人數',name:'名稱',code:'編號',line:'線別',category:'類別',stages:'路線／工段',routeMode:'路線模式',defaultStages:'群組路線'};
    const paint=()=>{dialog.querySelector('[data-submit-change-list]').innerHTML='<ul>'+snapshot.changes.slice(page*10,page*10+10).map(row=>`<li><b>${kind[row.kind]} ${h(row.label)}</b> · ${action[row.action]}<small>${h(row.fields.filter(k=>k!=='id').map(k=>fields[k]||(vi?'Trường khác':'其他欄位')).join('、'))}</small></li>`).join('')+'</ul>';dialog.querySelector('[data-submit-page]').textContent=`${page+1} / ${Math.ceil(snapshot.changes.length/10)}`;dialog.querySelector('[data-submit-prev]').disabled=!page;dialog.querySelector('[data-submit-next]').disabled=(page+1)*10>=snapshot.changes.length;};
    dialog.querySelector('[data-submit-prev]').onclick=()=>{page--;paint();};dialog.querySelector('[data-submit-next]').onclick=()=>{page++;paint();};paint();
  }
  const reasonInputs=new Map();
  const reasonFor=(version,flow)=>version?.reason||version?.changeReason||[...(version?.history||[])].reverse().find(e=>['submit','submitted'].includes(e.action))?.comment||flow?.cases?.find(c=>c.savedId===flow.saved?.id)?.reason||'';
  function confirmSubmit(reason='',scope='',options={}){
    if(options.saveBeforeSubmit||options.masterSnapshot?.dirty)return Promise.reject(Error('UNSAVED_CHANGES_SAVE_REQUIRED'));
    const snapshot=options.savedVersion?{...options.masterSnapshot,id:options.savedVersion.id,revision:options.savedVersion.revision,savedAt:options.savedVersion.at,savedActor:options.savedVersion.actor}:options.masterSnapshot;
    const reasonKey=(host.ProcessSync?.identity?.id||'')+':'+scope;
    return new Promise(resolve=>{const opener=document.activeElement,dialog=create('dialog','vd-confirm');dialog.innerHTML=`<form><h2>${t('submit')}</h2><p>${h(scope)}</p><p>${t('confirm')}</p>${submitSnapshotHTML(snapshot)}${options.missingCount?`<p class="vd-advisory">${document.documentElement.lang==='vi'?`Còn ${options.missingCount} mục cần bổ sung. Hồ sơ vẫn có thể được duyệt; không có nghĩa mọi kiểm tra đã đạt.`:`仍有 ${options.missingCount} 項待補。仍可送審與核准，不代表所有檢查通過。`}</p>`:''}<label>${t('reason')}<textarea required rows="4"></textarea></label><div class="vd-actions"><button type="button" data-cancel class="button ghost">${t('cancel')}</button><button class="button signal" type="submit">${t('submit')}</button></div></form>`;bindSubmitSnapshot(dialog,snapshot);dialog.querySelector('textarea').value=reasonInputs.get(reasonKey)??reason;dialog.querySelector('textarea').oninput=e=>reasonInputs.set(reasonKey,e.target.value);const close=value=>{dialog.close();dialog.remove();if(opener?.isConnected)opener.focus({preventScroll:true});resolve(value);};dialog.querySelector('[data-cancel]').onclick=()=>close(null);dialog.oncancel=e=>{e.preventDefault();close(null);};dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const value=dialog.querySelector('textarea').value.trim();if(value)close(value);};document.body.append(dialog);dialog.showModal();if(snapshot){const title=dialog.querySelector('h2');title.tabIndex=-1;title.focus({preventScroll:true});dialog.scrollTop=0;}else dialog.querySelector('textarea').focus();});
  }
  const updateSaved=(root,flow,localUnsaved=false)=>{if(!root||!flow)return;const saved=root.querySelector('[data-vd-saved]'),saver=root.querySelector('[data-vd-saver]');if(saved)saved.textContent=t('saveState')+'：'+(!localUnsaved&&JSON.stringify(flow.saved?.content??flow.active?.content)===JSON.stringify(flow.working)?t(flow.saved?'saved':'unchanged'):t('unsaved'));if(saver)saver.textContent=t('savedBy')+'：'+(flow.saved?.actor?.name||t('unknown'))+' · '+date(flow.saved?.at);};
  const updateSync=(root,busy,failed,localUnsaved=false)=>{const node=root?.querySelector('[data-vd-sync]');if(node)node.textContent=t('sync')+'：'+(failed?t('failed'):busy?t('syncing'):localUnsaved?t('localOnly'):t(node.closest('[data-vd-master-scope]')?'draftSynced':'synced'));};
  function preserveView(...roots){
    const y=window.scrollY,x=window.scrollX;
    const scrolling='.table-wrap,.bw-table,.bw-results,.bw-canvas,.master-diff-scroll,.master-review-list,.version-list,[data-scroll-key]';
    const views=roots.filter(root=>root?.isConnected).map(root=>({root,top:root.scrollTop,left:root.scrollLeft,
      scrolls:[...root.querySelectorAll(scrolling)].map((node,index)=>({id:node.id,index,top:node.scrollTop,left:node.scrollLeft})),
      details:[...root.querySelectorAll('details')].map((node,index)=>({key:node.dataset.caseId||node.id,index,open:node.open})),
      comments:[...root.querySelectorAll('[data-ab-review-comment],[data-ipqcc-review-comment]')].map(node=>({key:node.dataset.abReviewComment||node.dataset.ipqccReviewComment,value:node.value}))}));
    return ()=>{for(const view of views){if(!view.root.isConnected)continue;const details=[...view.root.querySelectorAll('details')];for(const old of view.details){const node=old.key?details.find(node=>(node.dataset.caseId||node.id)===old.key):details[old.index];if(node)node.open=old.open;}const scrolls=[...view.root.querySelectorAll(scrolling)];for(const old of view.scrolls){const node=old.id?scrolls.find(n=>n.id===old.id):scrolls[old.index];if(node){node.scrollTop=old.top;node.scrollLeft=old.left;}}for(const input of view.root.querySelectorAll('[data-ab-review-comment],[data-ipqcc-review-comment]')){const old=view.comments.find(row=>row.key===(input.dataset.abReviewComment||input.dataset.ipqccReviewComment));if(old)input.value=old.value;}view.root.scrollTop=view.top;view.root.scrollLeft=view.left;}window.scrollTo(x,y);};
  }
  const reviewReasons=new Map();
  function confirmReview({action,scope,reason='',selfReview=false}){
    const vi=document.documentElement.lang==='vi',names={approve:vi?'Duyệt':'確認',reject:vi?'Trả lại':'發回',withdraw:vi?'Rút hồ sơ':'撤回送審'},title=names[action];
    return new Promise(resolve=>{const opener=document.activeElement,dialog=create('dialog','vd-confirm');dialog.dataset.i18nSkip='true';dialog.setAttribute('aria-label',title);
      dialog.innerHTML=`<form><h2>${h(title)}</h2><p>${h(scope)}</p><label>${vi?'Lý do / ý kiến':'理由／意見'}${action==='approve'?(vi?' (không bắt buộc)':'（選填）'):(vi?' (bắt buộc)':'（必填）')}<textarea rows="4" ${action==='approve'?'':'required'}></textarea></label>${selfReview?`<label class="vd-self-review"><input type="checkbox" required> ${vi?'Xác nhận tự xét duyệt hồ sơ của mình; ghi lại trong lịch sử.':'確認自審自己送出的案件，並留下操作紀錄。'}</label>`:''}<div class="vd-actions"><button type="button" data-cancel class="button ghost">${t('cancel')}</button><button type="submit" class="button signal">${h(title)}</button></div></form>`;
      const textarea=dialog.querySelector('textarea'),reasonKey=`${host.ProcessSync?.identity?.id||''}:${scope}:${action}`;textarea.value=reviewReasons.get(reasonKey)??reason;
      const close=value=>{dialog.close();dialog.remove();if(opener?.isConnected)opener.focus({preventScroll:true});resolve(value);};
      dialog.querySelector('[data-cancel]').onclick=()=>close(null);dialog.oncancel=e=>{e.preventDefault();close(null);};
      dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const value=textarea.value.trim();if(action!=='approve'&&!value){textarea.setCustomValidity(vi?'Vui lòng nhập lý do':'請填寫理由');textarea.reportValidity();return;}close({reason:value,selfReviewConfirmed:selfReview&&dialog.querySelector('input').checked});};textarea.oninput=()=>{textarea.setCustomValidity('');reviewReasons.set(reasonKey,textarea.value);};
      document.body.append(dialog);dialog.showModal();textarea.focus({preventScroll:true});
    });
  }
  // Adapters describe module-local buffers; this coordinator never fabricates
  // an inverse for shared changes or implicitly clicks Apply/Sync.
  function createDeparture(config){
    let operation=null;
    const say=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
    const messages={
      context:()=>say('頁面、登入身分或權限已變更；輸入仍保留，請留頁重新核對。','Trang, phiên đăng nhập hoặc quyền đã đổi; giữ nội dung và kiểm tra lại.'),
      busy:()=>say('正在處理或上傳，請稍候；輸入仍保留。','Đang xử lý hoặc tải ảnh; vui lòng chờ. Nội dung được giữ lại.'),
      unknown:()=>say('上次操作結果尚未確認；請留頁查原操作收據，不會重新送出或放棄。','Chưa xác nhận thao tác trước; ở lại kiểm tra biên nhận gốc, không gửi lại hoặc bỏ.'),
      failed:()=>say('尚有失敗或未完成的套用；請回原編輯區處理，輸入仍保留。','Có thao tác áp dụng lỗi hoặc chưa xong; xử lý tại vùng sửa, nội dung vẫn được giữ.'),
      local:()=>say('尚有未套用輸入；請按「留在此頁」，回原表單明確套用或取消後再儲存。','Có nội dung chưa áp dụng; chọn ở lại, áp dụng hoặc hủy rõ ràng trong biểu mẫu trước khi lưu.'),
      shared:()=>say('已有共享但尚未儲存的變更；儲存涵蓋整個模組。無個人安全撤回證據，不能整份放棄；請儲存或留頁處理。','Có thay đổi chung chưa lưu; lưu áp dụng cho toàn mô-đun. Không có bằng chứng hoàn tác riêng an toàn, không thể bỏ toàn bộ; hãy lưu hoặc ở lại xử lý.'),
      pending:()=>say('草稿待審或唯讀鎖定；可保留輸入，或只放棄本人未送出的本機內容，不會代為撤回共享草稿。','Bản nháp chờ duyệt hoặc chỉ đọc; giữ nội dung hoặc chỉ bỏ dữ liệu cục bộ chưa gửi của mình, không rút bản nháp chung.'),
      permission:()=>say('目前無套用權限；可留頁保留輸入，或只放棄本人未送出的本機輸入，不會修改共享內容。','Không có quyền áp dụng; ở lại giữ nội dung hoặc chỉ bỏ dữ liệu cục bộ chưa gửi của mình, không đổi nội dung chung.'),
      save:()=>say('目前沒有儲存權限；輸入仍保留，請留頁確認權限。','Hiện không có quyền lưu; giữ nội dung, ở lại kiểm tra quyền.'),
    };
    const roots=()=>[config.root?.(),...(config.dialogs?.()||[])].filter(Boolean);
    const context=()=>JSON.stringify(config.context?.()??config.flow?.()?.generation??null);
    const sharedDirty=()=>config.sharedDirty?!!config.sharedDirty():!!host.sharedDraftNeedsSave?.(config.flow?.());
    function inspect(){
      const clean={state:'clean',canSave:false,canDiscard:false,reason:''};
      if(operation&&!current(operation))return {...clean,state:'unknown',reason:messages.context()};
      if(config.active?.()===false)return clean;
      if(host.ProcessSync?.requiresReload||config.current?.()===false)return {...clean,state:'unknown',reason:messages.context()};
      if(operation?.phase==='writing'||config.busy?.()||host.ProcessNavigationForms?.composing?.())return {...clean,state:'busy',reason:messages.busy()};
      if(config.unknown?.())return {...clean,state:'unknown',reason:messages.unknown()};
      if(config.failed?.())return {...clean,state:'blocked',reason:messages.failed()};
      const local=!!config.local?.();
      // Known transport scopes use this tab's successful ACKs, never actor names.
      // Legacy/unsupported flows retain the conservative contributor fallback.
      const owned=config.sharedOwned?config.sharedOwned():host.SharedDraftDeparture?.owns(config.flow?.());
      let shared=owned===true;
      if(typeof owned!=='boolean'){
        const contributors=config.flow?.()?.contributors,actors=config.sharedActors?config.sharedActors():contributors&&typeof contributors==='object'&&!Array.isArray(contributors)?Object.values(contributors).map(stamp=>stamp?.actor?.id):null;
        const othersOnly=Array.isArray(actors)&&actors.length>0&&actors.every(id=>typeof id==='string'&&id&&id!==host.ProcessSync?.identity?.id);
        const readonly=config.canSave?.()!==true&&config.canDiscard?.()!==true;
        shared=sharedDirty()&&!othersOnly&&!readonly;
      }
      if(!local&&!shared)return clean;
      const canDiscard=local&&!shared&&typeof config.discard==='function';
      if(config.locked?.()||config.flow?.()?.pendingId)return {...clean,state:'dirty',canDiscard,reason:messages.pending()};
      const canSave=config.canSave?.()===true&&(!local||config.localSave?.()===true);
      return {state:'dirty',canSave,canDiscard,reason:local&&!config.canDiscard?.()&&config.localSave?.()!==true?messages.permission():local&&config.localSave?.()!==true?(config.localReason?.()||messages.local()):!canSave?messages.save():shared?messages.shared():config.localReason?.()||say('這些輸入僅在本機；儲存會依原模組流程提交並固定版本，放棄只清除未送出的輸入。','Nội dung chỉ ở máy này; Lưu gửi và cố định phiên bản theo quy trình mô-đun, Bỏ chỉ xóa nội dung chưa gửi.')};
    }
    const capture=()=>({identity:host.ProcessSync?.identity,epoch:host.ProcessSync?.identityGeneration?.(),delivery:host.ProcessSync?.captureDelivery?.(),context:context(),root:config.root?.()});
    const current=record=>record.identity===host.ProcessSync?.identity&&record.epoch===host.ProcessSync?.identityGeneration?.()&&record.context===context()&&record.root===config.root?.()&&!host.ProcessSync?.requiresReload&&(!record.delivery||host.ProcessSync?.isCurrentDelivery?.(record.delivery)!==false)&&config.current?.()!==false;
    async function act(kind){
      const status=inspect();if(operation||status.state!=='dirty'||!status[kind==='save'?'canSave':'canDiscard'])throw Error(status.reason||messages.context());
      const record=capture(),locked=roots().map(node=>({node,inert:node.inert}));
      operation=record;record.phase='writing';for(const {node} of locked)node.inert=true;
      let released=false;record.release=()=>{if(released)return;released=true;for(const {node,inert} of locked)node.inert=inert;if(operation===record)operation=null;};
      try{
        if(!current(record))throw Error(messages.context());
        // Discard is local-only and synchronous unless a module explicitly
        // provides a checked implementation. No backend rollback lives here.
        if(kind==='discard')await config.discard();else if(!await config.save({current:()=>current(record),assert(){if(!current(record))throw Error(messages.context());}}))throw Error(messages.failed());
        if(!current(record))throw Error(messages.context());
        record.phase='held';const after=inspect();
        if(after.state!=='clean')throw Error(after.reason||messages.failed());
        return {release:record.release};
      }catch(error){record.release();throw error;}
    }
    return {inspect,ownsRuntimeLocal:()=>config.ownsRuntimeLocal?.()===true,save:()=>act('save'),discard:()=>act('discard'),ownsDialog:node=>(config.dialogs?.()||[]).includes(node),closeClean(){const status=inspect();if(status.state!=='clean')throw Error(status.reason);config.closeClean?.();}};
  }
  host.VersionDraftUI={createDeparture,masterChanges,mount,t,date,issueMessage,confirmSubmit,confirmReview,preserveView,reasonFor,updateSaved,updateSync};
  const priorValidation=host.renderSharedDraftValidation;
  host.renderSharedDraftValidation=options=>{const shell=options.after?.closest('.vd-shell');if(shell)shell.querySelectorAll('[data-shared-issue-kind]').forEach(node=>node.remove());priorValidation?.(options);if(shell){for(const kind of ['error','missing','warning']){const section=shell.querySelector(kind==='warning'?'.vd-history':'.vd-'+(kind==='error'?'errors':'missing'));for(const node of shell.querySelectorAll('.shared-validation [data-shared-issue-kind="'+kind+'"]')){section.querySelector('.vd-empty')?.remove();section.append(node);}}shell.querySelectorAll('.shared-validation').forEach(node=>node.remove());}};
  host.addEventListener('process-language-change',()=>document.querySelectorAll('.vd-shell').forEach(shell=>shell.refreshLabels?.()));
  const previousDataBind=bindDataInner;
  bindDataInner=function(tab){previousDataBind(tab);if(tab!=='process-master')return;
    const shared=host.MasterDataWorkflow?.shared;
    mount(document.querySelector('#data-content'),{header:'.process-master-version',historyClient:()=>shared.client('PROCESS'),module:document.documentElement.lang==='vi'?'Dữ liệu quy trình PROCESS':'PROCESS 流程資料',scope:'PROCESS',version:selectedProcessMasterVersion(),versions:processMasterVersions(),active:processMasterVersions().find(v=>v.status==='approved'),flow:shared?.flow('PROCESS'),actions:{begin:'#process-master-new-draft',save:'#save-master-data',submit:'#process-master-submit',review:'#process-master-review',withdraw:'#process-master-withdraw'},errors:'[data-shared-issue-kind="error"]',missing:'[data-shared-issue-kind="missing"]',history:['.process-master-history','[data-process-history]','[data-shared-issue-kind="warning"]'],status:['#process-shared-status']});
  };
})(window);

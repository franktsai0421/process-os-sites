(function (host) {
  'use strict';
  const words = {
    historyGuide:['歷史紀錄','Lịch sử dữ liệu'], viewVersions:['查看版本（唯讀）','Xem phiên bản (chỉ đọc)'], saveRecords:['儲存紀錄（唯讀）','Lịch sử lưu (chỉ đọc)'],
    wholeScope:['儲存／送審範圍','Phạm vi lưu / gửi duyệt'], abScope:['整個 AB（A、B 線）','Toàn bộ AB (chuyền A, B)'], cScope:['整個 C（C 線）','Toàn bộ C (chuyền C)'],
    scopeReminder:['篩選只影響顯示，其他類別與分頁的修改也包含在內。','Bộ lọc chỉ đổi phần hiển thị; thay đổi ở nhóm và trang khác cũng được bao gồm.'],
    draftSynced:['已同步到共用草稿','Đã đồng bộ vào bản nháp chung'], draftUnsaved:['尚未儲存，請儲存後送審','Chưa lưu; hãy lưu trước khi gửi duyệt'],
    historyHelp:['同一版本篩選欄可查看已核准版本（唯讀），選擇當前草稿返回。','Xem phiên bản đã duyệt (chỉ đọc) trong cùng bộ lọc; chọn bản nháp hiện tại để quay lại.'],
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
  // BOM-only presentation lease. Neither this selector nor its GETs settle a
  // write, replace a working aggregate, or touch a local recovery journal.
  const approvedDisplays=new WeakMap();
  const cloneHistory=value=>JSON.parse(JSON.stringify(value));
  function clearHistory(client){const entry=client&&approvedDisplays.get(client);if(entry){entry.sequence++;entry.selected=null;}}
  function historyVersion(client){const entry=client&&approvedDisplays.get(client);try{if(entry?.selected&&!entry.selected.current()){entry.sequence++;entry.selected=null;}return entry?.selected?cloneHistory(entry.selected.version):null;}catch{if(entry){entry.sequence++;entry.selected=null;}return null;}}
  const bomHistoryModel=model=>model.module==='BOM'&&typeof model.renderHistory==='function'&&typeof model.historyCurrent==='function';
  function bomHistoryMetadata(shell,model,log,empty){
    const client=model.historyClient?.();if(!client?.approvedHistory||!client.approvedVersion)return;
    let entry=approvedDisplays.get(client);if(!entry){entry={sequence:0,selected:null,revision:-1};approvedDisplays.set(client,entry);}
    // Each mount retires handlers/readbacks belonging to the detached shell,
    // but a synchronous render of the selected snapshot retains its lease.
    entry.sequence++;
    const sync=host.ProcessSync,identity=sync?.identity,epoch=sync?.identityGeneration?.(),delivery=sync?.captureDelivery?.();
    const owner=()=>!!identity?.id&&identity===host.ProcessSync?.identity&&Number.isSafeInteger(epoch)&&epoch>=0&&epoch===host.ProcessSync?.identityGeneration?.()&&!host.ProcessSync?.requiresReload&&delivery!==undefined&&delivery!==null&&host.ProcessSync?.isCurrentDelivery?.(delivery)===true&&model.historyClient?.()===client;
    const allowed=()=>owner()&&model.historyCurrent()===true&&client.permission('view')===true&&client.permission('history')===true;
    const live=()=>shell.isConnected&&allowed();
    const evidence=value=>{
      if(!value||typeof value!=='object')return false;
      if(value.kind==='formal-baseline')return value.caseId===null&&value.savedId===null;
      if(value.kind==='legacy-approval')return value.caseId===null&&value.savedId===null&&typeof value.approvedAt==='string'&&Number.isFinite(Date.parse(value.approvedAt));
      return value.kind==='approved-case'&&typeof value.caseId==='string'&&!!value.caseId&&typeof value.savedId==='string'&&!!value.savedId.trim()&&typeof value.approvedBy==='string'&&!!value.approvedBy.trim()&&typeof value.approvedAt==='string'&&Number.isFinite(Date.parse(value.approvedAt));
    };
    const validRow=row=>row&&typeof row.id==='string'&&!!row.id&&!row.id.startsWith('shared-')&&Number.isSafeInteger(row.number)&&row.number>=1&&['approved','superseded'].includes(row.status)&&evidence(row.approvalEvidence)&&(row.approvalEvidence.kind!=='approved-case'||row.approvalEvidence.caseId===row.id);
    const authority=result=>{
      if(result?.approvedOnly!==true||!Number.isSafeInteger(result.revision)||result.revision<entry.revision||!['view','edit','save','submit','withdraw','approve','return','history'].every(key=>typeof result.permissions?.[key]==='boolean')||result.permissions.view!==true||result.permissions.history!==true||!allowed())throw Error('APPROVED_HISTORY_AUTHORITY_REQUIRED');
      entry.revision=result.revision;
    };
    empty?.remove();const notice=create('p','vd-history-load',''),section=create('section','vd-history-page'),rows=create('ol',''),nav=create('nav','vd-pages'),previous=create('button','button ghost',t('prev')),next=create('button','button ghost',t('next')),pageLabel=create('span','');
    const choice=create('select',''),currentOption=create('option','',`${t('working')} · ${number(model.version)}`);currentOption.value='';choice.append(currentOption);choice.setAttribute('aria-label',t('viewVersions'));choice.dataset.vdApprovedChoice='true';shell.querySelector('.vd-choice')?.append(choice);
    const back=create('button','button ghost',t('back'));back.type=previous.type=next.type='button';back.dataset.vdApprovedCurrent='true';shell.querySelector('.vd-actions')?.append(back);
    section.append(create('h4','',t('viewVersions')),rows);nav.append(previous,pageLabel,next);section.append(nav);log.append(notice,section);
    let loading=false,started=false,cursors=[''],page=null;const known=new Map();
    const controls=()=>{back.hidden=!entry.selected&&!loading;back.disabled=!live();choice.disabled=loading||!live();previous.disabled=loading||!live()||cursors.length===1;next.disabled=loading||!live()||!page?.next;for(const button of rows.querySelectorAll('button'))button.disabled=loading||!live();};
    const paint=()=>{
      known.clear();rows.replaceChildren();choice.replaceChildren(currentOption);
      const selected=historyVersion(client);if(selected){const option=create('option','',`${number(selected)} · ${t('superseded')}`);option.value=selected.id;choice.append(option);}
      for(const row of page?.rows||[]){known.set(row.id,row);const li=create('li',''),button=create('button','button ghost',`${number(row)} · ${t(row.status)} · ${date(row.createdAt)}`);button.type='button';button.dataset.vdApprovedId=row.id;button.onclick=()=>void choose(row.id);li.append(button);rows.append(li);if(row.id!==selected?.id){const option=create('option','',`${number(row)} · ${t(row.status)}`);option.value=row.id;choice.append(option);}}
      if(!page?.rows.length)rows.append(create('li','',t('none')));choice.value=selected?.id||'';pageLabel.textContent=`${cursors.length} / ${Math.max(1,Math.ceil((page?.total||0)/20))}`;controls();
    };
    const begin=()=>{if(loading||!live())throw Error('APPROVED_HISTORY_SUPERSEDED');loading=true;const sequence=++entry.sequence;controls();const current=()=>sequence===entry.sequence&&live();current.sequence=sequence;return current;};
    const fail=error=>{if(!shell.isConnected)return;if(!allowed()){clearHistory(client);known.clear();page=null;rows.replaceChildren();choice.replaceChildren(currentOption);choice.value='';}if(shell.isConnected){notice.textContent=t('history')+' · '+t('failed')+' · '+error.message;controls();}};
    async function load(nextCursors=cursors){let current;try{current=begin();notice.textContent=t('history')+' · '+t('syncing');const result=await client.approvedHistory({versionBefore:nextCursors.at(-1)},{isCurrent:current});if(!current())throw Error('APPROVED_HISTORY_SUPERSEDED');authority(result);const data=result.versions;if(!data||!Array.isArray(data.rows)||data.rows.length>20||!data.rows.every(validRow)||new Set(data.rows.map(row=>row.id)).size!==data.rows.length||!Number.isSafeInteger(data.total)||data.total<data.rows.length||!(data.next===null||typeof data.next==='string'&&!!data.next))throw Error('APPROVED_HISTORY_INVALID');page=cloneHistory(data);cursors=nextCursors.slice();notice.textContent='';shell.dataset.historyLoaded='true';paint();}catch(error){fail(error);if(!page)started=false;}finally{if(current?.sequence===entry.sequence)loading=false;controls();}}
    async function choose(id){let current;try{
      if(!id&&loading){entry.sequence++;loading=false;}
      current=begin();notice.textContent=t('history')+' · '+t('syncing');
      if(!id){
        const result=await client.permissions({isCurrent:current,requireAcceptedAccess:true});if(!current()||result.permissions?.view!==true||result.permissions?.history!==true||!['view','edit','save','submit','withdraw','approve','return','history'].every(key=>typeof result.permissions?.[key]==='boolean')||!Number.isSafeInteger(result.revision)||result.revision<entry.revision)throw Error('APPROVED_HISTORY_SUPERSEDED');entry.revision=result.revision;
        // The adapter must observe an empty selection before restoring its own
        // retained editor. The returned/current ID is never a writer basis.
        clearHistory(client);model.renderHistory(null,model.version?.id);if(shell.isConnected){loading=false;notice.textContent='';paint();}return;
      }
      if(!known.has(id)&&entry.selected?.version.id!==id)throw Error('APPROVED_HISTORY_NOT_LISTED');
      const result=await client.approvedVersion(id,{isCurrent:current});if(!current())throw Error('APPROVED_HISTORY_SUPERSEDED');authority(result);
      const value=result.version;if(!validRow(value)||value.id!==id||!value.snapshot||typeof value.snapshot.bom!=='object'||Array.isArray(value.snapshot.bom)||!value.snapshot.bom||!Array.isArray(value.snapshot.referenceIssues))throw Error('APPROVED_HISTORY_INVALID');
      const version=cloneHistory(value);entry.selected={version,current:allowed};
      // Store the validated clone first: the BOM adapter checks this selection
      // and clones its display, without rebinding flow()/version()/editor.
      model.renderHistory(cloneHistory(version),model.version?.id);
    }catch(error){fail(error);}finally{if(current?.sequence===entry.sequence)loading=false;if(shell.isConnected){choice.value=historyVersion(client)?.id||'';controls();notice.textContent=notice.textContent===t('history')+' · '+t('syncing')?'':notice.textContent;}}}
    back.onclick=()=>void choose('');choice.onchange=()=>void choose(choice.value);previous.onclick=()=>void load(cursors.slice(0,-1));next.onclick=()=>{if(page?.next)void load([...cursors,page.next]);};
    const start=()=>{if(started)return;started=true;void load();};log.addEventListener('toggle',()=>{if(log.open)start();});choice.addEventListener('focus',start,{once:true});
    entry.cleanup?.();const invalidate=()=>{if(!allowed()){clearHistory(client);known.clear();page=null;rows.replaceChildren();choice.replaceChildren(currentOption);choice.value='';notice.textContent=t('locked');controls();}};const invalidationEvents=['process-delivery-invalidated','process-sync-status'];for(const name of invalidationEvents)host.addEventListener(name,invalidate);entry.cleanup=()=>{for(const name of invalidationEvents)host.removeEventListener?.(name,invalidate);};
    shell.refreshHistoryLabels=()=>{currentOption.textContent=`${t('working')} · ${number(model.version)}`;back.textContent=t('back');previous.textContent=t('prev');next.textContent=t('next');paint();};paint();if(log.open)start();
  }

  // Explicit adapters own their working buffers. This controller owns only a
  // display lease and cloned, audited GET results; it never calls a writer.
  const approvedPageCaches=new WeakMap();
  function createApprovedHistory(options){
    const {root,shell,client}=options;
    if(!root||!shell||!client?.approvedHistory||!client?.approvedVersion)throw Error('APPROVED_HISTORY_ADAPTER_REQUIRED');
    client.useAccessResultGuard?.();
    const sync=host.ProcessSync,actor=sync?.identity,epoch=sync?.identityGeneration?.(),delivery=sync?.captureDelivery?.();
    const owner=()=>root.isConnected&&shell.isConnected&&root.contains(shell)&&actor===host.ProcessSync?.identity&&!!actor?.id&&Number.isSafeInteger(epoch)&&epoch>=0&&epoch===host.ProcessSync?.identityGeneration?.()&&!host.ProcessSync?.requiresReload&&delivery!=null&&host.ProcessSync?.isCurrentDelivery?.(delivery)===true&&client.isRuntimeCurrent?.()!==false&&options.isCurrent()===true;
    const allowed=()=>owner()&&client.permission('view')===true&&client.permission('history')===true;
    let cache=approvedPageCaches.get(client);
    if(!cache||cache.actor!==actor||cache.epoch!==epoch||host.ProcessSync?.isCurrentDelivery?.(cache.delivery)!==true){cache={actor,epoch,delivery,rows:new Map(),cursor:null,loaded:false,revision:-1};approvedPageCaches.set(client,cache);}
    options.empty?.remove();
    const choice=create('select','');choice.id=options.selectId;choice.dataset.vdApprovedChoice='true';
    const old=shell.querySelector('.vd-choice select');if(old){old.before(choice);old.remove();}else shell.querySelector('.vd-choice')?.append(choice);
    const notice=create('p','vd-approved-notice');notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');shell.querySelector('.vd-card')?.append(notice);
    const display=create('section','vd-approved-view');display.setAttribute('data-vd-approved-view','true');display.hidden=true;shell.after(display);
    const title=shell.querySelector('.vd-top h3');let currentTitle=title?.textContent,sequence=0,retired=false,loading=false,blocking=options.initialBlocked===true,selected=null,data=null,hidden=[];
    const live=()=>!retired&&owner();
    const canChoose=()=>options.canChoose()===true;
    const text=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
    const hideWorking=()=>{if(hidden.length)return;const nodes=[];let child=shell;while(child&&child!==root){for(const sibling of child.parentElement?.children||[])if(sibling!==child&&sibling!==display)nodes.push(sibling);child=child.parentElement;}const card=shell.querySelector('.vd-card');nodes.push(...[...shell.children].filter(n=>!n.matches('.vd-heading,.vd-card')),...[...(card?.children||[])].filter(n=>!n.matches('.vd-top')&&n!==notice));hidden=[...new Set(nodes)].map(n=>[n,n.hidden]);for(const [node]of hidden)node.hidden=true;};
    const restoreWorking=()=>{for(const [node,wasHidden]of hidden)node.hidden=wasHidden;hidden=[];display.hidden=true;display.replaceChildren();if(title)title.textContent=currentTitle;};
    function paint(){
      choice.replaceChildren();const option=(value,label)=>{const node=create('option','',label);node.value=value;choice.append(node);};
      option('',text('當前草稿','Bản nháp hiện tại'));
      for(const row of cache.rows.values())option(row.id,`${options.versionLabel?.(row)||'V'+row.number} · ${text('已核准 · 唯讀','Đã duyệt · chỉ đọc')} · ${date(row.approvalEvidence.approvedAt)}`);
      if(cache.cursor)option('__more',text('載入更多已核准版本…','Xem thêm phiên bản đã duyệt…'));
      if(blocking&&!selected)option(loading?'__loading':'__blocked',text(loading?'正在載入版本…':'請重新選擇當前草稿',loading?'Đang tải phiên bản…':'Chọn lại bản nháp hiện tại'));
      choice.value=blocking&&loading?'__loading':selected?.id||(blocking?'__blocked':'');choice.setAttribute('aria-label',text('已核准版本／當前草稿','Phiên bản đã duyệt / bản nháp hiện tại'));choice.disabled=!live()||!allowed()||!canChoose();
      if(blocking&&title)title.textContent=selected?`V${selected.number} · ${text('已核准 · 唯讀','Đã duyệt · chỉ đọc')}`:text(loading?'正在載入版本…':'請重新選擇當前草稿',loading?'Đang tải phiên bản…':'Chọn lại bản nháp hiện tại');
    }
    const erase=()=>{if(retired)return;options.onBoundary();options.onDenied?.();sequence++;blocking=true;loading=false;selected=null;data=null;cache.rows.clear();cache.cursor=null;cache.loaded=false;hideWorking();display.hidden=true;display.replaceChildren();notice.textContent=text('權限或頁面已變更，請重新開啟核對。','Quyền hoặc trang đã thay đổi. Hãy mở lại và kiểm tra.');paint();};
    const invalidate=()=>{if(!live()||!allowed())erase();else paint();};
    const events=['process-delivery-invalidated','process-sync-status','pagehide'];
    const onPageHide=()=>erase();for(const event of events)host.addEventListener(event,event==='pagehide'?onPageHide:invalidate);
    const unwatch=client.watchApprovedAccess(invalidate);
    function retire(){if(retired)return;retired=true;sequence++;unwatch();for(const event of events)host.removeEventListener(event,event==='pagehide'?onPageHide:invalidate);restoreWorking();display.remove();}
    const begin=()=>{if(!live())throw Error('APPROVED_HISTORY_SUPERSEDED');loading=true;const ticket=++sequence;return()=>live()&&ticket===sequence;};
    const authority=result=>{if(!allowed()||!Number.isSafeInteger(result?.revision)||result.revision<cache.revision||!['view','edit','save','submit','withdraw','approve','return','history','delete'].every(key=>typeof result.permissions?.[key]==='boolean')||result.permissions.view!==true||result.permissions.history!==true)throw Error('APPROVED_HISTORY_AUTHORITY_REQUIRED');cache.revision=result.revision;};
    const evidence=e=>e&&typeof e.approvedAt==='string'&&Number.isFinite(Date.parse(e.approvedAt))&&(e.kind==='legacy-approval'&&e.caseId===null&&e.savedId===null||e.kind==='approved-case'&&typeof e.caseId==='string'&&!!e.caseId&&typeof e.savedId==='string'&&!!e.savedId.trim()&&typeof e.approvedBy==='string'&&!!e.approvedBy.trim());
    const validRow=row=>row&&typeof row.id==='string'&&!!row.id&&!row.id.startsWith('shared-')&&!['__more','__blocked','__loading'].includes(row.id)&&Number.isSafeInteger(row.number)&&row.number>=1&&['approved','superseded'].includes(row.status)&&evidence(row.approvalEvidence)&&(row.approvalEvidence.kind!=='approved-case'||row.approvalEvidence.caseId===row.id||options.validateProjectedIdentity?.(row)===true)&&(!['legacy-ab:','legacy-master-page:','legacy-routine-page:'].some(prefix=>row.id.startsWith(prefix))||options.validateProjectedIdentity?.(row)===true);
    const message=error=>text('無法讀取版本','Không đọc được phiên bản')+' · '+String(error?.message||error);
    async function load(){if(loading||!live()||!canChoose())return;const current=begin();try{notice.textContent=text('載入中…','Đang tải…');authority(await client.permissions({isCurrent:current,requireAcceptedAccess:true}));if(!current())return;const result=await client.approvedHistory({versionBefore:cache.cursor||''},{isCurrent:current});if(!current())return;authority(result);const rows=result.versions;if(result.approvedOnly!==true||!rows||!Array.isArray(rows.rows)||rows.rows.length>20||!rows.rows.every(validRow)||new Set(rows.rows.map(row=>row.id)).size!==rows.rows.length||!Number.isSafeInteger(rows.total)||rows.total<rows.rows.length||!(rows.next===null||typeof rows.next==='string'&&!!rows.next)||rows.next&&rows.next===cache.cursor)throw Error('APPROVED_HISTORY_INVALID');for(const row of rows.rows)cache.rows.set(row.id,cloneHistory(row));cache.cursor=rows.next;cache.loaded=true;notice.textContent=rows.total?'':text('尚無已核准版本','Chưa có phiên bản đã duyệt');}catch(error){if(current())notice.textContent=message(error);}finally{if(current()){loading=false;paint();options.onIdle?.();}}}
    function renderSnapshot(){if(!live()||!allowed()||!selected||!data)return;display.hidden=false;display.replaceChildren();const hint=create('p','',text('唯讀。請於同一篩選欄選擇當前草稿切回。','Chỉ đọc. Chọn bản nháp hiện tại trong cùng bộ lọc để quay lại.'));display.append(hint,create('p','',`${selected.approvalEvidence.approvedBy||''} · ${date(selected.approvalEvidence.approvedAt)}`));options.renderSnapshot(display,cloneHistory(data),()=>live()&&allowed()&&!!selected&&!loading);}
    async function choose(id,fromApprovedCase=false){
      if(!live())return;if(!canChoose()){paint();return;}if(id==='__more')return load();if(['__loading','__blocked'].includes(id)||id&&!cache.rows.has(id)&&!fromApprovedCase){paint();return;}
      if(typeof id!=='string'||fromApprovedCase&&!id)return;
      options.onBoundary();blocking=true;const current=begin();hideWorking();display.hidden=true;display.replaceChildren();selected=null;data=null;paint();
      try{notice.textContent=text('載入中…','Đang tải…');if(!id){const permission=await client.permissions({isCurrent:current,requireAcceptedAccess:true});if(!current())return;authority(permission);blocking=false;loading=false;retire();options.renderCurrent();document.querySelector('#'+options.selectId)?.focus({preventScroll:true});return;}
        const result=await client.approvedVersion(id,{isCurrent:current});if(!current())return;authority(result);const value=result.version;if(result.approvedOnly!==true||!validRow(value)||value.id!==id||!options.validateSnapshot(value.snapshot))throw Error('APPROVED_HISTORY_INVALID');selected=cloneHistory(value);cache.rows.set(value.id,cloneHistory({id:value.id,number:value.number,status:value.status,approvalEvidence:value.approvalEvidence,...(options.validateProjectedIdentity?.(value)===true?{sourceScope:value.sourceScope,sourceVersionId:value.sourceVersionId}:{})}));data=cloneHistory(value.snapshot);loading=false;notice.textContent='';renderSnapshot();
      }catch(error){if(current()){selected=null;data=null;blocking=true;display.hidden=true;display.replaceChildren();notice.textContent=message(error);}}finally{if(current()){loading=false;paint();}}
    }
    choice.onfocus=()=>{if(!cache.loaded)return load();};choice.onchange=()=>choose(choice.value);
    const view={retire,refreshControls(){if(live())paint();},openVersion:id=>choose(id,true),get selectedId(){return selected?.id||'';},get historical(){return blocking||!!selected;},get reading(){return loading;},get blocked(){return blocking||!live();},relabel(){if(!live())return;shell.refreshLabels?.();if(!blocking)currentTitle=title?.textContent;paint();if(selected)renderSnapshot();}};
    shell.refreshHistoryLabels=paint;if(blocking){hideWorking();notice.textContent=text('請重新選擇當前草稿','Chọn lại bản nháp hiện tại');}paint();return view;
  }
  // Read-only field renderer for explicit module schemas. Data, labels and media
  // come solely from the selected snapshot and the adapter's immutable route.
  function renderApprovedCollections(target,snapshot,{collections,fields,mediaURL,mediaFields=[]},current){
    const text=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
    const label=key=>fields[key]?.[document.documentElement.lang==='vi'?1:0]||key;
    function value(node,data,key,ancestors=[]){
      if(data==null){node.append(create('span','','—'));return;}
      if(typeof data!=='object'){node.append(create('span','',typeof data==='boolean'?text(data?'是':'否',data?'Có':'Không'):String(data)));return;}
      if(['photos','mediaItems','standardPhotos','methodPhotos',...mediaFields].includes(key)){for(const photo of Array.isArray(data)?data:[]){const url=mediaURL?.(photo);if(!url){node.append(create('p','',text('此歷史圖片無法讀取','Không đọc được ảnh lịch sử này')));continue;}const img=create('img','');img.loading='lazy';img.alt=photo.name||text('歷史圖片','Ảnh lịch sử');img.src=url;img.onerror=()=>{if(!current())return;img.onerror=null;img.hidden=true;img.after(create('p','',text('此歷史圖片無法讀取','Không đọc được ảnh lịch sử này')));};node.append(img);}return;}
      if(Array.isArray(data)){const list=create('ol','');for(const row of data){const item=create('li','');value(item,row,'',ancestors);list.append(item);}node.append(list);return;}
      const list=create('dl','');for(const [field,item]of Object.entries(data)){if(field==='equipmentSnapshot'&&data.equipmentId&&item?.id!==data.equipmentId){list.append(create('dt','',label(field)),create('dd','',text('此版本未保存相符設備','Phiên bản này không lưu thiết bị phù hợp')));continue;}const dd=create('dd','');value(dd,item,field,[...ancestors,key]);list.append(create('dt','',label(field)),dd);}node.append(list);
    }
    for(const key of collections){const section=create('section','vd-approved-collection'),rows=snapshot[key],heading=create('h3','',`${label(key)} · ${rows.length}`),searchLabel=create('label','',text('搜尋','Tìm kiếm')),search=create('input',''),area=create('div',''),nav=create('nav','vd-pages'),prev=create('button','button ghost',t('prev')),next=create('button','button ghost',t('next')),count=create('span','');let page=0,query='';search.setAttribute('type','search');search.setAttribute('aria-label',text('搜尋','Tìm kiếm')+' · '+label(key));searchLabel.append(search);prev.type=next.type='button';nav.append(prev,count,next);section.append(heading,searchLabel,area,nav);target.append(section);
      function paintRows(){if(!current())return;const filtered=rows.filter(row=>!query||JSON.stringify(row).toLocaleLowerCase().includes(query.toLocaleLowerCase()));page=Math.min(page,Math.max(0,Math.ceil(filtered.length/10)-1));area.replaceChildren();for(const row of filtered.slice(page*10,page*10+10)){const detail=create('details',''),summary=create('summary','',row.code||row.nameZh||row.nameVi||row.name||row.title||row.id||text('資料','Dữ liệu')),body=create('div','');detail.append(summary,body);detail.ontoggle=()=>{if(!current()||!detail.open||body.children.length)return;value(body,row,key);};area.append(detail);}if(!filtered.length)area.append(create('p','',t('none')));count.textContent=`${page+1} / ${Math.max(1,Math.ceil(filtered.length/10))} · ${filtered.length}`;prev.disabled=page===0;next.disabled=(page+1)*10>=filtered.length;}
      search.oninput=event=>{if(!current()||event.isComposing)return;query=search.value;page=0;paintRows();};search.oncompositionend=search.oninput;prev.onclick=()=>{if(current()){page--;paintRows();}};next.onclick=()=>{if(current()){page++;paintRows();}};paintRows();
    }
  }
  async function historyMetadata(shell,model,select,log,empty){
    if(bomHistoryModel(model))return bomHistoryMetadata(shell,model,log,empty);
    if(typeof model.mountApprovedHistory==='function')return model.mountApprovedHistory(shell,log,empty);
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
    const selected=bomHistoryModel(model)?historyVersion(model.historyClient?.()):null;
    const v=selected||model.version,flow=model.flow,versions=model.versions||[],pending=['pending','pending-test'].includes(v?.status),draft=versions.find(row=>row.status==='draft');
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
    let operation=null,completedCoverage=[];
    const say=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
    const messages={
      context:()=>say('頁面、登入身分或權限已變更；輸入仍保留，請留頁重新核對。','Trang, phiên đăng nhập hoặc quyền đã đổi; giữ nội dung và kiểm tra lại.'),
      busy:()=>say('正在處理或上傳，請稍候；輸入仍保留。','Đang xử lý hoặc tải ảnh; vui lòng chờ. Nội dung được giữ lại.'),
      unknown:()=>say('上次操作結果尚未確認；請留頁查原操作收據，不會重新送出或放棄。','Chưa xác nhận thao tác trước; ở lại kiểm tra biên nhận gốc, không gửi lại hoặc bỏ.'),
      unknownLeave:()=>say('可放棄未送出的輸入後離開。原操作仍可能完成；操作紀錄與寫入鎖會保留，返回後須查詢原收據，不會重新送出。','Có thể bỏ đầu vào chưa gửi rồi rời đi. Thao tác trước vẫn có thể hoàn tất; giữ biên nhận và khóa ghi, kiểm tra lại khi quay về, không gửi lại.'),
      failed:()=>say('尚有失敗或未完成的套用；請回原編輯區處理，輸入仍保留。','Có thao tác áp dụng lỗi hoặc chưa xong; xử lý tại vùng sửa, nội dung vẫn được giữ.'),
      local:()=>say('尚有未套用輸入；請按「留在此頁」，回原表單明確套用或取消後再儲存。','Có nội dung chưa áp dụng; chọn ở lại, áp dụng hoặc hủy rõ ràng trong biểu mẫu trước khi lưu.'),
      shared:()=>say('可放棄未送出的本機輸入後離開。已套用的共享內容會保留；儲存涵蓋整個模組，離頁不會另存快照或撤回他人的修改。','Có thể bỏ đầu vào cục bộ chưa gửi rồi rời đi. Nội dung chung đã áp dụng được giữ; rời trang không lưu ảnh chụp hay hoàn tác thay đổi của người khác.'),
      pending:()=>say('草稿待審或唯讀鎖定；可保留輸入，或只放棄本人未送出的本機內容，不會代為撤回共享草稿。','Bản nháp chờ duyệt hoặc chỉ đọc; giữ nội dung hoặc chỉ bỏ dữ liệu cục bộ chưa gửi của mình, không rút bản nháp chung.'),
      permission:()=>say('目前無套用權限；可留頁保留輸入，或只放棄本人未送出的本機輸入，不會修改共享內容。','Không có quyền áp dụng; ở lại giữ nội dung hoặc chỉ bỏ dữ liệu cục bộ chưa gửi của mình, không đổi nội dung chung.'),
      save:()=>say('目前沒有儲存權限；輸入仍保留，請留頁確認權限。','Hiện không có quyền lưu; giữ nội dung, ở lại kiểm tra quyền.'),
    };
    const roots=()=>[config.root?.(),...(config.dialogs?.()||[])].filter(Boolean);
    const context=()=>JSON.stringify(config.context?.()??config.flow?.()?.generation??null);
    const sharedDirty=()=>config.sharedDirty?!!config.sharedDirty():!!host.sharedDraftNeedsSave?.(config.flow?.());
    function unknownPlan(){try{
      if(typeof config.discardUnknown!=='function'||config.unknownReady?.()===false)return null;
      const peers=[...new Set(config.unknownTransports?.()||[])].filter(Boolean);if(!peers.length||peers.some(client=>client.departureIdle?.()!==true))return null;
      const pins=peers.filter(client=>client.hasUnknown()).map(client=>({client,anchor:client.departureUnknown()}));
      if(!pins.length||pins.some(pin=>!pin.anchor)||peers.some(client=>!client.hasUnknown()&&client.hasSyncFailures?.()))return null;
      return {peers,pins};
    }catch{return null;}}
    function inspect(){
      const clean={state:'clean',canSave:false,canDiscard:false,reason:''};
      if(operation&&!current(operation))return {...clean,state:'unknown',reason:messages.context()};
      if(config.active?.()===false)return clean;
      if(host.ProcessSync?.requiresReload||config.current?.()===false)return {...clean,state:'unknown',reason:messages.context()};
      if(operation?.phase==='writing'||config.busy?.()||host.ProcessNavigationForms?.composing?.())return {...clean,state:'busy',reason:messages.busy()};
      if(config.unknown?.()){
        if(operation?.unknown&&operation.phase==='held'&&!config.local?.()&&operation.coverage?.every(lease=>lease.current()))return {...clean,state:'departing',departureId:operation.id,reason:messages.unknownLeave()};
        const canAbandon=!!unknownPlan();return {...clean,state:'unknown',canAbandon,reason:canAbandon?messages.unknownLeave():messages.unknown()};
      }
      if(config.failed?.())return {...clean,state:'blocked',reason:messages.failed()};
      if(operation?.kind==='abandon'&&operation.phase==='held'&&!config.local?.())return {...clean,state:'departing',departureId:operation.id,reason:messages.shared()};
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
      const canDiscard=local&&!shared&&typeof config.discard==='function',canAbandon=!local||typeof config.discard==='function';
      if(config.locked?.()||config.flow?.()?.pendingId)return {...clean,state:'dirty',canDiscard,canAbandon,reason:messages.pending()};
      const canSave=config.canSave?.()===true&&(!local||config.localSave?.()===true);
      return {state:'dirty',canSave,canDiscard,canAbandon,reason:local&&!config.canDiscard?.()&&config.localSave?.()!==true?messages.permission():local&&config.localSave?.()!==true?(config.localReason?.()||messages.local()):!canSave?messages.save():shared?messages.shared():config.localReason?.()||say('這些輸入僅在本機；儲存會依原模組流程提交並固定版本，放棄只清除未送出的輸入。','Nội dung chỉ ở máy này; Lưu gửi và cố định phiên bản theo quy trình mô-đun, Bỏ chỉ xóa nội dung chưa gửi.')};
    }
    const capture=()=>({identity:host.ProcessSync?.identity,epoch:host.ProcessSync?.identityGeneration?.(),delivery:host.ProcessSync?.captureDelivery?.(),context:context(),root:config.root?.()});
    const current=record=>record.identity===host.ProcessSync?.identity&&record.epoch===host.ProcessSync?.identityGeneration?.()&&record.context===context()&&record.root===config.root?.()&&!host.ProcessSync?.requiresReload&&(!record.delivery||host.ProcessSync?.isCurrentDelivery?.(record.delivery)!==false)&&config.current?.()!==false;
    async function act(kind){
      const status=inspect();if(operation||!(status.state==='dirty'||kind==='abandon'&&status.state==='unknown')||!status[kind==='save'?'canSave':kind==='abandon'?'canAbandon':'canDiscard'])throw Error(status.reason||messages.context());
      const plan=status.state==='unknown'?unknownPlan():null;if(status.state==='unknown'&&!plan)throw Error(messages.context());
      const record={...capture(),kind,id:{},unknown:!!plan,committed:false,coverage:[]},locked=roots().map(node=>({node,inert:node.inert}));
      operation=record;record.phase='writing';for(const {node} of locked)node.inert=true;
      let released=false;record.release=()=>{if(released)return;released=true;for(const {node,inert} of locked)node.inert=inert;locked.length=0;if(record.unknown&&!record.committed)for(const lease of record.coverage)lease.release();if(record.committed)record.root=null;if(operation===record)operation=null;};
      try{
        if(!current(record))throw Error(messages.context());
        // Discard is local-only and synchronous unless a module explicitly
        // provides a checked implementation. No backend rollback lives here.
        if(plan){await config.discardUnknown();if(config.local?.())throw Error(messages.failed());for(const {client,anchor}of plan.pins)record.coverage.push(client.coverDeparture(anchor,()=>record.committed||operation===record&&current(record)&&!config.local?.()&&config.unknownReady?.()!==false&&plan.peers.length===[...new Set(config.unknownTransports?.()||[])].filter(Boolean).length&&plan.peers.every(client=>(config.unknownTransports?.()||[]).includes(client))));}
        else if(kind==='abandon'){if(config.local?.())await config.discard();}else if(kind==='discard')await config.discard();else if(!await config.save({current:()=>current(record),assert(){if(!current(record))throw Error(messages.context());}}))throw Error(messages.failed());
        if(!current(record))throw Error(messages.context());
        record.phase='held';const after=inspect();
        if(kind==='abandon'?(after.state!=='departing'||config.local?.()):after.state!=='clean')throw Error(after.reason||messages.failed());
        return {departureId:kind==='abandon'?record.id:undefined,release:record.release};
      }catch(error){record.release();throw error;}
    }
    return {inspect,covered:()=>completedCoverage.length>0&&completedCoverage.every(lease=>lease.current()),otherDraftsPending(){const plan=config.unknown?.()&&unknownPlan();if(plan)return plan.peers.some(client=>client.otherDeparturePending(plan.peers));const pending=host.sharedDraftAccountState?.()||{};return host.sharedDraftDepartureBlocked?.()??!!(pending.unknown||pending.failed);},ownsRuntimeLocal:()=>config.ownsRuntimeLocal?.()===true,save:()=>act('save'),discard:()=>act('discard'),abandon:()=>act('abandon'),ownsDialog:node=>(config.dialogs?.()||[]).includes(node),closeClean(){const status=inspect();if(!['clean','departing'].includes(status.state))throw Error(status.reason);config.closeClean?.();if(operation?.unknown){operation.committed=true;completedCoverage=operation.coverage;}}};
  }
  host.VersionDraftUI={createApprovedHistory,renderApprovedCollections,historyVersion,clearHistory,createDeparture,masterChanges,mount,t,date,issueMessage,confirmSubmit,confirmReview,preserveView,reasonFor,updateSaved,updateSync};
  const priorValidation=host.renderSharedDraftValidation;
  host.renderSharedDraftValidation=options=>{const shell=options.after?.closest('.vd-shell');if(shell)shell.querySelectorAll('[data-shared-issue-kind]').forEach(node=>node.remove());priorValidation?.(options);if(shell){for(const kind of ['error','missing','warning']){const section=shell.querySelector(kind==='warning'?'.vd-history':'.vd-'+(kind==='error'?'errors':'missing'));for(const node of shell.querySelectorAll('.shared-validation [data-shared-issue-kind="'+kind+'"]')){section.querySelector('.vd-empty')?.remove();section.append(node);}}shell.querySelectorAll('.shared-validation').forEach(node=>node.remove());}};
  host.addEventListener('process-language-change',()=>document.querySelectorAll('.vd-shell').forEach(shell=>shell.refreshLabels?.()));
  // PROCESS uses its existing writer and scope. Only this display controller
  // receives immutable approved snapshots; source data and private buffers stay put.
  let processHistoryView=null,processHistoryEpoch=0,processHistoryLease=null,processHistoryResume=null,processHistoryFlight=null;
  const processHistoryCurrent=()=>!processHistoryResume&&!processHistoryView?.blocked;
  const captureProcessDisplay=()=>{const epoch=processHistoryEpoch,root=document.querySelector('#data-content');return()=>epoch===processHistoryEpoch&&processHistoryCurrent()&&root===document.querySelector('#data-content');};
  function retireProcessHistory(){processHistoryEpoch++;processHistoryView?.retire();processHistoryView=null;processHistoryResume=null;}
  if(host.ProcessMasterVersioning)Object.assign(host.ProcessMasterVersioning,{guardCurrentHandler:processMasterHandler,currentDisplay:processHistoryCurrent,captureDisplay:captureProcessDisplay,retireApprovedHistory:retireProcessHistory,openApprovedVersion:id=>processHistoryView?.openVersion(id),refreshHistoryControls:()=>processHistoryView?.refreshControls(),historyReady:()=>processHistoryFlight||Promise.resolve()});
  function mountProcessHistory(shell,log,empty){
    const shared=host.MasterDataWorkflow.shared,client=shared.client('PROCESS'),root=document.querySelector('#data-content'),resume=processHistoryResume;processHistoryResume=null;
    processHistoryView?.retire();
    if(processHistoryLease!==shared){processHistoryLease=shared;shared.setApprovedDisplayLease('PROCESS',{current:processHistoryCurrent,epoch:()=>processHistoryEpoch,refresh:()=>processHistoryView?.refreshControls()});}
    processHistoryView=createApprovedHistory({root,shell,client,empty,selectId:'process-approved-version',initialBlocked:!!resume,
      isCurrent:()=>state.view==='data'&&state.dataTab==='process-master'&&document.querySelector('#data-content')===root&&shared.client('PROCESS')===client,
      canChoose:()=>!shared.busy()&&!saveProcessMasterDraft.flight&&!host.ProcessMasterVersioning.departureNames.dirty()&&!host.ProcessEquipment?.hasUnappliedChanges?.()&&!document.querySelector('dialog[open]')&&![...root.querySelectorAll('[data-master-media]')].some(input=>input.disabled||input.files?.length),
      onBoundary(){processHistoryEpoch++;},
      onDenied(){shared.retireUndispatchedSaveChoice?.('PROCESS');},
      renderCurrent(){processHistoryView=null;state.processMasterVersionId=processMasterDraft()?.id||processMasterPending()?.id||selectedProcessMasterVersion()?.id;repaintProcessMasterPage();},
      validateSnapshot:snapshot=>snapshot&&typeof snapshot==='object'&&!Array.isArray(snapshot)&&Object.values(snapshot).every(list=>Array.isArray(list)&&list.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&(row.equipment===undefined||Array.isArray(row.equipment)&&row.equipment.every(item=>item&&typeof item==='object'&&!Array.isArray(item))))),
      renderSnapshot(target,snapshot,current){const fields={name:['名稱','Tên'],nameVi:['越文名稱','Tên tiếng Việt'],id:['編號','Mã'],equipment:['機器／設備','Máy / thiết bị'],mediaItems:['歷史圖片','Ảnh lịch sử'],stageCode:['工段','Công đoạn'],number:['設備編號','Mã thiết bị'],note:['備註','Ghi chú']};renderApprovedCollections(target,snapshot,{collections:Object.keys(snapshot),fields,mediaURL:photo=>client.mediaURL(photo)},current);}
    });
    processHistoryFlight=resume?.id?processHistoryView.openVersion(resume.id):null;if(processHistoryFlight)void processHistoryFlight;
  }
  const previousDataBind=bindDataInner;
  bindDataInner=function(tab){if(tab==='process-master'){processHistoryResume=processHistoryView?.historical?{id:processHistoryView.selectedId}:null;if(processHistoryResume)processHistoryEpoch++;processHistoryView?.retire();processHistoryView=null;}previousDataBind(tab);if(tab!=='process-master')return;for(const node of document.querySelector('#data-content')?.querySelectorAll('input,select,button,textarea')||[])for(const property of ['oninput','onchange','onclick','oncompositionstart','oncompositionend'])if(typeof node[property]==='function')node[property]=processMasterHandler(node,node[property]);
    const shared=host.MasterDataWorkflow?.shared;
    mount(document.querySelector('#data-content'),{header:'.process-master-version',historyClient:()=>shared.client('PROCESS'),mountApprovedHistory:mountProcessHistory,module:document.documentElement.lang==='vi'?'Dữ liệu quy trình PROCESS':'PROCESS 流程資料',scope:'PROCESS',version:selectedProcessMasterVersion(),versions:processMasterVersions(),active:processMasterVersions().find(v=>v.status==='approved'),flow:shared?.flow('PROCESS'),actions:{begin:'#process-master-new-draft',save:'#save-master-data',submit:'#process-master-submit',review:'#process-master-review',withdraw:'#process-master-withdraw'},errors:'[data-shared-issue-kind="error"]',missing:'[data-shared-issue-kind="missing"]',history:['[data-shared-issue-kind="warning"]'],remove:['.process-master-history','[data-process-history]'],status:['#process-shared-status']});
  };
})(window);

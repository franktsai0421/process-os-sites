(() => {
'use strict';
const t=(zh,vi)=>document.documentElement.lang.toLowerCase().startsWith('vi')?vi:zh;
const names={disabled:['停用','Ngừng sử dụng'],failed:['不合格','Không đạt'],failure:['不合格設備','Thiết bị không đạt'],retestRequest:['復測申請','Đề nghị kiểm tra lại'],scrapRequest:['報廢申請','Đề nghị thanh lý'],review:['待審文件','Hồ sơ chờ duyệt'],
 available:['可使用','Có thể sử dụng'],near:['30 天內到期','Đến hạn trong 30 ngày'],expired:['已到期','Đã quá hạn'],missing:['待補設定','Thiếu thiết lập'],suspended:['暫停使用','Tạm ngưng'],retired:['已報廢','Đã thanh lý'],
 internal:['內校','Nội bộ'],external:['外校','Bên ngoài'],pass:['合格','Đạt'],fail:['不合格','Không đạt'],abnormal:['異常','Bất thường'],retestPass:['複校合格','Hiệu chuẩn lại đạt'],retestFail:['複校不合格','Hiệu chuẩn lại không đạt'],
 plan:['校準計畫','Kế hoạch hiệu chuẩn'],initial:['初校報告','Báo cáo lần đầu'],retest:['複校報告','Báo cáo hiệu chuẩn lại'],handling:['異常處理','Xử lý bất thường'],scrap:['報廢申請','Đề nghị thanh lý'],draft:['草稿','Bản nháp'],discarded:['已放棄','Đã bỏ'],pending:['待核准','Chờ phê duyệt'],approved:['已核准','Đã duyệt'],
 mark:['單件標記','Mã từng chiếc'],individual:['單件數量','Số lượng từng chiếc'],expiry:['到期日','Ngày hết hạn'],cycle:['週期','Chu kỳ']
};
const n=k=>names[k]?t(...names[k]):k;
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const apiPath='/api/piece-calibration';
const photoPath=apiPath+'/photo',photoRead=photoPath+'?id=';
const title=()=>t('檢具與測試設備校準','Hiệu chuẩn dụng cụ và thiết bị thử nghiệm');
window.PieceCalibration={mount(root, context){
let pane=root, filters, results,documents,summary,message, state,busy=false,gen=0;
const selected=new Set(),expanded=new Set();
const allowed=a=>state.actions.includes(a);
const get=sel=>pane.querySelector(sel);
const has=(r,value)=>value==='retired'?!!r.retirement:r.history.some(x=>
 value==='retestPass'||value==='retestFail'?x.kind==='retest'&&x.result?.outcome===(value==='retestPass'?'pass':'fail'):x.result?.outcome===value);
function visible(overrides={}){
 const f={...Object.fromEntries(new FormData(filters)),...overrides};
 return state.items.filter(r=>(!r.retirement||f.history==='retired')&&
 (!f.search||[r.assetCode,r.mark,r.name,r.nameVi].some(x=>String(x||'').toLocaleLowerCase().includes(f.search.trim().toLocaleLowerCase())))&&
 ['method','category','subcategory','group','status'].every(k=>!f[k]||r[k]===f[k])&&(!f.history||has(r,f.history)));
}
function selection(){
 const rows=visible(),ids=new Set(rows.map(r=>r.id)),hidden=[...selected].filter(id=>!ids.has(id)).length;
 summary.textContent=t('顯示 '+rows.length+' 件，已選 '+selected.size+' 件，隱藏選取 '+hidden+' 件','Hiện '+rows.length+' chiếc · Đã chọn '+selected.size+' · Ẩn '+hidden);
 get('[data-clear]').disabled=!selected.size;
 get('[data-selected-list]').innerHTML=[...selected].map(id=>pieceSummary(id)).join('');
 get('[data-selection-details]').hidden=!selected.size;
 get('[data-selected-label]').textContent=t('已選設備','Thiết bị đã chọn')+' · '+selected.size;
 get('[data-create]').disabled=busy||!allowed('newPlan')||!selected.size||!!hidden||new Set(rows.filter(r=>selected.has(r.id)).map(r=>r.method)).size!==1;
}
function repaintFrom(control){
 const anchor=filters.querySelector('.rf-status-filters');
 const restore=window.RoutineFQCUI?.keepListAnchor?.(anchor,()=>anchor,()=>control);
 renderRows();restore?.();
}
const unknownAsset=()=>t('未記錄固定資產編號','Chưa ghi mã tài sản cố định');
// Keep the original master mark. Qualify colliding display labels with the existing record ID.
const ambiguousIds=new Set();
function indexPieceLabels(items){
 ambiguousIds.clear();
 const first=new Map();
 for(const item of items){
   const key=JSON.stringify([item.assetCode,item.mark].map(v=>String(v||'').trim().toUpperCase()));
   if(first.has(key)){ambiguousIds.add(first.get(key));ambiguousIds.add(item.id);}
   else first.set(key,item.id);
 }
}
const recordLabel=r=>ambiguousIds.has(r?.id)?t('件號重複，請核對實物；紀錄編號 ','Trùng mã từng chiếc, hãy đối chiếu thiết bị. Mã hồ sơ ')+r.id:'';
const identity=r=>r?.missingMaster?t('單件主檔未記錄 · ','Chưa ghi danh mục thiết bị · ')+r.id:[r?.assetCode||unknownAsset(),t(r?.name||r?.nameVi,r?.nameVi||r?.name)||t('未記錄名稱','Chưa ghi tên'),r?.mark,recordLabel(r)].filter(Boolean).join(' · ');
const byId=id=>state.items.find(item=>item.id===id)||state.archive?.find(item=>item.id===id);
const reference=id=>h(identity(byId(id)));
function masterDetails(r){
 const group=(heading,entries)=>'<section class="cal-detail-group"><h4>'+heading+'</h4><dl class="cal-facts">'+entries.map(([label,value])=>'<div><dt>'+h(label)+'</dt><dd>'+h(value||'—')+'</dd></div>').join('')+'</dl></section>';
 const category=group(t('設備資料','Thông tin thiết bị'),[[t('類別','Loại'),r.category],[t('子類別','Loại phụ'),r.subcategory],[t('群組','Nhóm'),r.group],
 [t('數量／單位','Số lượng / đơn vị'),[r.quantity,r.unit].filter(x=>x!=null&&x!=='').join(' ')],[t('保管人','Người giữ'),r.owner]]);
 const dates=group(t('校準狀態','Tình trạng hiệu chuẩn'),[[t('最近校準日','Lần hiệu chuẩn gần nhất'),r.dates?.calibratedAt],[t('有效期限','Ngày hết hạn'),r.dates?.expiresAt],[t('狀態','Trạng thái'),n(r.status)]]);
 return '<div class="cal-detail-grid">'+category+dates+'</div>';
}
function pieceSummary(id){
 const r=byId(id);
 if(!r)return '<article class="cal-piece-summary"><strong>'+reference(id)+'</strong><p>'+t('目前設備主檔無此單件資料','Danh mục hiện tại không có thông tin thiết bị này')+'</p></article>';
 return '<article class="cal-piece-summary"><strong>'+reference(id)+'</strong><p>'+h(n(r.method))+' · '+t('有效期限','Hạn hiệu chuẩn')+' '+h(r.dates?.expiresAt||'—')+' · '+t('現況','Hiện trạng')+' <span class="cal-status" data-tone="'+h(r.status)+'">'+h(n(r.status))+'</span></p><details><summary>'+t('設備明細','Chi tiết thiết bị')+'</summary>'+masterDetails(r)+'</details></article>';
}
function submittedInfo(d){
 const info=d.submitter;
 if(!info)return '';
 const date=new Date(info.at);
 const time=Number.isFinite(date.valueOf())?Intl.DateTimeFormat(t('zh-TW','vi-VN'),{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'}).format(date)+' (UTC+7)':'';
 return [info.name,time].filter(Boolean).map(h).join(' · ');
}
function itemCard(r){
 const entry=(label,value)=>'<div><dt>'+h(label)+'</dt><dd>'+h(value||'—')+'</dd></div>';
 const values=[entry(t('校準方式','Phương pháp'),n(r.method)),entry(t('有效期限','Ngày hết hạn'),r.dates.expiresAt),entry(t('分類','Phân loại'),[r.category,r.subcategory].filter(Boolean).map(v=>v).join(' › ')),entry(t('群組','Nhóm'),r.group),entry(t('數量','Số lượng'),[r.quantity??'—',r.unit].filter(Boolean).join(' ')),entry(t('保管人','Người giữ'),r.owner)];
 const selectable=r.selectable&&allowed('newPlan');
 const reason=r.missing.length?t('主檔待補：','Thiếu thiết lập: ')+r.missing.map(n).join('、'):
   r.status==='retired'?t('設備已報廢','Đã thanh lý'):
   ['failed','suspended'].includes(r.status)?t('已有不合格結果','Đã có kết quả không đạt'):
   !r.selectable?t('計畫進行中','Đang có kế hoạch'):t('無建計畫權限','Không có quyền lập kế hoạch');
 const heading='<span class="cal-title"><span class="cal-code">'+h([r.assetCode,r.mark].filter(Boolean).join(' / '))+'</span><strong>'+h(t(r.name||r.nameVi,r.nameVi||r.name)||'—')+'</strong>'+(ambiguousIds.has(r.id)?'<small class="cal-record-label">'+h(recordLabel(r))+'</small>':'')+'</span>';
 const picker=selectable?'<label class="cal-pick-line"><span class="cal-pick-control"><input type="checkbox" data-id="'+h(r.id)+'" '+(selected.has(r.id)?'checked':'')+'><span class="cal-available">'+t('可勾選','Có thể chọn')+'</span><span class="cal-picked">'+t('已選取','Đã chọn')+'</span></span>'+heading+'</label>':
   '<div class="cal-pick-line"><span class="cal-pick-lock"><b><span aria-hidden="true">🔒</span> '+t('不可勾選','Không thể chọn')+'</b><small>'+h(reason)+'</small></span>'+heading+'</div>';
 return '<article class="rf-calendar-card cal-item"><div class="cal-top">'+picker+'<span class="rf-period-chip cal-status" data-tone="'+h(r.status)+'">'+h(n(r.status))+'</span></div><dl class="cal-properties">'+values.join('')+'</dl>'+
 (r.missing.length?'<p class="cal-warning">'+t('請在設備主檔補齊並核准。','Bổ sung và phê duyệt trong danh mục thiết bị.')+'</p>':'')+
 '<div class="cal-row-actions"><button type="button" class="rf-btn" data-piece-record="'+h(r.id)+'">'+t('紀錄','Hồ sơ')+'</button><details data-expand="'+h(r.id)+'" '+(expanded.has(r.id)?'open':'')+'><summary>'+t('設備明細與操作','Chi tiết và thao tác')+'</summary>'+masterDetails(r)+(r.retirement?'<p>'+h([r.retirement.date,r.retirement.reason,r.retirement.reviewer].join(' · '))+'</p>':'')+(allowed('reset')?'<div class="cal-detail-operations"><button type="button" class="rf-btn cal-reset" data-reset-piece="'+h(r.id)+'">'+t('預覽重設最近一輪','Xem trước đặt lại đợt gần nhất')+'</button></div>':'')+'</details></div></article>';
}
// Project only this physical piece's approved documents; the master asset code is not a join key.
function pieceCycles(piece,sourceDocs=state.docs){
 const docs=sourceDocs.filter(d=>d.ids?.includes(piece.id)&&(d.status==='approved'||d.kind==='plan'&&['draft','pending','discarded'].includes(d.status)));
 const groups=new Map(),seen=new Set();
 for(const d of docs){
   if(d.kind==='plan'&&d.plan&&!groups.has(d.plan))groups.set(d.plan,{key:d.plan,plan:d,events:[]});
 }
 const legacy={key:null,events:[]};
 for(const d of docs){
   const group=groups.get(d.plan);
   if(d.kind==='plan'&&group?.plan===d){seen.add(d.id);continue;}
   const result=d.rows?.find(row=>row.id===piece.id);
   (group||legacy).events.push({id:d.id,kind:d.kind,result,reason:d.reason,scheduled:d.scheduled,scheduledEnd:d.scheduledEnd,window:result?.retestTiming||approvedRetestWindow(d,sourceDocs),review:d.review,submitter:d.submitter});
   seen.add(d.id);
 }
 for(const event of piece.history||[]){
   if(seen.has(event.id)||event.result&&event.result.id!==piece.id)continue;
   legacy.events.push(event);seen.add(event.id);
 }
 if(piece.retirement&&![...docs,...(piece.history||[])].some(e=>e.kind==='scrap'||e.kind==='scrapRequest')){
   legacy.events.push({kind:'scrap',retiredOn:piece.retirement.date,reason:piece.retirement.reason});
 }
 const grouped=[...groups.values()].reverse();
 const ordered=grouped;
 if(ordered.length)ordered[0].latestActual=true;
 // Keep the round number independent of searching, expansion and later plans.
 ordered.forEach((round,index)=>{round.number=ordered.length-index;});
 for(const d of sourceDocs){
   if(!['pending','draft'].includes(d.status)||!d.ids?.includes(piece.id)||d.kind==='plan')continue;
   const round=groups.get(d.plan);
   if(round)round.current={kind:d.kind,status:d.status};
 }
 if(legacy.events.length)ordered.push(legacy);
 return ordered;
}
const isReport=e=>e.kind==='initial'||e.kind==='retest';
function eventDay(e){
 const at=e.review?.at;
 if(!at||!Number.isFinite(Date.parse(at)))return '';
 return new Date(Date.parse(at)+7*3600000).toISOString().slice(0,10);
}
function closeReason(c){
 if(!c.plan)return '';
 const last=c.events.at(-1);
 if(last?.kind==='scrap'||last?.kind==='scrapRequest')return 'scrap';
 return isReport(last||{})&&last.result?.outcome==='pass'?'pass':'';
}
function cycleStatus(c){
 if(!c.plan)return t('原計畫未確認','Chưa rõ kế hoạch gốc');
 if(c.plan.status!=='approved')return n('plan')+' · '+n(c.plan.status);
 const end=closeReason(c);
 if(end==='scrap')return t('報廢結案','Đã thanh lý');
 if(end==='pass')return t('合格結案','Đạt · Đã đóng');
 const active=c.current;
 if(active&&active.kind!=='failure'){
   const pending=active.status==='pending';
   return n(active.kind)+' · '+(pending?t('待核准','Chờ duyệt'):t('待填寫','Chờ lập'));
 }
 const last=c.events.at(-1);
 if(!last)return t('待初校報告','Chờ báo cáo lần đầu');
 if(last.kind==='retestRequest')return t('待復測報告','Chờ báo cáo kiểm tra lại');
 if(last.result?.outcome==='fail')return t('不合格，待後續處理','Không đạt · Chờ xử lý');
 return n(last.kind)+' · '+t('待後續處理','Chờ xử lý');
}
function eventMarkup(e,repeat=0){
 const result=e.result;
 const photos=(result?.photos||[]).filter(id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id));
 const window=e.window||result?.retestTiming;
 const facts=[result?.date&&t('實際日 ','Ngày thực tế ')+result.date,result?.outcome&&n(result.outcome),result?.expiresAt&&t('有效至 ','Hạn đến ')+result.expiresAt,e.scheduled&&t('預定（越南） ','Dự kiến (Việt Nam) ')+windowText({start:e.scheduled,end:e.scheduledEnd||e.scheduled}),window&&t('核准預定（越南） ','Dự kiến đã duyệt (Việt Nam) ')+windowText(window),lateText(result?.date,window),e.retiredOn&&t('報廢日 ','Ngày thanh lý ')+e.retiredOn,e.reason,e.submitter?.at&&t('送審 ','Đã gửi ')+eventDay({review:e.submitter})+' '+(e.submitter.name||''),eventDay(e)?t('核准 ','Đã duyệt ')+eventDay(e)+' '+(e.review?.name||''):t('核准日期未記錄','Chưa ghi ngày duyệt')].filter(Boolean);
 return '<li data-step="'+h(e.kind)+'"><strong>'+h(n(e.kind))+(repeat?' · '+repeat:'')+'</strong><p>'+facts.map(h).join(' · ')+'</p>'+photos.map((id,i)=>'<a class="cal-evidence" href="'+photoRead+encodeURIComponent(id)+'" target="_blank" rel="noopener">'+t('照片 ','Ảnh ')+(i+1)+'</a>').join(' ')+'</li>';
}
function roundTimeline(c){
 let repeat=0;
 // The ledger creates the next document only after approval of its predecessor.
 // Do not sort the workflow by a backdated measurement or a scheduled appointment.
 const trail=c.events.map(e=>eventMarkup(e,e.kind==='retest'?++repeat:0)).join('');
 if(!c.plan)return '<p>'+t('找不到已核准的原計畫，本區不計入流程輪數。','Chưa xác định được kế hoạch gốc đã duyệt. Phần này không tính vào số đợt.')+'</p><ol class="cal-timeline">'+trail+'</ol>';
 const plan=c.plan, submitted=eventDay({review:plan.submitter}), approved=eventDay(plan);
 const missing=t('日期未記錄','Chưa ghi ngày');
 const step=(key,label,detail)=>'<li data-step="'+key+'"><strong>'+h(label)+'</strong><p>'+h(detail)+'</p></li>';
 let steps='';
 if(submitted)steps+=step('plan-submit',t('計畫送審','Gửi duyệt kế hoạch'),submitted+' '+(plan.submitter.name||''));
 if(plan.status==='approved')steps+=step('plan-approve',t('計畫核准','Phê duyệt kế hoạch'),(approved||missing)+' '+(plan.review?.name||'')+(submitted?'':t(' · 送審時間未記錄',' · Chưa ghi thời điểm gửi duyệt')));
 steps+=trail;
 const closed=closeReason(c);
 steps+=step(closed?'closed':'current',closed?t('流程結案','Kết thúc đợt'):t('目前進度','Bước hiện tại'),cycleStatus(c));
 return '<ol class="cal-timeline">'+steps+'</ol>';
}
let recordPiece=null,recordButton=null,cycles=[];
function renderCycles(){
 const query=get('[data-record-search]').value.trim().toLocaleLowerCase();
 const hits=cycles.filter(c=>(/^\d{4}-\d{2}-\d{2}$/.test(query)&&c.plan?.start<=query&&query<=c.plan?.end)||[c.key,c.plan?.id,c.plan?.start,c.plan?.end,eventDay(c.plan||{}),cycleStatus(c),...c.events.flatMap(e=>[e.result?.date,e.scheduled,e.retiredOn,eventDay(e)])].some(v=>String(v||'').toLocaleLowerCase().includes(query)));
 const approvedRounds=cycles.filter(c=>c.plan?.status==='approved');
 const total=approvedRounds.length,closed=approvedRounds.filter(c=>closeReason(c)).length;
 get('[data-round-count]').textContent=t('已核准校準流程 '+total+' 輪',total+' đợt hiệu chuẩn đã duyệt');
 get('[data-round-status]').textContent=t('已結案 '+closed+' 輪 · 進行中 '+(total-closed)+' 輪','Đã đóng '+closed+' · Đang thực hiện '+(total-closed));
 const missing=t('未記錄','Chưa ghi');
 get('[data-cycle-list]').innerHTML=hits.map((c,i)=>{
   const period=c.plan?[c.plan.start||missing,c.plan.end||missing].join(' ～ '):t('舊紀錄：原計畫未記錄','Hồ sơ cũ: chưa ghi kế hoạch gốc');
   const rank=c.plan?t('第 '+c.number+' 輪','Đợt '+c.number):t('未計入輪數','Không tính vào số đợt');
   const blockers=c.latestActual?c.plan.ids.flatMap(id=>{
     const latest=state.docs.findLast(d=>d.kind==='plan'&&d.ids.includes(id));
     return latest&&latest.plan!==c.key?[identity(byId(id))+' · '+latest.plan]:[];
   }):[];
   const blockMessage=blockers.length?t('請先重設較新的計畫：','Hãy đặt lại kế hoạch mới hơn trước: ')+blockers.join('；'):'';
   const reset=c.latestActual&&!context.review&&allowed('reset')?'<button type="button" class="rf-btn cal-reset" data-reset-plan="'+h(c.key)+'" '+(blockers.length?'disabled':'')+'>'+t('重設這一輪','Đặt lại đợt này')+'</button>':'';
   const latest=c.latestActual?' <small data-latest-round>'+t('最新一輪','Đợt mới nhất')+'</small>':'';
   return '<details class="cal-cycle" name="cal-cycle-detail" '+(!i?'open':'')+'><summary><b>'+h(rank+' · '+period)+latest+'</b><span>'+h(cycleStatus(c))+'</span>'+(c.key?'<small>'+t('計畫編號','Mã kế hoạch')+' <code>'+h(c.key)+'</code></small>':'')+'</summary><div>'+roundTimeline(c)+reset+(blockMessage?'<p data-round-block>'+h(blockMessage)+'</p>':'')+'</div></details>';
 }).join('')||'<p class="cal-record-empty">'+(cycles.length?t('沒有符合的紀錄','Không tìm thấy hồ sơ phù hợp'):t('此單件尚無已核准的校準紀錄','Thiết bị này chưa có hồ sơ hiệu chuẩn được duyệt'))+'</p>';
}
function openRecord(button){
 const piece=byId(button.dataset.pieceRecord);if(!piece)return;
 recordPiece=piece;recordButton=button;cycles=pieceCycles(piece);
 get('[data-record-identity]').textContent=identity(piece);get('[data-record-reset-note]').textContent='';get('[data-record-search]').value='';
 renderCycles();get('[data-piece-dialog]').showModal();get('[data-close-record]').focus({preventScroll:true});
}
function flowOutcomes(){
 const arrow='<span aria-hidden="true">→</span>';
 return '<div class="cal-route-pass"><b>'+n('pass')+'</b>'+arrow+t('結案','Kết thúc')+'</div><div class="cal-route-fail"><b>'+n('fail')+'</b>'+arrow+'<div><div>'+t('復測','Kiểm tra lại')+' <span aria-hidden="true">↩</span> '+t('回校準報告','Về báo cáo hiệu chuẩn')+'</div><div>'+t('報廢','Thanh lý')+' '+arrow+' '+t('結案','Kết thúc')+'</div></div></div>';
}

function renderRows(){
 const rows=visible();
 for(const tile of filters.querySelectorAll('[data-facet]')){
   const key=tile.dataset.facet,value=tile.value;
   tile.setAttribute('aria-pressed',String(filters.elements[key].value===value));
   tile.querySelector('b').textContent=visible({[key]:value}).length;
 }
 results.innerHTML=rows.map(itemCard).join('')||'<p class="rf-empty ri-empty">'+t('沒有符合條件的核准單件。請檢查設備主檔的啟用狀態與校準方式。','Không có thiết bị đã duyệt phù hợp. Kiểm tra trạng thái và phương pháp trong danh mục.')+'</p>';
 const archive=[...(state.archive||[]),...state.items.filter(r=>r.retirement)];
 const unlinked=state.docs.filter(d=>d.status==='approved'&&!d.ids?.length);
 const panel=get('[data-archived]');
 panel.hidden=!archive.length&&!unlinked.length;
 panel.querySelector('summary').textContent=t('已停用、報廢或待核對的單件紀錄','Hồ sơ thiết bị ngừng dùng, thanh lý hoặc cần đối chiếu');
 get('[data-archived-list]').innerHTML=archive.map(p=>'<p>'+h(identity(p))+' <button type="button" class="rf-btn" data-piece-record="'+h(p.id)+'">'+t('紀錄','Hồ sơ')+'</button></p>').join('')+
 unlinked.map(d=>'<details><summary>'+t('舊文件・單件未記錄','Hồ sơ cũ · chưa ghi mã thiết bị')+' · '+h(n(d.kind))+' · '+h(d.id)+'</summary><p>'+h([d.start,d.end,d.reason,d.scheduled,eventDay(d),d.review?.name].filter(Boolean).join(' · '))+'</p><ul>'+(d.rows||[]).map(r=>eventMarkup({kind:d.kind,result:r,review:d.review})).join('')+'</ul></details>').join('');
 selection();
}
function choices(k,values){return '<select name="'+k+'"><option value="">'+(k==='outcome'?t('請選擇','Chọn kết quả'):t('全部','Tất cả'))+'</option>'+values.filter(Boolean).map(v=>'<option value="'+h(v)+'">'+h(['category','subcategory','group'].includes(k)?v:n(v))+'</option>').join('')+'</select>';}
function renderFilters(){
 const keep=Object.fromEntries(new FormData(filters));
 const facets=(key,label,options)=>'<section class="rf-status-filters"><header><strong>'+label+'</strong>'+(key==='status'?'<button class="rf-btn" type="reset">'+t('清除所有篩選','Xóa tất cả bộ lọc')+'</button>':'')+'</header><input type="hidden" name="'+key+'"><div class="rf-status-tiles">'+options.map(v=>'<button type="button" data-facet="'+key+'" value="'+v+'" aria-pressed="false">'+h(n(v))+' <b></b></button>').join('')+'</div></section>';
 filters.innerHTML='<div class="rf-source-filters"><label>'+t('搜尋編號、名稱','Tìm theo mã, tên')+'<input name="search" type="search"></label>'+
 [['method',t('校準方式','Phương pháp'),['internal','external']],['category',t('類別','Loại')],['subcategory',t('子類別','Loại phụ')],['group',t('規格群組','Nhóm')]].map(([k,label,opts])=>'<label>'+label+choices(k,opts||[...new Set(state.items.map(r=>r[k]))])+'</label>').join('')+'</div>'+
 facets('status',t('目前狀態','Trạng thái hiện tại'),['available','near','expired','missing','failed','suspended'])+
 facets('history',t('歷史結果','Kết quả trước đây'),['pass','fail','retestPass','retestFail','abnormal','retired']);
 for(const [k,v] of Object.entries(keep))if(filters.elements[k])filters.elements[k].value=v;
}
const empty=label=>'<section class="rf-empty ri-empty"><h3>'+h(label)+'</h3></section>';
let chosen=null,docFilter='',confirmation=null;
const uncertain=new Map();
let feedback=null;
function notify(text,tone='info',focus=false){
 feedback={text,tone};paintFeedback(focus);
}
function paintFeedback(focus=false){
 const area=get('[data-review-feedback]');
 area.hidden=!feedback;
 area.dataset.tone=feedback?.tone||'';
 area.querySelector('span').textContent=feedback?.text||'';
 area.querySelector('button').hidden=feedback?.tone!=='check';
 if(focus&&area.isConnected){area.focus({preventScroll:true});const box=area.getBoundingClientRect();if(box.bottom<0||box.top>innerHeight)area.scrollIntoView({block:'nearest'});}
}
function reconcile(){
 for(const [id,revision] of uncertain){
   const doc=state.docs.find(d=>d.id===id);
   if(doc?.status==='approved'){
     uncertain.delete(id);notify(humanDoc(doc)+' · '+t('已核准，待審清單已更新。','Đã duyệt. Danh sách chờ duyệt đã cập nhật.'),'success');
   }else if(doc&&state.revision>revision){
     uncertain.delete(id);notify(humanDoc(doc)+' · '+t('已讀回最新版本。請核對目前狀態','Đã tải phiên bản mới. Hãy kiểm tra trạng thái')+' · '+n(doc.status));
   }
 }
}
function humanDoc(d){return n(d.kind)+' · '+d.ids.map(id=>identity(byId(id))).join(', ');}
function confirmPanel(d){
 if(confirmation?.id!==d.id)return '';
 return '<section class="cal-confirm" aria-label="'+t('核准確認','Xác nhận duyệt')+'"><strong>'+t('核准這份文件？','Duyệt hồ sơ này?')+'</strong><p>'+h(humanDoc(d))+'</p><div><button type="button" class="rf-btn primary" data-confirm-approve>'+t('確認核准','Xác nhận duyệt')+'</button><button type="button" class="rf-btn" data-cancel-approve>'+t('取消','Hủy')+'</button></div></section>';
}
function approvedRetestWindow(report,docs=state.docs){
 // The ledger appends each report immediately after approval of its per-piece request.
 // A previous report on the same piece ends that pairing, including for legacy data.
 if(report.kind!=='retest'||report.flow!==2||report.ids.length!==1)return '';
 if(report.retestWindow)return report.retestWindow;
 for(let i=docs.indexOf(report)-1;i>=0;i--){
   const d=docs[i];
   if(d.plan!==report.plan||!d.ids.includes(report.ids[0]))continue;
   if(d.kind==='retestRequest'&&d.status==='approved'&&d.ids.length===1)return d.scheduled?{start:d.scheduled,end:d.scheduledEnd||d.scheduled}:null;
   if(d.kind==='retest'||d.kind==='initial'||d.kind==='failure')break;
 }
 return '';
}
function windowText(w){
 if(!w?.start||!w.end)return '';
 const start=w.start.replace('T',' '),end=w.end.replace('T',' ');
 return start===end?start:start+' ～ '+end;
}
function lateText(day,w){
 return day&&w?.end&&day>w.end.slice(0,10)?t('逾期復測','Kiểm tra lại trễ hạn'):'';
}
function actualDayIssue(day,kind){
 const label=kind==='retest'?t('實際復測日','Ngày kiểm tra lại thực tế'):t('實際校準日','Ngày hiệu chuẩn thực tế');
 if(!day)return t('請填寫'+label+'。','Hãy điền '+label.toLocaleLowerCase('vi')+'.');
 if(day<=state.today)return '';
 return t(label+' '+day+' 晚於越南今日 '+state.today+'。請在完成後填寫實際日期。',label+' '+day+' sau ngày hôm nay tại Việt Nam ('+state.today+'). Hãy ghi ngày thực tế sau khi thực hiện.');
}
function renderDocs(){

 const queue=state.docs.filter(d=>inStage(d,stage)).reverse();
 const rows=queue.filter(d=>!docFilter||d.status===docFilter);
 const selectedDoc=rows.find(d=>d.id===chosen);
 get('[data-doc-tools]').hidden=context.review;
 get('[data-doc-tools]').innerHTML=['','draft','pending'].map(status=>'<button type="button" class="rf-btn '+(status===docFilter?'primary':'')+'" data-doc-filter="'+status+'" aria-pressed="'+(status===docFilter)+'">'+(status?h(n(status)):t('全部','Tất cả'))+' · '+queue.filter(d=>!status||d.status===status).length+'</button>').join('');
 get('[data-doc-layout]').classList.toggle('has-selection',!!selectedDoc);
 documents.innerHTML=rows.map(d=>d.kind==='failure'?'<article class="rf-calendar-document"><strong>'+d.ids.map(reference).join(', ')+'</strong><span>'+n('failed')+'</span>'+(allowed('branch')?['retestRequest','scrapRequest'].map(k=>'<button class="rf-btn" data-branch="'+k+'" data-source="'+h(d.id)+'">'+(k==='retestRequest'?t('復測','Kiểm tra lại'):t('報廢','Thanh lý'))+'</button>').join(''):'')+'</article>':'<button type="button" class="rf-calendar-document '+(d.id===chosen?'selected':'')+'" data-open="'+h(d.id)+'"><span class="rf-calendar-doc-top"><strong>'+h(n(d.kind))+'</strong><span class="rf-tag">'+h(n(d.status))+'</span></span><small>'+d.ids.map(reference).join(' / ')+'</small>'+(d.status==='pending'&&submittedInfo(d)?'<small>'+submittedInfo(d)+'</small>':'')+'</button>').join('')||empty(t('此階段沒有工作','Không có việc ở bước này'));
 get('[data-doc-detail]').innerHTML=selectedDoc?[selectedDoc].map(d=>{
 const button=(a,name)=>allowed(a)?'<button class="rf-btn '+(['save','submit','approve'].includes(a)?'primary':'')+'" type="button" data-act="'+a+'" '+(a==='approve'&&(busy||uncertain.has(d.id)||confirmation?.id===d.id)?'disabled':'')+'>'+name+'</button>':'';
 const retestWindow=approvedRetestWindow(d);
 const evidence=(d.rows||[]).map(r=>'<article class="ri-batch"><strong>'+reference(r.id)+'</strong><p>'+(d.kind==='retest'?t('實際復測日','Ngày kiểm tra lại thực tế'):t('實際校準日','Ngày hiệu chuẩn thực tế'))+' '+h(r.date)+' · <b>'+t('本次判定','Kết quả lần này')+' '+h(n(r.outcome))+'</b>'+ (lateText(r.date,retestWindow)?' · <strong data-late>'+h(lateText(r.date,retestWindow))+'</strong>':'')+'</p>'+(r.photos||[]).map((id,i)=>'<a class="rf-photo" target="_blank" rel="noopener" href="'+photoRead+encodeURIComponent(id)+'">'+t('照片','Ảnh')+' '+(i+1)+'</a>').join(' ')+'</article>').join('');
 const fields=d.ids.map(id=>{const row=(d.rows||[]).find(r=>r.id===id);
 return '<fieldset data-row="'+h(id)+'"><legend>'+reference(id)+'</legend><label>'+(d.kind==='retest'?t('實際復測日','Ngày kiểm tra lại thực tế'):t('實際校準日','Ngày hiệu chuẩn thực tế'))+'<input type="date" name="day" aria-describedby="cal-day-'+h(id)+'" max="'+h(state.today)+'" value="'+h(row?.date)+'"><small id="cal-day-'+h(id)+'" data-date-error aria-live="polite"></small><small data-retest-late aria-live="polite"></small></label><label>'+t('判定','Kết quả')+choices('outcome',d.flow===2?['pass','fail']:['pass','fail','abnormal']).replace('value="'+h(row?.outcome)+'"','selected value="'+h(row?.outcome)+'"')+'</label><label>'+t('照片（至少一張）','Ảnh (ít nhất một)')+'<input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/gif" multiple></label><small>'+t('已存照片','Ảnh đã lưu')+' '+(row?.photos?.length||0)+'</small><small data-new-photos></small></fieldset>';}).join('');
 const reason='<label>'+t('原因','Lý do')+'<textarea name="reason">'+h(d.reason)+'</textarea></label>';
 const sched=t('預定復測期間（越南）','Khoảng kiểm tra lại dự kiến (Việt Nam)');
 const edit=d.kind==='plan'?range(d):['initial','retest'].includes(d.kind)?fields:d.kind==='retestRequest'?'<label>'+t('預定復測開始（越南）','Bắt đầu dự kiến (Việt Nam)')+'<input type="datetime-local" name="scheduled" value="'+h(d.scheduled)+'"></label><label>'+t('預定結束（越南；單一時段可留白）','Kết thúc dự kiến (Việt Nam; để trống nếu chỉ hẹn một thời điểm)')+'<input type="datetime-local" name="scheduledEnd" value="'+h(d.scheduledEnd)+'"></label>':reason;
 const last=d.events?.at(-1);
 const events=(d.events||[]).map(e=>{const actions={save:t('儲存','Lưu'),submit:t('送審','Gửi duyệt'),withdraw:t('撤回','Thu hồi'),return:t('退回','Trả về'),approve:t('核准','Phê duyệt'),discard:t('放棄','Hủy bỏ'),branch:t('選擇處置','Chọn hướng xử lý')};return '<li>'+h(actions[e.action]||e.action)+' · '+submittedInfo({submitter:e})+(e.reason?' · '+h(e.reason):'')+'</li>';}).join('');
 const audit=events?'<details class="cal-audit"><summary>'+t('文件歷程','Lịch sử hồ sơ')+'</summary><ol>'+events+'</ol></details>':'';
 const plan=state.docs.find(x=>x.kind==='plan'&&x.plan===d.plan);
 const facts=(d.status!=='draft'&&submittedInfo(d)?'<p><b>'+t('送審人／時間','Người gửi / thời điểm')+'</b> '+submittedInfo(d)+'</p>':'')+(plan?.start&&!(d.kind==='plan'&&d.status==='draft')?'<p><b>'+(d.kind==='retest'||d.kind==='retestRequest'?t('原校準計畫期間','Thời gian kế hoạch hiệu chuẩn ban đầu'):t('計畫期間','Thời gian kế hoạch'))+'</b> '+h(plan.start)+' ～ '+h(plan.end)+'</p>':'')+(d.kind==='retest'?'<p><b>'+t('本次核准的預定復測時間（越南）','Thời gian kiểm tra lại dự kiến đã duyệt (Việt Nam)')+'</b> '+(retestWindow?h(windowText(retestWindow)):t('未記錄','Chưa ghi nhận'))+'</p>':'')+(d.scheduled?'<p>'+sched+' '+h(windowText({start:d.scheduled,end:d.scheduledEnd||d.scheduled}))+'</p>':'')+(d.reason&&d.status!=='draft'?'<p><b>'+t('原因','Lý do')+'</b> '+h(d.reason)+'</p>':'');
 return '<section data-doc="'+h(d.id)+'"><button class="rf-btn" data-back>'+t('返回清單','Về danh sách')+'</button><h3>'+h(n(d.kind))+' · '+h(n(d.status))+'</h3><div class="cal-pieces">'+d.ids.map(pieceSummary).join('')+'</div>'+(last?.action==='return'?'<p>'+t('退回原因','Lý do trả về')+' '+h(last.reason)+'</p>':'')+facts+(d.status==='draft'?'':evidence)+'<div class="rf-actions">'+
 (d.status==='draft'?edit+button('save',t('儲存草稿','Lưu nháp'))+'<div class="cal-submit"><button class="rf-btn primary" type="button" data-act="submit" disabled>'+t('送審','Gửi duyệt')+'</button><small data-submit-hint></small></div>'+(d.flow===2?button('discard',t('放棄草稿','Bỏ bản nháp')):''):d.status==='pending'?(context.review?button('approve',t('核准','Phê duyệt'))+(d.flow===2?button('return',t('退回','Trả về')):''):(d.flow===2?button('withdraw',t('撤回','Thu hồi')):'')):d.kind==='handling'&&!state.docs.some(x=>x.plan===d.plan&&x.kind==='scrap'&&x.ids.includes(d.ids[0]))?button('scrap',n('scrap')):'')+'</div><p role="status" class="cal-draft-notice" data-draft-notice></p>'+confirmPanel(d)+audit+'</section>';}).join(''):empty(t('選擇一筆工作開始','Chọn một hồ sơ'));
 updateDraftControls();
}
function draftIssue(doc,block,submit){
 if(doc.kind==='plan'){
   const start=block.querySelector('[name=start]').value,end=block.querySelector('[name=end]').value;
   if(submit&&(!start||!end))return t('請填完整計畫起日、迄日並儲存。','Điền đủ ngày bắt đầu và kết thúc, rồi lưu.');
   if(start&&end&&end<start)return t('迄日不可早於起日。','Ngày kết thúc phải từ ngày bắt đầu trở đi.');
 }
 if(doc.kind==='retestRequest'){
   const start=block.querySelector('[name=scheduled]').value,end=block.querySelector('[name=scheduledEnd]').value;
   if(!start)return t('請填預定復測時間。','Hãy điền thời gian kiểm tra lại.');
   if(end&&end<start)return t('預定結束不可早於開始。','Thời điểm kết thúc phải từ lúc bắt đầu trở đi.');
 }
 if(['scrapRequest','scrap','handling'].includes(doc.kind)&&!block.querySelector('[name=reason]').value.trim())return t('請填原因。','Hãy điền lý do.');
 for(const field of block.querySelectorAll('[data-row]')){
   const id=field.dataset.row,prefix=(byId(id)?.assetCode||unknownAsset())+' · ';
   const row=doc.rows.find(r=>r.id===id),files=Array.from(field.querySelector('[name=photos]').files);
   const date=field.querySelector('[name=day]').value;
   const issue=actualDayIssue(date,doc.kind);if(issue)return prefix+issue;
   if(!field.querySelector('[name=outcome]').value)return prefix+t('請選擇校準結果。','Hãy chọn kết quả hiệu chuẩn.');
   if(!row?.photos?.length&&!files.length)return prefix+t('請選擇至少一張證據照片。','Chọn ít nhất một ảnh minh chứng.');
   if((row?.photos?.length||0)+files.length>30)return prefix+t('每件最多 30 張照片。','Mỗi thiết bị tối đa 30 ảnh.');
   if(files.length&&!state.photoUploadAllowed)return prefix+t('目前帳號沒有設備照片上傳權限。','Tài khoản không có quyền tải ảnh thiết bị.');
   if(files.some(f=>!f.size||f.size>5000000))return prefix+t('每張照片須有內容，且不超過 5 MB。','Mỗi ảnh phải có nội dung và không vượt quá 5 MB.');
 }
 return '';
}
function updateDraftControls(){
 const block=get('[data-doc]'),submit=block?.querySelector('[data-act=submit]');
 if(!submit)return;
 const doc=state.docs.find(d=>d.id===block.dataset.doc);
 for(const f of block.querySelectorAll('[data-row]')){
   const day=f.querySelector('[name=day]'),error=f.querySelector('[data-date-error]');
   const issue=day.value?actualDayIssue(day.value,doc.kind):'';
   day.setAttribute('aria-invalid',String(!!issue));
   if(error.textContent!==issue)error.textContent=issue;
   const late=f.querySelector('[data-retest-late]'),note=issue?'':lateText(day.value,approvedRetestWindow(doc));
   if(late.textContent!==note)late.textContent=note;
   const count=f.querySelector('[name=photos]').files.length;
   f.querySelector('[data-new-photos]').textContent=count?t('本次選取 '+count+' 張；草稿儲存成功後才會列入已存照片。','Đã chọn '+count+' ảnh. Ảnh sẽ được ghi nhận sau khi lưu nháp thành công.'):'';
 }
 const hint=!allowed('submit')?t('目前帳號沒有送審權限。','Tài khoản không có quyền gửi duyệt.'):draftIssue(doc,block,true)||
   (!doc.saved||dirty?t('請先儲存草稿，再送審。','Lưu bản nháp trước khi gửi duyệt.'):'');
 submit.disabled=!!hint||busy||needsRead;
 block.querySelector('[data-submit-hint]').textContent=needsRead?t('請重新讀取最新文件。','Hãy tải lại hồ sơ mới nhất.'):hint;
}
function tell(text){
 message.textContent=text;
 const local=get('[data-draft-notice]');if(local)local.textContent=text;
}
async function upload(file){
 let type=file.type;
 if(!type||type==='application/octet-stream'){
   const head=new Uint8Array(await file.slice(0,12).arrayBuffer());
   const {photoTypeMatches}=await import('./photo-policy.mjs?v=20261023-lossless1');
   type=['image/png','image/jpeg','image/webp','image/gif'].find(k=>photoTypeMatches(head,k));
 }
 const format=t('請使用 JPG、PNG、WebP 或 GIF 照片。','Hãy dùng ảnh JPG, PNG, WebP hoặc GIF.');
 if(!['image/png','image/jpeg','image/webp','image/gif'].includes(type))throw Error(format);
 const r=await fetch(photoPath,{method:'PUT',headers:{'content-type':type},body:file});
 if(!r.ok)throw Error(r.status===403?t('沒有上傳照片的權限。','Không có quyền tải ảnh.'):r.status===413?t('每張照片最多 5 MB。','Mỗi ảnh tối đa 5 MB.'):r.status===415||r.status===422?format:t('照片上傳未確認；草稿尚未送出。','Chưa xác nhận tải ảnh. Bản nháp chưa được gửi.'));
 return (await r.json()).id;
}
async function api(cmd){
 const r=await fetch(apiPath,cmd?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:state.revision,...cmd})}:{cache:'no-store'});
 const body=await r.json();if(!r.ok){const err=Error(body.error==='EQUIPMENT_STILL_REFERENCED'?t('請先替換下列標準的設備並完成核准：','Thay thiết bị và duyệt các tiêu chuẩn sau trước: ')+(body.modules||[]).join('、'):body.error||String(r.status));err.http=r.status;err.blockers=body.blockers;throw err;}return body;
}
async function sync(){const seq=++gen;const next=await api();if(seq!==gen||!context.current())return;state=next;indexPieceLabels([...next.items,...(next.archive||[])]);reconcile();if(state.actions.includes('approve')||state.actions.includes('return'))context.recordCount?.(next.revision,next.docs.filter(d=>d.status==='pending').length);for(const id of selected)if(!state.items.some(r=>r.id===id&&r.selectable))selected.delete(id);
 get('[data-count]').textContent=context.review?n('review')+' · '+state.docs.filter(d=>d.status==='pending').length:t('設備主檔已核准單件','Thiết bị theo danh mục đã duyệt')+' · '+state.items.length;paintStage();renderFilters();renderRows();renderDocs();get('[data-reset]').hidden=context.review||!allowed('reset');}
let resetPreview=null,resetFocus=null;
const resetIssue=code=>({
 EMPTY:t('沒有可重設的校準輪次。','Không có đợt hiệu chuẩn để đặt lại.'),
 NEWER_ROUND:t('此計畫不是所有參與設備的最新一輪。請先處理較新的計畫。','Đây không phải đợt mới nhất của mọi thiết bị. Hãy đặt lại kế hoạch mới hơn trước.'),
 DATE_AMENDMENT_PENDING:t('設備已有日期變更待審，請先處理，未重設任何資料。','Thiết bị có thay đổi ngày chờ duyệt. Hãy xử lý trước. Chưa đặt lại dữ liệu.'),
 BASELINE_UNVERIFIED:t('無法核對原有日期或報廢來源，未重設任何資料。','Không xác minh được ngày ban đầu hoặc hồ sơ thanh lý. Không có dữ liệu nào bị đặt lại.'),
 REVISION:t('資料已變更，請關閉後重新預覽影響。','Dữ liệu đã thay đổi. Đóng và xem trước lại.'),
 CONFIRM:t('重設確認不相符，請重新預覽。','Xác nhận không khớp. Hãy xem trước lại.'),
 FORBIDDEN:t('目前帳號沒有重設權限。','Tài khoản không có quyền đặt lại.'),
})[code]||t('未能確認重設結果，請重新讀取。','Chưa xác minh được kết quả. Hãy tải lại.');
function renderReset(){
 const box=get('[data-reset-dialog]'),p=resetPreview;if(!p||!box.open)return;
 const all=p.scope==='all',c=p.counts;
 const labels={plans:t('計畫','Kế hoạch'),documents:t('文件','Hồ sơ'),submitted:t('已送審','Đã gửi'),pending:t('待審','Chờ duyệt'),approved:t('已核准','Đã duyệt'),reports:t('校準／復測報告','Báo cáo hiệu chuẩn/kiểm tra lại'),photos:t('移除存取的照片','Ảnh bị thu hồi truy cập')};
 const list=p.pieces.map(r=>'<li><b>'+h((r.assetCode||r.id)+' · '+(r.mark||''))+'</b> · '+t('上次','Gần nhất')+' '+h(r.restore.calibratedAt||'—')+' · '+t('下次／效期','Tiếp theo/Hết hạn')+' '+h(r.restore.expiresAt||'—')+' · '+h(n(r.status))+'</li>').join('');
 box.innerHTML='<h3 id="cal-reset-title">'+(all?t('全部校準重設','Đặt lại toàn bộ hiệu chuẩn'):t('重設最近一輪校準','Đặt lại đợt hiệu chuẩn gần nhất'))+'</h3>'+(all?'':'<p>'+t('整張計畫','Toàn bộ kế hoạch')+' · <code>'+h(p.planId)+'</code></p>')+'<p>'+t('會移除下列校準資料。設備、分類、週期與其他系統資料保留。','Xóa dữ liệu hiệu chuẩn dưới đây. Giữ nguyên thiết bị, phân loại, chu kỳ và dữ liệu hệ thống khác.')+'</p><ul>'+Object.entries(labels).map(([k,label])=>'<li>'+label+'：'+h(c[k])+'</li>').join('')+'</ul><h4>'+t('受影響設備及還原後日期','Thiết bị bị ảnh hưởng và ngày sau khôi phục')+' · '+p.pieces.length+'</h4><ul>'+list+'</ul><p role="status" data-reset-feedback></p><div class="rf-actions"><button type="button" class="rf-btn" data-reset-close>'+t('取消','Hủy')+'</button><button type="button" class="rf-btn cal-reset" data-reset-confirm>'+t('確認重設','Xác nhận đặt lại')+'</button></div>';
}
async function previewReset(id,button,planId){
 if(dirty)throw Error(t('請先儲存或放棄尚未儲存的內容。','Hãy lưu hoặc bỏ thay đổi chưa lưu trước.'));
 const p=await api({action:'resetPreview',id,planId}).catch(e=>{throw Error(resetIssue(e.message)+(e.blockers?.length?' '+e.blockers.map(b=>[b.assetCode,b.mark,b.planId].filter(Boolean).join(' · ')).join('；'):''));});
 if(!context.current())return;
 resetPreview=p;resetFocus=button;get('[data-reset-dialog]').showModal();renderReset();get('[data-reset-close]').focus();
}
async function confirmReset(button){
 const p=resetPreview;if(!p)return;
 busy=true;button.disabled=true;
 try{
  const all=p.scope==='all';
  const result=await api({action:'reset',...(all?{id:null}:{planId:p.planId}),revision:p.revision,token:p.token,confirm:all?'RESET all':'RESET round'});
  if(result.resetAppliedAtRevision!==p.revision+1)throw Error('READBACK');
  chosen=null;docFilter='';selected.clear();confirmation=null;get('[data-reset-dialog]').close();if(get('[data-piece-dialog]').open)get('[data-piece-dialog]').close();
  await sync();tell(t('校準資料已重設，設備仍保留。','Đã đặt lại dữ liệu hiệu chuẩn và giữ nguyên thiết bị.'));
 }catch(e){
  const target=get('[data-reset-feedback]');if(target)target.textContent=resetIssue(e.message);else tell(resetIssue(e.message));
  if(e.message==='REVISION'||e.message==='CONFIRM'||e.message==='BASELINE_UNVERIFIED'){button.disabled=true;return;}
  button.disabled=false;
 }finally{busy=false;}
}
async function act(button){
 let cmd;
 if(button.hasAttribute('data-create')){cmd={action:'newPlan',ids:[...selected]};}
 else if(button.dataset.branch){cmd={action:'branch',doc:button.dataset.source,kind:button.dataset.branch};}
 else if(button.hasAttribute('data-reset')||button.hasAttribute('data-reset-piece')||button.hasAttribute('data-reset-plan')){
   return button.dataset.resetPlan?previewReset(recordPiece?.id,button,button.dataset.resetPlan):previewReset(button.dataset.resetPiece||null,button);
 }else{
   const block=button.closest('[data-doc]'),d=state.docs.find(x=>x.id===block.dataset.doc);
   cmd={action:button.dataset.act,doc:d.id};
   if(cmd.action==='return'){cmd.reason=prompt(t('退回原因','Lý do trả về'));if(!cmd.reason)return;}
   if(cmd.action==='discard'&&!confirm(t('放棄這份草稿？','Bỏ bản nháp này?')))return;
   if(cmd.action==='approve')return;
   if(['save','submit'].includes(cmd.action)){const issue=draftIssue(d,block,cmd.action==='submit');if(issue)throw Error(issue);}
   if(cmd.action==='save'&&['initial','retest'].includes(d.kind)){
     cmd.rows=[];for(const f of block.querySelectorAll('[data-row]')){
       const id=f.dataset.row,photos=[...(d.rows.find(r=>r.id===id)?.photos||[])];
       for(const file of f.querySelector('[name=photos]').files)photos.push(await upload(file));
       cmd.rows.push({id,date:f.querySelector('[name=day]').value,outcome:f.querySelector('[name=outcome]').value,photos});
     }
   }else if(cmd.action==='save'&&d.kind==='plan'){cmd.start=block.querySelector('[name=start]').value;cmd.end=block.querySelector('[name=end]').value;}
   else if(cmd.action==='save'&&d.kind==='retestRequest'){cmd.scheduled=block.querySelector('[name=scheduled]').value;cmd.scheduledEnd=block.querySelector('[name=scheduledEnd]').value;}
   else if(cmd.action==='save')cmd.reason=block.querySelector('textarea').value;
 }
 let response;
 try{response=await api(cmd);}catch(err){
   if(!err.http||err.http>=500)needsRead=true;
   const details={SCHEDULE:t('請填完整的預定復測日期和時間（越南時間）。','Điền đủ ngày và giờ kiểm tra lại dự kiến theo giờ Việt Nam.'),PERIOD:t('請核對計畫起迄日。','Kiểm tra thời gian kế hoạch.'),RATING_DATE:t('請核對每件的日期及判定。','Kiểm tra ngày và kết quả từng thiết bị.'),REVISION:t('資料已更新，請重新讀取。','Dữ liệu đã thay đổi. Hãy tải lại.'),FORBIDDEN:t('目前帳號沒有此權限。','Tài khoản không có quyền thực hiện.'),UNAVAILABLE:t('設備已被列入計畫或已不可選。','Thiết bị đã có trong kế hoạch hoặc không còn khả dụng.'),PHOTO_MISSING:t('找不到已上傳的證據照片。','Không tìm thấy ảnh minh chứng.')};
   throw Error(details[err.message]||err.message);
 }
 dirty=false;
 if(cmd.action==='newPlan'){
   stage='plan';chosen=response.doc;docFilter='';const u=new URL(location.href);u.searchParams.set('calStage',stage);
   if(!window.ProcessDeliveryNavigation?.replaceDisplayURL?.(u))history.replaceState(history.state,'',u);
 }
 try{
   await sync();
   const doc=state.docs.find(d=>d.id===(cmd.doc||response.doc));
   const expected={newPlan:'draft',save:'draft',submit:'pending',withdraw:'draft',return:'draft'}[cmd.action];
   if(expected&&(!doc||doc.status!==expected||cmd.action==='save'&&!doc.saved))throw Error('READBACK');
   if(cmd.action==='save'&&doc.kind==='plan'&&(doc.start!==cmd.start||doc.end!==cmd.end))throw Error('READBACK');
   if(cmd.scheduled!==undefined&&(doc.scheduled!==cmd.scheduled||(doc.scheduledEnd||'')!==cmd.scheduledEnd))throw Error('READBACK');
   if(cmd.action==='save'&&cmd.reason!==undefined&&doc.reason!==cmd.reason.trim())throw Error('READBACK');
   if(cmd.rows&&!cmd.rows.every(row=>{const saved=doc.rows.find(r=>r.id===row.id);return saved&&saved.date===row.date&&saved.outcome===row.outcome&&row.photos.every(photo=>saved.photos.includes(photo));}))throw Error('READBACK');
 }catch{needsRead=true;throw Error(t('站台已接受操作，請重新讀取以確認最新文件。','Hệ thống đã nhận thao tác. Hãy tải lại để xác minh hồ sơ.'));}
 const messages={newPlan:t('已建立計畫草稿，可填寫期間。','Đã tạo bản nháp. Bạn có thể điền thời gian kế hoạch.'),submit:t('已送審，等待核准。','Đã gửi, đang chờ duyệt.'),withdraw:t('已撤回，可編輯草稿。','Đã thu hồi, có thể sửa bản nháp.')};
 tell(messages[cmd.action]||t('已儲存','Đã lưu'));}
async function approve(button){
 const intent=confirmation,doc=state.docs.find(d=>d.id===chosen);
 if(!intent||intent.id!==doc?.id||doc.status!=='pending'||!allowed('approve')||!context.review||uncertain.has(doc.id))return;
 confirmation=null;
 if(intent.revision!==state.revision){renderDocs();notify(t('文件版本已更新，請重新核對。','Phiên bản đã thay đổi. Hãy kiểm tra lại.'),'check',true);return;}
 busy=true;const box=button.closest('.cal-confirm');box.setAttribute('aria-busy','true');for(const b of box.querySelectorAll('button'))b.disabled=true;
 button.textContent=t('核准中…','Đang duyệt…');
 const pending=t('核准中，正在等待站台確認。','Đang duyệt, chờ hệ thống xác nhận.');
 notify(pending);let accepted=false;
 try{
   await api({action:'approve',doc:doc.id,revision:intent.revision,selfConfirmed:true});accepted=true;
   uncertain.set(doc.id,intent.revision);await sync();
   if(uncertain.has(doc.id))notify(t('尚未讀回核准狀態，請重新讀取。','Chưa xác minh được trạng thái, hãy tải lại.'),'check');
 }catch(error){
   if(!accepted&&[400,403,409,422].includes(error.http)){
     const details={FORBIDDEN:t('目前帳號沒有核准權限','Tài khoản không có quyền duyệt'),REVIEW:t('審核人或待審狀態不符','Người duyệt hoặc trạng thái không phù hợp'),REVISION:t('文件版本已變更','Phiên bản đã thay đổi'),DATE_LOCKED:t('設備已進入校準或日期已鎖定，請退回日期變更。','Thiết bị đang hiệu chuẩn hoặc ngày đã khóa. Hãy trả lại hồ sơ sửa ngày.'),PHOTO_MISSING:t('找不到報告照片','Thiếu ảnh của báo cáo'),MASTER_CHANGED:t('設備主檔已變更','Danh mục thiết bị đã thay đổi')};
     notify(t('未核准','Chưa duyệt')+' · '+(details[error.message]||error.message),'check');
   }else{
     uncertain.set(doc.id,intent.revision);
     notify(accepted?t('站台已接受核准，尚未讀回最新清單。請重新讀取。','Hệ thống đã nhận phê duyệt. Hãy tải lại danh sách để xác minh.'):t('核准結果待確認，請重新讀取。','Chưa xác nhận được kết quả duyệt. Hãy tải lại.'),'check');
   }
 }finally{busy=false;if(context.current()){renderDocs();paintFeedback(true);selection();}}
}
function range(d){return '<label>'+t('期間起日','Từ ngày')+'<input name="start" type="date" value="'+h(d.start)+'"></label><label>'+t('期間迄日','Đến ngày')+'<input name="end" type="date" value="'+h(d.end)+'"></label>';}
const stageLabels=()=>context.review?[['review',n('review')]]:[['items',t('校準項目','Hạng mục hiệu chuẩn')],['plan',n('plan')],['initial',t('校準報告','Báo cáo hiệu chuẩn')],['failure',n('failure')]];
let stages=stageLabels();
const requested=new URL(location.href).searchParams.get('calStage');
if(!context.review&&requested==='history'){
 const url=new URL(location.href);url.searchParams.set('calStage','items');
 if(!window.ProcessDeliveryNavigation?.replaceDisplayURL?.(url))history.replaceState(history.state,'',url);
}
let stage=stages.some(([key])=>key===requested)?requested:stages[0][0];
const inStage=(d,key)=>{
 if(key==='review')return d.status==='pending';
 if(!['draft','pending'].includes(d.status))return key==='failure'&&d.kind==='handling'&&d.status==='approved'&&!state.docs.some(x=>x.kind==='scrap'&&x.plan===d.plan&&x.ids.includes(d.ids[0]));
 return key==='initial'?['initial','retest'].includes(d.kind):key==='failure'?['failure','retestRequest','scrapRequest','handling','scrap'].includes(d.kind):d.kind===key;
};
function stageButton(key,label,i){
 const count=!state?'':key==='items'?state.items.length:state.docs.filter(d=>inStage(d,key)).length;
 return '<button type="button" data-stage="'+key+'" aria-current="'+(stage===key?'page':'false')+'" class="'+(i>=5?'rf-btn ':'')+(stage===key?'active':'')+'">'+(i<3?'<span class="rf-flow-number">'+(i+1)+'</span>':'')+h(label)+' <span class="rf-flow-count">'+count+'</span></button>';
}
function paintStage(){
 get('[data-steps]').innerHTML=stages.slice(0,3).map(([key,label],i)=>stageButton(key,label,i)).join('<span class="rf-flow-arrow step" aria-hidden="true">→</span>');
 get('[data-outcomes]').innerHTML=context.review?'':flowOutcomes();
 get('[data-end-stages]').innerHTML=stages.slice(3).map(([key,label],i)=>stageButton(key,label,i+5)).join('');
 get('[data-items]').hidden=stage!=='items';get('[data-documents]').hidden=stage==='items';
 get('[data-doc-title]').textContent=stages.find(([key])=>key===stage)[1];
}
function shellMarkup(){return `
  <section class="ri-app rf-app piece-cal" data-i18n-skip="true">
    <header class="rf-calendar-hero"><div>
      <span>${t('例行品質管理','Quản lý chất lượng định kỳ')}</span><h2>${title()}</h2>
    </div><button type="button" class="rf-btn" data-reset hidden>${t('管理工具：全部校準重設','Quản trị: Đặt lại toàn bộ hiệu chuẩn')}</button></header>
    ${context.moduleNav()}
    <div class="rf-main rf-calendar">
      <nav class="cal-route" aria-label="${title()}"><div class="cal-route-main"><div data-steps></div>
        ${context.review?'':'<span class="cal-route-arrow" aria-hidden="true">→</span>'}
        <div data-outcomes></div></div><div data-end-stages></div></nav>
      <div class="ri-work-context"><p class="rf-subtle" data-count></p><button type="button" class="rf-btn" data-refresh>${t('重新整理','Tải lại')}</button></div>
      <p role="status" class="rf-notice"></p>
      <section data-items class="ri-pick-work">
        <h3>${stages[0][1]}</h3>
        <details data-filters ${matchMedia('(min-width:700px)').matches?'open':''}><summary>${t('篩選','Bộ lọc')}</summary><form></form></details>
        <div class="rf-calendar-toolbar"><b data-summary role="status"></b>
          <button class="rf-btn primary" data-create disabled>${t('建立校準計畫','Lập kế hoạch hiệu chuẩn')}</button>
          <button class="rf-btn" data-clear>${t('清除選取','Bỏ chọn')}</button>
        </div><section data-selection-details hidden><b data-selected-label></b><div data-selected-list class="cal-pieces"></div></section><div data-results class="rf-calendar-groups"></div><details data-archived hidden><summary></summary><div data-archived-list></div></details>
      </section>
      <dialog data-reset-dialog class="cal-record-dialog" aria-labelledby="cal-reset-title"></dialog>
      <dialog data-piece-dialog class="cal-record-dialog" aria-labelledby="cal-record-title">
      <header><div><h3 id="cal-record-title">${t('單件校準紀錄','Hồ sơ hiệu chuẩn từng thiết bị')}</h3><b data-record-identity></b></div><button class="rf-btn" type="button" data-close-record>${t('關閉','Đóng')}</button></header>
      <section class="cal-round-totals"><strong data-round-count></strong><small data-round-status></small></section>
      <label>${t('查詢計畫編號或日期','Tìm mã kế hoạch hoặc ngày')}<input type="search" data-record-search></label><p role="status" data-record-reset-note></p><section data-cycle-list></section></dialog>
      <section data-documents><h3 data-doc-title></h3><div class="cal-feedback" data-review-feedback tabindex="-1" hidden><span role="status" aria-live="polite"></span><button type="button" class="rf-btn" data-reread hidden>${t('重新讀取最新狀態','Tải lại trạng thái')}</button></div><nav data-doc-tools class="rf-calendar-tools rf-work-states"></nav>
        <div data-doc-layout class="rf-layout">
          <section class="rf-panel rf-list-panel"><div data-docs class="rf-calendar-document-list"></div></section>
          <section class="rf-panel rf-detail-panel"><div class="rf-detail" data-doc-detail></div></section>
        </div>
      </section>
    </div>
  </section>`;}
pane.innerHTML=shellMarkup();
filters=get('form');results=get('[data-results]');documents=get('[data-docs]');summary=get('[data-summary]');message=get('.rf-notice');
paintStage();
const recordDialog=get('[data-piece-dialog]');
recordDialog.addEventListener('close',()=>{const trigger=recordButton?.isConnected?recordButton:[...pane.querySelectorAll('[data-piece-record]')].find(b=>b.dataset.pieceRecord===recordPiece?.id);recordPiece=null;cycles=[];trigger?.focus({preventScroll:true});recordButton=null;});
get('[data-record-search]').oninput=renderCycles;
filters.oninput=e=>{if(state)repaintFrom(e.target);};filters.onsubmit=e=>e.preventDefault();filters.onreset=e=>{e.preventDefault();for(const field of filters.querySelectorAll('input,select'))field.value='';if(state)repaintFrom(filters.querySelector('[type=reset]'));};
results.addEventListener('toggle',e=>{if(e.target.dataset.expand)e.target.open?expanded.add(e.target.dataset.expand):expanded.delete(e.target.dataset.expand);},true);
results.onchange=e=>{if(e.target.dataset.id){
 const control=e.target,anchor=control.closest('.cal-item');
 const restore=window.RoutineFQCUI?.keepListAnchor?.(anchor,()=>anchor,()=>control);
 control.checked?selected.add(control.dataset.id):selected.delete(control.dataset.id);selection();restore?.();
}};
get('[data-reset-dialog]').addEventListener('close',()=>{resetPreview=null;if(resetFocus?.isConnected)resetFocus.focus({preventScroll:true});resetFocus=null;});
get('[data-reset-dialog]').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
let dirty=false,needsRead=false;
function draftChanged(e){
 if(!get('[data-doc-detail]').contains(e.target))return;
 dirty=true;updateDraftControls();tell('');
}
pane.addEventListener('input',draftChanged);pane.addEventListener('change',draftChanged);
function mayDiscard(){
 if(dirty&&!confirm(t('要離開並放棄尚未儲存的內容嗎？','Rời trang và bỏ thay đổi chưa lưu?')))return false;
 dirty=false;return true;
}
pane.onclick=async e=>{
 const b=e.target.closest('button');if(!b||busy||!context.current())return;
 if(b.hasAttribute('data-reset-close')){get('[data-reset-dialog]').close();return;}
 if(b.hasAttribute('data-reset-confirm')){await confirmReset(b);return;}
 if(b.hasAttribute('data-piece-record')){openRecord(b);return;}
 if(b.hasAttribute('data-close-record')){recordDialog.close();return;}
 if(b.hasAttribute('data-confirm-approve')){await approve(b);return;}
 if(b.hasAttribute('data-cancel-approve')){confirmation=null;renderDocs();get('[data-act=approve]')?.focus({preventScroll:true});return;}
 if(b.dataset.act==='approve'){
   const d=state?.docs.find(d=>d.id===chosen);
   if(!context.review||!d||d.status!=='pending'||!allowed('approve')||uncertain.has(d.id))return;
   confirmation={id:d.id,revision:state.revision};feedback=null;paintFeedback();renderDocs();
   const target=get('[data-confirm-approve]');target?.focus({preventScroll:true});target?.scrollIntoView({block:'nearest'});return;
 }
 if(b.hasAttribute('data-reread')||b.hasAttribute('data-refresh')){
   if(!needsRead&&!mayDiscard())return;
   busy=true;b.disabled=true;confirmation=null;if(context.review){renderDocs();b.setAttribute('aria-busy','true');}try{await sync();needsRead=false;dirty=false;tell('');if(b.hasAttribute('data-reread')&&!uncertain.size&&feedback?.tone==='check')notify(t('已重新讀取，請核對最新文件。','Đã tải lại. Hãy kiểm tra hồ sơ mới nhất.'));}
   catch(error){message.textContent=error.message;if(b.hasAttribute('data-reread'))notify(t('讀取失敗，請稍後重新讀取。','Không tải được. Hãy thử tải lại sau.'),'check',true);}finally{busy=false;b.disabled=false;b.removeAttribute('aria-busy');if(state){selection();if(context.review)renderDocs();else updateDraftControls();}}return;
 }
 if(b.dataset.riAction?.startsWith('module:')){context.switchTo(b.dataset.riAction.slice(7));return;}
 if(b.dataset.facet&&state){const f=filters.elements[b.dataset.facet];f.value=f.value===b.value?'':b.value;repaintFrom(b);return;}
 if(b.hasAttribute('data-open')||b.hasAttribute('data-back')||b.hasAttribute('data-doc-filter')){
   if(!mayDiscard())return;
   if(b.hasAttribute('data-doc-filter'))docFilter=b.dataset.docFilter;
   confirmation=null;chosen=b.dataset.open||null;renderDocs();
   const target=chosen?get('[data-back]'):b.hasAttribute('data-doc-filter')?get('[data-doc-filter="'+docFilter+'"]'):get('[data-open]');
   target?.focus({preventScroll:true});return;
 }
 if(b.dataset.stage){if(!mayDiscard())return;confirmation=null;chosen=null;docFilter='';
   stage=b.dataset.stage;const url=new URL(location.href);url.searchParams.set('calStage',stage);
   if(!window.ProcessDeliveryNavigation?.replaceDisplayURL?.(url))history.replaceState(history.state,'',url);
   paintStage();if(state)renderDocs();get('[data-stage="'+stage+'"]').focus({preventScroll:true});return;
 }
 if(!state)return;
 if(b.hasAttribute('data-clear')){selected.clear();renderRows();return;}
 if(!b.matches('[data-act],[data-branch],[data-create],[data-reset],[data-reset-piece],[data-reset-plan]'))return;
 if(needsRead){tell(t('操作結果待核對，請先重新讀取。','Cần xác minh kết quả. Hãy tải lại trước.'));return;}
 busy=true;b.disabled=true;updateDraftControls();tell(t('處理中…','Đang xử lý…'));
 try{await act(b);}catch(err){if(b.hasAttribute('data-reset-plan'))get('[data-record-reset-note]').textContent=err.message;tell(err.message+(needsRead?' · '+t('請按重新整理','Nhấn Tải lại') :''));}finally{busy=false;if(b.isConnected)b.disabled=false;if(state){selection();updateDraftControls();}}
};
let pendingAnchor;
function anchorBeforeLanguage(){
 if(!state||pane.closest('[hidden]'))return;
 const candidates=[...pane.querySelectorAll('.cal-item,.rf-calendar-toolbar,.rf-status-filters')];
 const onScreen=el=>el.getBoundingClientRect().bottom>0&&el.getBoundingClientRect().top<innerHeight;
 const anchor=candidates.find(el=>el.matches('.cal-item')&&onScreen(el))||candidates.find(onScreen);
 if(!anchor)return;
 const index=candidates.indexOf(anchor),top=anchor.getBoundingClientRect().top;
 return ()=>{const next=pane.querySelectorAll('.cal-item,.rf-calendar-toolbar,.rf-status-filters')[index];
   if(!next?.isConnected)return;
   let scroller=next.parentElement;
   while(scroller&&scroller!==document.body&&!(scroller.scrollHeight>scroller.clientHeight&&/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement;
   const delta=next.getBoundingClientRect().top-top;
   if(scroller&&scroller!==document.body)scroller.scrollTop+=delta;else window.scrollBy({top:delta,behavior:'instant'});
 };
}
function languageChanged(){
 if(!state||!context.current())return;
 const restore=pendingAnchor||anchorBeforeLanguage();pendingAnchor=null;
 const focus=document.activeElement;
 const attr=focus?.closest('.piece-cal')&&['data-id','data-facet','name','data-stage'].find(a=>focus.hasAttribute(a));
 stages=stageLabels();
 const tmp=document.createElement('div');tmp.innerHTML=shellMarkup();
 for(const selector of ['.rf-calendar-hero>div','.rf-modules','.rf-flow-gate','[data-items]>h3','[data-filters]>summary','[data-create]','[data-clear]','[data-reset]','[data-refresh]','#cal-record-title','[data-close-record]']){
   const el=get(selector),fresh=tmp.querySelector(selector);if(el&&fresh)el.innerHTML=fresh.innerHTML;
 }
 get('[data-count]').textContent=context.review?n('review')+' · '+state.docs.filter(d=>d.status==='pending').length:t('設備主檔已核准單件','Thiết bị theo danh mục đã duyệt')+' · '+state.items.length;
 get('[data-record-search]').parentElement.firstChild.textContent=tmp.querySelector('[data-record-search]').parentElement.firstChild.textContent;
 if(recordPiece){get('[data-record-identity]').textContent=identity(recordPiece);renderCycles();}
 paintStage();renderFilters();renderRows();if(!dirty&&!busy)renderDocs();renderReset();
 if(attr){const el=[...pane.querySelectorAll('['+attr+']')].find(e=>e.getAttribute(attr)===focus.getAttribute(attr)&&(!focus.dataset.facet||e.value===focus.value));el?.focus({preventScroll:true});}
 restore?.();if(restore)requestAnimationFrame(restore);
}
return {captureLanguage:()=>{pendingAnchor=anchorBeforeLanguage();},languageChanged,stage:()=>stage,busy:()=>busy,canLeave:()=>!busy&&!dirty,ready:sync().catch(err=>{if(context.current())message.textContent=err.message;})};
}};
})();

/* Presentation adapter only: existing module readers and review commands remain owners. */
(() => {
 'use strict';
 const t=(vi,zh)=>document.documentElement.lang==='vi'?vi:zh;
 const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const modules=[['fqc','FQC','FQCMasterUI'],['iqc','IQC','IQCMasterUI'],['ipqc-ab','IPQC-AB','IPQCABUI'],['ipqc-c','IPQC-C','IPQCCUI'],['equipment','equipment','RoutineEquipmentUI'],['tooling','tooling','ToolingUI']];
 const moduleName=name=>name==='equipment'?t('Dưỡng kiểm và thiết bị đo','檢具與測試設備'):name==='tooling'?t('Thiết bị khuôn','模具設備'):name==='routine'?t('FQC định kỳ','例行 FQC'):name;
 let observer=null,active=null;
 function html(){return `<section class="quality-review-dashboard" data-i18n-skip="true"><div class="quality-review-dashboard-heading"><div><h3>${h(t('Tổng quan hồ sơ','確認總覽'))}</h3><p>${h(t('Mở mô-đun đang chờ duyệt để xem nội dung, thay đổi và người gửi. Hồ sơ đã xử lý được giữ trong lịch sử.','展開待確認模組查看內容、修改差異與送審者；已處理案件保留在歷史中。'))}</p></div><strong data-review-total aria-live="polite">${h(t('Đang tải…','正在載入…'))}</strong></div><div class="quality-review-status-grid">${modules.map(([id,name])=>`<button type="button" class="quality-review-status-card" data-review-jump="${id}"><span>${h(moduleName(name))}</span><strong data-overview-count="${id}">—</strong><small data-overview-status="${id}">${h(t('Đang tải…','正在載入…'))}</small></button>`).join('')}</div></section>`;}
 function mount(panel){observer?.disconnect();active=null;if(!panel?.querySelector('.quality-review-dashboard'))return;
  const sync=window.ProcessSync,actor=sync?.identity?.id,epoch=sync?.identityGeneration?.(),delivery=sync?.captureDelivery?.();
  const owned=()=>panel.isConnected&&!sync?.requiresReload&&sync?.identity?.id===actor&&sync?.identityGeneration?.()===epoch&&(!delivery||sync.isCurrentDelivery(delivery));
  const wrappers=[];
  for(const [id,name,api]of modules){const body=panel.querySelector('#review-'+id);if(!body)continue;const wrapper=document.createElement('details');wrapper.className='quality-review-module';wrapper.dataset.reviewModule=id;wrapper.dataset.i18nSkip='true';const summary=document.createElement('summary');summary.innerHTML=`<span class="quality-review-module-title">${h(moduleName(name))}</span><span class="quality-review-module-status">—</span><small class="quality-review-module-meta"></small>`;body.before(wrapper);wrapper.append(summary,body);wrappers.push({id,api,body,wrapper,summary,settled:false,manual:false});wrapper.addEventListener('click',e=>{if(e.target.closest('summary')===summary)wrappers.find(r=>r.id===id).manual=true;});}
  const set=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
  const update=()=>{if(active?.owned!==owned)return;if(!panel.isConnected){observer?.disconnect();return;}let total=0,loaded=0,failures=0;
   for(const row of wrappers){const text=row.body.textContent,loading=/正在載入|載入中|Đang tải/.test(text),failed=row.readState==='failed'||!!window[row.api]?.navigation?.error?.()||!!row.body.querySelector('.tooling-error:not(:empty),[role=alert]:not(:empty)'),rawCount=window[row.api]?.pendingCount?.(),count=Number.isInteger(rawCount)&&rawCount>=0?rawCount:null;const ready=owned()&&row.readState==='settled'&&!loading&&!failed&&!!text.trim()&&count!==null;total+=ready?count:0;loaded+=ready?1:0;const state=failed?t('Không tải được hồ sơ','案件載入失敗'):!ready?t('Đang tải…','正在載入…'):count?t('Chờ duyệt','待確認'):t('Không có hồ sơ chờ duyệt','沒有待確認案件');
    set(panel.querySelector(`[data-overview-count="${row.id}"]`),ready?String(count):'—');set(panel.querySelector(`[data-overview-status="${row.id}"]`),state);set(row.summary.querySelector('.quality-review-module-status'),ready?count+' '+t('chờ duyệt','待確認'):state);row.wrapper.dataset.pending=ready&&count?'true':'false';panel.querySelector(`[data-review-jump="${row.id}"]`)?.classList.toggle('has-pending',ready&&count>0);
    failures+=failed?1:0;
    const record=row.body.querySelector('[data-iqc-review],[data-quality-review],.vd-review-case summary,.ipqc-review-case summary,.routine-review button');const recordText=record?(record.children.length?Array.from(record.children).map(node=>node.textContent.trim()).filter(Boolean).join(' · '):record.textContent.trim()):'';set(row.summary.querySelector('.quality-review-module-meta'),recordText);
    // Async counts must not expand sections underneath a user's current scroll.
    if(ready&&!row.settled)row.settled=true;
   }
   const complete=loaded===wrappers.length,remaining=loaded+failures<wrappers.length;
   const totalText=complete?total+' '+t('hồ sơ chờ duyệt','件待確認'):loaded?t('Đã tải ','已載入 ')+total+' '+t('hồ sơ chờ duyệt','件待確認'):t('Chưa xác nhận số hồ sơ','案件數尚未確認');
   set(panel.querySelector('[data-review-total]'),totalText+(failures?' · '+failures+' '+t('mô-đun chưa tải được','個模組載入失敗'):'')+(remaining?' · '+t('đang kiểm tra các mô-đun còn lại','其餘模組讀取中'):''));set(document.querySelector('#approval-tab-quality .approval-tab-count'),complete?String(total):'—');
  };
  panel.querySelectorAll('[data-review-jump]').forEach(button=>button.onclick=()=>{const row=wrappers.find(r=>r.id===button.dataset.reviewJump);if(!row)return;row.manual=true;row.wrapper.open=true;row.summary.scrollIntoView({behavior:'smooth',block:'start'});row.summary.focus({preventScroll:true});});
  for(const row of wrappers)row.summary.tabIndex=0;
  active={panel,wrappers,owned,update};observer=new MutationObserver(update);observer.observe(panel,{childList:true,subtree:true,characterData:true});update();
 }
 function track(panel,api,read){const view=active,row=view?.panel===panel&&view.wrappers.find(row=>row.api===api);if(!row||!view.owned())return;const sequence=(row.readSequence||0)+1;row.readSequence=sequence;row.readState='pending';view.update();
  const finish=failed=>{if(active!==view||!view.owned()||row.readSequence!==sequence)return;row.readState=failed?'failed':'settled';view.update();};
  // FQC and loaded AB can bind synchronously. Other readers must return their existing promise.
  if(typeof window[api]?.bindReview!=='function'||(read===undefined&&!['FQCMasterUI','IPQCABUI'].includes(api))){finish(true);return;}
  if(read&&typeof read.then==='function')Promise.resolve(read).then(()=>finish(false),()=>finish(true));else finish(false);
 }
 window.QualityReviewOverview={dispose(){observer?.disconnect();observer=null;active=null;},html,mount,track};
})();

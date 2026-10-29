(function(host){
  'use strict';
  const _copy=v=>JSON.parse(JSON.stringify(v)), h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
  function processSnapshot(catalog){return catalog&&typeof catalog==='object'&&!Array.isArray(catalog)&&!Array.isArray(catalog.products)&&!Array.isArray(catalog.lines);}
  function rows(catalog){if(processSnapshot(catalog))return Object.entries(catalog||{}).flatMap(([stage,templates])=>(templates||[]).flatMap(template=>[
    {key:'process:'+stage+':'+template.id,kind:t('流程','Quy trình'),code:stage+' · '+template.id,value:[template.name,(template.mediaItems||[]).length+t(' 張照片',' ảnh')].join(' · '),fingerprint:JSON.stringify({...template,equipment:undefined})},
    ...(template.equipment||[]).map(e=>({key:'equipment:'+e.id,kind:t('設備','Thiết bị'),code:stage+' · '+(e.number||e.id),value:[template.name,e.number||t('待補編號','Chưa có mã'),e.name,e.nameVi,e.process,e.purpose,e.purposeVi,e.note,(e.mediaItems||[]).length+t(' 張照片',' ảnh')].filter(Boolean).join(' · '),fingerprint:JSON.stringify(e)}))
  ]));return [
    ...(catalog.products||[]).map(p=>({key:'product:'+p.code,kind:t('產品','Sản phẩm'),code:p.code,value:[p.name,p.category,p.line,p.specification,p.unit,(p.stages||[]).join(' → '),p.routeMode==='group'?t('沿用群組','Theo nhóm'):p.routeMode==='exception'?t('產品例外','Ngoại lệ'):t('原產品路線','Tuyến gốc')].join(' · ')})),
    ...(catalog.lines||[]).flatMap(l=>[{key:'line:'+l.code,kind:t('線別','Chuyền'),code:l.code,value:l.name},...l.stages.map(s=>({key:'stage:'+l.code+':'+s.code,kind:t('工段','Công đoạn'),code:s.code,value:[s.name,s.machine,s.assetNumber,s.operators].filter(v=>v!=null).join(' · ')}))]),
    ...(host.MasterAdminUI?.categoryEntries(catalog)||[]).map(g=>({key:'category:'+g.line+':'+g.name,kind:t('類別','Nhóm'),code:g.line,value:g.name+' · '+(Array.isArray(g.defaultStages)?t('預設路線：','Tuyến mặc định: ')+(g.defaultStages.join(' → ')||t('空路線','Tuyến trống')):g.defaultStages===null?t('已移除預設，保留產品路線','Đã bỏ mặc định, giữ tuyến sản phẩm'):t('尚未設定群組路線','Chưa đặt tuyến nhóm'))}))
  ];}
  function diff(next,previous){const before=new Map(rows(previous).map(r=>[r.key,r])),after=new Map(rows(next).map(r=>[r.key,r]));return [...new Set([...before.keys(),...after.keys()])].flatMap(key=>{const a=before.get(key),b=after.get(key);if(a&&b&&(a.fingerprint||a.value)===(b.fingerprint||b.value))return [];const mediaOnly=a&&b&&a.value===b.value;return [{kind:(b||a).kind,code:(b||a).code,type:!a?'add':!b?'delete':'edit',before:a?.value||'—',after:(b?.value||'—')+(mediaOnly?t('（照片或詳細內容已更新）',' (Đã cập nhật ảnh hoặc chi tiết)'):'')}];});}
  const readableScopes=()=>['AB','C','PROCESS'].filter(scope=>host.hasPermission?.({AB:'ab.view',C:'c.view',PROCESS:'templates.view'}[scope])===true);
  function install({state,control,persist: _persist,record: _record,validateCatalog: _validateCatalog,applyActive,showVersion: _showVersion,shared}){
    let busy=false,error='',owner='',epoch=0;
    const bodies=new Map(),requests=new Map();
    const statuses=()=>({pending:t('待確認','Chờ duyệt'),approved:t('已確認','Đã duyệt'),withdrawn:t('已撤回','Đã rút'),returned:t('已發回','Đã trả lại'),superseded:t('歷史版本','Phiên bản trước')});
    const actor=()=>host.ProcessSync?.identity?.id||'';
    const key=item=>item.scope+':'+item.id;
    const scopeLabel=item=>item.scope==='PROCESS'?t('流程資料','Dữ liệu quy trình'):item.scope;
    const stamp=value=>value?new Date(value).toLocaleString(document.documentElement.lang==='vi'?'vi-VN':'zh-TW'):'—';
    const message=e=>({FORBIDDEN:t('目前帳號沒有此操作權限。','Tài khoản không có quyền thực hiện.'),CASE_NOT_PENDING:t('案件已由其他人處理，請重新整理。','Hồ sơ đã được xử lý. Hãy tải lại.'),GENERATION_CHANGED:t('案件狀態已更新，請重新整理。','Trạng thái đã thay đổi. Hãy tải lại.'),SELF_REVIEW_CONFIRM_REQUIRED:t('請確認自審自己的案件。','Hãy xác nhận tự duyệt hồ sơ.'),REASON_REQUIRED:t('請填寫原因。','Vui lòng nhập lý do.')}[e.message]||t('操作未完成：','Thao tác chưa hoàn tất: ')+e.message);
    function items(){
      if(owner!==actor()){owner=actor();epoch++;bodies.clear();requests.clear();error='';state.masterReviewId=null;}
      const rows=[];
      for(const scope of readableScopes()){
        const cases=shared?.flow(scope)?.cases||[],ids=new Set(cases.map(c=>c.id));
        for(const c of cases){const v=control.versions.find(v=>v.id===c.id&&v.scope===scope);rows.push({...c,scope,number:v?.number,creatorName:c.actor?.name,updatedAt:c.result?.at||c.at,fixed:true});}
        rows.push(...control.versions.filter(v=>v.scope===scope&&v.status!=='draft'&&!ids.has(v.id)).map(v=>({...v,fixed:false,reason:v.reason||v.changeReason||'',actor:{id:v.creatorId,name:v.creatorName},at:v.createdAt||v.updatedAt})));
      }
      if(host.hasPermission?.('bom.view'))rows.push(...(host.BOMWorkspace?.reviewItems?.()||[]));
      return rows.sort((a,b)=>new Date(b.updatedAt||b.at)-new Date(a.updatedAt||a.at));
    }
    const visible=()=>items().filter(v=>state.masterReviewMode==='history'?v.status!=='pending':v.status==='pending');
    const selected=()=>visible().find(v=>key(v)===state.masterReviewId)||visible()[0]||null;
    function access(item,action){if(busy||item.status!=='pending')return false;if(item.scope==='BOM')return host.BOMWorkspace?.reviewPermission?.(action)===true;if(item.fixed)return shared.permissions(item.scope)?.[action]===true;return false;}
    function fixedBody(item){return item.fixed?bodies.get(key(item)): {before:control.versions.find(v=>v.id===(item.baseVersionId||item.parentVersionId))?.snapshot||(item.scope==='PROCESS'?{}:{products:[],lines:[]}),content:item.snapshot};}
    function changes(item,body){if(item.scope==='BOM')return host.BOMWorkspace.reviewDiff(body);const result=diff(body.content,body.before||{});if(body.linkedProcess)result.push(...diff(body.linkedProcess.content,body.linkedProcess.before));return result;}
    function detail(item){
      if(!item)return '<p class="master-review-empty" role="status">'+t(state.masterReviewMode==='history'?'尚無歷史紀錄。':'目前沒有待審案件。',state.masterReviewMode==='history'?'Chưa có lịch sử.':'Không có hồ sơ chờ duyệt.')+'</p>';
      const body=fixedBody(item),expanded=state.masterReviewExpanded===key(item),actionNames={approve:t('確認','Duyệt'),return:t('發回修改','Trả lại'),withdraw:t('撤回送審','Rút hồ sơ')};
      let comparison='';
      if(expanded){if(!body)comparison='<p role="status">'+t('正在讀取固定案件…','Đang tải hồ sơ cố định…')+'</p>';else{const all=changes(item,body),page=Math.max(0,Math.min(state.masterDiffPage||0,Math.max(0,Math.ceil(all.length/50)-1))),labels={add:t('新增','Thêm'),delete:t('刪除','Xóa'),edit:t('修改','Sửa')};state.masterDiffPage=page;comparison='<p>'+all.length+' '+t('項修改','thay đổi')+'</p><div class="master-diff-scroll"><table><thead><tr>'+[t('動作','Thao tác'),t('項目','Mục'),t('修改前','Trước'),t('修改後','Sau')].map(v=>'<th>'+v+'</th>').join('')+'</tr></thead><tbody>'+all.slice(page*50,page*50+50).map(d=>'<tr><td>'+h(labels[d.type])+'</td><td>'+h(d.kind)+'<br>'+h(d.code)+'</td><td>'+h(d.before)+'</td><td>'+h(d.after)+'</td></tr>').join('')+'</tbody></table></div><div class="toolbar"><button data-review-page="-1" '+(page?'':'disabled')+'>'+t('上一頁','Trước')+'</button><span>'+(page+1)+' / '+Math.max(1,Math.ceil(all.length/50))+'</span><button data-review-page="1" '+((page+1)*50<all.length?'':'disabled')+'>'+t('下一頁','Sau')+'</button></div>';}}
      const issues=item.contentIssues?.issues||[];
      return '<header><h3>'+h(scopeLabel(item))+(item.number?' · V'+item.number:'')+' <span class="master-status '+h(item.status)+'">'+h(statuses()[item.status]||item.status)+'</span></h3></header><dl class="master-review-meta"><dt>'+t('送審者','Người gửi')+'</dt><dd>'+h(item.actor?.name||item.creatorName||'—')+' · '+h(stamp(item.at||item.updatedAt))+'</dd><dt>'+t('送審原因','Lý do gửi')+'</dt><dd>'+h(item.reason||'—')+'</dd></dl>'+
        (item.scope==='BOM'?'<p class="master-review-note">'+t('確認後套用本案固定 BOM；既有製程引用保留，無法對應的引用列入待確認。','Sau khi duyệt, áp dụng BOM cố định của hồ sơ; giữ liên kết quy trình và liệt kê liên kết chưa khớp.')+'</p>':'')+
        (item.status==='pending'?'<div class="master-version-actions">'+Object.entries(actionNames).map(([action,label])=>'<button type="button" class="button '+(action==='approve'?'signal':'ghost')+'" data-review-action="'+action+'" '+(access(item,action)?'':'disabled')+'>'+label+'</button>').join('')+'</div>':'')+
        (issues.length?'<details><summary>'+t('待補／引用待確認','Mục cần bổ sung / liên kết cần xác nhận')+' · '+issues.length+'</summary><p>'+t('操作不會自動修正以下資料。','Thao tác không tự sửa dữ liệu sau.')+'</p>'+issues.slice(0,30).map(i=>'<p>'+h(host.VersionDraftUI?.issueMessage(i)||i.message)+'</p>').join('')+(issues.length>30?'<p>'+t('其餘項目請在資料頁查閱。','Xem các mục còn lại ở trang dữ liệu.')+'</p>':'')+'</details>':'')+
        '<button type="button" class="button ghost" id="master-case-diff" aria-expanded="'+expanded+'">'+t(expanded?'收合修改內容':'比較修改內容',expanded?'Thu gọn thay đổi':'So sánh thay đổi')+'</button>'+comparison+
        '<details class="master-review-audit"><summary>'+t('操作紀錄','Lịch sử thao tác')+'</summary><p>'+t('送出審核','Gửi duyệt')+' · '+h(item.actor?.name||item.creatorName||'—')+' · '+h(stamp(item.at||item.createdAt))+'</p><p>'+h(item.reason||'—')+'</p>'+(item.result?'<p>'+h(statuses()[item.status]||item.status)+' · '+h(item.result.actor?.name)+' · '+h(stamp(item.result.at))+'</p><p>'+h(item.result.reason||'—')+'</p>'+(item.result.selfReview?'<p>'+t('已確認自審','Đã xác nhận tự duyệt')+'</p>':''):(item.history||[]).map(r=>'<p>'+h(r.action)+' · '+h(r.actorName||r.actor)+' · '+h(stamp(r.at))+' · '+h(r.comment||'')+'</p>').join(''))+'</details>';
    }
    function view(){const all=items(),list=visible(),item=selected(),history=state.masterReviewMode==='history';if(item)state.masterReviewId=key(item);return '<section id="master-unified-review" class="master-pending master-review-top" data-i18n-skip="true"><header><div><h2>'+t('主資料送審案件','Hồ sơ duyệt dữ liệu gốc')+'</h2><p>'+t('AB、C、BOM、線別工段與流程資料','AB, C, BOM, chuyền, công đoạn và dữ liệu quy trình')+'</p></div><span>'+all.filter(v=>v.status==='pending').length+' '+t('件待確認','hồ sơ chờ duyệt')+'</span></header><div class="toolbar master-review-filters"><button type="button" class="button '+(!history?'signal':'ghost')+'" data-review-mode="pending" aria-pressed="'+!history+'">'+t('待審案件','Chờ duyệt')+'</button><button type="button" class="button '+(history?'signal':'ghost')+'" data-review-mode="history" aria-pressed="'+history+'">'+t('歷史紀錄','Lịch sử')+'</button><button type="button" class="button ghost" id="master-review-refresh" '+(busy?'disabled':'')+'>'+t('重新整理','Tải lại')+'</button></div><p class="master-review-error" role="alert">'+h(error||host.BOMWorkspace?.reviewError?.()||'')+'</p><div class="master-review-grid"><aside class="master-review-list" aria-label="'+t('案件清單','Danh sách hồ sơ')+'">'+list.map(v=>'<button type="button" data-master-review="'+h(key(v))+'" aria-pressed="'+(item&&key(item)===key(v))+'" class="'+(item&&key(item)===key(v)?'active':'')+'"><b>'+h(scopeLabel(v))+(v.number?' · V'+v.number:'')+'</b><span class="master-status '+h(v.status)+'">'+h(statuses()[v.status]||v.status)+'</span><small>'+h(v.actor?.name||v.creatorName||'—')+' · '+h(stamp(v.at||v.updatedAt))+'</small></button>').join('')+'</aside><div class="master-review-detail">'+detail(item)+'</div></div></section>';}
    function redraw(){if(state.view!=='approval'||state.approvalTab!=='master')return;const root=document.querySelector('#master-unified-review');if(!root)return;const restore=host.VersionDraftUI?.preserveView(root.parentElement||root);const markup=view();if(root.outerHTML!==markup){root.outerHTML=markup;bind();}restore?.();const badge=document.querySelector('[data-review-tab="master"] .approval-tab-count');if(badge)badge.textContent=String(items().filter(v=>v.status==='pending').length);}
    async function loadBody(item){if(!item?.fixed||bodies.has(key(item)))return;const id=key(item),who=actor(),token=epoch;if(requests.has(id))return requests.get(id);const task=(async()=>{try{const result=item.scope==='BOM'?await host.BOMWorkspace.reviewCase(item.id):await shared.client(item.scope).reviewCase(item.id);if(who!==actor()||token!==epoch)return;bodies.set(id,result.reviewCase);}catch(e){if(who===actor())error=message(e);}finally{requests.delete(id);redraw();}})();requests.set(id,task);return task;}
    async function refresh(){await Promise.all(readableScopes().map(s=>shared.load(s)));if(host.hasPermission?.('bom.view'))await host.BOMWorkspace?.loadReview?.();applyActive();}
    async function act(action){const item=selected();if(!item||!access(item,action))return;busy=true;error='';const who=actor();redraw();try{
      let result;
      if(item.scope==='BOM')result=await host.BOMWorkspace.reviewAction(action,item.id);
      else if(item.fixed)result=await shared.review(item.scope,action,item.id);
      else throw Error(t('舊版案件僅供查閱；請由共用草稿重新送審。','Hồ sơ cũ chỉ để xem; hãy gửi lại từ bản nháp chung.'));
      if(result&&who===actor()){state.masterReviewId=null;state.masterReviewExpanded=null;bodies.delete(key(item));applyActive();}
    }catch(e){if(who===actor())error=message(e);}finally{busy=false;redraw();}}
    function bind(){const root=document.querySelector('#master-unified-review');if(!root)return;
      root.querySelectorAll('[data-master-review]').forEach(b=>b.onclick=()=>{if(busy)return;state.masterReviewId=b.dataset.masterReview;state.masterReviewExpanded=null;state.masterDiffPage=0;error='';redraw();});
      root.querySelectorAll('[data-review-mode]').forEach(b=>b.onclick=()=>{if(busy)return;state.masterReviewMode=b.dataset.reviewMode;state.masterReviewId=null;state.masterReviewExpanded=null;error='';redraw();});
      root.querySelectorAll('[data-review-action]').forEach(b=>b.onclick=()=>act(b.dataset.reviewAction));
      root.querySelector('#master-case-diff')?.addEventListener('click',()=>{const item=selected();state.masterReviewExpanded=state.masterReviewExpanded===key(item)?null:key(item);state.masterDiffPage=0;redraw();if(state.masterReviewExpanded)void loadBody(item);});
      root.querySelectorAll('[data-review-page]').forEach(b=>b.onclick=()=>{state.masterDiffPage=(state.masterDiffPage||0)+Number(b.dataset.reviewPage);redraw();});
      root.querySelector('#master-review-refresh').onclick=async()=>{if(busy)return;busy=true;error='';redraw();try{await refresh();}catch(e){error=message(e);}finally{busy=false;redraw();}};
    }
    host.MasterReview.open=(scope,id)=>{items();state.approvalTab='master';state.masterReviewMode='pending';state.masterReviewId=id?scope+':'+id:null;state.masterReviewExpanded=null;navigate('approval');if(state.view!=='approval')return;const url=new URL(location.href);url.searchParams.set('view','approval');url.searchParams.set('approvalTab','master');url.searchParams.delete('dataTab');history.replaceState(history.state,'',url);};
    host.addEventListener('bom-review-updated',redraw);
    return {view,bind};
  }
  host.MasterReview={install,diff,readableScopes};
})(typeof window==='undefined'?globalThis:window);

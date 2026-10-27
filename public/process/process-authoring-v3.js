(function(host){
 'use strict';
  const displayDraftError = error => window.sharedDraftErrorMessage?.(error) ?? (typeof error === 'string' ? error : error?.message || String(error ?? ''));
 const copy=v=>structuredClone(v),t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
 const enabled=()=>!!localStorage.getItem('processAuthoringControl');
 let inspection=null,issueRows=[],beginRecovery=null;
 let archiveVersions=null,control=null,localBase=null,permissions={},transport=null,actorId=null,loadedStamp=null,busy=false,loading=null,loadError='',loadIssues=[],validationSavedId=null,localFailure=false,rejectedPaths=[],savedEquivalent=false,rendering=false;
 const flow=()=>control?.workflow,modalOpen=()=>!!document.querySelector('#inspector-form')?.closest('dialog[open]');
 const identityStamp=()=>({id:host.ProcessSync?.identity?.id,epoch:host.ProcessSync?.identityGeneration?.(),identity:host.ProcessSync?.identity,delivery:host.ProcessSync?.captureDelivery?.()});
 const sameStamp=(a,b)=>!!a&&(!a.delivery||host.ProcessSync?.isCurrentDelivery?.(a.delivery)!==false)&&a.id===b.id&&(typeof a.epoch==='number'&&typeof b.epoch==='number'?a.epoch===b.epoch:a.identity===b.identity);
 const ownFlow=()=>actorId===host.ProcessSync?.identity?.id&&sameStamp(loadedStamp,identityStamp());
function client(){const id=host.ProcessSync?.identity?.id;if(!id)throw Error('LOGIN_REQUIRED');if(actorId!==id){beginRecovery=null;actorId=id;loadedStamp=null;archiveVersions=null;control=null;localBase=null;permissions={};localFailure=false;rejectedPaths=[];loadError='';loadIssues=[];validationSavedId=null;transport=host.createSharedDraftClient({endpoint:'/api/process-authoring/workflow?caseMetadata=1',conditionalState:true,legacyArchive:true,actorId:id,headers:()=>host.ProcessSync.platformHeaders?.()||{'Content-Type':'application/json'}});}return transport;}
 const diff=host.createMasterSharedBridge({control:{active:{},versions:[]}}).diff;
 // The generic bridge has no string-key delete operation. Only BOM selections
 // need map-key removal here; use the existing whole-field set with its exact
 // old-map guard, never undefined/remove or a broad generic diff policy change.
 function authoringDiff(before,after,path){
  const changes=diff(before,after,path),bomMap=value=>{
   if(!value||Object.prototype.toString.call(value)!=='[object Object]')return false;
   const prototype=Object.getPrototypeOf(value),ctor=prototype&&Object.hasOwn(prototype,'constructor')&&prototype.constructor;
   return (prototype===null||Object.getPrototypeOf(prototype)===null&&typeof ctor==='function'&&Function.prototype.toString.call(ctor)===Function.prototype.toString.call(Object))&&Object.values(value).every(codes=>Array.isArray(codes)&&codes.every(code=>typeof code==='string'));
  };
  for(const [stage,operations]of Object.entries(after.stages||{})){
   const prior=before.stages?.[stage];if(!Array.isArray(operations)||!Array.isArray(prior))continue;
   for(const operation of operations){if(!operation||typeof operation.id!=='string')continue;
   const previous=prior.find(row=>row?.id===operation.id),old=previous?.bomSelections,next=operation.bomSelections;
   if(!bomMap(old)||!bomMap(next)||!Object.keys(old).some(product=>!Object.hasOwn(next,product)))continue;
   const mapPath=[...path,'stages',stage,{id:operation.id},'bomSelections'],key=JSON.stringify(mapPath),within=entry=>JSON.stringify(entry.path.slice(0,mapPath.length))===key;
   changes.patches=changes.patches.filter(p=>!within(p));changes.guards=changes.guards.filter(g=>!within(g));
   changes.patches.push({op:'set',path:mapPath,value:copy(next)});changes.guards.push({path:mapPath,value:copy(old)});
   }
  }
  return changes;
 }
function adopt(result,replace=true){if(result.control&&flow()&&result.control.workflow?.generation===flow().generation&&result.control.workflow.revision<flow().revision)return;if(result.permissions)permissions=result.permissions;if(result.control){control=result.control;savedEquivalent=!!flow()?.saved&&JSON.stringify(flow().saved.content)===JSON.stringify(flow().working);if(replace){localBase=copy(flow()?.working);state.editorByCategory={};for(const w of flow()?.working.workspaces||[])state.editorByCategory[w.category+':'+w.line]=copy(w.stages);}}if(!loadIssues.length||validationSavedId!==flow()?.saved?.id){loadError='';loadIssues=[];validationSavedId=null;}host.ProcessCanvasLocal?.accept(flow());host.VersionDraftUI?.updateSaved(document.querySelector('#authoring-v3-panel'),flow());}
 function refresh(){if(rendering)return;rendering=true;try{render();}finally{rendering=false;}}
 function error(e){loadError=e.message||'SYNC_FAILED';if(Array.isArray(e.details?.issues)){loadIssues=e.details.issues;validationSavedId=flow()?.saved?.id;}toast(displayDraftError(loadError));panel();}
 async function inspect(){const c=client(),result=await c.contentIssues();if(c!==transport||actorId!==host.ProcessSync?.identity?.id||result.generation!==flow()?.generation||result.revision!==flow()?.revision)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');inspection=result;return true;}
 let inspectionTimer=null;
 function inspectLater(){inspection=null;clearTimeout(inspectionTimer);const owner=transport;inspectionTimer=setTimeout(()=>{if(owner!==transport||actorId!==host.ProcessSync?.identity?.id)return;void inspect().then(()=>panel()).catch(()=>{if(owner===transport&&actorId===host.ProcessSync?.identity?.id)panel();});},0);}
 function issueMarkup(){
  issueRows=[];

  return ['working',flow()?.pendingId?'review':'saved'].map(source=>{const group=inspection?.[source],title=source==='working'?t('目前工作內容','Nội dung đang làm'):source==='review'?t('送審固定快照','Bản chụp gửi duyệt cố định'):t('最後已儲存快照','Bản chụp đã lưu gần nhất');
   if(!group?.checked)return '<p data-authoring-issue-kind="missing" class="vd-unchecked">'+title+' · '+t('尚未檢查／無快照','Chưa kiểm tra / chưa có bản chụp')+'</p>';
   return '<details data-authoring-issue-kind="missing" data-vd-source="'+(source==='working'?'working':'snapshot')+'" data-issue-count="'+group.issues.length+'"><summary>'+title+' · '+group.issues.length+'</summary><p>'+t('內容待補不阻擋送審或核准；不代表所有檢查通過。','Các mục cần bổ sung không chặn gửi / duyệt; không có nghĩa mọi kiểm tra đã đạt.')+'</p><ul>'+group.issues.map(i=>{const index=issueRows.push({...i,source})-1,[code]=i.message.split(':'),workspace=flow()?.working.workspaces.find(w=>w.id===i.path?.[1]?.id),op=workspace?.stages[i.path[3]]?.find(o=>o.id===i.path[4]?.id),orphan=code==='PRODUCT_MISSING',locatable=source==='working'&&op&&!orphan&&permissions.edit&&!flow()?.pendingId;return '<li><div>'+escapeHtml(host.VersionDraftUI.issueMessage(i))+'<small>'+escapeHtml(i.path.map(p=>typeof p==='string'?p:p.id).join(' / '))+'</small><small>'+t('影響：此流程的內容尚不完整','Ảnh hưởng: nội dung quy trình chưa đầy đủ')+'</small></div>'+(locatable||orphan&&permissions.history?'<button type="button" class="button ghost" data-authoring-issue="'+index+'" data-issue-code="'+code+'">'+(orphan?t('尚無修正入口；查看封存','Chưa có lối sửa; xem lưu trữ'):t('前往修正目前內容','Sửa nội dung hiện tại'))+'</button>':'<small>'+t('唯讀快照／尚無修正入口；依上述對象查閱','Bản chụp chỉ đọc / chưa có lối sửa; tra cứu đối tượng ở trên')+'</small>')+'</li>';}).join('')+'</ul></details>';
  }).join('');
 }
 function editorChanged(){if(!localBase||state.view!=='editor')return false;const w=localBase.workspaces.find(w=>w.category===state.category&&w.line===state.editorLine),local=state.editorByCategory[editorKey()];return !!local&&JSON.stringify(w?.stages||{})!==JSON.stringify(local);}
 function locateIssue(index){
  if(modalOpen()||localFailure||editorChanged()){toast(t('請先套用、取消或處理目前未同步內容，再前往其他流程。','Hãy áp dụng, hủy hoặc xử lý nội dung chưa đồng bộ trước khi chuyển bước.'));return;}
  const issue=issueRows[index],workspace=flow()?.working.workspaces.find(w=>w.id===issue?.path?.[1]?.id);if(!workspace)return;
  if(issue.message.startsWith('PRODUCT_MISSING:')){
   toast(t('產品主資料缺失；原流程保留待確認。請從舊版本封存查閱，勿改指其他產品。','Thiếu dữ liệu gốc sản phẩm; giữ nguyên để xác nhận. Xem kho phiên bản cũ, không đổi sang sản phẩm khác.'));
   void(async()=>{const c=client();let before,archive;
    do{const page=await c.legacyHistory(before);for(const v of page.versions.filter(v=>v.category===workspace.category&&v.line===workspace.line)){
     const original=(await c.legacyVersion(v.id)).legacyVersion;if(JSON.stringify(original.stages)===JSON.stringify(workspace.stages)){archive=v;break;}
    }before=page.next;}while(before&&!archive);
    await host.openSharedDraftHistory({client:c,editable:()=>false,onApplied:async()=>{},legacyFirst:true,legacyVersionId:archive?.id});
   })().catch(error);return;
  }
  state.view='editor';state.category=workspace.category;state.editorLine=workspace.line;state.editorVersionId=null;refresh();
  const stage=issue.path[3],id=issue.path[4]?.id,operation=id&&ensureCategoryEditor()?.[stage]?.find(op=>op.id===id);
  if(operation){host.ProcessOpenOperation(operation);return;}
  const canvas=stage&&document.querySelector(`[data-stage-canvas="${CSS.escape(stage)}"]`);(canvas||document.querySelector('#authoring-v3-panel'))?.scrollIntoView({block:'center'});toast(t('已切換到此問題的產品類別與線別；請依待補清單處理。','Đã mở đúng nhóm sản phẩm và chuyền; hãy xử lý theo danh sách cần bổ sung.'));
 }
 function load(){if(!enabled()||!['editor','approval'].includes(state.view)||state.view==='approval'&&state.approvalTab!=='process'||!host.ProcessSync?.identity?.id)return loading;client();if(loading||busy||modalOpen()||(document.querySelector('.gesture-active')||host.ProcessEditorV2?.interacting?.())||localFailure||editorChanged())return loading;const delivery=host.ProcessSync?.captureDelivery?.(),owns=()=>!delivery||host.ProcessSync.isCurrentDelivery(delivery);loading=(async()=>{try{const previousWorkspace=JSON.stringify(state.editorByCategory[editorKey()]||{}),c=client(),owner=identityStamp(),f=ownFlow()?flow():null,result=await c.read(f?f.generation+':'+f.revision:'');if(c!==transport||actorId!==host.ProcessSync?.identity?.id||!sameStamp(owner,identityStamp()))return;if(result.permissions)permissions=result.permissions;
    if(modalOpen()||(document.querySelector('.gesture-active')||host.ProcessEditorV2?.interacting?.())||editorChanged())return;if(!result.unchanged)adopt(result);loadedStamp=owner;beginRecovery=null;
    if(!result.unchanged&&(state.view!=='editor'||previousWorkspace!==JSON.stringify(state.editorByCategory[editorKey()]||{}))&&['editor','approval'].includes(state.view)&&!modalOpen()&&!editorChanged()&&!(document.querySelector('.gesture-active')||host.ProcessEditorV2?.interacting?.())&&!document.activeElement?.matches('input,textarea,select'))refresh();
    // Advisory checks and paginated archives must not delay the usable canvas.
    if(!result.unchanged||!inspection)inspectLater();
   }catch(e){if(owns())error(e);}finally{if(owns())panel();}})().finally(()=>{if(owns())loading=null;});return loading;}
 async function readyForEditor(){if(!enabled()||state.view!=='editor'||!host.ProcessSync?.identity?.id)return;if(!flow()||actorId!==host.ProcessSync.identity.id)await load();if(!flow())throw Error(loadError||'AUTHORING_LOAD_REQUIRED');if(!modalOpen()&&!editorChanged())refresh();}
 async function sync(extraGuards=[]){if(!enabled())return false;
  if(loading){
   const requestActor=identityStamp(),requestCategory=state.category,requestLine=state.editorLine,
    requestGeneration=flow()?.generation,requestWorkspace=ensureCategoryEditor();
   await loading;
   if(!sameStamp(requestActor,identityStamp()) || state.category!==requestCategory || state.editorLine!==requestLine ||
    flow()?.generation!==requestGeneration || ensureCategoryEditor()!==requestWorkspace)throw Error('DEPENDENCY_CHANGED_RECONFIRM');
  }
  if(busy)throw Error('OPERATION_IN_PROGRESS');if(!flow())throw Error('AUTHORING_LOAD_REQUIRED');if(!permissions.edit||flow().pendingId)throw Error('PENDING_OR_PERMISSION_LOCKED');
  const before=localBase||flow().working,next={...before,workspaces:[...before.workspaces]},id=JSON.stringify([state.category,state.editorLine]),stages=copy(ensureCategoryEditor()),index=next.workspaces.findIndex(w=>w.id===id),w={id,category:state.category,line:state.editorLine,stages};if(index<0)next.workspaces.push(w);else next.workspaces[index]=w;
  // Older clients created empty stages from every line sharing this category.
  const allowedStages=new Set(lineFor(state.editorLine).stages.map(s=>s.code)),priorStages=before.workspaces.find(row=>row.id===id)?.stages||{};for(const [stage,ops]of Object.entries(w.stages))if(!allowedStages.has(stage)&&!Object.hasOwn(priorStages,stage)&&Array.isArray(ops)&&!ops.length)delete w.stages[stage];
  const changes=index<0?{patches:[{op:'insert',path:['workspaces'],value:w}],guards:[]}:authoringDiff(before.workspaces[index],w,['workspaces',{id}]),at=(value,path)=>path.reduce((v,p)=>typeof p==='string'?v?.[p]:Array.isArray(v)?v.find(row=>row.id===p.id):undefined,value);
  // A remote user may already have applied the same normalized form value.
  // Do not send an unchanged value or its stale dependency guard back to them.
  const redundant=changes.patches.filter(p=>p.op==='set'&&JSON.stringify(at(flow().working,p.path))===JSON.stringify(p.value)).map(p=>JSON.stringify(p.path));
  changes.patches=changes.patches.filter(p=>!redundant.includes(JSON.stringify(p.path)));changes.guards=changes.guards.filter(g=>!redundant.includes(JSON.stringify(g.path)));
  if(!changes.patches.length){host.ProcessAuthoringV3?.cancelUnapplied();return true;}
  changes.guards.push(...extraGuards);
  busy=true;try{const c=client(),result=await c.command(flow().generation,'apply',changes);adopt(result.control?result:await c.read());localFailure=false;inspectLater();return true;}
  catch(e){localFailure=true;rejectedPaths=changes.patches.map(p=>p.path);error(e);throw e;}finally{busy=false;panel();}
 }
 // A successful Begin is not an authority response. Recover missing authority
 // without replacing the acknowledged model or an unsynchronized canvas journal.
 // Authority is not model freshness: unrelated global advances are allowed;
 // existing server CAS/pending checks still reject conflicting mutations.
 function beginOwner(c,owner,view,category,line){return c===transport&&actorId===owner.id&&!host.ProcessSync?.requiresReload&&sameStamp(owner,identityStamp())&&state.view===view&&state.category===category&&state.editorLine===line;}
 function recoveryCurrent(r){return beginRecovery===r&&beginOwner(r.client,r.owner,r.view,r.category,r.line)&&flow()===r.flow&&flow()?.generation===r.generation&&flow()?.revision===r.flowRevision&&flow()?.pendingId===r.pendingId&&state.editorByCategory[editorKey()]===r.workspace;}
 async function recoverBeginAuthority(r){
  if(!recoveryCurrent(r))return false;
  try{const result=await r.client.permissions();if(!recoveryCurrent(r))return false;
   const access=result.permissions;
   if(!Number.isSafeInteger(result.revision)||result.revision<r.stateRevision)throw Error('AUTHORING_AUTHORITY_READ_REQUIRED');
   if(!access||['view','edit','save','submit','withdraw','approve','return','history','delete'].some(key=>typeof access[key]!=='boolean'))throw Error('AUTHORING_AUTHORITY_READ_REQUIRED');
   if(access.view!==true||access.edit!==true){permissions={};throw Error('PENDING_OR_PERMISSION_LOCKED');}
   permissions=access;loadedStamp=r.owner;beginRecovery=null;loadError='';return true;
  }catch(e){if(recoveryCurrent(r))error(e);return false;}
 }
 async function beginDraft(){
  const c=client(),owner=identityStamp(),view=state.view,category=state.category,line=state.editorLine,before=flow(),workspace=state.editorByCategory[editorKey()],missing=!ownFlow()||typeof permissions.edit!=='boolean';
  const current=()=>beginOwner(c,owner,view,category,line)&&flow()===before&&state.editorByCategory[editorKey()]===workspace;
  try{const result=await c.begin();if(!current())return false;
   if(host.ProcessCanvasLocal?.dirty()||modalOpen()||editorChanged())throw Error('CANVAS_UNSYNCHRONIZED');
   adopt(result);if(!missing)return true;
   permissions={};loadedStamp=null;
   const r=beginRecovery={client:c,owner,view,category,line,flow:flow(),generation:flow()?.generation,flowRevision:flow()?.revision,pendingId:flow()?.pendingId,workspace:state.editorByCategory[editorKey()],stateRevision:result.revision};
   if(!Number.isSafeInteger(r.stateRevision)||r.stateRevision<0){beginRecovery=null;throw Error('AUTHORING_AUTHORITY_READ_REQUIRED');}
   return await recoverBeginAuthority(r);
  }catch(e){if(beginOwner(c,owner,view,category,line))error(e);return false;}
 }
 async function retryBeginAuthority(){const r=beginRecovery;if(!r||!recoveryCurrent(r)){if(beginRecovery===r)beginRecovery=null;return await load();}
  if(busy)return;busy=true;panel();try{await recoverBeginAuthority(r);}finally{busy=false;panel();}
 }
 async function action(name,detail={}){if(name==='save'&&host.ProcessCanvasLocal?.dirty()){try{const canvas=await host.ProcessCanvasLocal.beforeSave();if(canvas===null)return;detail={...detail,...canvas};}catch(e){error(e);return;}}if(loading)await loading;if(busy)throw Error('OPERATION_IN_PROGRESS');busy=true;panel();let currentBegin=()=>true;try{const c=client();if(name==='begin'){const owner=identityStamp(),view=state.view,category=state.category,line=state.editorLine;currentBegin=()=>beginOwner(c,owner,view,category,line);}if(detail.canvasGeneration&&detail.canvasGeneration!==flow()?.generation)throw Error('CANVAS_GENERATION_CHANGED');delete detail.canvasGeneration;if(name==='begin'){if(!await beginDraft())return;}else{
    if(name==='save'){if(localFailure)throw Error('SYNC_FAILED_RETRY_REQUIRED');await c.flush();if(modalOpen()&&!confirm(t('只儲存已同步內容，不包含尚未套用表單。繼續？','Chỉ lưu nội dung đã đồng bộ, không gồm biểu mẫu chưa áp dụng. Tiếp tục?')))return;}
    const result=await c.command(flow().generation,name,detail);adopt(result.control?result:await c.read(),!modalOpen());
   }await inspect();if(currentBegin()&&!modalOpen())refresh();
  }catch(e){if(currentBegin())error(e);}finally{busy=false;panel();}}
 async function reviewDecision(name,caseId){
  const pending=flow()?.cases.find(c=>c.id===caseId&&c.id===flow()?.pendingId&&c.status==='pending');
  if(!pending||!['approve','return'].includes(name)||!permissions[name])throw Error('CASE_NOT_PENDING');
  const answer=await host.VersionDraftUI.confirmReview({action:name==='return'?'reject':name,scope:t('製程送審','Duyệt quy trình'),selfReview:pending.actor.id===actorId});if(!answer)return false;
  const detail={caseId,...answer};if(name==='approve'){await inspect();const issues=inspection?.review?.issues||[];if(issues.length){if(!confirm(t('仍有 '+issues.length+' 項待補，確認帶待補核准？','Còn '+issues.length+' mục cần bổ sung. Xác nhận duyệt?')))return false;detail.acknowledgedContentIssues=issues;}}
  const owner=actorId;await action(name,detail);if(owner!==host.ProcessSync?.identity?.id)throw Error('LOGIN_REQUIRED');
  if(flow()?.pendingId===caseId)throw Error(loadError||'REVIEW_NOT_COMPLETED');return true;
 }
 function reviewPanel(){
  const parent=document.querySelector('#approval-panel-process')||document.querySelector('.approval-page');if(!parent)return;
  let target=parent.querySelector('#authoring-v3-review');if(!target){target=document.createElement('section');target.id='authoring-v3-review';target.className='review-case-card';target.dataset.i18nSkip='true';parent.replaceChildren(target);}
  const f=flow(),pending=f?.cases.find(c=>c.id===f.pendingId),effective=control?.versions.find(v=>v.id===control.activeVersionId);
  const markup=`<h2>${t('製程送審案件','Hồ sơ duyệt quy trình')}</h2><p>${t('目前正式版本','Phiên bản có hiệu lực')} · ${effective?'V'+effective.number:'—'}</p><p role="status">${escapeHtml(loadError ? displayDraftError(loadError) : (!f?t('正在讀取案件…','Đang tải hồ sơ…'):pending?t('待審','Chờ duyệt')+' · '+(pending.actor?.name||''):t('目前沒有待審案件','Không có hồ sơ chờ duyệt')))}</p>${pending?'<p>'+escapeHtml(pending.reason||'')+'</p>':''}<div class="toolbar">${pending?`<button class="button ghost" data-process-review="view">${t('查看／審核','Xem / duyệt')}</button>${permissions.withdraw?`<button class="button ghost" data-process-review="withdraw">${t('撤回送審','Rút hồ sơ')}</button>`:''}`:''}${permissions.history?`<button class="button ghost" data-process-review="history">${t('歷史案件','Lịch sử hồ sơ')}</button>`:''}<button class="button ghost" data-process-review="reload">${t('重新整理','Tải lại')}</button></div>`;
  if(target.__markup!==markup){const restore=host.VersionDraftUI.preserveView(parent);target.innerHTML=markup;target.__markup=markup;restore();}
  for(const button of target.querySelectorAll('[data-process-review]')){button.disabled=busy;button.onclick=async()=>{const name=button.dataset.processReview;button.disabled=true;try{
   if(name==='reload'){await load();return;}
   if(name==='view'){
    const owner=identityStamp(),c=client(),caseId=pending?.id,generation=f?.generation;
    const current=()=>c===transport&&actorId===owner.id&&sameStamp(owner,identityStamp())&&state.view==='approval'&&state.approvalTab==='process'&&flow()?.generation===generation&&flow()?.pendingId===caseId;
    if(loading)await loading;
    if(!caseId||!generation||!current())throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
    if(busy||loadError||localFailure||c.hasUnknown()||c.hasSyncFailures())throw Error(loadError||'SYNC_FAILED_RETRY_REQUIRED');
    const result=await c.read(),fresh=result.control?.workflow,access=result.permissions;
    if(!current()||busy||loadError||localFailure||c.hasUnknown()||c.hasSyncFailures()||!fresh||!Number.isSafeInteger(fresh.revision)||fresh.revision<flow().revision||fresh.generation!==generation||fresh.pendingId!==caseId||!Array.isArray(fresh.cases)||!fresh.cases.some(row=>row.id===caseId&&row.status==='pending')||access?.view!==true||access.history!==true||typeof access.approve!=='boolean'||typeof access.return!=='boolean')throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
    adopt(result,false);loadedStamp=owner;
    if(!current())throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
    await host.openSharedDraftHistory({client:c,caseId,reviewActions:[{name:'approve',label:t('核准','Duyệt'),enabled:access.approve===true},{name:'return',label:t('發回修改','Trả lại để sửa'),enabled:access.return===true}],onReview:reviewDecision,editable:()=>false,onApplied:async()=>{}});return;
   }
   if(name==='history'){await host.openSharedDraftHistory({client:client(),editable:()=>false,onApplied:async()=>{}});return;}
   const answer=await host.VersionDraftUI.confirmReview({action:name==='return'?'reject':name,scope:t('製程送審','Duyệt quy trình'),selfReview:name!=='withdraw'&&pending.actor.id===actorId});if(!answer)return;
   const detail={caseId:pending.id,...answer};if(name==='approve'){await inspect();const issues=inspection?.review?.issues||[];if(issues.length){if(!confirm(t('仍有 '+issues.length+' 項待補，確認帶待補核准？','Còn '+issues.length+' mục cần bổ sung. Xác nhận duyệt?')))return;detail.acknowledgedContentIssues=issues;}}
   await action(name,detail);
  }catch(e){error(e);}finally{button.disabled=false;}};}
 }
 function panel(){if(!enabled()||!['editor','approval'].includes(state.view))return;if(state.view==='approval'){const badge=document.querySelector('[data-review-tab="process"] .approval-tab-count');if(badge)badge.textContent=host.ProcessAuthoringV3?.pendingCount()??'—';if(state.approvalTab==='process'){reviewPanel();if(!flow()&&!loading&&!loadError)queueMicrotask(()=>void load());}return;}
  let target=document.querySelector('#authoring-v3-panel');if(!target){target=document.createElement('section');target.id='authoring-v3-panel';target.className='editor-version-panel';target.dataset.i18nSkip='true';const anchor=state.view==='editor'?document.querySelector('.editor-toolbar'):(document.querySelector('#approval-panel-process')||document.querySelector('.approval-page'));if(!anchor)return;if(state.view==='approval')anchor.replaceChildren(target);else anchor.after(target);}
  const f=flow(),pending=f?.pendingId,open=control?.versions.some(v=>v.status==='draft'),locked=!f||!permissions.edit||!!pending||!open;
  const effective=control?.versions.find(v=>v.id===control.activeVersionId),metadata=`<p>${t('目前正式版本','Phiên bản có hiệu lực')}: ${escapeHtml(effective?'V'+effective.number:'—')} · ${t('目前查看','Đang xem')}: ${pending?t('送審固定內容','Nội dung gửi duyệt cố định'):locked?t('唯讀','Chỉ đọc'):t('共用工作內容','Nội dung làm việc chung')}</p>${f?.saved?`<p>${t('最後成功儲存','Lần lưu thành công cuối')}: ${escapeHtml(f.saved.actor.name)} · ${escapeHtml(f.saved.at)} · ${t('修訂','Sửa đổi')} ${f.saved.revision}<br>${savedEquivalent?t('已儲存；無後續同步修改','Đã lưu; không có thay đổi đồng bộ sau đó'):t('已同步；有尚未手動儲存內容','Đã đồng bộ; có nội dung chưa lưu thủ công')}</p>`:''}`;
const markup=`<div><h3>${t('整個製程平台 · 共用草稿','Toàn bộ nền tảng quy trình · Bản nháp chung')}</h3><p>${pending?t('待審鎖定','Đang chờ duyệt · đã khóa'):f?.saved?t('已儲存版本與未儲存工作分開','Bản đã lưu và thay đổi chưa lưu được tách riêng'):t('尚未建立 V3 儲存快照；舊已儲存版本仍保留於封存，目前工作內容可能含未儲存修改','Chưa tạo bản lưu V3; các bản đã lưu trước đây vẫn còn trong kho cũ. Nội dung đang làm có thể gồm thay đổi chưa lưu')}</p><p role="status">${escapeHtml(loadError ? displayDraftError(loadError) : t('已同步','Đã đồng bộ'))}</p>${issueMarkup()}</div><div class="toolbar">${!f||!open&&!pending?`<button class="button" data-av3="begin">${t('開始共用修改','Bắt đầu sửa chung')}</button>`:''}<button class="button" data-av3="save" ${locked?'disabled':''}>${t('儲存共用草稿','Lưu bản nháp chung')}</button><button class="button signal" data-av3="submit" ${locked||!f?.saved||!permissions.submit?'disabled':''}>${t('送出已儲存版本','Gửi bản đã lưu')}</button>${pending&&permissions.withdraw?`<button class="button" data-av3="withdraw">${t('撤回','Rút hồ sơ')}</button>`:''}${permissions.history?`<button class="button" data-av3="legacy">${t('查看舊已儲存版本／封存','Xem bản đã lưu / kho phiên bản cũ')}</button><button class="button" data-av3="history">${t('歷史與還原','Lịch sử / khôi phục')}</button>`:''}<button class="button" data-av3="retry">${t('重新檢查同步','Kiểm tra đồng bộ')}</button></div>`;
  const completeMarkup='<section class="av3-header">'+markup.replace('</h3>','</h3>'+metadata).replace('role="status"','id="authoring-live-status" role="status"')+'</section>';
  if(target.__authoringMarkup!==completeMarkup){target.innerHTML=completeMarkup;target.__authoringMarkup=completeMarkup;for(const b of target.querySelectorAll('[data-av3]'))b.__authoringDisabled=b.disabled;}
  target.querySelector('[role="status"]').textContent=loadError ? displayDraftError(loadError) : '';
  for(const button of target.querySelectorAll('[data-authoring-issue]')){button.disabled=busy;button.onclick=()=>locateIssue(Number(button.dataset.authoringIssue));}
  for(const b of target.querySelectorAll('[data-av3]')){b.disabled=busy||b.__authoringDisabled;b.onclick=async()=>{const name=b.dataset.av3;try{
    if(name==='history'||name==='legacy')return await host.openSharedDraftHistory({client:client(),legacyFirst:name==='legacy',editable:()=>!locked&&permissions.history,onApplied:async()=>{await load();refresh();}});
    if(name==='retry'){if(client().hasUnknown()){try{await client().resolveUnknown();}catch(e){if(e.status!==404)throw e;if(!confirm(t('以同一操作編號重試？','Thử lại với cùng mã thao tác?')))return;await client().retryUnknown();}localFailure=client().hasSyncFailures();loadError=localFailure?'SYNC_FAILED_RETRY_REQUIRED':'';await load();panel();}else if(localFailure)await sync();else if(beginRecovery)await retryBeginAuthority();else await load();return;}
    const detail={};
    if(name==='submit'){await inspect();detail.savedId=f.saved.id;detail.reason=await host.VersionDraftUI.confirmSubmit(host.VersionDraftUI.reasonFor(control.versions.find(v=>v.status==='draft'),f),t('整個製程平台','Toàn bộ nền tảng quy trình'),{missingCount:inspection?.saved?.issues?.length||0});if(!detail.reason)return;}
    if(['withdraw','approve','return'].includes(name)){detail.caseId=pending;const own=f.cases.find(c=>c.id===pending)?.actor.id===actorId;const answer=await host.VersionDraftUI.confirmReview({action:name==='return'?'reject':name,scope:t('整個製程平台','Toàn bộ nền tảng quy trình')+' · '+pending,selfReview:name!=='withdraw'&&own});if(!answer)return;Object.assign(detail,answer);}
    if(name==='approve'){await inspect();const issues=inspection?.review?.issues||[];if(issues.length){if(!confirm(t('仍有 '+issues.length+' 項待補。確認帶待補核准？此確認會留下紀錄，不表示所有檢查通過。','Còn '+issues.length+' mục cần bổ sung. Xác nhận duyệt kèm các mục này? Việc xác nhận được ghi lại; không có nghĩa mọi kiểm tra đã đạt.')))return;detail.acknowledgedContentIssues=issues;}}
    await action(name,detail);
   }catch(e){error(e);}};}
  if(target.querySelector('.av3-header')){
   const selected=control?.versions.find(v=>['draft','pending'].includes(v.status))||effective;
   const select=document.createElement('select');select.id='authoring-version-choice';select.innerHTML=`<optgroup label="${host.VersionDraftUI.t('menu')}">${(control?.versions||[]).map(v=>`<option value="${escapeHtml(v.id)}" ${v.id===selected?.id?'selected':''}>V${v.number}</option>`).join('')}</optgroup><optgroup label="${t('舊已儲存版本／封存','Bản đã lưu / kho phiên bản cũ')}">${(archiveVersions||[]).map(v=>`<option value="legacy:${escapeHtml(v.id)}">${escapeHtml(v.category)} / ${escapeHtml(v.line)} · V${v.number}</option>`).join('')}<option value="legacy">${t('查看封存清單','Xem danh sách lưu trữ')}</option></optgroup>`;
   select.onchange=async()=>{const value=select.value,legacy=value.startsWith('legacy'),version=control.versions.find(v=>v.id===value);if(value===selected?.id)return;select.value=selected?.id||'';try{await host.openSharedDraftHistory({client:client(),legacyFirst:legacy,legacyVersionId:value.startsWith('legacy:')?value.slice(7):null,caseId:!legacy&&f.cases.some(c=>c.id===value)?value:null,versionPreview:!legacy?version:null,editable:()=>false,onApplied:async()=>{}});}catch(e){error(e);}};
   target.querySelector('.av3-header').prepend(select);
   const retry=target.querySelector('[data-av3="retry"]');if(retry&&!loadError&&!localFailure&&!client().hasUnknown())retry.hidden=true;
   const legacy=target.querySelector('[data-av3="legacy"]');if(legacy)legacy.remove();
   host.VersionDraftUI.mount(target,{header:'.av3-header',historyClient:client,module:t('製程編輯台','Trình chỉnh sửa quy trình'),scope:t('整個製程平台','Toàn bộ nền tảng quy trình'),version:selected,versions:control?.versions,active:effective,flow:f,busy,failed:!!loadError||localFailure||client().hasUnknown(),actions:{begin:'[data-av3="begin"]',save:'[data-av3="save"]',submit:'[data-av3="submit"]',withdraw:'[data-av3="withdraw"]'},review:()=>{if(host.ProcessDeliveryNavigation?.approval){void host.ProcessDeliveryNavigation.approval('process');return;}state.approvalTab='process';navigate('approval');const url=new URL(location.href);url.searchParams.set('view','approval');url.searchParams.set('approvalTab','process');url.searchParams.delete('dataTab');history.replaceState(history.state,'',url);void load();},errors:'[data-authoring-issue-kind="error"]',missing:'[data-authoring-issue-kind="missing"]',history:['[data-av3="history"]'],status:['#authoring-live-status']});
   if(retry&&!retry.hidden)target.querySelector('.vd-errors').append(retry);
  }
  host.VersionDraftUI.updateSync(target,busy,!!loadError||localFailure||client().hasUnknown());
  host.ProcessEditorV2?.updateControls?.();host.ProcessCanvasLocal?.update();
  if(state.view==='editor'){const page=document.querySelector('.editor-page');page?.classList.toggle('editor-readonly',locked);page?.classList.toggle('editor-submitted-lock',locked);
   document.querySelectorAll('.add-operation,.auto-layout-stage,.arrange-all-stages,.operation-delete,#undo-layout,[data-add-template],[data-add-custom]').forEach(e=>{e.disabled=locked||busy||e.id==='undo-layout'&&!state.positionUndo;e.style.pointerEvents=locked||busy?'none':'';});
   const save=document.querySelector('#save-process');if(save){save.hidden=true;save.disabled=locked||busy;save.onclick=()=>action('save');}
   let toolbar=page?.querySelector('.vd-canvas-tools');if(!toolbar){toolbar=document.createElement('div');toolbar.className='vd-canvas-tools toolbar';page?.querySelector('.editor-workspace')?.before(toolbar);}page?.querySelectorAll('.editor-toolbar .arrange-all-stages,.editor-toolbar #undo-layout').forEach(button=>toolbar.append(button));
  }
 }
 function bindMutations(){if(!enabled())return;document.querySelectorAll('[data-add-template],[data-add-custom],.operation-delete,#delete-operation').forEach(button=>{const old=button.onclick;if(old?.authoringV3)return;const handler=async event=>{try{if(loading)await loading;if(busy)throw Error('OPERATION_IN_PROGRESS');if(!permissions.edit||flow()?.pendingId)throw Error('PENDING_OR_PERMISSION_LOCKED');await old?.call(button,event);await sync();refresh();}catch(e){error(e);}};handler.authoringV3=true;button.onclick=handler;});}
 function formalNotice(){
  document.querySelector('.vd-formal-issues')?.remove();if(!enabled()||!['player','dispatch','productStatus'].includes(state.view))return;
  const raw=control||JSON.parse(localStorage.getItem('processAuthoringControl')||'null'),active=raw?.versions.find(v=>v.id===raw.activeVersionId),issues=active?.contentIssues?.issues||[],missing=(state.view==='player'?dispatchBoard[state.deviceLine]||[]:[]).filter(code=>!data.products.some(p=>p.code===code));
  if(!issues.length&&!missing.length)return;const panel=document.createElement('details');panel.className='vd-formal-issues';panel.dataset.i18nSkip='true';panel.innerHTML='<summary>'+t('正式內容仍有待補','Nội dung có hiệu lực vẫn cần bổ sung')+' · '+issues.length+(missing.length?' + '+t('缺少產品','Thiếu sản phẩm')+' '+missing.length:'')+'</summary><p>'+t('以下為核准案件保留的待補；不表示內容完整。缺失引用不會替換為其他產品或材料。','Đây là các mục cần bổ sung đã lưu trong hồ sơ được duyệt; nội dung chưa đầy đủ. Không thay liên kết thiếu bằng sản phẩm hoặc vật liệu khác.')+'</p>'+issues.map(i=>'<p>'+escapeHtml(host.VersionDraftUI.issueMessage(i))+' · '+escapeHtml(i.path.map(p=>typeof p==='string'?p:p.id).join(' / '))+'</p>').join('')+missing.map(code=>'<p>'+escapeHtml(code)+' · '+t('產品主資料不存在；此產品無法播放','Thiếu dữ liệu gốc; không thể phát quy trình sản phẩm này')+'</p>').join('');document.querySelector('#view-root')?.prepend(panel);
 }
 const previousBind=bindView;bindView=function(){previousBind();panel();bindMutations();formalNotice();};
 const previousInspector=renderInspector;renderInspector=function(op){previousInspector(op);bindMutations();};
 document.addEventListener('click',event=>{if(enabled()&&event.target.closest('[data-view="editor"],[data-view="approval"],[data-review-tab="process"]'))void load();});
 host.ProcessAuthoringV3={navigation:{canLeave:()=>!busy&&!localFailure&&!editorChanged()&&!modalOpen()&&!host.ProcessCanvasLocal?.dirty()&&!host.ProcessEditorV2?.interacting?.(),error:()=>loadError?Error(loadError):null,reset(){beginRecovery=null;clearTimeout(inspectionTimer);inspection=null;issueRows=[];archiveVersions=null;control=null;localBase=null;permissions={};loadedStamp=null;loadError='';loadIssues=[];validationSavedId=null;loading=null;host.ProcessCanvasLocal?.resetClean?.();}},enabled,pendingCount:()=>ownFlow()&&flow()&&permissions.view===true?(flow().pendingId?1:0):null,load,readyForEditor,sync,flow,acceptCanvas(result){adopt(result,!modalOpen());panel();},canEditCanvas:()=>actorId===host.ProcessSync?.identity?.id&&!!permissions.edit&&!flow()?.pendingId&&control?.versions.some(v=>v.status==='draft'),save:()=>action('save'),canMutate:()=>!busy&&!!permissions.edit&&!flow()?.pendingId&&control?.versions.some(v=>v.status==='draft'),cancelUnapplied(){if(!localFailure||editorChanged()||busy)return;if(client().discardRejected(rejectedPaths)){localFailure=false;rejectedPaths=[];loadError='';loadIssues=[];panel();}},workspace:(category,line)=>flow()?.working.workspaces.find(w=>w.category===category&&w.line===line),
  approved(category,line){const raw=control||JSON.parse(localStorage.getItem('processAuthoringControl')||'null'),active=raw?.versions.find(v=>v.id===raw.activeVersionId),w=active?.snapshot.workspaces.find(w=>w.category===category&&w.line===line);return w?{...w,id:active.id,number:active.number,status:'approved',contentIssues:active.contentIssues}:null;}};
 setInterval(()=>{if(document.visibilityState!=='hidden'&&enabled()&&['editor','approval'].includes(state.view)&&!document.activeElement?.matches('input,textarea,select'))void load();},4000);
 if(enabled())void load();
})(window);

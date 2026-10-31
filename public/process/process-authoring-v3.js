(function(host){
 'use strict';
  const displayDraftError = error => window.sharedDraftErrorMessage?.(error) ?? (typeof error === 'string' ? error : error?.message || String(error ?? ''));
 const copy=v=>structuredClone(v),t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
 const enabled=()=>!!localStorage.getItem('processAuthoringControl');
 let inspection=null,inspectionOwner=null,inspectionRun=null,pendingSave=null,pendingSubmit=null,issueRows=[],beginRecovery=null,submitPreparation=null,savePreparation=null,activeIntent=null,localContextEpoch=0,submitStateUnconfirmed=null,canvasEditEpoch=0,lastError=null;
 let archiveVersions=null,control=null,localBase=null,permissions={},transport=null,actorId=null,loadedStamp=null,busy=false,loading=null,loadError='',loadIssues=[],validationSavedId=null,localFailure=false,rejectedPaths=[],savedEquivalent=false,rendering=false;
 const flow=()=>control?.workflow,modalOpen=()=>!!document.querySelector('#inspector-form')?.closest('dialog[open]');
 const identityStamp=()=>({id:host.ProcessSync?.identity?.id,epoch:host.ProcessSync?.identityGeneration?.(),identity:host.ProcessSync?.identity,delivery:host.ProcessSync?.captureDelivery?.()});
 const sameStamp=(a,b)=>!!a&&(!a.delivery||host.ProcessSync?.isCurrentDelivery?.(a.delivery)!==false)&&a.id===b.id&&(typeof a.epoch==='number'&&typeof b.epoch==='number'?a.epoch===b.epoch:a.identity===b.identity);
 const ownFlow=()=>actorId===host.ProcessSync?.identity?.id&&sameStamp(loadedStamp,identityStamp());
 let ownedLedger=null,ownedLedgerActor=null,ownedLedgerOwner=null;
 function operationLedger(){const id=host.ProcessSync?.identity?.id;if(!id||actorId!==id)return null;if(ownedLedgerActor!==id||!sameStamp(ownedLedgerOwner,identityStamp())){ownedLedgerActor=id;ownedLedgerOwner=identityStamp();ownedLedger=null;}if(!ownedLedger&&host.ProcessOwnedDraft?.createOwnedDraftLedger)ownedLedger=host.ProcessOwnedDraft.createOwnedDraftLedger({actorId:id,scope:'process:platform',captureOwner:identityStamp,isOwnerCurrent:owner=>sameStamp(owner,identityStamp())&&!host.ProcessSync?.requiresReload});return ownedLedger;}
 function trackedCommand(c,generation,name,detail){const ledger=c===transport?operationLedger():null;return ledger?ledger.command(c,generation,name,detail,()=>flow()):c.command(generation,name,detail);}
 function trackedRecovery(c,method,args=[]){const ledger=c===transport?operationLedger():null;return ledger?ledger.resolve(c,method,args):c[method](...args);}
 let editorReadiness=null,editorAwaitingPaint=false;
 const currentEditorReadiness=r=>!!r&&!host.ProcessSync?.requiresReload&&sameStamp(r.owner,identityStamp())&&r.contextEpoch===localContextEpoch&&state.view==='editor'&&state.category===r.category&&state.editorLine===r.line&&state.approvalTab===r.tab;
function client(){const id=host.ProcessSync?.identity?.id;if(!id)throw Error('LOGIN_REQUIRED');if(actorId!==id){submitStateUnconfirmed=null;beginRecovery=null;clearTimeout(inspectionTimer);inspection=null;inspectionOwner=null;inspectionRun=null;pendingSave=null;pendingSubmit=null;actorId=id;loadedStamp=null;archiveVersions=null;control=null;localBase=null;permissions={};localFailure=false;rejectedPaths=[];loadError='';loadIssues=[];validationSavedId=null;transport=host.createSharedDraftClient({endpoint:'/api/process-authoring/workflow?caseMetadata=1',conditionalState:true,legacyArchive:true,actorId:id,headers:()=>host.ProcessSync.platformHeaders?.()||{'Content-Type':'application/json'}});}return transport;}
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
function adopt(result,replace=true){if(result.control&&flow()&&result.control.workflow?.generation===flow().generation&&result.control.workflow.revision<flow().revision)return;if(result.permissions)permissions=result.permissions;if(result.control){control=result.control;savedEquivalent=!!flow()?.saved&&JSON.stringify(flow().saved.content)===JSON.stringify(flow().working);if(replace){localBase=copy(flow()?.working);state.editorByCategory={};for(const w of flow()?.working.workspaces||[])state.editorByCategory[w.category+':'+w.line]=copy(w.stages);}}if(!loadIssues.length||validationSavedId!==flow()?.saved?.id){loadError='';loadIssues=[];validationSavedId=null;}operationLedger()?.observe(flow());host.ProcessCanvasLocal?.accept(flow());host.VersionDraftUI?.updateSaved(document.querySelector('#authoring-v3-panel'),flow());}
 function refresh(){if(rendering)return;rendering=true;try{render();if(state.view==='editor')editorAwaitingPaint=false;}finally{rendering=false;}}
 function error(e){loadError=e.message||'SYNC_FAILED';loadIssues=Array.isArray(e.details?.issues)?e.details.issues:[];validationSavedId=loadIssues.length?flow()?.saved?.id:null;lastError={requestId:e.requestId,operationId:e.operationId};toast(displayDraftError(loadError));panel();}
 function errorMarkup(){
  const code=loadError||(submitStateUnconfirmed?'SUBMIT_STATE_UNCONFIRMED':'')||(client().hasUnknown()&&!admittedCommandPending()?'PREVIOUS_OPERATION_UNKNOWN':inspectionFailed()?inspectionRun.error:'');if(!code)return '';
  const unknown=client().hasUnknown()||['RESULT_UNKNOWN_CHECK_BEFORE_RETRY','PREVIOUS_OPERATION_UNKNOWN','RECOVERY_RECORD_INVALID'].includes(code);
  const explanation=unknown?t('結果尚未確認，請勿重複送出或清除本機修改。請先查原操作收據；查無收據不代表未寫入。','Kết quả chưa xác nhận. Không gửi lại hoặc xóa thay đổi cục bộ. Kiểm tra biên nhận gốc; không tìm thấy chưa có nghĩa là chưa ghi.'):'';
  const issues=loadError?loadIssues:[],ids=loadError?[lastError?.requestId,lastError?.operationId].filter(v=>typeof v==='string').map(v=>v.slice(0,200)):[];
  return '<details data-authoring-issue-kind="error" open><summary>'+t('操作／檢查未完成','Thao tác / kiểm tra chưa hoàn tất')+'</summary><p role="alert">'+escapeHtml(code==='SUBMIT_STATE_UNCONFIRMED'?t('送審狀態尚未確認；請唯讀重新確認。','Chưa xác nhận trạng thái gửi duyệt; hãy đọc lại.'):displayDraftError(code))+'</p>'+(submitStateUnconfirmed?'<p>'+escapeHtml(t('不會自動重送；重新讀取只確認目前待審狀態，不代表已查證原操作收據。','Không tự gửi lại; đọc lại chỉ xác nhận trạng thái hiện tại, không xác minh biên nhận thao tác gốc.'))+'</p>':'')+(explanation?'<p>'+escapeHtml(explanation)+'</p>':'')+(ids.length?'<p><code>'+ids.map(escapeHtml).join(' · ')+'</code></p>':'')+(issues.length?'<ul>'+issues.slice(0,50).map(i=>'<li>'+escapeHtml(host.VersionDraftUI.issueMessage(i))+' · '+escapeHtml((i.path||[]).map(p=>typeof p==='string'?p:p.id).join(' / '))+'</li>').join('')+'</ul>':'')+(issues.length>50?'<p>'+t('僅顯示前 50 項；共 '+issues.length+' 項。','Hiển thị 50 mục đầu; tổng '+issues.length+' mục.')+'</p>':'')+'</details>';
 }
 function recoveryKind(){if(ownedLedger?.hasRevertRecovery?.())return t('核對放棄結果（唯讀）','Kiểm tra kết quả bỏ thay đổi (chỉ đọc)');if(submitStateUnconfirmed&&!client().hasUnknown())return '';if(client().hasUnknown()&&!admittedCommandPending())return t('查操作收據／確認重試','Kiểm tra biên nhận / xác nhận thử lại');if(localFailure)return t('重新套用未同步內容','Áp dụng lại nội dung chưa đồng bộ');if(beginRecovery)return t('重新確認操作權限','Kiểm tra lại quyền thao tác');if(inspectionFailed())return t('重試內容檢查','Thử kiểm tra nội dung lại');if(loadError)return t('重新讀取狀態','Đọc lại trạng thái');return '';}

 // Advisory inspection is scoped to one adopted model and delivery. Background
 // polls coalesce only in-flight work; explicit Submit/Approve still read fresh.
 let inspectionTimer=null;
 const inspectionScope=()=>({client:client(),owner:identityStamp(),flow:flow(),generation:flow()?.generation,revision:flow()?.revision,savedId:flow()?.saved?.id,pendingId:flow()?.pendingId,view:state.view,category:state.category,line:state.editorLine,tab:state.approvalTab});
 const inspectionCurrent=r=>!!r&&r.client===transport&&!host.ProcessSync?.requiresReload&&sameStamp(r.owner,identityStamp())&&actorId===r.owner.id&&flow()===r.flow&&flow()?.generation===r.generation&&flow()?.revision===r.revision&&flow()?.saved?.id===r.savedId&&flow()?.pendingId===r.pendingId&&state.view===r.view&&state.category===r.category&&state.editorLine===r.line&&state.approvalTab===r.tab;
 const inspectionReady=()=>!!inspection&&inspectionCurrent(inspectionOwner);
 const savedInspectionReady=()=>inspectionReady()&&inspection.saved?.checked===true&&inspection.saved.id===flow()?.saved?.id;
 const inspectionFailed=()=>inspectionCurrent(inspectionRun)&&inspectionRun.phase==='failed';
 const saveCommandPending=()=>!!pendingSave&&pendingSave.client===transport&&actorId===pendingSave.owner.id&&sameStamp(pendingSave.owner,identityStamp());
 const submitCommandPending=()=>!!pendingSubmit&&pendingSubmit.client===transport&&actorId===pendingSubmit.owner.id&&sameStamp(pendingSubmit.owner,identityStamp());
 const admittedCommandPending=()=>saveCommandPending()||submitCommandPending();
 function inspectionStatus(){if(inspectionCurrent(inspectionRun)&&['scheduled','pending'].includes(inspectionRun.phase))return t('內容驗證中；尚未完成，暫不可送審。','Đang kiểm tra nội dung; chưa hoàn tất, tạm chưa thể gửi duyệt.');if(inspectionFailed())return t('內容驗證未完成，請重試：','Kiểm tra nội dung chưa hoàn tất, hãy thử lại: ')+displayDraftError(inspectionRun.error);return '';}
 async function runInspection(r){
  inspectionRun=r;inspection=null;inspectionOwner=null;r.phase='pending';
  try{const result=await r.client.contentIssues();if(inspectionRun!==r||!inspectionCurrent(r)||result.generation!==r.generation||result.revision!==r.revision)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');if(r.savedId&&(result.saved?.checked!==true||result.saved.id!==r.savedId||!Array.isArray(result.saved.issues)))throw Error('CONTENT_ISSUES_SNAPSHOT_MISMATCH');inspection=result;inspectionOwner=r;r.phase='complete';return true;}
  catch(e){if(inspectionRun===r&&inspectionCurrent(r)){r.phase='failed';r.error=e.message||'CONTENT_ISSUES_LOAD_FAILED';}throw e;}
 }
 async function inspect(){clearTimeout(inspectionTimer);return await runInspection(inspectionScope());}
 function inspectLater(retry=false){
  if(inspectionCurrent(inspectionRun)&&(['scheduled','pending'].includes(inspectionRun.phase)||inspectionRun.phase==='failed'&&!retry))return;
  clearTimeout(inspectionTimer);inspection=null;inspectionOwner=null;const r=inspectionRun={...inspectionScope(),phase:'scheduled'};
  inspectionTimer=setTimeout(()=>{if(inspectionRun!==r||!inspectionCurrent(r))return;void runInspection(r).then(()=>{if(inspectionRun===r&&inspectionCurrent(r))panel();}).catch(()=>{if(inspectionRun===r&&inspectionCurrent(r))panel();});},0);
 }
 function issueMarkup(){
  issueRows=[];

  return ['working',flow()?.pendingId?'review':'saved'].map(source=>{const group=inspectionReady()?inspection?.[source]:null,title=source==='working'?t('目前工作內容','Nội dung đang làm'):source==='review'?t('送審固定快照','Bản chụp gửi duyệt cố định'):t('最後已儲存快照','Bản chụp đã lưu gần nhất');
   if(!group?.checked)return '<p data-authoring-issue-kind="missing" class="vd-unchecked">'+title+' · '+t('尚未檢查／無快照','Chưa kiểm tra / chưa có bản chụp')+'</p>';
   return '<details data-authoring-issue-kind="missing" data-vd-source="'+(source==='working'?'working':'snapshot')+'" data-issue-count="'+group.issues.length+'"><summary>'+title+' · '+group.issues.length+'</summary><p>'+t('內容待補不阻擋送審或核准；不代表所有檢查通過。','Các mục cần bổ sung không chặn gửi / duyệt; không có nghĩa mọi kiểm tra đã đạt.')+'</p><ul>'+group.issues.map(i=>{const index=issueRows.push({...i,source})-1,[code]=i.message.split(':'),workspace=flow()?.working.workspaces.find(w=>w.id===i.path?.[1]?.id),op=workspace?.stages[i.path[3]]?.find(o=>o.id===i.path[4]?.id),orphan=code==='PRODUCT_MISSING',locatable=source==='working'&&op&&!orphan&&permissions.edit&&!flow()?.pendingId;return '<li><div>'+escapeHtml(host.VersionDraftUI.issueMessage(i))+'<small>'+escapeHtml(i.path.map(p=>typeof p==='string'?p:p.id).join(' / '))+'</small><small>'+t('影響：此流程的內容尚不完整','Ảnh hưởng: nội dung quy trình chưa đầy đủ')+'</small></div>'+(locatable||orphan&&permissions.history?'<button type="button" class="button ghost" data-authoring-issue="'+index+'" data-issue-code="'+code+'">'+(orphan?t('尚無修正入口；查看封存','Chưa có lối sửa; xem lưu trữ'):t('前往修正目前內容','Sửa nội dung hiện tại'))+'</button>':'<small>'+t('唯讀快照／尚無修正入口；依上述對象查閱','Bản chụp chỉ đọc / chưa có lối sửa; tra cứu đối tượng ở trên')+'</small>')+'</li>';}).join('')+'</ul></details>';
  }).join('');
 }
 function updateLocalSaveState(){canvasEditEpoch++;const root=document.querySelector('#authoring-v3-panel');if(!enabled()||state.view!=='editor'||!root?.isConnected||!ownFlow()||host.ProcessSync?.requiresReload)return;host.VersionDraftUI.updateSaved(root,flow(),!!host.ProcessCanvasLocal?.dirty()||editorChanged());}
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
 function load(){if(submitStateUnconfirmed)return loading;if(!enabled()||!['editor','approval'].includes(state.view)||state.view==='approval'&&state.approvalTab!=='process'||!host.ProcessSync?.identity?.id)return loading;client();if(loading||busy||departureOperation||modalOpen()||(document.querySelector('.gesture-active')||host.ProcessEditorV2?.interacting?.())||localFailure||editorChanged())return loading;const view=state.view,category=state.category,line=state.editorLine,tab=state.approvalTab,contextEpoch=localContextEpoch,contextCurrent=()=>contextEpoch===localContextEpoch&&state.view===view&&state.category===category&&state.editorLine===line&&state.approvalTab===tab;const delivery=host.ProcessSync?.captureDelivery?.(),owns=()=>!delivery||host.ProcessSync.isCurrentDelivery(delivery);const pending=(async()=>{try{const previousWorkspace=JSON.stringify(state.editorByCategory[editorKey()]||{}),c=client(),owner=identityStamp(),f=ownFlow()?flow():null,result=await c.read(f?f.generation+':'+f.revision:'');if(c!==transport||actorId!==host.ProcessSync?.identity?.id||!sameStamp(owner,identityStamp())||!contextCurrent())return;if(result.permissions)permissions=result.permissions;
    if(modalOpen()||(document.querySelector('.gesture-active')||host.ProcessEditorV2?.interacting?.())||editorChanged())return;if(!result.unchanged)adopt(result);loadedStamp=owner;beginRecovery=null;
    if(!result.unchanged&&(state.view!=='editor'||previousWorkspace!==JSON.stringify(state.editorByCategory[editorKey()]||{}))&&['editor','approval'].includes(state.view)&&!modalOpen()&&!editorChanged()&&!(document.querySelector('.gesture-active')||host.ProcessEditorV2?.interacting?.())&&!document.activeElement?.matches('input,textarea,select')){
      // The matching readiness caller paints this adopted canvas once, after
      // its required read settles. Ordinary polls keep their own repaint.
      if(!(currentEditorReadiness(editorReadiness)&&editorReadiness.read===pending))refresh();
    }
    // Advisory checks and paginated archives must not delay the usable canvas.
    if(!result.unchanged||!inspectionReady())inspectLater();
   }catch(e){if(owns()&&contextCurrent())error(e);}finally{if(owns()&&contextCurrent())panel();}})().finally(()=>{if(loading===pending)loading=null;});loading=pending;return loading;}
 async function readyForEditor(){
  if(!enabled()||state.view!=='editor'||!host.ProcessSync?.identity?.id)return;
  if(currentEditorReadiness(editorReadiness))return editorReadiness.promise;
  const r={owner:identityStamp(),contextEpoch:localContextEpoch,category:state.category,line:state.editorLine,tab:state.approvalTab,read:null};editorReadiness=r;
  r.promise=Promise.resolve().then(async()=>{
   if(!currentEditorReadiness(r))throw Error('DEPENDENCY_CHANGED_RECONFIRM');
   if(!ownFlow()){const pending=load();r.read=pending;await pending;}
   if(!currentEditorReadiness(r))throw Error('DEPENDENCY_CHANGED_RECONFIRM');
   if(!flow()||!ownFlow())throw Error(loadError||'AUTHORING_LOAD_REQUIRED');
   if(r.read)editorAwaitingPaint=true;
   if(modalOpen()||editorChanged()||document.querySelector('.gesture-active')||host.ProcessEditorV2?.interacting?.()||document.activeElement?.matches('input,textarea,select')){
    // Keep this gate across retries: having adopted data does not mean its
    // final canvas paint succeeded before the user started interacting.
    if(editorAwaitingPaint)throw Error('DEPENDENCY_CHANGED_RECONFIRM');return;
   }
   refresh();
  }).finally(()=>{if(editorReadiness===r)editorReadiness=null;});
  return r.promise;
 }
 async function sync(extraGuards=[]){if(submitStateUnconfirmed)throw Error('SUBMIT_STATE_UNCONFIRMED');if(!enabled())return false;
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
  busy=true;try{const c=client(),result=await trackedCommand(c,flow().generation,'apply',changes);adopt(result.control?result:await c.read());localFailure=false;inspectLater();return true;}
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
  try{const ledger=operationLedger();if(ledger?.hasRevertRecovery?.())throw Error(ledger.inspect().reason||t('請先核對放棄操作的原收據；結果未確認前不可開始新的共用修改。','Hãy kiểm tra biên nhận bỏ thay đổi trước; không bắt đầu chỉnh sửa chung mới khi chưa xác nhận kết quả.'));const result=await c.begin();if(!current())return false;
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
 function historyClient(){const c=client();return {...c,command(generation,name,detail){if(submitStateUnconfirmed)return Promise.reject(Error('SUBMIT_STATE_UNCONFIRMED'));return trackedCommand(c,generation,name,detail);}};}
 function ownIntentPending(){return [savePreparation,submitPreparation,activeIntent].some(r=>r&&r.client===transport&&sameStamp(r.owner,identityStamp())&&!host.ProcessSync?.requiresReload&&r.contextEpoch===localContextEpoch);}
 let departureOperation=null;
 const currentDeparture=r=>departureOperation===r&&r.client===transport&&sameStamp(r.owner,identityStamp())&&!host.ProcessSync?.requiresReload&&r.contextEpoch===localContextEpoch&&state.view==='editor'&&state.category===r.category&&state.editorLine===r.line&&flow()?.generation===r.generation;
 async function action(name,detail={},departure=null){
  if(submitStateUnconfirmed){error(Error('SUBMIT_STATE_UNCONFIRMED'));return false;}
  if(['save','submit'].includes(name)&&ownIntentPending()){panel();return false;}
  if(name==='save'){
   const c=client();if(busy){if(c.hasUnknown())throw Error('PREVIOUS_OPERATION_UNKNOWN');throw Error('OPERATION_IN_PROGRESS');}const r={client:c,owner:identityStamp(),generation:flow()?.generation,contextEpoch:localContextEpoch},owns=()=>r.client===transport&&sameStamp(r.owner,identityStamp())&&!host.ProcessSync?.requiresReload&&r.contextEpoch===localContextEpoch;
   savePreparation=r;busy=true;panel();
   try{if(c.hasUnknown())throw Error('PREVIOUS_OPERATION_UNKNOWN');if(c.hasSyncFailures()||localFailure)throw Error('SYNC_FAILED_RETRY_REQUIRED');
    if(host.ProcessCanvasLocal?.dirty()){const canvas=await host.ProcessCanvasLocal.beforeSave();if(canvas===null)return false;detail={...detail,...canvas};}
    if(loading)await loading;if(!owns())return false;if(flow()?.generation!==r.generation)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
   }catch(e){if(owns())error(e);return false;}finally{if(savePreparation===r){savePreparation=null;if(owns()){busy=false;panel();}}}
  }else if(loading)await loading;
  if(busy)throw Error('OPERATION_IN_PROGRESS');
  busy=true;panel();let currentBegin=()=>true,intent=null;try{const c=client();if(['save','submit'].includes(name)){const owner=identityStamp(),view=state.view,category=state.category,line=state.editorLine,contextEpoch=localContextEpoch;intent={client:c,owner,contextEpoch,generation:flow()?.generation,scope:flow()?.scope,revision:flow()?.revision,caseIds:(flow()?.cases||[]).map(row=>row.id)};activeIntent=intent;currentBegin=()=>activeIntent===intent&&contextEpoch===localContextEpoch&&beginOwner(c,owner,view,category,line);}if(name==='begin'){const owner=identityStamp(),view=state.view,category=state.category,line=state.editorLine;currentBegin=()=>beginOwner(c,owner,view,category,line);}if(detail.canvasGeneration&&detail.canvasGeneration!==flow()?.generation)throw Error('CANVAS_GENERATION_CHANGED');delete detail.canvasGeneration;if(name==='begin'){if(!await beginDraft())return;}else{
    if(name==='save'){if(localFailure)throw Error('SYNC_FAILED_RETRY_REQUIRED');await c.flush();const preparedDeparture=departure&&currentDeparture(departure)&&host.ProcessEditorV2?.departure?.inspect?.().state==='clean'&&!editorChanged()&&!host.ProcessCanvasLocal?.dirty();if(departure&&!preparedDeparture)throw Error('DEPENDENCY_CHANGED_RECONFIRM');if(modalOpen()&&!preparedDeparture&&!confirm(t('只儲存已同步內容，不包含尚未套用表單。繼續？','Chỉ lưu nội dung đã đồng bộ, không gồm biểu mẫu chưa áp dụng. Tiếp tục?')))return;}
    let result;
    if(name==='save'){
     // retain(command) also exists during a normal pending POST. Mask only that
     // newly admitted Save's display, never an earlier unknown or failed input.
     const r=!c.hasUnknown()&&!c.hasSyncFailures()?{client:c,owner:identityStamp()}:null;if(r)pendingSave=r;
     try{result=await trackedCommand(c,flow().generation,name,detail);}finally{if(pendingSave===r)pendingSave=null;}
    }else if(name==='submit'){
     // Only this admitted Submit's awaited POST is processing, not an older unknown.
     const r=!c.hasUnknown()&&!c.hasSyncFailures()?{client:c,owner:identityStamp()}:null;if(r)pendingSubmit=r;
     try{result=await trackedCommand(c,flow().generation,name,detail);}finally{if(pendingSubmit===r)pendingSubmit=null;}
    }else result=await trackedCommand(c,flow().generation,name,detail);
    if(!currentBegin())return false;const fresh=name==='submit'||result.control?result:await c.read();if(!currentBegin())return false;
    if(name==='submit'){
     const ack=result.receipt,next=fresh.control?.workflow,review=next?.cases?.find(row=>row.id===ack?.caseId);
     if(intent.scope!=='process:platform'||next?.scope!==intent.scope||ack?.generation!==intent.generation||!ack?.caseId||ack.savedId!==detail.savedId||next?.generation!==ack.generation||!Number.isSafeInteger(next?.revision)||next.revision<ack.revision||next?.pendingId!==ack.caseId||next?.saved?.id!==detail.savedId||review?.status!=='pending'||review.savedId!==detail.savedId||!fresh.control.versions?.some(v=>v.id===ack.caseId&&v.status==='pending')){submitStateUnconfirmed={client:c,owner:identityStamp(),minimumRevision:intent.revision+1,caseIds:intent.caseIds,operationId:ack?.operationId,savedId:detail.savedId,generation:intent.generation,scope:intent.scope,caseId:ack?.caseId};if(await recoverSubmitState(true))return true;throw Object.assign(Error('SUBMIT_STATE_UNCONFIRMED'),{operationId:ack?.operationId,details:{issues:[{kind:'error',path:[],message:submitStateUnconfirmed?.readError||'SUBMIT_ACK_STATE_MISMATCH'}]}});}
    }
    adopt(fresh,!modalOpen());if(name==='save'&&departure)departure.savedResult={...fresh,receipt:result.receipt};
   }if(['begin','save','submit','approve','withdraw','return'].includes(name))inspectLater();else await inspect();if(currentBegin()&&!modalOpen())refresh();return currentBegin();
  }catch(e){if(currentBegin())error(e);}finally{const owns=currentBegin();if(activeIntent===intent)activeIntent=null;if(owns){busy=false;panel();}}}
 function departureStatus(){
  const result={state:'clean',reason:'',canSave:false,canDiscard:false};
  if(!enabled())return result;
  if(!ownFlow()||!flow()||host.ProcessSync?.requiresReload)return {...result,state:'unknown',reason:t('草稿尚未完成讀取或登入已變更；請先重新讀取，輸入仍保留。','Bản nháp chưa tải xong hoặc phiên đã đổi; hãy tải lại. Đầu vào được giữ.')};
  if(busy||ownIntentPending()||departureOperation?.phase==='writing')return {...result,state:'busy',reason:t('目前操作尚未完成，請稍候；完成後可繼續離頁。','Thao tác chưa hoàn tất; vui lòng chờ rồi tiếp tục rời trang.')};
  const c=transport,f=flow(),form=host.ProcessEditorV2?.departure?.inspect?.()||{state:modalOpen()?'unknown':'clean',canApply:false},canvas=host.ProcessCanvasLocal;
  if(submitStateUnconfirmed||c?.hasUnknown()||canvas?.pending?.())return {...result,state:'unknown',reason:t('先前寫入結果尚未確認；請先查原操作收據，不要重複保存或放棄。','Chưa xác nhận kết quả ghi trước đó; hãy kiểm tra biên nhận, không lưu hoặc bỏ lặp lại.')};
  if(localFailure||c?.hasSyncFailures())return {...result,state:'unknown',reason:t('尚有未完成的套用，輸入已保留；請先重試或在編輯視窗取消這次修改。','Còn thao tác áp dụng chưa xong; đầu vào được giữ. Hãy thử lại hoặc hủy thay đổi trong cửa sổ chỉnh sửa.')};
  if(form.state==='busy')return {...result,state:'busy',reason:form.reason};
  if(!['clean','dirty'].includes(form.state))return {...result,state:'unknown',reason:form.reason||t('目前編輯內容無法確認，請留在本頁重新核對。','Không xác nhận được nội dung chỉnh sửa; hãy ở lại kiểm tra.')};
  if(!ownedLedger)return {...result,state:'unknown',reason:t('安全離頁元件尚未載入，請留在本頁重新載入後再操作。','Thành phần rời trang an toàn chưa tải; hãy ở lại và tải lại trước khi tiếp tục.')};
  const proof=ownedLedger.inspect(),local=form.state==='dirty'||editorChanged()||!!canvas?.dirty();
  if(proof.state==='busy'||proof.state==='unknown'&&!proof.canSave)return {...result,state:proof.state,reason:proof.reason};
  if(f.pendingId)return local?{...result,state:'dirty',reason:t('送審內容已鎖定，本機仍有未套用修改；請先處理原編輯內容，或依原流程撤回。','Hồ sơ đã khóa để duyệt nhưng còn thay đổi cục bộ; hãy xử lý nội dung gốc hoặc rút theo quy trình.')} : result;
  // Merely viewing another person's synchronized working data is not proof
  // of this viewer's own unsaved command. Do not rewrite its saved badge.
  if(!local&&!proof.ownChanges&&permissions.edit!==true)return result;
  const canSave=proof.canSave&&permissions.save===true&&c?.permission?.('save')!==false&&!local;
  const canDiscard=(proof.state==='clean'||proof.canDiscard)&&(!proof.ownChanges||permissions.edit===true&&c?.permission?.('edit')!==false)&&(!proof.requiresDelete||permissions.delete===true);
  if(local||proof.state==='dirty'||proof.state==='unknown')return {...result,state:'dirty',reason:local?(proof.reason?proof.reason+' ':'')+t('尚有未套用或未同步內容；請先完成表單並手動同步畫布，再儲存離開。','Còn nội dung chưa áp dụng hoặc đồng bộ; hãy hoàn tất biểu mẫu và đồng bộ thủ công trước khi lưu để rời đi.'):proof.reason||'',canSave:!!canSave,canDiscard:!!canDiscard};
  return {...result,reason:proof.reason||''};
 }
 function departureCheck(r){if(!currentDeparture(r)||!ownFlow()||flow()?.pendingId||r.client.hasUnknown()||r.client.hasSyncFailures())throw Error('DEPENDENCY_CHANGED_RECONFIRM');}
 function startDeparture(kind){
  if(departureOperation)throw Error('OPERATION_IN_PROGRESS');
  const status=departureStatus();if(status.state!=='dirty'||!status[kind==='save'?'canSave':'canDiscard'])throw Error(status.reason||'DEPENDENCY_CHANGED_RECONFIRM');
  const editor=host.ProcessEditorV2?.departure,canvas=host.ProcessCanvasLocal;
  if(!editor||!canvas?.lockForDeparture||!canvas?.settleForDeparture||!canvas?.saveForDeparture||!canvas?.discardForDeparture)throw Error('AUTHORING_LOAD_REQUIRED');
  const r={kind,phase:'writing',client:transport,ledger:ownedLedger,owner:identityStamp(),contextEpoch:localContextEpoch,category:state.category,line:state.editorLine,generation:flow().generation,editor,canvas,formRelease:null,canvasLease:null,savedResult:null};departureOperation=r;
  let released=false;r.release=()=>{if(released)return;released=true;try{r.formRelease?.();}finally{try{r.canvasLease?.release();}finally{if(departureOperation===r)departureOperation=null;}}};
  try{r.formRelease=editor.freeze();r.canvasLease=canvas.lockForDeparture();departureCheck(r);return r;}catch(e){r.release();throw e;}
 }
 async function saveDeparture(){
  const r=startDeparture('save');try{
   await r.ledger.settle();await r.canvas.settleForDeparture(r.canvasLease);departureCheck(r);
   if(r.editor.inspect().state!=='clean'||r.canvas.dirty()||editorChanged())throw Error('CANVAS_UNSYNCHRONIZED');
   if(await action('save',{},r)!==true)throw Error(loadError||'SYNC_FAILED_RETRY_REQUIRED');departureCheck(r);
   const f=flow(),receipt=r.savedResult?.receipt;
   if(!receipt||receipt.generation!==r.generation||receipt.savedId!==f.saved?.id||!Number.isSafeInteger(receipt.revision)||receipt.revision!==f.revision||JSON.stringify(f.saved.content)!==JSON.stringify(f.working)||r.editor.inspect().state!=='clean'||r.canvas.dirty()||editorChanged())throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
   r.phase='held';const status=departureStatus();if(status.state!=='clean')throw Error(status.reason||'DEPENDENCY_CHANGED_RECONFIRM');panel();return {release:r.release};
  }catch(e){r.release();panel();throw e;}
 }
 async function discardDeparture(){
  const r=startDeparture('discard');try{
   await r.ledger.settle();await r.canvas.settleForDeparture(r.canvasLease);departureCheck(r);
   const result=await r.ledger.discard(r.client);departureCheck(r);
   if((result.permissions?result.permissions.view!==true:!result.receipt)||r.client.permission?.('view')===false||result.control?.workflow?.generation!==r.generation||result.control.workflow.pendingId)throw Error('DEPENDENCY_CHANGED_RECONFIRM');
   adopt(result);await r.canvas.discardForDeparture(flow(),r.canvasLease);departureCheck(r);r.editor.discardLocal();
   r.phase='held';const status=departureStatus();if(status.state!=='clean')throw Error(status.reason||'DEPENDENCY_CHANGED_RECONFIRM');if(status.reason)toast(status.reason);refresh();panel();return {release:r.release};
  }catch(e){r.release();panel();throw e;}
 }
 const departure={inspect:departureStatus,save:saveDeparture,discard:discardDeparture,ownsDialog:node=>host.ProcessEditorV2?.departure?.ownsDialog?.(node)===true,closeClean(){const status=departureStatus();if(status.state!=='clean')throw Error(status.reason||'DEPENDENCY_CHANGED_RECONFIRM');host.ProcessEditorV2?.departure?.closeClean?.();}};
 async function recoverDiscardResult(){
  if(busy||departureOperation)throw Error('OPERATION_IN_PROGRESS');
  const ledger=ownedLedger,c=client(),owner=identityStamp(),contextEpoch=localContextEpoch;
  if(!ledger?.hasRevertRecovery?.())throw Error('DEPENDENCY_CHANGED_RECONFIRM');
  busy=true;panel();try{const result=await ledger.recoverDiscard(c);if(c!==transport||ledger!==ownedLedger||contextEpoch!==localContextEpoch||!sameStamp(owner,identityStamp())||host.ProcessSync?.requiresReload)throw Error('DEPENDENCY_CHANGED_RECONFIRM');adopt(result,!modalOpen()&&!editorChanged());if(result.ownedRevertNeedsReview)toast(result.ownedRevertReviewReason||t('原放棄操作收據已確認，但重新載入後缺少完整內容對照；未重送原操作，請核對目前內容後儲存，或留在本頁處理。','Đã xác nhận biên nhận bỏ thay đổi nhưng sau khi tải lại không còn đủ nội dung để đối chiếu. Không gửi lại thao tác; hãy kiểm tra nội dung hiện tại rồi lưu, hoặc ở lại xử lý.'));}
  finally{busy=false;panel();}
 }
 // A valid receipt shape with an unusable Submit projection is not success.
 // Only an explicit, current-owner full read can release this app-level barrier.
 async function recoverSubmitState(duringAction=false){
  const r=submitStateUnconfirmed;if(!r||busy&&!duringAction)return false;const view=state.view,category=state.category,line=state.editorLine,contextEpoch=localContextEpoch;
  const current=()=>contextEpoch===localContextEpoch&&submitStateUnconfirmed===r&&r.client===transport&&sameStamp(r.owner,identityStamp())&&!host.ProcessSync?.requiresReload&&state.view===view&&state.category===category&&state.editorLine===line;
  if(!current())return false;busy=true;panel();
  try{const result=await r.client.read();if(!current())return false;const next=result.control?.workflow,versions=result.control?.versions,pending=next?.cases?.find(row=>row.id===next.pendingId);
   if(result.unchanged||result.permissions?.view!==true||['edit','save','submit'].some(key=>typeof result.permissions[key]!=='boolean')||!next||typeof next.generation!=='string'||!next.generation||!Number.isSafeInteger(next.revision)||next.revision<r.minimumRevision||next.scope!==r.scope||r.scope!=='process:platform'||!next.working||!Array.isArray(next.working.workspaces)||!Array.isArray(next.cases)||!Array.isArray(versions)||!versions.length||versions.some(v=>typeof v.id!=='string'||!['draft','pending','approved','superseded','returned','withdrawn'].includes(v.status))||!(next.pendingId===null||typeof next.pendingId==='string'&&next.pendingId))throw Error('SUBMIT_STATE_READ_INCOMPLETE');
   const linked=next.cases.find(row=>!r.caseIds.includes(row.id)&&row.savedId===r.savedId&&row.actor?.id===r.owner.id&&['pending','approved','returned','withdrawn'].includes(row.status));
   if(!linked||linked.status==='pending'&&(next.pendingId!==linked.id||next.generation!==r.generation)||linked.status!=='pending'&&(!linked.result?.actor?.id||!linked.result.at)||next.pendingId&&(pending?.status!=='pending'||typeof pending.savedId!=='string'||pending.savedId!==next.saved?.id||!versions.some(v=>v.id===next.pendingId&&v.status==='pending'))||next.cases.some(row=>row.status==='pending'&&row.id!==next.pendingId)||versions.some(v=>v.status==='pending'&&v.id!==next.pendingId)||(next.active?.id||null)!==(result.control.activeVersionId||null)||next.active?.id&&!versions.some(v=>v.id===next.active.id&&v.status==='approved'))throw Error('SUBMIT_STATE_READ_INCOMPLETE');
   // A current-state read is not a receipt lookup. Never move unsent input or a
   // dirty canvas journal onto a different generation while reconciling it.
   if(modalOpen()||editorChanged()||host.ProcessCanvasLocal?.dirty())throw Error('CANVAS_UNSYNCHRONIZED');
   submitStateUnconfirmed=null;adopt(result,!modalOpen());loadedStamp=r.owner;inspectLater();return true;
  }catch(e){if(current()){r.readError=e.message;error(e);}return false;}finally{if(!duringAction&&contextEpoch===localContextEpoch&&r.client===transport&&sameStamp(r.owner,identityStamp())&&!host.ProcessSync?.requiresReload){busy=false;panel();}}
 }
 // The reason dialog is immediate. It does not authorize a write: current owned
 // saved scope and fresh inspection are checked again only after confirmation.
 async function submitSaved(){
  if(ownIntentPending()){panel();return false;}if(submitStateUnconfirmed)throw Error('SUBMIT_STATE_UNCONFIRMED');const c=client();if(c.hasUnknown())throw Error('PREVIOUS_OPERATION_UNKNOWN');if(c.hasSyncFailures()||localFailure)throw Error('SYNC_FAILED_RETRY_REQUIRED');if(busy)throw Error('OPERATION_IN_PROGRESS');
  const f=flow();if(!ownFlow()||host.ProcessSync?.requiresReload||!f?.saved||f.pendingId||permissions.submit!==true||permissions.view!==true||!savedInspectionReady())throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
  const r={client:c,owner:identityStamp(),contextEpoch:localContextEpoch,flow:f,generation:f.generation,revision:f.revision,savedId:f.saved.id,view:state.view,category:state.category,line:state.editorLine,workspace:ensureCategoryEditor(),editor:JSON.stringify(ensureCategoryEditor()),canvasEpoch:canvasEditEpoch};
  const owns=()=>r.contextEpoch===localContextEpoch&&r.client===transport&&actorId===r.owner.id&&sameStamp(r.owner,identityStamp())&&!host.ProcessSync?.requiresReload;
  const current=()=>owns()&&state.view===r.view&&state.category===r.category&&state.editorLine===r.line&&flow()===r.flow&&flow()?.generation===r.generation&&flow()?.revision===r.revision&&flow()?.saved?.id===r.savedId&&!flow()?.pendingId&&permissions.submit===true&&permissions.view===true&&c.permission('submit')!==false&&c.permission('view')!==false&&ensureCategoryEditor()===r.workspace&&JSON.stringify(ensureCategoryEditor())===r.editor&&canvasEditEpoch===r.canvasEpoch;
  const check=()=>{if(c.hasUnknown())throw Error('PREVIOUS_OPERATION_UNKNOWN');if(c.hasSyncFailures()||localFailure)throw Error('SYNC_FAILED_RETRY_REQUIRED');if(!current())throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');};
  const missingCount=inspection.saved.issues.length;submitPreparation=r;busy=true;panel();
  try{
   const reason=await host.VersionDraftUI.confirmSubmit(host.VersionDraftUI.reasonFor(control.versions.find(v=>v.status==='draft'),f),t('整個製程平台','Toàn bộ nền tảng quy trình'),{missingCount});if(!reason)return;
   check();if(loading)await loading;check();await inspect();check();if(!savedInspectionReady())throw Error('CONTENT_ISSUES_SNAPSHOT_MISMATCH');
   // No await between releasing this preparation and the existing guarded action.
   submitPreparation=null;busy=false;await action('submit',{savedId:r.savedId,reason});
  }catch(e){if(owns())error(e);}finally{if(submitPreparation===r){submitPreparation=null;if(owns()){busy=false;panel();}}}
 }
 async function reviewDecision(name,caseId){
  const pending=flow()?.cases.find(c=>c.id===caseId&&c.id===flow()?.pendingId&&c.status==='pending');
  if(!pending||!['approve','return'].includes(name)||!permissions[name])throw Error('CASE_NOT_PENDING');
  const answer=await host.VersionDraftUI.confirmReview({action:name==='return'?'reject':name,scope:t('製程送審','Duyệt quy trình'),selfReview:pending.actor.id===actorId});if(!answer)return false;
  const detail={caseId,...answer};if(name==='approve'){await inspect();const issues=inspection?.review?.issues||[];if(issues.length){if(!confirm(t('仍有 '+issues.length+' 項待補，確認帶待補核准？','Còn '+issues.length+' mục cần bổ sung. Xác nhận duyệt?')))return false;detail.acknowledgedContentIssues=issues;}}
  const owner=actorId;await action(name,detail);if(owner!==host.ProcessSync?.identity?.id)throw Error('LOGIN_REQUIRED');
  if(flow()?.pendingId===caseId)throw Error(loadError||'REVIEW_NOT_COMPLETED');return true;
 }
 async function reloadReview(){
  const c=client(),owner=identityStamp(),contextEpoch=localContextEpoch,view=state.view,category=state.category,line=state.editorLine,tab=state.approvalTab,read=load();if(!read)return;await read;
  if(contextEpoch!==localContextEpoch||!beginOwner(c,owner,view,category,line)||state.approvalTab!==tab||view!=='approval'||tab!=='process'||loadError||!ownFlow())return;
  // Explicit owned Reload may retry a failed advisory; polling still cannot.
  inspectLater(true);panel();
 }
 function reviewPanel(){
  const parent=document.querySelector('#approval-panel-process')||document.querySelector('.approval-page');if(!parent)return;
  let target=parent.querySelector('#authoring-v3-review');if(!target){target=document.createElement('section');target.id='authoring-v3-review';target.className='review-case-card';target.dataset.i18nSkip='true';parent.replaceChildren(target);}
  const f=flow(),pending=f?.cases.find(c=>c.id===f.pendingId),effective=control?.versions.find(v=>v.id===control.activeVersionId);
  const markup=`<h2>${t('製程送審案件','Hồ sơ duyệt quy trình')}</h2><p>${t('目前正式版本','Phiên bản có hiệu lực')} · ${effective?'V'+effective.number:'—'}</p><p role="status">${escapeHtml(loadError ? displayDraftError(loadError) : (!f?t('正在讀取案件…','Đang tải hồ sơ…'):pending?t('待審','Chờ duyệt')+' · '+(pending.actor?.name||''):t('目前沒有待審案件','Không có hồ sơ chờ duyệt')))}</p><p role="status" data-authoring-review-inspection hidden></p>${pending?'<p>'+escapeHtml(pending.reason||'')+'</p>':''}<div class="toolbar">${pending?`<button class="button ghost" data-process-review="view">${t('查看／審核','Xem / duyệt')}</button>${permissions.withdraw?`<button class="button ghost" data-process-review="withdraw">${t('撤回送審','Rút hồ sơ')}</button>`:''}`:''}${permissions.history?`<button class="button ghost" data-process-review="history">${t('歷史案件','Lịch sử hồ sơ')}</button>`:''}<button class="button ghost" data-process-review="reload">${t('重新整理','Tải lại')}</button></div>`;
  if(target.__markup!==markup){const restore=host.VersionDraftUI.preserveView(parent);target.innerHTML=markup;target.__markup=markup;restore();}
  const advisory=target.querySelector('[data-authoring-review-inspection]'),advisoryStatus=inspectionStatus();if(advisory){advisory.textContent=advisoryStatus;advisory.hidden=!advisoryStatus;}
  for(const button of target.querySelectorAll('[data-process-review]')){button.disabled=busy;button.onclick=async()=>{const name=button.dataset.processReview;button.disabled=true;try{
   if(name==='reload'){await reloadReview();return;}
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
   if(name==='history'){await host.openSharedDraftHistory({client:historyClient(),editable:()=>false,onApplied:async()=>{}});return;}
   const answer=await host.VersionDraftUI.confirmReview({action:name==='return'?'reject':name,scope:t('製程送審','Duyệt quy trình'),selfReview:name!=='withdraw'&&pending.actor.id===actorId});if(!answer)return;
   const detail={caseId:pending.id,...answer};if(name==='approve'){await inspect();const issues=inspection?.review?.issues||[];if(issues.length){if(!confirm(t('仍有 '+issues.length+' 項待補，確認帶待補核准？','Còn '+issues.length+' mục cần bổ sung. Xác nhận duyệt?')))return;detail.acknowledgedContentIssues=issues;}}
   await action(name,detail);
  }catch(e){error(e);}finally{button.disabled=false;}};}
 }
 function panel(){if(typeof host.CustomEvent==='function')host.dispatchEvent?.(new host.CustomEvent('process-departure-state-changed'));if(!enabled()||!['editor','approval'].includes(state.view))return;if(state.view==='approval'){const badge=document.querySelector('[data-review-tab="process"] .approval-tab-count');if(badge)badge.textContent=host.ProcessAuthoringV3?.pendingCount()??'—';if(state.approvalTab==='process'){reviewPanel();if(!flow()&&!loading&&!loadError)queueMicrotask(()=>void load());}return;}
  let target=document.querySelector('#authoring-v3-panel');if(!target){target=document.createElement('section');target.id='authoring-v3-panel';target.className='editor-version-panel';target.dataset.i18nSkip='true';const anchor=state.view==='editor'?document.querySelector('.editor-toolbar'):(document.querySelector('#approval-panel-process')||document.querySelector('.approval-page'));if(!anchor)return;if(state.view==='approval')anchor.replaceChildren(target);else anchor.after(target);}
  const f=flow(),pending=f?.pendingId,open=control?.versions.some(v=>v.status==='draft'),locked=!!submitStateUnconfirmed||!f||!permissions.edit||!!pending||!open,revertRecoveryPending=operationLedger()?.hasRevertRecovery?.()===true;
  const effective=control?.versions.find(v=>v.id===control.activeVersionId),metadata=`<p>${t('目前正式版本','Phiên bản có hiệu lực')}: ${escapeHtml(effective?'V'+effective.number:'—')} · ${t('目前查看','Đang xem')}: ${pending?t('送審固定內容','Nội dung gửi duyệt cố định'):locked?t('唯讀','Chỉ đọc'):t('共用工作內容','Nội dung làm việc chung')}</p>${f?.saved?`<p>${t('最後成功儲存','Lần lưu thành công cuối')}: ${escapeHtml(f.saved.actor.name)} · ${escapeHtml(f.saved.at)} · ${t('修訂','Sửa đổi')} ${f.saved.revision}<br>${savedEquivalent&&!editorChanged()&&!host.ProcessCanvasLocal?.dirty()?t('已儲存；無後續同步修改','Đã lưu; không có thay đổi đồng bộ sau đó'):t('已同步；有尚未手動儲存內容','Đã đồng bộ; có nội dung chưa lưu thủ công')}</p>`:''}`;
const markup=`<div><h3>${t('整個製程平台 · 共用草稿','Toàn bộ nền tảng quy trình · Bản nháp chung')}</h3><p>${pending?t('待審鎖定','Đang chờ duyệt · đã khóa'):f?.saved?t('已儲存版本與未儲存工作分開','Bản đã lưu và thay đổi chưa lưu được tách riêng'):t('尚未建立 V3 儲存快照；舊已儲存版本仍保留於封存，目前工作內容可能含未儲存修改','Chưa tạo bản lưu V3; các bản đã lưu trước đây vẫn còn trong kho cũ. Nội dung đang làm có thể gồm thay đổi chưa lưu')}</p><p role="status">${escapeHtml(loadError ? displayDraftError(loadError) : t('已同步','Đã đồng bộ'))}</p>${errorMarkup()}${issueMarkup()}</div><div class="toolbar">${!f||!open&&!pending?`<button class="button" data-av3="begin" ${revertRecoveryPending?'disabled':''}>${t('開始共用修改','Bắt đầu sửa chung')}</button>`:''}<button class="button" data-av3="save" ${locked?'disabled':''}>${t('儲存共用草稿','Lưu bản nháp chung')}</button><button class="button signal" data-av3="submit" ${locked||!f?.saved||!permissions.submit||!savedInspectionReady()?'disabled':''}>${t('送出已儲存版本','Gửi bản đã lưu')}</button>${pending&&permissions.withdraw?`<button class="button" data-av3="withdraw">${t('撤回','Rút hồ sơ')}</button>`:''}${permissions.history?`<button class="button" data-av3="legacy">${t('查看舊已儲存版本／封存','Xem bản đã lưu / kho phiên bản cũ')}</button><button class="button" data-av3="history">${t('歷史與還原','Lịch sử / khôi phục')}</button>`:''}${submitStateUnconfirmed?`<button class="button ghost" data-av3="confirm-submit-state">${t('重新讀取送審狀態（唯讀）','Đọc lại trạng thái gửi duyệt (chỉ đọc)')}</button>`:''}<button class="button ghost" data-av3="retry">${recoveryKind()}</button></div>`;
  const completeMarkup='<section class="av3-header">'+markup.replace('</h3>','</h3>'+metadata).replace('role="status"','id="authoring-live-status" role="status"')+'</section>';
  if(target.__authoringMarkup!==completeMarkup){target.innerHTML=completeMarkup;target.__authoringMarkup=completeMarkup;for(const b of target.querySelectorAll('[data-av3]'))b.__authoringDisabled=b.disabled;}
  target.querySelector('[role="status"]').textContent=loadError ? displayDraftError(loadError) : '';
  for(const button of target.querySelectorAll('[data-authoring-issue]')){button.disabled=busy;button.onclick=()=>locateIssue(Number(button.dataset.authoringIssue));}
  for(const b of target.querySelectorAll('[data-av3]')){b.disabled=busy||b.__authoringDisabled;b.onclick=async()=>{const name=b.dataset.av3;try{
    if(name==='confirm-submit-state')return await recoverSubmitState();
    if(name==='history'||name==='legacy')return await host.openSharedDraftHistory({client:historyClient(),legacyFirst:name==='legacy',editable:()=>!submitStateUnconfirmed&&!locked&&permissions.history,onApplied:async()=>{await load();refresh();}});
    if(name==='retry'){if(ownedLedger?.hasRevertRecovery?.()){await recoverDiscardResult();return;}if(client().hasUnknown()){try{await trackedRecovery(client(),'resolveUnknown');}catch(e){if(e.status!==404)throw e;if(!confirm(t('以同一操作編號重試？','Thử lại với cùng mã thao tác?')))return;await trackedRecovery(client(),'retryUnknown');}localFailure=client().hasSyncFailures();loadError=localFailure?'SYNC_FAILED_RETRY_REQUIRED':'';await load();panel();}else if(localFailure)await sync();else if(beginRecovery)await retryBeginAuthority();else if(inspectionFailed()){inspectLater(true);panel();}else await load();return;}
    const detail={};
    if(name==='submit')return await submitSaved();
    if(['withdraw','approve','return'].includes(name)){detail.caseId=pending;const own=f.cases.find(c=>c.id===pending)?.actor.id===actorId;const answer=await host.VersionDraftUI.confirmReview({action:name==='return'?'reject':name,scope:t('整個製程平台','Toàn bộ nền tảng quy trình')+' · '+pending,selfReview:name!=='withdraw'&&own});if(!answer)return;Object.assign(detail,answer);}
    if(name==='approve'){await inspect();const issues=inspection?.review?.issues||[];if(issues.length){if(!confirm(t('仍有 '+issues.length+' 項待補。確認帶待補核准？此確認會留下紀錄，不表示所有檢查通過。','Còn '+issues.length+' mục cần bổ sung. Xác nhận duyệt kèm các mục này? Việc xác nhận được ghi lại; không có nghĩa mọi kiểm tra đã đạt.')))return;detail.acknowledgedContentIssues=issues;}}
    await action(name,detail);
   }catch(e){error(e);}};}
  // Markup helpers may reset an obsolete owner; cache only after that boundary.
  // The following mount/updateSaved calls only paint this synchronous render.
  const localUnsaved=!!host.ProcessCanvasLocal?.dirty()||editorChanged();
  if(target.querySelector('.av3-header')){
   const selected=control?.versions.find(v=>['draft','pending'].includes(v.status))||effective;
   const select=document.createElement('select');select.id='authoring-version-choice';select.innerHTML=`<optgroup label="${host.VersionDraftUI.t('menu')}">${(control?.versions||[]).map(v=>`<option value="${escapeHtml(v.id)}" ${v.id===selected?.id?'selected':''}>V${v.number}</option>`).join('')}</optgroup><optgroup label="${t('舊已儲存版本／封存','Bản đã lưu / kho phiên bản cũ')}">${(archiveVersions||[]).map(v=>`<option value="legacy:${escapeHtml(v.id)}">${escapeHtml(v.category)} / ${escapeHtml(v.line)} · V${v.number}</option>`).join('')}<option value="legacy">${t('查看封存清單','Xem danh sách lưu trữ')}</option></optgroup>`;
   select.onchange=async()=>{const value=select.value,legacy=value.startsWith('legacy'),version=control.versions.find(v=>v.id===value);if(value===selected?.id)return;select.value=selected?.id||'';try{await host.openSharedDraftHistory({client:historyClient(),legacyFirst:legacy,legacyVersionId:value.startsWith('legacy:')?value.slice(7):null,caseId:!legacy&&f.cases.some(c=>c.id===value)?value:null,versionPreview:!legacy?version:null,editable:()=>false,onApplied:async()=>{}});}catch(e){error(e);}};
   target.querySelector('.av3-header').prepend(select);
   const retry=target.querySelector('[data-av3="retry"]');if(retry){const label=recoveryKind();retry.textContent=label;retry.hidden=!label;}
   const legacy=target.querySelector('[data-av3="legacy"]');if(legacy)legacy.remove();
   host.VersionDraftUI.mount(target,{header:'.av3-header',historyClient,module:t('製程編輯台','Trình chỉnh sửa quy trình'),scope:t('整個製程平台','Toàn bộ nền tảng quy trình'),version:selected,versions:control?.versions,active:effective,flow:f,busy,localUnsaved:localUnsaved,failed:!!loadError||localFailure||client().hasUnknown()&&!admittedCommandPending(),actions:{begin:'[data-av3="begin"]',save:'[data-av3="save"]',submit:'[data-av3="submit"]',withdraw:'[data-av3="withdraw"]'},review:()=>{if(host.ProcessDeliveryNavigation?.approval){void host.ProcessDeliveryNavigation.approval('process');return;}state.approvalTab='process';navigate('approval');const url=new URL(location.href);url.searchParams.set('view','approval');url.searchParams.set('approvalTab','process');url.searchParams.delete('dataTab');history.replaceState(history.state,'',url);void load();},errors:'[data-authoring-issue-kind="error"]',missing:'[data-authoring-issue-kind="missing"]',history:['[data-av3="history"]'],status:['#authoring-live-status']});
   if(retry&&!retry.hidden)target.querySelector('.vd-errors').append(retry);const stateRead=target.querySelector('[data-av3="confirm-submit-state"]');if(stateRead)target.querySelector('.vd-errors').append(stateRead);
  }
  // mount moves/clears the status node; paint truthful advisory state afterwards.
  target.querySelector('[role="status"]').textContent=loadError?displayDraftError(loadError):inspectionStatus();
  host.VersionDraftUI.updateSaved(target,f,localUnsaved);
  host.VersionDraftUI.updateSync(target,busy,!!loadError||localFailure||client().hasUnknown()&&!admittedCommandPending());
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
 host.ProcessAuthoringV3={get ownedLedger(){return operationLedger();},navigation:{departure,requiresSave:()=>state.view==='editor'&&ownFlow()&&(editorChanged()||host.ProcessCanvasLocal?.dirty()||window.sharedDraftNeedsSave?.(flow())),canSaveForDeparture:()=>!busy&&!localFailure&&!editorChanged()&&!host.ProcessCanvasLocal?.dirty()&&!modalOpen()&&!host.ProcessEditorV2?.interacting?.(),saveForDeparture:()=>!editorChanged()&&!host.ProcessCanvasLocal?.dirty()?action('save'):false,canLeave:()=>!busy&&!localFailure&&!editorChanged()&&!modalOpen()&&!host.ProcessCanvasLocal?.dirty()&&!host.ProcessEditorV2?.interacting?.(),error:()=>loadError?Error(loadError):null,reset(){localContextEpoch++;editorReadiness=null;editorAwaitingPaint=false;activeIntent=null;beginRecovery=null;clearTimeout(inspectionTimer);inspection=null;inspectionOwner=null;inspectionRun=null;pendingSave=null;pendingSubmit=null;issueRows=[];archiveVersions=null;control=null;localBase=null;permissions={};loadedStamp=null;loadError='';loadIssues=[];validationSavedId=null;loading=null;host.ProcessCanvasLocal?.resetClean?.();}},enabled,updateLocalSaveState,pendingCount:()=>ownFlow()&&flow()&&permissions.view===true?(flow().pendingId?1:0):null,load,readyForEditor,sync,flow,acceptCanvas(result){adopt(result,!modalOpen());panel();},canEditCanvas:()=>!submitStateUnconfirmed&&actorId===host.ProcessSync?.identity?.id&&!!permissions.edit&&!flow()?.pendingId&&control?.versions.some(v=>v.status==='draft'),save:()=>action('save'),canMutate:()=>!submitStateUnconfirmed&&!busy&&!!permissions.edit&&!flow()?.pendingId&&control?.versions.some(v=>v.status==='draft'),cancelUnapplied(){if(!localFailure||editorChanged()||busy)return;if(client().discardRejected(rejectedPaths)){localFailure=false;rejectedPaths=[];loadError='';loadIssues=[];panel();}},workspace:(category,line)=>flow()?.working.workspaces.find(w=>w.category===category&&w.line===line),
  approved(category,line){const raw=control||JSON.parse(localStorage.getItem('processAuthoringControl')||'null'),active=raw?.versions.find(v=>v.id===raw.activeVersionId),w=active?.snapshot.workspaces.find(w=>w.category===category&&w.line===line);return w?{...w,id:active.id,number:active.number,status:'approved',contentIssues:active.contentIssues}:null;}};
 setInterval(()=>{if(document.visibilityState!=='hidden'&&enabled()&&host.ProcessSync?.identity?.id&&client().canPoll('state')&&['editor','approval'].includes(state.view)&&!document.activeElement?.matches('input,textarea,select'))void load();},4000);
 if(enabled())void load();
})(window);

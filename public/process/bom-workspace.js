/* BOM uses the existing shared-draft transport and version bar; edits remain local until Save. */
(() => {
 'use strict';
 const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
 const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const copy=v=>JSON.parse(JSON.stringify(v));
 const ui={query:'',code:'',tab:'forest',position:'',zoom:1,left:0,top:0,compareOpen:true};
 let D,client,actor='',control,editor={},pending=[],batch=null,edit=null,error='',busy=false,loading=false,saveCommand=null; const prepared=new WeakMap();let runSequence=0;let readEpoch=0,lastErrorCode='';
 let reviewState=null,reviewRevision=null,reviewEpoch=0,fullRevision=0,reviewLoading=null,reviewRenderOwner=null;
 let initialReady=Promise.resolve(),saveFlight=null,departureRetained=false,localBase=null,localBaseVersion=null;
 const flow=()=>control?.workflow,active=()=>control?.versions.find(v=>v.id===control.activeVersionId),version=()=>control?.versions.find(v=>['draft','pending','pending-test'].includes(v.status))||active();
 // The shared selector owns evidence/read sequencing. This adapter owns only
 // the BOM display; version()/flow()/editor remain the original write basis.
 let displayed={kind:'current'},draftDisplayUI=null;
 const selectedHistory=()=>window.VersionDraftUI?.historyVersion?.(client)||null;
 function displayState(){
  const selected=selectedHistory();
  if(displayed.kind==='approved'&&(!displayed.current()||selected?.id!==displayed.id)){
   displayed={kind:'blocked',id:displayed.id,error:'BOM_APPROVED_VIEW_SUPERSEDED'};cachedIndex=null;
  }
  if(displayed.kind==='current'&&selected)return {kind:'blocked',id:selected.id,error:'BOM_APPROVED_VIEW_NOT_RENDERED'};
  return displayed;
 }
 const historicalDisplay=()=>!!selectedHistory()||displayState().kind!=='current';
 function assertCurrentDisplay(){if(historicalDisplay())throw Error('BOM_READONLY_VERSION');}
 const visibleBom=()=>{const view=displayState();return view.kind==='current'?editor:view.kind==='approved'?view.snapshot.bom:{};};
 const visibleReferences=()=>{const view=displayState();return view.kind==='current'?flow()?.working.referenceIssues||[]:view.kind==='approved'?view.snapshot.referenceIssues:[];};
 function bomViewState(){const view=displayState();return {kind:view.kind,id:view.kind==='current'?version()?.id||null:view.id||null,version:view.version?copy(view.version):null,error:view.error||null};}
 function resetApprovedDisplay(){window.VersionDraftUI?.clearHistory?.(client);displayed={kind:'current'};draftDisplayUI=null;cachedIndex=null;}
 function historyAdmission(){return transportOwner?.()===true&&!ownerQuarantined&&!busy&&!saveFlight&&permission('view')&&permission('history');}
 function captureHistoryGuard(idle=true){const owned=workspaceOwner();return()=>owned()&&(idle?historyAdmission():transportOwner?.()===true&&!ownerQuarantined&&permission('view')&&permission('history'));}
 function renderHistory(value,_currentId){
  if(!value){
   if(!transportOwner?.()||!permission('view')||busy||saveFlight)throw Error('BOM_APPROVED_VIEW_SUPERSEDED');
   if(selectedHistory())throw Error('BOM_APPROVED_SELECTION_NOT_CLEARED');
   if(displayed.kind==='current')return bomViewState();
   displayed={kind:'current'};if(draftDisplayUI)Object.assign(ui,draftDisplayUI);draftDisplayUI=null;cachedIndex=null;paint(false);return bomViewState();
  }
  const selected=selectedHistory();
  if(!selected||selected.id!==value.id||JSON.stringify(selected.snapshot)!==JSON.stringify(value.snapshot))throw Error('BOM_APPROVED_SELECTION_REQUIRED');
  if(typeof value.id!=='string'||!value.id||!Number.isSafeInteger(value.number)||value.number<1||!value.snapshot||!Array.isArray(value.snapshot.referenceIssues))throw Error('BOM_APPROVED_SNAPSHOT_INVALID');
  const snapshot=copy(value.snapshot);D.validate(snapshot.bom);
  const key=JSON.stringify([value.id,value.number,snapshot]);
  if(displayed.kind==='approved'&&displayed.key===key&&displayed.current())return bomViewState();
  if(!historyAdmission())throw Error('BOM_APPROVED_VIEW_SUPERSEDED');
  if(displayed.kind==='current'){remember();draftDisplayUI=copy(ui);}
  const {snapshot:_snapshot,...metadata}=value;
  displayed={kind:'approved',id:value.id,version:copy(metadata),snapshot,key,current:captureHistoryGuard(false)};cachedIndex=null;paint();return bomViewState();
 }
 function invalidateApprovedDisplay(){if(displayed.kind==='approved'&&!displayed.current()){displayed={kind:'blocked',id:displayed.id,error:'BOM_APPROVED_VIEW_SUPERSEDED'};cachedIndex=null;paint();}}
 const editable=()=>!historicalDisplay()&&!ownerQuarantined&&transportOwner?.()===true&&client?.permission('edit')===true&&version()?.status==='draft'&&!!flow()&&!flow().pendingId;
 const btn=(id,label,disabled=false)=>`<button type="button" class="button ghost" data-bw="${id}" ${disabled?'disabled':''}>${h(label)}</button>`;
 const referenceStatus=value=>({
  'missing-root':t('缺少主件來源','Thiếu SKU gốc'),
  'missing-occurrence':t('使用位置不存在','Không còn vị trí sử dụng'),
  'legacy-unmapped':t('舊引用尚未對應','Liên kết cũ chưa khớp'),
  ambiguous:t('引用位置不明確','Vị trí liên kết chưa rõ')
 }[value]||t('引用待確認','Cần xác nhận liên kết'));
 const errorText=e=>{const code=String(e?.message||e||'');const known={COMMAND_TOO_LARGE:['儲存請求過大，伺服器未接受；輸入仍保留。請先匯出備份，勿重新整理。','Yêu cầu lưu quá lớn, máy chủ chưa nhận. Nội dung vẫn được giữ; hãy xuất bản sao, không tải lại.'],DEPENDENCY_CHANGED_RECONFIRM:['此欄位已由他人修改；你的輸入已保留，請比對最新內容後再修改。','Trường này đã được người khác sửa. Nội dung bạn nhập được giữ lại; hãy đối chiếu bản mới trước khi sửa.'],BOM_FILE_TOO_LARGE:['檔案超過 25 MB，請縮小後重試。','Tệp vượt quá 25 MB. Hãy giảm dung lượng rồi thử lại.'],FORBIDDEN:['目前帳號沒有此操作權限。','Tài khoản không có quyền thực hiện.'],PENDING_LOCKED:['案件待審中，暫時無法修改。','Hồ sơ đang chờ duyệt, chưa thể sửa.'],BOM_IMPORT_STRUCTURE_RECONFIRM:['Digiwin 結構比對基準已變；來源選擇與輸入仍保留。請重新核對匯入，不能自動改寫結構決策。','Cơ sở so sánh cấu trúc Digiwin đã đổi; giữ lựa chọn nguồn và đầu vào. Hãy đối chiếu lại bản nhập, không tự đổi quyết định cấu trúc.']};return known[code]?t(...known[code]):/^[A-Z][A-Z0-9_: -]+$/.test(code)?t('操作未完成，輸入仍保留；請先查詢結果。','Thao tác chưa hoàn tất. Nội dung vẫn được giữ; hãy kiểm tra kết quả trước.')+' ('+code+')':code;};
 const pathText=r=>[r.rootCode,...r.path.map(p=>`${p.itemCode} (${p.ordinal})`)].join(' → ');
 const permission=k=>client?.permission(k)===true;
 const labels=()=>[t('主件編碼','Mã NVL chính'),t('原始層級','Cấp'),t('項次','Số thứ tự'),t('零件編碼','Mã NVL'),t('品名','Tên VP'),t('規格','Quy cách'),t('單位','ĐV'),t('組成用量','Lượng dùng tổ hợp'),t('分母','Mẫu số'),t('損耗率 %','Tỷ lệ khấu hao %')];
 // Unsent edits/import comparisons live in page RAM only. Shared helper storage
 // is reserved for explicitly submitted operation receipt metadata.
 const recoveryScope='BOM:manual',recoveryLimits={groups:128,cells:512,text:32768};
 let recoverySession=null,recoveryOwner=null,recoveryVerified=null,recoveryFlight=null,recoveryNotice='',localRevision=0,recoveryMount=0,transportOwner=null;
 let recoveryBaseCache=null,dirtyCache=null,ownerQuarantined=false;const isolatedInputs=[];
 const recoveryBase=(f=flow(),versionId=version()?.id)=>{const parts=[f?.generation,f?.revision,f?.saved?.id||null,versionId];if(!recoveryBaseCache||parts.some((v,i)=>v!==recoveryBaseCache.parts[i]))recoveryBaseCache={parts,value:JSON.stringify(parts)};return recoveryBaseCache.value;};
 function retainOperation(){if(!recoveryFlight&&!saveCommand&&!client?.hasUnknown())return;if(!isolatedInputs.some(item=>item.flight===recoveryFlight&&item.client===client))isolatedInputs.push({actorId:actor,flight:recoveryFlight,session:recoverySession,saveCommand,client});}
 function dropUnsent(){localBase=null;localBaseVersion=null;pending=[];batch=null;edit=null;editor=copy(flow()?.working.bom||active()?.snapshot.bom||{});saveCommand=recoveryFlight?.command||null;cachedIndex=null;dirtyCache=null;localRevision++;}
 function isolateOwnerInput(){if(ownerQuarantined)return true;if(!actor||!manualLocal()&&!batch&&!saveCommand&&!recoveryFlight&&!client?.hasUnknown())return false;retainOperation();dropUnsent();ownerQuarantined=true;recoverySession?.close();recoveryNotice='BOM_OWNER_CHANGED_REOPEN_REQUIRED';const host=document.querySelector('.bw-workspace');if(host)host.innerHTML=`<p role="alert">${h(t('登入或頁面身分已變更，請重新開啟。未送輸入已放棄；原操作紀錄保留，不會移交或重送。','Định danh đăng nhập/trang đã đổi; hãy mở lại. Đầu vào chưa gửi đã bỏ; giữ biên nhận gốc, không chuyển hoặc gửi lại.'))}</p>`;return true;}
 function workspaceOwner(){const identity=window.ProcessSync?.identity,epoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.(),mount=recoveryMount,c=client;return()=>identity===window.ProcessSync?.identity&&identity?.id===actor&&epoch===window.ProcessSync?.identityGeneration?.()&&mount===recoveryMount&&c===client&&!window.ProcessSync?.requiresReload&&(!delivery||window.ProcessSync?.isCurrentDelivery?.(delivery)!==false);}
 const manualLocal=()=>pending.length>0||editedFieldsChanged();
 const captureLocalBase=()=>{if(!localBase){localBase=copy(flow()?.working.bom||active()?.snapshot.bom||{});localBaseVersion=recoveryBase();}return localBase;};
 const importLocal=()=>!!batch||pending.some(item=>!!item.moduleAction);
 function recoveryContext(owned){const verified=recoveryVerified?.owned()===true?recoveryVerified:null,f=verified?.flow||flow();return{actorId:actor,scope:recoveryScope,epoch:window.ProcessSync?.identityGeneration?.(),baseVersion:!verified&&localBase&&manualLocal()?localBaseVersion:recoveryBase(f),canView:owned()&&permission('view'),canEdit:owned()&&permission('edit')&&version()?.status==='draft',pending:!!f?.pendingId,verified:!!verified,hasLocalChanges:manualLocal()||!!batch,localRevision,writeState:recoveryFlight||client?.hasUnknown(true)?'unknown':'idle'};}
 function paintRecovery(){const node=document.querySelector('[data-bw-local-status]');if(node)node.textContent=[recoveryFlight||client?.hasUnknown(true)?t('結果待確認；只查原回執，不會重送。','Chưa xác nhận; chỉ tra biên nhận gốc, không gửi lại.'):manualLocal()||batch?t('未儲存內容只保留在本頁；離頁或關閉後不會恢復。','Nội dung chưa lưu chỉ giữ trên trang; không khôi phục sau khi rời hoặc đóng trang.'):t('修改後請按儲存；未送內容不建立本機副本。','Bấm Lưu sau khi sửa; không tạo bản cục bộ cho nội dung chưa gửi.'),client?.legacyRecoveryUnsupported?.()?t('舊版無操作識別碼紀錄保留，不能視為已清理。','Giữ bản cũ không có mã thao tác; chưa thể coi là đã xử lý.'):'',recoveryNotice].filter(Boolean).join(' · ');}
 function prepareRecovery(){if(!flow()||!actor)return null;if(recoverySession&&recoveryOwner?.())return recoverySession;if(recoverySession&&(manualLocal()||batch||recoveryFlight))throw Error('BOM_RECOVERY_REOPEN_REQUIRED');recoverySession?.close();recoveryVerified=null;const workspace=workspaceOwner(),generation=flow().generation,versionId=version()?.id;recoveryOwner=()=>workspace()&&flow()?.generation===generation&&version()?.id===versionId;if(!window.LocalDraftRecoverySession){recoveryNotice='RECOVERY_HELPER_UNAVAILABLE';return null;}const owned=recoveryOwner;let session;try{session=window.LocalDraftRecoverySession.create({current:owned,getContext:()=>recoveryContext(owned),onStatus:()=>{if(session===recoverySession&&owned())paintRecovery();}});}catch{recoveryNotice='RECOVERY_HELPER_UNAVAILABLE';return null;}recoverySession=session;void session.ready.then(()=>{if(session===recoverySession&&owned())paintRecovery();});return session;}
 const cellKey=cell=>cell.rootCode+'\u0000'+cell.rowId+'\u0000'+cell.field;
 function cellsForItem(item){if(item.moduleAction||!Array.isArray(item.patches)||!Array.isArray(item.guards)||item.patches.length!==item.guards.length)throw Error('BOM_IMPORT_RECOVERY_UNAVAILABLE');return item.patches.map((patch,i)=>{const guard=item.guards[i],path=patch.path;if(patch.op!=='set'||!Array.isArray(path)||path.length!==4||path[0]!=='bom'||!path[2]||Object.keys(path[2]).length!==1||typeof path[2].id!=='string'||!guard||!Array.isArray(guard.path)||guard.path.length!==4||guard.path[0]!==path[0]||guard.path[1]!==path[1]||guard.path[2]?.id!==path[2].id||guard.path[3]!==path[3])throw Error('INVALID_BOM_MANUAL_RECOVERY');return{rootCode:path[1],rowId:path[2].id,field:path[3],base:guard.value,value:patch.value};});}
 function cellsForEdit(){const cells=[];for(const old of edit?.rows||[]){const row=editor[old.rootCode]?.find(value=>value.id===old.id);if(!row)throw Error('BOM_MANUAL_ROW_MISSING');for(const field of D.editableFields)if(row[field]!==old[field])cells.push({rootCode:old.rootCode,rowId:old.id,field,base:old[field],value:row[field]});}return cells;}
 function projection(){if(importLocal())throw Error('BOM_IMPORT_RECOVERY_UNAVAILABLE');const payload={kind:'bom-manual-v1',versionId:version()?.id,groups:pending.map(cellsForItem),editing:cellsForEdit()};validateProjection(payload);return payload;}
 function validateProjection(payload,f){const exact=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));if(!exact(payload,['kind','versionId','groups','editing'])||payload.kind!=='bom-manual-v1'||typeof payload.versionId!=='string'||!payload.versionId||payload.versionId.length>recoveryLimits.text||!Array.isArray(payload.groups)||!Array.isArray(payload.editing))throw Error('INVALID_BOM_MANUAL_RECOVERY');let count=0,chars=0,overLimit=payload.groups.length>recoveryLimits.groups;const known=new Map();for(const group of [...payload.groups,payload.editing]){if(!Array.isArray(group))throw Error('INVALID_BOM_MANUAL_RECOVERY');const seen=new Set();for(const cell of group){if(!exact(cell,['rootCode','rowId','field','base','value'])||!['rootCode','rowId','field','base','value'].every(key=>typeof cell[key]==='string')||['rootCode','rowId','field'].some(key=>cell[key].length>recoveryLimits.text)||!cell.rootCode||!cell.rowId||!D.editableFields.includes(cell.field)||['__proto__','prototype','constructor'].includes(cell.rootCode))throw Error('INVALID_BOM_MANUAL_RECOVERY');chars+=cell.rootCode.length+cell.rowId.length+cell.base.length+cell.value.length;if(++count>recoveryLimits.cells||cell.base.length>recoveryLimits.text||cell.value.length>recoveryLimits.text||chars>200000)overLimit=true;const key=cellKey(cell);if(seen.has(key))throw Error('INVALID_BOM_MANUAL_RECOVERY');seen.add(key);if(known.has(key)&&known.get(key)!==cell.base)throw Error('BOM_MANUAL_BASE_CONFLICT');if(f){const rows=f.working.bom[cell.rootCode]?.filter(row=>row.id===cell.rowId)||[];if(rows.length!==1||rows[0].rootCode!==cell.rootCode||rows[0].level>1&&D.numericFields.includes(cell.field)||!known.has(key)&&rows[0][cell.field]!==cell.base)throw Error('BOM_MANUAL_BASE_CONFLICT');}known.set(key,cell.value);}}if(overLimit)throw Object.assign(Error('BOM_MANUAL_RECOVERY_LIMIT'),{code:'BOM_MANUAL_RECOVERY_LIMIT'});return payload;}
 function materialize(payload,f){validateProjection(payload,f);const next=copy(f.working.bom),items=[];for(const cells of [...payload.groups,payload.editing]){if(!cells.length)continue;const patches=[],guards=[];for(const cell of cells){const row=next[cell.rootCode].find(value=>value.id===cell.rowId),path=['bom',cell.rootCode,{id:cell.rowId},cell.field];if(row[cell.field]!==cell.base)throw Error('BOM_MANUAL_BASE_CONFLICT');row[cell.field]=cell.value;patches.push({op:'set',path,value:cell.value});guards.push({path,value:cell.base});}items.push({patches,guards});}D.validate(next);return{editor:next,pending:items};}
 function queueRecovery(){paintRecovery();}
 function changedLocal(){localRevision++;queueRecovery();}
 function persistRecovery(){try{projection();}catch(error){if(error.code!=='BOM_MANUAL_RECOVERY_LIMIT')throw error;}}
 function checkRecoveryRead(result,forEdit=true,allowGeneration=false){const f=result?.control?.workflow,current=flow();if(!f||f.scope!=='bom'||typeof f.generation!=='string'||!Number.isSafeInteger(f.revision)||!Number.isSafeInteger(result.revision)||result.permissions?.view!==true||!['view','edit','save','submit','withdraw','approve','return','history','import'].every(key=>typeof result.permissions[key]==='boolean')||!f.working?.bom||!Array.isArray(result.control.versions))throw Error('AUTHORITATIVE_READBACK_REQUIRED');if(current&&(!allowGeneration&&f.generation!==current.generation||f.revision<current.revision)||result.revision<fullRevision)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');if(forEdit&&(result.permissions.edit!==true||f.pendingId||!result.control.versions.some(v=>v.id===version()?.id&&v.status==='draft')))throw Error(f.pendingId?'PENDING_LOCKED':'FORBIDDEN');return f;}
 function adoptRecoveryRead(result,allowGeneration=false){checkRecoveryRead(result,false,allowGeneration);control=result.control;fullRevision=result.revision;reviewState=null;reviewRevision=null;reviewEpoch++;}
 function actionOwner(trackRevision=true){const owned=workspaceOwner(),session=recoverySession,revision=localRevision;return()=>owned()&&session===recoverySession&&(!trackRevision||revision===localRevision);}
 async function ensureRecovery(session,owned){if(!session)throw Error('RECOVERY_HELPER_UNAVAILABLE');await session.ready;if(!owned()||session!==recoverySession)throw Error('RECOVERY_CONTEXT_CHANGED');if(session.status().ready)return null;const result=await client.read(undefined,{isCurrent:owned,requireAcceptedAccess:true});if(!owned())throw Error('RECOVERY_CONTEXT_CHANGED');const f=checkRecoveryRead(result,false);recoveryVerified={owned,flow:f};try{const resumed=await session.resume();if(!resumed.ok||!resumed.ready)throw Error(resumed.code);return result;}finally{recoveryVerified=null;}}
 async function restoreRecord(){assertCurrentDisplay();throw Error('UNSENT_RECOVERY_DISABLED');}
 async function discardRecord(){throw Error('UNSENT_RECOVERY_DISABLED');}
 function discardOwnRecovery(){localRevision++;}
 async function reconcileLocal(confirmPreview){assertCurrentDisplay();const session=prepareRecovery(),owned=actionOwner(),payload=projection(),check=()=>{if(!owned()||recoveryFlight||client.hasUnknown()||importLocal())throw Error('RECOVERY_CONTEXT_CHANGED');};try{check();await ensureRecovery(session,owned);check();const first=await client.read(undefined,{isCurrent:owned,requireAcceptedAccess:true});check();const f=checkRecoveryRead(first),base=recoveryBase(f);const desired=new Map();for(const group of [...payload.groups,payload.editing])for(const cell of group)desired.set(cellKey(cell),cell);const cells=[...desired.values()].map(cell=>{const row=f.working.bom[cell.rootCode]?.find(value=>value.id===cell.rowId);if(!row)throw Error('BOM_MANUAL_BASE_CONFLICT');return{...cell,base:row[cell.field]};});const nextPayload={kind:payload.kind,versionId:payload.versionId,groups:cells.length?[cells]:[],editing:[]};materialize(nextPayload,f);if(!await confirmPreview({before:payload,latest:nextPayload}))return false;check();const second=await client.read(undefined,{isCurrent:owned,requireAcceptedAccess:true});check();const latest=checkRecoveryRead(second);if(recoveryBase(latest)!==base)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');const next=materialize(nextPayload,latest);recoveryVerified={owned,flow:latest};const rebased=await session.rebaseLocal({baseVersion:base,workflow:{...latest,scope:recoveryScope},localRevision});check();if(!rebased.ok)throw Error(rebased.code||'RECOVERY_STORAGE_UNAVAILABLE');adoptRecoveryRead(second);localBase=copy(latest.working.bom);localBaseVersion=recoveryBase(latest);editor=next.editor;pending=next.pending;edit=null;localRevision++;cachedIndex=null;recoveryNotice=t('已更新本機比對基準，仍須儲存草稿。','Đã cập nhật cơ sở cục bộ; vẫn cần lưu bản nháp.');return true;}finally{recoveryVerified=null;}}
 async function openRecovery(){assertCurrentDisplay();const session=prepareRecovery(),owned=actionOwner();if(!session)throw Error('RECOVERY_HELPER_UNAVAILABLE');await ensureRecovery(session,owned);if(!owned())throw Error('RECOVERY_CONTEXT_CHANGED');const inventory=session.discover(),area=document.querySelector('[data-bw-local-list]');if(!area)return;area.innerHTML='';const info=document.createElement('p');info.textContent=inventory.ok?t('僅查詢原操作回執；未送輸入不會恢復或另行刪除。','Chỉ tra biên nhận gốc; không khôi phục hoặc xóa đầu vào chưa gửi.'):inventory.code;area.append(info);for(const item of inventory.items||[]){if(item.legacy)continue;const row=document.createElement('div'),label=document.createElement('small');label.textContent=item.runtimeId;row.append(label);const button=document.createElement('button');button.type='button';button.className='button ghost';button.textContent=t('查原回執','Tra biên nhận');button.onclick=()=>run(()=>settleRecord(item.key));row.append(button);area.append(row);}}
 // GET readbacks and original-POST authority remain distinct private proofs.
 // The latter carries only the unchanged prior permissions; it never regrants
 // permission or represents a full GET. Final Save cannot use this branch.
 const applyAuthorityReads=new WeakMap();
 function operationAuthority(result,operationId){const read=client.verifiedReadback?.(result,operationId);if(read)return read;const proof=client.verifiedApplyAuthority?.(result,operationId);if(!proof||proof.response!==result)return null;const authority=Object.freeze({...result,permissions:Object.freeze({...proof.priorPermissions})});checkRecoveryRead(authority,false);applyAuthorityReads.set(authority,result);return authority;}
 function hasOperationAuthority(result,read){if(client.verifiedReadback?.(result,result.receipt?.operationId)===read)return true;const proof=client.verifiedApplyAuthority?.(result,result.receipt?.operationId);return !!read&&applyAuthorityReads.get(read)===result&&proof?.response===result&&read.control===result.control&&read.revision===result.revision;}
 function requireOwnSave(result,read,command){
  if(command?.action!=='save')return null;
  const receipt=result.receipt,post=result.control?.workflow,current=read?.control?.workflow;
  const owns=f=>!!f&&f.generation===receipt?.generation&&f.revision===receipt?.revision&&f.saved?.id===receipt?.savedId&&D.canonical(D.semantic(f.saved.content.bom))===D.canonical(D.semantic(f.working.bom));
  if(owns(post))return post;
  if(owns(current))return current;
  // A later Apply can change working/revision while the immutable saved record
  // still belongs to this receipt. Use that accepted GET's exact saved content,
  // never replay command patches over the old baseline to invent an ACK basis.
  if(current?.generation===receipt?.generation&&current.revision>=receipt?.revision&&current.saved?.id===receipt?.savedId&&current.saved?.content?.bom&&Number.isSafeInteger(current.saved.revision)&&current.saved.revision<=receipt.revision){D.validate(current.saved.content.bom);return {saved:current.saved};}
  // The verified original receipt can outlive the current saved pointer. Its
  // authority is checked by settleHelper; absence of the old body is not a
  // failed receipt. A retained preflight candidate is only a local input basis.
  return null;
 }
 function settleSavedInput(flight,read){
  if(flight.command.action!=='save'||pending.length)return;
  const late=cellsForEdit(),latest=read.control.workflow,sharedUnfixed=!latest.saved||D.canonical(D.semantic(latest.working.bom))!==D.canonical(D.semantic(latest.saved.content.bom));
  const basis=(late.length||sharedUnfixed)&&flight.savedBasis?.saved.content.bom||late.length&&flight.localBasis||late.length&&localBase||latest.working.bom;
  localBase=copy(basis);localBaseVersion=recoveryBase(read.control.workflow);
  // Late typing can still be based on the pre-choice local value. If Save chose
  // theirs, preserve that unsent field's actual old base so the next Save shows
  // its new conflict; acknowledging the selected Save never chooses mine again.
  for(const cell of late){const row=localBase[cell.rootCode]?.find(value=>value.id===cell.rowId);if(row&&row[cell.field]!==cell.base&&row[cell.field]!==cell.value)row[cell.field]=cell.base;}
  editor=copy(localBase);edit=null;
  for(const cell of late){const row=editor[cell.rootCode]?.find(value=>value.id===cell.rowId);if(!row||row[cell.field]===cell.value)continue;if(!edit)edit={rows:[]};if(!edit.rows.some(old=>old.id===row.id&&old.rootCode===row.rootCode))edit.rows.push(copy(row));row[cell.field]=cell.value;}
 }
 function settleHelper(session,preview,result,read,owned,freshRead=false){const f=checkRecoveryRead(read,false);if(!freshRead&&!hasOperationAuthority(result,read))throw Error('AUTHORITATIVE_READBACK_REQUIRED');recoveryVerified={owned,flow:f};const settled=preview.kind==='resolved'?session.finalizeDisposition(preview.token):session.settleReceipt(preview.token,{receipt:result.receipt,workflow:{...f,scope:recoveryScope}});if(!settled.ok)throw Error(settled.code);return f;}
 function drainFlight(flight,read){if(flight!==recoveryFlight)throw Error('DIFFERENT_OPERATION_UNRESOLVED');if(flight.items){if(!flight.items.every((item,i)=>pending[i]===item))throw Error('BOM_PENDING_BATCH_CHANGED');pending.splice(0,flight.items.length);}else if(flight.item){const index=pending.indexOf(flight.item);if(index!==0)throw Error('BOM_PENDING_BATCH_CHANGED');pending.splice(index,1);prepared.delete(flight.item);}if(flight.command.action==='save'&&saveCommand===flight.command)saveCommand=null;recoveryFlight=null;adoptRecoveryRead(read);settleSavedInput(flight,read);localRevision++;queueRecovery();}
 async function settleRecord(key){const session=prepareRecovery(),owned=actionOwner(false);await ensureRecovery(session,owned);const claim=await session.claim(key);if(!owned())throw Error('RECOVERY_CONTEXT_CHANGED');if(!claim.ok)throw Error(claim.code);const preview=session.preview(key);if(!preview.ok||preview.kind!=='unknown'&&!(preview.kind==='resolved'&&preview.outcome==='receipt'))throw Error(preview.ok?'RECEIPT_REQUIRED':preview.code||'RECEIPT_REQUIRED');const flight=recoveryFlight;if(flight?.preparationOnly)throw Error('NOT_DISPATCHED_CLEANUP_REQUIRED');const matching=key===session.key&&flight?.command.operationId===preview.receipt.operationId&&flight.command.generation===preview.receipt.generation;if(flight&&!matching)throw Error('DIFFERENT_OPERATION_UNRESOLVED');const model=control,revision=fullRevision;try{let result,read,freshRead=false;if(matching&&flight.terminal&&hasOperationAuthority(flight.terminal.result,flight.terminal.read)){({result,read}=flight.terminal);}else{result=await client.receipt(preview.receipt.operationId,preview.receipt.generation);if(!owned()||control!==model||fullRevision!==revision)throw Error('RECOVERY_CONTEXT_CHANGED');read=client.verifiedReadback?.(result,result.receipt?.operationId);if(!read&&(!matching&&!flight||matching&&!client.hasUnknown())){read=await client.read(undefined,{isCurrent:owned,requireAcceptedAccess:true});freshRead=true;}if(!owned()||control!==model||fullRevision!==revision)throw Error('RECOVERY_CONTEXT_CHANGED');if(matching&&read)flight.terminal={result,read};}const savedBasis=requireOwnSave(result,read,matching?flight.command:{action:preview.receipt.action});if(matching&&savedBasis)flight.savedBasis=savedBasis;settleHelper(session,preview,result,read,owned,freshRead);if(matching)drainFlight(flight,read);recoveryNotice=t('已確認原回執；未重新送出，也未繼續儲存。','Đã xác nhận biên nhận; không gửi lại hoặc tự tiếp tục lưu.');return true;}finally{recoveryVerified=null;}}
 function finalizeRejection(){const flight=recoveryFlight,cleanup=flight?.cleanup,session=recoverySession;if(flight?.preparationOnly){if(!recoveryOwner?.())throw Error('RECOVERY_CONTEXT_CHANGED');const cancelled=session.cancelPrepared(flight.reservation);if(!cancelled.ok)throw Error(cancelled.code);if(flight!==recoveryFlight||!recoveryOwner?.())throw Error('RECOVERY_CONTEXT_CHANGED');if(saveCommand===flight.command)saveCommand=null;recoveryFlight=null;queueRecovery();paintRecovery();return true;}if(!cleanup||!recoveryOwner?.()||!client.isConfirmedRejection(cleanup.error,flight.command))throw Error('CONFIRMED_REJECTION_REQUIRED');if(!session.wasRejected(flight.reservation,cleanup.error)){const result=session.retryRejected(flight.reservation,cleanup.error);if(!result.ok)throw Error(result.code);}if(client.hasConfirmedRejection(flight.command))client.finalizeRejected(flight.command);if(flight!==recoveryFlight||!recoveryOwner?.()||client.hasConfirmedRejection(flight.command))throw Error('REJECTION_CLEANUP_REQUIRED');if(flight.item)prepared.delete(flight.item);if(saveCommand===flight.command)saveCommand=null;recoveryFlight=null;queueRecovery();paintRecovery();return true;}
 async function sendManual(item,check){assertCurrentDisplay();const session=prepareRecovery(),owned=actionOwner(false),c=client;await ensureRecovery(session,owned);check();if(recoveryFlight||c.hasUnknown())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');if(!permission('view')||!editable())throw Error('FORBIDDEN');if(manualLocal()&&!importLocal())persistRecovery();else session.cancelScheduled();const command=item&&!item.operations?c.prepareRecovery(flow().generation,item):c.prepareRecoverySave(flow().generation,item?.operations?{moduleAction:'save-local-v1',input:{operations:copy(item.operations),...(item.reconciliation?{reconciliation:copy(item.reconciliation)}:{})},expectedRevision:item.expectedRevision}:{}),proof=c.rejectionCapability(command);const preparedWrite=session.prepareWrite({operationId:command.operationId,generation:command.generation});if(!preparedWrite.ok||!preparedWrite.durable){if(preparedWrite.reservation){const cancelled=session.cancelPrepared(preparedWrite.reservation);if(!cancelled.ok&&owned()){recoveryFlight={command,item,reservation:preparedWrite.reservation,preparationOnly:true};if(!item)saveCommand=command;}}throw Error(preparedWrite.code||'RECOVERY_STORAGE_UNAVAILABLE');}const flight={command,item:item?.operations?null:item,items:item?.items||item?.operations,localBasis:item?.localBasis?copy(item.localBasis):null,reservation:preparedWrite.reservation,cleanup:null};if(item&&!item.operations)prepared.set(item,command);else saveCommand=command;recoveryFlight=flight;try{const result=await session.dispatchPrepared(flight.reservation,command,sent=>c.sendPrepared(sent,{assertDispatch:sent=>owned()&&recoveryFlight===flight&&session.assertDispatch(sent)}),{rejectionProof:proof});check();if(!owned()||flight!==recoveryFlight)throw Error('RECOVERY_CONTEXT_CHANGED');const read=operationAuthority(result,command.operationId),preview=session.preview(session.key);if(read)flight.terminal={result,read};if(!preview.ok||preview.kind!=='unknown'&&!(preview.kind==='resolved'&&preview.outcome==='receipt'))throw Error(preview.code||'RECEIPT_REQUIRED');flight.savedBasis=requireOwnSave(result,read,command);settleHelper(session,preview,result,read,owned);drainFlight(flight,read);return result;}catch(failure){if(owned()&&flight===recoveryFlight){if(c.isConfirmedRejection(failure,command)){if(session.wasRejected(flight.reservation,failure)&&!c.hasConfirmedRejection(command)){recoveryFlight=null;if(item&&!item.operations)prepared.delete(item);else saveCommand=null;}else flight.cleanup={error:failure};}else if(session.wasRejected(flight.reservation,failure)){recoveryFlight=null;if(item&&!item.operations)prepared.delete(item);else saveCommand=null;}recoveryNotice=errorText(failure);if(!recoveryFlight)queueRecovery();}throw failure;}finally{recoveryVerified=null;paintRecovery();}}
 function transport(){const id=window.ProcessSync?.identity?.id;if(actor&&!transportOwner?.())isolateOwnerInput();if(ownerQuarantined&&(!id||id===actor))throw Error('BOM_OWNER_CHANGED_REOPEN_REQUIRED');if(!id)throw Error(t('請先登入','Vui lòng đăng nhập'));if(id!==actor||!transportOwner?.()){recoverySession?.close();recoverySession=null;recoveryOwner=null;recoveryFlight=null;recoveryVerified=null;recoveryNotice='';ownerQuarantined=false;recoveryMount++;localRevision=0;actor=id;control=null;pending=[];batch=null;edit=null;saveCommand=null;editor={};localBase=null;reviewState=null;reviewRevision=null;reviewLoading=null;reviewEpoch++;fullRevision=0;departureRetained=false;resetApprovedDisplay();client=window.createSharedDraftClient({durableBegin:true,allowUnknownDeparture:true,endpoint:'/api/bom/workflow?caseMetadata=1',conditionalState:true,guardAccessResults:true,actorId:id,externalDurableBounded:{scope:'BOM'},headers:()=>({'Content-Type':'application/json'})});transportOwner=workspaceOwner();}return client;}
 async function read(conditional=false){const c=transport(),owned=workspaceOwner(),epoch=++readEpoch;if(c.hasUnknown()&&!recoveryFlight)await c.resolveUnknown();const access=()=>JSON.stringify(['edit','save','submit','approve','return','withdraw','import'].map(k=>c.permission(k))),beforeAccess=access();const f=flow(),result=await c.read(conditional&&f?f.generation+':'+f.revision:'');if(epoch!==readEpoch||!owned())return {unchanged:true};if(result.control){
   // An explicit accepted read may align an entirely empty helper basis.
   // Its existing empty-only transaction retains the same runtime/lineage/lease;
   // selected local input and unknown receipt state can never enter this branch.
   if(recoverySession&&!pending.length&&!batch&&(!edit||!editedFieldsChanged())&&!saveCommand&&!recoveryFlight&&!c.hasUnknown()&&recoveryOwner?.()&&result.control.workflow?.generation===flow()?.generation&&result.control.versions.some(value=>value.id===version()?.id&&value.status==='draft')&&result.permissions?.edit===true&&!result.control.workflow.pendingId){
    const latest=checkRecoveryRead(result,false),session=recoverySession,revision=localRevision;
    recoveryVerified={owned,flow:latest};
    try{await session.ready;if(epoch!==readEpoch||!owned()||session!==recoverySession||revision!==localRevision||pending.length||batch||editedFieldsChanged()||saveCommand||recoveryFlight||c.hasUnknown())throw Error('RECOVERY_CONTEXT_CHANGED');const aligned=session.rebaseLocal({baseVersion:recoveryBase(latest),workflow:{...latest,scope:recoveryScope},localRevision:revision});if(!aligned.ok)throw Error(aligned.code);}finally{recoveryVerified=null;}
   }
   control=result.control;fullRevision=result.revision;reviewState=null;reviewRevision=null;reviewEpoch++;
  }if(!result.unchanged){const saved=flow()?.working.bom||active()?.snapshot.bom||{};if(!pending.length&&!batch&&!recoveryFlight&&(!edit||!editedFieldsChanged())){editor=copy(saved);edit=null;localBase=null;captureLocalBase();}}if(flow())prepareRecovery();return {...result,permissionsChanged:beforeAccess!==access()};}
 async function command(action,detail={}){assertCurrentDisplay();const c=transport(),owned=workspaceOwner(),model=control,result=await c.command(flow().generation,action,detail);if(!owned()||control!==model)throw Error('DELIVERY_SUPERSEDED');const readback=c.verifiedReadback?.(result,result.receipt?.operationId);if(!readback)throw Error('AUTHORITATIVE_READBACK_REQUIRED');adoptRecoveryRead(readback,['approve','return','withdraw','restore'].includes(action));if(!manualLocal()&&!batch&&!recoveryFlight){editor=copy(flow().working.bom);edit=null;localBase=null;captureLocalBase();}return result;}
 function inputField(root,id,field,value){if(historicalDisplay())return false;if(!recoveryOwner?.())return;captureLocalBase();const row=editor[root]?.find(item=>item.id===id);if(!row||!D.editableFields.includes(field))return;if(!edit)edit={rows:[]};if(!edit.rows.some(old=>old.id===row.id&&old.rootCode===row.rootCode))edit.rows.push({...row});row[field]=value;cachedIndex=null;changedLocal();}
 function collectEdit(){assertCurrentDisplay();if(!edit)return;document.querySelectorAll('[data-bw-field]').forEach(input=>{const row=editor[input.dataset.root]?.find(r=>r.id===input.dataset.id);if(row)row[input.dataset.bwField]=input.value;});}
 function editedFieldsChanged(){if(!edit)return false;if(dirtyCache?.edit===edit&&dirtyCache.revision===localRevision)return dirtyCache.value;const value=edit.rows.some(old=>{const row=editor[old.rootCode]?.find(r=>r.id===old.id);return !row||D.editableFields.some(field=>row[field]!==old[field]);});dirtyCache={edit,revision:localRevision,value};return value;}
 const unappliedImport=()=>!!batch?.changes.length;
 function hasUnsavedChanges(){return !!recoveryFlight||unappliedImport()||!!pending.length||editedFieldsChanged()||!!saveCommand||!!client?.hasUnknown()||!!client?.hasSyncFailures?.()||!!client?.legacyRecoveryUnsupported?.();}
 function finishEdit(){assertCurrentDisplay();if(!edit)return;collectEdit();D.validate(editor);const patches=[],guards=[];for(const old of edit.rows){const row=editor[old.rootCode].find(r=>r.id===old.id);for(const field of D.editableFields)if(row[field]!==old[field]){const path=['bom',row.rootCode,{id:row.id},field];patches.push({op:'set',path,value:row[field]});guards.push({path,value:old[field]});}}for(let offset=0;offset<patches.length;offset+=256)pending.push({patches:patches.slice(offset,offset+256),guards:guards.slice(offset,offset+256)});edit=null;changedLocal();}
 async function finishImport(){assertCurrentDisplay();if(!editable()||!permission('import'))throw Error('FORBIDDEN');const owned=workspaceOwner(),target=batch,before=editor,revision=localRevision,check=()=>{if(!owned()||target!==batch||before!==editor||revision!==localRevision)throw Error('RECOVERY_CONTEXT_CHANGED');};captureLocalBase();const next=D.applyComparison(before,target),input={sheets:target.sheets,file:target.file,importMode:'incremental-v1',decisions:target.changes.map(c=>({decision:c.decision,value:c.value}))},baseDigest=await D.semanticDigest(target.base);check();const nextDigest=await D.semanticDigest(next);check();const beforeDigest=await D.semanticDigest(before);check();if(nextDigest!==beforeDigest)pending.push({moduleAction:'import-digiwin',input:{...input,baseDigest}});editor=next;batch=null;changedLocal();}
 function save(){assertCurrentDisplay();if(saveFlight)return saveFlight;const task=saveOnce();saveFlight=task;void task.finally(()=>{if(saveFlight===task)saveFlight=null;}).catch(()=>{});return task;}
 // Compare stable Digiwin occurrence IDs and the six supported edit fields.
 // Provenance/structure stays owned by the original import operation.
 async function saveIntent(base,operations){
  let staged=copy(base),stagedRows=new Map(Object.values(staged).flat().map(row=>[row.id,row]));const imports=[],manualKeys=new Set(),selectedRoots=new Set();let structural=false;
  for(const operation of operations){
   if(operation.moduleAction){
    if(operation.moduleAction!=='import-digiwin')throw Error('BOM_ACTION_INVALID');
    const input=operation.input;
    if(input?.importMode!=='incremental-v1'||input.initialize||input.baseDigest!==await D.semanticDigest(staged))throw Error('BOM_IMPORT_BASE_CHANGED');
    const incoming=D.parseMatrices(input.sheets,{file:input.file}),comparison=D.compare(staged,incoming);
    if(!Array.isArray(input.decisions)||comparison.changes.length!==input.decisions.length)throw Error('BOM_IMPORT_DECISIONS_CHANGED');
    comparison.changes.forEach((change,i)=>{Object.assign(change,input.decisions[i]);if(change.decision!=='keep')selectedRoots.add(change.root);if(change.kind==='structure'&&change.decision!=='keep')structural=true;});
    imports.push({operation,changes:comparison.changes});staged=D.applyComparison(staged,comparison);stagedRows=new Map(Object.values(staged).flat().map(row=>[row.id,row]));
   }else{
    const cells=cellsForItem(operation),seen=new Set();
    for(const cell of cells){const key=cellKey(cell),row=stagedRows.get(cell.rowId);if(seen.has(key)||!D.editableFields.includes(cell.field)||!row||row.rootCode!==cell.rootCode||row[cell.field]!==cell.base)throw Error('BOM_MANUAL_BASE_CONFLICT');seen.add(key);manualKeys.add(key);selectedRoots.add(cell.rootCode);row[cell.field]=cell.value;}
    D.validate(staged);
   }
  }
  return {mine:staged,imports,manualKeys,structural,selectedRoots};
 }
 // Structural imports remain indivisible within each selected root. Rebase
 // only when every locally selected root is canonically equal to its original
 // data (including provenance); other roots stay server-owned and untouched.
 async function rebaseStructuralSave(base,intent,target,latest){
  const same=(a,b)=>D.canonical(a)===D.canonical(b);
  for(const root of intent.selectedRoots)if(!same(base[root],latest[root]))throw Error('BOM_IMPORT_STRUCTURE_RECONFIRM');
  const guards=[...intent.selectedRoots].sort((a,b)=>a<b?-1:a>b?1:0).map(root=>({path:['bom',root],...(Object.hasOwn(base,root)?{value:copy(base[root])}:{})}));
  const operations=[{patches:[],guards}],sources=new Map(intent.imports.map(source=>[source.operation,source]));let staged=copy(latest);
  for(const operation of target){
   if(operation.moduleAction){
    const source=sources.get(operation);if(!source)throw Error('BOM_IMPORT_DECISION_RECONFIRM');
    const input=copy(operation.input),comparison=D.compare(staged,D.parseMatrices(input.sheets,{file:input.file}));
    for(const old of source.changes.filter(change=>change.decision!=='keep')){
     const change=comparison.changes.find(change=>change.root===old.root&&change.kind===old.kind&&(old.kind==='structure'||change.id===old.id&&change.field===old.field));
     if(!change||!same(change.before,old.before)||!same(change.after,old.after))throw Error('BOM_IMPORT_STRUCTURE_RECONFIRM');
     change.decision=old.decision;if(old.decision==='edit')change.value=old.value;
    }
    // Keep newly exposed differences in unselected roots. Never turn omitted
    // report rows or a former keep group into accepted source changes.
    input.baseDigest=await D.semanticDigest(staged);input.decisions=comparison.changes.map(change=>({decision:change.decision,...(change.decision==='edit'?{value:change.value}:{})}));
    staged=D.applyComparison(staged,comparison);operations.push({moduleAction:'import-digiwin',input});
   }else{
    const rows=new Map(Object.values(staged).flat().map(row=>[row.id,row]));
    for(const cell of cellsForItem(operation)){const row=rows.get(cell.rowId);if(!row||row.rootCode!==cell.rootCode||row[cell.field]!==cell.base)throw Error('BOM_MANUAL_BASE_CONFLICT');row[cell.field]=cell.value;}
    D.validate(staged);operations.push(copy(operation));
   }
  }
  for(const root of new Set([...Object.keys(latest),...Object.keys(staged),...Object.keys(intent.mine)]))if(!same(staged[root],intent.selectedRoots.has(root)?intent.mine[root]:latest[root]))throw Error('BOM_IMPORT_STRUCTURE_RECONFIRM');
  return operations;
 }
 function mergeSaveFields(base,mine,theirs,choice){
  const next=copy(theirs),conflicts=[],ownRows=new Map(Object.values(mine).flat().map(row=>[row.id,row])),otherRows=new Map(Object.values(next).flat().map(row=>[row.id,row]));
  for(const [root,rows]of Object.entries(base))for(const before of rows){
   const own=ownRows.get(before.id),other=otherRows.get(before.id);
   if(!own)throw Error('BOM_SAVE_STRUCTURE_RECONFIRM');
   if(!other)continue; // A remotely deleted occurrence is never resurrected.
   for(const field of D.editableFields){if(own[field]===before[field])continue;const collision=other[field]!==before[field]&&other[field]!==own[field];if(collision)conflicts.push({root,id:before.id,field,base:before[field],mine:own[field],theirs:other[field]});if(!collision||choice==='mine')other[field]=own[field];}
  }
  D.validate(next);return {next,conflicts};
 }
 async function saveOperations(intent,latest,desired){
  let staged=copy(latest);const operations=[];
  for(const source of intent.imports){
   const input=copy(source.operation.input),comparison=D.compare(staged,D.parseMatrices(input.sheets,{file:input.file}));
   const decisions=new Map(source.changes.filter(change=>change.kind==='field').map(change=>[cellKey({rootCode:change.root,rowId:change.id,field:change.field}),change]));
   for(const change of comparison.changes){
    if(change.kind==='structure'){
     // A fresh structure group cannot be partially selected using an old field
     // decision. Keep a remote deletion only if no surviving source choice is lost.
     if(source.changes.some(old=>old.root===change.root&&old.decision!=='keep'&&(old.kind==='structure'||desired[old.root]?.some(row=>row.id===old.id&&row[old.field]!==staged[old.root]?.find(r=>r.id===old.id)?.[old.field]))))throw Error('BOM_IMPORT_STRUCTURE_RECONFIRM');
     continue;
    }
    const key=cellKey({rootCode:change.root,rowId:change.id,field:change.field}),old=decisions.get(key),wanted=desired[change.root]?.find(row=>row.id===change.id)?.[change.field];
    if(!old||old.decision==='keep')continue;
    // Retain the original source decision/value. A later manual edit remains a
    // separate supported manual patch; it does not rewrite the ERP decision.
    const sourceValue=old.decision==='edit'?String(old.value??''):old.after;
    if(wanted===sourceValue||intent.manualKeys.has(key)){change.decision=old.decision;if(old.decision==='edit')change.value=old.value;}
   }
   input.baseDigest=await D.semanticDigest(staged);input.decisions=comparison.changes.map(change=>({decision:change.decision,...(change.decision==='edit'?{value:change.value}:{})}));
   operations.push({moduleAction:'import-digiwin',input});staged=D.applyComparison(staged,comparison);
  }
  const patches=[],guards=[],stagedRows=new Map(Object.values(staged).flat().map(row=>[row.id,row]));
  for(const [root,rows]of Object.entries(desired))for(const row of rows){const current=stagedRows.get(row.id);if(!current)throw Error('BOM_IMPORT_STRUCTURE_RECONFIRM');for(const field of D.editableFields)if(current[field]!==row[field]){if(!intent.manualKeys.has(cellKey({rootCode:root,rowId:row.id,field})))throw Error('BOM_IMPORT_DECISION_RECONFIRM');const path=['bom',root,{id:row.id},field];patches.push({op:'set',path,value:row[field]});guards.push({path,value:current[field]});current[field]=row[field];}}
  if(D.canonical(D.semantic(staged))!==D.canonical(D.semantic(desired)))throw Error('BOM_IMPORT_STRUCTURE_RECONFIRM');
  for(let offset=0;offset<patches.length;offset+=256)operations.push({patches:patches.slice(offset,offset+256),guards:guards.slice(offset,offset+256)});
  return operations;
 }
 function conflictValue(value){
  if(value&&typeof value==='object'&&typeof value.present==='boolean')return value.present?(typeof value.value==='string'?value.value:D.canonical(value.value)):t('無共同基準／未提供','Không có mốc chung / chưa có');
  return value;
 }
 function conflictLabel(row){const index=D.fields.indexOf(row.field),label=row.field==='source'?t('完整來源註記（檔案／工作表／列）','Nguồn đầy đủ (tệp / trang / dòng)'):index>=0?labels()[index]:row.field;return row.root+' · '+row.id+' · '+label+(row.kind==='new-occurrence'?t('（雙方新增相同位置）',' (cùng thêm một vị trí)'):'');}
 function chooseSaveConflicts(conflicts){
  return new Promise(resolve=>{const dialog=document.createElement('dialog');dialog.className='bw-save-conflicts';dialog.setAttribute('aria-label',t('BOM 儲存衝突','Xung đột lưu BOM'));dialog.innerHTML=`<h2>${h(t('儲存前有欄位衝突','Có xung đột trước khi lưu'))}</h2><p>${h(t('以下列出全部衝突。選擇只影響這些欄位，其他雙方修改都會保留。','Hiển thị mọi xung đột. Lựa chọn chỉ áp dụng cho các trường này; giữ các sửa đổi khác của cả hai bên.'))}</p><div class="bw-conflict-scroll"><table><thead><tr>${[t('使用位置／欄位','Vị trí / trường'),t('原基準','Cơ sở'),t('我的內容','Của tôi'),t('對方最新內容','Bản mới của người khác')].map(value=>`<th>${h(value)}</th>`).join('')}</tr></thead><tbody>${conflicts.map(row=>`<tr><th>${h(conflictLabel(row))}</th><td>${h(conflictValue(row.base))}</td><td>${h(conflictValue(row.mine))}</td><td>${h(conflictValue(row.theirs))}</td></tr>`).join('')}</tbody></table></div><footer><button type="button" data-bw-conflict="cancel">${h(t('取消','Hủy'))}</button><button type="button" data-bw-conflict="theirs">${h(t('用對方的','Dùng của người khác'))}</button><button type="button" data-bw-conflict="mine">${h(t('用我的','Dùng của tôi'))}</button></footer>`;let settled=false;const owner=workspaceOwner(),invalidate=()=>{if(!owner())finish('cancel');};const finish=value=>{if(settled)return;settled=true;window.removeEventListener('process-delivery-invalidated',invalidate);window.removeEventListener('process-sync-status',invalidate);dialog.close();dialog.remove();resolve(value);};window.addEventListener('process-delivery-invalidated',invalidate);window.addEventListener('process-sync-status',invalidate);dialog.querySelectorAll('[data-bw-conflict]').forEach(button=>button.onclick=()=>finish(button.dataset.bwConflict));dialog.addEventListener('cancel',event=>{event.preventDefault();finish('cancel');});dialog.addEventListener('close',()=>finish('cancel'));document.body.append(dialog);dialog.showModal();});
 }
 async function saveOnce(){assertCurrentDisplay();
  if(unappliedImport())throw Error(t('匯入比對尚未套用。請先套用至編輯區或放棄本次匯入，再儲存草稿。','So sánh nhập chưa được áp dụng. Hãy áp dụng vào vùng sửa hoặc bỏ lần nhập trước khi lưu bản nháp.'));
  const c=client,owned=workspaceOwner(),generation=flow()?.generation,versionId=version()?.id;
  const check=()=>{if(!owned()||flow()?.generation!==generation)throw Error('DELIVERY_SUPERSEDED');};
  check();if(!transportOwner?.())throw Error('BOM_RECOVERY_REOPEN_REQUIRED');if(c.permission('edit')!==true||flow()?.pendingId)throw Error('FORBIDDEN');
  if(recoveryFlight||c.hasUnknown())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');
  // Keep original journal references for receipt drainage, but hash exactly the
  // JSON operations that the server receives (undefined properties are omitted).
  captureLocalBase();finishEdit();const target=pending.slice(),wireTarget=copy(target),comparison=batch,revision=localRevision,base=copy(localBase),intent=await saveIntent(base,wireTarget);
  const selected=()=>{check();if(localRevision!==revision||batch!==comparison||pending.length!==target.length||!target.every((item,i)=>pending[i]===item))throw Error('BOM_LOCAL_INPUT_CHANGED_RECONFIRM');};
  selected();let first=await c.read(undefined,{isCurrent:owned,requireAcceptedAccess:true});
  // This loop owns only a private, undispatched comparison. Keep the original
  // journal/base across new peer revisions; never enter it after sendManual.
  for(;;){selected();const fresh=checkRecoveryRead(first);
  if(first.permissions.save!==true||first.permissions.edit!==true||!first.control.versions.some(value=>value.id===versionId&&value.status==='draft'))throw Error('FORBIDDEN');
  if(intent.imports.length&&first.permissions.import!==true)throw Error('FORBIDDEN');
  const changed=D.canonical(D.semantic(base))!==D.canonical(D.semantic(fresh.working.bom));let operations,reconciliation,localBasis;
  if(intent.structural){
   const rootChanged=[...intent.selectedRoots].some(root=>D.canonical(base[root])!==D.canonical(fresh.working.bom[root]));
   if(rootChanged){
    let candidate=await D.reviewOccurrenceSave(base,wireTarget,fresh.working.bom),decision;
    if(candidate.conflicts.length){
     const choice=await chooseSaveConflicts(candidate.conflicts);selected();if(choice==='cancel')return false;
     const second=await c.read(undefined,{isCurrent:owned,requireAcceptedAccess:true});selected();const confirmed=checkRecoveryRead(second);
     if(second.revision<first.revision||confirmed.revision<fresh.revision)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
     if(second.permissions.view!==true||second.permissions.edit!==true||second.permissions.save!==true||second.permissions.import!==true||['view','edit','save','import'].some(key=>c.permission(key)!==true))throw Error('FORBIDDEN');
     if(second.revision!==first.revision||confirmed.generation!==fresh.generation||confirmed.revision!==fresh.revision||D.canonical(confirmed.working.bom)!==D.canonical(fresh.working.bom)){first=second;continue;}
     decision={choice,conflictsDigest:await D.occurrenceConflictDigest(candidate.conflicts),reviewDigest:candidate.reviewDigest};selected();
     candidate=await D.reconcileOccurrenceSave(base,wireTarget,fresh.working.bom,decision);
    }
    localBasis=candidate.next;operations=copy(wireTarget);reconciliation={base,candidateDigest:await D.candidateDigest(candidate.next),...(decision?{decision}:{})};
   }
   else {operations=changed?await rebaseStructuralSave(base,intent,wireTarget,fresh.working.bom):copy(wireTarget);localBasis=copy(fresh.working.bom);for(const root of intent.selectedRoots)localBasis[root]=copy(intent.mine[root]);}
  }
  else{
   let merged=mergeSaveFields(base,intent.mine,fresh.working.bom);
   if(merged.conflicts.length){const choice=await chooseSaveConflicts(merged.conflicts);selected();if(choice==='cancel')return false;
    const second=await c.read(undefined,{isCurrent:owned,requireAcceptedAccess:true});selected();const confirmed=checkRecoveryRead(second);
     if(second.revision<first.revision||confirmed.revision<fresh.revision)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
    if(second.permissions.save!==true||intent.imports.length&&second.permissions.import!==true)throw Error('FORBIDDEN');
    if(second.revision!==first.revision||confirmed.generation!==fresh.generation||confirmed.revision!==fresh.revision||D.canonical(confirmed.working.bom)!==D.canonical(fresh.working.bom)){first=second;continue;}
    merged=mergeSaveFields(base,intent.mine,fresh.working.bom,choice);
   }
   localBasis=merged.next;operations=await saveOperations(intent,fresh.working.bom,merged.next);
  }
  selected();const result=await sendManual({operations,items:target,localBasis,expectedRevision:fresh.revision,...(reconciliation?{reconciliation}:{})},check);
  check();
  if(batch&&!batch.changes.length)batch=null;cachedIndex=null;lastErrorCode='';return result;
  }
 }
 async function run(fn){if(busy)return;const runOwner=++runSequence,delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>runOwner===runSequence&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));busy=true;readEpoch++;error='';window.VersionDraftUI?.updateSync(document.querySelector('#data-content'),true,false);document.querySelectorAll('.bw-workspace [data-bw],#data-content .vd-shell [data-bw],.bw-review [data-bw],#review-bom [data-bw]').forEach(b=>b.disabled=true);document.querySelector('.bw-workspace')?.setAttribute('aria-busy','true');let failed=false,failure;try{try{await fn();}catch(e){if(owns()){lastErrorCode=String(e.message||'');error=errorText(e);}}}catch(e){failed=true;failure=e;}if(!owns())return;busy=false;paint();renderReview();const dialog=document.querySelector('.bw-review');if(dialog){for(const b of dialog.querySelectorAll('[data-bw]'))b.disabled=b.dataset.bw==='close'?false:!permission(b.dataset.bw);if(error){let alert=dialog.querySelector('[role=alert]');if(!alert){alert=document.createElement('p');alert.setAttribute('role','alert');dialog.prepend(alert);}alert.textContent=error;}}if(failed)throw failure;}
 function selectionAllowed(){if(historicalDisplay()||!edit)return true;error=t('請先完成修改或放棄修改，再切換位置。','Hãy hoàn tất hoặc bỏ sửa trước khi đổi vị trí.');paint();return false;}
 let cachedIndex=null;
 const index=()=>cachedIndex ||= D.createIndex(visibleBom());
 function updateSearch(input){
  if(!historicalDisplay()&&edit){input.value=ui.query;error=t('請先完成或放棄修改。','Hoàn tất hoặc bỏ sửa trước.');document.querySelector('.bw-error').textContent=error;return;}
  ui.query=input.value;const results=index().search(ui.query);
  if(!results.some(row=>row.code===ui.code)){ui.code=results[0]?.code||'';ui.position='';}
  const host=document.querySelector('.bw-workspace'),restore=window.VersionDraftUI?.preserveView(host);remember();
  // Keep the search input alive throughout composition and ordinary typing.
  host.querySelector('.bw-results').innerHTML=resultsHTML(results);
  host.querySelector('.bw-detail').innerHTML=detail();bind();restore?.();
 }
 function selectedRows(){const idx=index();return ui.position?[idx.byId.get(ui.position)].filter(Boolean):idx.occurrences(ui.code);}
 function table(rows,editing=false,relative=false){return `<div class="bw-table"><table><thead><tr>${labels().map((x,i)=>`<th>${h(relative&&i===0?t('來源 BOM','BOM nguồn'):i===1&&relative?t('相對層級','Cấp tương đối'):x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr data-row="${h(r.id)}">${D.fields.map(f=>`<td>${editing&&D.editableFields.includes(f)&&!(r.level>1&&D.numericFields.includes(f))?`<input aria-label="${h(labels()[D.fields.indexOf(f)]+' '+pathText(r))}" data-bw-field="${f}" data-root="${h(r.rootCode)}" data-id="${h(r.id)}" value="${h(r[f])}">`:h(r[f])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
 function comparison(){const count=batch?.changes.length||0;return `<section class="bw-compare"><header>${btn('compare',`${ui.compareOpen?'▾':'▸'} ${t('匯入比對','So sánh nhập')} · ${count}`)}<div>${btn('import',t('匯入Digiwin報表','Nhập báo cáo Digiwin'),!editable()||!permission('import')||!!edit)}${btn('export-all',t('匯出全部','Xuất tất cả'),!window.hasPermission?.('master.export'))}${btn('export-root',t('匯出目前主件','Xuất SKU gốc'),!ui.code||!window.hasPermission?.('master.export'))}<input type="file" id="bw-file" accept=".xlsx,.xls" hidden></div></header><div ${ui.compareOpen?'':'hidden'}>${batch?`<p>${h(batch.file)} · ${count} ${t('項差異；套用後仍須儲存草稿。','khác biệt; lưu bản nháp sau khi áp dụng.')}</p>${count?btn('accept-all',t('全部採用報表','Nhận tất cả'))+btn('keep-all',t('全部保留原值','Giữ tất cả')):''}${batch.changes.map((c,i)=>c.kind==='structure'?`<article class="bw-change"><header><b>${h(c.root)} · ${t('結構變更（整組）','Thay đổi cấu trúc (cả nhóm)')}</b>${decision(i,c,false)}</header><details><summary>${t('原有資料','Dữ liệu cũ')} · ${c.before.length}</summary>${table(c.before)}</details><details open><summary>${t('合併後資料（保留缺列）','Dữ liệu sau khi gộp (giữ dòng thiếu)')} · ${c.after.length}</summary>${table(c.after)}</details></article>`:fieldChange(c,i)).join('')}${btn('apply-import',t('套用至編輯區','Áp dụng vào vùng sửa'),!editable())}${btn('cancel-import',t('放棄本次匯入','Bỏ lần nhập này'))}`:`<p>${t('上傳原始 Digiwin Excel，先比對，再套用及儲存。','Tải Excel Digiwin gốc, so sánh rồi áp dụng và lưu.')}</p>`}</div></section>`;}
 function decision(i,c,allowEdit){return `<select aria-label="${t('差異處理','Xử lý khác biệt')} ${i+1}" data-decision="${i}">${[['keep',t('保留原值','Giữ giá trị cũ')],['accept',t('採用報表','Nhận báo cáo')],...(allowEdit?[['edit',t('自行修改','Tự sửa')]]:[])].map(([v,label])=>`<option value="${v}" ${c.decision===v?'selected':''}>${h(label)}</option>`).join('')}</select>${c.decision==='edit'?`<input data-decision-value="${i}" aria-label="${h(t('修改值','Giá trị sửa'))}" value="${h(c.value??c.after)}">`:''}`;}
 function fieldChange(c,i){const row=batch.incoming[c.root].find(r=>r.id===c.id),old=batch.base[c.root].find(r=>r.id===c.id);return `<article class="bw-change"><header><b>${h(pathText(row))}</b>${decision(i,c,true)}${btn('accept-row:'+i,t('本列全部採用','Nhận cả dòng'))}${btn('keep-row:'+i,t('本列全部保留','Giữ cả dòng'))}</header><div class="bw-table"><table><thead><tr>${labels().map(v=>`<th>${h(v)}</th>`).join('')}</tr></thead><tbody><tr>${D.fields.map(f=>`<td class="${f===c.field?'bw-difference':''}">${f===c.field?`<small>${t('原值','Cũ')}: ${h(old[f])}</small><strong>${t('報表','Mới')}: ${h(row[f])}</strong>`:h(row[f])}</td>`).join('')}</tr></tbody></table></div></article>`;}
 function forest(){const roots=index().forest(ui.code),nodes=[],edges=[],bands=[];let offset=24,width=700;
  for(const [ri,{root,rows}]of roots.entries()){const children=new Map();for(const r of rows){if(!children.has(r.parentId))children.set(r.parentId,[]);children.get(r.parentId).push(r);}let leaf=0;const positions=new Map();
   const place=r=>{const kids=children.get(r.id)||[],ys=kids.map(place),y=ys.length?(ys[0]+ys.at(-1))/2:offset+(leaf++)*78;positions.set(r.id,{x:160+r.level*244,y});return y;};place(rows[0]);const height=Math.max(1,leaf)*78+16;
   bands.push(`<rect x="0" y="${offset-16}" width="100%" height="${height}" fill="${ri%2?'#f2f5f9':'#fff'}"/><text x="12" y="${offset+10}" fill="#24364b" font-size="13">${h(root)}</text>`);
   const matched=new Set(rows.filter(r=>(r.level?r.itemCode:r.rootCode)===ui.code).map(r=>r.id));const related=new Set();for(const id of matched){let at=index().byId.get(id);while(at?.parentId){related.add(at.id);at=index().byId.get(at.parentId);}}
   for(const r of rows){const p=positions.get(r.id),isMatch=matched.has(r.id);width=Math.max(width,p.x+248);if(r.parentId){const prev=positions.get(r.parentId);edges.push(`<path d="M${prev.x+224},${prev.y+35} H${p.x-18} V${p.y+35} H${p.x}" fill="none" stroke="${related.has(r.id)?'#2563a6':'#bcc7d5'}" stroke-width="${related.has(r.id)?3:1.3}"/>`);}
    nodes.push(`<foreignObject x="${p.x}" y="${p.y}" width="230" height="76"><button xmlns="http://www.w3.org/1999/xhtml" class="bw-node ${isMatch?'bw-match':''} ${ui.position===r.id?'bw-position':''}" data-position="${h(r.id)}" title="${h(pathText(r)+' · '+r.itemName+' · '+r.specification)}"><code>${isMatch?'✓ ':''}${h(r.level?r.itemCode:r.rootCode)}</code><span>${h(r.itemName)}</span>${r.level<=1?`<small>${t('用量','Lượng')}: ${h(r.quantity)} · ${t('分母','Mẫu số')}: ${h(r.denominator)}</small>`:''}</button></foreignObject>`);
   }offset+=height+24;
  }
  return `<div class="bw-tree-tools">${btn('fit',t('適應畫面','Vừa khung'))}${btn('zoom-out','−')}${btn('zoom-in','＋')}${btn('locate',t('定位查詢項','Định vị mục tìm'))}<span>${Math.round(ui.zoom*100)}% · ${roots.length} ${t('個主件','SKU gốc')}</span></div><div class="bw-canvas" tabindex="0" aria-label="${h(t('BOM 關聯全樹，可拖曳或捲動','Cây BOM, kéo hoặc cuộn'))}"><svg width="${width*ui.zoom}" height="${Math.max(offset,200)*ui.zoom}" viewBox="0 0 ${width} ${Math.max(offset,200)}" data-width="${width}" data-height="${Math.max(offset,200)}">${bands.join('')}${edges.join('')}${nodes.join('')}</svg></div>`;
 }
 function detail(){if(!ui.code)return `<p>${t('請先匯入並選取品號。','Hãy nhập và chọn mã.')}</p>`;const idx=index(),rows=selectedRows();return `<header class="bw-selected"><div><code>${h(ui.code)}</code><h3>${h(idx.occurrences(ui.code)[0]?.itemName||'')}</h3></div>${ui.position?btn('all-positions',t('全部使用位置','Tất cả vị trí')):''}</header><nav class="bw-tabs">${[['parents',t('上階／使用位置','Cấp trên / vị trí')],['children',t('下階組成','Thành phần cấp dưới')],['forest',t('關聯全樹','Toàn bộ cây liên quan')],...(!historicalDisplay()?[['edit',t('修改 BOM','Sửa BOM')]]:[])].map(([id,label])=>`<button type="button" data-tab="${id}" aria-pressed="${ui.tab===id}" class="${ui.tab===id?'selected':''}">${ui.tab===id?'✓ ':''}${h(label)}</button>`).join('')}</nav>${ui.tab==='forest'?forest():ui.tab==='parents'?idx.parents(ui.code).map(({row,parent})=>`<article class="bw-position-card"><b>${h(pathText(row))}</b><p>${h(parent.itemCode||parent.rootCode)} · ${h(parent.itemName)}</p></article>`).join('')||`<p>${t('此主件沒有上階。','SKU gốc không có cấp trên.')}</p>`:ui.tab==='children'?idx.children(ui.code).map(g=>`<article class="bw-position-card"><p>${h(ui.code)+' · '+h(idx.occurrences(ui.code)[0]?.itemName||'')+' · '+g.positions.length+' '+t('使用位置','vị trí')}</p>${g.rows.length?table(g.rows.map(r=>({...r,levelLabel:String(r.level-g.positions[0].level)})),false,true):t('無下階組成','Không có thành phần cấp dưới')}</article>`).join(''):`<p>${h(ui.position?pathText(rows[0]):t('同料號的全部位置，各位置分別修改。','Tất cả vị trí cùng mã; sửa riêng từng vị trí.'))}</p>${edit?btn('finish',t('完成修改','Hoàn tất sửa'))+btn('discard',t('放棄修改','Bỏ sửa')):btn('edit',t('修改文字／數字','Sửa chữ / số'),!editable())}<p>${t('完成修改後仍須按上方儲存草稿；原始 L2 以上不使用三個數值欄。','Sau khi hoàn tất, lưu bản nháp ở trên; cấp gốc L2 trở lên không dùng ba cột số.')}</p>${table(rows,!historicalDisplay()&&!!edit)}`}`;}
 function resultsHTML(results){return results.map(r=>`<button data-code="${h(r.code)}" aria-pressed="${ui.code===r.code}" class="${ui.code===r.code?'selected':''}"><code>${ui.code===r.code?'✓ ':''}${h(r.code)}</code><b>${h(r.name)}</b><small>${r.roots} ${t('主件','SKU gốc')} · ${r.count} ${t('位置','vị trí')} · L${r.levels.join(', L')}</small></button>`).join('');}
 function approvedContentHTML(){const view=displayState(),rows=index().search(ui.query);if(!ui.code||!index().occurrences(ui.code).length){ui.code=rows[0]?.code||'';ui.position='';}if(ui.tab==='edit')ui.tab='forest';if(ui.position&&!index().byId.has(ui.position))ui.position='';const title=view.kind==='approved'?t('已核准版本 · 唯讀','Phiên bản đã duyệt · chỉ xem')+' · V'+view.version.number:view.kind==='loading'?t('載入所選版本…','Đang tải phiên bản đã chọn…'):t('所選版本目前無法查看','Không thể xem phiên bản đã chọn');return `<section class="bw-workspace" data-i18n-skip="true"><header class="bw-version"><h2>${h(title)}</h2></header>${view.error?`<p class="bw-error" role="alert">${h(view.error)}</p>`:''}${view.kind==='approved'?`<p class="bw-status">${Object.keys(visibleBom()).length} ${t('主件','SKU gốc')} · ${Object.values(visibleBom()).flat().length} ${t('列','dòng')}</p><label class="bw-search">${t('搜尋編碼、品名、規格','Tìm mã, tên, quy cách')}<input type="search" id="bw-query" value="${h(ui.query)}" autocomplete="off"></label>${btn('clear',t('清除搜尋','Xóa tìm kiếm'))}<div class="bw-results">${resultsHTML(rows)}</div><section class="bw-detail">${detail()}</section><details class="bw-references"><summary>${t('既有製程引用待確認','Liên kết quy trình cần xác nhận')} · ${visibleReferences().length}</summary>${visibleReferences().map(i=>`<p>${h(i.root)} · ${h(i.reference)} · ${h(referenceStatus(i.status))}</p>`).join('')}</details>`:''}</section>`;}
 function contentHTML(){if(historicalDisplay())return approvedContentHTML();if(ownerQuarantined||actor&&actor!==window.ProcessSync?.identity?.id)return `<section class="bw-workspace"><p role="alert">${h(t('未送輸入已放棄；原操作紀錄保留，不會移交或重送。請重新開啟。','Đầu vào chưa gửi đã bỏ; giữ biên nhận gốc, không chuyển hoặc gửi lại. Hãy mở lại.'))}</p></section>`;const results=index().search(ui.query);if(!ui.code||!index().occurrences(ui.code).length){ui.code=results[0]?.code||'';ui.position='';}if(ui.position&&!index().byId.has(ui.position))ui.position='';return `<section class="bw-workspace" data-i18n-skip="true"><header class="bw-version">${btn('begin',t('開始修改草稿','Bắt đầu sửa bản nháp'),!permission('edit')||!!flow()?.pendingId||version()?.status==='draft')}${btn('save',t('儲存草稿','Lưu bản nháp'),!editable()||busy)}${btn('submit',t('送出審核','Gửi duyệt'),!editable()||!flow()?.saved||busy||!!pending.length||!!edit||!!batch||!!error)}${flow()?.pendingId?btn('withdraw',t('撤回送審','Rút hồ sơ'),!permission('withdraw')):''}</header><p class="bw-status">${pending.length||editedFieldsChanged()||saveCommand?t('尚未儲存','Chưa lưu'):t('已載入伺服器資料','Đã tải dữ liệu máy chủ')} · ${Object.keys(editor).length} ${t('主件','SKU gốc')} · ${Object.values(editor).flat().length} ${t('列','dòng')}</p><div class="bw-error" role="alert">${h(error)}${error?btn('retry',t('查詢結果／重試','Kiểm tra / thử lại')):''}</div><section class="bw-local-recovery"><p data-bw-local-status role="status"></p>${btn('receipt-open',t('查詢未確認操作','Tra thao tác chưa xác nhận'),busy)}${recoveryFlight?.cleanup||recoveryFlight?.preparationOnly?btn('local-finalize',t('完成已拒絕操作清理','Hoàn tất dọn thao tác bị từ chối'),busy):''}<div data-bw-local-list></div></section>${comparison()}<label class="bw-search">${t('搜尋編碼、品名、規格','Tìm mã, tên, quy cách')}<input type="search" id="bw-query" value="${h(ui.query)}" autocomplete="off"></label>${btn('clear',t('清除搜尋','Xóa tìm kiếm'))}<div class="bw-results">${resultsHTML(results)}</div><section class="bw-detail">${detail()}</section><details class="bw-references"><summary>${t('既有製程引用待確認','Liên kết quy trình cần xác nhận')} · ${flow()?.working.referenceIssues?.length||0}</summary>${(flow()?.working.referenceIssues||[]).map(i=>`<p><b>${h(i.root)} · ${h(i.reference)}</b> · ${h(referenceStatus(i.status))}<small>${h(i.path)} · ${h(i.operationId)}</small></p>`).join('')}</details></section>`;}
 function remember(){const canvas=document.querySelector('.bw-canvas');if(canvas){ui.left=canvas.scrollLeft;ui.top=canvas.scrollTop;}}
 function paint(rememberCurrent=true){cachedIndex=null;const host=document.querySelector('#data-content');if(!host?.querySelector('.bw-workspace'))return;if(rememberCurrent)remember();const focused=document.activeElement,focus=focused?.matches?.('[data-bw-field]')?{field:focused.dataset.bwField,root:focused.dataset.root,id:focused.dataset.id,start:focused.selectionStart,end:focused.selectionEnd,direction:focused.selectionDirection}:null;const restore=window.VersionDraftUI?.preserveView(host);host.innerHTML=contentHTML();if(ownerQuarantined||actor!==window.ProcessSync?.identity?.id)return;bind();if(!historicalDisplay())paintRecovery();window.VersionDraftUI?.mount(host,{header:'.bw-version',module:'BOM',scope:t('BOM 全庫','Toàn bộ BOM'),version:version(),versions:control?.versions||[],active:active(),flow:flow()?{...flow(),working:{...flow().working,bom:editor}}:null,busy,historyClient:()=>client,renderHistory,historyCurrent:captureHistoryGuard(),actions:{begin:'[data-bw="begin"]',save:'[data-bw="save"]',submit:'[data-bw="submit"]',withdraw:'[data-bw="withdraw"]'},missing:'.bw-references',checked:{errors:!!control,missing:!!control},failed:!!error||!!client?.hasUnknown()||!!client?.hasSyncFailures?.(),rejected:lastErrorCode==='COMMAND_TOO_LARGE'&&!client?.hasUnknown(),localUnsaved:hasUnsavedChanges(),review:()=>window.MasterReview.open('BOM',flow()?.pendingId)});restore?.();if(focus){const input=[...host.querySelectorAll('[data-bw-field]')].find(node=>node.dataset.bwField===focus.field&&node.dataset.root===focus.root&&node.dataset.id===focus.id);if(input){input.focus({preventScroll:true});if(Number.isInteger(focus.start)&&Number.isInteger(focus.end))input.setSelectionRange(focus.start,focus.end,focus.direction);}}const canvas=host.querySelector('.bw-canvas');if(canvas){canvas.scrollLeft=ui.left;canvas.scrollTop=ui.top;}}
 async function importFile(file){assertCurrentDisplay();if(!file)return;if(!editable()||!permission('import'))throw Error('FORBIDDEN');if(file.size>25*1024*1024)throw Error('BOM_FILE_TOO_LARGE');if(batch&&!confirm(t('取代尚未套用的匯入比對？','Thay lần so sánh chưa áp dụng?')))return;const owned=workspaceOwner(),before=editor,previous=batch,revision=localRevision,bytes=await file.arrayBuffer();if(!owned()||before!==editor||previous!==batch||revision!==localRevision)throw Error('RECOVERY_CONTEXT_CHANGED');const book=XLSX.read(bytes,{type:'array'}),sheets=D.workbookMatrices(XLSX,book),incoming=D.parseMatrices(sheets,{file:file.name});batch={...D.compare(editor,incoming),sheets,file:file.name};ui.compareOpen=true;changedLocal();}
 function exportFile(all){const idx=index(),root=ui.position?idx.byId.get(ui.position)?.rootCode:idx.occurrences(ui.code)[0]?.rootCode;const shown=visibleBom(),bom=all?shown:root?{[root]:shown[root]}:{};const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(D.exportRows(bom)),'BOM');XLSX.writeFile(book,`BOM_${all?'ALL':root}.xlsx`);}

 function bind(){const host=document.querySelector('.bw-workspace');if(!host||ownerQuarantined||actor!==window.ProcessSync?.identity?.id)return;
  host.querySelectorAll('[data-bw]').forEach(b=>b.onclick=b.dataset.bw==='import'?()=>host.querySelector('#bw-file').click():b.dataset.bw==='receipt-open'?()=>openRecovery().catch(e=>{recoveryNotice=errorText(e);paintRecovery();}):()=>run(async()=>{const action=b.dataset.bw;if(historicalDisplay()&&!['clear','all-positions','fit','zoom-in','zoom-out','locate'].includes(action))throw Error('BOM_READONLY_VERSION');
   if(action==='begin'){control=(await transport().begin()).control;await read();}
   else if(action==='save')await save();
   else if(action==='submit'){if(pending.length||edit||batch||error)throw Error(t('請先儲存所有修改再送審。','Lưu mọi thay đổi trước khi gửi duyệt.'));const f=flow(),submission=window.captureSharedDraftSubmission(f),generation=f.generation,owner=window.ProcessSync?.identity,c=client;const reason=await window.VersionDraftUI.confirmSubmit('',t('BOM 全庫','Toàn bộ BOM'),{savedVersion:{id:submission.savedId,revision:submission.expectedRevision,at:f.saved.at,actor:f.saved.actor?.name}});if(reason!==null){if(owner!==window.ProcessSync?.identity||c!==client)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');if(pending.length||edit||batch||saveCommand||recoveryFlight||client.hasUnknown())throw Error('UNSAVED_CHANGES_SAVE_REQUIRED');if(flow()?.generation!==generation||flow()?.revision!==submission.expectedRevision)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');await command('submit',{...submission,reason});}}
   else if(action==='withdraw'){const answer=await window.VersionDraftUI.confirmReview({action:'withdraw',scope:'BOM',selfReview:false});if(answer){await command('withdraw',{caseId:flow().pendingId,...answer});}}
   else if(action==='compare')ui.compareOpen=!ui.compareOpen;
   else if(action==='cancel-import'){batch=null;changedLocal();}
   else if(action==='accept-all'||action==='keep-all'){batch.changes.forEach(c=>c.decision=action==='accept-all'?'accept':'keep');changedLocal();}
   else if(action.startsWith('accept-row:')||action.startsWith('keep-row:')){const c=batch.changes[Number(action.split(':')[1])];batch.changes.filter(r=>r.id===c.id&&r.root===c.root).forEach(r=>r.decision=action.startsWith('accept')?'accept':'keep');changedLocal();}
   else if(action==='apply-import')await finishImport();
   else if(action.startsWith('export-')){if(!window.hasPermission?.('master.export'))throw Error('FORBIDDEN');exportFile(action==='export-all');}
   else if(action==='clear'){if(selectionAllowed())ui.query='';}
   else if(action==='edit'){prepareRecovery();edit={rows:copy(selectedRows())};}
   else if(action==='finish')finishEdit();
   else if(action==='discard'){if(!pending.length&&!batch)discardOwnRecovery();for(const old of edit.rows){const i=editor[old.rootCode].findIndex(r=>r.id===old.id);editor[old.rootCode][i]=old;}edit=null;changedLocal();}
   else if(action==='all-positions'){if(selectionAllowed())ui.position='';}
   else if(action==='retry'){if(recoveryFlight?.preparationOnly)finalizeRejection();else if(recoveryFlight)await settleRecord(recoverySession.key);else{if(client.hasUnknown())await client.resolveUnknown();await read();}}
   else if(action==='receipt-open')await openRecovery();
   else if(action==='local-open')await restoreRecord();
   else if(action==='local-discard')await discardRecord();
   else if(action==='local-rebase')await reconcileLocal(value=>confirm(t('核對最新值後保留自己的本機修改？仍須另按儲存。','Đối chiếu giá trị mới và giữ sửa cục bộ? Vẫn cần bấm Lưu.')+'\n'+JSON.stringify(value,null,2)));
   else if(action==='local-finalize')finalizeRejection();
   else if(action==='fit'){const svg=host.querySelector('.bw-canvas svg'),canvas=svg.parentElement;ui.zoom=Math.max(.15,Math.min(1,canvas.clientWidth/Number(svg.dataset.width)));canvas.scrollLeft=0;canvas.scrollTop=0;ui.left=0;ui.top=0;}
   else if(action==='zoom-in'||action==='zoom-out')ui.zoom=Math.max(.15,Math.min(2,ui.zoom+(action==='zoom-in'?.1:-.1)));
   else if(action==='locate'){host.querySelector('.bw-match')?.scrollIntoView({block:'nearest',inline:'center'});remember();}
  }));
  const excelContext=()=>JSON.stringify([ui.code,ui.position,ui.tab,version()?.id]);
  for(const b of host.querySelectorAll('[data-bw=export-all],[data-bw=export-root]'))if(window.ProcessSpreadsheet)b.onclick=window.ProcessSpreadsheet.wrap('bom-export',b.onclick,excelContext);
  const fileInput=host.querySelector('#bw-file');if(fileInput)fileInput.onchange=e=>{const file=e.target.files[0];e.target.value='';return run(()=>importFile(file));};
  if(window.ProcessSpreadsheet&&fileInput)fileInput.onchange=window.ProcessSpreadsheet.wrap('bom-import',fileInput.onchange,excelContext);
  const query=host.querySelector('#bw-query');if(!query)return;query.readOnly=!historicalDisplay()&&!!edit;
  query.oninput=e=>{if(!e.isComposing)updateSearch(e.target);};
  query.oncompositionend=e=>updateSearch(e.target);
  host.querySelectorAll('[data-code]').forEach(b=>b.onclick=()=>{if(selectionAllowed()){ui.code=b.dataset.code;ui.position='';paint();}});
  host.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(selectionAllowed()){ui.tab=b.dataset.tab;paint();}});
  host.querySelectorAll('[data-position]').forEach(b=>b.onclick=()=>{if(selectionAllowed()){ui.position=b.dataset.position;const row=index().byId.get(ui.position);ui.code=row.level?row.itemCode:row.rootCode;paint();}});
  host.querySelectorAll('[data-decision]').forEach(e=>e.onchange=()=>{if(historicalDisplay())return;const c=batch.changes[Number(e.dataset.decision)];c.decision=e.value;if(e.value==='edit')c.value??=c.after;changedLocal();paint();});
  host.querySelectorAll('[data-decision-value]').forEach(e=>e.oninput=()=>{if(historicalDisplay())return;batch.changes[Number(e.dataset.decisionValue)].value=e.value;changedLocal();});
  host.querySelectorAll('[data-bw-field]').forEach(e=>e.oninput=()=>{if(historicalDisplay())return;inputField(e.dataset.root,e.dataset.id,e.dataset.bwField,e.value);window.VersionDraftUI?.updateSaved(document.querySelector('#data-content'),{...flow(),working:{...flow().working,bom:editor}},hasUnsavedChanges());});
  const canvas=host.querySelector('.bw-canvas');if(canvas){canvas.onscroll=remember;let drag;canvas.onpointerdown=e=>{const rect=canvas.getBoundingClientRect();if(e.pointerType==='touch'||e.button!==0||e.target.closest('button')||e.clientX>=rect.left+canvas.clientLeft+canvas.clientWidth||e.clientY>=rect.top+canvas.clientTop+canvas.clientHeight)return;drag={x:e.clientX,y:e.clientY,left:canvas.scrollLeft,top:canvas.scrollTop};canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(drag){canvas.scrollLeft=drag.left+drag.x-e.clientX;canvas.scrollTop=drag.top+drag.y-e.clientY;}};canvas.onpointerup=canvas.onpointercancel=()=>drag=null;}
 }
 function renderReview(){window.dispatchEvent(new CustomEvent('bom-review-updated'));}
 function unknownReady(){
  if(busy||client?.legacyRecoveryUnsupported?.()||recoveryFlight?.cleanup||recoveryFlight?.preparationOnly)return false;
  if(!recoveryFlight)return true;
  const preview=recoverySession?.preview(recoverySession.key);
  return !!preview?.ok&&preview.kind==='unknown'&&preview.receipt.operationId===recoveryFlight.command.operationId&&preview.receipt.generation===recoveryFlight.command.generation;
 }
 function abandonLocal(){
  if(client?.hasUnknown()||recoveryFlight)throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');
  discardOwnRecovery();pending=[];batch=null;edit=null;saveCommand=null;localBase=null;editor=copy(flow()?.working.bom||active()?.snapshot.bom||{});error='';lastErrorCode='';cachedIndex=null;paint();
 }
 function abandonUnknown(){
  if(!unknownReady())throw Error('UNKNOWN_OPERATION_CHECK_REQUIRED');
  // Preserve only the original operation and receipt helper. Unsent later input
  // never becomes a hidden recovery buffer while the destination changes.
  retainOperation();dropUnsent();departureRetained=true;
 }
 let moduleDeparture;
 window.BOMWorkspace={
  approvedView:{renderHistory,getViewState:bomViewState,historyCurrent:captureHistoryGuard},
  navigation:{get departure(){return moduleDeparture ||= Object.assign(window.VersionDraftUI.createDeparture({
   root:()=>document.querySelector('#data-content'),flow,sharedDirty:()=>false,sharedOwned:()=>false,ownsRuntimeLocal:()=>true,context:()=>[actor,flow()?.generation,permission('save'),permission('edit')],
   current:()=>!ownerQuarantined&&transportOwner?.()===true&&actor===window.ProcessSync?.identity?.id,busy:()=>busy&&!loading,unknown:()=>!!recoveryFlight||client?.hasUnknown()||client?.legacyRecoveryUnsupported?.(),failed:()=>client?.hasSyncFailures?.(),
   local:()=>!departureRetained&&(manualLocal()||!!batch||!!saveCommand&&!recoveryFlight),unknownTransports:()=>[client],unknownReady,discardUnknown:abandonUnknown,localSave:()=>!unappliedImport(),
   localReason:()=>unappliedImport()?t('匯入比對尚未套用；請留頁按「套用至編輯區」或放棄本次匯入，不會暗中套用。','So sánh nhập chưa áp dụng; ở lại chọn Áp dụng vào vùng sửa hoặc bỏ lần nhập, không tự áp dụng.'):t('BOM 輸入僅在本機；儲存會依原流程提交編輯區並固定版本，不會套用匯入比對。','BOM chỉ ở máy này; Lưu gửi vùng sửa và cố định phiên bản, không tự áp dụng so sánh nhập.'),
   canSave:()=>permission('save')&&(!hasUnsavedChanges()||permission('edit')),canDiscard:()=>permission('edit'),
   async save(){let result;await run(async()=>{result=await save();});return result;},
   discard:abandonLocal,
  }),{autoAbandon:true,allowUnload:()=>!busy&&unknownReady()});},requiresSave:()=>!!document.querySelector('.bw-workspace')&&(hasUnsavedChanges()||window.sharedDraftNeedsSave?.(flow())),canSaveForDeparture:()=>!busy&&!recoveryFlight&&!unappliedImport()&&!client?.hasUnknown()&&!client?.hasSyncFailures?.(),saveForDeparture:()=>run(save),canLeave:()=>!(busy&&!loading)&&!hasUnsavedChanges(),error:()=>error?Error(error):null,reset(){resetApprovedDisplay();localBase=null;localBaseVersion=null;retainOperation();recoverySession?.close();recoverySession=null;recoveryOwner=null;recoveryFlight=null;recoveryVerified=null;control=null;editor={};pending=[];batch=null;edit=null;saveCommand=null;saveFlight=null;actor='';client=null;ownerQuarantined=false;departureRetained=false;fullRevision=0;recoveryMount++;localRevision++;transportOwner=null;runSequence++;readEpoch++;reviewEpoch++;loading=false;busy=false;reviewState=null;reviewRevision=null;reviewLoading=null;cachedIndex=null;dirtyCache=null;error='';initialReady=Promise.resolve();}},
  readyForReview:()=>reviewLoading||Promise.resolve(),
  pendingCount:()=>!ownerQuarantined&&transportOwner?.()===true&&actor===window.ProcessSync?.identity?.id&&permission('view')!==false&&(reviewState?reviewState.workflow?.pendingId:flow()?.pendingId)?1:0,
  reviewError:()=>error,
  reviewPermission:action=>!ownerQuarantined&&transportOwner?.()===true&&actor===window.ProcessSync?.identity?.id&&permission(action),
  reviewItems:()=>!ownerQuarantined&&transportOwner?.()===true&&actor===window.ProcessSync?.identity?.id&&permission('view')!==false?(reviewState?.cases||flow()?.cases||[]).map(c=>({...c,scope:'BOM',fixed:true,number:(reviewState?.versions||control?.versions||[]).find(v=>v.id===c.id)?.number,updatedAt:c.result?.at||c.at})):[],
  async reviewCase(id){D ||= await import('./bom-domain.mjs?v=20261108-bom-structural-choice1');return transport().reviewCase(id);},
  async reviewAction(action,id){if(busy)throw Error('OPERATION_IN_PROGRESS');const owner=actor;busy=true;readEpoch++;try{if(!['approve','return','withdraw'].includes(action))throw Error('FORBIDDEN');await read();if(owner!==actor||owner!==window.ProcessSync?.identity?.id)throw Error('LOGIN_REQUIRED');if(!permission(action))throw Error('FORBIDDEN');const c=flow()?.cases.find(c=>c.id===id&&c.status==='pending');if(!c)throw Error('CASE_NOT_PENDING');const answer=await window.VersionDraftUI.confirmReview({action:action==='return'?'reject':action,scope:'BOM · '+id,selfReview:action!=='withdraw'&&c.actor.id===actor});if(!answer)return null;if(owner!==window.ProcessSync?.identity?.id)throw Error('LOGIN_REQUIRED');const result=await command(action,{caseId:id,...answer});return result;}finally{busy=false;paint();renderReview();}},
  reviewDiff(body){const a=body.before?.bom||{},b=body.content?.bom||{},out=[];const describe=row=>row?D.fields.map((field,i)=>labels()[i]+': '+(row[field]??'')).join(' · '):'—';for(const root of new Set([...Object.keys(a),...Object.keys(b)])){const old=new Map((a[root]||[]).map(r=>[r.id,r])),next=new Map((b[root]||[]).map(r=>[r.id,r]));for(const id of new Set([...old.keys(),...next.keys()])){const before=old.get(id),after=next.get(id);if(before&&after&&D.fields.every(f=>before[f]===after[f]))continue;const r=after||before;out.push({kind:'BOM',code:root+' · '+(r.itemCode||root)+' · '+(r.ordinal||'L0'),type:!before?'add':!after?'delete':'edit',before:describe(before),after:describe(after)});}}return out;},
  async loadReview({forRender=false}={}){const c=transport();if(reviewLoading)return reviewLoading;if(busy)return;const sync=window.ProcessSync;if(forRender&&reviewState&&!error&&!c.hasUnknown()&&!c.hasSyncFailures?.()&&reviewRenderOwner?.identity===sync?.identity&&sync?.isCurrentDelivery?.(reviewRenderOwner.delivery)&&reviewRenderOwner.revision===reviewRevision&&reviewRevision>=fullRevision)return;const renderOwner={identity:sync?.identity,delivery:sync?.captureDelivery?.()};const owner=actor,epoch=++reviewEpoch,access=()=>JSON.stringify(['view','history','approve','return','withdraw'].map(key=>c.permission(key))),beforeAccess=access();const task=Promise.resolve().then(async()=>{try{if(c.hasUnknown()&&!recoveryFlight)await c.resolveUnknown();const result=await c.reviewMetadata(reviewRevision);if(c!==client||owner!==window.ProcessSync?.identity?.id||epoch!==reviewEpoch||result.revision<fullRevision)return;const changed=!!result.review||beforeAccess!==access()||!!error;if(result.review){reviewState=result.review;reviewRevision=result.revision;}error='';reviewRenderOwner={...renderOwner,revision:reviewRevision};if(changed)renderReview();}catch(e){if(c===client&&owner===window.ProcessSync?.identity?.id&&epoch===reviewEpoch){error=errorText(e);renderReview();}throw e;}finally{if(reviewLoading===task)reviewLoading=null;}});reviewLoading=task;return task;}
 };
 const oldBind=bindDataInner;
 bomTable=()=>`<section class="bw-workspace" data-i18n-skip="true"><p>${h(t('正在載入 BOM…','Đang tải BOM…'))}</p></section>`;
 bindDataInner=function(tab){if(tab!=='bom')return oldBind(tab);if(loading)return;const delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>!delivery||window.ProcessSync.isCurrentDelivery(delivery);loading=true;initialReady=run(async()=>{D ||= await import('./bom-domain.mjs?v=20261108-bom-structural-choice1');if(owns())await read();}).finally(()=>{if(owns())loading=false;});};
 window.BOMWorkspace.readyForDestination=()=>initialReady;
 window.addEventListener('process-delivery-invalidated',()=>isolateOwnerInput());
 window.addEventListener('process-sync-status',()=>{if(actor&&!transportOwner?.())isolateOwnerInput();});
 window.addEventListener('process-delivery-invalidated',invalidateApprovedDisplay);
 window.addEventListener('process-sync-status',invalidateApprovedDisplay);
 window.addEventListener('pagehide',()=>{retainOperation();dropUnsent();departureRetained=true;recoveryMount++;runSequence++;readEpoch++;reviewEpoch++;});
 new MutationObserver(()=>{if(D&&document.querySelector('.bw-workspace'))paint();renderReview();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
})();

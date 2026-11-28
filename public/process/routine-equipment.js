(() => {
  const identityErrors={
    EQUIPMENT_ASSET_INVALID:['資產編號須為 2 至 40 個英文字母、數字或連字號。','Mã tài sản phải có 2–40 chữ cái, chữ số hoặc dấu gạch ngang.'],
    EQUIPMENT_PIECE_REQUIRED:['請填寫分件號。','Hãy nhập ký hiệu thiết bị.'],
    EQUIPMENT_PAIR_DUPLICATE:['此資產編號已有相同分件號。請核對兩個欄位並使用不同的組合。','Mã tài sản này đã có cùng ký hiệu thiết bị. Hãy kiểm tra cả hai ô và dùng một cặp khác.']
  };
  const displayDraftError = error => {
    const message=typeof error==='string'?error:error?.message||String(error??'');
    const code=Object.keys(identityErrors).find(key=>message.includes(key));
    return code?t(...identityErrors[code]):window.sharedDraftErrorMessage?.(error)??message;
  };
  const api = '/api/routine-equipment';
  const query = new URL(location.href).searchParams.get('manage') === '1' ? '?manage=1' : '';
  const endpoint = api + query;
  const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const clone = value => JSON.parse(JSON.stringify(value));
  const date = value => window.VersionDraftUI?.date(value) || '—';
  const lastEdit = version => [...(version?.history||[])].reverse().find(event=>!['submit','approve','reject','withdraw'].includes(event.action));
  const pendingPhotos = new Map();
  const photo = item => pendingPhotos.get(item?.id)?.url || (item?.photoHidden ? '' : item?.photoId ? `${api}/photo?id=${item.photoId}` : item?.photoSource?.webPath || '');
  let calibrationFacts={};
  const vietnamToday = () => {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()); }
    catch { return new Date().toISOString().slice(0, 10); }
  };
  const lang = () => {
    const tabLanguage = String(document.documentElement.lang || '').toLowerCase();
    if (tabLanguage === 'vi') return 'vi';
    if (tabLanguage === 'zh' || tabLanguage.startsWith('zh-')) return 'zh';
    return localStorage.getItem('processUILanguage') === 'vi' ? 'vi' : 'zh';
  };
  const t = (zh, vi) => lang() === 'vi' ? vi : zh;
  const norm = str => String(str || '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const naturalSort = (a, b) => {
    const codeA = String(a.assetCode || '');
    const codeB = String(b.assetCode || '');
    const cmp = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    const markA = Number(a.pieceMark) || 0;
    const markB = Number(b.pieceMark) || 0;
    if (markA !== markB) return markA - markB;
    return String(a.pieceMark || '').localeCompare(String(b.pieceMark || ''));
  };

  let host = null, control = null, revision = null, working = null, readUnavailable = false, controlActor = '';
  let historyDisplayEpoch=0,approvedHistoryView=null,historyUploads=0;
  const historyAllowsMutation=()=>!approvedHistoryView?.blocked;
  const assertCurrentDisplay=()=>{if(!historyAllowsMutation())throw Error('APPROVED_HISTORY_READ_ONLY');};
  const guardWorking=(node,callback)=>{const epoch=historyDisplayEpoch,page=host;return function(...args){if(epoch!==historyDisplayEpoch||!historyAllowsMutation()||page!==host||(!node?.isConnected&&args[0]?.type!=='close'))return;const result=callback.apply(this,args);if(result&&typeof result.finally==='function')return result.finally(()=>approvedHistoryView?.refreshControls?.());approvedHistoryView?.refreshControls?.();return result;};};
  let selectedVersionId = '', selectedCategory = '', selectedSubcategory = '', selectedGroup = '';
  let selectedEquipmentId = '', editingEquipmentId = '', search = '', busy = false, message = '', reviewHost = null;
  let referenceAction=null;
  let equipmentPage = 1, submitProblems = [], openErrors = false, composing = false;
  let equipmentEditRequest = 0;
  let problemSnapshot = null, formPendingPhoto = null;
  let nodeDialog = null, viewDialog = null, formSnapshot = null, addingEquipment = false, newEquipmentForm = null, newEquipmentOwner = null, equipmentReadAttempt = null, transferDialog = null;
  const equipmentRefCache = new Map();
  const equipmentRefReads = new Map();
  let sharedClient=null,sharedActor='',syncBase=null,syncGeneration=null,inputOwner=null;let readIntent=0,localBeginReceipt=null,pendingSaveBatch=null;
  function hasLocalDraftInput(){return !!(editingEquipmentId||nodeDialog||addingEquipment||pendingPhotos.size||working&&syncBase&&snapshotChanges(syncBase,working).patches.length);}
  function inputPrincipalCurrent(){return !!inputOwner&&inputOwner.actor===identity()&&inputOwner.id===identity()?.id&&Number.isSafeInteger(inputOwner.epoch)&&inputOwner.epoch>=0&&inputOwner.epoch===window.ProcessSync?.identityGeneration?.();}
  function inputTargetCurrent(){return !!inputOwner&&inputOwner.page===host&&inputOwner.tab===host?.dataset?.activeTab&&inputOwner.connected===host?.isConnected&&inputOwner.versionId===selectedVersionId&&inputOwner.generation===control?.workflow?.generation;}
  function inputOwnerCurrent(){return inputPrincipalCurrent()&&inputTargetCurrent()&&!window.ProcessSync?.requiresReload&&!!inputOwner.delivery&&window.ProcessSync?.isCurrentDelivery?.(inputOwner.delivery)===true;}
  function rememberInputOwner(delivery=window.ProcessSync?.captureDelivery?.()){inputOwner={actor:identity(),id:identity()?.id,epoch:window.ProcessSync?.identityGeneration?.(),delivery,page:host,tab:host?.dataset?.activeTab,connected:host?.isConnected,versionId:selectedVersionId,generation:control?.workflow?.generation};}
  function sharedTransport(){const id=identity()?.id;if(!id)throw Error('LOGIN_REQUIRED');if(!inputOwnerCurrent()&&hasLocalDraftInput())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');if(!inputOwner)rememberInputOwner();if(sharedActor!==id||sharedClient?.isBeginRuntimeCurrent?.()===false){sharedActor=id;sharedClient=window.createSharedDraftClient({endpoint:api+'/workflow?caseMetadata=1',durableBegin:true,equipmentLocalSave:true,allowUnknownDeparture:true,guardAccessResults:true,legacyArchive:true,conditionalState:true,actorId:id,headers,permissionGates:{create:'#routine-add,#routine-add-submit,[data-node-add]',edit:'#routine-add,#routine-begin,#routine-form-apply,#routine-add-submit,[data-equipment-edit],[data-node-add],[data-node-edit],#routine-dialog-confirm,[data-issue-result],[data-issue-resolve]',save:'#routine-save',submit:'#routine-submit',withdraw:'#routine-withdraw,[data-routine-review="withdraw"]',approve:'[data-routine-review="approve"]',return:'[data-routine-review="reject"]',history:'#routine-case-history',delete:'#routine-delete,[data-equipment-delete],[data-node-delete]'}});sharedClient.watchOperationOutcome?.(()=>updateEquipmentLocalStatus());}return sharedClient;}
  const identityFields = ['assetCode','pieceMark'];
  const identityLabel = value => String(value ?? '').trim().toUpperCase();
  function snapshotChanges(base,next){const patches=[],guards=[],fields={equipment:['assetCode','pieceMark','name','unit','spec','owner','enabled','calibrationMethod','calibrationCycle','customCycle','calibratedAt','expiresAt','notes','intakeDate','confirmed','photoId','photoHidden','groupId'],groups:['name','nameZh','nameVi','photoId','spec','notes','categoryId','subcategoryId'],categories:['name','photoId'],subcategories:['name','categoryId','photoId'],issues:['status','resolution']};
    for(const collection of Object.keys(fields)){
      const before=base[collection]||[],after=next[collection]||[];
      // Local lookup only: preserve first-match identity and the original small/legacy path.
      const indexed=before.length>=100&&after.length>=100&&before.every(row=>typeof row?.id==='string')&&after.every(row=>typeof row?.id==='string');
      const firstById=indexed?new Map():null,nextIds=indexed?new Set():null;
      if(indexed){for(const row of before)if(!firstById.has(row.id))firstById.set(row.id,row);for(const row of after)nextIds.add(row.id);}
      for(const old of before)if(indexed?!nextIds.has(old.id):!after.some(r=>r.id===old.id)){const path=[collection,{id:old.id}];patches.push({op:'remove',path});guards.push({path,value:old});}
      for(const row of after){const old=indexed?firstById.get(row.id):before.find(r=>r.id===row.id);if(!old){patches.push({op:'insert',path:[collection],value:row});continue;}
        for(const field of fields[collection])if(row[field]!==undefined&&JSON.stringify(row[field])!==JSON.stringify(old[field])&&!(row[field]===''&&old[field]==null)){const path=[collection,{id:row.id},field];patches.push({op:'set',path,value:row[field]});guards.push({path,value:old[field]});}
      }
    }
    for (const patch of patches) {
      if (patch.op !== 'set' || patch.path[0] !== 'equipment' || !['assetCode','pieceMark'].includes(patch.path[2])) continue;
      const id=patch.path[1].id, other=patch.path[2]==='assetCode'?'pieceMark':'assetCode';
      const path=['equipment',{id},other];
      if (!guards.some(g=>JSON.stringify(g.path)===JSON.stringify(path))) guards.push({path,value:base.equipment.find(row=>row.id===id)?.[other]});
    }
    const parent=(collection,id)=>{const row=base[collection]?.find(r=>r.id===id),path=[collection,{id}];if(row&&!guards.some(g=>JSON.stringify(g.path)===JSON.stringify(path)))guards.push({path,value:clone(row)});};
    for(const patch of patches){const key=patch.path[0];if(patch.op!=='insert'&&!(patch.op==='set'&&['groupId','categoryId','subcategoryId'].includes(patch.path[2])))continue;const row=patch.op==='insert'?patch.value:next[key]?.find(r=>r.id===patch.path[1]?.id);if(!row)continue;
      if(key==='equipment'&&(patch.op==='insert'||patch.path[2]==='groupId'))parent('groups',row.groupId);
      if(key==='groups'&&(patch.op==='insert'||['categoryId','subcategoryId'].includes(patch.path[2]))){parent('categories',row.categoryId);parent('subcategories',row.subcategoryId);}
      if(key==='subcategories'&&(patch.op==='insert'||patch.path[2]==='categoryId'))parent('categories',row.categoryId);
    }
    return{patches,guards};
  }
  function acknowledgeFormPhoto(id,entry,before,sent){
    if(formSnapshot?.id===id&&before&&sent&&formSnapshot.photoId===before.photoId&&formSnapshot.photoHidden===before.photoHidden){formSnapshot.photoId=sent.photoId;formSnapshot.photoHidden=sent.photoHidden;}
    if(formPendingPhoto===entry)formPendingPhoto=null;
    if(nodeDialog?.prior?.id===id&&nodeDialog.pendingPhoto===entry){nodeDialog.pendingPhoto=null;nodeDialog.photoId=sent?.photoId||'';}
  }
  const beginRecoveryKey = actorId => 'routine-equipment-begin-recovery:' + actorId;
  const beginRecoveryMessage = () => t('開始修改的結果尚未確認；目前內容已保留。請按「查詢原操作收據」唯讀核對，不要重送開始修改。', 'Chưa xác nhận kết quả bắt đầu sửa; giữ nội dung hiện tại. Chọn “Kiểm tra biên nhận gốc” để kiểm tra chỉ đọc; không gửi lại yêu cầu bắt đầu.');
  function readBeginRecovery(actorId = identity()?.id) {
    try {
      const raw = sessionStorage.getItem(beginRecoveryKey(actorId));
      if (raw === null) return null;
      const record = JSON.parse(raw);
      if (!record || typeof record !== 'object' || Array.isArray(record) || (record.schema !== 1 || record.actorId !== actorId || !(record.activeVersionId === null || typeof record.activeVersionId === 'string') || !(record.generation === null || typeof record.generation === 'string'))) throw Error('INVALID_BEGIN_RECOVERY');
      return record;
    } catch { throw Error(beginRecoveryMessage()); }
  }
  async function beginSharedDraft(client, writeOwner) {
    assertCurrentDisplay();
    if(readBeginRecovery())throw Error(beginRecoveryMessage()); // Never relabel legacy unidentified outcomes.
    const result=await client.begin();
    if(writeOwner&&!writeOwner())throw Error('ACCOUNT_OR_VIEW_CHANGED_REOPEN_REQUIRED');
    if(result?.operationKind!=='begin-v1'||!result.receipt)throw Error('INVALID_BEGIN_RECEIPT');
    localBeginReceipt=clone(result.receipt);syncGeneration ||= localBeginReceipt.generation;
    if(result.control?.workflow?.generation!==localBeginReceipt.generation){readUnavailable=true;throw Error('STALE_GENERATION');}
    return result;
  }
  function hasBeginRecovery() { try { return !!readBeginRecovery()||sharedClient?.hasUnknownBegin()===true; } catch { return true; } }
  async function enterExistingDraft() {
    if(busy||!routineTabIsActive())return;
    try{if(readBeginRecovery()){message=beginRecoveryMessage();render();return;}}catch{message=beginRecoveryMessage();render();return;}
    const client=sharedTransport(),owner=inputOwner,page=host,local=working,base=syncBase;
    busy=true;readIntent++;
    try{
      const result=await client.resolveUnknown();
      if(owner!==inputOwner||page!==host||!inputOwnerCurrent())throw Error('ACCOUNT_OR_VIEW_CHANGED_REOPEN_REQUIRED');
      if(result?.recoveryKind==='begin-v1'){
        localBeginReceipt ||= clone(result.receipt);
        if(!syncGeneration)syncGeneration=localBeginReceipt.generation;
        if(result.control?.workflow?.generation!==localBeginReceipt.generation){readUnavailable=true;throw Error('STALE_GENERATION');}
      }
      // Receipt lookup never sends the retained input. Keep its original comparison basis.
      await read(true);
      if(local){working=local;syncBase=base;}
      let recoveredContent;
      if (result?.equipmentCommand?.action === 'save') {
        const flow = control.workflow, receipt = result.receipt;
        const save = [flow.saved,...(flow.saves || [])].find(entry => entry?.id === receipt?.savedId);
        const inserts = result.equipmentCommand.patches.filter(patch => patch.op === 'insert');
        if (inserts.length && (flow.generation !== receipt?.generation || !save?.content ||
            !inserts.every(patch => confirmedEquipmentInsert(save.content,patch)))) {
          readUnavailable = true;
          throw Error('SYNC_CONFIRMATION_REQUIRED');
        }
        recoveredContent = save?.content;
      }
      if(result?.equipmentCommand?.action==='save'&&pendingSaveBatch){
        const batch=pendingSaveBatch,canonical=clone(batch.local);
        for(const patch of result.equipmentCommand.patches.filter(p=>p.op==='insert')){
          const key=patch.path[0],row=canonical[key].find(r=>r.id===patch.value.id),actual=recoveredContent?.[key]?.find(r=>r.id===patch.value.id),current=working?.[key].find(r=>r.id===patch.value.id),before=batch.sentInput[key].find(r=>r.id===patch.value.id);
          if(!row||!actual)throw Error('SYNC_CONFIRMATION_REQUIRED');
          for(const field of key==='categories'?['code']:key==='equipment'?['assetCode','pieceMark']:[]){row[field]=actual[field];if(current&&current[field]===before[field])current[field]=actual[field];}
        }
        if(batch.comparedSave)settleEquipmentBatch(batch,canonical);
        for(const [id,pin]of batch.sentPhotos){const current=pendingPhotos.get(id),find=data=>['equipment','categories','subcategories','groups'].flatMap(k=>data?.[k]||[]).find(row=>row.id===id);acknowledgeFormPhoto(id,pin.entry,find(batch.sentInput),find(canonical));if(current!==pin.entry)URL.revokeObjectURL(pin.url);if(current===pin.entry&&current.file===pin.file&&current.url===pin.url){for(const key of ['equipment','groups','categories','subcategories']){const row=working?.[key].find(r=>r.id===id),sent=canonical[key].find(r=>r.id===id);if(row&&sent)row.photoId=sent.photoId;}URL.revokeObjectURL(pin.url);pendingPhotos.delete(id);}}
        if(!batch.comparedSave)syncBase=canonical;pendingSaveBatch=null;localBeginReceipt=null;
      }
      else if(!local&&open()?.status==='draft'){working=snapshotOf(open());syncBase=clone(working);syncGeneration=control.workflow.generation;}
      selectedVersionId=open()?.id||selectedVersionId;readUnavailable=false;rememberInputOwner();
      message=t('已查原操作收據；請核對已存草稿，保留的本機修改不會自動重送。','Đã kiểm tra biên nhận gốc; đối chiếu bản nháp đã lưu. Không tự gửi lại thay đổi cục bộ.');
    }catch(error){
      message=error.message==='OPERATION_NOT_FOUND'
        ? t('尚未查到這次操作的收據。請稍後再查；在結果確認前，這次修改仍不能送審。','Chưa tìm thấy biên nhận của thao tác này. Hãy kiểm tra lại sau. Chỉ có thể gửi duyệt sau khi xác nhận kết quả.')
        : error.message;
    }finally{busy=false;render();}
  }
  // JSON object key order is not content; array positions, keys and values are.
  function equipmentContentEqual(a,b){
    if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
    if(Array.isArray(a)&&a.length!==b.length)return false;
    const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&equipmentContentEqual(a[key],b[key]));
  }
  // Insert ACKs may contain server allocation/defaults. Compare every field;
  // only the transformations in equipment-workflow/checkedSnapshot are allowed.
  function confirmedEquipmentInsert(snapshot,patch){try{
    const collection=patch.path[0],sent=patch.value,rows=snapshot?.[collection];
    const validRows=rows=>Array.isArray(rows)&&rows.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.id==='string'&&!!row.id);
    if(patch.path.length!==1||!sent||typeof sent.id!=='string'||!validRows(rows))return false;
    const matches=rows.filter(row=>row?.id===sent.id);if(matches.length!==1)return false;
    const actual=matches[0],same=equipmentContentEqual;
    if(collection==='subcategories')return same(actual,sent); // No canonical transformation.
    const allocated=(value,prefix='')=>{if(typeof value!=='string'||!value.startsWith(prefix))return false;const number=Number(value.slice(prefix.length));return Number.isSafeInteger(number)&&number>0&&value===prefix+String(number).padStart(2,'0');};
    const only=(row,keys)=>Object.keys(row).every(key=>keys.includes(key));
    const one=(kind,id)=>{const rows=snapshot?.[kind];if(typeof id!=='string'||!id||!validRows(rows))return null;const found=rows.filter(row=>row.id===id);return found.length===1?found[0]:null;};
    const parents=(categoryId,subcategoryId)=>{const category=one('categories',categoryId),sub=one('subcategories',subcategoryId);return category&&sub?.categoryId===categoryId&&[category.code,category.name,sub.name].every(value=>typeof value==='string'&&value.trim())?{categoryId,subcategoryId,categoryCode:category.code,category:category.name,subcategory:sub.name}:null;};
    let expected;
    if(collection==='categories'){
      if(!allocated(actual.code,'C')||rows.filter(row=>row?.code===actual.code).length!==1)return false;
      expected={...sent,code:actual.code};
    }else if(collection==='groups'){
      const fields=['id','name','nameZh','nameVi','categoryId','subcategoryId','categoryCode','category','subcategory','spec','sourceStatus','notes','photoId'];
      if(!only(sent,fields)||Object.values(sent).some(value=>value!==null&&typeof value!=='string'))return false;
      const derived=parents(sent.categoryId,sent.subcategoryId);if(!derived)return false;
      expected={id:sent.id,name:sent.name||sent.nameVi||sent.nameZh||sent.id,nameZh:sent.nameZh??'',nameVi:sent.nameVi??'',...derived,spec:sent.spec??'',sourceStatus:sent.sourceStatus??'',notes:sent.notes??'',photoId:sent.photoId||''};
    }else if(collection==='equipment'){
      const defaults={id:sent.id,assetCode:String(sent.assetCode||'').trim().toUpperCase(),pieceMark:actual.pieceMark,groupId:'',calibrationMethod:'none',calibrationCycle:'',customCycle:'',calibratedAt:'',expiresAt:'',intakeDate:'',name:'',quantity:1,unit:'個',owner:'',enabled:true,confirmed:false,spec:'',notes:'',photoId:'',photoHidden:false};
      const derivedFields=['categoryId','subcategoryId','categoryCode','category','subcategory'];
      if(!only(sent,[...Object.keys(defaults),...derivedFields,'sourceRow','effectiveAt'])||['sourceRow','effectiveAt'].some(key=>Object.hasOwn(sent,key)&&sent[key]!==null))return false;
      const markMatches = Object.hasOwn(sent,'pieceMark') ? typeof sent.pieceMark==='string' && !!sent.pieceMark.trim() && actual.pieceMark===sent.pieceMark.trim() : allocated(actual.pieceMark);
      if(!markMatches||rows.filter(row=>identityLabel(row?.assetCode)===defaults.assetCode&&identityLabel(row?.pieceMark)===identityLabel(actual.pieceMark)).length!==1)return false;
      const group=one('groups',sent.groupId),derived=group&&parents(group.categoryId,group.subcategoryId);if(!derived)return false;
      // checkedSnapshot's mutableFields copy is after its constructors: an
      // explicitly supplied null/empty value is not replaced with a default.
      expected={...defaults};for(const key of Object.keys(defaults))if(!['id','assetCode','pieceMark'].includes(key)&&Object.hasOwn(sent,key))expected[key]=sent[key];
      Object.assign(expected,derived);
    }else return false;
    return same(actual,expected);
  }catch{return false;}} // Malformed ACK validation must latch readUnavailable, never invite another POST.
  // Save compares only this captured RAM batch. Structural/source guards never
  // become ordinary Mine/Theirs choices, and the original base stays untouched.
  let equipmentSaveChoice = null, equipmentSaveComparison = null;
  function retireEquipmentSaveComparison(){
    const comparison=equipmentSaveComparison;
    if(!comparison||!comparison.current())return;
    // The comparison has not uploaded or dispatched. Invalidate only its private
    // attempt before departure inspects busy again; late GETs cannot adopt/send.
    equipmentSaveComparison=null;writeShared.attempt=null;busy=false;equipmentSaveChoice?.();
  }
  const equipmentSaveCollections = ['equipment','groups','categories','subcategories','issues'];
  function compareEquipmentSave(base,mine,latest,photos){
    for(const data of [base,mine,latest])for(const key of equipmentSaveCollections){
      const rows=data?.[key];if(!Array.isArray(rows)||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id)||new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('INVALID_EQUIPMENT_SNAPSHOT');
    }
    for(const [id]of photos){
      const count=data=>equipmentSaveCollections.filter(key=>key!=='issues').reduce((sum,key)=>sum+data[key].filter(row=>row.id===id).length,0);
      if(count(mine)!==1||count(base)>1||count(latest)>1)throw Error(t('照片目標不明：不同類型有相同識別；本次未上傳或存取，輸入仍保留。','Không xác định được đích ảnh: các loại khác nhau có cùng mã. Chưa tải ảnh hay lưu; dữ liệu nhập được giữ lại.'));
    }
    const original=snapshotChanges(base,mine),units=[],conflicts=[],photoRows=new Set(),identityRows=new Set();
    const photoKeys=key=>key==='equipment'?['photoId','photoHidden']:['photoId'];
    const labels={assetCode:['固定資產編號','Mã TSCĐ'],pieceMark:['分件號','Ký hiệu thiết bị'],name:['名稱','Tên'],nameZh:['中文名稱','Tên tiếng Trung'],nameVi:['越南文名稱','Tên tiếng Việt'],unit:['單位','Đơn vị'],spec:['規格','Quy cách'],owner:['保管人','Người giữ'],enabled:['啟用','Kích hoạt'],calibrationMethod:['校正方式','Cách hiệu chuẩn'],calibrationCycle:['校正週期','Chu kỳ hiệu chuẩn'],customCycle:['自訂週期','Chu kỳ tùy chỉnh'],calibratedAt:['校正日期','Ngày hiệu chuẩn'],expiresAt:['到期日期','Ngày hết hạn'],notes:['備註','Ghi chú'],intakeDate:['入庫日期','Ngày nhập kho'],confirmed:['來源確認','Xác nhận nguồn'],status:['狀態','Trạng thái'],resolution:['處理結果','Kết quả xử lý']};
    const values=(row,fields)=>fields.map(field=>row?.[field]??(field==='photoHidden'?false:''));
    const add=(key,id,fields,pending)=>{
      const before=base[key].find(row=>row.id===id),local=mine[key].find(row=>row.id===id),peer=latest[key].find(row=>row.id===id);
      if(!before||!local||!peer)throw Error('ENTITY_REMOVED_OR_AMBIGUOUS');
      const old=values(before,fields),next=values(local,fields),remote=values(peer,fields);
      const conflict=!equipmentContentEqual(old,remote)&&(!!pending||!equipmentContentEqual(next,remote));
      const unit={key,id,fields,pending,conflict};units.push(unit);
      const preview=(row,entry)=>({hidden:row.photoHidden===true,url:row.photoHidden?'':entry?.url||(row.photoId?api+'/photo?id='+encodeURIComponent(row.photoId):row.photoSource?.webPath||'')});
      if(conflict)conflicts.push({photo:fields.includes('photoId')?{mine:preview(local,pending),theirs:preview(peer)}:null,label:local.name||local.nameVi||local.assetCode||id,fields:fields.includes('photoId')?t('照片','Ảnh'):fields.map(field=>labels[field]?t(...labels[field]):field).join(' / '),mine:pending?t('新照片','Ảnh mới')+' · '+(pending.file.name||t('本機圖片','Ảnh cục bộ')):next,theirs:remote});
    };
    for(const patch of original.patches){
      if(patch.op!=='set'||['groupId','categoryId','subcategoryId'].includes(patch.path[2]))continue;
      const [key,entity,field]=patch.path;
      if(['photoId','photoHidden'].includes(field)){const token=key+':'+entity.id;if(photoRows.has(token))continue;photoRows.add(token);add(key,entity.id,photoKeys(key),photos.get(entity.id));}
      else if(key==='equipment' && identityFields.includes(field)){
        if(!identityRows.has(entity.id)){identityRows.add(entity.id);add(key,entity.id,identityFields);}
      } else add(key,entity.id,[field]);
    }
    for(const [id,pending]of photos){
      const key=equipmentSaveCollections.find(kind=>kind!=='issues'&&mine[kind].some(row=>row.id===id));if(!key)throw Error('ENTITY_REMOVED_OR_AMBIGUOUS');
      if(!base[key].some(row=>row.id===id))continue; // Insert still uses original parent/source guards.
      const token=key+':'+id;if(!photoRows.has(token)){photoRows.add(token);add(key,id,photoKeys(key),pending);}
    }
    return {conflicts,materialize(choice){
      if(!['mine','theirs'].includes(choice))throw Error('INVALID_EQUIPMENT_SAVE_CHOICE');
      const desired=clone(latest),patches=[],guards=[],chosenPhotos=new Map(photos),ordinary=new Set(units.flatMap(unit=>unit.fields.map(field=>JSON.stringify([unit.key,{id:unit.id},field]))));
      // Keep original structural commands AND whole-parent/row guards verbatim.
      for(const patch of original.patches)if(!ordinary.has(JSON.stringify(patch.path))){
        patches.push(clone(patch));const [key,entity,field]=patch.path;
        if(patch.op==='insert'){if(desired[key].some(row=>row.id===patch.value.id))throw Error('ENTITY_REMOVED_OR_AMBIGUOUS');desired[key].push(clone(patch.value));}
        else {const index=desired[key].findIndex(row=>row.id===entity.id);if(index<0)throw Error('ENTITY_REMOVED_OR_AMBIGUOUS');if(patch.op==='remove')desired[key].splice(index,1);else desired[key][index][field]=clone(patch.value);}
      }
      for(const guard of original.guards)if(!ordinary.has(JSON.stringify(guard.path)))guards.push(clone(guard));
      for(const unit of units){
        if(unit.conflict&&choice==='theirs'){if(unit.pending)chosenPhotos.delete(unit.id);continue;}
        const local=mine[unit.key].find(row=>row.id===unit.id),peer=latest[unit.key].find(row=>row.id===unit.id),row=desired[unit.key].find(row=>row.id===unit.id);
        for(const field of unit.fields){const value=local[field]??(field==='photoHidden'?false:''),path=[unit.key,{id:unit.id},field];row[field]=clone(value);
          if(!equipmentContentEqual(value,peer[field])||unit.pending){patches.push({op:'set',path,value:clone(value)});guards.push({path,value:peer[field]});} else if(unit.key==='equipment' && identityFields.includes(field)){guards.push({path,value:peer[field]});}
        }
      }
      const order=path=>{const index=original.patches.findIndex(patch=>equipmentContentEqual(patch.path,path));return index<0?original.patches.length:index;};
      patches.sort((a,b)=>order(a.path)-order(b.path));
      return {local:desired,patches,guards,chosenPhotos};
    }};
  }
  function chooseEquipmentSave(conflicts,current){
    return new Promise(resolve=>{
      const overlay=document.createElement('div'),prior=document.activeElement;
      overlay.className='routine-modal-backdrop';overlay.setAttribute('data-equipment-save-conflicts','');
      const valueHTML=(item,side)=>{const image=item.photo?.[side];return image?image.hidden?h(t('已移除','Đã xóa')):image.url?'<img src="'+h(image.url)+'" alt="'+h(t('衝突照片預覽','Xem trước ảnh xung đột'))+'" style="display:block;max-width:180px;max-height:150px;object-fit:contain">':h(t('無照片','Không có ảnh')):h(JSON.stringify(item[side]));};
      overlay.innerHTML=`<section class="routine-modal" role="dialog" aria-modal="true" aria-labelledby="equipment-save-choice-title" style="width:min(680px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;overflow-wrap:anywhere"><h2 id="equipment-save-choice-title">${t('選擇衝突處理方式','Chọn cách xử lý xung đột')}</h2><p>${t('一次處理所有衝突，沒有衝突的雙方修改都會保留。','Áp dụng một lựa chọn cho tất cả xung đột; giữ các thay đổi không xung đột.')}</p><ul>${conflicts.map(item=>`<li><strong>${h(item.label)} · ${h(item.fields)}</strong><p>${t('我的','Của tôi')}: ${valueHTML(item,'mine')}</p><p>${t('對方的','Của người khác')}: ${valueHTML(item,'theirs')}</p></li>`).join('')}</ul><div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="button" data-equipment-save-choice="mine">${t('用我的','Dùng của tôi')}</button><button type="button" class="button" data-equipment-save-choice="theirs">${t('用對方的','Dùng của người khác')}</button><button type="button" class="button ghost" data-equipment-save-choice="cancel">${t('取消','Hủy')}</button></div></section>`;
      let done=false;const close=value=>{if(done)return;done=true;overlay.remove();document.removeEventListener('keydown',keydown);window.removeEventListener('pagehide',cancel);if(equipmentSaveChoice===cancel)equipmentSaveChoice=null;if(current()&&prior?.isConnected)prior.focus?.({preventScroll:true});resolve(value);};
      const cancel=()=>close('cancel'),keydown=event=>{if(event.key==='Escape'){event.preventDefault();cancel();}else if(event.key==='Tab'){const buttons=[...overlay.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};
      equipmentSaveChoice=cancel;for(const button of overlay.querySelectorAll('[data-equipment-save-choice]'))button.onclick=()=>close(current()?button.dataset.equipmentSaveChoice:'cancel');
      overlay.onclick=event=>{if(event.target===overlay)cancel();};document.addEventListener('keydown',keydown);window.addEventListener('pagehide',cancel);document.body.append(overlay);overlay.querySelector('[data-equipment-save-choice="cancel"]').focus();
    });
  }
  // Reconcile only after durable confirmation. Later input is kept, and fields
  // changed after dispatch keep the basis they actually saw if peers changed it.
  function settleEquipmentBatch(batch,canonical){
    const next=clone(canonical),basis=clone(canonical),before=batch.sentInput;
    for(const key of equipmentSaveCollections){
      for(const prior of before[key]){
        const current=working?.[key].find(row=>row.id===prior.id),index=next[key].findIndex(row=>row.id===prior.id),baseIndex=basis[key].findIndex(row=>row.id===prior.id);
        if(!current){if(index>=0)next[key].splice(index,1);continue;}
        const pending=pendingPhotos.get(prior.id),captured=batch.sentPhotos?.get(prior.id),sameCaptured=captured&&pending===captured.entry&&pending?.file===captured.file&&pending?.url===captured.url;
        const photoFields=key==='equipment'?['photoId','photoHidden']:['photoId'],laterPhoto=key!=='issues'&&!sameCaptured&&!!(pending||captured||photoFields.some(field=>!equipmentContentEqual(current[field],prior[field])));
        if(equipmentContentEqual(current,prior)&&!laterPhoto)continue;
        if(index<0){next[key].push(clone(current));if(baseIndex<0)basis[key].push(clone(prior));continue;}
        for(const field of new Set([...Object.keys(prior),...Object.keys(current)]))if(!equipmentContentEqual(current[field],prior[field])){
          if(Object.hasOwn(current,field))next[key][index][field]=clone(current[field]);else delete next[key][index][field];
          if(!['photoId','photoHidden'].includes(field)&&!equipmentContentEqual(canonical[key].find(row=>row.id===prior.id)?.[field],prior[field])){
            if(Object.hasOwn(prior,field))basis[key][baseIndex][field]=clone(prior[field]);else delete basis[key][baseIndex][field];
          }
        }
        if(laterPhoto){
          const ownPhoto=captured&&batch.chosenPhotos?.has(prior.id);
          for(const field of key==='equipment'?['photoId','photoHidden']:['photoId']){
            // A new File is an intent even when its JSON fields equal the old
            // batch. Theirs never hides it or silently changes its seen basis.
            const value=ownPhoto&&pending&&field==='photoId'&&equipmentContentEqual(current[field],prior[field])?canonical[key].find(row=>row.id===prior.id)?.[field]:current[field];
            if(value===undefined)delete next[key][index][field];else next[key][index][field]=clone(value);
            if(!ownPhoto){if(Object.hasOwn(prior,field))basis[key][baseIndex][field]=clone(prior[field]);else delete basis[key][baseIndex][field];}
          }
        }
      }
      for(const row of working?.[key]||[])if(!before[key].some(prior=>prior.id===row.id)&&!next[key].some(actual=>actual.id===row.id))next[key].push(clone(row));
      // Open handlers and nodeDialog.prior own row references, not just IDs.
      // Update their existing objects rather than detaching the next form.
      if(working)working[key]=next[key].map(row=>{
        const current=working[key].find(value=>value.id===row.id);if(!current)return row;
        if(nodeDialog?.prior===current){
          const oldName=current.name||current.nameVi||current.nameZh||'';
          const keepSeen=field=>{const seen=nodeDialog.comparisonBasis ||= {key,id:row.id,generation:syncGeneration,fields:{}};if(!Object.hasOwn(seen.fields,field))seen.fields[field]={present:Object.hasOwn(current,field),value:Object.hasOwn(current,field)?clone(current[field]):null};};
          // Uncompleted node input is private too. Preserve the basis it saw,
          // without applying its name/spec/photo or completing the dialog.
          if(nodeDialog.name===oldName)nodeDialog.name=row.name||row.nameVi||row.nameZh||'';else keepSeen('name');
          if(nodeDialog.spec===(current.spec||''))nodeDialog.spec=row.spec||'';else keepSeen('spec');
          const pin=batch.sentPhotos?.get(row.id),photo=nodeDialog.pendingPhoto,nodePhotoChanged=nodeDialog.photoRemoved||photo&&(!pin||photo!==pin.entry||photo.file!==pin.file||photo.url!==pin.url);
          if(nodePhotoChanged&&!batch.chosenPhotos?.has(row.id))keepSeen('photoId');
          if(!nodeDialog.photoRemoved&&!photo&&nodeDialog.photoId===(current.photoId||''))nodeDialog.photoId=row.photoId||'';
        }
        for(const field of Object.keys(current))if(!Object.hasOwn(row,field))delete current[field];Object.assign(current,row);return current;
      });
      if(key==='equipment'&&formSnapshot){
        const prior=before[key].find(row=>row.id===formSnapshot.id),sent=canonical[key].find(row=>row.id===formSnapshot.id);
        if(prior&&sent)for(const field of new Set([...Object.keys(prior),...Object.keys(sent)]))if(equipmentContentEqual(formSnapshot[field],prior[field])){
          if(Object.hasOwn(sent,field))formSnapshot[field]=clone(sent[field]);else delete formSnapshot[field];
        }
      }
    }
    syncBase=basis;
  }
  async function writeShared(action,more={},departureOwner){
    assertCurrentDisplay();
    departureOwner?.assert();
    if(!inputOwnerCurrent()){readUnavailable=true;message=t('帳號或登入世代已變更；原輸入保留但不會載入或送到新帳號，請先重新核對。','Tài khoản hoặc phiên đăng nhập đã đổi; giữ dữ liệu cũ nhưng không hiển thị hay gửi bằng tài khoản mới. Hãy đối chiếu lại.');render();return null;}
    if(readUnavailable||controlActor!==identity()?.id){message=t('資料讀取失敗；保留目前內容，請先重新載入核對。','Không tải được dữ liệu; giữ nội dung hiện tại, hãy tải lại và đối chiếu trước.');render();return null;}
    if(busy||equipmentSaveChoice)return null;
    if(action==='apply'){
      if(!editable())return null;
      message=t('已套用，修改僅保留於本機；請存取草稿。','Đã áp dụng; thay đổi chỉ ở máy này. Hãy lưu bản nháp.');
      return {control,revision,local:true};
    }
    if(['save','submit'].includes(action)&&(editingEquipmentId||nodeDialog||addingEquipment||isFormDirty()||action==='submit'&&(pendingPhotos.size||working&&syncBase&&snapshotChanges(syncBase,working).patches.length))){
      message=t('請先套用或取消目前表單，再儲存或送審；輸入仍保留。','Áp dụng hoặc hủy biểu mẫu hiện tại trước khi lưu / gửi duyệt; dữ liệu nhập được giữ lại.');
      const status=host?.querySelector('#routine-shared-status');if(status)status.textContent=message;return null;
    }
    const actor=identity(),actorId=actor?.id,epoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.(),page=host,reviewPage=reviewHost,lifecycle=equipmentEditRequest,attempt={};
    let versionId=selectedVersionId,generation=control?.workflow?.generation,activeId=control?.activeVersionId,modelRevision=revision,flowRevision=control?.workflow?.revision,client;
    const tab=page?.dataset?.activeTab,connected=page?.isConnected;
    const owns=()=>writeShared.attempt===attempt&&actor===identity()&&actorId===identity()?.id&&controlActor===actorId&&
      (Number.isSafeInteger(epoch)&&epoch>=0&&epoch===window.ProcessSync?.identityGeneration?.())&&
      !window.ProcessSync?.requiresReload&&(!!delivery&&window.ProcessSync?.isCurrentDelivery?.(delivery)===true)&&
      host===page&&page?.dataset?.activeTab===tab&&page?.isConnected===connected&&reviewHost===reviewPage&&(action==='save'||equipmentEditRequest===lifecycle)&&selectedVersionId===versionId&&revision===modelRevision&&control?.workflow?.revision===flowRevision&&
      control?.workflow?.generation===generation&&control?.activeVersionId===activeId&&(!client||sharedClient===client)&&(!departureOwner||departureOwner.current());
    const assertOwned=()=>{assertCurrentDisplay();departureOwner?.assert();if(!owns())throw Error('DELIVERY_SUPERSEDED');};
    const advance=()=>{versionId=selectedVersionId;generation=control?.workflow?.generation;activeId=control?.activeVersionId;modelRevision=revision;flowRevision=control?.workflow?.revision;rememberInputOwner(delivery);};
    const sentNodeDialog=nodeDialog,sentAddForm=newEquipmentForm,inputStamp=()=>JSON.stringify([nodeDialog,newEquipmentForm,editingEquipmentId]);
    let local=working&&clone(working);const sentInput=local&&clone(local),base=clone(syncBase||open()&&snapshotOf(open())||null),sentPhotos=new Map([...pendingPhotos].map(([id,entry])=>[id,{entry,file:entry.file,url:entry.url}])),stamp=inputStamp();
    const uploadedPhotos=new Map();let chosenPhotos=sentPhotos,comparedSave=false,comparisonAttempt=null;const samePhoto=(id,pin)=>{const entry=pendingPhotos.get(id);return entry===pin.entry&&entry.file===pin.file&&entry.url===pin.url;};
    writeShared.attempt=attempt;busy=true;readIntent++;updateEquipmentLocalStatus();
    const priorFocusedId=host?.contains(document.activeElement)?document.activeElement.id:'';
    host?.querySelectorAll('#routine-save,#routine-submit').forEach(button=>{button.disabled=true;});
    const saveButton=host?.querySelector('#routine-save');if(saveButton&&action==='save')saveButton.textContent=t('儲存中…','Đang lưu…');
    try{
      assertOwned();client=sharedTransport();assertOwned();
      if(client.hasUnknown()){assertOwned();throw Error(t('前次結果未知，請查詢原操作收據，不會重新送出。','Kết quả trước chưa rõ; kiểm tra biên nhận gốc, không gửi lại.'));}
      if(action!=='begin'&&readBeginRecovery()){readUnavailable=true;throw Error(beginRecoveryMessage());}
      if(localBeginReceipt&&control.workflow?.generation!==localBeginReceipt.generation)throw Error('STALE_GENERATION');
      if(!control.workflow||action==='begin'){
        assertOwned();const r=await beginSharedDraft(client,owns);assertOwned();control=r.control;revision=r.revision;advance();
        if(!syncGeneration)syncGeneration=localBeginReceipt?.generation||control.workflow.generation;
        if(action==='begin'){
          selectedVersionId=open()?.id;
          const staged=local&&base&&snapshotChanges(base,local).patches.length;
          if(staged||pendingPhotos.size){working=working||local;syncBase=base;syncGeneration=localBeginReceipt.generation;}
          else if(JSON.stringify(working)===JSON.stringify(sentInput)&&stamp===inputStamp()){working=snapshotOf(open());syncBase=clone(working);syncGeneration=localBeginReceipt.generation;}
          else readUnavailable=true;
          advance();message=t('共用草稿已準備完成；本機修改仍須明確存取。','Bản nháp chung đã sẵn sàng; thay đổi cục bộ vẫn cần lưu rõ ràng.');return r;
        }
        if(r.beginRecovered){readUnavailable=true;throw Error(t('已核對共用草稿；請重新載入保留輸入後，再明確套用原表單。','Đã kiểm tra bản nháp chung; tải lại và giữ dữ liệu rồi áp dụng rõ ràng biểu mẫu.'));}
      }
      const flow=control.workflow;let commandAction=action,detail={},submissionGeneration=null;
      if(action==='save'){
        if(localBeginReceipt&&flow.generation!==localBeginReceipt.generation)throw Error('STALE_GENERATION');
        if(syncGeneration&&flow.generation!==syncGeneration)throw Error('STALE_GENERATION');
        comparisonAttempt={current:owns};equipmentSaveComparison=comparisonAttempt;
        const inspectFresh=fresh=>{const latest=fresh.control?.workflow;
          if(fresh.permissions?.view!==true||fresh.permissions?.edit!==true)throw Error('FORBIDDEN');
          if(!Number.isSafeInteger(fresh.revision)||fresh.revision<revision||latest?.scope!=='routine-equipment'||latest.generation!==flow.generation||latest.pendingId||!Number.isSafeInteger(latest.revision)||latest.revision<flow.revision||fresh.control.activeVersionId!==control.activeVersionId||!fresh.control.versions?.some(version=>version.id===open()?.id&&version.status==='draft'))throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
          return latest;
        };
        let fresh=await client.read(undefined,{isCurrent:owns,requireAcceptedAccess:true});assertOwned();
        // Nothing is uploaded/dispatched in this loop. Every new peer revision
        // is compared against the same captured base/input/File entries.
        for(;;){const latest=inspectFresh(fresh),comparison=compareEquipmentSave(base||flow.working,sentInput||flow.working,latest.working,sentPhotos);
          const choice=comparison.conflicts.length?await chooseEquipmentSave(comparison.conflicts,owns):'mine';assertOwned();if(choice==='cancel')return null;
          if(comparison.conflicts.length){
            const confirmed=await client.read(undefined,{isCurrent:owns,requireAcceptedAccess:true});assertOwned();const next=inspectFresh(confirmed);
            if(confirmed.revision<fresh.revision||next.revision<latest.revision)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
            if(confirmed.revision!==fresh.revision||next.revision!==latest.revision||!equipmentContentEqual(next.working,latest.working)){fresh=confirmed;continue;}
          }
          const plan=comparison.materialize(choice);local=plan.local;chosenPhotos=plan.chosenPhotos;comparedSave=true;
          detail={moduleAction:'save-local-v1',expectedRevision:latest.revision,patches:plan.patches,guards:plan.guards};break;
        }
        equipmentSaveComparison=null;
        // Only captured, chosen photos upload. Later previews remain a next batch.
        for(const [id,pending]of chosenPhotos){const row=['equipment','categories','subcategories','groups'].flatMap(k=>local[k]||[]).find(r=>r.id===id);if(row){assertOwned();const photoId=await uploadImage(pending.file);assertOwned();row.photoId=photoId;uploadedPhotos.set(id,pending);
          const key=equipmentSaveCollections.find(kind=>local[kind].includes(row)),insert=detail.patches.find(patch=>patch.op==='insert'&&patch.path[0]===key&&patch.value.id===id),path=[key,{id},'photoId'];
          if(insert)insert.value.photoId=photoId;else {const patch=detail.patches.find(patch=>equipmentContentEqual(patch.path,path));if(!patch)throw Error('DEPENDENCY_GUARD_REQUIRED');patch.value=photoId;}
        }}
      }else if(action==='submit'){
        const snapshot=window.captureSharedDraftSubmission(flow);submissionGeneration=flow.generation;
        assertOwned();const reason=await window.VersionDraftUI.confirmSubmit(window.VersionDraftUI.reasonFor(selected(),flow),t('檢具全庫','Toàn bộ thiết bị'),{savedVersion:{id:snapshot.savedId,revision:snapshot.expectedRevision,at:flow.saved.at,actor:flow.saved.actor?.name}});assertOwned();if(reason===null)return null;
        if(hasLocalDraftInput()||isFormDirty()||readUnavailable||!client.permission('submit'))throw Error('DELIVERY_SUPERSEDED');
        if(control.workflow?.generation!==submissionGeneration||control.workflow.revision!==snapshot.expectedRevision||control.workflow.saved?.id!==snapshot.savedId)throw Error('DRAFT_REVISION_CHANGED_RECONFIRM');
        detail={...snapshot,reason};
      }else if(['approve','reject','withdraw'].includes(action)){
        commandAction=action==='reject'?'return':action;const caseId=more.versionId||flow.pendingId,c=flow.cases.find(c=>c.id===caseId);
        assertOwned();const answer=await window.VersionDraftUI.confirmReview({action,scope:t('檢具全庫','Toàn bộ thiết bị')+' · '+caseId,reason:more.comment||'',selfReview:action!=='withdraw'&&c?.actor.id===actorId});assertOwned();if(!answer)return null;detail={caseId,...answer};
      }
      const commandGeneration=action==='save'?syncGeneration||flow.generation:submissionGeneration||flow.generation;
      if(action==='save')pendingSaveBatch={local,sentInput,sentPhotos,chosenPhotos,comparedSave};
      assertOwned();const result=await client.command(commandGeneration,commandAction,detail);assertOwned();
      // A fallback read is metadata only; it must not reset RAM before settlement.
      let confirmed=result;if(!confirmed.control){assertOwned();try{confirmed=await client.read();}catch(error){if(owns())readUnavailable=true;throw error;}assertOwned();if(confirmed.permissions?.view!==true){readUnavailable=true;throw Error('SYNC_CONFIRMATION_REQUIRED');}}
      if(!confirmed.control?.workflow||!Number.isSafeInteger(confirmed.revision)||confirmed.revision<revision){readUnavailable=true;throw Error('SYNC_CONFIRMATION_REQUIRED');}
      if(action==='save'){
        const actual=confirmed.control.workflow.working,valueAt=(data,path)=>path.reduce((value,key)=>typeof key==='object'?value?.find(row=>row.id===key.id):value?.[key],data);
        const hasInsert=detail.patches.some(patch=>patch.op==='insert');
        try{
        if(confirmed.control.workflow.generation!==commandGeneration||hasInsert&&!['equipment','groups','categories','subcategories','issues'].every(key=>Array.isArray(actual?.[key]))||hasInsert&&(!result.receipt||result.receipt.unchanged!==false||result.receipt.generation!==commandGeneration||!Number.isSafeInteger(result.receipt.revision)||result.receipt.revision<=flow.revision||!Number.isSafeInteger(confirmed.control.workflow.revision)||confirmed.control.workflow.revision<result.receipt.revision)||!detail.patches.every(patch=>patch.op==='remove'?valueAt(actual,patch.path)===undefined:patch.op==='insert'?confirmedEquipmentInsert(actual,patch):JSON.stringify(valueAt(actual,patch.path))===JSON.stringify(patch.value))){readUnavailable=true;throw Error('SYNC_CONFIRMATION_REQUIRED');}
        }catch(error){if(hasInsert){readUnavailable=true;throw Error('SYNC_CONFIRMATION_REQUIRED');}throw error;}
      }
      if(action==='save'&&(!result.receipt?.savedId||confirmed.control.workflow.saved?.id!==result.receipt.savedId||!equipmentContentEqual(confirmed.control.workflow.saved.content,confirmed.control.workflow.working))){readUnavailable=true;throw Error('SYNC_CONFIRMATION_REQUIRED');}
      const nextInput=JSON.stringify(working)!==JSON.stringify(sentInput)||nodeDialog!==sentNodeDialog||newEquipmentForm!==sentAddForm||stamp!==inputStamp()||action==='save'&&chosenPhotos.size!==uploadedPhotos.size||pendingPhotos.size!==sentPhotos.size||[...sentPhotos].some(([id,entry])=>!samePhoto(id,entry));
      control=confirmed.control;revision=confirmed.revision;selectedVersionId=open()?.id||active()?.id||'';advance();
      if(action!=='save'){submitProblems=[];problemSnapshot=null;openErrors=false;}
      if(nextInput){
        // Never rebase next-input guards onto peer values from the ACK/readback.
        if(action==='save'){
          // Adopt only this batch's canonical insert allocation/defaults, never peer fields.
          for(const patch of detail.patches.filter(p=>p.op==='insert')){const key=patch.path[0],before=sentInput[key].find(r=>r.id===patch.value.id),current=working[key].find(r=>r.id===patch.value.id),actual=confirmed.control.workflow.working[key].find(r=>r.id===patch.value.id);if(current&&actual){for(const [field,value]of Object.entries(actual))if(JSON.stringify(current[field])===JSON.stringify(before[field]))current[field]=clone(value);Object.assign(local[key].find(r=>r.id===actual.id),clone(actual));}}
          if(!comparedSave)for(const [id,entry]of sentPhotos){const find=data=>['equipment','categories','subcategories','groups'].flatMap(k=>data?.[k]||[]).find(row=>row.id===id),current=find(working),before=find(sentInput),sent=find(local);
            if(current&&before&&sent&&samePhoto(id,entry)&&current.photoId===before.photoId&&current.photoHidden===before.photoHidden)current.photoId=sent.photoId;
          }
          if(comparedSave)settleEquipmentBatch({sentInput,sentPhotos,chosenPhotos},local);else syncBase=clone(local);
        }
      }else{working=open()?.status==='draft'?snapshotOf(open()):null;syncBase=working&&clone(working);syncGeneration=control.workflow.generation;}
      if(action==='save')for(const [id,entry]of sentPhotos){
        const find=data=>['equipment','categories','subcategories','groups'].flatMap(k=>data?.[k]||[]).find(row=>row.id===id);
        acknowledgeFormPhoto(id,entry.entry,find(sentInput),find(local));
        if(!samePhoto(id,entry)){URL.revokeObjectURL(entry.url);continue;}
        if(nextInput&&nodeDialog===sentNodeDialog&&nodeDialog?.prior?.id===id&&nodeDialog.pendingPhoto===entry.entry){nodeDialog.pendingPhoto=null;nodeDialog.photoId=local[['categories','subcategories','groups'].find(key=>local[key]?.some(row=>row.id===id))]?.find(row=>row.id===id)?.photoId||'';}
        if(nextInput&&newEquipmentForm===sentAddForm&&newEquipmentForm?.submittedEquipmentId===id&&newEquipmentForm.pendingPhoto===entry.entry)newEquipmentForm.pendingPhoto=null;
        URL.revokeObjectURL(entry.url);pendingPhotos.delete(id);
      }
      if(action==='save'){pendingSaveBatch=null;if(!nextInput)localBeginReceipt=null;}
      if(['approve','reject','withdraw'].includes(action)&&!nextInput)localBeginReceipt=null;
      message=nextInput?t('本批已確認；後續輸入仍未套用，請明確套用並核對來源。','Đã xác nhận đợt này; dữ liệu nhập sau chưa áp dụng, hãy áp dụng rõ ràng và đối chiếu nguồn.'):action==='save'?t('共用快照已儲存至伺服器','Đã lưu bản chụp chung trên máy chủ'):action==='apply'?t('已同步 · 尚未手動儲存','Đã đồng bộ · chưa lưu thủ công'):t('操作已由伺服器確認','Máy chủ đã xác nhận');
      if(action==='save'){const allocations=detail.patches.filter(p=>p.op==='insert'&&p.path[0]==='categories'&&p.value.code).map(p=>{const row=confirmed.control.workflow.working.categories.find(r=>r.id===p.value.id);return row&&row.code!==p.value.code?p.value.code+' → '+row.code:null;}).filter(Boolean);if(allocations.length)message+=' · '+t('伺服器分配編碼','Mã do máy chủ cấp')+': '+allocations.join('、');}
      window.dispatchEvent(new CustomEvent('routine-equipment-updated',{detail:{revision,activeVersionId:control.activeVersionId,action}}));return owns()?result:null;
    }catch(error){
      if(!owns())return null;
      try { if(readBeginRecovery())readUnavailable=true; } catch { readUnavailable=true; }
      if(action==='save'&&!client?.hasUnknown())pendingSaveBatch=null;
      message=error.message==='SYNC_CONFIRMATION_REQUIRED'?t('同步回應尚未核對；輸入與原值保留，請先重新載入核對，不會自動重送。','Chưa đối chiếu phản hồi đồng bộ; giữ dữ liệu nhập và giá trị gốc, hãy tải lại đối chiếu; không tự gửi lại.'):error.message;
      if(Array.isArray(error.details?.issues)){
        const flow=control.workflow;
        problemSnapshot={kind:action==='submit'?'saved':'case',id:action==='submit'?flow.saved?.id:more.versionId||flow.pendingId,generation:flow.generation};
        submitProblems=error.details.issues.map(issue=>({kind:issue.kind,id:issue.path?.[0]==='equipment'?issue.path[1]?.id||'':'',field:issue.path?.[2]||(issue.message==='EQUIPMENT_STILL_REFERENCED'?'enabled':''),message:issue.message,requestId:error.requestId}));
        openErrors=true;
        message=t('已儲存的送審內容未通過驗證，請查看報錯與待補。修正後須手動儲存再送審。','Nội dung đã lưu để gửi duyệt chưa đạt kiểm tra. Xem lỗi và mục cần bổ sung; sửa rồi lưu thủ công trước khi gửi lại.');
      }
      return null;
    }finally{if(equipmentSaveComparison===comparisonAttempt)equipmentSaveComparison=null;const updateUI=owns();if(writeShared.attempt===attempt){writeShared.attempt=null;busy=false;}if(updateUI){if(action==='apply'&&document.activeElement?.matches('[data-issue-result]')){const status=host?.querySelector('#routine-shared-status');if(status)status.textContent=displayDraftError(message);}else{
      const focusedId=host?.contains(document.activeElement)?document.activeElement.id:priorFocusedId,scrollX=window.scrollX,scrollY=window.scrollY;
      render();if(focusedId){document.getElementById(focusedId)?.focus({preventScroll:true});window.scrollTo(scrollX,scrollY);}
    }}}
  }
  // Preserve this unapplied drawer; renewal reads never acknowledge or replay it.
  function captureAddEquipmentInput(root=host) {
    if (!addingEquipment || !newEquipmentForm || !routineTabIsActive()) return;
    const fields = {assetCode:'asset-code',pieceMark:'piece-mark-input',name:'name',unit:'unit',owner:'owner',calibrationMethod:'calibration-method',calibrationCycle:'calibration-cycle',customCycle:'custom-cycle',calibratedAt:'calibrated-at',expiresAt:'expires-at',intakeDate:'intake-date',spec:'spec',notes:'notes',groupId:'group-select'};
    for (const [field, id] of Object.entries(fields)) {
      const input = root.querySelector('#routine-add-' + id);
      if (input) newEquipmentForm[field] = input.value;
    }
    for (const field of ['enabled','confirmed']) {
      const input = root.querySelector('#routine-add-' + field);
      if (input) newEquipmentForm[field] = input.value === 'true';
    }
    // pendingPhoto retains the exact File and object URL; never clone/revoke/upload.
  }
  // Keep an exact private drawer reference across quarantine; never attach it to another account.
  function captureRetainedAddEquipmentInput() {
    const record=bindAddEquipmentInput.forms?.get(newEquipmentForm);
    if(!record||record.owner!==newEquipmentOwner||record.actor!==identity()||record.actorId!==identity()?.id||!Number.isSafeInteger(record.epoch)||record.epoch<0||record.epoch!==window.ProcessSync?.identityGeneration?.()||
      record.page!==host||record.tab!==host?.dataset?.activeTab||record.connected!==host?.isConnected||record.versionId!==selectedVersionId||record.generation!==newEquipmentOwner?.generation)return;
    captureAddEquipmentInput(record.drawer);
  }
  function bindAddEquipmentInput() {
    const drawer = host?.querySelector('#routine-add-modal'), page = host, form = newEquipmentForm, owner = newEquipmentOwner;
    if (!drawer || drawer.dataset.routineInputBound || !form || !owner) return;
    (bindAddEquipmentInput.forms ||= new WeakMap()).set(form,{drawer,page,owner,actor:identity(),actorId:identity()?.id,epoch:window.ProcessSync?.identityGeneration?.(),tab:page.dataset.activeTab,connected:page.isConnected,versionId:selectedVersionId,generation:owner.generation});
    const capture = event => {
      if (!drawer.isConnected || !drawer.contains(event.target) || !routineTabIsActive() || host !== page ||
          newEquipmentForm !== form || newEquipmentOwner !== owner || identity()?.id !== owner.actor ||
          window.ProcessSync?.identityGeneration?.() !== owner.epoch) return;
      captureAddEquipmentInput();
    };
    drawer.dataset.routineInputBound = 'true';
    drawer.addEventListener('input', guardWorking(drawer,capture));
    drawer.addEventListener('change', guardWorking(drawer,capture));
  }
  function showEquipmentReadRecovery(error) {
    readUnavailable = true;
    message = displayDraftError(error);
    if (!routineTabIsActive()) return;
    window.VersionDraftUI?.updateSync?.(host, busy, true);
    const status = host.querySelector('#routine-shared-status');
    if (status) status.textContent = t('同步失敗；保留目前內容：','Đồng bộ thất bại; giữ nội dung: ') + message;
    host.querySelectorAll('#routine-add-submit,#routine-save,#routine-submit,#routine-begin').forEach(button => {button.disabled = true;});
    if (!addingEquipment || !newEquipmentForm) return;
    const footer = host.querySelector('#routine-add-modal .routine-modal-footer');
    if (!footer) return;
    let button = footer.querySelector('#routine-add-load-retry');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button'; button.id = 'routine-add-load-retry'; button.className = 'button signal';
      button.addEventListener('click', recoverAddEquipmentRead);
      footer.prepend(button);
    }
    button.textContent = t('重新載入並保留輸入','Tải lại và giữ dữ liệu đang nhập');
    button.disabled = busy;
  }
  async function recoverAddEquipmentRead() {
    if (busy || equipmentReadAttempt || !addingEquipment || !newEquipmentForm || !routineTabIsActive()) return;
    if(!inputOwnerCurrent()){captureRetainedAddEquipmentInput();render();return;}
    const actor = identity()?.id, epoch = window.ProcessSync?.identityGeneration?.(), page = host,
      form = newEquipmentForm, draft = working, base = syncBase, generation = syncGeneration,
      flowGeneration = control?.workflow?.generation, pendingId = control?.workflow?.pendingId,
      versionId = selectedVersionId, previousRevision = revision, client = sharedClient;
    const ownsAttempt = () => equipmentReadAttempt === attempt && routineTabIsActive() && host === page && identity()?.id === actor &&
      window.ProcessSync?.identityGeneration?.() === epoch && controlActor === actor &&
      newEquipmentForm === form && addingEquipment && !!client && sharedClient === client &&
      newEquipmentOwner?.actor === actor && newEquipmentOwner?.epoch === epoch;
    const sameContext = () => ownsAttempt() && working === draft && syncBase === base &&
      syncGeneration === generation && control?.workflow?.generation === flowGeneration &&
      control?.workflow?.pendingId === pendingId && selectedVersionId === versionId &&
      newEquipmentOwner?.generation === generation;
    captureAddEquipmentInput();
    const attempt = {};
    equipmentReadAttempt = attempt;
    busy = true;
    try {
      if (!actor || !Number.isSafeInteger(epoch) || !sameContext()) throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      if (generation !== flowGeneration) throw Error('DEPENDENCY_CHANGED_RECONFIRM');
      if (client.hasUnknown() || client.hasSyncFailures()) throw Error('PREVIOUS_OPERATION_UNKNOWN');
      showEquipmentReadRecovery(message);
      // Existing normal projection authenticates the cookie on the server. No identity/token mutation.
      const response = await fetch('/api/shared-state', {cache:'no-store',headers:headers(),signal:AbortSignal.timeout(15000)});
      const freshIdentity = await response.json();
      if (!sameContext()) throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      if (!response.ok || freshIdentity.identity?.id !== actor || freshIdentity.identity?.sessionType !== 'platform') throw Error('LOGIN_REQUIRED');
      const result = await client.read();
      if (!sameContext()) throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
      if (client.hasUnknown() || client.hasSyncFailures()) throw Error('PREVIOUS_OPERATION_UNKNOWN');
      const access = result.permissions;
      if (!access || ['view','edit','save','submit','withdraw','approve','return','history','delete'].some(key => typeof access[key] !== 'boolean') || access.view !== true || access.edit !== true) throw Error('FORBIDDEN');
      const validSnapshot = value => value && typeof value === 'object' && !Array.isArray(value) &&
        ['equipment','groups','categories','subcategories','issues'].every(key => Array.isArray(value[key]) &&
          value[key].every(row => row && typeof row === 'object' && !Array.isArray(row)));
      if (!result.control?.workflow || !Number.isSafeInteger(result.revision) || !Number.isSafeInteger(result.control.workflow.revision) ||
          !Array.isArray(result.control.versions) || !validSnapshot(result.control.workflow.working) ||
          !result.control.versions.every(version => version && typeof version.id === 'string' && typeof version.status === 'string' &&
            Array.isArray(version.equipment) && Array.isArray(version.groups) && validSnapshot(version.snapshot))) throw Error('INVALID_WORKFLOW_RESPONSE');
      if (result.revision < previousRevision || result.revision < revision || result.control.workflow.revision < control.workflow.revision ||
          result.control.workflow.generation !== flowGeneration || result.control.workflow.pendingId !== pendingId ||
          !result.control.versions.some(version => version.id === versionId && version.status === 'draft')) throw Error('DEPENDENCY_CHANGED_RECONFIRM');
      captureAddEquipmentInput();
      control = result.control; revision = result.revision;
      // Keep working, syncBase, syncGeneration, group selection and guarded field baselines unchanged.
      readUnavailable = false;
      message = t('已載入最新版，未套用輸入與照片仍保留；套用時重新核對來源。','Đã tải bản mới; giữ đầu vào và ảnh chưa áp dụng, kiểm tra nguồn khi áp dụng.');
      busy = false;
      render();
    } catch (error) {
      // A changed owner/page must never redraw the preserved form into another context.
      if (ownsAttempt()) showEquipmentReadRecovery(error);
    } finally {
      if (equipmentReadAttempt === attempt) {
        const updateUI = ownsAttempt();
        equipmentReadAttempt = null;
        busy = false;
        if (updateUI) {
          const button = host.querySelector('#routine-add-load-retry');
          if (button) button.disabled = false;
        }
      }
    }
  }

  const unitLabels = { '個': ['個','Cái'], '支': ['支','Cây'], '台': ['台','Máy'], '組': ['組','Bộ'] };

  const methodLabels = { none: ['不校正','Không hiệu chuẩn'], internal: ['內部校正','Hiệu chuẩn nội bộ'], external: ['外部校正','Hiệu chuẩn bên ngoài'] };
  const cycleLabels = { weekly: ['每週','Hằng tuần'], monthly: ['每月','Hằng tháng'], quarterly: ['每季','Hằng quý'], halfyear: ['每半年','Mỗi nửa năm'], yearly: ['每年','Hằng năm'], custom: ['自訂','Tùy chỉnh'] };
  const label = map => t(...map);
  const methodCode = value => /^(none|不校正|Không hiệu chuẩn)/i.test(value || '') ? 'none' : /^(internal|內部校正|Hiệu chuẩn nội bộ)/i.test(value || '') && !String(value).includes('＋') ? 'internal' : /^(external|外部校正|Hiệu chuẩn bên ngoài)/i.test(value || '') ? 'external' : 'legacy-conflict';
  const unitCode = value => Object.keys(unitLabels).find(key => String(value || '').startsWith(key)) || value;
  const displayName = item => item?.name || item?.nameVi || item?.nameZh || '';
  const groupLabel = group => String(group?.name || group?.nameVi || group?.nameZh || group?.id || '').replace(/^(?:獨立|候選)\s*[／/]\s*/, '').replace(/候選$/, '').trim();

  function structure(version) {
    const categories = clone(version?.categories || []), subcategories = clone(version?.subcategories || []);
    const groups = (version?.groups || []).map(group => ({ ...group }));
    for (const group of groups) {
      const code = String(group.categoryCode || ''), categoryName = String(group.category || '');
      let category = categories.find(item => item.id === group.categoryId) || categories.find(item => item.code === code);
      if (!category && code) { category = { id: `legacy-category:${encodeURIComponent(code)}`, code, name: categoryName || code }; categories.push(category); }
      if (!category) continue;
      group.categoryId = category.id;
      let sub = subcategories.find(item => item.id === group.subcategoryId) || subcategories.find(item => item.categoryId === category.id && item.name === group.subcategory);
      if (!sub && group.subcategory) { sub = { id: `legacy-subcategory:${encodeURIComponent(category.id)}:${encodeURIComponent(group.subcategory)}`, categoryId: category.id, name: group.subcategory }; subcategories.push(sub); }
      if (sub) group.subcategoryId = sub.id;
      group.name ||= group.nameVi || group.nameZh || group.id;
    }
    return { categories, subcategories, groups };
  }

  function fillRepresentativePhotos(version) {
    if (!version) return;
    const tree = structure(version);
    const eligibleCategoryCodes = new Set(['C01', 'C02', 'C03', 'C04', 'C05', 'C06']);
    const eligibleCategories = tree.categories.filter(c => eligibleCategoryCodes.has(c.code));
    const eligibleCatIds = new Set(eligibleCategories.map(c => c.id));

    // 1. Fill Groups under C01~C06
    for (const group of version.groups || []) {
      if (!eligibleCatIds.has(String(group.categoryId || ''))) continue;
      if (group.photoId) continue;
      const items = (version.equipment || []).filter(e => e.groupId === group.id && (e.photoId || e.photoSource?.webSha256) && !e.photoHidden);
      if (!items.length) continue;
      const best = items.find(e => e.pieceMark === '01') || items[0];
      const pid = best?.photoId || (best?.photoSource?.webSha256 ? best.photoSource.webSha256 : '');
      if (pid) group.photoId = pid;
    }

    // 2. Fill Subcategories under C01~C06
    for (const sub of version.subcategories || []) {
      if (!eligibleCatIds.has(sub.categoryId)) continue;
      if (sub.photoId) continue;
      const subGroups = (version.groups || []).filter(g => g.subcategoryId === sub.id);
      const grp = subGroups.find(g => g.photoId);
      if (grp?.photoId) {
        sub.photoId = grp.photoId;
      } else {
        const items = (version.equipment || []).filter(e => e.subcategoryId === sub.id && (e.photoId || e.photoSource?.webSha256) && !e.photoHidden);
        const best = items.find(e => e.pieceMark === '01') || items[0];
        const pid = best?.photoId || (best?.photoSource?.webSha256 ? best.photoSource.webSha256 : '');
        if (pid) sub.photoId = pid;
      }
    }
  }

  const snapshotOf = version => {
    if(control?.workflow&&version.snapshot)return clone(version.snapshot);
    const tree = structure(version);
    const snap = clone({ equipment: version.equipment, ...tree, issues: (version.issues || control?.issues || []).map((issue,index)=>({...issue,id:issue.id||'source-issue-'+index})) });
    fillRepresentativePhotos(snap);
    return snap;
  };

  const isDirty = () => !!working && JSON.stringify(working) !== JSON.stringify(snapshotOf(selected()));
  const identity = () => window.ProcessSync?.identity || (typeof currentUser !== 'undefined' ? currentUser : null);
  const permitted = key => (window.sharedDraftPermissionAllowed?.(sharedClient,key)??true)&&(typeof window.hasPermission === 'function' ? window.hasPermission(key==='approval.submit'?'view:data':key) || key==='approval.withdraw'&&window.hasPermission('view:data') : identity()?.role === 'admin');
  const open = () => control?.versions.find(version => ['draft','pending'].includes(version.status));
  const active = () => control?.versions.find(version => version.id === control.activeVersionId);
  const selected = () => control?.versions.find(version => version.id === selectedVersionId) || open() || active() || control?.versions[0];
  const visible = () => selected()?.id === open()?.id && working ? working : selected();
  const editable = () => historyAllowsMutation() && !readUnavailable && inputOwnerCurrent() && selected()?.status === 'draft' && !!working && permitted('approval.submit');
  const status = value => ({
    draft: t('待確認草稿', 'Bản nháp chờ xác nhận'),
    pending: t('主管審核中', 'Quản lý đang duyệt'),
    approved: t('已核准生效', 'Đã phê duyệt có hiệu lực'),
    superseded: t('歷史生效版', 'Bản hiệu lực trước')
  })[value] || value;
  const actionName = act => ({
    begin: t('開始修改', 'Bắt đầu sửa'),
    create: t('新增設備', 'Thêm thiết bị'),
    save: t('儲存草稿', 'Lưu bản nháp'),
    submit: t('送出審核', 'Gửi duyệt'),
    approve: t('主管核准', 'Quản lý phê duyệt'),
    reject: t('發回修改', 'Trả lại để sửa'),
    withdraw: t('撤回送審', 'Rút hồ sơ'),
    approved: t('主管核准', 'Quản lý phê duyệt'),
    returned: t('發回修改', 'Trả lại để sửa'),
    withdrawn: t('撤回送審', 'Rút hồ sơ'),
    delete: t('刪除草稿設備', 'Xóa thiết bị nháp'),
    import: t('匯入來源主檔', 'Nhập nguồn chính')
  })[act] || act;

  const details = item => item ? `${item.assetCode}／${item.pieceMark} · ${displayName(item) || t('未命名', 'Chưa đặt tên')}` : '';
  const failed = error => { message = error?.message || t('操作失敗', 'Thao tác thất bại'); render(); };
  const headers = () => window.ProcessSync?.platformHeaders?.() || { 'Content-Type': 'application/json' };

  async function read(preserveInput=false,explicitDelivery=false) {
    assertCurrentDisplay();const displayEpoch=historyDisplayEpoch;
    const actor=identity()?.id,actorObject=identity(),epoch=window.ProcessSync?.identityGeneration?.(),intent=++readIntent,delivery=window.ProcessSync?.captureDelivery?.(),page=host,tab=page?.dataset?.activeTab,connected=page?.isConnected,reviewPage=reviewHost,lifecycle=equipmentEditRequest,versionId=selectedVersionId,owns=()=>historyAllowsMutation()&&displayEpoch===historyDisplayEpoch&&intent===readIntent&&actor===identity()?.id&&actorObject===identity()&&(Number.isSafeInteger(epoch)&&epoch>=0&&epoch===window.ProcessSync?.identityGeneration?.())&&(!!delivery&&window.ProcessSync?.isCurrentDelivery?.(delivery)===true)&&!window.ProcessSync?.requiresReload&&host===page&&page?.dataset?.activeTab===tab&&page?.isConnected===connected&&reviewHost===reviewPage&&equipmentEditRequest===lifecycle&&selectedVersionId===versionId;
    const retainedWorking=working,retainedBase=syncBase,retainedNode=nodeDialog,retainedForm=newEquipmentForm,retainedOwner=inputOwner,deliveryRecheck=explicitDelivery&&hasLocalDraftInput()&&inputPrincipalCurrent()&&inputTargetCurrent()&&inputOwner.generation===syncGeneration&&!inputOwnerCurrent(),readClient=sharedClient;
    try {
    if(inputOwner&&!inputOwnerCurrent())render();
    if(!inputOwnerCurrent()&&hasLocalDraftInput()&&!deliveryRecheck)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    if(!owns())throw Error('DELIVERY_SUPERSEDED');
    const response = await fetch(endpoint+(endpoint.includes('?')?'&':'?')+'caseMetadata=1', { cache: 'no-store', headers: headers() });
    const body = await response.json().catch(() => ({}));
    if(!owns())throw Error('DELIVERY_SUPERSEDED');
    if(actor!==identity()?.id)throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    if (!response.ok || !body.control || !Number.isInteger(body.revision)) throw Error(body.error || t('後端資料載入失敗', 'Không thể tải dữ liệu máy chủ'));
    const recheckCurrent=()=>owns()&&inputOwner===retainedOwner&&working===retainedWorking&&syncBase===retainedBase&&nodeDialog===retainedNode&&newEquipmentForm===retainedForm&&sharedClient===readClient&&inputPrincipalCurrent()&&inputTargetCurrent();
    const acceptRecheck=access=>{
      const flow=body.control.workflow,draft=body.control.versions?.find(item=>item.id===versionId);
      return recheckCurrent()&&!(readClient.hasSyncFailures()&&!readClient.hasUnknown())&&Number.isSafeInteger(body.revision)&&Number.isSafeInteger(access.revision)&&access.revision>=body.revision&&access.permissions?.view===true&&access.permissions?.edit===true&&flow?.scope==='routine-equipment'&&flow.generation===retainedOwner.generation&&(!localBeginReceipt||localBeginReceipt.generation===flow.generation)&&!flow.pendingId&&!body.control.versions.some(item=>['pending','pending-test'].includes(item.status))&&draft?.status==='draft'&&Number.isSafeInteger(flow.revision)&&flow.revision>=(control?.workflow?.revision||0)&&body.revision>=revision;
    };
    const access=await (deliveryRecheck?readClient.recheckEquipmentDelivery(retainedOwner.generation,recheckCurrent,acceptRecheck):sharedTransport().permissions());
    if(!owns())throw Error('DELIVERY_SUPERSEDED');
    const recovery=sessionStorage.getItem(beginRecoveryKey(actor))!==null;
    if(deliveryRecheck){
      const flow=body.control.workflow,draft=body.control.versions?.find(item=>item.id===versionId);
      if(inputOwner!==retainedOwner||working!==retainedWorking||syncBase!==retainedBase||nodeDialog!==retainedNode||newEquipmentForm!==retainedForm||sharedClient!==readClient||readClient.hasSyncFailures()&&!readClient.hasUnknown()||!Number.isSafeInteger(body.revision)||!inputPrincipalCurrent()||!inputTargetCurrent()||access.permissions?.view!==true||access.permissions?.edit!==true||flow?.scope!=='routine-equipment'||flow.generation!==retainedOwner.generation||flow.pendingId||body.control.versions.some(item=>['pending','pending-test'].includes(item.status))||draft?.status!=='draft'||!Number.isSafeInteger(flow.revision)||flow.revision<(control?.workflow?.revision||0)||body.revision<revision)throw Error('DELIVERY_RECHECK_REQUIRED');
      preserveInput=true;
    }else if(!inputOwnerCurrent()&&hasLocalDraftInput())throw Error('ACCOUNT_CHANGED_REOPEN_REQUIRED');
    if(localBeginReceipt&&body.control.workflow?.generation!==localBeginReceipt.generation)throw Error('STALE_GENERATION');
    if(controlActor!==actor){submitProblems=[];problemSnapshot=null;openErrors=false;}
    if(deliveryRecheck)readClient.confirmEquipmentDelivery(access);
    if(body.calibrationFacts)calibrationFacts=body.calibrationFacts;
    control = body.control; revision = body.revision;controlActor=actor;readUnavailable=recovery;
    const version = selected();
    if (!selectedVersionId || !control.versions.some(item => item.id === selectedVersionId)) selectedVersionId = version?.id || '';
    if(!preserveInput&&!editingEquipmentId&&!nodeDialog&&!addingEquipment&&!pendingPhotos.size&&!(working&&syncBase&&snapshotChanges(syncBase,working).patches.length)){working = selected()?.status === 'draft' ? snapshotOf(selected()) : null;
    syncBase=working&&clone(working);syncGeneration=control.workflow?.generation||null;}
    rememberInputOwner(delivery);
    if(deliveryRecheck)message=t('已重新核對此頁權限；原輸入與原值保留，請明確套用並核對衝突。','Đã kiểm tra lại quyền trang này; giữ dữ liệu nhập và giá trị gốc, hãy áp dụng rõ ràng và đối chiếu xung đột.');
    if(recovery)message=beginRecoveryMessage();
    }catch(error){if(owns())readUnavailable=true;throw error;}
  }

  async function write(action, more = {}, preserve = false) {
    assertCurrentDisplay();
    if(readUnavailable){message=t('請先重新載入資料核對後操作。','Hãy tải lại dữ liệu và đối chiếu trước khi thao tác.');render();return null;}
    if(control?.workflow||open()?.status!=='pending')return writeShared(action==='save'?'apply':action,more);
    if (busy) return null;
    busy = true; message = ''; render();
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify({ action, baseRevision: revision, ...more }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        submitProblems = body.problems || [];
        if (!submitProblems.length && body.error) {
          submitProblems = [{ id: '', field: '', message: body.error, advice: t('請核對欄位或重新操作', 'Vui lòng kiểm tra lại các trường hoặc thử lại') }];
        }
        throw Error([body.error, ...(body.errors || [])].filter(Boolean).join('\n') || `HTTP ${response.status}`);
      }
      submitProblems = [];
      openErrors = false;
      if (!body.control || !Number.isInteger(body.revision)) throw Error(t('後端未回傳保存確認', 'Máy chủ không phản hồi xác nhận lưu'));
      if(body.calibrationFacts)calibrationFacts=body.calibrationFacts;
    control = body.control; revision = body.revision;
      if (!preserve) working = open()?.status === 'draft' ? snapshotOf(open()) : null;
      selectedVersionId = open()?.id || active()?.id || '';
      window.dispatchEvent(new CustomEvent('routine-equipment-updated', {
        detail: { revision, activeVersionId: control.activeVersionId || null, action }
      }));
      try { await window.ProcessSync?.refresh?.(); } catch { /* CAS succeeded */ }
      return body;
    } catch (error) { failed(error); return null; }
    finally { busy = false; render(); }
  }

  // Keep outcomes by bytes and actor epoch, including abandoned/reselected Files.
  // A timed-out PUT can still commit: only GET the original hash thereafter.
  const photoUploadOutcomes=new Map();
  async function photoRequest(url,options={},kind='json'){
    const controller=new AbortController();let timer;
    try{return await Promise.race([(async()=>{const response=await fetch(url,{...options,signal:controller.signal});const body=await response[kind]();return {response,body};})(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('PHOTO_UPLOAD_RESULT_UNKNOWN'));},45000);})]);}
    finally{clearTimeout(timer);}
  }
  async function uploadImage(file) {
    assertCurrentDisplay();const displayEpoch=historyDisplayEpoch,owner=identity(),ownerEpoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.();historyUploads++;
    const check=()=>{if(displayEpoch!==historyDisplayEpoch||identity()!==owner||window.ProcessSync?.identityGeneration?.()!==ownerEpoch||!delivery||window.ProcessSync?.isCurrentDelivery?.(delivery)!==true)throw Error('PHOTO_UPLOAD_CONTEXT_CHANGED');assertCurrentDisplay();};
    const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
    try{
      if (!file || file.size > 5_000_000) throw Error(t('照片限 5 MB', 'Ảnh giới hạn 5 MB'));
      const hash=await digest(await file.arrayBuffer());check();
      const key=JSON.stringify([owner.id,ownerEpoch,hash]);let outcome=photoUploadOutcomes.get(key);
      if(!outcome){outcome={dispatched:false,confirmed:false};photoUploadOutcomes.set(key,outcome);}
      if(outcome.confirmed)return hash;
      if(outcome.dispatched){
        const {response,body}=await photoRequest(`${api}/photo?id=${hash}`,{cache:'no-store',headers:headers()},'arrayBuffer');check();
        if(!response.ok||await digest(body)!==hash)throw Error('PHOTO_UPLOAD_RESULT_UNKNOWN');check();outcome.confirmed=true;return hash;
      }
      outcome.dispatched=true;
      const {response,body}=await photoRequest(`${api}/photo${query}`,{method:'PUT',headers:{...headers(),'Content-Type':file.type||'image/jpeg'},body:file});
      if(response.ok&&body.id===hash)outcome.confirmed=true;
      check();if(!outcome.confirmed)throw Error('PHOTO_UPLOAD_RESULT_UNKNOWN');return hash;
    }catch(error){if(error.message==='PHOTO_UPLOAD_CONTEXT_CHANGED')throw error;throw Error(t('圖片上傳結果尚未確認。再次按存取只查證原圖片，不會重傳。','Chưa xác nhận tải ảnh. Bấm Lưu lần nữa chỉ kiểm tra ảnh gốc, không tải lại.')+' '+error.message);}
    finally{historyUploads--;}
  }

  async function importSource() {
    assertCurrentDisplay();
    if (busy) return;
    busy = true; message = t('讀取來源 Excel 對照及照片…', 'Đang đọc đối chiếu và ảnh Excel nguồn…'); render();
    try {
      const response = await fetch('/process/routine-source.json', { cache: 'no-store' });
      if (!response.ok) throw Error(t('來源資料檔無法讀取', 'Không thể đọc tệp dữ liệu nguồn'));
      const source = await response.json();
      if (source.equipment.length !== 119 || source.issues.length !== 37) throw Error(t('來源核對筆數不符', 'Số lượng đối chiếu nguồn không khớp'));
      let next = 0;
      const uploadWorker = async () => {
        while (next < source.equipment.length) {
          const index = next++;
          const item = source.equipment[index];
          const imageResponse = await fetch(item.photoSource.webPath);
          if (!imageResponse.ok) throw Error(`第 ${item.sourceRow} 列照片讀取失敗`);
          const blob = await imageResponse.blob();
          item.photoId = await uploadImage(blob);
          if ((index + 1) % 10 === 0) { message = `照片上傳中：${index + 1}／119`; render(); }
        }
      };
      await Promise.all(Array.from({ length: 6 }, uploadWorker));
      message = t('照片已保存；正在建立待確認草稿…', 'Ảnh đã lưu; đang tạo bản nháp chờ xác nhận…'); render();
      const result = await fetch(endpoint, { method: 'POST', headers: headers(),
        body: JSON.stringify({ action: 'import', baseRevision: revision, source }) });
      const body = await result.json().catch(() => ({}));
      if (!result.ok || !body.control || !Number.isInteger(body.revision)) throw Error(body.error || t('匯入未完成', 'Nhập chưa hoàn tất'));
      if(body.calibrationFacts)calibrationFacts=body.calibrationFacts;
    control = body.control; revision = body.revision; selectedVersionId = open()?.id || '';
      working = open()?.status === 'draft' ? snapshotOf(open()) : null;
      message = t(`已匯入 ${open()?.equipment.length || 0} 筆待確認草稿、37 筆來源待確認事項；沒有建立生效版。`, `Đã nhập ${open()?.equipment.length || 0} bản nháp, 37 mục chờ đối soát; chưa tạo bản hiệu lực.`);
      try { await window.ProcessSync?.refresh?.(); } catch { /* keep dirty edits */ }
    } catch (error) { message = error.message || t('匯入失敗', 'Nhập thất bại'); }
    finally { busy = false; render(); }
  }

  function itemUse(item, version) {
    const fact=version?.status!=='superseded'&&calibrationFacts[item.id];
    if(fact?.locked){
      if(fact.status==='retired')return t('已報廢','Đã thanh lý');
      if(['failed','suspended'].includes(fact.status))return t('不合格','Không đạt');
      item={...item,...fact.dates};
    }
    const estimated = version?.status !== 'approved' && version?.status !== 'superseded';
    const show = value => estimated ? `${t('預估：', 'Dự kiến: ')}${value}` : value;
    if (!item.enabled) return show(t('未啟用', 'Chưa kích hoạt'));
    if (!item.confirmed) return show(t('待核對', 'Chờ đối soát'));
    if ((version?.issues || control?.issues || []).some(issue => issue.sourceRow === item.sourceRow && issue.status !== 'resolved')) return show(t('來源疑點未處理', 'Vấn đề nguồn chưa xử lý'));
    const method = methodCode(item.calibrationMethod);
    if (method === 'legacy-conflict') return show(t('校正方式待確認', 'Cần xác nhận hiệu chuẩn'));
    if (method === 'none') return show(t('不需校正', 'Không cần hiệu chuẩn'));
    const today = vietnamToday();
    if (!item.calibratedAt || !item.expiresAt) return show(t('缺校正日期', 'Thiếu ngày hiệu chuẩn'));
    if (item.expiresAt < today) return show(t('校正逾期', 'Hết hạn hiệu chuẩn'));
    return show(t('可用', 'Khả dụng'));
  }

  function validateEquipmentItem(item) {
    const problems = [];
    const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    const prefix = `${item.assetCode || item.id}/${item.pieceMark || '01'}`;

    if (!String(item.name || item.nameVi || item.nameZh || '').trim()) {
      problems.push({ id: item.id, field: 'name', message: `${prefix}: ${t('檢具名稱必填', 'Tên thiết bị bắt buộc')}`, advice: t('請輸入完整之檢具名稱。', 'Vui lòng nhập tên thiết bị đầy đủ.') });
    }
    if (!item.groupId?.trim()) {
      problems.push({ id: item.id, field: 'groupId', message: `${prefix}: ${t('規格群組必選', 'Nhóm quy cách bắt buộc')}`, advice: t('請選擇所屬規格群組。', 'Vui lòng chọn nhóm quy cách.') });
    }
    const method = methodCode(item.calibrationMethod);
    if (method === 'legacy-conflict') {
      problems.push({ id: item.id, field: 'calibrationMethod', message: `${prefix}: ${t('舊雙軌校正需先選擇單一方式', 'Hai luồng cũ cần chọn một cách')}`, advice: t('請選擇「不校正」、「內部校正」或「外部校正」。', 'Chọn không hiệu chuẩn, nội bộ hoặc bên ngoài.') });
    }
    if (method !== 'none') {
      const cycle = String(item.calibrationCycle || '').trim();
      if (!cycle || (cycle === 'custom' && !String(item.customCycle || '').trim())) {
        problems.push({ id: item.id, field: cycle === 'custom' ? 'customCycle' : 'calibrationCycle', message: `${prefix}: ${t('校正週期必填', 'Chu kỳ hiệu chuẩn bắt buộc')}`, advice: t('請選擇標準校正週期。', 'Chọn chu kỳ hiệu chuẩn chuẩn.') });
      }
      if (!item.calibratedAt) {
        problems.push({ id: item.id, field: 'calibratedAt', message: `${prefix}: ${t('最近校正日期必填', 'Ngày hiệu chuẩn bắt buộc')}`, advice: t('請填寫有效之最近校正日期（YYYY-MM-DD）。', 'Nhập ngày hiệu chuẩn hợp lệ (YYYY-MM-DD).') });
      } else if (!validDay(item.calibratedAt)) {
        problems.push({ id: item.id, field: 'calibratedAt', message: `${prefix}: ${t('最近校正日期格式不合法', 'Ngày hiệu chuẩn không hợp lệ')}`, advice: t('請使用 YYYY-MM-DD 格式。', 'Dùng định dạng YYYY-MM-DD.') });
      }
      if (!item.expiresAt) {
        problems.push({ id: item.id, field: 'expiresAt', message: `${prefix}: ${t('校正有效期限必填', 'Hạn hiệu chuẩn bắt buộc')}`, advice: t('請填寫有效之校正有效期限（YYYY-MM-DD）。', 'Nhập hạn hiệu chuẩn hợp lệ (YYYY-MM-DD).') });
      } else if (!validDay(item.expiresAt)) {
        problems.push({ id: item.id, field: 'expiresAt', message: `${prefix}: ${t('校正有效期限格式不合法', 'Hạn hiệu chuẩn không hợp lệ')}`, advice: t('請使用 YYYY-MM-DD 格式。', 'Dùng định dạng YYYY-MM-DD.') });
      }
      if (item.calibratedAt && item.expiresAt && validDay(item.calibratedAt) && validDay(item.expiresAt) && item.expiresAt < item.calibratedAt) {
        problems.push({ id: item.id, field: 'expiresAt', message: `${prefix}: ${t('有效期限不能早於校正日期', 'Hạn hiệu chuẩn không thể trước ngày hiệu chuẩn')}`, advice: t('請確認有效期限晚於或等於校正日期。', 'Xác nhận hạn hiệu chuẩn sau ngày hiệu chuẩn.') });
      }
    }
    return problems;
  }

  function getProblem(itemId, fieldName) {
    return (submitProblems || []).find(p => {
      if (p.id !== itemId) return false;
      if (p.field === fieldName) return true;
      if (fieldName === 'calibrationCycle' && p.field === 'customCycle') return true;
      if (fieldName === 'groupId' && p.field === 'name' && String(p.message).includes('群組')) return true;
      return false;
    });
  }

  function problemMessage(problem) {
    const translations={
      EQUIPMENT_STILL_REFERENCED:['仍有正式標準引用此檢具，不能停用或刪除。','Thiết bị vẫn được tiêu chuẩn chính thức sử dụng; không thể ngừng dùng hoặc xóa.'],
      '編號、名稱與群組必填':['編號、名稱與群組必填','Mã, tên và nhóm thiết bị là bắt buộc'],
      '舊雙軌校正需先選擇單一方式':['舊雙軌校正需先選擇單一方式','Hai luồng hiệu chuẩn cũ cần chọn một phương thức'],
      '校正週期必填':['校正週期必填','Chu kỳ hiệu chuẩn là bắt buộc'],
      '校正日期及有效期限必填':['校正日期及有效期限必填','Ngày hiệu chuẩn và hạn hiệu chuẩn là bắt buộc'],
      '有效期限不能早於校正日期':['有效期限不能早於校正日期','Hạn hiệu chuẩn phải hợp lệ và không trước ngày hiệu chuẩn'],
    };
    let message=String(problem.message||'');
    for(const [source,labels]of Object.entries(translations))message=message.replace(source,t(...labels));
    return message;
  }

  function renderEditCalibrationFields(item, can) {
    const isNoCalib = methodCode(item.calibrationMethod) === 'none';
    const cycleValue = String(item.calibrationCycle || '');
    if (isNoCalib) {
      return `<div class="wide routine-message" style="margin:0">${t('此設備為「不需校正」，無需填寫週期與效期。', 'Thiết bị này không cần hiệu chuẩn, không cần nhập chu kỳ và hạn dùng.')}</div>`;
    }
    const cycleProb = getProblem(item.id, 'calibrationCycle');
    const customProb = getProblem(item.id, 'customCycle');
    const dates=calibrationFacts[item.id]?.locked?calibrationFacts[item.id].dates:item;
    const calProb = getProblem(item.id, 'calibratedAt');
    const expProb = getProblem(item.id, 'expiresAt');

    return `
      <label>${t('校正週期', 'Chu kỳ hiệu chuẩn')}${cycleProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(cycleProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
        <select data-select="calibrationCycle" class="${cycleProb ? 'has-error' : ''}" ${can ? '' : 'disabled'}>
          <option value="" ${!cycleValue ? 'selected' : ''}>${t('請選擇週期', 'Chọn chu kỳ')}</option>
          ${cycleValue && (cycleValue==='custom'||!Object.keys(cycleLabels).includes(cycleValue)) ? `<option data-i18n-skip="true" value="${h(cycleValue)}" selected disabled>${h(cycleValue)} · ${t('既有值（唯讀）','Giá trị cũ (chỉ đọc)')}</option>` : ''}
          ${Object.entries(cycleLabels).filter(([code])=>code!=='custom').map(([code, labels]) => `<option value="${code}" ${code === cycleValue ? 'selected' : ''}>${label(labels)}</option>`).join('')}
        </select>
      </label>
      ${item.calibrationCycle === 'custom' ? `
        <label>${t('既有週期（唯讀）；請改選標準頻率', 'Chu kỳ cũ (chỉ đọc); chọn tần suất chuẩn')}${customProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(customProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
          <input readonly data-field="customCycle" data-i18n-skip="true" type="text" class="${customProb ? 'has-error' : ''}" value="${h(item.customCycle || '')}" ${can ? '' : 'disabled'}>
        </label>` : ''}
      <label>${t('最近校正日期', 'Ngày hiệu chuẩn gần nhất')}${calProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(calProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
        <input data-field="calibratedAt" type="date" class="${calProb ? 'has-error' : ''}" value="${h(dates.calibratedAt || '')}" ${can && !calibrationFacts[item.id]?.locked ? '' : 'disabled'}>
      </label>
      <label>${t('校正有效期限（含當天有效）', 'Hạn hiệu chuẩn')}${expProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(expProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
        <input data-field="expiresAt" type="date" class="${expProb ? 'has-error' : ''}" value="${h(dates.expiresAt || '')}" ${can && !calibrationFacts[item.id]?.locked ? '' : 'disabled'}>
      </label>
    `;
  }

  // The pending destination belongs to this open form only.
  const formDestinations = new WeakMap();

  function equipmentClassification(version) {
    const canonical = version === working ? control.workflow?.working || selected() : version;
    function rows(key, parentKeys) {
      const base = new Map((version === working ? syncBase?.[key] || [] : []).map(row => [row.id,row]));
      const stored = new Map((canonical?.[key] || []).map(row => [row.id,row]));
      return (version[key] || []).flatMap(row => {
        const original = base.get(row.id), source = stored.get(row.id);
        if (!original) return [row]; // Includes explicitly added local groups.
        if (!source) return []; // The display tree may synthesize legacy parents.
        const result = {...row};
        for (const field of parentKeys) {
          if (row[field] === original[field]) result[field] = source[field];
        }
        return [result];
      });
    }
    const categories = rows('categories',[]);
    const categoryById = new Map(categories.map(row => [row.id,row]));
    const subcategories = rows('subcategories',['categoryId']).filter(row => categoryById.has(row.categoryId));
    const subById = new Map(subcategories.map(row => [row.id,row]));
    const destinations = rows('groups',['categoryId','subcategoryId']).flatMap(group => {
      const category = categoryById.get(group.categoryId), sub = subById.get(group.subcategoryId);
      if (!group.id || !category?.id || !sub?.id || sub.categoryId !== category.id) return [];
      const path = [categoryLabel(category),sub.name || sub.id,groupLabel(group) || group.id].join(' › ');
      return [{group,category,sub,label:group.id + ' · ' + path}];
    });
    return {categories,subcategories,destinations};
  }

  function chosenDestination(item, destinations) {
    const choice = formDestinations.get(formSnapshot) || item;
    return destinations.find(({group}) => group.id === choice.groupId &&
      (!choice.categoryId || group.categoryId === choice.categoryId) &&
      (!choice.subcategoryId || group.subcategoryId === choice.subcategoryId));
  }

  function classificationOptions(rows, value, placeholder, label) {
    return `<option value="">${placeholder}</option>` + rows.map(row =>
      `<option value="${h(row.id)}" data-i18n-skip="true" ${row.id === value ? 'selected' : ''}>${h(label(row))}</option>`).join('');
  }

  const categoryLabel = category => [category.code,category.name || category.id].filter(Boolean).join(' · ');
  const destinationLabel = group => group.id + ' · ' + groupLabel(group);

  function form(item) {
    if (!item) return '';
    const can = editable(), hierarchy = equipmentClassification(visible()), destinations = hierarchy.destinations;
    const original = destinations.find(({group}) => group.id === formSnapshot?.groupId);
    const chosen = chosenDestination(item, destinations);
    const selection = formDestinations.get(formSnapshot) || original?.group || item;
    const subcategories = hierarchy.subcategories.filter(row => row.categoryId === selection.categoryId);
    const groups = destinations.filter(d => d.category.id === selection.categoryId && d.sub.id === selection.subcategoryId).map(d => d.group);
    const field = (label, key, type = 'text', readonly = false, extra = '') => {
      const prob = getProblem(item.id, key);
      return `<label>${label}${prob ? `<span class="routine-field-error">⚠️ ${h(problemMessage(prob).replace(/^.*?:\s*/, ''))}</span>` : ''}<input data-field="${key}" class="${prob ? 'has-error' : ''}" data-i18n-skip="true" type="${type}" value="${h(item[key] ?? '')}" ${!can || readonly ? 'disabled' : ''} ${extra}></label>`;
    };
    const text = (label, key) =>
      `<label class="wide">${label}<textarea data-field="${key}" data-i18n-skip="true" ${can ? '' : 'disabled'}>${h(item[key] || '')}</textarea></label>`;

    const completeHierarchy = !!chosen;
    const nameConflict = !item.name && item.nameZh && item.nameVi && item.nameZh.trim() !== item.nameVi.trim();
    const calibration = methodCode(item.calibrationMethod);

    const nameProb = getProblem(item.id, 'name');
    const groupProb = getProblem(item.id, 'groupId');
    const methodProb = getProblem(item.id, 'calibrationMethod');

    return `<div class="routine-modal-backdrop" id="routine-backdrop"><section class="routine-card routine-modal routine-editor" id="routine-editor" role="dialog" aria-modal="true" aria-label="${t('編輯檢具', 'Sửa thiết bị')}">
        <div class="routine-editor-scroll">
        <div class="routine-modal-header">
          <div>
            <h3 data-i18n-skip="true">${h(details(item))}</h3>
            <p class="routine-source">ID：${h(item.id)}　${t('來源列：', 'Dòng nguồn: ')}${h(item.sourceRow || t('本次新增', 'Thêm mới lần này'))}</p>
          </div>
          <div class="routine-modal-tools"><button type="button" id="routine-language-toggle">${t('切換語言', 'Đổi ngôn ngữ')}</button><button type="button" id="routine-close" title="${t('關閉', 'Đóng')}">✕</button></div>
        </div>

        <div class="routine-modal-body">
          <p id="routine-identity-error" role="alert" class="routine-validation" hidden></p>
          ${nameConflict ? `<div class="routine-message">${t('舊中越名稱內容不同，原文已保留。請核對後在單一名稱欄輸入確認結果。', 'Hai tên cũ khác nhau và đã được giữ nguyên. Hãy xác nhận trong ô tên duy nhất.')}</div>` : ''}
          ${submitProblems.filter(problem => problem.id === item.id).map(problem => `<p class="routine-validation" data-error-field="${h(problem.field)}">${problemSnapshot?h(t('送審快照：','Bản gửi duyệt: ')):''}${h(problemMessage(problem))}</p>`).join('')}
          <div class="routine-edit-grid">
            ${field(t('固定資產編號', 'Mã TSCĐ'), 'assetCode')}
            ${field(t('個別設備標記（分件號）', 'Ký hiệu thiết bị'), 'pieceMark')}
            <label>${t('名稱', 'Tên')}${nameProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(nameProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
              <input data-field="name" class="${nameProb ? 'has-error' : ''}" data-i18n-skip="true" type="text" value="${h(displayName(item))}" ${can ? '' : 'disabled'}>
            </label>

            <div class="wide routine-classification">
              <p>${t('目前分類', 'Phân loại hiện tại')} <b data-i18n-skip="true">${h(original?.label || formSnapshot?.groupId || '—')}</b></p>
              ${groupProb ? `<p class="routine-field-error">${h(problemMessage(groupProb))}</p>` : ''}
              <p id="routine-destination-preview" role="status" ${chosen && chosen.group.id !== formSnapshot?.groupId ? '' : 'hidden'}>${t('變更後', 'Sau khi đổi')} <b data-i18n-skip="true">${h(chosen?.label || '')}</b><br><small>${t('歷史報告保留原紀錄。','Báo cáo lịch sử giữ nguyên thông tin đã ghi.')}</small></p>
              ${can ? `<div id="routine-classification-choices">
                <label>${t('類別','Loại')}<select id="routine-edit-category">
                  ${classificationOptions(hierarchy.categories,selection.categoryId,t('請選擇類別','Chọn loại'),categoryLabel)}
                </select></label>
                <label>${t('子類別','Phân nhóm')}<select id="routine-edit-subcategory" ${selection.categoryId?'':'disabled'}>
                  ${classificationOptions(subcategories,selection.subcategoryId,t('請選擇子類別','Chọn phân nhóm'),row=>row.name || row.id)}
                </select></label>
                <label>${t('規格群組','Nhóm quy cách')}<select id="routine-edit-group" ${selection.subcategoryId?'':'disabled'}>
                  ${classificationOptions(groups,selection.groupId || chosen?.group.id,t('請選擇規格群組','Chọn nhóm quy cách'),destinationLabel)}
                </select></label>
              </div>
              <p id="routine-hierarchy-hint" role="alert" ${completeHierarchy?'hidden':''}>${t('請選擇有效的目的規格群組，再按套用。','Chọn nhóm quy cách đích hợp lệ rồi nhấn Áp dụng.')}</p>` : ''}
            </div>

            ${field(t('數量（固定 1）', 'Số lượng (Cố định 1)'), 'quantity', 'number', true)}
            <label>${t('單位', 'Đơn vị')}<select data-select="unit" ${can ? '' : 'disabled'}>
              ${Object.entries(unitLabels).map(([code, labels]) => `<option value="${code}" ${code === unitCode(item.unit) ? 'selected' : ''}>${label(labels)}</option>`).join('')}
            </select></label>
            ${field(t('擁有人／保管部門', 'Người sở hữu / Bộ phận'), 'owner')}

            <label>${t('設備狀態', 'Trạng thái thiết bị')}<select data-select="enabled" ${can ? '' : 'disabled'}>
              <option value="true" ${item.enabled ? 'selected' : ''}>${t('啟用', 'Đang dùng')}</option>
              <option value="false" ${item.enabled ? '' : 'selected'}>${t('未啟用', 'Chưa kích hoạt')}</option>
            </select></label>

            <label>${t('資料核對', 'Đối soát dữ liệu')}<select data-select="confirmed" ${can ? '' : 'disabled'}>
              <option value="false" ${item.confirmed ? '' : 'selected'}>${t('待確認', 'Chờ xác nhận')}</option>
              <option value="true" ${item.confirmed ? 'selected' : ''}>${t('已核對', 'Đã đối soát')}</option>
            </select></label>

            <label class="wide">${t('校正方式', 'Phương thức hiệu chuẩn')}${methodProb ? `<span class="routine-field-error">⚠️ ${h(problemMessage(methodProb).replace(/^.*?:\s*/, ''))}</span>` : ''}
              <select data-select="calibrationMethod" id="routine-edit-calibration-method" class="${methodProb ? 'has-error' : ''}" ${can ? '' : 'disabled'}>
                ${calibration === 'legacy-conflict' ? `<option data-i18n-skip="true" value="${h(item.calibrationMethod)}" selected>${t('舊雙軌／待選單一方式', 'Hai luồng cũ / cần chọn một cách')}</option>` : ''}
                ${Object.entries(methodLabels).map(([code, labels]) => `<option value="${code}" ${code === calibration ? 'selected' : ''}>${label(labels)}</option>`).join('')}
              </select>
            </label>

            <div id="routine-edit-calibration-container" class="wide" style="display:contents">
              ${renderEditCalibrationFields(item, can)}
            </div>

            ${field(t('入庫日期', 'Ngày nhập kho'), 'intakeDate', 'date')}
            ${text(t('規格／常用檢測用途／參考條件', 'Quy cách / Mục đích kiểm tra'), 'spec')}
            <div class="wide">${equipmentReferencesSectionHTML(item.id, 'edit')}</div>
            ${text(t('備註', 'Ghi chú'), 'notes')}

            <div class="routine-photo-field">
              ${photo(item) ? `<img src="${h(photo(item))}" alt="${t('設備照片', 'Ảnh thiết bị')}">` : `<span class="routine-photo-empty">${t('尚無照片', 'Chưa có ảnh')}</span>`}
              <div>${can ? `<label>${t('替換照片', 'Thay ảnh')}<input type="file" id="routine-photo-input" accept="image/*"></label>${photo(item) ? `<button type="button" id="routine-photo-remove">${t('從草稿移除照片', 'Xóa ảnh khỏi bản nháp')}</button>` : ''}` : ''}</div>
            </div>

            <div class="routine-source-box">
              <b>${t('原始來源欄位', 'Trường dữ liệu nguồn gốc')}</b>
              <p>${t('來源狀態：', 'Trạng thái nguồn: ')}<span data-i18n-skip="true">${h(item.sourceStatus || '—')}</span>　|　${t('來源對照：', 'Đối chiếu: ')}<span data-i18n-skip="true">${h(item.sourceReference || '—')}</span><br>
              ${t('來源標準關聯：', 'Tiêu chuẩn liên kết nguồn: ')}<span data-i18n-skip="true">${h(item.sourceStandardLinks || '—')}</span><br>
              ${t('來源產品關聯：', 'Sản phẩm liên kết nguồn: ')}<span data-i18n-skip="true">${h(item.sourceProductLinks || '—')}</span></p>
              <p style="color:#8a4d12;margin:0;font-size:.78rem">※ ${t('修改群組或分類時，上述來源關聯僅供人工核對，系統尚未進行自動跨模組改寫。', 'Khi đổi nhóm hoặc phân loại, liên kết trên chỉ để đối soát thủ công, hệ thống chưa tự động viết lại qua các module khác.')}</p>
            </div>
          </div>
        </div>

        </div>
        <div class="routine-modal-footer">
          ${can ? `<button type="button" class="button ghost" id="routine-delete">${t('刪除檢具', 'Xóa thiết bị')}</button>` : ''}
          <button type="button" class="button ghost" id="routine-form-cancel">${t('關閉', 'Đóng')}</button>
          ${can ? `<button type="button" class="button signal" id="routine-form-apply" ${completeHierarchy ? '' : 'disabled'}>${t('套用', 'Áp dụng')}</button>` : ''}
        </div>
      </section></div>`;
  }

  function syncHierarchy() {
    if (!working) return;
    for (const group of working.groups) {
      const sub = working.subcategories.find(item => item.id === group.subcategoryId);
      const cat = working.categories.find(item => item.id === group.categoryId);
      if (cat && sub) Object.assign(group, { categoryCode: cat.code, category: cat.name, subcategory: sub.name });
    }
    for (const item of working.equipment) {
      const group = working.groups.find(value => value.id === item.groupId);
      if (group) Object.assign(item, { categoryId: group.categoryId, subcategoryId: group.subcategoryId,
        categoryCode: group.categoryCode, category: group.category, subcategory: group.subcategory });
    }
  }

  function hierarchyCard(kind, item, title, active, image = '') {
    return `<div class="routine-node">
      <button type="button" data-node-select="${kind}" data-id="${h(item.id)}" class="routine-node-select ${active ? 'active' : ''}" aria-pressed="${active}">
        ${image ? `<img decoding="async" loading="lazy" src="${h(image)}" alt="" style="object-fit:cover">` : '<span class="routine-tile-placeholder">◇</span>'}
        <span data-i18n-skip="true"><b>${h(title)}</b>${kind !== 'subcategory' ? `<small>${h(item.code || item.id)}${kind === 'category' && working?.categories.some(row=>row.id===item.id) && !syncBase?.categories.some(row=>row.id===item.id) ? ' · '+t('暫編；存取時由伺服器分配','Mã tạm; máy chủ cấp khi lưu') : ''}</small>` : ''}</span>
      </button>
      <div class="routine-node-actions">
        <button type="button" data-node-view="${kind}" data-id="${h(item.id)}" title="${t('查看完整資訊', 'Xem thông tin')}">${t('查看資訊', 'Xem thông tin')}</button>
        ${editable() ? `
          <button type="button" data-node-edit="${kind}" data-id="${h(item.id)}">${t('修改', 'Sửa')}</button>
          <button type="button" data-node-delete="${kind}" data-id="${h(item.id)}">${t('刪除', 'Xóa')}</button>
        ` : ''}
      </div>
    </div>`;
  }

  function hierarchyHTML(data, rows) {
    const tree = structure(data);
    const children = tree.subcategories.filter(item => item.categoryId === selectedCategory);
    const groups = tree.groups.filter(item => item.subcategoryId === selectedSubcategory);

    const nodeImg = (item, fallbackRows) =>
      pendingPhotos.get(item?.id)?.url || (item?.photoId ? `${api}/photo?id=${item.photoId}` : '') || photo(fallbackRows);

    return `<section class="routine-hierarchy">
      <div class="routine-section-head"><h3>1. ${t('類別', 'Nhóm cha')}</h3>${editable() ? `<button type="button" data-node-add="category">＋${t('新增類別', 'Thêm nhóm')}</button>` : ''}</div>
      <div class="routine-tiles">${tree.categories.map(cat => hierarchyCard('category', cat, `${cat.code} · ${cat.name}`, selectedCategory === cat.id, nodeImg(cat, rows.find(item => item.categoryCode === cat.code)))).join('') || `<p>${t('尚無類別', 'Chưa có nhóm')}</p>`}</div>
      ${selectedCategory ? `<div class="routine-section-head"><h3>2. ${t('子類別', 'Phân nhóm')}</h3>${editable() ? `<button type="button" data-node-add="subcategory">＋${t('新增子類別', 'Thêm phân nhóm')}</button>` : ''}</div>
      <div class="routine-tiles">${children.map(sub => hierarchyCard('subcategory', sub, sub.name, selectedSubcategory === sub.id, nodeImg(sub, rows.find(item => item.subcategoryId === sub.id)))).join('') || `<p>${t('此類別尚無子類別，可在此新增。', 'Nhóm này chưa có phân nhóm; có thể thêm tại đây.')}</p>`}</div>` : ''}
      ${selectedSubcategory ? `<div class="routine-section-head"><h3>3. ${t('規格群組', 'Nhóm quy cách')}</h3>${editable() ? `<button type="button" data-node-add="group">＋${t('新增規格群組', 'Thêm nhóm quy cách')}</button>` : ''}</div>
      <div class="routine-groups">${groups.map(group => hierarchyCard('group', group, groupLabel(group), selectedGroup === group.id, nodeImg(group, rows.find(item => item.groupId === group.id)))).join('') || `<p>${t('此子類別尚無規格群組，可在此新增。', 'Phân nhóm này chưa có nhóm quy cách; có thể thêm tại đây.')}</p>`}</div>` : ''}
    </section>`;
  }

  function matchingRows(rows) {
    const needle = norm(search);
    return rows.filter(item => {
      if (!needle) {
        if (selectedGroup) { if (item.groupId !== selectedGroup) return false; }
        else if (selectedSubcategory) { if (item.subcategoryId !== selectedSubcategory && !structure(visible()).groups.some(group => group.id === item.groupId && group.subcategoryId === selectedSubcategory)) return false; }
        else if (selectedCategory) { if (item.categoryId !== selectedCategory && !structure(visible()).groups.some(group => group.id === item.groupId && group.categoryId === selectedCategory)) return false; }
        else return false;
      }
      const group = (visible()?.groups || []).find(value => value.id === item.groupId);
      return !needle || norm(`${item.assetCode} ${item.pieceMark} ${displayName(item)} ${item.nameZh} ${item.nameVi} ${item.groupId} ${group?.name || group?.nameVi || group?.nameZh || ''} ${item.spec} ${item.owner} ${item.category} ${item.subcategory}`).includes(needle);
    }).sort(naturalSort);
  }

  function equipmentListHTML(rows, version) {
    const filtered = matchingRows(rows);
    const pages = Math.max(1, Math.ceil(filtered.length / 20));
    equipmentPage = Math.min(equipmentPage, pages);
    const shown = filtered.slice((equipmentPage - 1) * 20, equipmentPage * 20);
    return `<section class="routine-card" id="routine-list-card">
      <div class="routine-card-head"><div><h3>4. ${t('檢具清單', 'Danh sách thiết bị')} · ${filtered.length} ${t('筆', 'mục')}</h3>
        <small>${search ? t('搜尋目前版本全部檢具', 'Tìm trong toàn bộ thiết bị của phiên bản này') : selectedGroup ? t('目前群組', 'Nhóm hiện tại') : t('請依序選擇類別、子類別與群組', 'Hãy chọn nhóm, phân nhóm và nhóm quy cách')}</small></div>
        ${editable() ? `<button type="button" class="button signal" id="routine-add">＋${t('新增檢具', 'Thêm thiết bị')}</button>` : ''}
      </div>
      ${search && editable() ? `<p class="routine-hint">${t('搜尋期間請清空搜尋並先選群組，再新增檢具。', 'Khi tìm kiếm, xóa từ khóa và chọn nhóm trước khi thêm thiết bị.')}</p>` : ''}
      <div class="routine-equipment-list">${shown.map(record => `<div class="routine-equipment-card ${record.id === selectedEquipmentId ? 'active' : ''}">
        <button type="button" class="routine-equipment-select" data-equipment-select="${h(record.id)}">
          ${photo(record) ? `<img decoding="async" src="${h(photo(record))}" loading="lazy" alt="">` : '<span class="routine-tile-placeholder">◇</span>'}
          <span><b data-i18n-skip="true">${h(record.assetCode)}</b><small>${t('固定分件號：', 'Ký hiệu cố định: ')}<em data-i18n-skip="true">${h(record.pieceMark)}</em> · ${t('第幾件：', 'Thiết bị thứ: ')}<em data-i18n-skip="true">${h(record.pieceIndex || t('待核對', 'Chờ đối soát'))}</em></small><small data-i18n-skip="true">${h(displayName(record))}</small><small>${h(itemUse(record, version))}</small></span>
        </button>
        <div class="routine-equipment-actions">
          <button type="button" data-equipment-view="${h(record.id)}" title="${t('查看完整資訊', 'Xem thông tin')}">${t('查看資訊', 'Xem thông tin')}</button>
          <button type="button" data-equipment-transfer="${h(record.id)}" title="${t('替換設備／標準移轉', 'Thay thế thiết bị')}">${t('替換設備', 'Thay thế')}</button>
          ${editable() ? `
            <button type="button" data-equipment-edit="${h(record.id)}">${t('修改', 'Sửa')}</button>
            <button type="button" data-equipment-delete="${h(record.id)}">${t('刪除', 'Xóa')}</button>
          ` : ''}
        </div>
      </div>`).join('') || `<p>${t('沒有符合條件的檢具', 'Không có thiết bị phù hợp')}</p>`}</div>
      ${pages > 1 ? `<div class="routine-pagination"><button type="button" data-equipment-page="previous" ${equipmentPage === 1 ? 'disabled' : ''}>${t('上一頁', 'Trang trước')}</button><span>${equipmentPage}／${pages}</span><button type="button" data-equipment-page="next" ${equipmentPage === pages ? 'disabled' : ''}>${t('下一頁', 'Trang sau')}</button></div>` : ''}
    </section>`;
  }

  function renderEquipmentResults() {
    const target = host?.querySelector('#routine-list-card');
    if (!target) return;
    target.outerHTML = equipmentListHTML(visible()?.equipment || [], visible());
    bindList();
    sharedClient?.gatePermissions?.();
  }

  const canDraftAction=op=>historyAllowsMutation()&&!readUnavailable&&selected()?.status==='draft'&&sharedClient?.permission(op)===true&&(control?.workflow||editable());
  async function saveDraft(action,departureOwner) {
    assertCurrentDisplay();
    if (!canDraftAction(action) || busy) return null;
    if(control?.workflow||open()?.status!=='pending')return writeShared(action,{},departureOwner);
    try {
      if (pendingPhotos.size) {
        busy = true; message = t('正在保存照片…', 'Đang lưu ảnh…'); render();
        for (const [id, pending] of pendingPhotos) {
          const item = (working.equipment || []).find(value => value.id === id) ||
                       (working.categories || []).find(value => value.id === id) ||
                       (working.subcategories || []).find(value => value.id === id) ||
                       (working.groups || []).find(value => value.id === id);
          if (item) item.photoId = await uploadImage(pending.file);
        }
        busy = false;
      }
      syncHierarchy();
      for (const item of working.equipment) item.unit = unitCode(item.unit);

      // Always save draft changes to server FIRST
      const saveResult = await write('save', {
        versionId: selected().id,
        versionRevision: selected().revision,
        snapshot: working
      }, true);

      if (!saveResult) return null;

      if (action === 'save') {
        for (const pending of pendingPhotos.values()) URL.revokeObjectURL(pending.url);
        pendingPhotos.clear();
        if (submitProblems && submitProblems.length > 0) {
          const updatedProblems = [];
          for (const p of submitProblems) {
            if (p.id) {
              const eq = working.equipment.find(e => e.id === p.id);
              if (eq) {
                const eqProbs = validateEquipmentItem(eq);
                const matching = eqProbs.find(ep => ep.field === p.field);
                if (matching) updatedProblems.push(matching);
              }
            } else if (p.retryAction) {
              if (p.retryAction !== 'save') updatedProblems.push(p);
            } else {
              updatedProblems.push(p);
            }
          }
          submitProblems = updatedProblems;
          if (submitProblems.length === 0) openErrors = false;
        }
        message = t('後端已保存草稿。', 'Máy chủ đã lưu bản nháp.');
        render();
        return saveResult;
      }

      // If action is 'submit', now submit the saved draft version
      const submitResult = await write('submit', {
        versionId: selected().id,
        versionRevision: selected().revision,
        snapshot: working
      });

      if (submitResult) {
        for (const pending of pendingPhotos.values()) URL.revokeObjectURL(pending.url);
        pendingPhotos.clear();
        submitProblems = [];
        openErrors = false;
        message = t('後端已保存並送審。', 'Máy chủ đã lưu và gửi duyệt.');
        render();
        return submitResult;
      } else {
        openErrors = true;
        render();
        const errCard = host?.querySelector('#routine-errors-details');
        errCard?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return null;
      }
    } catch (error) {
      busy = false;
      message = error.message || t('操作失敗，可重試。', 'Thao tác thất bại, có thể thử lại.');
      if (!submitProblems.length) {
        submitProblems = [{
          id: '',
          field: '',
          message: error.message || t('操作失敗，請檢查網路連線或重試。', 'Thao tác thất bại, vui lòng kiểm tra kết nối mạng hoặc thử lại.'),
          advice: t('請確認伺服器或網路狀態後，點擊「重試」。', 'Vui lòng kiểm tra kết nối rồi nhấn "Thử lại".'),
          retryAction: ['save', 'submit'].includes(action) ? action : '',
          timestamp: new Date().toLocaleTimeString(),
        }];
        openErrors = true;
      }
      render();
      return null;
    }
  }

  function nodeDialogHTML() {
    if (!nodeDialog) return '';
    const { kind, id, parentCategory, parentSubcategory, parentGroup, name, spec, error, pendingPhoto, photoId, photoRemoved } = nodeDialog;
    const titles = {
      category: id ? t('修改類別', 'Sửa nhóm') : t('新增類別', 'Thêm nhóm'),
      subcategory: id ? t('修改子類別', 'Sửa phân nhóm') : t('新增子類別', 'Thêm phân nhóm'),
      group: id ? t('修改規格群組', 'Sửa nhóm quy cách') : t('新增規格群組', 'Thêm nhóm quy cách'),
    };
    const photoPreview = pendingPhoto?.url || (!photoRemoved && photoId ? `${api}/photo?id=${photoId}` : '');

    return `<div class="routine-dialog-backdrop" id="routine-node-dialog-backdrop">
      <div class="routine-dialog" role="dialog" aria-modal="true" aria-label="${h(titles[kind])}">
        <div class="routine-dialog-head">
          <h3>${h(titles[kind])}</h3>
          <button type="button" id="routine-dialog-close" style="border:none;background:transparent;font-size:1.2rem;cursor:pointer">✕</button>
        </div>
        <div class="routine-dialog-body">
          ${error ? `<div class="routine-validation">${h(error)}</div>` : ''}
          ${parentCategory ? `<p class="routine-source"><b>${t('所屬類別：', 'Nhóm cha: ')}</b>${h(parentCategory)}</p>` : ''}
          ${parentSubcategory ? `<p class="routine-source"><b>${t('所屬子類別：', 'Phân nhóm: ')}</b>${h(parentSubcategory)}</p>` : ''}
          ${parentGroup ? `<p class="routine-source"><b>${t('所屬規格群組：', 'Nhóm quy cách: ')}</b>${h(parentGroup)}</p>` : ''}

          <label>${t('名稱', 'Tên')}<input type="text" id="routine-dialog-name" value="${h(name)}" placeholder="${t('請輸入名稱（保留原文）', 'Nhập tên')}" autofocus></label>
          ${kind === 'group' ? `<label>${t('規格／能力（可留空）', 'Quy cách / Năng lực (có thể để trống)')}<input type="text" id="routine-dialog-spec" value="${h(spec)}" placeholder="${t('規格說明', 'Mô tả quy cách')}"></label>` : ''}

          <div class="routine-photo-field wide" style="margin-top:8px">
            ${photoPreview ? `<img src="${h(photoPreview)}" alt="" style="max-width:180px;max-height:140px;object-fit:cover;border-radius:6px;border:1px solid #d5e2d9">` : `<span class="routine-photo-empty">${t('尚無照片', 'Chưa có ảnh')}</span>`}
            <div>
              <label>${photoPreview ? t('替換照片', 'Thay ảnh') : t('上傳照片', 'Tải ảnh')}
                <input type="file" id="routine-dialog-photo-input" accept="image/*">
              </label>
              ${photoPreview ? `<button type="button" id="routine-dialog-photo-remove" style="margin-top:6px;display:block">${t('移除照片', 'Xóa ảnh')}</button>` : ''}
            </div>
          </div>
        </div>
        <div class="routine-dialog-foot">
          <button type="button" class="button ghost" id="routine-dialog-cancel">${t('取消', 'Hủy')}</button>
          <button type="button" class="button signal" id="routine-dialog-confirm">${t('確定', 'Xác nhận')}</button>
        </div>
      </div>
    </div>`;
  }

  function renderAddCalibrationFields(form) {
    const isNoCalib = form.calibrationMethod === 'none';
    if (isNoCalib) {
      return `<div class="wide routine-message" style="margin:0">${t('此設備為「不需校正」，無需填寫週期與效期。', 'Thiết bị này không cần hiệu chuẩn, không cần nhập chu kỳ và hạn dùng.')}</div>`;
    }
    return `
      <label>
        ${t('校正週期', 'Chu kỳ hiệu chuẩn')}
        <select id="routine-add-calibration-cycle">
          <option value="" ${!form.calibrationCycle ? 'selected' : ''}>${t('請選擇週期', 'Chọn chu kỳ')}</option>
          ${Object.entries(cycleLabels).filter(([code])=>code!=='custom').map(([code, labels]) => `<option value="${code}" ${code === form.calibrationCycle ? 'selected' : ''}>${label(labels)}</option>`).join('')}
        </select>
      </label>
      ${form.calibrationCycle === 'custom' ? `
        <label>
          ${t('既有週期（唯讀）；請改選標準頻率', 'Chu kỳ cũ (chỉ đọc); chọn tần suất chuẩn')}
          <input type="text" id="routine-add-custom-cycle" data-i18n-skip="true" value="${h(form.customCycle || '')}" placeholder="${t('例如：每 45 天', 'Ví dụ: mỗi 45 ngày')}">
        </label>` : ''}
      <label>
        ${t('最近校正日期（草稿可留白，送審必填）', 'Ngày hiệu chuẩn gần nhất')}
        <input type="date" id="routine-add-calibrated-at" value="${h(form.calibratedAt || '')}">
      </label>
      <label>
        ${t('校正有效期限（含當天有效）', 'Hạn hiệu chuẩn')}
        <input type="date" id="routine-add-expires-at" value="${h(form.expiresAt || '')}">
      </label>
    `;
  }

  function addEquipmentDrawerHTML() {
    if (!addingEquipment || !newEquipmentForm || newEquipmentOwner?.actor !== identity()?.id ||
        newEquipmentOwner?.epoch !== window.ProcessSync?.identityGeneration?.()) return '';
    const tree = structure(visible());
    const form = newEquipmentForm;
    const group = tree.groups.find(g => g.id === form.groupId);
    const cat = tree.categories.find(c => c.id === group?.categoryId);
    const sub = tree.subcategories.find(s => s.id === group?.subcategoryId);

    return `<div class="routine-modal-backdrop" id="routine-add-backdrop"><section class="routine-card routine-modal routine-editor" id="routine-add-modal" role="dialog" aria-modal="true" aria-label="${t('新增檢具', 'Thêm thiết bị')}">
      <div class="routine-modal-header">
        <div>
          <h3>${t('新增檢具', 'Thêm thiết bị')}</h3>
          <p class="routine-source">
            ${t('所屬類別：', 'Nhóm cha: ')}${h(cat ? `${cat.code} · ${cat.name}` : '—')}　|　
            ${t('所屬子類別：', 'Phân nhóm: ')}${h(sub?.name || '—')}　|　
            ${t('所屬規格群組：', 'Nhóm quy cách: ')}${h(group ? `${group.id} · ${group.name || group.nameVi || group.nameZh || ''}` : '—')}
          </p>
        </div>
        <div class="routine-modal-tools">
          <button type="button" id="routine-add-close" title="${t('關閉', 'Đóng')}">✕</button>
        </div>
      </div>

      <div class="routine-modal-body">
        ${form.error ? `<div class="routine-validation">${h(form.error)}</div>` : ''}

        <div class="routine-edit-grid">
          <label>
            ${t('固定資產編號（必填）', 'Mã TSCĐ (Bắt buộc)')}
            <input type="text" id="routine-add-asset-code" data-i18n-skip="true" value="${h(form.assetCode)}" placeholder="例：G7T001" autofocus>
          </label>

          <label>
            ${t('個別設備標記（分件號，必填）', 'Ký hiệu thiết bị (Bắt buộc)')}
            <input type="text" id="routine-add-piece-mark-input" data-i18n-skip="true" value="${h(form.pieceMark || '')}" required>
          </label>

          <label class="wide">
            ${t('名稱（必填）', 'Tên (Bắt buộc)')}
            <input type="text" id="routine-add-name" data-i18n-skip="true" value="${h(form.name)}" placeholder="${t('請輸入檢具名稱（保留原文）', 'Nhập tên thiết bị')}">
          </label>

          <label class="wide">
            ${t('所屬規格群組（必填）', 'Nhóm quy cách (Bắt buộc)')}
            <select id="routine-add-group-select">
              ${tree.groups.filter(g => g.subcategoryId === group?.subcategoryId).map(g => `<option value="${h(g.id)}" ${g.id === (form.groupId || selectedGroup) ? 'selected' : ''}>${h(g.id)} · ${h(g.name || g.nameVi || g.nameZh || '')}</option>`).join('')}
            </select>
          </label>

          <label>
            ${t('數量（固定 1）', 'Số lượng (Cố định 1)')}
            <input type="number" value="1" disabled class="routine-readonly">
          </label>

          <label>
            ${t('單位（必填）', 'Đơn vị (Bắt buộc)')}
            <select id="routine-add-unit">
              ${Object.entries(unitLabels).map(([code, labels]) => `<option value="${code}" ${code === form.unit ? 'selected' : ''}>${label(labels)}</option>`).join('')}
            </select>
          </label>

          <label>
            ${t('擁有人／保管部門', 'Người sở hữu / Bộ phận')}
            <input type="text" id="routine-add-owner" data-i18n-skip="true" value="${h(form.owner)}" placeholder="${t('保管人或部門名稱', 'Người giữ hoặc bộ phận')}">
          </label>

          <label>
            ${t('設備狀態', 'Trạng thái thiết bị')}
            <select id="routine-add-enabled">
              <option value="true" ${form.enabled ? 'selected' : ''}>${t('啟用', 'Đang dùng')}</option>
              <option value="false" ${!form.enabled ? 'selected' : ''}>${t('未啟用', 'Chưa kích hoạt')}</option>
            </select>
          </label>

          <label>
            ${t('資料核對', 'Đối soát dữ liệu')}
            <select id="routine-add-confirmed">
              <option value="false" ${!form.confirmed ? 'selected' : ''}>${t('待確認', 'Chờ xác nhận')}</option>
              <option value="true" ${form.confirmed ? 'selected' : ''}>${t('已核對', 'Đã đối soát')}</option>
            </select>
          </label>

          <label class="wide">
            ${t('校正方式', 'Phương thức hiệu chuẩn')}
            <select id="routine-add-calibration-method">
              ${Object.entries(methodLabels).map(([code, labels]) => `<option value="${code}" ${code === form.calibrationMethod ? 'selected' : ''}>${label(labels)}</option>`).join('')}
            </select>
          </label>

          <div id="routine-add-calibration-container" class="wide" style="display:contents">
            ${renderAddCalibrationFields(form)}
          </div>

          <label>
            ${t('入庫日期', 'Ngày nhập kho')}
            <input type="date" id="routine-add-intake-date" value="${h(form.intakeDate)}">
          </label>

          <label class="wide">
            ${t('規格／常用檢測用途／參考條件', 'Quy cách / Mục đích kiểm tra')}
            <textarea id="routine-add-spec" data-i18n-skip="true">${h(form.spec)}</textarea>
          </label>

          <label class="wide">
            ${t('備註', 'Ghi chú')}
            <textarea id="routine-add-notes" data-i18n-skip="true">${h(form.notes)}</textarea>
          </label>

          <div class="routine-photo-field wide">
            ${form.pendingPhoto ? `<img src="${h(form.pendingPhoto.url)}" alt="${t('設備照片', 'Ảnh thiết bị')}">` : `<span class="routine-photo-empty">${t('尚無照片', 'Chưa có ảnh')}</span>`}
            <div>
              <label>${t('上傳照片', 'Tải ảnh')}<input type="file" id="routine-add-photo-input" accept="image/*"></label>
              ${form.pendingPhoto ? `<button type="button" id="routine-add-photo-remove">${t('移除照片', 'Xóa ảnh')}</button>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="routine-modal-footer">
        <button type="button" class="button ghost" id="routine-add-cancel">${t('取消', 'Hủy')}</button>
        <button type="button" class="button signal" id="routine-add-submit" ${busy || !editable() ? 'disabled' : ''}>${t('新增至草稿', 'Thêm vào bản nháp')}</button>
      </div>
    </section></div>`;
  }

  function openNodeDialog(kind, id = '') {
    if (!editable()) return;
    const tree = structure(visible());
    if (kind === 'subcategory' && !selectedCategory) {
      message = t('請先選取上層類別，再新增子類別。', 'Vui lòng chọn nhóm cha trước.');
      render();
      return;
    }
    if (kind === 'group' && !selectedSubcategory) {
      message = t('請先選取上層子類別，再新增規格群組。', 'Vui lòng chọn phân nhóm trước.');
      render();
      return;
    }

    let prior = null;
    if (id) {
      const collection = kind === 'category' ? working.categories : kind === 'subcategory' ? working.subcategories : working.groups;
      prior = collection.find(item => item.id === id);
    }

    const parentCat = tree.categories.find(c => c.id === selectedCategory);
    const parentSub = tree.subcategories.find(s => s.id === selectedSubcategory);
    const parentGrp = tree.groups.find(g => g.id === selectedGroup);

    equipmentEditRequest++;
    nodeDialog = {
      kind,
      id,
      prior,
      parentCategoryId: parentCat?.id || '',
      parentSubcategoryId: parentSub?.id || '',
      parentCategory: parentCat ? `${parentCat.code} · ${parentCat.name}` : '',
      parentSubcategory: parentSub?.name || '',
      parentGroup: parentGrp ? `${parentGrp.id} · ${parentGrp.name || parentGrp.nameVi || parentGrp.nameZh || ''}` : '',
      name: prior?.name || prior?.nameVi || prior?.nameZh || '',
      spec: prior?.spec || '',
      photoId: prior?.photoId || '',
      pendingPhoto: pendingPhotos.get(prior?.id) || null,
      photoRemoved: false,
      error: '',
    };
    render();
  }

  function cancelNodeDialog() {
    const url = nodeDialog?.pendingPhoto?.url;
    // Applied/unknown writes may still own this preview; only release an
    // untransferred dialog preview, never the pending draft's recovery data.
    if (url && ![...pendingPhotos.values()].some(photo => photo.url === url)) URL.revokeObjectURL(url);
    nodeDialog = null;
    render();
  }

  async function confirmNodeDialog() {
    if (!nodeDialog || !editable() || busy) return;
    const dialog=nodeDialog;
    const { kind, prior } = dialog;

    const nameInput = host.querySelector('#routine-dialog-name');
    const specInput = host.querySelector('#routine-dialog-spec');
    const name = String(nameInput?.value || '').trim();
    const spec = String(specInput?.value || '').trim();

    if (!name) {
      nodeDialog.error = t('名稱不可空白', 'Tên không được để trống');
      render();
      return;
    }

    const collection = kind === 'category' ? working.categories : kind === 'subcategory' ? working.subcategories : working.groups;
    if(prior&&!collection.includes(prior)){
      nodeDialog.error=t('此項目已變更或移除；輸入仍保留，請重新核對，不會自動新增。','Mục này đã đổi hoặc bị xóa; giữ dữ liệu nhập để đối chiếu, không tự tạo lại.');render();return;
    }
    if(!prior&&kind!=='category'&&(!working.categories.some(row=>row.id===dialog.parentCategoryId)||kind==='group'&&!working.subcategories.some(row=>row.id===dialog.parentSubcategoryId&&row.categoryId===dialog.parentCategoryId))){
      dialog.error=t('原上層分類已變更或移除；輸入仍保留，請重新核對。','Nhóm cha gốc đã đổi hoặc bị xóa; giữ dữ liệu nhập để đối chiếu.');render();return;
    }
    if (prior) {
      prior.name = name;
      if (kind === 'group') prior.spec = spec;
      if (nodeDialog.pendingPhoto) {
        pendingPhotos.set(prior.id, nodeDialog.pendingPhoto);
        prior.photoId = '';
      } else if (nodeDialog.photoRemoved) {
        pendingPhotos.delete(prior.id);
        prior.photoId = '';
      }
    } else if (kind === 'category') {
      const maximum = working.categories.reduce((max, item) => Math.max(max, Number(String(item.code).match(/^C(\d+)$/)?.[1]) || 0), 0);
      const code = `C${String(maximum + 1).padStart(2, '0')}`;
      const newId = crypto.randomUUID();
      const rec = { id: newId, code, name, photoId: '' };
      if (nodeDialog.pendingPhoto) pendingPhotos.set(newId, nodeDialog.pendingPhoto);
      collection.push(rec);
      dialog.prior=rec;dialog.id=newId; // RAM identity only; delivery may still be unknown.
      selectedCategory = newId; selectedSubcategory = ''; selectedGroup = '';
    } else if (kind === 'subcategory') {
      const newId = crypto.randomUUID();
      const rec = { id: newId, categoryId: dialog.parentCategoryId, name, photoId: '' };
      if (nodeDialog.pendingPhoto) pendingPhotos.set(newId, nodeDialog.pendingPhoto);
      collection.push(rec);
      dialog.prior=rec;dialog.id=newId; // RAM identity only; delivery may still be unknown.
      selectedCategory = rec.categoryId; selectedSubcategory = newId; selectedGroup = '';
    } else {
      const newId = crypto.randomUUID();
      const rec = { id: newId, categoryId: dialog.parentCategoryId, subcategoryId: dialog.parentSubcategoryId, name, spec, notes: '', photoId: '' };
      if (nodeDialog.pendingPhoto) pendingPhotos.set(newId, nodeDialog.pendingPhoto);
      collection.push(rec);
      dialog.prior=rec;dialog.id=newId; // RAM identity only; delivery may still be unknown.
      selectedCategory = rec.categoryId; selectedSubcategory = rec.subcategoryId; selectedGroup = newId;
    }

    if(dialog.comparisonBasis){
      const seen=dialog.comparisonBasis,before=seen.generation===syncGeneration&&syncBase?.[seen.key]?.find(row=>row.id===seen.id);
      if(!before)throw Error('STALE_GENERATION');
      for(const [field,value]of Object.entries(seen.fields)){if(value.present)before[field]=clone(value.value);else delete before[field];}
      delete dialog.comparisonBasis;
    }
    syncHierarchy();
    dialog.name=name;dialog.spec=spec;
    const sentDialog=JSON.stringify(dialog);
    if(!await writeShared('apply'))return;
    if(nodeDialog!==dialog||JSON.stringify(dialog)!==sentDialog)return;
    nodeDialog = null;
    render();
  }

  async function deleteNode(kind, id) {
    if (!editable()) return;
    const collection = kind === 'category' ? working.categories : kind === 'subcategory' ? working.subcategories : working.groups;
    const item = collection.find(value => value.id === id);
    if (!item) return;
    const children = kind === 'category' ? (working.subcategories || []).filter(value => value.categoryId === id) :
      kind === 'subcategory' ? (working.groups || []).filter(value => value.subcategoryId === id) : (working.equipment || []).filter(value => value.groupId === id);
    if (children.length) {
      const kindNames = {
        category: t('子類別', 'phân nhóm'),
        subcategory: t('規格群組', 'nhóm quy cách'),
        group: t('檢具設備', 'thiết bị'),
      };
      const itemName = item.code ? `${item.code} · ${item.name}` : (item.name || item.nameVi || item.nameZh || item.id);
      message = t(`下階已有資料，故不能刪除。「${itemName}」仍有 ${children.length} 筆${kindNames[kind]}（含未啟用、待確認及被篩選隱藏的資料）。`, `Không thể xóa vì cấp dưới đã có dữ liệu. "${itemName}" còn ${children.length} mục ${kindNames[kind]} (bao gồm chưa kích hoạt, chờ xác nhận và bị ẩn lọc).`);
      render();
      return;
    }
    const displayNameStr = item.code ? `${item.code} · ${item.name}` : (item.name || item.nameVi || item.nameZh || item.id);
    if (!confirm(t(`確定刪除【${displayNameStr}】？`, `Bạn có chắc muốn xóa 【${displayNameStr}】?`))) return;
    if (!confirm(t(`再次確認：將從目前草稿刪除【${displayNameStr}】，是否繼續？`, `Xác nhận lần nữa: sẽ xóa 【${displayNameStr}】 khỏi bản nháp hiện tại, tiếp tục?`))) return;
    collection.splice(collection.indexOf(item), 1);
    pendingPhotos.delete(id);
    if (kind === 'category') { selectedCategory = ''; selectedSubcategory = ''; selectedGroup = ''; }
    if (kind === 'subcategory') { selectedSubcategory = ''; selectedGroup = ''; }
    if (kind === 'group') selectedGroup = '';
    message = t(`已從目前草稿刪除【${displayNameStr}】，尚未保存至伺服器。`, `Đã xóa 【${displayNameStr}】 khỏi bản nháp hiện tại, chưa lưu lên máy chủ.`);
    if(await writeShared('apply'))render();
  }

  async function deleteEquipment(id) {
    if (!editable() || !permitted('master.delete') || referenceAction) return;
    const item = (working?.equipment || []).find(record => record.id === id);
    if (!item) return;
    const actorId = identity()?.id, originalWorking = working,
      originalGeneration = syncGeneration, originalVersion = selectedVersionId;
    const sameContext = () => identity()?.id === actorId && controlActor === actorId &&
      working === originalWorking && syncGeneration === originalGeneration &&
      selectedVersionId === originalVersion && editable() && permitted('master.delete') &&
      working.equipment.find(record => record.id === id) === item;
    const owner=captureTransferOwner(),before=JSON.stringify(item),action={id,owner,controller:new AbortController()};
    referenceAction=action;
    const timer=setTimeout(()=>action.controller.abort(),45000);
    message=t('正在檢查四個品質模組的引用；檢查完成前不會刪除。','Đang kiểm tra tham chiếu bốn mô-đun; chưa xóa trước khi kiểm tra xong.');
    render();
    let refs;
    try {
      // A display cache may be stale or partial; destructive actions require a
      // complete fresh check and retain their original actor/draft context.
      refs = await queryAllQualityReferences(id, { strict: true, signal:action.controller.signal });
      if(referenceAction===action)message=t('引用檢查已完成；尚未刪除。','Đã kiểm tra tham chiếu; chưa xóa.');
    } catch {
      if (sameContext()&&referenceAction===action&&transferOwnerCurrent(owner)) {
        message = t('無法確認品質標準引用；保留草稿，請重新載入核對後再操作。', 'Không thể xác minh tham chiếu tiêu chuẩn; giữ bản nháp, hãy tải lại và đối chiếu trước khi tiếp tục.');
      }
      return;
    } finally {clearTimeout(timer);if(referenceAction===action){referenceAction=null;if(sameContext()&&transferOwnerCurrent(owner))render();}}
    if (!sameContext()||action.controller.signal.aborted||!transferOwnerCurrent(owner)||JSON.stringify(item)!==before) return;
    equipmentRefCache.set(id, refs);
    const hasActiveRefs = (refs.fqc.active.length + refs.iqc.active.length + refs.ipqcC.active.length + refs.ipqcAB.active.length) > 0;
    const hasPendingRefs = (refs.fqc.pending.length + refs.iqc.pending.length + refs.ipqcC.pending.length + refs.ipqcAB.pending.length) > 0;
    const hasDraftRefs = (refs.fqc.draft.length + refs.iqc.draft.length + refs.ipqcC.draft.length + refs.ipqcAB.draft.length) > 0;

    if (hasActiveRefs || hasPendingRefs || hasDraftRefs) {
      message=t('品質標準仍有引用；未刪除。','Tiêu chuẩn vẫn tham chiếu; chưa xóa.');render();
      const refList = [];
      if (refs.fqc.active.length || refs.fqc.pending.length || refs.fqc.draft.length) {
        const fItems = [...refs.fqc.active, ...refs.fqc.pending, ...refs.fqc.draft].map(it => `${it.checkNo} (${status(it.status)})`).join('、');
        refList.push(`FQC：${fItems}`);
      }
      if (refs.iqc.active.length || refs.iqc.pending.length || refs.iqc.draft.length) {
        const iItems = [...refs.iqc.active, ...refs.iqc.pending, ...refs.iqc.draft].map(it => `${it.checkNo} (${status(it.status)})`).join('、');
        refList.push(`IQC：${iItems}`);
      }
      if (refs.ipqcC.active.length || refs.ipqcC.pending.length || refs.ipqcC.draft.length) {
        const cItems = [...refs.ipqcC.active, ...refs.ipqcC.pending, ...refs.ipqcC.draft].map(it => `${it.checkNo} (${status(it.status)})`).join('、');
        refList.push(`IPQC-C：${cItems}`);
      }
      if (refs.ipqcAB.active.length || refs.ipqcAB.pending.length || refs.ipqcAB.draft.length) {
        const abItems = [...refs.ipqcAB.active, ...refs.ipqcAB.pending, ...refs.ipqcAB.draft].map(it => `${it.checkNo} (${status(it.status)})`).join('、');
        refList.push(`IPQC-AB：${abItems}`);
      }
      alert(t(
        `該設備目前仍被下列品質標準引用（生效／待審／草稿），禁止刪除！\n\n${refList.join('\n')}\n\n請先使用「替換設備」將標準移轉至其他設備後再進行操作。`,
        `Thiết bị này đang được tham chiếu bởi các tiêu chuẩn sau, không thể xóa!\n\n${refList.join('\n')}\nVui lòng chuyển tiêu chuẩn trước.`
      ));
      return;
    }

    const cannotDelete = !!item.sourceRow || !!item.effectiveAt || (active()?.equipment || []).some(record => record.id === id);
    if (cannotDelete) {
      message = t(
        '已生效或來源檢具不可刪除；如已停用，請於編輯表單中將設備狀態改為「未啟用」。',
        'Thiết bị đã hiệu lực hoặc từ nguồn không thể xóa; nếu ngưng dùng, hãy đổi trạng thái thành "Chưa kích hoạt" trong biểu mẫu.'
      );
      render();
      return;
    }

    const title = `${item.assetCode} · ${displayName(item) || item.pieceMark}`;
    if (!confirm(t(`確定刪除【${title}】？`, `Bạn có chắc muốn xóa 【${title}】?`))) return;
    if (!confirm(t(`再次確認：將從目前草稿刪除【${title}】，是否繼續？`, `Xác nhận lần nữa: sẽ xóa 【${title}】 khỏi bản nháp hiện tại, tiếp tục?`))) return;
    if (!sameContext()) return;
    const idx = working.equipment.findIndex(record => record.id === id);
    if (idx !== -1) working.equipment.splice(idx, 1);
    pendingPhotos.delete(id);
    if (selectedEquipmentId === id) selectedEquipmentId = '';
    if (editingEquipmentId === id) { editingEquipmentId = ''; formSnapshot = null; }
    message = t(`已從目前草稿刪除【${title}】，尚未保存至伺服器。`, `Đã xóa 【${title}】 khỏi bản nháp hiện tại, chưa lưu lên máy chủ.`);
    if(await writeShared('apply'))render();
  }

  async function openEditEquipment(id) {
    if (!editable() || !routineTabIsActive() || editingEquipmentId || addingEquipment || nodeDialog || viewDialog || transferDialog) return;
    if (!(visible()?.equipment || []).some(record => record.id === id)) return;
    const request = ++equipmentEditRequest, actor = identity()?.id, epoch = window.ProcessSync?.identityGeneration?.(), page = host,
      versionId = selectedVersionId, generation = syncGeneration, workflowGeneration = control?.workflow?.generation;
    // Reference sections load independently after the editor is painted.
    if (request !== equipmentEditRequest || host !== page || !routineTabIsActive() || identity()?.id !== actor ||
        window.ProcessSync?.identityGeneration?.() !== epoch || controlActor !== actor || selectedVersionId !== versionId ||
        syncGeneration !== generation || control?.workflow?.generation !== workflowGeneration || !editable() ||
        editingEquipmentId || addingEquipment || nodeDialog || viewDialog || transferDialog) return;
    const item = (visible()?.equipment || []).find(record => record.id === id);
    if (!item) return;
    addingEquipment = false;
    newEquipmentForm = null;
    editingEquipmentId = id;
    selectedEquipmentId = id;
    formSnapshot = clone(item);formPendingPhoto=pendingPhotos.get(item.id)||null;
    render();
  }

  function openAddEquipmentDialog() {
    if (!editable()) return;
    const tree = structure(visible());
    if (!selectedCategory) {
      alert(t('請先選取上方類別與子類別，再新增檢具。', 'Vui lòng chọn nhóm và phân nhóm trước khi thêm thiết bị.'));
      host.querySelector('.routine-hierarchy')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!selectedSubcategory) {
      alert(t('請先選取上方子類別，再新增檢具。', 'Vui lòng chọn phân nhóm trước khi thêm thiết bị.'));
      host.querySelector('.routine-hierarchy')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const availableGroups = tree.groups.filter(g => g.subcategoryId === selectedSubcategory);
    if (!availableGroups.length) {
      alert(t('目前子類別尚無規格群組，請先點擊上方「＋新增規格群組」後再新增檢具。', 'Phân nhóm này chưa có nhóm quy cách, vui lòng thêm nhóm quy cách trước.'));
      host.querySelector('.routine-hierarchy')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (!selectedGroup || !availableGroups.some(g => g.id === selectedGroup)) {
      selectedGroup = availableGroups[0].id;
    }
    equipmentEditRequest++;
    editingEquipmentId = '';
    formSnapshot = null;
    addingEquipment = true;
    newEquipmentOwner = {actor:identity()?.id,epoch:window.ProcessSync?.identityGeneration?.(),generation:syncGeneration};
    newEquipmentForm = {
      groupId: selectedGroup,
      assetCode: '',
      pieceMark: '',
      name: '',
      quantity: 1,
      unit: '個',
      owner: '',
      enabled: true,
      confirmed: false,
      calibrationMethod: 'none',
      calibrationCycle: '',
      customCycle: '',
      calibratedAt: '',
      expiresAt: '',
      intakeDate: '',
      spec: '',
      notes: '',
      pendingPhoto: null,
      error: '',
    };
    render();
  }

  async function confirmAddEquipment() {
    if (!addingEquipment || !newEquipmentForm || !editable() || busy) return;
    const root = host,form=newEquipmentForm,lifecycle=equipmentEditRequest,actor=identity(),epoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.(),generation=control?.workflow?.generation,versionId=selectedVersionId,client=sharedClient;
    const ownsForm=()=>host===root&&newEquipmentForm===form&&equipmentEditRequest===lifecycle&&identity()===actor&&controlActor===actor?.id&&window.ProcessSync?.identityGeneration?.()===epoch&&!window.ProcessSync?.requiresReload&&(!!delivery&&window.ProcessSync?.isCurrentDelivery?.(delivery)===true)&&control?.workflow?.generation===generation&&selectedVersionId===versionId&&sharedClient===client;
    if(form.submittedEquipmentId&&sharedClient?.hasUnknown()){await writeShared('apply');return;}

    const assetCode = String(root.querySelector('#routine-add-asset-code')?.value || '').trim().toUpperCase();
    const mark = String(root.querySelector('#routine-add-piece-mark-input')?.value || '').trim();
    const name = String(root.querySelector('#routine-add-name')?.value || '').trim();
    const unit = root.querySelector('#routine-add-unit')?.value || '個';
    const owner = String(root.querySelector('#routine-add-owner')?.value || '').trim();
    const enabled = root.querySelector('#routine-add-enabled')?.value === 'true';
    const confirmed = root.querySelector('#routine-add-confirmed')?.value === 'true';
    const calibrationMethod = root.querySelector('#routine-add-calibration-method')?.value || 'none';
    const calibrationCycle = root.querySelector('#routine-add-calibration-cycle')?.value || '';
    const customCycle = String(root.querySelector('#routine-add-custom-cycle')?.value || '').trim();
    const calibratedAt = String(root.querySelector('#routine-add-calibrated-at')?.value || '');
    const expiresAt = String(root.querySelector('#routine-add-expires-at')?.value || '');
    const intakeDate = String(root.querySelector('#routine-add-intake-date')?.value || '');
    const spec = String(root.querySelector('#routine-add-spec')?.value || '').trim();
    const notes = String(root.querySelector('#routine-add-notes')?.value || '').trim();

    Object.assign(newEquipmentForm, {
      assetCode, pieceMark:mark, name, unit, owner, enabled, confirmed,
      calibrationMethod, calibrationCycle, customCycle,
      calibratedAt, expiresAt, intakeDate, spec, notes
    });

    if (!/^[A-Z0-9-]{2,40}$/.test(assetCode)) {
      newEquipmentForm.error = t('固定資產編號格式錯誤（需為 2-40 碼英數字／橫線）', 'Mã TSCĐ không đúng định dạng (2-40 ký tự chữ số/gạch nối)');
      render();
      return;
    }
    const duplicate = working.equipment.some(row => row.id !== newEquipmentForm.submittedEquipmentId &&
      identityLabel(row.assetCode) === assetCode && identityLabel(row.pieceMark) === identityLabel(mark));
    if (!mark || duplicate) {
      newEquipmentForm.error = displayDraftError(mark ? 'EQUIPMENT_PAIR_DUPLICATE' : 'EQUIPMENT_PIECE_REQUIRED');
      render();
      root.querySelector('#routine-add-piece-mark-input')?.focus();
      return;
    }
    if (!name) {
      newEquipmentForm.error = t('名稱不可空白', 'Tên không được để trống');
      render();
      return;
    }
    if (!['個', '支', '台', '組'].includes(unit)) {
      newEquipmentForm.error = t('請選擇有效單位', 'Vui lòng chọn đơn vị hợp lệ');
      render();
      return;
    }
    if (calibrationMethod !== 'none') {
      if (calibratedAt && !/^\d{4}-\d{2}-\d{2}$/.test(calibratedAt)) {
        newEquipmentForm.error = t('最近校正日期格式錯誤', 'Ngày hiệu chuẩn không đúng định dạng');
        render();
        return;
      }
      if (expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
        newEquipmentForm.error = t('有效期限格式錯誤', 'Hạn hiệu chuẩn không đúng định dạng');
        render();
        return;
      }
    }

    busy = true;
    try {
      const tree = structure(visible());
      const chosenGroup = root.querySelector('#routine-add-group-select')?.value || form.groupId;
      const group = tree.groups.find(g => g.id === chosenGroup);
      if (!group) throw new Error(t('所選規格群組無效', 'Nhóm quy cách không hợp lệ'));
      selectedGroup = group.id;

      const existing=form.submittedEquipmentId&&working.equipment.find(row=>row.id===form.submittedEquipmentId);
      if(form.submittedEquipmentId&&(!existing||existing.assetCode!==assetCode||existing.pieceMark!==mark))throw Error(t('已送出這筆檢具；保留輸入，請先核對原筆資料與固定資產編號。','Thiết bị này đã được gửi; giữ dữ liệu nhập, hãy đối chiếu bản ghi và mã tài sản trước.'));
      const newId = existing?.id||crypto.randomUUID();

      const newRecord = {
        id: newId,
        assetCode,
        pieceMark: mark,
        groupId: selectedGroup,
        categoryId: group.categoryId || selectedCategory,
        subcategoryId: group.subcategoryId || selectedSubcategory,
        categoryCode: group.categoryCode || '',
        category: group.category || '',
        subcategory: group.subcategory || '',
        name,
        quantity: 1,
        unit,
        owner,
        enabled,
        confirmed,
        calibrationMethod,
        calibrationCycle: calibrationMethod === 'none' ? '' : calibrationCycle,
        customCycle: calibrationMethod === 'none' || calibrationCycle !== 'custom' ? '' : customCycle,
        calibratedAt: calibrationMethod === 'none' ? '' : calibratedAt,
        expiresAt: calibrationMethod === 'none' ? '' : expiresAt,
        intakeDate,
        spec,
        notes,
        photoId: existing?.photoId||'',
        sourceRow: null,
        effectiveAt: null,
      };

      if (newEquipmentForm.pendingPhoto) {
        pendingPhotos.set(newId, newEquipmentForm.pendingPhoto);
      }

      if (!control.reservedMarks) control.reservedMarks = {};
      if (!control.reservedMarks[assetCode]) control.reservedMarks[assetCode] = [];
      if (!control.reservedMarks[assetCode].includes(mark)) {
        control.reservedMarks[assetCode].push(mark);
      }

      if(existing)Object.assign(existing,newRecord);else working.equipment.push(newRecord);
      form.submittedEquipmentId=newId;
      syncHierarchy();
      const sentForm=JSON.stringify(form);
      busy=false;
      const result=await writeShared('apply');
      if(!ownsForm())return;
      if(!result){form.error=message;return;}
      if(JSON.stringify(form)!==sentForm)return;

      addingEquipment = false;
      newEquipmentForm = null;
      selectedEquipmentId = newId;
      editingEquipmentId = '';
      formSnapshot = null;
      message = t('新增檢具已留在本機，請存取草稿。', 'Thiết bị mới chỉ ở máy này; hãy lưu bản nháp.');
      render();
    } catch (err) {
      if(ownsForm()){form.error = err.message || t('新增失敗', 'Thêm thất bại');render();}
    } finally {
      if(ownsForm()&&!writeShared.attempt)busy = false;
    }
  }

  const isFormDirty = () => {
    if (!formSnapshot || !host) return false;
    for(const field of identityFields){
      const input=host.querySelector('#routine-editor [data-field="'+field+'"]');
      if(input && input.value!==String(formSnapshot[field]??''))return true;
    }
    const curName = host.querySelector('#routine-editor [data-field="name"]')?.value?.trim();
    if (curName !== undefined && curName !== String(displayName(formSnapshot)).replace(/[\r\n]/g, '').trim()) return true;
    const proposedGroup = formDestinations.get(formSnapshot);
    if (proposedGroup && ['categoryId','subcategoryId','groupId'].some(key=>proposedGroup[key] !== formSnapshot[key])) return true;
    const curUnit = host.querySelector('#routine-editor [data-select="unit"]')?.value;
    if (curUnit && curUnit !== unitCode(formSnapshot.unit)) return true;
    const curOwner = host.querySelector('#routine-editor [data-field="owner"]')?.value?.trim();
    if (curOwner !== undefined && curOwner !== (formSnapshot.owner || '')) return true;
    const curEnabled = host.querySelector('#routine-editor [data-select="enabled"]')?.value;
    if (curEnabled && (curEnabled === 'true') !== !!formSnapshot.enabled) return true;
    const curConfirmed = host.querySelector('#routine-editor [data-select="confirmed"]')?.value;
    if (curConfirmed && (curConfirmed === 'true') !== !!formSnapshot.confirmed) return true;
    const curMethod = host.querySelector('#routine-editor [data-select="calibrationMethod"]')?.value;
    if (curMethod && curMethod !== methodCode(formSnapshot.calibrationMethod)) return true;
    const curCalAt = host.querySelector('#routine-editor [data-field="calibratedAt"]')?.value;
    if (!calibrationFacts[formSnapshot.id]?.locked && curCalAt !== undefined && curCalAt !== (formSnapshot.calibratedAt || '')) return true;
    const curExpAt = host.querySelector('#routine-editor [data-field="expiresAt"]')?.value;
    if (!calibrationFacts[formSnapshot.id]?.locked && curExpAt !== undefined && curExpAt !== (formSnapshot.expiresAt || '')) return true;
    const curSpec = host.querySelector('#routine-editor [data-field="spec"]')?.value;
    if (curSpec !== undefined && curSpec !== (formSnapshot.spec || '')) return true;
    const curNotes = host.querySelector('#routine-editor [data-field="notes"]')?.value;
    if (curNotes !== undefined && curNotes !== (formSnapshot.notes || '')) return true;
    return false;
  };

  function selectEquipmentInList(item) {
    const id = item.id;
    if (search) {
      const matchesSearch = matchingRows(visible()?.equipment || []).some(e => e.id === id);
      if (!matchesSearch) {
        search = '';
        const searchInput = host.querySelector('#routine-search');
        if (searchInput) searchInput.value = '';
      }
    }

    const group = structure(visible()).groups.find(value => value.id === item.groupId);
    if (group) {
      selectedCategory = group.categoryId || '';
      selectedSubcategory = group.subcategoryId || '';
      selectedGroup = group.id || '';
    }

    selectedEquipmentId = id;
    const index = matchingRows(visible()?.equipment || []).findIndex(row => row.id === id);
    if (index >= 0) equipmentPage = Math.floor(index / 20) + 1;
  }

  function locateEquipment(id, field = '') {
    if (!editable()) {
      alert(t('目前非可編輯草稿狀態，無法修改設備。', 'Hiện không ở trạng thái nháp có thể sửa, không thể chỉnh sửa thiết bị.'));
      return;
    }
    const item = (visible()?.equipment || []).find(value => value.id === id);
    if (!item) {
      alert(t('找不到該設備資料', 'Không tìm thấy dữ liệu thiết bị'));
      return;
    }

    if (editingEquipmentId && editingEquipmentId !== id && isFormDirty()) {
      if (!confirm(t('目前表單尚有未套用的修改，確定放棄並前往修正其他設備？', 'Biểu mẫu hiện tại có thay đổi chưa áp dụng, bạn có chắc muốn hủy để sửa thiết bị khác?'))) {
        return;
      }
      const curEditing = (working?.equipment || []).find(e => e.id === editingEquipmentId);
      if (curEditing && formSnapshot) Object.assign(curEditing, formSnapshot);
    }

    equipmentEditRequest++;
    selectEquipmentInList(item);
    editingEquipmentId = id;
    addingEquipment = false;
    newEquipmentForm = null;
    formSnapshot = clone(item);formPendingPhoto=pendingPhotos.get(item.id)||null;
    render();

    requestAnimationFrame(() => {
      const drawer = host.querySelector('#routine-editor');
      if (!drawer) return;
      let targetEl = null;
      if (field) {
        targetEl = drawer.querySelector(`[data-field="${field}"]`) ||
                   drawer.querySelector(`[data-select="${field}"]`) ||
                   (field === 'groupId' ? drawer.querySelector('#routine-edit-category') : null) ||
                   (field === 'calibrationMethod' ? drawer.querySelector('#routine-edit-calibration-method') : null);
      }
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetEl.focus?.();
        targetEl.classList.add('routine-field-highlight');
        setTimeout(() => {
          targetEl.classList.remove('routine-field-highlight');
        }, 3000);
      } else {
        drawer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // View-only readers do not populate editor models or strict replacement caches.
  const viewReferenceKinds={fqc:{label:'FQC'},iqc:{label:'IQC'},ipqcAB:{label:'IPQC-AB'},ipqcC:{label:'IPQC-C'},planned:{label:''}};
  async function fetchReferencePreview(sourceId) {
    const response=await fetch('/api/quality-equipment-replacement?sourceId='+encodeURIComponent(sourceId),
      {cache:'no-store',headers:headers(),signal:AbortSignal.timeout(45000)});
    const data=await response.json();
    if(!response.ok)throw Error(data?.error || 'HTTP '+response.status);
    if(!Number.isSafeInteger(data?.revision)||data.referenceSourceId!==sourceId||!Array.isArray(data.modules))throw Error('EQUIPMENT_REFERENCE_RESPONSE_INVALID');
    return data;
  }

  const referenceModule={fqc:'fqc',iqc:'iqc',ipqcAB:'ipqc-ab',ipqcC:'ipqc-c'};
  function effectiveRows(preview,moduleId,sourceId){
    const entry=preview.modules.find(row=>row.moduleId===moduleId);
    if(entry?.referenceVisible===false)throw Error('EQUIPMENT_REFERENCE_ACCESS_UNCONFIRMED');
    if(entry?.connected!==true || !Array.isArray(entry.items))throw Error('EQUIPMENT_REFERENCE_RESPONSE_INVALID');
    const rows=[],seen=new Set();
    for(const item of entry.items){
      if(!item || typeof item.id!=='string' || !item.id || typeof item.itemId!=='string' || !item.itemId || typeof item.activeEquipmentId!=='string' || typeof item.draftEquipmentId!=='string' || typeof item.selectable!=='boolean')throw Error('EQUIPMENT_REFERENCE_RESPONSE_INVALID');
      if(item.activeEquipmentId!==sourceId)continue;
      const ref=item.effectiveReference;
      if(!ref?.versionId || ref.status!=='approved' || ref.itemId!==item.itemId || ref.scope!==(item.scopeKey||''))throw Error('EQUIPMENT_REFERENCE_RESPONSE_INVALID');
      if(seen.has(item.id))continue;
      seen.add(item.id);rows.push(item);
    }
    return rows;
  }

  let lastReferenceRead=null;
  function changedReferenceRevision(sourceId,next){
    const actorId=identity()?.id,epoch=window.ProcessSync?.identityGeneration?.();
    const prior=lastReferenceRead;
    lastReferenceRead={sourceId,actorId,epoch,revision:next};
    return prior?.sourceId===sourceId && prior.actorId===actorId && prior.epoch===epoch && prior.revision!==next ?
      t('資料修訂已由 '+prior.revision+' 更新為 '+next+'。','Bản sửa dữ liệu đã đổi từ '+prior.revision+' sang '+next+'.'):'';
  }

  function referenceSummary(rows){
    const selectable=rows.filter(row=>row.selectable!==false).length;
    return t('目前生效 · 直接引用 '+rows.length+' 筆，可選 '+selectable+' 筆','Đang hiệu lực · Tham chiếu trực tiếp '+rows.length+', có thể chọn '+selectable);
  }

  function currentPlanned(preview){
    if(!Array.isArray(preview.pending))throw Error('EQUIPMENT_REFERENCE_RESPONSE_INVALID');
    return preview.pending.filter(record=>{
      const entry=preview.modules.find(entry=>entry.moduleId===record.moduleId);
      if(!entry?.connected || entry.referenceVisible===false)return false;
      const scope=record.moduleId==='ipqc-ab'?entry.scopes?.find(entry=>entry.scopeKey===record.scopeKey):entry;
      return ['pending','pending-test'].includes(scope?.openVersion?.status) && scope.openVersion.id===record.pendingVersionId;
    });
  }

  function projectedGroups(preview,kind,id){
    const moduleId=referenceModule[kind],active=effectiveRows(preview,moduleId,id);
    const groups={active:active.map(row=>({...row.effectiveReference,selectable:row.selectable,reason:lockReason(row)})),draft:[],pending:[]};
    const entry=preview.modules.find(row=>row.moduleId===moduleId);
    for(const row of entry.items){
      if(row.draftEquipmentId!==id)continue;
      const bucket=row.openStatus==='draft'?'draft':['pending','pending-test'].includes(row.openStatus)?'pending':null;
      if(!bucket || !row.openVersionId)throw Error('EQUIPMENT_REFERENCE_RESPONSE_INVALID');
      groups[bucket].push({scope:row.scopeKey,itemId:row.itemId,checkNo:row.code,itemName:row.name,versionId:row.openVersionId,versionNumber:row.openVersionNumber,status:row.openStatus,reason:lockReason(row)});
    }
    return groups;
  }

  async function readEffectiveItem(kind,ref,sourceId,revision){
    const query=new URLSearchParams({sourceId,referenceModule:referenceModule[kind],itemId:ref.itemId,versionId:ref.versionId,scope:ref.scope||'',revision:String(revision),referenceState:ref.status==='approved'?'active':'open'});
    const response=await fetch('/api/quality-equipment-replacement?'+query,{cache:'no-store',headers:headers(),signal:AbortSignal.timeout(45000)});
    if(!response.ok)throw Error(response.status===409?t('資料已變更，請重新開啟查詢。','Dữ liệu đã thay đổi; hãy mở lại tra cứu.'):'HTTP '+response.status);
    const data=await response.json(),v=data.version,items=v?.snapshot?.items;
    if(data.revision!==revision || v?.id!==ref.versionId || v.status!==ref.status || !Array.isArray(items) || items.length!==1 ||
      items[0].id!==ref.itemId || items[0].equipmentId!==sourceId || !Array.isArray(v.snapshot.errors))throw Error('EQUIPMENT_REFERENCE_RESPONSE_INVALID');
    return v;
  }
  function lockReason(row){
    if(row.selectable!==false)return '';
    return row.unavailableReason?.includes('待審') ?
      t('待審已鎖定；請依原流程撤回或結案後重新選取。','Đang chờ duyệt; hãy rút theo quy trình hoặc chọn lại sau khi kết thúc.') :
      t(row.unavailableReason || '目前不可編輯','Không có quyền sửa bản nháp của mô-đun đích.');
  }

  function newViewReferences(id){
    const actorId=identity()?.id,epoch=window.ProcessSync?.identityGeneration?.(),delivery=window.ProcessSync?.captureDelivery?.(),version=revision;
    if(!actorId)throw Error('LOGIN_REQUIRED');
    const session={id,states:Object.fromEntries(Object.keys(viewReferenceKinds).map(key=>[key,{status:'unloaded',open:false,result:null,error:'',promise:null,revision:null}]))};
    session.current=()=>viewDialog?.references===session&&viewDialog.data?.id===id&&host?.isConnected&&identity()?.id===actorId&&window.ProcessSync?.identityGeneration?.()===epoch&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery))&&!window.ProcessSync?.requiresReload&&revision===version;
    return session;
  }
  async function readViewReferences(session,kind){
    const row=session?.states[kind],spec=viewReferenceKinds[kind];if(!row||!spec||!session.current())return;
    if(row.promise)return row.promise;
    if(row.status==='loaded'||row.status==='error')return;
    row.status='loading';row.error='';paintViewReferences(session);
    const task=Promise.resolve().then(async()=>{
      try{
        if(!session.previewRequest)session.previewRequest=fetchReferencePreview(session.id).catch(error=>{
          session.previewRequest=null;throw error;
        });
        const preview=await session.previewRequest;
        if(!session.current())return;
        if(!session.seenRevision){
          session.revisionChange=changedReferenceRevision(session.id,preview.revision);
          session.seenRevision=true;
        }
        if(kind==='planned'){
          if(!Array.isArray(preview.pending))throw Error('EQUIPMENT_REFERENCE_RESPONSE_INVALID');
          row.result={planned:currentPlanned(preview).map(r=>({moduleId:r.moduleId,versionId:r.pendingVersionId,versionNumber:r.pendingVersionNumber,itemId:r.itemId,checkNo:r.itemCode||r.itemId,itemName:r.itemName,status:r.status,reason:r.reason}))};
        }else row.result=projectedGroups(preview,kind,session.id);
        row.revision=preview.revision;row.status='loaded';
      }catch(error){if(session.current()){row.status='error';row.error=error?.message||'EQUIPMENT_REFERENCE_READ_FAILED';}}
      finally{row.promise=null;if(session.current())paintViewReferences(session);}
    });row.promise=task;return task;
  }
  function viewReferencesHTML(session){
    if(!session?.current())return '<section data-routine-view-references role="status">'+h(t('頁面狀態已改變；請關閉後重新開啟查看資訊。','Trạng thái đã thay đổi; đóng rồi mở lại thông tin.'))+'</section>';
    const labels={active:t('目前生效中','Đang hiệu lực'),pending:t('主管審核中','Chờ duyệt'),draft:t('草稿中','Bản nháp'),planned:t('待處理替換','Thay thế chờ xử lý')};
    return '<section data-routine-view-references><h4>'+h(t('四種品質標準反向引用','Tham chiếu ngược 4 tiêu chuẩn chất lượng'))+'</h4>'+(session.revisionChange?'<p role="status">'+h(session.revisionChange)+'</p>':'')+'<p>'+h(t('展開查詢目前生效的直接引用。歷史版本可在原模組查閱。','Mở để xem liên kết trực tiếp đang hiệu lực. Bản nháp và chờ duyệt được liệt kê riêng.'))+'</p>'+Object.entries(viewReferenceKinds).map(([kind,spec])=>{
      const row=session.states[kind],label=spec.label||labels.planned;
      let status=t('尚未查詢','Chưa tra cứu'),body='<p>'+h(t('展開此區查詢。','Mở mục này để tra cứu.'))+'</p>';
      if(row.status==='loading'){status=t('查詢中…','Đang tra cứu…');body='<p role="status">'+h(status)+'</p>';}
      if(row.status==='error'){status=t('查詢未完成','Tra cứu chưa hoàn tất');body='<p role="alert">'+h(t('查詢未完成，不代表沒有引用。','Tra cứu chưa hoàn tất, không có nghĩa là không có tham chiếu.'))+' '+h(row.error)+'</p><button type="button" class="button ghost" data-view-ref-retry="'+kind+'">'+h(t('重新查詢（僅讀取）','Tra cứu lại (chỉ đọc)'))+'</button>';}
      if(row.status==='loaded'){
        const planned=kind==='planned',count=(planned?row.result.planned:row.result.active).length;
        status=planned?labels.planned+' · '+count:referenceSummary(row.result.active);
        const groupHTML=(group,rows)=>'<div class="routine-ref-subgroup"><b>'+h(labels[group])+' ('+rows.length+')</b>'+rows.map(item=>
          '<div class="routine-ref-row">'+(group!=='planned'?'<button type="button" class="button ghost" data-view-exact="'+kind+'" data-scope="'+h(item.scope||'')+'" data-vid="'+h(item.versionId)+'" data-iid="'+h(item.itemId)+'">'+h(item.checkNo)+'</button>':'<code>'+h(item.checkNo)+'</code>')+
          '<span data-i18n-skip="true">'+h(item.itemName||'')+'</span><small>V'+h(String(item.versionNumber??'—').replace(/^V/i,''))+' · '+h(item.status)+(item.scope?' · '+h(item.scope):'')+'</small>'+(item.reason?'<small>'+h(item.reason)+'</small>':'')+'</div>').join('')+'</div>';
        body='<small>'+h(t('資料修訂','Bản sửa dữ liệu'))+' '+h(row.revision)+'</small>';
        if(planned)body+=groupHTML('planned',row.result.planned);
        else {
          body+=groupHTML('active',row.result.active);

          const other=Object.entries(row.result).filter(([group,rows])=>group!=='active'&&rows.length);
          if(other.length)body+='<details class="routine-ref-extra"><summary>'+h(t('草稿及待審版本','Bản nháp và chờ duyệt'))+'</summary>'+other.map(([group,rows])=>groupHTML(group,rows)).join('')+'</details>';
        }
        if(row.locator)body+=row.locator;
        if(row.detailError)body+='<p role="alert">'+h(row.detailError)+'</p>';
        body+='<p>'+h(t('完整標準請至對應模組查閱。','Xem tiêu chuẩn đầy đủ tại mô-đun tương ứng.'))+'</p>';
      }
      return '<details class="routine-ref-box" data-view-ref-kind="'+kind+'"'+(row.open?' open':'')+'><summary><b>'+h(label)+'</b> · '+h(status)+'</summary><div class="routine-ref-content">'+body+'</div></details>';
    }).join('')+'</section>';
  }
  function standardLocatorHTML(kind,ref,version){
    const item=version.snapshot.items[0];
    return '<article class="routine-ref-subgroup" aria-live="polite"><b>'+h(viewReferenceKinds[kind].label)+' · '+h(item.checkNo||item.code||item.id)+'</b><p data-i18n-skip="true">'+h(item.standard||item.nameVi||item.name||item.description||'')+'</p><small>'+h(t('版本','Phiên bản'))+' '+h(version.number)+' · '+h(version.id)+' · '+h(ref.itemId)+(ref.scope?' · '+h(ref.scope):'')+'</small></article>';
  }
  function bindViewReferences(root,session=viewDialog?.references){
    if(!root||!session)return;
    root.querySelectorAll('[data-view-ref-kind]').forEach(details=>details.addEventListener('toggle',guardWorking(details,()=>{
      if(!session.current())return;const kind=details.dataset.viewRefKind;session.states[kind].open=details.open;
      if(details.open)void readViewReferences(session,kind);
    })));
    root.querySelectorAll('[data-view-ref-retry]').forEach(button=>button.onclick=guardWorking(button,()=>{
      if(!session.current())return;
      session.closeDetail?.();
      const next=newViewReferences(session.id);
      for(const kind of Object.keys(next.states))next.states[kind].open=session.states[kind].open;
      viewDialog.references=next;
      paintViewReferences(next);
      for(const [kind,row] of Object.entries(next.states))if(row.open)void readViewReferences(next,kind);
    }));
    root.querySelectorAll('[data-view-exact]').forEach(button=>button.onclick=guardWorking(button,async()=>{
      if(!session.current())return;
      const kind=button.dataset.viewExact,row=session.states[kind];
      const ref=Object.values(row.result||{}).flat().find(item=>item.itemId===button.dataset.iid && item.versionId===button.dataset.vid && (item.scope||'')===button.dataset.scope);
      if(!ref)return;
      const serial=session.detailRequest=(session.detailRequest||0)+1;
      const current=()=>session.current() && session.detailRequest===serial;
      try{
        const version=await readEffectiveItem(kind,ref,session.id,row.revision);
        if(!current())return;
        row.detailError='';session.closeDetail?.();
        if(kind==='fqc' && window.FQCQualityAPI?.openAuthorizedItemView)session.closeDetail=window.FQCQualityAPI.openAuthorizedItemView(version,ref.itemId,current);
        else row.locator=standardLocatorHTML(kind,ref,version);
      }catch(error){if(!current())return;row.locator='';row.detailError=error.message;}
      paintViewReferences(session);
    }));

  }
  function paintViewReferences(session){
    if(!session.current())return;
    const area=host.querySelector('[data-routine-view-references]');if(!area)return;
    area.outerHTML=viewReferencesHTML(session);bindViewReferences(host,session);
  }

  async function queryAllQualityReferences(eqId, { strict = false, signal } = {}) {
    const result = {
      fqc: { active: [], pending: [], draft: [], superseded: [] },
      iqc: { active: [], pending: [], draft: [], superseded: [] },
      ipqcC: { active: [], pending: [], draft: [], superseded: [] },
      ipqcAB: { active: [], pending: [], draft: [], superseded: [] }
    };
    if (!eqId) return result;
    const abReferencesURL='/api/ipqc-ab?references='+encodeURIComponent(eqId);
    const readReference=url=>fetch(url,{cache:'no-store',headers:headers(),signal:signal||AbortSignal.timeout(45000)});
    if(!strict){
      try{
        const preview=await fetchReferencePreview(eqId);
        for(const [kind,moduleId] of Object.entries(referenceModule)){
          try{
            const group=projectedGroups(preview,kind,eqId);
            group.revision=preview.revision;group.superseded=[];
            group.planned=currentPlanned(preview).filter(row=>row.moduleId===moduleId).map(row=>({scope:row.scopeKey,versionId:row.pendingVersionId,versionNumber:row.pendingVersionNumber,itemId:row.itemId,checkNo:row.itemCode||row.itemId,itemName:row.itemName,status:row.status,reason:row.reason}));
            result[kind]=group;
          }catch{result[kind].unavailable=true;}
        }
      }catch{for(const group of Object.values(result))group.unavailable=true;}
      return result;
    }
    const addUnique = (bucket, ref) => {
      const key = JSON.stringify([ref.scope || '', ref.versionId, ref.itemId]);
      if (!bucket.some(item => JSON.stringify([item.scope || '', item.versionId, item.itemId]) === key)) bucket.push(ref);
    };

    // 1. FQC
    try {
      if (window.FQCQualityAPI?.getEquipmentReferences) {
        const fqcRefs = window.FQCQualityAPI.getEquipmentReferences(eqId);
        fqcRefs.forEach(ref => {
          if (ref.status === 'approved' && ref.isActive) addUnique(result.fqc.active, ref);
          else if (ref.status === 'pending') addUnique(result.fqc.pending, ref);
          else if (ref.status === 'draft') addUnique(result.fqc.draft, ref);
          else addUnique(result.fqc.superseded, ref);
        });
      } else {
        const fqcCtrl = JSON.parse(localStorage.getItem('qualityMasterControl') || '{}');
        const lib = fqcCtrl.libraries?.fqc;
        if (!Array.isArray(lib?.versions)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
        (lib?.versions || []).forEach(v => {
          if (!Array.isArray(v?.snapshot?.items)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
          v.snapshot.items.forEach(it => {
            if (!it.isDeleted && it.equipmentId === eqId) {
              const ref = {
                moduleId: 'fqc', moduleName: 'FQC', versionId: v.id, versionNumber: v.number,
                status: v.status, itemId: it.id, checkNo: it.checkNo, itemName: it.name, isEnabled: it.isEnabled !== false
              };
              if (v.id === lib.activeVersionId && v.status === 'approved') addUnique(result.fqc.active, ref);
              else if (v.status === 'pending') addUnique(result.fqc.pending, ref);
              else if (v.status === 'draft') addUnique(result.fqc.draft, ref);
              else addUnique(result.fqc.superseded, ref);
            }
          });
        });
      }
    } catch (e) {
      if (strict) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      result.fqc.unavailable = true;
      console.error('Error querying FQC references', e);
    }

    // 2. IQC
    try {
      const res = await readReference('/api/iqc');
      if (!res.ok) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      if (res.ok) {
        const data = await res.json();
        if (!Array.isArray(data.control?.versions)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
        (data.control?.versions || []).forEach(v => {
          if (!Array.isArray(v?.snapshot?.items)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
          v.snapshot.items.forEach(it => {
            const matchId = it.equipmentId === eqId;
            if (!it.isDeleted && matchId) {
              const ref = {
                moduleId: 'iqc', moduleName: 'IQC', versionId: v.id, versionNumber: v.number,
                status: v.status, itemId: it.id, checkNo: it.checkNo, itemName: it.nameVi || it.name, isEnabled: it.isEnabled !== false
              };
              if (v.id === data.control.activeVersionId && v.status === 'approved') addUnique(result.iqc.active, ref);
              else if (v.status === 'pending') addUnique(result.iqc.pending, ref);
              else if (v.status === 'draft') addUnique(result.iqc.draft, ref);
              else addUnique(result.iqc.superseded, ref);
            }
          });
        });
      }
    } catch (e) {
      if (strict) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      result.iqc.unavailable = true;
      console.error('Error querying IQC references', e);
    }

    // 3. IPQC-C: only a stable equipmentId is a confirmed relationship.
    try {
      const res = await readReference('/api/ipqc-c');
      if (!res.ok) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      if (res.ok) {
        const data = await res.json();
        if (!Array.isArray(data.control?.versions)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
        (data.control?.versions || []).forEach(v => {
          if (!Array.isArray(v?.snapshot?.items)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
          v.snapshot.items.forEach(it => {
            const matchId = it.equipmentId === eqId;
            if (!it.deleted && matchId) {
              const ref = {
                moduleId: 'ipqc-c', moduleName: 'IPQC-C', versionId: v.id, versionNumber: v.number,
                status: v.status, itemId: it.id, checkNo: it.code || it.id, itemName: it.name || it.description?.slice(0, 30) || '檢查項目', isEnabled: true
              };
              if (v.id === data.control.activeVersionId && v.status === 'approved') addUnique(result.ipqcC.active, ref);
              else if (v.status === 'pending') addUnique(result.ipqcC.pending, ref);
              else if (v.status === 'draft') addUnique(result.ipqcC.draft, ref);
              else addUnique(result.ipqcC.superseded, ref);
            }
          });
        });
      }
    } catch (e) {
      if (strict) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      result.ipqcC.unavailable = true;
      console.error('Error querying IPQC-C references', e);
    }

    // IPQC-AB references are versioned per line and group. A stable equipmentId,
    // not the source Excel tool text, is the only confirmed relationship.
    try {
      const res = await readReference(abReferencesURL);
      if (!res.ok) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      if (res.ok) {
        const data = await res.json();
        if (!data.control?.scopes || typeof data.control.scopes !== 'object' || Array.isArray(data.control.scopes)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
        Object.entries(data.control?.scopes || {}).forEach(([scopeKey, scope]) => {
          scope.versions.forEach(v => {
            v.snapshot.items.forEach(it => {
              if (it.deleted || it.equipmentId !== eqId) return;
              const ref = { moduleId: 'ipqc-ab', moduleName: 'IPQC-AB', scope: scopeKey, line: scope.line, group: scope.group, versionId: v.id,
                versionNumber: v.number, status: v.status, itemId: it.id, checkNo: it.code,
                itemName: it.standard || it.code, isEnabled: it.isEnabled };
              if (v.id === scope.activeVersionId && v.status === 'approved') addUnique(result.ipqcAB.active, ref);
              else if (v.status === 'pending' || v.status === 'pending-test') addUnique(result.ipqcAB.pending, ref);
              else if (v.status === 'draft') addUnique(result.ipqcAB.draft, ref);
              else addUnique(result.ipqcAB.superseded, ref);
            });
          });
        });
      }
    } catch (e) { if (strict) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED'); result.ipqcAB.unavailable = true; console.error('Error querying IPQC-AB references', e); }

    try {
      const response = await readReference(`/api/quality-equipment-replacement?sourceId=${encodeURIComponent(eqId)}`);
      if (!response.ok) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
      if (response.ok) {
        const data = await response.json();
        if (!Array.isArray(data.pending) || !Array.isArray(data.modules)) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED');
        for (const record of data.pending || []) {
          const bucket = record.moduleId === 'ipqc-c' ? result.ipqcC : record.moduleId === 'ipqc-ab' ? result.ipqcAB : result[record.moduleId];
          if (!bucket) continue;
          bucket.planned ||= [];
          const targetModule = data.modules.find(row => row.moduleId === record.moduleId);
          const item = targetModule?.items.find(row => row.id === record.itemId);
          addUnique(bucket.planned, { scope: record.scopeKey || '', versionId: record.pendingVersionId, itemId: record.itemId,
            checkNo: record.itemCode || item?.code || record.itemId,
            itemName: record.itemName || item?.name || '', versionNumber: record.pendingVersionNumber || '—',
            status: record.status, reason: record.reason, moduleId: record.moduleId });
        }
      }
    } catch (error) { if (strict) throw Error('EQUIPMENT_REFERENCE_CHECK_FAILED'); result.plannedUnavailable = true; console.error('Error querying planned replacements', error); }

    return result;
  }

  function invalidateEquipmentReferences(ids) {
    for (const id of ids || new Set([...equipmentRefCache.keys(), ...equipmentRefReads.keys()])) {
      equipmentRefCache.delete(id);
      const entry = equipmentRefReads.get(id); if (entry) entry.invalidated = true;
      equipmentRefReads.delete(id);
    }
  }
  async function loadEquipmentReferences(id, { renderAfter = true } = {}) {
    if (!id) return;
    const owner = captureTransferOwner(), request = equipmentEditRequest;
    if (!transferOwnerCurrent(owner)) return;
    let entry = equipmentRefReads.get(id);
    if (!entry || !transferOwnerCurrent(entry.owner)) {
      entry = { owner, promise: queryAllQualityReferences(id) };
      equipmentRefReads.set(id, entry);
    }
    try {
      const refs = await entry.promise;
      if (entry.invalidated || !transferOwnerCurrent(owner) || request !== equipmentEditRequest) return;
      equipmentRefCache.set(id, refs);
      if (renderAfter) updateEquipmentReferenceSections(id);
      return refs;
    } finally { if (equipmentRefReads.get(id) === entry) equipmentRefReads.delete(id); }
  }

  function updateEquipmentReferenceSections(id) {
    if (!routineTabIsActive()) return;
    for (const section of host.querySelectorAll('[data-routine-reference-id]')) {
      if (section.dataset.routineReferenceId !== id) continue;
      section.outerHTML = equipmentReferencesSectionHTML(id, section.dataset.referenceMode);
    }
    bindReferenceActions(host);
    sharedClient?.gatePermissions();
  }

  function renderRefItems(mRef, moduleName) {
    if (mRef.unavailable) return `<p class="routine-ref-empty-note" role="alert">${t('查詢未完成；請關閉後重新開啟設備資訊重試。', 'Tra cứu chưa hoàn tất; đóng rồi mở lại thông tin thiết bị để thử lại.')}</p>`;
    const active = mRef.active || [];
    const pending = mRef.pending || [];
    const draft = mRef.draft || [];
    const planned = mRef.planned || [];

    if (!active.length && !pending.length && !draft.length && !planned.length) {
      return `<p class="routine-ref-empty-note">${t('此設備在該模組尚無任何標準引用。', 'Thiết bị này chưa có tham chiếu tiêu chuẩn nào.')}</p>`;
    }

    const renderList = (items, badgeClass, badgeLabel) => `
      <div class="routine-ref-subgroup">
        <span class="routine-ref-badge ${badgeClass}">${badgeLabel} (${items.length})</span>
        <div class="routine-ref-item-rows">
          ${items.map(it => `
            <div class="routine-ref-row">
              <a href="javascript:void(0)" class="routine-standard-link" data-std-module="${moduleName}" data-std-active="${badgeClass==='active'?'1':'0'}" data-std-revision="${h(mRef.revision)}" data-std-vid="${h(it.versionId)}" data-std-iid="${h(it.itemId)}" data-std-scope="${h(it.scope || '')}">
                <code>${h(it.checkNo)}</code>
              </a>
              <span class="routine-ref-row-name" data-i18n-skip="true">${h(it.itemName)}</span>
              <small class="routine-ref-ver">V${h(String(it.versionNumber || '—').replace(/^V/i, ''))}</small>
              ${it.reason ? `<small class="routine-ref-reason">${h(it.reason)}</small>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    return `
      <div class="routine-ref-groups-wrap">
        ${active.length ? renderList(active, 'active', t('目前生效中', 'Đang hiệu lực')) : ''}
        ${pending.length||draft.length||planned.length?'<details><summary>'+h(t('草稿及待審版本','Bản nháp và chờ duyệt'))+'</summary>':''}
        ${pending.length ? renderList(pending, 'pending', t('主管審核中', 'Chờ duyệt')) : ''}
        ${draft.length ? renderList(draft, 'draft', t('草稿中', 'Bản nháp')) : ''}
        ${planned.length ? renderList(planned, 'pending', t('待處理替換', 'Thay thế chờ xử lý')) : ''}
        ${pending.length||draft.length||planned.length?'</details>':''}
      </div>
    `;
  }

  function equipmentReferencesSectionHTML(eqId, mode) {
    if (!eqId) return '';
    const refs = equipmentRefCache.get(eqId);
    if (!refs) {
      void loadEquipmentReferences(eqId);
      return `<div class="routine-ref-loading" data-routine-reference-id="${h(eqId)}" data-reference-mode="${h(mode)}"><small>${t('載入各品質系統標準引用中…', 'Đang tải tham chiếu tiêu chuẩn...')}</small></div>`;
    }

    const fqcTotal = refs.fqc.active.length;
    const iqcTotal = refs.iqc.active.length;
    const ipqcCTotal = refs.ipqcC.active.length;
    const ipqcABTotal = refs.ipqcAB.active.length;

    const fqcOpen = mode === 'edit' && (refs.fqc.active.length > 0 || refs.fqc.pending.length > 0);
    const iqcOpen = mode === 'edit' && (refs.iqc.active.length > 0 || refs.iqc.pending.length > 0);
    const ipqcCOpen = mode === 'edit' && (refs.ipqcC.active.length > 0 || refs.ipqcC.pending.length > 0);

    return `
      <div class="routine-ref-section" data-routine-reference-id="${h(eqId)}" data-reference-mode="${h(mode)}">
        <h4 class="routine-ref-main-title">${t('四種品質標準反向引用', 'Tham chiếu ngược 4 tiêu chuẩn chất lượng')}</h4>
        ${refs.plannedUnavailable ? `<p role="alert">${t('待處理替換查詢未完成；請重新開啟設備資訊重試。', 'Tra cứu thay thế chưa hoàn tất; mở lại thông tin thiết bị để thử lại.')}</p>` : ''}

        <!-- 1. FQC -->
        <details class="routine-ref-box" ${fqcOpen ? 'open' : ''}>
          <summary>
            <div class="routine-ref-summary-left">
              <span class="routine-ref-icon">📋</span>
              <b>FQC ${t('標準引用', 'Tham chiếu tiêu chuẩn')}</b>
              <span class="routine-ref-count ${fqcTotal > 0 ? 'highlight' : ''}">${refs.fqc.unavailable ? t('查詢未完成', 'Tra cứu chưa hoàn tất') : h(referenceSummary(refs.fqc.active))}</span>
            </div>
            ${mode === 'edit' && !refs.fqc.unavailable && (fqcTotal || refs.fqc.draft.length || refs.fqc.pending.length) && permitted('approval.submit') ? `
              <button type="button" class="button ghost master-small routine-ref-transfer-btn" data-transfer-module="fqc" data-source-eq="${h(eqId)}">
                ${t('移轉 FQC 標準', 'Chuyển tiêu chuẩn FQC')}
              </button>
            ` : ''}
          </summary>
          <div class="routine-ref-content">
            ${renderRefItems(refs.fqc, 'fqc')}
          </div>
        </details>

        <!-- 2. IPQC-AB -->
        <details class="routine-ref-box">
          <summary>
            <div class="routine-ref-summary-left">
              <span class="routine-ref-icon">⚙️</span>
              <b>IPQC-AB ${t('標準引用', 'Tham chiếu tiêu chuẩn')}</b>
              <span class="routine-ref-count ${ipqcABTotal > 0 ? 'highlight' : ''}">${refs.ipqcAB.unavailable ? t('查詢未完成', 'Tra cứu chưa hoàn tất') : h(referenceSummary(refs.ipqcAB.active))}</span>
            </div>
          </summary>
          <div class="routine-ref-content">
            ${renderRefItems(refs.ipqcAB, 'ipqc-ab')}
          </div>
        </details>

        <!-- 3. IPQC-C -->
        <details class="routine-ref-box" ${ipqcCOpen ? 'open' : ''}>
          <summary>
            <div class="routine-ref-summary-left">
              <span class="routine-ref-icon">🔍</span>
              <b>IPQC-C ${t('標準引用', 'Tham chiếu tiêu chuẩn')}</b>
              <span class="routine-ref-count ${ipqcCTotal > 0 ? 'highlight' : ''}">${refs.ipqcC.unavailable ? t('查詢未完成', 'Tra cứu chưa hoàn tất') : h(referenceSummary(refs.ipqcC.active))}</span>
            </div>
            ${mode === 'edit' && !refs.ipqcC.unavailable && (ipqcCTotal || refs.ipqcC.draft.length || refs.ipqcC.pending.length) && permitted('approval.submit') ? `
              <button type="button" class="button ghost master-small routine-ref-transfer-btn" data-transfer-module="ipqc-c" data-source-eq="${h(eqId)}">
                ${t('移轉 IPQC-C 標準', 'Chuyển tiêu chuẩn IPQC-C')}
              </button>
            ` : ''}
          </summary>
          <div class="routine-ref-content">
            ${renderRefItems(refs.ipqcC, 'ipqc-c')}
          </div>
        </details>

        <!-- 4. IQC -->
        <details class="routine-ref-box" ${iqcOpen ? 'open' : ''}>
          <summary>
            <div class="routine-ref-summary-left">
              <span class="routine-ref-icon">📦</span>
              <b>IQC ${t('標準引用', 'Tham chiếu tiêu chuẩn')}</b>
              <span class="routine-ref-count ${iqcTotal > 0 ? 'highlight' : ''}">${refs.iqc.unavailable ? t('查詢未完成', 'Tra cứu chưa hoàn tất') : h(referenceSummary(refs.iqc.active))}</span>
            </div>
            ${mode === 'edit' && !refs.iqc.unavailable && (iqcTotal || refs.iqc.draft.length || refs.iqc.pending.length) && permitted('approval.submit') ? `
              <button type="button" class="button ghost master-small routine-ref-transfer-btn" data-transfer-module="iqc" data-source-eq="${h(eqId)}">
                ${t('移轉 IQC 標準', 'Chuyển tiêu chuẩn IQC')}
              </button>
            ` : ''}
          </summary>
          <div class="routine-ref-content">
            ${renderRefItems(refs.iqc, 'iqc')}
          </div>
        </details>
      </div>
    `;
  }

  function openStandardItemView(moduleName, versionId, itemId, requestedScope = '') {
    if (moduleName === 'fqc' && window.FQCQualityAPI?.openItemView) {
      window.FQCQualityAPI.openItemView(versionId, itemId);
      return;
    }
    if (moduleName === 'ipqc-ab' && window.IPQCABUI?.openItemView) {
      window.IPQCABUI.openItemView(versionId, itemId, requestedScope);
      return;
    }
    alert(t(`正在查閱 ${moduleName.toUpperCase()} 標準項目 ${itemId}（版本：${versionId}）`, `Đang xem mục tiêu chuẩn ${itemId}`));
  }

  function bindReferenceActions(root) {
    if (!root) return;
    root.querySelectorAll('[data-transfer-module]').forEach(button => button.onclick = guardWorking(button,event => {
      event.stopPropagation();
      openTransferModal(button.dataset.sourceEq, button.dataset.transferModule);
    }));
    root.querySelectorAll('[data-std-module]').forEach(link=>link.onclick=guardWorking(link,async event=>{
      event.stopPropagation();
      if(link.dataset.stdActive!=='1'){
        openStandardItemView(link.dataset.stdModule,link.dataset.stdVid,link.dataset.stdIid,link.dataset.stdScope);
        return;
      }
      const area=link.closest('[data-routine-reference-id]'),sourceId=area?.dataset.routineReferenceId;
      const kind=Object.keys(referenceModule).find(key=>referenceModule[key]===link.dataset.stdModule);
      if(!sourceId||!kind)return;
      const ref={versionId:link.dataset.stdVid,itemId:link.dataset.stdIid,scope:link.dataset.stdScope,status:'approved'};
      const actor=identity()?.id,epoch=window.ProcessSync?.identityGeneration?.();
      const current=()=>link.isConnected && identity()?.id===actor && window.ProcessSync?.identityGeneration?.()===epoch;
      try{
        const version=await readEffectiveItem(kind,ref,sourceId,Number(link.dataset.stdRevision));
        if(!current())return;
        const row=link.closest('.routine-ref-row');
        row.querySelector('[data-std-location]')?.remove();
        const output=document.createElement('div');output.dataset.stdLocation='1';output.innerHTML=standardLocatorHTML(kind,ref,version);row.append(output);
      }catch(error){if(current())alert(error.message);}
    }));
  }

  function captureTransferOwner() {
    return { actor: identity(), actorId: identity()?.id, epoch: window.ProcessSync?.identityGeneration?.(),
      delivery: window.ProcessSync?.captureDelivery?.(), page: host, versionId: selectedVersionId,displayEpoch:historyDisplayEpoch,
      generation: control?.workflow?.generation, activeVersionId: control?.activeVersionId };
  }
  function transferOwnerCurrent(owner) {
    return historyAllowsMutation()&&owner?.displayEpoch===historyDisplayEpoch&&!!owner?.actorId && owner.actorId === identity()?.id && controlActor === owner.actorId &&
      (typeof owner.epoch === 'number' ? owner.epoch === window.ProcessSync?.identityGeneration?.() : owner.actor === identity()) &&
      !window.ProcessSync?.requiresReload && (!owner.delivery || window.ProcessSync?.isCurrentDelivery?.(owner.delivery) !== false) &&
      host === owner.page && routineTabIsActive() && selectedVersionId === owner.versionId &&
      control?.workflow?.generation === owner.generation && control?.activeVersionId === owner.activeVersionId;
  }
  function transferBusy(dialog = transferDialog) { return !!dialog && Object.values(dialog.moduleStatus).includes('saving'); }

  function openTransferModal(sourceId) {
    if (editingEquipmentId && isFormDirty()) {
      if (!confirm(t('編輯表單有未儲存的變更，移轉標準前請先儲存，或取消移轉繼續編輯。確定要開啟移轉視窗？', 'Biểu mẫu có thay đổi chưa lưu, vui lòng lưu trước khi chuyển tiêu chuẩn. Tiếp tục mở?'))) {
        return;
      }
    }
    equipmentEditRequest++;
    transferDialog = {
      owner: captureTransferOwner(),
      sourceId,
      targetEqId: '',
      targetCat: '',
      selection: {fqc:new Set(),iqc:new Set(),ipqcC:new Set(),ipqcAB:new Set()},
      moduleStatus: { fqc: 'idle', iqc: 'idle', ipqcC: 'idle', ipqcAB: 'idle' },
      moduleMessages: { fqc: '', iqc: '', ipqcC: '', ipqcAB: '' },
      preview: null, previewError: ''
    };
    render();
    void loadTransferPreview();
  }

  function transferPreviewItems(preview, moduleId) {
    const entry=preview?.modules?.find(row=>row?.moduleId===moduleId);
    return entry?.connected===true && Array.isArray(entry.items) ? entry.items : [];
  }

  async function loadTransferPreview() {
    const dialog = transferDialog;
    if (!dialog || !transferOwnerCurrent(dialog.owner)) return;
    const request = dialog.previewRequest = (dialog.previewRequest || 0) + 1;
    const owns = () => transferDialog === dialog && transferOwnerCurrent(dialog.owner) && dialog.previewRequest === request;
    try {
      const data=await fetchReferencePreview(dialog.sourceId);
      if(!owns())return;
      const firstPreview = !dialog.preview;
      if(dialog.openedRevision===undefined)dialog.openedRevision=data.revision;
      dialog.revisionChange=changedReferenceRevision(dialog.sourceId,data.revision);
      dialog.locator=null;dialog.locatorKind=null;
      dialog.preview = data;
      dialog.previewError = '';
      if (firstPreview) for (const [uiKey, apiKey] of [['fqc','fqc'],['iqc','iqc'],['ipqcC','ipqc-c'],['ipqcAB','ipqc-ab']])
        {
          try{dialog.selection[uiKey]=new Set(effectiveRows(data,apiKey,dialog.sourceId).filter(item=>item.selectable).map(item=>item.id));}
          catch{dialog.selection[uiKey]=new Set();}
        }
      render();
    } catch (error) {
      if (!owns()) return;
      dialog.preview = null;
      for(const selection of Object.values(dialog.selection))selection.clear();
      dialog.previewError = error.message;
      render();
    }
  }

  let fqcTransferClient = null;
  const fqcTransferEndpoint = '/api/fqc/workflow?caseMetadata=1';
  const fqcTransferKey = actorId => 'routine-equipment-fqc-transfer-v1:' + actorId;
  const fqcTransferUnknown = () => t('FQC 移轉／存取結果待確認；僅查詢原操作收據，不會重新送出。', 'Chưa xác nhận chuyển/lưu FQC; chỉ kiểm tra biên nhận gốc, không gửi lại.');
  function hasFqcTransfer(){try{return sessionStorage.getItem(fqcTransferKey(identity()?.id))!==null;}catch{return true;}}
  function targetFqcClient(){
    if(!fqcTransferClient||!fqcTransferClient.isRuntimeCurrent()||!fqcTransferClient.isBeginRuntimeCurrent())
      fqcTransferClient=window.createSharedDraftClient({endpoint:fqcTransferEndpoint,actorId:identity()?.id,durableBegin:true,externalDurableBounded:{scope:'FQC',equipmentTransfer:true},headers:()=>({...window.ProcessSync?.platformHeaders?.(),'Content-Type':'application/json'})});
    return fqcTransferClient;
  }
  function readFqcTransfer(){
    let value;try{const raw=sessionStorage.getItem(fqcTransferKey(identity()?.id));if(raw===null)return null;value=JSON.parse(raw);}catch{throw Error(fqcTransferUnknown());}
    if(value?.version!==1||value.actorId!==identity()?.id||value.endpoint!==fqcTransferEndpoint||!['begin','save'].includes(value.phase)||typeof value.intent!=='string'||!value.basis||value.phase==='save'&&(!value.command||value.command.action!=='save'||value.command.moduleAction!=='save-local-v1'||typeof value.command.operationId!=='string'||typeof value.command.generation!=='string'))throw Error(fqcTransferUnknown());
    return value;
  }
  function writeFqcTransfer(record,previous=null){
    const key=fqcTransferKey(record.actorId),raw=JSON.stringify(record);
    if(sessionStorage.getItem(key)!==(previous===null?null:JSON.stringify(previous)))throw Error(fqcTransferUnknown());
    sessionStorage.setItem(key,raw);if(sessionStorage.getItem(key)!==raw)throw Error(fqcTransferUnknown());return record;
  }
  function clearFqcTransfer(record){
    const key=fqcTransferKey(record.actorId);if(sessionStorage.getItem(key)!==JSON.stringify(record))throw Error(fqcTransferUnknown());
    sessionStorage.removeItem(key);if(sessionStorage.getItem(key)!==null)throw Error(fqcTransferUnknown());
  }
  function fqcTransferBasis(data){const c=data.control,open=c?.versions?.find(v=>['draft','pending','pending-test'].includes(v.status));return {generation:c?.workflow?.generation??null,activeVersionId:c?.activeVersionId??null,openVersionId:open?.id??null,openVersionStatus:open?.status??null,openVersionRevision:open?.revision??null};}
  function transferSaveBasis(entry,authority,basis,existing,scope){
    const opening=entry.transferDraft==='open-required';
    if((!opening&&entry.transferDraft!=='ready')||authority.permissions?.save===false||
      (basis.openVersionId&&basis.openVersionStatus!=='draft')||existing?.pendingId||
      (!opening&&(!existing||!basis.openVersionId))||(opening&&existing&&basis.openVersionId))throw Error(transferBlockMessage('stale'));
    if(existing&&(!existing.generation||!Number.isSafeInteger(existing.revision)))throw Error(transferBlockMessage('stale'));
    return {generation:existing?.generation??('equipment-transfer-'+scope+'-'+authority.revision),revision:existing?.revision??0,
      openCommand:opening?{equipmentTransferOpen:true}:{}};
  }
  function assertFqcTransferRead(data){
    const c=data?.control,f=c?.workflow;
    if(data?.permissions?.view!==true||data.permissions.edit!==true||!Number.isSafeInteger(data.revision)||!Array.isArray(c?.versions)||f&&f.scope!=='fqc'||f?.pendingId||c.versions.some(v=>['pending','pending-test'].includes(v.status)))throw Error('FQC_TARGET_NOT_EDITABLE');
    return f;
  }
  function finishFqcTransfer(client,record,result,fresh=null){
    const r=result?.receipt;
    const verified=client.isVerifiedReadback(result),f=fresh?.control?.workflow;
    if(!verified&&(!fresh||fresh.permissions?.view!==true||f?.scope!=='fqc'||!Number.isSafeInteger(f.revision)||f.revision<r?.revision)||r?.operationId!==record.command.operationId||r.generation!==record.command.generation||typeof r.savedId!=='string'||!r.savedId)throw Error(fqcTransferUnknown());
    // No local FQC form is owned here. A historical receipt confirms only the
    // original Save; it never replays selection into the successor generation.
    const superseded=client.isSupersededRecovery(result),historical=superseded||!!fresh&&f.generation!==r.generation;
    if(superseded)client.acknowledgeSupersededRecovery(result);
    clearFqcTransfer(record);
    return {savedId:r.savedId,historical,results:JSON.parse(record.intent).ids.map(itemId=>({itemId,status:'applied'}))};
  }
  async function recoverFqcTransfer(dialog){
    const owner=dialog.owner;dialog.moduleStatus.fqc='saving';render();
    try{
      const record=readFqcTransfer(),client=targetFqcClient();if(!record)throw Error(fqcTransferUnknown());
      if(record.phase==='begin'){
        const result=client.hasUnknownBegin()?await client.resolveUnknown():record.operationId?await client.receipt(record.operationId):null;
        if(!result?.receipt||result.operationKind!=='begin-v1'||!transferOwnerCurrent(owner)||transferDialog!==dialog)throw Error(fqcTransferUnknown());
        if(record.operationId&&record.operationId!==result.receipt.operationId)throw Error(fqcTransferUnknown());
        clearFqcTransfer(record);dialog.moduleStatus.fqc='idle';await loadTransferPreview();dialog.moduleMessages.fqc=t('已核對原開始修改收據；尚未移轉或存取，請重新核對選取後明確確認。','Đã kiểm tra biên nhận bắt đầu gốc; chưa chuyển/lưu. Kiểm tra lựa chọn rồi xác nhận lại.');
      }else{
        const outstanding=client.hasUnknown(),result=await client.receipt(record.command.operationId,record.command.generation);
        // The transport may have settled before the source page lost ownership.
        // Original receipt plus a new authorized read can finish its source journal.
        const fresh=!outstanding&&!client.isVerifiedReadback(result)?await client.read():null;
        if(!transferOwnerCurrent(owner)||transferDialog!==dialog)throw Error(fqcTransferUnknown());
        const done=finishFqcTransfer(client,record,result,fresh);dialog.moduleStatus.fqc='success';dialog.moduleMessages.fqc=t('原 FQC 移轉並存取已確認','Đã xác nhận chuyển và lưu FQC gốc')+' · '+done.savedId+(done.historical?' · '+t('目前已有後續草稿；本次未套用其他修改','Hiện có bản nháp mới; lần này không áp dụng thay đổi khác'):'');
      }
    }catch(error){dialog.moduleStatus.fqc='error';dialog.moduleMessages.fqc=fqcTransferUnknown()+' '+error.message;}
    if(transferDialog===dialog&&transferOwnerCurrent(owner))render();
  }
  async function saveFqcTransfer(dialog,target,entry,rows,intent,owns){
    const assertOwned=()=>{if(!owns())throw Error('FQC_TRANSFER_CONTEXT_CHANGED');};
    // Preserve all old unidentified target Begin evidence without attribution.
    if(sessionStorage.getItem('routine-equipment-target-begin:'+identity()?.id+':'+fqcTransferEndpoint)!==null)throw Error(fqcTransferUnknown());
    const legacy=window.createSharedDraftClient({endpoint:fqcTransferEndpoint,actorId:dialog.owner.actorId,headers:()=>({...window.ProcessSync?.platformHeaders?.(),'Content-Type':'application/json'})});
    if(legacy.hasUnknown())throw Error(fqcTransferUnknown());await legacy.flush();assertOwned();
    const client=targetFqcClient();if(client.hasUnknown()||hasFqcTransfer())throw Error(fqcTransferUnknown());await client.flush();assertOwned();
    const authority=await client.read();assertOwned();assertFqcTransferRead(authority);
    const basis=fqcTransferBasis(authority);
    if(basis.generation!==(entry.workflow?.generation??null)||basis.activeVersionId!==(entry.activeVersion?.id??null)||basis.openVersionId!==(entry.openVersion?.id??null))throw Error('FQC_TARGET_CHANGED_RECONFIRM');
    let record=null;
    if(authority.revision!==dialog.openedRevision)throw Error(transferBlockMessage('stale'));
    const flow=transferSaveBasis(entry,authority,basis,assertFqcTransferRead(authority),'fqc');
    const patches=[],guards=[];
    for(const row of rows)for(const field of ['equipmentId','tool']){const path=['items',{id:row.itemId},field];patches.push({op:'set',path,value:field==='equipmentId'?target.id:target.pieceMark||target.assetCode});guards.push({path,value:row.openStatus==='draft'?(field==='equipmentId'?row.draftEquipmentId:row.draftTool):(field==='equipmentId'?row.activeEquipmentId:row.activeTool)});}
    const command=client.prepare(flow.generation,'save',{...flow.openCommand,equipmentTransferRevision:dialog.openedRevision,expectedRevision:flow.revision,moduleAction:'save-local-v1',patches,guards,input:{matrixCells:[]}});
    const next={version:1,actorId:dialog.owner.actorId,endpoint:fqcTransferEndpoint,intent,basis,phase:'save',command};record=writeFqcTransfer(next,record);assertOwned();
    try{const result=await client.sendPrepared(command);assertOwned();return finishFqcTransfer(client,record,result);}
    catch(error){
      if(owns()&&client.isConfirmedRejection(error,command)&&client.discardRejectedLocalSave(command))clearFqcTransfer(record);
      throw error;
    }
  }

  // Recovery of a previously dispatched IQC operation stays bound to its original receipt.
  // The source journal binds its exact intent/command; existing transport markers
  // and receipts remain authoritative and are never inferred from current content.
  let iqcTransferClient = null;
  const iqcTransferEndpoint = '/api/iqc/workflow?caseMetadata=1';
  const iqcTransferKey = actorId => 'routine-equipment-iqc-transfer-v1:' + actorId;
  const iqcTransferUnknown = () => t('IQC 移轉／存取結果待確認；僅查詢原操作收據，不會重新送出。', 'Chưa xác nhận chuyển/lưu IQC; chỉ kiểm tra biên nhận gốc, không gửi lại.');
  function hasIqcTransfer(){try{return sessionStorage.getItem(iqcTransferKey(identity()?.id))!==null;}catch{return true;}}
  function targetIqcClient(){
    if(!iqcTransferClient||!iqcTransferClient.isRuntimeCurrent()||!iqcTransferClient.isBeginRuntimeCurrent())
      iqcTransferClient=window.createSharedDraftClient({endpoint:iqcTransferEndpoint,actorId:identity()?.id,durableBegin:true,externalDurableBounded:{scope:'IQC',equipmentTransfer:true},headers:()=>({...window.ProcessSync?.platformHeaders?.(),'Content-Type':'application/json'})});
    return iqcTransferClient;
  }
  function readIqcTransfer(){
    let value;try{const raw=sessionStorage.getItem(iqcTransferKey(identity()?.id));if(raw===null)return null;value=JSON.parse(raw);}catch{throw Error(iqcTransferUnknown());}
    if(value?.version!==1||value.actorId!==identity()?.id||value.endpoint!==iqcTransferEndpoint||!['begin','save'].includes(value.phase)||typeof value.intent!=='string'||!value.basis||value.phase==='save'&&(!value.command||value.command.action!=='save'||value.command.moduleAction!=='save-local-v1'||typeof value.command.operationId!=='string'||typeof value.command.generation!=='string'))throw Error(iqcTransferUnknown());
    return value;
  }
  function writeIqcTransfer(record,previous=null){
    const key=iqcTransferKey(record.actorId),raw=JSON.stringify(record);
    if(sessionStorage.getItem(key)!==(previous===null?null:JSON.stringify(previous)))throw Error(iqcTransferUnknown());
    sessionStorage.setItem(key,raw);if(sessionStorage.getItem(key)!==raw)throw Error(iqcTransferUnknown());return record;
  }
  function clearIqcTransfer(record){
    const key=iqcTransferKey(record.actorId);if(sessionStorage.getItem(key)!==JSON.stringify(record))throw Error(iqcTransferUnknown());
    sessionStorage.removeItem(key);if(sessionStorage.getItem(key)!==null)throw Error(iqcTransferUnknown());
  }
  function iqcTransferBasis(data){const c=data.control,open=c?.versions?.find(v=>['draft','pending','pending-test'].includes(v.status));return {generation:c?.workflow?.generation??null,activeVersionId:c?.activeVersionId??null,openVersionId:open?.id??null,openVersionStatus:open?.status??null,openVersionRevision:open?.revision??null};}
  function assertIqcTransferRead(data){
    const c=data?.control,f=c?.workflow;
    if(data?.permissions?.view!==true||data.permissions.edit!==true||!Number.isSafeInteger(data.revision)||!Array.isArray(c?.versions)||f&&f.scope!=='iqc'||f?.pendingId||c.versions.some(v=>['pending','pending-test'].includes(v.status)))throw Error('IQC_TARGET_NOT_EDITABLE');
    return f;
  }
  function finishIqcTransfer(client,record,result,fresh=null){
    const r=result?.receipt;
    const verified=client.isVerifiedReadback(result),f=fresh?.control?.workflow;
    if(!verified&&(!fresh||fresh.permissions?.view!==true||f?.scope!=='iqc'||!Number.isSafeInteger(f.revision)||f.revision<r?.revision)||r?.operationId!==record.command.operationId||r.generation!==record.command.generation||typeof r.savedId!=='string'||!r.savedId)throw Error(iqcTransferUnknown());
    // No local IQC form is owned here. A historical receipt confirms only the
    // original Save; it never replays selection into the successor generation.
    const superseded=client.isSupersededRecovery(result),historical=superseded||!!fresh&&f.generation!==r.generation;
    if(superseded)client.acknowledgeSupersededRecovery(result);
    clearIqcTransfer(record);
    return {savedId:r.savedId,historical,results:JSON.parse(record.intent).ids.map(itemId=>({itemId,status:'applied'}))};
  }
  async function recoverIqcTransfer(dialog){
    const owner=dialog.owner;dialog.moduleStatus.iqc='saving';render();
    try{
      const record=readIqcTransfer(),client=targetIqcClient();if(!record)throw Error(iqcTransferUnknown());
      if(record.phase==='begin'){
        const result=client.hasUnknownBegin()?await client.resolveUnknown():record.operationId?await client.receipt(record.operationId):null;
        if(!result?.receipt||result.operationKind!=='begin-v1'||!transferOwnerCurrent(owner)||transferDialog!==dialog)throw Error(iqcTransferUnknown());
        if(record.operationId&&record.operationId!==result.receipt.operationId)throw Error(iqcTransferUnknown());
        clearIqcTransfer(record);dialog.moduleStatus.iqc='idle';await loadTransferPreview();dialog.moduleMessages.iqc=t('已核對原開始修改收據；尚未移轉或存取，請重新核對選取後明確確認。','Đã kiểm tra biên nhận bắt đầu gốc; chưa chuyển/lưu. Kiểm tra lựa chọn rồi xác nhận lại.');
      }else{
        const outstanding=client.hasUnknown(),result=await client.receipt(record.command.operationId,record.command.generation);
        // The transport may have settled before the source page lost ownership.
        // Original receipt plus a new authorized read can finish its source journal.
        const fresh=!outstanding&&!client.isVerifiedReadback(result)?await client.read():null;
        if(!transferOwnerCurrent(owner)||transferDialog!==dialog)throw Error(iqcTransferUnknown());
        const done=finishIqcTransfer(client,record,result,fresh);dialog.moduleStatus.iqc='success';dialog.moduleMessages.iqc=t('原 IQC 移轉並存取已確認','Đã xác nhận chuyển và lưu IQC gốc')+' · '+done.savedId+(done.historical?' · '+t('目前已有後續草稿；本次未套用其他修改','Hiện có bản nháp mới; lần này không áp dụng thay đổi khác'):'');
      }
    }catch(error){dialog.moduleStatus.iqc='error';dialog.moduleMessages.iqc=iqcTransferUnknown()+' '+error.message;}
    if(transferDialog===dialog&&transferOwnerCurrent(owner))render();
  }
  async function saveIqcTransfer(dialog,target,entry,rows,intent,owns){
    const assertOwned=()=>{if(!owns())throw Error('IQC_TRANSFER_CONTEXT_CHANGED');};
    // Preserve all old unidentified target Begin evidence without attribution.
    if(sessionStorage.getItem('routine-equipment-target-begin:'+identity()?.id+':'+iqcTransferEndpoint)!==null)throw Error(iqcTransferUnknown());
    const legacy=window.createSharedDraftClient({endpoint:iqcTransferEndpoint,actorId:dialog.owner.actorId,headers:()=>({...window.ProcessSync?.platformHeaders?.(),'Content-Type':'application/json'})});
    if(legacy.hasUnknown())throw Error(iqcTransferUnknown());await legacy.flush();assertOwned();
    const client=targetIqcClient();if(client.hasUnknown()||hasIqcTransfer())throw Error(iqcTransferUnknown());await client.flush();assertOwned();
    const authority=await client.read();assertOwned();assertIqcTransferRead(authority);
    const basis=iqcTransferBasis(authority);
    if(basis.generation!==(entry.workflow?.generation??null)||basis.activeVersionId!==(entry.activeVersion?.id??null)||basis.openVersionId!==(entry.openVersion?.id??null))throw Error('IQC_TARGET_CHANGED_RECONFIRM');
    let record=null;
    if(authority.revision!==dialog.openedRevision)throw Error(transferBlockMessage('stale'));
    const flow=transferSaveBasis(entry,authority,basis,assertIqcTransferRead(authority),'iqc');
    const patches=[],guards=[];
    for(const row of rows)for(const field of ['equipmentId','inspectionMode']){const path=['items',{id:row.itemId},field];patches.push({op:'set',path,value:field==='equipmentId'?target.id:'equipment'});guards.push({path,value:row.openStatus==='draft'?(field==='equipmentId'?row.draftEquipmentId:row.draftInspectionMode):(field==='equipmentId'?row.activeEquipmentId:row.activeInspectionMode)});}
    const command=client.prepare(flow.generation,'save',{...flow.openCommand,equipmentTransferRevision:dialog.openedRevision,expectedRevision:flow.revision,moduleAction:'save-local-v1',patches,guards,input:{}});
    const next={version:1,actorId:dialog.owner.actorId,endpoint:iqcTransferEndpoint,intent,basis,phase:'save',command};record=writeIqcTransfer(next,record);assertOwned();
    try{const result=await client.sendPrepared(command);assertOwned();return finishIqcTransfer(client,record,result);}
    catch(error){
      if(owns()&&client.isConfirmedRejection(error,command)&&
        (client.discardRejectedLocalSave(command)||!client.hasUnknown()&&!client.hasSyncFailures()))clearIqcTransfer(record);
      throw error;
    }
  }

  class SettledPriorEquipmentOperation extends Error {}
  async function readyIpqcTransfer(moduleId,dialog,rows,assertIntent){
    const ab=moduleId==='ipqc-ab',endpoint='/api/'+moduleId+'/workflow?'+(ab?'module=1&':'')+'caseMetadata=1';
    const actorId=dialog.owner.actorId;
    const client=window.createSharedDraftClient({endpoint,actorId,durableBegin:true,externalDurableBounded:{scope:moduleId.toUpperCase(),equipmentTransfer:true},allowUnknownDeparture:true,
      headers:()=>({...headers(),'Content-Type':'application/json','X-Process-Expected-Actor':actorId})});
    for(const scope of new Set(rows.map(row=>row.scopeKey))){
      const oldEndpoint=ab?'/api/ipqc-ab/workflow?scope='+encodeURIComponent(scope)+'&caseMetadata=1':endpoint;
      if(sessionStorage.getItem('routine-equipment-target-begin:'+actorId+':'+oldEndpoint)!==null)throw Error('PREVIOUS_OPERATION_UNKNOWN');
      const old=window.createSharedDraftClient({endpoint:oldEndpoint,actorId,headers});
      if(old.hasUnknown())throw Error('PREVIOUS_OPERATION_UNKNOWN');await old.flush();assertIntent();
    }
    if(client.hasUnknown()){
      const original=await client.resolveUnknown();assertIntent();
      if(client.isSupersededRecovery(original))client.acknowledgeSupersededRecovery(original);
      if(!original.receipt?.operationId)throw Error('INVALID_OPERATION_RECEIPT');
      throw new SettledPriorEquipmentOperation(t('已核對原操作收據；請重開清單後再決定是否移轉。','Đã xác nhận biên nhận gốc. Hãy mở lại danh sách trước khi quyết định chuyển.')+
        (original.receipt.savedId?' · '+original.receipt.savedId:''));
    }
    await client.flush();assertIntent();
    return client;
  }
  async function saveIpqcTransfer(moduleId,dialog,entry,rows,target,revision,assertIntent){
    const ab=moduleId==='ipqc-ab',client=await readyIpqcTransfer(moduleId,dialog,rows,assertIntent);
    const authority=await client.read();assertIntent();
    const flowOf=result=>result.control?.workflow || result.workflow;
    let basis=authority.beginBasis;
    if(!basis && Array.isArray(authority.control?.versions)){
      const control=authority.control,open=control.versions.find(version=>['draft','pending','pending-test'].includes(version.status));
      basis={generation:control.workflow?.generation??null,activeVersionId:control.activeVersionId??null,
        openVersionId:open?.id??null,openVersionStatus:open?.status??null,openVersionRevision:open?.revision??null};
    }
    if(authority.revision!==revision || !basis || authority.permissions?.view!==true || authority.permissions?.edit!==true || flowOf(authority)?.pendingId)throw Error('MODULE_CHANGED_RECONFIRM');
    const flow=transferSaveBasis(entry,authority,basis,flowOf(authority),ab?'ipqc-ab:module':moduleId);
    const changes=rows.map(row=>{
      const fields=ab?['equipmentId','inspectionMode']:['equipmentId'];
      return {patches:fields.map(field=>({op:'set',path:['items',{id:row.itemId},field],value:field==='equipmentId'?target.id:'equipment'})),
        guards:fields.map(field=>({path:['items',{id:row.itemId},field],value:field==='equipmentId'?(row.openStatus==='draft'?row.draftEquipmentId:row.activeEquipmentId):(row.openStatus==='draft'?row.draftInspectionMode:row.activeInspectionMode)}))};
    });
    const details={...flow.openCommand,expectedRevision:flow.revision,equipmentTransferRevision:revision};
    if(ab){
      const scopes=[...new Set(rows.map(row=>row.scopeKey))].map(key=>{
        const scope=entry.scopes.find(scope=>scope.scopeKey===key);
        if(!scope?.connected)throw Error('MODULE_CHANGED_RECONFIRM');
        return {scope:key,generation:scope.workflow?.generation??null,baseId:scope.activeVersion?.id??null,changes:changes.filter((_,i)=>rows[i].scopeKey===key)};
      });
      Object.assign(details,{moduleAction:'save-local-v1',input:{scopes,stateRevision:authority.revision}});
    }else details.localChanges=changes;
    const command=client.prepare(flow.generation,'save',details);
    const result=await client.sendPrepared(command);assertIntent();
    if(result.receipt?.operationId!==command.operationId || result.receipt.generation!==flow.generation || !result.receipt.savedId)throw Error('INVALID_OPERATION_RECEIPT');
    return {savedId:result.receipt.savedId,results:rows.map(row=>({itemId:row.itemId,scopeKey:row.scopeKey,status:'applied'}))};
  }
  function transferBlockMessage(reason,moduleId=''){
    if(reason==='undo-unverified')return t('無法證明原移轉後沒有其他存取。請到該模組核對草稿。','Không thể xác nhận rằng chưa có lần ghi nào sau lần chuyển gốc. Hãy kiểm tra bản nháp trong mô-đun.');
    if(reason==='pending')return t('草稿待審，請依原流程結案或撤回後重開替換清單。','Bản nháp đang chờ duyệt. Hãy hoàn tất hoặc rút hồ sơ rồi mở lại danh sách thay thế.');

    return t('草稿或資料修訂已變更，請重開替換清單，核對所選項目的最新檢具。','Bản nháp hoặc phiên bản dữ liệu đã thay đổi. Hãy mở lại danh sách và kiểm tra thiết bị hiện tại của các mục đã chọn.');
  }
  function transferChoiceLabel(moduleId,row,area,catalog){
    if(['iqc','ipqc-ab'].includes(moduleId)&&row[area+'InspectionMode']==='visual')return t('目視','Trực quan');
    const id=row[area+'EquipmentId'],equipment=catalog?.find(item=>item.id===id);
    const label=equipment?[equipment.assetCode,equipment.pieceMark].filter(Boolean).join(' / '):id;
    const tool=moduleId==='fqc'&&row[area+'Tool'];
    return [label||t('已清空檢具','Đã bỏ chọn thiết bị'),tool].filter(Boolean).join(' · ');
  }
  async function executeTransfer(uiKey) {
    const dialog = transferDialog;
    if (!dialog || transferBusy(dialog) || dialog.refreshing || !transferOwnerCurrent(dialog.owner)) return;
    // Original receipt recovery does not depend on the new preview finishing.
    if(uiKey==='fqc'&&hasFqcTransfer()){await recoverFqcTransfer(dialog);return;}
    if(uiKey==='iqc'&&hasIqcTransfer()){await recoverIqcTransfer(dialog);return;}
    if (!dialog.preview) return;
    const targetEqId = dialog.targetEqId;
    const target = control?.versions.find(version => version.id === control.activeVersionId && version.status === 'approved')?.equipment.find(item => item.id === targetEqId && item.enabled !== false);
    if (!target || targetEqId === dialog.sourceId) { dialog.moduleMessages[uiKey] = t('請重新選取目前生效且啟用的目標設備', 'Chọn lại thiết bị đích đang có hiệu lực và được bật'); render(); return; }
    const moduleId = uiKey === 'ipqcC' ? 'ipqc-c' : uiKey === 'ipqcAB' ? 'ipqc-ab' : uiKey;
    const requested = [...dialog.selection[uiKey]];
    const ids = requested;
    const owns = () => transferDialog === dialog && transferOwnerCurrent(dialog.owner) && dialog.targetEqId === targetEqId &&
      JSON.stringify([...dialog.selection[uiKey]].sort((a,b)=>a.localeCompare(b))) === JSON.stringify([...requested].sort((a,b)=>a.localeCompare(b)));
    const assertIntent = () => { if (!owns()) throw Error(t('移轉情境已變更；請重新開啟並核對後再操作', 'Ngữ cảnh chuyển đã thay đổi; mở lại và đối chiếu trước khi tiếp tục')); };
    if (!ids.length) { dialog.moduleMessages[uiKey] = t('請先勾選檢查項目', 'Hãy chọn hạng mục'); render(); return; }
    const selected=dialog.preview.modules.find(row=>row.moduleId===moduleId)?.items.filter(row=>ids.includes(row.id)) || [];
    const manual=selected.filter(row=>row.openStatus==='draft' &&
      ((row.draftEquipmentId!==dialog.sourceId && row.draftEquipmentId!==targetEqId) ||
        (['iqc','ipqc-ab'].includes(moduleId) && row.draftInspectionMode==='visual')));
    const overrideNote=manual.length?'\n'+manual.map(row=>{
      const previous=transferChoiceLabel(moduleId,row,'draft',dialog.preview.equipment);
      return [row.scopeKey,row.code||row.itemId].filter(Boolean).join(' / ')+' · '+previous+' → '+[target.assetCode,target.pieceMark].filter(Boolean).join(' / ');
    }).join('\n')+'\n'+t('取消可保留目前設定；確認會套用這次選擇。','Hủy để giữ hiện tại; xác nhận để áp dụng lựa chọn này.')+'\n':'';
    if (selected.some(row=>row.selectable===false)) {dialog.moduleMessages[uiKey]=t('包含不可編輯項目，請重新選取','Có hạng mục không thể sửa; hãy chọn lại');render();return;}
    const coveredGroups=moduleId==='ipqc-ab'?t('範圍包含其他群組已套用的修改。','Phạm vi bao gồm các thay đổi đã áp dụng trong nhóm khác.') : '';
    if(!confirm(t(`確認移轉 ${ids.length} 筆並存取 ${moduleId.toUpperCase()} 共用草稿？沒有草稿時會自動開稿。這次會一併儲存同事已套用到此共用草稿的修改。${coveredGroups}其他分頁未送出的表單會保留。${overrideNote}本次不送審。`,`Chuyển ${ids.length} mục và lưu bản nháp chung ${moduleId.toUpperCase()}? Nếu chưa có bản nháp, hệ thống sẽ tự mở. Lần lưu này bao gồm cả thay đổi đồng nghiệp đã áp dụng vào bản nháp chung. ${coveredGroups} Dữ liệu chưa gửi ở trang khác vẫn được giữ.${overrideNote} Không gửi duyệt.`)))return;
    assertIntent();
    dialog.moduleStatus[uiKey] = 'saving'; render();
    try {
      const localSync=window.ProcessSync?.pendingState?.();
      if(!localSync||localSync.dirty||localSync.inFlight||localSync.paused||localSync.blocked)
        throw Error(t('本頁尚有同步中的變更，請處理後重開替換清單。','Trang này có thay đổi chưa đồng bộ. Hãy xử lý rồi mở lại danh sách thay thế.'));
      assertIntent();
      const current=await fetchReferencePreview(dialog.sourceId);
      assertIntent();
      const entry=current.modules.find(m=>m.moduleId===moduleId);
      if(entry?.connected===true && !['ready','open-required'].includes(entry.transferDraft))throw Error(transferBlockMessage(entry.transferDraft,moduleId));
      if(!Number.isSafeInteger(dialog.openedRevision)||dialog.openedRevision!==current.revision)throw Error(transferBlockMessage('stale'));
      if(entry?.connected!==true)throw Error('EQUIPMENT_REFERENCE_RESPONSE_INVALID');
      if(entry.referenceVisible!==false)effectiveRows(current,moduleId,dialog.sourceId);
      const latest=current.modules.find(row=>row.moduleId===moduleId)?.items || [];
      const recheck=()=>{throw Error(transferBlockMessage('stale'));};
      if(selected.length!==ids.length)recheck();
      for(const before of selected){
        const after=latest.find(row=>row.id===before.id);
        if(!after || after.selectable===false || ['openStatus','openVersionId','activeEquipmentId','draftEquipmentId','draftInspectionMode','draftTool'].some(key=>after[key]!==before[key]))throw Error(transferBlockMessage('stale'));
      }
      if(latest.some(row=>ids.includes(row.id)&&row.openStatus==='draft'&&row.draftEquipmentId!==targetEqId&&row.activeEquipmentId===targetEqId&&!row.canUndoTransfer))throw Error(transferBlockMessage('undo-unverified'));
      const targetEntry=current.modules.find(row=>row.moduleId===moduleId);
      const previousEntry=dialog.preview.modules.find(row=>row.moduleId===moduleId);
      const scopeBasis=entry=>JSON.stringify([entry?.workflow?.generation||null,entry?.activeVersion?.id||null]);
      const transferScopeEntry=(entry,key)=>entry?.scopes?.find(scope=>scope.items.some(row=>row.scopeKey===key))||entry;
      if(moduleId==='ipqc-ab'?[...new Set(selected.map(row=>row.scopeKey))].some(key=>scopeBasis(transferScopeEntry(previousEntry,key))!==scopeBasis(transferScopeEntry(targetEntry,key))):scopeBasis(previousEntry)!==scopeBasis(targetEntry)) {
        dialog.preview=current;throw Error(t('目標草稿世代或生效版本已變更，請核對後再次確認移轉','Thế hệ bản nháp hoặc phiên bản hiệu lực đích đã thay đổi; kiểm tra và xác nhận lại'));
      }
      const needsTransfer=row=>{
        const draft=row.openStatus==='draft';
        return (draft?row.draftEquipmentId:row.activeEquipmentId)!==targetEqId ||
          (['iqc','ipqc-ab'].includes(moduleId)&&(draft?row.draftInspectionMode:row.activeInspectionMode)!=='equipment') ||
          (moduleId==='fqc'&&(draft?row.draftTool:row.activeTool)!==(target.pieceMark||target.assetCode));
      };
      const transferIntent=JSON.stringify({sourceId:dialog.sourceId,targetEqId,ids:[...ids].sort((a,b)=>a.localeCompare(b))});
      let data;
      const matchesSaved=row=>row.openStatus==='draft' && !needsTransfer(row) && row.savedChoice?.id && row.savedChoice.equipmentId===targetEqId &&
        (!['iqc','ipqc-ab'].includes(moduleId)||row.savedChoice.mode==='equipment') && (moduleId!=='fqc'||row.savedChoice.tool===(target.pieceMark||target.assetCode));
      const chosen=latest.filter(row=>ids.includes(row.id)),already=chosen.filter(matchesSaved),changed=chosen.filter(row=>!matchesSaved(row));
      if(!changed.length){
        if(moduleId.startsWith('ipqc'))await readyIpqcTransfer(moduleId,dialog,already,assertIntent);
        else{
          const endpoint=moduleId==='fqc'?fqcTransferEndpoint:iqcTransferEndpoint;
          const existing=window.createSharedDraftClient({endpoint,actorId:dialog.owner.actorId,headers});
          const durable=moduleId==='fqc'?targetFqcClient():targetIqcClient();
          if(existing.hasUnknown()||durable.hasUnknown()||sessionStorage.getItem('routine-equipment-target-begin:'+dialog.owner.actorId+':'+endpoint)!==null)throw Error('PREVIOUS_OPERATION_UNKNOWN');
          await existing.flush();await durable.flush();assertIntent();
        }
        data={savedId:already[0].savedChoice.id,alreadySaved:true,results:[]};
      }else if(moduleId==='fqc'){
        data=await saveFqcTransfer(dialog,target,targetEntry,changed,transferIntent,owns);
      }else if(moduleId==='iqc'){
        data=await saveIqcTransfer(dialog,target,targetEntry,changed,transferIntent,owns);
      }else{
        data=await saveIpqcTransfer(moduleId,dialog,targetEntry,changed,target,current.revision,assertIntent);
      }
      data.results.push(...already.map(row=>({itemId:row.itemId,scopeKey:row.scopeKey,status:'unchanged'})));
      if (!owns()) return;
      const counts = { applied: 0, unchanged: 0, waiting: 0, conflict: 0 };
      for (const row of data.results || []) counts[row.status] = (counts[row.status] || 0) + 1;
      dialog.moduleStatus[uiKey] = counts.conflict ? 'error' : counts.waiting ? 'pending' : 'success';
      dialog.moduleMessages[uiKey] = `${t('已套用', 'Đã áp dụng')} ${counts.applied} · ${t('已相同', 'Không đổi')} ${counts.unchanged} · ${t('待處理', 'Chờ xử lý')} ${counts.waiting} · ${t('衝突', 'Xung đột')} ${counts.conflict}` +
        (data.results || []).filter(row => row.reason && row.status === 'conflict').map(row => `\n${row.scopeKey?row.scopeKey+' / ':''}${row.itemId}: ${row.reason}`).join('');
      if(data.savedId)dialog.moduleMessages[uiKey]+=' · '+moduleId.toUpperCase()+' · '+(data.alreadySaved?t('草稿已存相同選擇，無需重存','Bản nháp đã lưu lựa chọn này, không cần lưu lại'):t('已移轉並存取草稿','Đã chuyển và lưu bản nháp'))+' · '+data.savedId+(data.historical?' · '+t('原操作已確認；目前已有後續草稿，本次未套用其他修改','Đã xác nhận thao tác gốc; hiện có bản nháp mới, không áp dụng thay đổi khác'):'');

      if(data.savedId&&!data.alreadySaved)dialog.moduleMessages[uiKey]+=' · '+t('本次只存此模組；其他模組請重開清單後分別確認。','Lần này chỉ lưu mô-đun này. Hãy mở lại danh sách để xác nhận từng mô-đun khác.');
      // The qualified command/receipt above settles the write. Refresh failures
      // describe stale display data and must never turn that receipt into failure.
      invalidateEquipmentReferences([dialog.sourceId, targetEqId]);
      dialog.refreshing = true;
      dialog.refreshError = '';
      render();
      void (async () => {
        try {
          if(!['fqc','iqc'].includes(moduleId))await window.ProcessSync?.refresh?.();
          if (!owns()) return;
          await Promise.all([loadEquipmentReferences(dialog.sourceId), loadTransferPreview()]);
        } catch (error) {
          if (owns()) dialog.refreshError = error.message || 'REFERENCE_REFRESH_FAILED';
        } finally {
          if (owns()) { dialog.refreshing = false; render(); }
        }
      })();
    } catch (error) {
      dialog.moduleStatus[uiKey] = error instanceof SettledPriorEquipmentOperation?'success':'error';
      dialog.moduleMessages[uiKey] = (moduleId==='fqc'&&hasFqcTransfer()?fqcTransferUnknown()+' ':moduleId==='iqc'&&hasIqcTransfer()?iqcTransferUnknown()+' ':'')+(error.message==='DRAFT_REVISION_CHANGED_RECONFIRM'||error.message==='MODULE_CHANGED_RECONFIRM'?transferBlockMessage('stale'):(error.message || t('替換失敗', 'Thay thế thất bại')));
    }
    if (transferDialog === dialog && transferOwnerCurrent(dialog.owner)) render();
  }

  function transferDialogHTML() {
    if (!transferDialog) return '';
    const { sourceId, targetEqId } = transferDialog;
    const inFlight = transferBusy() || transferDialog.refreshing;
    const tree = structure(visible());
    const allEq = visible()?.equipment || [];
    const sourceEq = allEq.find(e => e.id === sourceId) || (working?.equipment || []).find(e => e.id === sourceId);
    if (!sourceEq) return '';

    const approvedVer = control?.versions?.find(v => v.id === control.activeVersionId && v.status === 'approved');
    const availableTargets = (approvedVer?.equipment || []).filter(e => e.id !== sourceId && e.enabled !== false && !control.calibrationUnavailable?.includes(e.id) && (!transferDialog.targetCat || e.categoryId === transferDialog.targetCat || e.categoryCode === transferDialog.targetCat));
    const targetEq = (approvedVer?.equipment || []).find(e => e.id === targetEqId);

    const previewItems = moduleId => transferPreviewItems(transferDialog.preview,moduleId);
    const summary = moduleId => {
      if(transferDialog.previewError)return t('查詢失敗','Tra cứu thất bại');
      if(!transferDialog.preview)return t('查詢中…','Đang tra cứu…');
      const entry=transferDialog.preview.modules.find(row=>row?.moduleId===moduleId);
      if(entry?.connected!==true||!Array.isArray(entry.items))return t('模組未接入或資料不完整','Mô-đun chưa kết nối hoặc dữ liệu chưa đầy đủ');
      let current;
      try{current=effectiveRows(transferDialog.preview,moduleId,sourceId);}
      catch(error){return error.message==='EQUIPMENT_REFERENCE_ACCESS_UNCONFIRMED'?t('未確認標準讀取權限','Chưa xác nhận quyền xem tiêu chuẩn'):t('模組未接入或資料不完整','Mô-đun chưa kết nối hoặc dữ liệu chưa đầy đủ');}
      return referenceSummary(current);
    };
    const fqcItems = previewItems('fqc'),fqcRecovery=hasFqcTransfer();
    const iqcItems = previewItems('iqc'),iqcRecovery=hasIqcTransfer();
    const ipqcCItems = previewItems('ipqc-c');
    const ipqcABItems = previewItems('ipqc-ab');
    const replacementRow = (it, key) => `
      <div class="routine-transfer-item-row">
        <label><input type="checkbox" data-transfer-check="${key}" value="${h(it.id)}" ${inFlight||it.selectable===false?'disabled':transferDialog.selection[key].has(it.id) ? 'checked' : ''}>${t('選取', 'Chọn')}</label>
        ${it.effectiveReference?'<button type="button" class="button ghost" data-transfer-reference="'+key+'" data-transfer-locator="'+h(it.id)+'">'+h(it.effectiveReference.checkNo)+'</button>':'<code>'+h(it.code)+'</code>'}<span class="name" data-i18n-skip="true">${h(it.effectiveReference?.itemName??it.name)}</span>${it.scopeKey?`<small>${h(it.scopeKey)}</small>`:''}
        <small>${t('生效', 'Hiệu lực')}: ${h(it.activeEquipmentId || '—')} · ${t('草稿', 'Bản nháp')}: ${h(it.draftEquipmentId || '—')} · ${h(it.openStatus || '—')}</small>
        ${it.selectable===false?`<small role="status">${h(t(it.unavailableReason?.includes('待審')?'待審已鎖定；請依原流程撤回或結案後重新選取。':it.unavailableReason || '目前不可編輯',it.unavailableReason?.includes('待審')?'Đang chờ duyệt; hãy rút theo quy trình hoặc chọn lại sau khi kết thúc.':it.unavailableReason?.includes('V3')?'Phạm vi dùng bản nháp chung V3; hãy chọn thiết bị trong bản nháp chung.':'Không có quyền sửa bản nháp của mô-đun đích.'))}</small>`:''}
        ${it.draftEquipmentId && it.draftEquipmentId !== sourceId && it.draftEquipmentId !== targetEqId ?
          `<small class="routine-transfer-warning">${t('草稿已改選其他設備；確認移轉時會提示取代。', 'Bản nháp đã chọn thiết bị khác; xác nhận chuyển sẽ thông báo ghi đè.')}</small>` : ''}
      </div>`;

    const moduleList=(moduleId,key,items)=>{
      if(!items.length)return '';
      let current;
      try{current=effectiveRows(transferDialog.preview,moduleId,sourceId);}
      catch{
        const entry=transferDialog.preview.modules.find(row=>row.moduleId===moduleId);
        if(entry?.referenceVisible===false && items.length)return '<details><summary>'+h(t('原有移轉預覽','Xem trước chuyển hiện có'))+'</summary>'+items.map(row=>replacementRow(row,key)).join('')+'</details>';
        return '<p role="status">'+h(summary(moduleId))+'</p>';
      }
      const extra=items.filter(row=>row.activeEquipmentId!==sourceId);
      const list=rows=>'<div class="routine-transfer-item-table">'+rows.map(row=>replacementRow(row,key)).join('')+'</div>';
      return list(current)+(transferDialog.locatorKind===key?transferDialog.locator:'')+(extra.length?'<details data-transfer-extra="'+key+'"'+(transferDialog.extraOpen?.[key]?' open':'')+'><summary>'+h(t('僅草稿或待審','Chỉ có trong bản nháp hoặc chờ duyệt'))+' ('+extra.length+')</summary>'+list(extra)+'</details>':'');
    };

    const sourcePhoto = photo(sourceEq);
    const targetPhoto = targetEq ? photo(targetEq) : '';

    return `
      <div class="routine-dialog-backdrop" id="routine-transfer-backdrop">
        <div class="routine-view-dialog routine-transfer-dialog" role="dialog" aria-modal="true" aria-label="${t('設備替換與標準批次移轉', 'Thay thế thiết bị & Chuyển tiêu chuẩn')}">
          <div class="routine-dialog-head">
            <h3>${t('設備替換／標準批次移轉', 'Thay thế thiết bị & Chuyển tiêu chuẩn')}</h3>
            <button type="button" id="routine-transfer-close" style="border:none;background:transparent;font-size:1.2rem;cursor:pointer">✕</button>
          </div>
          <div class="routine-view-body routine-transfer-body">
            ${transferDialog.refreshing ? `<p role="status">${t('移轉結果已確認；關聯資料更新中…','Đã xác nhận kết quả chuyển; đang cập nhật tham chiếu…')}</p>` : ''}${transferDialog.refreshError ? `<p role="alert">${t('移轉結果已確認；關聯更新失敗，請關閉後重開以核對。','Đã xác nhận kết quả chuyển; lỗi cập nhật tham chiếu, đóng rồi mở lại để kiểm tra.')} ${h(transferDialog.refreshError)}</p>` : ''}${transferDialog.previewError ? `<p role="alert">${h(transferDialog.previewError)}</p>` : ''}
            ${!transferDialog.preview ? `<p>${t('載入生效與草稿差異中…', 'Đang tải khác biệt phiên bản…')}</p>` : ''}
            <!-- 1. 原設備 vs 目標設備 對照卡片 -->
            <div class="routine-transfer-compare-grid">
              <div class="routine-transfer-box source">
                <h4>${t('原檢具設備（來源）', 'Thiết bị gốc (Nguồn)')}</h4>
                <div class="routine-transfer-eq-card">
                  <div class="routine-transfer-thumb">
                    ${sourcePhoto ? `<img src="${h(sourcePhoto)}" alt="">` : '<span>◇</span>'}
                  </div>
                  <div class="routine-transfer-meta">
                    <b>${h(sourceEq.assetCode)}／${h(sourceEq.pieceMark)}</b>
                    <span data-i18n-skip="true">${h(displayName(sourceEq))}</span>
                    <small data-i18n-skip="true">${h(sourceEq.spec || '—')}</small>
                  </div>
                </div>
              </div>

              <div class="routine-transfer-arrow">➔</div>

              <div class="routine-transfer-box target">
                <h4>${t('替換目標設備（請選擇）', 'Thiết bị thay thế (Vui lòng chọn)')}</h4>
                <div class="routine-transfer-picker-controls">
                  <select id="routine-target-cat" class="routine-select" ${inFlight ? 'disabled' : ''}>
                    <option value="">${t('全部類別', 'Tất cả nhóm')}</option>
                    ${tree.categories.map(c => `<option value="${h(c.id)}" ${transferDialog.targetCat === c.id ? 'selected' : ''}>${h(c.code)} · ${h(c.name)}</option>`).join('')}
                  </select>
                  <select id="routine-target-eq-select" class="routine-select" ${inFlight ? 'disabled' : ''}>
                    <option value="">${t('請選擇目標設備…', 'Chọn thiết bị đích…')}</option>
                    ${availableTargets.map(e => `
                      <option value="${h(e.id)}" ${e.id === targetEqId ? 'selected' : ''} data-i18n-skip="true">
                        ${h(e.assetCode)}／${h(e.pieceMark)} · ${h(displayName(e))}
                      </option>
                    `).join('')}
                  </select>
                </div>
                ${targetEq ? `
                  <div class="routine-transfer-eq-card target-selected">
                    <div class="routine-transfer-thumb">
                      ${targetPhoto ? `<img src="${h(targetPhoto)}" alt="">` : '<span>◇</span>'}
                    </div>
                    <div class="routine-transfer-meta">
                      <b>${h(targetEq.assetCode)}／${h(targetEq.pieceMark)}</b>
                      <span data-i18n-skip="true">${h(displayName(targetEq))}</span>
                      <small data-i18n-skip="true">${h(targetEq.spec || '—')}</small>
                    </div>
                  </div>
                ` : `<p class="routine-transfer-unselected-hint">${t('尚未選定替換目標設備', 'Chưa chọn thiết bị thay thế')}</p>`}
              </div>
            </div>

            <!-- 2. 逐模組確認移轉清單 -->
            <div class="routine-transfer-modules">
              <p>${t('只比對此分件的穩定設備 ID。群組、名稱或工具文字無法指定分件。','Chỉ đối chiếu ID thiết bị cố định của chi tiết. Nhóm, tên hoặc văn bản dụng cụ không xác định chi tiết.')}</p>
              ${Number.isSafeInteger(transferDialog.preview?.revision) ? `<small>${t('資料修訂','Bản sửa dữ liệu')} ${transferDialog.preview.revision}</small>` : ''}
              ${transferDialog.revisionChange?`<p role="status">${h(transferDialog.revisionChange)}</p>`:''}
              <h4>${t('移轉標準清單（採逐模組確認保存）', 'Danh sách tiêu chuẩn (Lưu riêng từng module)')}</h4>

              <!-- FQC Module -->
              <div class="routine-transfer-module-card ${transferDialog.moduleStatus.fqc}">
                <div class="routine-transfer-module-head">
                  <div>
                    <b>FQC 最終品質檢驗</b>
                    <small>${h(summary('fqc'))}</small>
                  </div>
                  <div class="routine-transfer-module-action">
                    ${transferDialog.moduleStatus.fqc === 'success' ? `
                      <span class="routine-transfer-success-tag">✓ ${t('已移轉並存取草稿', 'Đã chuyển và lưu bản nháp')}</span>
                    ` : `
                      <button type="button" class="button signal master-small" id="routine-confirm-transfer-fqc" ${inFlight||!fqcRecovery&&(!targetEq||!transferDialog.selection.fqc.size)?'disabled':''}>
                        ${transferDialog.moduleStatus.fqc === 'saving' ? t('儲存中…', 'Đang lưu...') : fqcRecovery?t('查詢原移轉／存取收據','Kiểm tra biên nhận chuyển/lưu gốc'):t('確認移轉並存取 FQC 草稿', 'Xác nhận chuyển và lưu FQC')}
                      </button>
                    `}
                  </div>
                </div>
                ${transferDialog.moduleMessages.fqc ? `<p class="routine-transfer-mod-msg">${h(transferDialog.moduleMessages.fqc)}</p>` : ''}
                ${moduleList('fqc','fqc',fqcItems)}
              </div>

              <!-- IPQC-C Module -->
              <div class="routine-transfer-module-card ${transferDialog.moduleStatus.ipqcC}">
                <div class="routine-transfer-module-head">
                  <div>
                    <b>IPQC-C 製程品質檢驗</b>
                    <small>${h(summary('ipqc-c'))}</small>
                  </div>
                  <div class="routine-transfer-module-action">
                    ${transferDialog.moduleStatus.ipqcC === 'success' ? `
                      <span class="routine-transfer-success-tag">✓ ${t('已存取草稿', 'Đã lưu bản nháp')}</span>
                    ` : `
                      <button type="button" class="button signal master-small" id="routine-confirm-transfer-ipqc-c" ${!targetEq || !transferDialog.selection.ipqcC.size || inFlight ? 'disabled' : ''}>
                        ${transferDialog.moduleStatus.ipqcC === 'saving' ? t('儲存中…', 'Đang lưu...') : t('確認移轉並存取 IPQC-C 草稿', 'Xác nhận chuyển và lưu IPQC-C')}
                      </button>
                    `}
                  </div>
                </div>
                ${transferDialog.moduleMessages.ipqcC ? `<p class="routine-transfer-mod-msg">${h(transferDialog.moduleMessages.ipqcC)}</p>` : ''}
                ${moduleList('ipqc-c','ipqcC',ipqcCItems)}
              </div>

              <!-- IQC Module -->
              <div class="routine-transfer-module-card ${transferDialog.moduleStatus.iqc}">
                <div class="routine-transfer-module-head">
                  <div>
                    <b>IQC 進料品質檢驗</b>
                    <small>${h(summary('iqc'))}</small>
                  </div>
                  <div class="routine-transfer-module-action">
                    ${transferDialog.moduleStatus.iqc === 'success' ? `
                      <span class="routine-transfer-success-tag">✓ ${t('已存取草稿', 'Đã lưu bản nháp')}</span>
                    ` : `
                      <button type="button" class="button signal master-small" id="routine-confirm-transfer-iqc" ${inFlight||!iqcRecovery&&(!targetEq||!transferDialog.selection.iqc.size)?'disabled':''}>
                        ${transferDialog.moduleStatus.iqc === 'saving' ? t('儲存中…', 'Đang lưu...') : iqcRecovery?t('查詢原移轉／存取收據','Kiểm tra biên nhận chuyển/lưu gốc'):t('確認移轉並存取 IQC 草稿', 'Xác nhận chuyển và lưu IQC')}
                      </button>
                    `}
                  </div>
                </div>
                ${transferDialog.moduleMessages.iqc ? `<p class="routine-transfer-mod-msg">${h(transferDialog.moduleMessages.iqc)}</p>` : ''}
                ${moduleList('iqc','iqc',iqcItems)}
              </div>
              <div class="routine-transfer-module-card ${transferDialog.moduleStatus.ipqcAB}">
                <div class="routine-transfer-module-head"><div><b>IPQC-AB</b><small>${h(summary('ipqc-ab'))}</small></div>
                  <button type="button" class="button signal master-small" id="routine-confirm-transfer-ipqc-ab" ${!targetEq||!transferDialog.selection.ipqcAB.size||inFlight?'disabled':''}>${transferDialog.moduleStatus.ipqcAB==='saving'?t('儲存中…','Đang lưu...'):t('確認移轉並存取 IPQC-AB 草稿','Xác nhận chuyển và lưu IPQC-AB')}</button></div>
                ${transferDialog.moduleMessages.ipqcAB?`<p class="routine-transfer-mod-msg">${h(transferDialog.moduleMessages.ipqcAB)}</p>`:''}
                ${moduleList('ipqc-ab','ipqcAB',ipqcABItems)}
              </div>
            </div>
          </div>

          <div class="routine-dialog-foot">
            <button type="button" class="button ghost" id="routine-transfer-dismiss">
              ${Object.values(transferDialog.moduleStatus).some(s => s === 'success') ? t('完成並關閉', 'Hoàn tất và đóng') : t('取消', 'Hủy')}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function viewDialogHTML() {
    if (!viewDialog) return '';
    const { kind, data } = viewDialog;
    const tree = structure(visible());
    const rows = visible()?.equipment || [];

    let title = '';
    let imgSrc = '';
    let content = '';

    if (kind === 'category') {
      title = `${t('類別資訊', 'Thông tin nhóm')} · ${data.code} ${data.name}`;
      imgSrc = pendingPhotos.get(data.id)?.url || (data.photoId ? `${api}/photo?id=${data.photoId}` : '') || photo(rows.find(e => e.categoryCode === data.code));
      const subCount = tree.subcategories.filter(s => s.categoryId === data.id).length;
      const grpCount = tree.groups.filter(g => g.categoryId === data.id).length;
      const eqCount = rows.filter(e => e.categoryId === data.id || e.categoryCode === data.code).length;
      content = `
        <div class="routine-view-row"><b>${t('類別編號', 'Mã nhóm')}</b><span>${h(data.code)}</span></div>
        <div class="routine-view-row"><b>${t('類別名稱', 'Tên nhóm')}</b><span>${h(data.name)}</span></div>
        <div class="routine-view-row"><b>${t('子類別數量', 'Số phân nhóm')}</b><span>${subCount} ${t('個', 'mục')}</span></div>
        <div class="routine-view-row"><b>${t('規格群組數量', 'Số nhóm quy cách')}</b><span>${grpCount} ${t('個', 'mục')}</span></div>
        <div class="routine-view-row full"><b>${t('所屬檢具總數', 'Tổng thiết bị')}</b><span>${eqCount} ${t('件', 'thiết bị')}</span></div>
      `;
    } else if (kind === 'subcategory') {
      title = `${t('子類別資訊', 'Thông tin phân nhóm')} · ${data.name}`;
      const parentCat = tree.categories.find(c => c.id === data.categoryId);
      imgSrc = pendingPhotos.get(data.id)?.url || (data.photoId ? `${api}/photo?id=${data.photoId}` : '') || photo(rows.find(e => e.subcategoryId === data.id));
      const grpCount = tree.groups.filter(g => g.subcategoryId === data.id).length;
      const eqCount = rows.filter(e => e.subcategoryId === data.id).length;
      content = `
        <div class="routine-view-row"><b>${t('上層類別', 'Nhóm cha')}</b><span>${h(parentCat ? `${parentCat.code} · ${parentCat.name}` : '—')}</span></div>
        <div class="routine-view-row"><b>${t('子類別名稱', 'Tên phân nhóm')}</b><span>${h(data.name)}</span></div>
        <div class="routine-view-row"><b>${t('規格群組數量', 'Số nhóm quy cách')}</b><span>${grpCount} ${t('個', 'mục')}</span></div>
        <div class="routine-view-row"><b>${t('所屬檢具總數', 'Tổng thiết bị')}</b><span>${eqCount} ${t('件', 'thiết bị')}</span></div>
      `;
    } else if (kind === 'group') {
      title = `${t('規格群組資訊', 'Thông tin nhóm quy cách')} · ${data.name || data.id}`;
      const parentCat = tree.categories.find(c => c.id === data.categoryId);
      const parentSub = tree.subcategories.find(s => s.id === data.subcategoryId);
      imgSrc = pendingPhotos.get(data.id)?.url || (data.photoId ? `${api}/photo?id=${data.photoId}` : '') || photo(rows.find(e => e.groupId === data.id));
      const eqCount = rows.filter(e => e.groupId === data.id).length;
      content = `
        <div class="routine-view-row"><b>${t('群組編號', 'Mã nhóm')}</b><span>${h(data.id)}</span></div>
        <div class="routine-view-row"><b>${t('群組名稱', 'Tên nhóm quy cách')}</b><span>${h(groupLabel(data) || '—')}</span></div>
        <div class="routine-view-row"><b>${t('上層類別', 'Nhóm cha')}</b><span>${h(parentCat ? `${parentCat.code} · ${parentCat.name}` : '—')}</span></div>
        <div class="routine-view-row"><b>${t('上層子類別', 'Phân nhóm')}</b><span>${h(parentSub ? parentSub.name : '—')}</span></div>
        <div class="routine-view-row full"><b>${t('規格／能力說明', 'Quy cách / Năng lực')}</b><span>${h(data.spec || '—')}</span></div>
        <div class="routine-view-row full"><b>${t('所屬檢具總數', 'Tổng thiết bị')}</b><span>${eqCount} ${t('件', 'thiết bị')}</span></div>
      `;
    } else if (kind === 'equipment') {
      title = `${t('檢具詳細資訊', 'Chi tiết thiết bị')} · ${data.assetCode}／${data.pieceMark}`;
      const parentCat = tree.categories.find(c => c.id === data.categoryId) || tree.categories.find(c => c.code === data.categoryCode);
      const parentSub = tree.subcategories.find(s => s.id === data.subcategoryId);
      const parentGrp = tree.groups.find(g => g.id === data.groupId);
      imgSrc = photo(data);
      const method = methodCode(data.calibrationMethod);
      const methodStr = methodLabels[method] ? label(methodLabels[method]) : (data.calibrationMethod || '—');
      const cycleStr = data.calibrationCycle === 'custom' ? `${t('自訂：', 'Tùy chỉnh: ')}${data.customCycle || '—'}` : (cycleLabels[data.calibrationCycle] ? label(cycleLabels[data.calibrationCycle]) : (data.calibrationCycle || '—'));
      content = `
        <div class="routine-view-row"><b>${t('固定資產編號', 'Mã TSCĐ')}</b><span>${h(data.assetCode)}</span></div>
        <div class="routine-view-row"><b>${t('個別設備標記（分件號）', 'Ký hiệu thiết bị')}</b><span>${h(data.pieceMark)}</span></div>
        <div class="routine-view-row"><b>${t('檢具名稱', 'Tên thiết bị')}</b><span>${h(displayName(data) || '—')}</span></div>
        <div class="routine-view-row"><b>${t('設備狀態', 'Trạng thái')}</b><span>${data.enabled ? t('啟用', 'Đang dùng') : t('未啟用', 'Chưa kích hoạt')}</span></div>
        <div class="routine-view-row"><b>${t('所屬類別', 'Nhóm cha')}</b><span>${h(parentCat ? `${parentCat.code} · ${parentCat.name}` : data.category || '—')}</span></div>
        <div class="routine-view-row"><b>${t('所屬子類別', 'Phân nhóm')}</b><span>${h(parentSub ? parentSub.name : data.subcategory || '—')}</span></div>
        <div class="routine-view-row full"><b>${t('所屬規格群組', 'Nhóm quy cách')}</b><span>${h(parentGrp ? `${parentGrp.id} · ${groupLabel(parentGrp)}` : data.groupId || '—')}</span></div>
        <div class="routine-view-row"><b>${t('數量與單位', 'Số lượng và đơn vị')}</b><span>${h(data.quantity || 1)} ${h(data.unit || '個')}</span></div>
        <div class="routine-view-row"><b>${t('保管人／部門', 'Người giữ / Bộ phận')}</b><span>${h(data.owner || '—')}</span></div>
        <div class="routine-view-row"><b>${t('資料核對狀態', 'Đối soát')}</b><span>${data.confirmed ? t('已核對', 'Đã đối soát') : t('待確認', 'Chờ xác nhận')}</span></div>
        <div class="routine-view-row"><b>${t('校正方式', 'Phương thức hiệu chuẩn')}</b><span>${h(methodStr)}</span></div>
        ${method !== 'none' ? `
          <div class="routine-view-row"><b>${t('校正週期', 'Chu kỳ')}</b><span>${h(cycleStr)}</span></div>
          <div class="routine-view-row"><b>${t('最近校正日期', 'Ngày hiệu chuẩn')}</b><span>${h(data.calibratedAt || '—')}</span></div>
          <div class="routine-view-row"><b>${t('校正有效期限', 'Hạn hiệu chuẩn')}</b><span>${h(data.expiresAt || '—')}</span></div>
        ` : ''}
        <div class="routine-view-row"><b>${t('入庫日期', 'Ngày nhập kho')}</b><span>${h(data.intakeDate || '—')}</span></div>
        <div class="routine-view-row full"><b>${t('規格／常用檢測用途', 'Quy cách / Mục đích')}</b><span>${h(data.spec || '—')}</span></div>
        <div class="routine-view-row full routine-view-refs-row">${viewReferencesHTML(viewDialog.references)}</div>
        <div class="routine-view-row full"><b>${t('備註', 'Ghi chú')}</b><span>${h(data.notes || '—')}</span></div>
        ${data.sourceRow ? `
          <div class="routine-view-row full" style="border-top:1px dashed #d5e2d9;padding-top:6px;margin-top:6px">
            <b>${t('來源對照資訊', 'Thông tin đối chiếu nguồn')}</b>
            <small style="color:#52695d">${t('來源列：', 'Dòng nguồn: ')}${h(data.sourceRow)}　${t('來源對照：', 'Đối chiếu: ')}${h(data.sourceReference || '—')}　${t('來源標準：', 'Tiêu chuẩn: ')}${h(data.sourceStandardLinks || '—')}</small>
          </div>
        ` : ''}
      `;
    }

    return `
      <div class="routine-dialog-backdrop" id="routine-view-modal-backdrop">
        <div class="routine-view-dialog" role="dialog" aria-modal="true" aria-label="${h(title)}">
          <div class="routine-dialog-head">
            <h3>${h(title)}</h3>
            <button type="button" id="routine-view-close" style="border:none;background:transparent;font-size:1.2rem;cursor:pointer">✕</button>
          </div>
          <div class="routine-view-body">
            <div class="routine-view-photo">
              ${imgSrc ? `<img src="${h(imgSrc)}" alt="${h(title)}" loading="lazy">` : `<span class="routine-photo-empty">${t('尚無照片', 'Chưa có ảnh')}</span>`}
            </div>
            <div class="routine-view-grid">
              ${content}
            </div>
          </div>
          <div class="routine-dialog-foot">
            <button type="button" class="button ghost" id="routine-view-dismiss">${t('關閉', 'Đóng')}</button>
          </div>
        </div>
      </div>
    `;
  }

  function problemsCardHTML() {
    if (!submitProblems || submitProblems.length === 0) return '';
    return ['error','missing','warning'].map(kind=>{
    const problems=submitProblems.filter(p=>(p.kind||(p.id&&p.field?'missing':'error'))===kind);
    if(!problems.length)return '';
    const title=kind==='missing'?t('待補','Cần bổ sung'):kind==='warning'?t('提醒','Lưu ý'):t('報錯','Lỗi');
    return `
      <details class="routine-card routine-errors-card" data-routine-issue-kind="${kind}" data-vd-source="${problemSnapshot?'snapshot':'working'}" ${openErrors ? 'open' : ''} id="routine-${kind==='error'?'errors':kind}-details">
        <summary>
          <span class="routine-errors-summary">
            <span class="routine-alert-icon">⚠️</span>
            <b>${title} · ${problems.length} ${t('項待處理', 'mục cần xử lý')}</b>
          </span>
        </summary>
        <div class="routine-errors-banner">
          <p>${problemSnapshot?h(t('驗證對象：送審快照 ','Đối tượng kiểm tra: bản gửi duyệt ')+problemSnapshot.id+' · '+t('工作內容的補填不會更新此快照，請手動儲存後重新送審。','Sửa nội dung đang làm không cập nhật bản này; hãy lưu thủ công rồi gửi lại.')):t('請依建議核對及修正。','Vui lòng kiểm tra và sửa theo gợi ý.')}</p>
        </div>
        <div class="routine-errors-list">
          ${problems.map(p => {
            const eq = p.id ? (visible()?.equipment || []).find(e => e.id === p.id) : null;
            const itemTitle = eq ? details(eq) : (p.itemTitle || (p.id ? `ID: ${p.id}` : t('系統提示', 'Thông báo hệ thống')));
            let advice = p.advice || '';
            if (!advice) {
              if(p.message==='EQUIPMENT_STILL_REFERENCED')advice=t('請恢復啟用，或依既有審核流程先處理正式標準引用。','Hãy khôi phục trạng thái sử dụng hoặc xử lý liên kết tiêu chuẩn chính thức theo quy trình duyệt hiện có.');
              else if (p.field === 'calibratedAt' || String(p.message).includes('校正日期')) advice = t('請在編輯表單填寫有效之最近校正日期（YYYY-MM-DD）。', 'Vui lòng nhập ngày hiệu chuẩn gần nhất hợp lệ (YYYY-MM-DD).');
              else if (p.field === 'expiresAt' || String(p.message).includes('期限')) advice = t('請填寫有效之校正有效期限（YYYY-MM-DD），且不可早於校正日期。', 'Vui lòng nhập hạn hiệu chuẩn hợp lệ (YYYY-MM-DD) và không được trước ngày hiệu chuẩn.');
              else if (p.field === 'calibrationCycle' || String(p.message).includes('週期')) advice = t('請選擇校正週期，或如不需校正請改選「不校正」。', 'Vui lòng chọn chu kỳ hoặc chuyển sang "Không hiệu chuẩn".');
              else if (p.field === 'name' || String(p.message).includes('名稱')) advice = t('請輸入完整之檢具名稱與所屬群組。', 'Vui lòng nhập tên thiết bị và nhóm quy cách.');
              else if (p.field === 'calibrationMethod' || String(p.message).includes('雙軌')) advice = t('舊雙軌校正需在編輯表單中改選「不校正」、「內部校正」或「外部校正」。', 'Hai luồng cũ cần chọn lại không hiệu chuẩn, nội bộ hoặc bên ngoài.');
              else advice = t('請點選右側「前往修正」修改欄位內容後再送審。', 'Vui lòng nhấn "Đến sửa" để cập nhật thông tin.');
            }
            const canFix = editable() && eq;
            const isLocked = !editable() && p.id;
            return `
              <div class="routine-error-item">
                <div class="routine-error-item-info">
                  <b>${h(itemTitle)}</b>
                  <p>${h(problemMessage(p))}</p>
                  <small>${kind==='warning'?t('僅提醒，不阻擋送審','Chỉ nhắc nhở, không chặn gửi duyệt'):t('阻擋送審','Chặn gửi duyệt')}</small>
                  <small style="color:#206a4e">💡 ${t('修正建議：', 'Gợi ý sửa: ')}${h(advice)}</small>
                  ${p.requestId?`<small>${t('查詢編號：','Mã tra cứu: ')}${h(p.requestId)}</small>`:''}
                </div>
                ${canFix ? `
                  <button type="button" class="routine-error-action" data-fix-equipment="${h(p.id)}" data-fix-field="${h(p.field || '')}">
                    ${t('前往修正', 'Đến sửa')}
                  </button>
                ` : isLocked ? `
                  <span class="routine-error-locked">${t('草稿鎖定中（審核中或已核准）', 'Bản nháp đang khóa')}</span>
                ` : p.retryAction ? `
                  <button type="button" class="routine-error-action routine-retry-action" data-retry-action="${h(p.retryAction)}">
                    ${t('重試', 'Thử lại')}
                  </button>
                ` : `
                  <span style="color:#6b7280;font-size:.82rem">${t('請依上述說明操作', 'Vui lòng thực hiện theo hướng dẫn')}</span>
                `}
              </div>
            `;
          }).join('')}
        </div>
      </details>
    `;
    }).join('');
  }

  function bindList() {
    host.querySelectorAll('[data-equipment-page]').forEach(button => button.onclick = guardWorking(button,() => { equipmentPage += button.dataset.equipmentPage === 'next' ? 1 : -1; renderEquipmentResults(); }));
    host.querySelectorAll('[data-equipment-select]').forEach(button => button.onclick = guardWorking(button,() => {
      selectedEquipmentId = button.dataset.equipmentSelect;
      render();
    }));
    host.querySelectorAll('[data-equipment-view]').forEach(button => button.onclick = guardWorking(button,async event => {
      event.stopPropagation();
      const id = button.dataset.equipmentView;
      const item = (visible()?.equipment || []).find(e => e.id === id);
      if (item) {
        equipmentEditRequest++;
        if(viewDialog?.kind==='equipment'&&viewDialog.data?.id===id&&viewDialog.references?.current())return;
        viewDialog?.references?.closeDetail?.();
        const fact=calibrationFacts[id];
        viewDialog = { kind: 'equipment', data: visible()?.status!=='superseded'&&fact?.locked?{...item,...fact.dates}:item };
        viewDialog.references=newViewReferences(id);
        render();
      }
    }));
    host.querySelectorAll('[data-equipment-edit]').forEach(button => button.onclick = guardWorking(button,async event => {
      event.stopPropagation();
      await openEditEquipment(button.dataset.equipmentEdit);
    }));
    host.querySelectorAll('[data-equipment-delete]').forEach(button => button.onclick = guardWorking(button,event => {
      event.stopPropagation();
      deleteEquipment(button.dataset.equipmentDelete).catch(failed);
    }));
    host.querySelectorAll('[data-equipment-transfer]').forEach(button => button.onclick = guardWorking(button,event => {
      event.stopPropagation();
      openTransferModal(button.dataset.equipmentTransfer);
    }));
    host.querySelector('#routine-add')?.addEventListener('click', guardWorking(host.querySelector('#routine-add'),openAddEquipmentDialog));
  }

  function routineTabIsActive() {
    const content = document.querySelector('#data-content');
    return host === content && content?.isConnected && content.dataset.activeTab === 'quality-routine-equipment';
  }

  const historyFields={equipment:['檢具與設備','Dụng cụ và thiết bị'],groups:['規格群組','Nhóm quy cách'],categories:['類別','Loại'],subcategories:['子類別','Phân loại'],issues:['問題紀錄','Bản ghi vấn đề'],id:['識別碼','Mã'],name:['名稱','Tên'],nameVi:['越文名稱','Tên tiếng Việt'],nameZh:['中文名稱','Tên tiếng Hoa'],code:['編號','Mã'],assetCode:['資產編號','Mã tài sản'],pieceMark:['件號','Số chi tiết'],unit:['單位','Đơn vị'],spec:['規格','Quy cách'],owner:['保管者','Người giữ'],enabled:['使用中','Đang dùng'],calibrationMethod:['校正方式','Phương pháp hiệu chuẩn'],calibrationCycle:['校正週期','Chu kỳ hiệu chuẩn'],customCycle:['自訂週期','Chu kỳ riêng'],calibratedAt:['校正日期','Ngày hiệu chuẩn'],expiresAt:['有效期限','Ngày hết hạn'],notes:['備註','Ghi chú'],intakeDate:['入庫日期','Ngày nhập'],confirmed:['已確認','Đã xác nhận'],photoId:['照片識別碼','Mã ảnh'],photoHidden:['隱藏照片','Ẩn ảnh'],photos:['照片','Ảnh'],photoSource:['照片來源','Nguồn ảnh'],groupId:['規格群組','Nhóm quy cách'],categoryId:['類別','Loại'],subcategoryId:['子類別','Phân loại'],status:['狀態','Trạng thái'],resolution:['處理結果','Kết quả xử lý'],type:['問題類型','Loại vấn đề'],createdAt:['建立日期','Ngày tạo'],updatedAt:['更新日期','Ngày cập nhật']};
  function mountApprovedHistory(shell,log,empty){
    const client=sharedTransport(),page=host;approvedHistoryView?.retire();
    approvedHistoryView=window.VersionDraftUI.createApprovedHistory({root:host.querySelector('.routine-page'),shell,client,empty,selectId:'equipment-approved-version',cacheKey:control?.activeVersionId||null,
      isCurrent:()=>host===page&&sharedClient===client&&routineTabIsActive(),
      canChoose:()=>!busy&&!equipmentSaveChoice&&!equipmentSaveComparison&&!equipmentReadAttempt&&!historyUploads&&!editingEquipmentId&&!nodeDialog&&!addingEquipment&&!viewDialog&&!transferDialog&&!pendingPhotos.size&&!transferBusy(),
      onBoundary(){historyDisplayEpoch++;readIntent++;},
      onDenied(){retireEquipmentSaveComparison();},
      renderCurrent(){approvedHistoryView=null;render();},
      validateSnapshot:snapshot=>snapshot&&['equipment','groups','categories','subcategories','issues'].every(key=>Array.isArray(snapshot[key])&&snapshot[key].every(row=>row&&typeof row==='object'&&!Array.isArray(row))),
      renderSnapshot(target,snapshot,current){for(const key of ['equipment','groups','categories','subcategories'])for(const row of snapshot[key]){if(row.photoHidden)continue;if(row.photoId)row.photos=[{id:row.photoId}];else if(row.photoSource?.webPath)row.photos=[{src:row.photoSource.webPath}];}window.VersionDraftUI.renderApprovedCollections(target,snapshot,{collections:['equipment','groups','categories','subcategories','issues'],fields:historyFields,mediaURL:photo=>/^[a-f0-9]{64}$/.test(photo?.id||'')?api+'/photo?id='+encodeURIComponent(photo.id):typeof photo?.src==='string'&&/^(?:\/process\/assets\/|assets\/)[^?#]*\.(?:webp|png|jpg|jpeg|gif)$/i.test(photo.src)?photo.src.startsWith('assets/')?'/process/'+photo.src:photo.src:null},current);}
    });
  }
  function render() {
    if(approvedHistoryView?.blocked){approvedHistoryView.relabel();return;}approvedHistoryView?.retire();approvedHistoryView=null;
    if (!routineTabIsActive()) return;
    const ownerBlocked=inputOwner&&!inputOwnerCurrent();
    if(ownerBlocked||bindAddEquipmentInput.forms?.get(newEquipmentForm)?.drawer?.isConnected===false)captureRetainedAddEquipmentInput();
    if (!control || controlActor!==identity()?.id || ownerBlocked) {
      const loadError = ownerBlocked?t('帳號或登入世代已變更；原輸入已隔離保留，請重新核對，不會送到新帳號。','Tài khoản hoặc phiên đăng nhập đã đổi; dữ liệu cũ được giữ riêng. Hãy đối chiếu lại; không gửi bằng tài khoản mới.'):message;
      host.innerHTML = `<section class="routine-page" data-i18n-skip="true">
        <div class="routine-card">
          <p>${h(loadError ? displayDraftError(loadError) : t('正在載入檢具資料…', 'Đang tải dữ liệu thiết bị…'))}</p>
          ${hasBeginRecovery()||sharedClient?.hasUnknown() ? `<button type="button" class="button signal" id="routine-begin-recheck">${t('查詢原操作收據', 'Kiểm tra biên nhận gốc')}</button>` : ''}
          ${loadError ? `<button type="button" class="button signal" id="routine-load-retry">${t('重新載入', 'Tải lại')}</button>` : ''}
        </div>
      </section>`;
      host.querySelector('#routine-begin-recheck')?.addEventListener('click', guardWorking(host.querySelector('#routine-begin-recheck'),enterExistingDraft));
    host.querySelector('#routine-load-retry')?.addEventListener('click', guardWorking(host.querySelector('#routine-load-retry'),async () => {
        message = '';
        render();
        try { await read(false,true); render(); } catch (error) { message = error.message; render(); }
      }));
      return;
    }
    captureAddEquipmentInput();
    const version = selected(), data = visible();
    const restrictedActions=version?.status==='draft'&&control.workflow
      ? [['edit',t('修改','Sửa')],['create',t('新增','Thêm')],['delete',t('刪除','Xóa')],['save',t('儲存草稿','Lưu bản nháp')],['submit',t('送出審核','Gửi duyệt')]]
        .filter(([action])=>sharedClient?.permission(action)===false).map(([,label])=>label)
      : [];
    if(problemSnapshot&&(problemSnapshot.generation!==control.workflow?.generation||problemSnapshot.kind==='saved'&&problemSnapshot.id!==control.workflow?.saved?.id)){
      submitProblems=[];problemSnapshot=null;openErrors=false;
      message=t('共用快照已變更，先前驗證結果已失效；請重新送審驗證。','Bản chụp chung đã thay đổi; kết quả kiểm tra trước không còn áp dụng. Hãy gửi lại để kiểm tra.');
    }
    const rows = data?.equipment || [], tree = structure(data);
    if (selectedCategory && !tree.categories.some(item => item.id === selectedCategory)) selectedCategory = '';
    if (selectedSubcategory && !tree.subcategories.some(item => item.id === selectedSubcategory && item.categoryId === selectedCategory)) selectedSubcategory = '';
    if (selectedGroup && !tree.groups.some(item => item.id === selectedGroup && item.subcategoryId === selectedSubcategory)) selectedGroup = '';
    const editingItem = editingEquipmentId ? rows.find(record => record.id === editingEquipmentId) : null;
    if (editingEquipmentId && !editingItem) { editingEquipmentId = ''; formSnapshot = null; }
    const changes = version?.history || [];

    host.innerHTML = `<section class="routine-page" id="routine-page" data-i18n-skip="true">
      <div class="routine-top">
        <div>
          <p class="eyebrow">QUALITY DATABASE / ROUTINE</p>
          <h2>${t('檢具與測試設備管理', 'Quản lý Dưỡng kiểm và Thiết bị đo')}</h2>
          <p>${t('類別 → 子類別 → 規格群組 → 檢具。來源原文、Excel 列與照片對照均保留。', 'Nhóm → Phân nhóm → Nhóm quy cách → Thiết bị. Giữ nguyên nguồn, dòng Excel và ảnh.')}</p>
        </div>
        <span class="routine-count">${rows.length} ${t('筆設備', 'thiết bị')}</span>
      </div>

      <p id="routine-operation-outcome" role="status" hidden></p>
      ${message ? `<div class="routine-message" role="${readUnavailable?'alert':'status'}">${h(displayDraftError(message))}</div>` : ''}
      ${restrictedActions.length?`<p class="routine-permission-note">${h(t('目前帳號沒有以下權限：','Tài khoản hiện tại không có quyền: ')+restrictedActions.join(t('、',', ')))}</p>`:''}
      ${referenceAction?`<p role="status">${t('引用檢查中；未刪除任何資料','Đang kiểm tra tham chiếu; chưa xóa dữ liệu')} <button type="button" id="routine-reference-cancel">${t('取消檢查','Hủy kiểm tra')}</button></p>`:''}
      ${hasBeginRecovery()||sharedClient?.hasUnknown()?`<button type="button" class="button signal" id="routine-begin-recheck" ${busy?'disabled':''}>${t('查詢原操作收據','Kiểm tra biên nhận gốc')}</button>`:''}
      ${readUnavailable?`<button type="button" class="button signal" id="routine-load-retry">${t('重新載入並保留輸入','Tải lại và giữ dữ liệu đang nhập')}</button>`:''}

      ${!version ? `<section class="routine-card">
        <h3>${t('尚未匯入來源', 'Chưa nhập nguồn')}</h3>
        <p>${t('原始 Excel 的 119 筆設備、119 張對應照片及 37 筆待確認事項會建立為未核准草稿；不影響現有生效版。', '119 thiết bị, 119 ảnh và 37 mục chờ đối soát sẽ được tạo thành bản nháp; không ảnh hưởng bản hiệu lực.')}</p>
        ${permitted('master.import') ? `<button class="button signal" id="routine-import" ${busy ? 'disabled' : ''}>${t('匯入來源 Excel（待確認草稿）', 'Nhập Excel nguồn (Bản nháp)')}</button>` : `<p>${t('目前帳號沒有匯入權限。', 'Tài khoản không có quyền nhập.')}</p>`}
      </section>` : `
      <!-- 1. 設備資料版本／草稿 -->
      <section class="routine-card routine-version">
        <div>
          <small>${t('設備資料版本', 'Phiên bản dữ liệu')}</small>
          <h3>V${version.number} <span class="routine-status">${h(status(version.status))}</span></h3>
          <p>${t('目前生效：', 'Hiệu lực hiện tại: ')}${active() ? `V${active().number}` : t('尚無生效版本', 'Chưa có bản hiệu lực')} · ${t('最後編輯', 'Người sửa cuối')} ${h(lastEdit(version)?.actorName || version.creatorName)} · ${h(date(lastEdit(version)?.at || version.createdAt))}</p>
          <p>${t('送審者', 'Người gửi')} ${h(version.submittedBy || '—')} · ${h(date(version.submittedAt))}；${t('審核者', 'Người duyệt')} ${h(version.reviewedBy || '—')} · ${h(date(version.reviewedAt))}；${t('意見', 'Ý kiến')} ${h(version.reviewComment || '—')}</p>
        </div>
        <div class="routine-version-actions">
          <label>${t('查看版本／草稿', 'Xem phiên bản / bản nháp')}<select id="routine-version-select">${[...control.versions].reverse().map(record => `<option value="${h(record.id)}" ${record.id === version.id ? 'selected' : ''}>V${record.number} · ${h(status(record.status))} · ${h(lastEdit(record)?.actorName || record.creatorName)} · ${h(date(lastEdit(record)?.at || record.createdAt))}</option>`).join('')}</select></label>
          ${!open() && active() && permitted('approval.submit') ? `<button class="button signal" id="routine-begin" ${busy ? 'disabled' : ''}>${t('開始修改', 'Bắt đầu sửa')}</button>` : ''}
          ${canDraftAction('save') ? `<button class="button ghost" id="routine-save" ${busy ? 'disabled' : ''}>${t('儲存草稿', 'Lưu bản nháp')}</button>` : ''}${canDraftAction('submit') ? `<button class="button signal" id="routine-submit" ${busy ? 'disabled' : ''}>${t('送出審核', 'Gửi duyệt')}</button>` : ''}
          ${version.status === 'pending' && permitted('approval.withdraw') ? `<button class="button ghost" id="routine-withdraw" ${busy ? 'disabled' : ''}>${t('撤回送審', 'Rút hồ sơ')}</button>` : ''}
        </div>
      </section>

      <!-- 2. 問題提醒（有錯誤才顯示，無錯誤時隱藏） -->
      ${problemsCardHTML()}

      <!-- 3. 待補／來源待確認清單（獨立卡片） -->
      <details class="routine-card routine-issues-card"><summary>${t('來源待確認清單', 'Danh sách chờ đối soát nguồn')} · ${(data.issues || control.issues).filter(issue => issue.status !== 'resolved').length} ${t('筆未完成', 'mục chưa xong')}</summary>
        <div class="routine-issues">
          ${(data.issues || control.issues).map((issue, index) => `
            <div>
              <div class="routine-issue-head">
                <b data-i18n-skip="true">${h(issue.assetCode)}／${h(issue.pieceMark)} · ${h(issue.type)}</b>
                <button type="button" class="routine-issue-action" data-jump-issue="${index}">${t('前往核對', 'Đến kiểm tra')}</button>
              </div>
              <p data-i18n-skip="true">${h(issue.detail)}</p>
              <small>${t('來源列', 'Dòng nguồn')} ${h(issue.sourceRow)} · ${h(issue.status === 'resolved' ? t('已處理', 'Đã xử lý') : t('待確認', 'Chờ xác nhận'))} · USER <span data-i18n-skip="true">${h(issue.resolvedById || '—')} / ${h(issue.resolvedBy || '—')}</span> · ${h(date(issue.resolvedAt))}</small>
              ${editable() ? `<label>${t('處理結果', 'Kết quả xử lý')}<input data-issue-result="${index}" data-i18n-skip="true" value="${h(issue.resolution || '')}" placeholder="${t('填寫核對依據與結果', 'Nhập căn cứ và kết quả')}"></label><button type="button" data-issue-resolve="${index}">${issue.status === 'resolved' ? t('改回待確認', 'Chuyển lại chờ xác nhận') : t('標記已處理', 'Đánh dấu đã xử lý')}</button>` : `<p data-i18n-skip="true">${h(issue.resolution || '')}</p>`}
            </div>
          `).join('')}
        </div>
      </details>

      <details class="routine-card routine-history-card"><summary>${t('歷史操作', 'Lịch sử thao tác')} · ${changes.length}</summary><div>${changes.slice().reverse().map(event=>`<p>${h(actionName(event.action))} · ${h(event.actorName)} · ${h(date(event.at))} ${h(event.comment||'')}</p>`).join('')||`<p>${t('尚無操作紀錄','Chưa có thao tác')}</p>`}</div></details>

      <!-- 4. 搜尋工具列 -->
      <div class="routine-toolbar">
        <label>${t('搜尋檢具', 'Tìm thiết bị')}<input id="routine-search" type="search" value="${h(search)}" placeholder="${t('資產編號、分件號、名稱、群組、規格、保管人', 'Mã TSCĐ, ký hiệu, tên, nhóm, quy cách, người giữ')}"></label>
      </div>

      <!-- 5. 分類層級 -->
      ${hierarchyHTML(data, rows)}

      <!-- 6. 檢具清單 -->
      ${equipmentListHTML(rows, data)}

      <!-- 彈窗與抽屜 -->
      ${form(editingItem)}
      ${addEquipmentDrawerHTML()}
      ${nodeDialogHTML()}
      ${viewDialogHTML()}
      ${transferDialogHTML()}
      `}</section>`;
    bind();
    host.querySelector('#routine-begin-recheck')?.addEventListener('click', guardWorking(host.querySelector('#routine-begin-recheck'),enterExistingDraft));
    host.querySelector('#routine-load-retry')?.addEventListener('click',guardWorking(host.querySelector('#routine-load-retry'),async()=>{if(addingEquipment&&newEquipmentForm&&inputOwnerCurrent()){await recoverAddEquipmentRead();return;}const preserveInput=isDirty()||pendingPhotos.size>0;try{await read(preserveInput,true);message=preserveInput?t('已載入最新版，未套用輸入仍保留；套用時重新核對來源。','Đã tải bản mới; giữ đầu vào chưa áp dụng, kiểm tra nguồn khi áp dụng.'):'';render();}catch(error){message=error.message;render();}}));
    if(readUnavailable)host.querySelectorAll('#routine-save,#routine-submit,#routine-begin').forEach(button=>{button.disabled=true;});
    if(control.workflow){const flow=control.workflow,panel=document.createElement('section');panel.className='routine-card';panel.id='routine-shared-status';panel.setAttribute('role','status');panel.innerHTML=`<b>${t('共用範圍：檢具全庫','Phạm vi chung: toàn bộ thiết bị')}</b><p>${sharedClient?.hasUnknown()?t('結果未知；請查詢原操作收據','Kết quả chưa rõ; kiểm tra biên nhận gốc'):busy?t('儲存中…','Đang lưu…'):readUnavailable?t('讀取失敗；請重新核對','Lỗi đọc; hãy kiểm tra lại'):hasLocalDraftInput()?t('本地未套用／未儲存','Chưa áp dụng / lưu dữ liệu cục bộ'):flow.pendingId?t('待審鎖定','Khóa chờ duyệt'):!flow.saved||JSON.stringify(flow.saved.content)!==JSON.stringify(flow.working)?t('已同步 · 尚未手動儲存','Đã đồng bộ · chưa lưu thủ công'):t('已儲存','Đã lưu')}</p>${flow.saved?`<p>${t('儲存者','Người lưu')}: ${h(flow.saved.actor.name)} · ${h(flow.saved.at)}</p>`:''}`;host.querySelector('#routine-page')?.prepend(panel);
      if(sharedClient?.hasUnknown())for(const [label,method]of [[t('查詢上次操作','Kiểm tra thao tác trước'),'resolveUnknown']]){const b=document.createElement('button');b.textContent=label;b.onclick=guardWorking(b,async()=>{try{await sharedTransport()[method]();await read();render();}catch(e){failed(e);}});panel.append(b);}
    }
    sharedClient?.gatePermissions?.();
    if(readUnavailable)showEquipmentReadRecovery(message);
    window.VersionDraftUI?.mount(host,{header:'.routine-version',historyClient:sharedTransport,mountApprovedHistory,module:t('檢具與測試設備','Dưỡng kiểm và thiết bị đo'),scope:t('檢具全庫','Toàn bộ thiết bị'),version,versions:control.versions,active:active(),flow:control.workflow,busy,localUnsaved:hasLocalDraftInput(),failed:readUnavailable||!busy&&sharedClient?.hasUnknown()&&!sharedClient?.confirmedOperation?.(),actions:{begin:'#routine-begin',save:'#routine-save',submit:'#routine-submit',withdraw:'#routine-withdraw'},review:()=>{state.view='approval';state.approvalTab='quality';window.render();},errors:'[data-routine-issue-kind="error"]',missing:'.routine-issues-card,[data-routine-issue-kind="missing"]',history:['.routine-history-card','[data-routine-issue-kind="warning"]'],status:['#routine-shared-status'],remove:['.routine-top','#routine-case-history']});
    updateEquipmentLocalStatus();
  }

  function updateEquipmentLocalStatus() {
    const confirmed=sharedClient?.confirmedOperation?.(),outcome=host?.querySelector('#routine-operation-outcome');
    if(outcome){outcome.hidden=!confirmed;outcome.textContent=confirmed?t('原操作收據已確認；正在核對草稿與權限，請勿重送','Đã xác nhận biên nhận gốc; đang kiểm tra bản nháp và quyền, không gửi lại'):'';}
    const flow=control?.workflow;if(!flow)return;
    const state=confirmed?t('原操作收據已確認；正在核對草稿與權限，請勿重送','Đã xác nhận biên nhận gốc; đang kiểm tra bản nháp và quyền, không gửi lại'):busy?t('儲存／處理中…','Đang lưu / xử lý…'):
      sharedClient?.hasUnknown()?t('結果未知；請查詢原操作收據','Kết quả chưa rõ; kiểm tra biên nhận gốc'):
      readUnavailable||sharedClient?.hasSyncFailures?.()?t('同步失敗；請重新核對','Lỗi đồng bộ; hãy kiểm tra lại'):
      hasLocalDraftInput()?t('本地編輯／未套用未儲存','Đang sửa cục bộ / chưa áp dụng hoặc lưu'):
      !flow.saved||!equipmentContentEqual(flow.saved.content,flow.working)?t('已套用至共用草稿；尚未儲存','Đã áp dụng vào bản nháp chung; chưa lưu'):
      t('已持久化至伺服器','Đã lưu bền vững trên máy chủ');
    for(const selector of ['[data-vd-saved]','[data-vd-sync]','#routine-shared-status > p']){const node=host?.querySelector(selector);if(node)node.textContent=state;}
  }

  function fitEquipmentEditor() {
    const backdrop = host?.querySelector('#routine-backdrop');
    const viewport = window.visualViewport;
    if (!backdrop || !viewport) return;
    backdrop.style.setProperty('--equipment-editor-top', viewport.offsetTop + 'px');
    backdrop.style.setProperty('--equipment-editor-height', viewport.height + 'px');
  }

  window.visualViewport?.addEventListener('resize', fitEquipmentEditor);
  window.visualViewport?.addEventListener('scroll', fitEquipmentEditor);

  function bind() {
    fitEquipmentEditor();
    const root = host;
    root.querySelector('#routine-reference-cancel')?.addEventListener('click',guardWorking(root.querySelector('#routine-reference-cancel'),()=>{const action=referenceAction;if(!action)return;action.controller.abort();referenceAction=null;message=t('已取消引用檢查；資料保留，未刪除。','Đã hủy kiểm tra tham chiếu; giữ dữ liệu, chưa xóa.');render();}));
    root.querySelector('#routine-import')?.addEventListener('click', guardWorking(root.querySelector('#routine-import'),importSource));
    root.querySelector('#routine-begin')?.addEventListener('click', guardWorking(root.querySelector('#routine-begin'),() => write('begin')));
    root.querySelector('#routine-save')?.addEventListener('click', guardWorking(root.querySelector('#routine-save'),() => saveDraft('save')));
    root.querySelector('#routine-submit')?.addEventListener('click', guardWorking(root.querySelector('#routine-submit'),() => { void saveDraft('submit'); }));
    root.querySelector('#routine-withdraw')?.addEventListener('click', guardWorking(root.querySelector('#routine-withdraw'),() => write('withdraw')));

    root.querySelector('#routine-version-select')?.addEventListener('change', guardWorking(root.querySelector('#routine-version-select'),event => {
      if (editable() && isDirty() &&
          !confirm(t('尚有未儲存的草稿修改；確定切換版本？', 'Còn thay đổi chưa lưu; bạn có chắc muốn chuyển phiên bản?'))) { event.target.value = selected().id; return; }
      equipmentEditRequest++;
      selectedVersionId = event.target.value;
      working = selected().status === 'draft' ? snapshotOf(selected()) : null;
      rememberInputOwner();
      selectedEquipmentId = '';
      editingEquipmentId = '';
      formSnapshot = null;
      submitProblems = [];
      problemSnapshot = null;
      openErrors = false;
      render();
    }));

    const searchInput = root.querySelector('#routine-search');
    searchInput?.addEventListener('compositionstart', guardWorking(searchInput,() => { composing = true; }));
    searchInput?.addEventListener('compositionend', guardWorking(searchInput,event => { composing = false; search = event.target.value; equipmentPage = 1; renderEquipmentResults(); }));
    searchInput?.addEventListener('input', guardWorking(searchInput,event => { search = event.target.value; if (!composing) { equipmentPage = 1; renderEquipmentResults(); } }));
    bindList();

    root.querySelectorAll('[data-node-select]').forEach(button => button.onclick = guardWorking(button,() => {
      equipmentEditRequest++;
      const id = button.dataset.id;
      if (button.dataset.nodeSelect === 'category') { selectedCategory = id; selectedSubcategory = ''; selectedGroup = ''; }
      if (button.dataset.nodeSelect === 'subcategory') {
        selectedSubcategory = id;
        const groupsUnderSub = structure(visible()).groups.filter(g => g.subcategoryId === id);
        selectedGroup = groupsUnderSub.length === 1 ? groupsUnderSub[0].id : '';
      }
      if (button.dataset.nodeSelect === 'group') selectedGroup = id;
      // Hierarchy selections filter this same page. Keep open RAM editors,
      // their original parent/basis and exact File entries until completion/cancel.
      selectedEquipmentId = '';
      equipmentPage = 1; render();
    }));
    root.querySelectorAll('[data-node-view]').forEach(button => button.onclick = guardWorking(button,event => {
      event.stopPropagation();
      const kind = button.dataset.nodeView;
      const id = button.dataset.id;
      const collection = kind === 'category' ? structure(visible()).categories :
                         kind === 'subcategory' ? structure(visible()).subcategories :
                         structure(visible()).groups;
      const item = collection.find(c => c.id === id);
      if (item) {
        equipmentEditRequest++;
        viewDialog = { kind, data: item };
        render();
      }
    }));
    root.querySelectorAll('[data-node-add]').forEach(button => button.onclick = guardWorking(button,() => openNodeDialog(button.dataset.nodeAdd)));
    root.querySelectorAll('[data-node-edit]').forEach(button => button.onclick = guardWorking(button,event => { event.stopPropagation(); openNodeDialog(button.dataset.nodeEdit, button.dataset.id); }));
    root.querySelectorAll('[data-node-delete]').forEach(button => button.onclick = guardWorking(button,event => { event.stopPropagation(); deleteNode(button.dataset.nodeDelete, button.dataset.id).catch(failed); }));

    // Node dialog bindings
    const boundNodeDialog=nodeDialog;
    for(const field of ['name','spec'])root.querySelector('#routine-dialog-'+field)?.addEventListener('input',guardWorking(root.querySelector('#routine-dialog-'+field),event=>{if(nodeDialog===boundNodeDialog)nodeDialog[field]=event.target.value;}));
    root.querySelector('#routine-dialog-close')?.addEventListener('click', guardWorking(root.querySelector('#routine-dialog-close'),cancelNodeDialog));
    root.querySelector('#routine-dialog-cancel')?.addEventListener('click', guardWorking(root.querySelector('#routine-dialog-cancel'),cancelNodeDialog));
    root.querySelector('#routine-dialog-confirm')?.addEventListener('click', guardWorking(root.querySelector('#routine-dialog-confirm'),confirmNodeDialog));
    root.querySelector('#routine-node-dialog-backdrop')?.addEventListener('click', guardWorking(root.querySelector('#routine-node-dialog-backdrop'),event => {
      if (event.target?.id === 'routine-node-dialog-backdrop') cancelNodeDialog();
    }));
    root.querySelector('#routine-dialog-photo-input')?.addEventListener('change', guardWorking(root.querySelector('#routine-dialog-photo-input'),event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 5_000_000) { alert(t('照片限 5 MB', 'Ảnh giới hạn 5 MB')); return; }
      nodeDialog.name = root.querySelector('#routine-dialog-name')?.value || '';
      if (nodeDialog.kind === 'group') nodeDialog.spec = root.querySelector('#routine-dialog-spec')?.value || '';
      if (nodeDialog.pendingPhoto) URL.revokeObjectURL(nodeDialog.pendingPhoto.url);
      nodeDialog.pendingPhoto = { file, url: URL.createObjectURL(file) };
      nodeDialog.photoRemoved = false;
      render();
    }));
    root.querySelector('#routine-dialog-photo-remove')?.addEventListener('click', guardWorking(root.querySelector('#routine-dialog-photo-remove'),() => {
      nodeDialog.name = root.querySelector('#routine-dialog-name')?.value || '';
      if (nodeDialog.kind === 'group') nodeDialog.spec = root.querySelector('#routine-dialog-spec')?.value || '';
      if (nodeDialog.pendingPhoto) URL.revokeObjectURL(nodeDialog.pendingPhoto.url);
      nodeDialog.pendingPhoto = null;
      nodeDialog.photoId = '';
      nodeDialog.photoRemoved = true;
      render();
    }));

    // View dialog bindings
    root.querySelector('#routine-view-close')?.addEventListener('click', guardWorking(root.querySelector('#routine-view-close'),() => { viewDialog?.references?.closeDetail?.();viewDialog = null; render(); }));
    root.querySelector('#routine-view-dismiss')?.addEventListener('click', guardWorking(root.querySelector('#routine-view-dismiss'),() => { viewDialog?.references?.closeDetail?.();viewDialog = null; render(); }));
    root.querySelector('#routine-view-modal-backdrop')?.addEventListener('click', guardWorking(root.querySelector('#routine-view-modal-backdrop'),event => {
      if (event.target?.id === 'routine-view-modal-backdrop') { viewDialog?.references?.closeDetail?.();viewDialog = null; render(); }
    }));

    // Transfer dialog bindings
    root.querySelector('#routine-transfer-close')?.addEventListener('click', guardWorking(root.querySelector('#routine-transfer-close'),() => { transferDialog = null; render(); }));
    root.querySelector('#routine-transfer-dismiss')?.addEventListener('click', guardWorking(root.querySelector('#routine-transfer-dismiss'),() => { transferDialog = null; render(); }));
    root.querySelector('#routine-transfer-backdrop')?.addEventListener('click', guardWorking(root.querySelector('#routine-transfer-backdrop'),event => {
      if (event.target?.id === 'routine-transfer-backdrop') { transferDialog = null; render(); }
    }));

    root.querySelector('#routine-target-cat')?.addEventListener('change', guardWorking(root.querySelector('#routine-target-cat'),event => {
      if (!transferDialog || transferBusy()) return;
      transferDialog.targetCat = event.target.value;
      transferDialog.targetEqId = '';
      render();
    }));

    root.querySelector('#routine-target-eq-select')?.addEventListener('change', guardWorking(root.querySelector('#routine-target-eq-select'),event => {
      if (!transferDialog || transferBusy()) return;
      transferDialog.targetEqId = event.target.value;
      render();
    }));

    root.querySelectorAll('[data-transfer-reference]').forEach(button=>button.onclick=guardWorking(button,async()=>{
      const dialog=transferDialog,kind=button.dataset.transferReference,preview=dialog?.preview;
      if(!preview)return;
      const item=effectiveRows(preview,referenceModule[kind],dialog.sourceId).find(row=>row.id===button.dataset.transferLocator);
      if(!item)return;
      const serial=dialog.locatorRequest=(dialog.locatorRequest||0)+1;
      const current=()=>transferDialog===dialog && dialog.preview===preview && transferOwnerCurrent(dialog.owner) && serial===dialog.locatorRequest;
      try{
        const version=await readEffectiveItem(kind,item.effectiveReference,dialog.sourceId,preview.revision);
        if(!current())return;
        dialog.locator=standardLocatorHTML(kind,item.effectiveReference,version);
      }catch(error){if(!current())return;dialog.locator='<p role="alert">'+h(error.message)+'</p>';}
      dialog.locatorKind=kind;
      render();
    }));
    root.querySelectorAll('[data-transfer-extra]').forEach(node=>node.ontoggle=guardWorking(node,()=>{
      if(transferDialog)(transferDialog.extraOpen||={})[node.dataset.transferExtra]=node.open;
    }));
    root.querySelectorAll('[data-transfer-check]').forEach(chk => {
      chk.onchange = guardWorking(chk,() => {
        if (!transferDialog || transferBusy()) return;
        const mod = chk.dataset.transferCheck;
        const id = chk.value;
        if (chk.checked) transferDialog.selection[mod]?.add(id);
        else transferDialog.selection[mod]?.delete(id);
        const confirmButton=root.querySelector('#routine-confirm-transfer-'+referenceModule[mod]);
        const recovering=(mod==='fqc' && hasFqcTransfer()) || (mod==='iqc' && hasIqcTransfer());
        if(confirmButton)confirmButton.disabled=!recovering && (!transferDialog.targetEqId || !transferDialog.selection[mod]?.size);
      });
    });

    root.querySelector('#routine-confirm-transfer-fqc')?.addEventListener('click', guardWorking(root.querySelector('#routine-confirm-transfer-fqc'),() => executeTransfer('fqc')));
    root.querySelector('#routine-confirm-transfer-iqc')?.addEventListener('click', guardWorking(root.querySelector('#routine-confirm-transfer-iqc'),() => executeTransfer('iqc')));
    root.querySelector('#routine-confirm-transfer-ipqc-c')?.addEventListener('click', guardWorking(root.querySelector('#routine-confirm-transfer-ipqc-c'),() => executeTransfer('ipqcC')));
    root.querySelector('#routine-confirm-transfer-ipqc-ab')?.addEventListener('click', guardWorking(root.querySelector('#routine-confirm-transfer-ipqc-ab'),() => executeTransfer('ipqcAB')));

    bindReferenceActions(root);
    bindViewReferences(root);

    root.querySelectorAll('[data-jump-issue]').forEach(btn => btn.onclick = guardWorking(btn,() => {
      const version=visible(),issue=(version.issues||control.issues)[Number(btn.dataset.jumpIssue)];
      const matches=!issue?[]:issue.equipmentId
        ? version.equipment.filter(row=>row.id===issue.equipmentId)
        : Number.isSafeInteger(issue.sourceRow)&&issue.sourceRow>0
          ? version.equipment.filter(row=>row.sourceRow===issue.sourceRow) : [];
      if(matches.length===1) locateEquipment(matches[0].id);
      else alert(t('無法從來源紀錄唯一辨識這件檢具，請依原始來源列核對。','Không thể xác định duy nhất thiết bị từ bản ghi nguồn. Hãy đối chiếu dòng nguồn gốc.'));
    }));
    root.querySelectorAll('[data-fix-equipment]').forEach(button => button.onclick = guardWorking(button,() => locateEquipment(button.dataset.fixEquipment, button.dataset.fixField)));
    root.querySelectorAll('[data-retry-action]').forEach(button => button.onclick = guardWorking(button,() => {
      const act = button.dataset.retryAction;
      if (act === 'submit' || act === 'save') {
        saveDraft(act).catch(failed);
      }
    }));
    root.querySelectorAll('[data-issue-result]').forEach(input => input.oninput = guardWorking(input,() => { if (working?.issues?.[Number(input.dataset.issueResult)]) working.issues[Number(input.dataset.issueResult)].resolution = input.value; }));
    root.querySelectorAll('[data-issue-result]').forEach(input=>input.onchange=guardWorking(input,async()=>{await writeShared('apply');}));
    root.querySelectorAll('[data-issue-resolve]').forEach(button => button.onclick = guardWorking(button,async () => {
      const issue = working?.issues?.[Number(button.dataset.issueResolve)];
      if (!issue) return;
      if (issue.status !== 'resolved' && !String(issue.resolution || '').trim()) { alert(t('請先填寫處理結果與依據', 'Hãy nhập kết quả và căn cứ trước')); return; }
      issue.status = issue.status === 'resolved' ? 'pending' : 'resolved';
      if(await writeShared('apply'))render();
    }));

    // Form handlers
    const item = working?.equipment.find(record => record.id === editingEquipmentId);
    const closeForm = () => { if(formPendingPhoto&&pendingPhotos.get(item?.id)!==formPendingPhoto)URL.revokeObjectURL(formPendingPhoto.url);formPendingPhoto=null;equipmentEditRequest++; editingEquipmentId = ''; formSnapshot = null; render(); };
    const tryCloseForm = () => {
      if (formSnapshot && isFormDirty()) {
        if (!confirm(t('尚有未套用的修改，確定關閉？', 'Có thay đổi chưa áp dụng, bạn có chắc muốn đóng?'))) return;
        if (item && formSnapshot) Object.assign(item, formSnapshot);
      }
      if(item&&formSnapshot){Object.assign(item,formSnapshot);const pending=pendingPhotos.get(item.id);if(pending&&pending!==formPendingPhoto)URL.revokeObjectURL(pending.url);if(formPendingPhoto)pendingPhotos.set(item.id,formPendingPhoto);else pendingPhotos.delete(item.id);}
      closeForm();
    };

    root.querySelector('#routine-close')?.addEventListener('click', guardWorking(root.querySelector('#routine-close'),tryCloseForm));
    root.querySelector('#routine-form-cancel')?.addEventListener('click', guardWorking(root.querySelector('#routine-form-cancel'),tryCloseForm));
    root.querySelector('#routine-backdrop')?.addEventListener('click', guardWorking(root.querySelector('#routine-backdrop'),event => {
      if (event.target?.id === 'routine-backdrop') tryCloseForm();
    }));
    root.querySelector('#routine-language-toggle')?.addEventListener('click', guardWorking(root.querySelector('#routine-language-toggle'),() => document.querySelector('.top-actions .language-switch')?.click()));

    if (item) {
      const bindCalibrationInputs = () => {
        const calContainer = root.querySelector('#routine-edit-calibration-container');
        if (!calContainer) return;
        const cycleSelect = calContainer.querySelector('[data-select="calibrationCycle"]');
        if (cycleSelect) {
          cycleSelect.onchange = guardWorking(cycleSelect,() => {
            item.calibrationCycle = cycleSelect.value;
            calContainer.innerHTML = renderEditCalibrationFields(item, editable());
            bindCalibrationInputs();
          });
        }
        calContainer.querySelectorAll('[data-field]').forEach(input => {
          input.oninput = guardWorking(input,() => { item[input.dataset.field] = input.value; updateEquipmentLocalStatus(); });
        });
      };
      bindCalibrationInputs();

      root.querySelectorAll('#routine-editor [data-field]').forEach(input => {
        input.oninput = guardWorking(input,() => {
          item[input.dataset.field] = input.type === 'number' ? Number(input.value) : input.value;
          updateEquipmentLocalStatus();
        });
      });

      root.querySelectorAll('#routine-editor [data-select]').forEach(select => {
        select.onchange = guardWorking(select,() => {
          if (select.dataset.select === 'calibrationMethod') {
            item.calibrationMethod = select.value;
            const calContainer = root.querySelector('#routine-edit-calibration-container');
            if (calContainer) {
              calContainer.innerHTML = renderEditCalibrationFields(item, editable());
              bindCalibrationInputs();
            }
          } else {
            item[select.dataset.select] = ['enabled','confirmed'].includes(select.dataset.select) ? select.value === 'true' : select.value;
          }
        });
      });

      const classification = root.querySelector('#routine-classification-choices');
      if (classification) classification.addEventListener('change', guardWorking(classification, () => {
        const category = classification.querySelector('#routine-edit-category');
        const sub = classification.querySelector('#routine-edit-subcategory');
        const group = classification.querySelector('#routine-edit-group');
        const hierarchy = equipmentClassification(working), destinations = hierarchy.destinations;
        const subcategories = hierarchy.subcategories.filter(row => row.categoryId === category.value);
        const subId = subcategories.some(row => row.id === sub.value) ? sub.value : '';
        const groups = destinations.filter(d => d.category.id === category.value && d.sub.id === subId).map(d => d.group);
        const groupId = groups.some(row => row.id === group.value) ? group.value : '';
        sub.innerHTML = classificationOptions(subcategories,subId,t('請選擇子類別','Chọn phân nhóm'),row=>row.name || row.id);
        group.innerHTML = classificationOptions(groups,groupId,t('請選擇規格群組','Chọn nhóm quy cách'),destinationLabel);
        sub.disabled = !category.value;
        group.disabled = !subId;
        const choice = {categoryId:category.value,subcategoryId:subId,groupId};
        formDestinations.set(formSnapshot,choice);
        const destination = chosenDestination(item,destinations);
        const preview = root.querySelector('#routine-destination-preview');
        preview.hidden = !destination || destination.group.id === formSnapshot.groupId;
        preview.querySelector('b').textContent = destination?.label || '';
        root.querySelector('#routine-hierarchy-hint').hidden = !!destination;
        root.querySelector('#routine-form-apply').disabled = !destination;
      }));

      root.querySelector('#routine-photo-input')?.addEventListener('change', guardWorking(root.querySelector('#routine-photo-input'),event => {
        const file = event.target.files?.[0]; if (!file) return;
        if (file.size > 5_000_000) { alert(t('照片限 5 MB', 'Ảnh giới hạn 5 MB')); return; }
        const prior = pendingPhotos.get(item.id); if (prior&&prior!==formPendingPhoto) URL.revokeObjectURL(prior.url);
        pendingPhotos.set(item.id, { file, url: URL.createObjectURL(file) });
        item.photoHidden = false;
        message = t('照片僅在本頁預覽；按套用後，按存取草稿才上傳並保存照片參照。', 'Ảnh chỉ ở trang này; nhấn Áp dụng rồi lưu bản nháp để tải ảnh và lưu tham chiếu.'); render();
      }));
      root.querySelector('#routine-photo-remove')?.addEventListener('click', guardWorking(root.querySelector('#routine-photo-remove'),() => {
        if (!confirm(t('確定從目前草稿移除照片？舊版本照片不會刪除。', 'Xóa ảnh khỏi bản nháp hiện tại? Ảnh phiên bản cũ vẫn được giữ.'))) return;
        const pending = pendingPhotos.get(item.id); if (pending&&pending!==formPendingPhoto) URL.revokeObjectURL(pending.url);
        pendingPhotos.delete(item.id); item.photoId = ''; item.photoHidden = true;
        message = t('照片已從本頁草稿移除，尚未保存。', 'Ảnh đã xóa khỏi bản nháp trên trang, chưa lưu.'); render();
      }));

      root.querySelector('#routine-form-apply')?.addEventListener('click', guardWorking(root.querySelector('#routine-form-apply'),async () => {
        const changed = identityFields.some(field => item[field] !== formSnapshot?.[field]);
        if (changed) {
          const equalPair = other => identityFields.every(field=>identityLabel(other[field])===identityLabel(item[field]));
          const error = item.assetCode!==formSnapshot.assetCode && !/^[A-Z0-9-]{2,40}$/i.test(item.assetCode) ? 'EQUIPMENT_ASSET_INVALID' :
            !identityLabel(item.pieceMark) ? 'EQUIPMENT_PIECE_REQUIRED' :
            !equalPair(formSnapshot) && working.equipment.some(other=>other.id!==item.id && equalPair(other)) ? 'EQUIPMENT_PAIR_DUPLICATE' : '';
          if (error) {
            const alert = root.querySelector('#routine-identity-error');
            alert.hidden=false;alert.textContent=displayDraftError(error);
            root.querySelector(error==='EQUIPMENT_ASSET_INVALID'?'[data-field="assetCode"]':'[data-field="pieceMark"]')?.focus();
            return;
          }
        }
        const nameInput = root.querySelector('#routine-editor [data-field="name"]');
        if (nameInput) item.name = nameInput.value.trim();
        const destination = chosenDestination(item, equipmentClassification(working).destinations);
        if (!destination) {
          root.querySelector('#routine-hierarchy-hint').hidden = false;
          root.querySelector('#routine-edit-category').focus();
          return;
        }
        const {group,category,sub} = destination;
        if (formDestinations.has(formSnapshot) && group.id !== item.groupId) {
          Object.assign(item, {groupId:group.id,categoryId:category.id,subcategoryId:sub.id,
            categoryCode:category.code,category:category.name,subcategory:sub.name});
        }
        const unitSelect = root.querySelector('#routine-editor [data-select="unit"]');
        if (unitSelect) item.unit = unitSelect.value;
        const ownerInput = root.querySelector('#routine-editor [data-field="owner"]');
        if (ownerInput) item.owner = ownerInput.value.trim();
        const enabledSelect = root.querySelector('#routine-editor [data-select="enabled"]');
        if (enabledSelect) item.enabled = enabledSelect.value === 'true';
        const confirmedSelect = root.querySelector('#routine-editor [data-select="confirmed"]');
        if (confirmedSelect) item.confirmed = confirmedSelect.value === 'true';
        const methodSelect = root.querySelector('#routine-editor [data-select="calibrationMethod"]');
        if (methodSelect) item.calibrationMethod = methodSelect.value;
        const cycleSelect = root.querySelector('#routine-editor [data-select="calibrationCycle"]');
        if (cycleSelect) item.calibrationCycle = cycleSelect.value;
        const customCycleInput = root.querySelector('#routine-editor [data-field="customCycle"]');
        if (customCycleInput) item.customCycle = customCycleInput.value.trim();
        const calAtInput = root.querySelector('#routine-editor [data-field="calibratedAt"]');
        if (calAtInput && !calAtInput.disabled) item.calibratedAt = calAtInput.value;
        const expAtInput = root.querySelector('#routine-editor [data-field="expiresAt"]');
        if (expAtInput && !expAtInput.disabled) item.expiresAt = expAtInput.value;
        const intakeInput = root.querySelector('#routine-editor [data-field="intakeDate"]');
        if (intakeInput) item.intakeDate = intakeInput.value;
        const specInput = root.querySelector('#routine-editor [data-field="spec"]');
        if (specInput) item.spec = specInput.value;
        const notesInput = root.querySelector('#routine-editor [data-field="notes"]');
        if (notesInput) item.notes = notesInput.value;

        syncHierarchy();

        if (!problemSnapshot && submitProblems && submitProblems.length > 0) {
          const remainingProblemsForThisItem = validateEquipmentItem(item);
          submitProblems = submitProblems.filter(p => p.id !== item.id).concat(remainingProblemsForThisItem);
          if (submitProblems.length === 0) {
            openErrors = false;
          }
        }

        const sentForm=JSON.stringify(item),sentFormSnapshot=formSnapshot,sentPhoto=pendingPhotos.get(item.id),sentPhotoFile=sentPhoto?.file,sentPhotoURL=sentPhoto?.url;
        if(!await writeShared('apply'))return;
        if(editingEquipmentId!==item.id||formSnapshot!==sentFormSnapshot||JSON.stringify(item)!==sentForm||pendingPhotos.get(item.id)&&(pendingPhotos.get(item.id)!==sentPhoto||sentPhoto?.file!==sentPhotoFile||sentPhoto?.url!==sentPhotoURL))return;
        if (sentFormSnapshot.groupId !== item.groupId) selectEquipmentInList(item);
        closeForm();
      }));

      root.querySelector('#routine-delete')?.addEventListener('click', guardWorking(root.querySelector('#routine-delete'),() => {
        if (item) deleteEquipment(item.id).catch(failed);
      }));
    }

    if (addingEquipment && newEquipmentForm) {
      bindAddEquipmentInput();
      const syncAddFormFromDOM = () => {
        if (!newEquipmentForm) return;
        const code = root.querySelector('#routine-add-asset-code')?.value;
        if (code !== undefined) newEquipmentForm.assetCode = code.trim().toUpperCase();
        const mark = root.querySelector('#routine-add-piece-mark-input')?.value;
        if (mark !== undefined) newEquipmentForm.pieceMark = mark;
        const nm = root.querySelector('#routine-add-name')?.value;
        if (nm !== undefined) newEquipmentForm.name = nm.trim();
        const un = root.querySelector('#routine-add-unit')?.value;
        if (un !== undefined) newEquipmentForm.unit = un;
        const ow = root.querySelector('#routine-add-owner')?.value;
        if (ow !== undefined) newEquipmentForm.owner = ow.trim();
        const en = root.querySelector('#routine-add-enabled')?.value;
        if (en !== undefined) newEquipmentForm.enabled = en === 'true';
        const cf = root.querySelector('#routine-add-confirmed')?.value;
        if (cf !== undefined) newEquipmentForm.confirmed = cf === 'true';
        const cm = root.querySelector('#routine-add-calibration-method')?.value;
        if (cm !== undefined) newEquipmentForm.calibrationMethod = cm;
        const cc = root.querySelector('#routine-add-calibration-cycle')?.value;
        if (cc !== undefined) newEquipmentForm.calibrationCycle = cc;
        const ccy = root.querySelector('#routine-add-custom-cycle')?.value;
        if (ccy !== undefined) newEquipmentForm.customCycle = ccy.trim();
        const ca = root.querySelector('#routine-add-calibrated-at')?.value;
        if (ca !== undefined) newEquipmentForm.calibratedAt = ca;
        const ea = root.querySelector('#routine-add-expires-at')?.value;
        if (ea !== undefined) newEquipmentForm.expiresAt = ea;
        const idt = root.querySelector('#routine-add-intake-date')?.value;
        if (idt !== undefined) newEquipmentForm.intakeDate = idt;
        const sp = root.querySelector('#routine-add-spec')?.value;
        if (sp !== undefined) newEquipmentForm.spec = sp.trim();
        const nt = root.querySelector('#routine-add-notes')?.value;
        if (nt !== undefined) newEquipmentForm.notes = nt.trim();
      };

      const bindAddCalibrationInputs = () => {
        const calContainer = root.querySelector('#routine-add-calibration-container');
        if (!calContainer) return;
        const cycleSelect = calContainer.querySelector('#routine-add-calibration-cycle');
        if (cycleSelect) {
          cycleSelect.onchange = guardWorking(cycleSelect,() => {
            newEquipmentForm.calibrationCycle = cycleSelect.value;
            calContainer.innerHTML = renderAddCalibrationFields(newEquipmentForm);
            bindAddCalibrationInputs();
          });
        }
        calContainer.querySelectorAll('input').forEach(input => {
          input.oninput = guardWorking(input,() => {
            if (input.id === 'routine-add-custom-cycle') newEquipmentForm.customCycle = input.value;
            if (input.id === 'routine-add-calibrated-at') newEquipmentForm.calibratedAt = input.value;
            if (input.id === 'routine-add-expires-at') newEquipmentForm.expiresAt = input.value;
          });
        });
      };
      bindAddCalibrationInputs();

      const assetCodeInput = root.querySelector('#routine-add-asset-code');
      const pieceMarkInput = root.querySelector('#routine-add-piece-mark-input');

      assetCodeInput?.addEventListener('input', guardWorking(assetCodeInput,() => {
        const val = assetCodeInput.value.trim().toUpperCase();
        newEquipmentForm.assetCode = val;

      }));

      pieceMarkInput?.addEventListener('input', guardWorking(pieceMarkInput,() => { newEquipmentForm.pieceMark = pieceMarkInput.value; }));
      root.querySelector('#routine-add-name')?.addEventListener('input', guardWorking(root.querySelector('#routine-add-name'),e => {
        newEquipmentForm.name = e.target.value;
      }));

      root.querySelector('#routine-add-photo-input')?.addEventListener('change', guardWorking(root.querySelector('#routine-add-photo-input'),event => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 5_000_000) { alert(t('照片限 5 MB', 'Ảnh giới hạn 5 MB')); return; }
        syncAddFormFromDOM();
        if (newEquipmentForm.pendingPhoto) URL.revokeObjectURL(newEquipmentForm.pendingPhoto.url);
        newEquipmentForm.pendingPhoto = { file, url: URL.createObjectURL(file) };
        render();
      }));

      root.querySelector('#routine-add-photo-remove')?.addEventListener('click', guardWorking(root.querySelector('#routine-add-photo-remove'),() => {
        syncAddFormFromDOM();
        if (newEquipmentForm.pendingPhoto) URL.revokeObjectURL(newEquipmentForm.pendingPhoto.url);
        newEquipmentForm.pendingPhoto = null;
        render();
      }));

      root.querySelector('#routine-add-calibration-method')?.addEventListener('change', guardWorking(root.querySelector('#routine-add-calibration-method'),event => {
        syncAddFormFromDOM();
        newEquipmentForm.calibrationMethod = event.target.value;
        const calContainer = root.querySelector('#routine-add-calibration-container');
        if (calContainer) {
          calContainer.innerHTML = renderAddCalibrationFields(newEquipmentForm);
          bindAddCalibrationInputs();
        }
      }));

      const cancelAdd = () => {
        syncAddFormFromDOM();
        const hasInput = (newEquipmentForm.assetCode || '').trim() ||
                         (newEquipmentForm.name || '').trim();
        if (hasInput && !confirm(t('確定取消新增檢具？已填寫的資料將不會保留。', 'Hủy thêm thiết bị? Dữ liệu đã nhập sẽ không được giữ lại.'))) return;
        if (newEquipmentForm?.pendingPhoto) URL.revokeObjectURL(newEquipmentForm.pendingPhoto.url);
        addingEquipment = false;
        newEquipmentForm = null;
        render();
      };

      root.querySelector('#routine-add-close')?.addEventListener('click', guardWorking(root.querySelector('#routine-add-close'),cancelAdd));
      root.querySelector('#routine-add-cancel')?.addEventListener('click', guardWorking(root.querySelector('#routine-add-cancel'),cancelAdd));
      root.querySelector('#routine-add-backdrop')?.addEventListener('click', guardWorking(root.querySelector('#routine-add-backdrop'),event => {
        if (event.target?.id === 'routine-add-backdrop') cancelAdd();
      }));

      root.querySelector('#routine-add-submit')?.addEventListener('click', guardWorking(root.querySelector('#routine-add-submit'),confirmAddEquipment));
    }
  }

  function html() { return `<section class="routine-page" data-i18n-skip="true"><p>${t('正在載入檢具與測試設備…', 'Đang tải dưỡng kiểm và thiết bị đo…')}</p></section>`; }
  async function reconcilePendingReplacements() {
    // Compatibility hook for old approval callers: refresh references only.
    // Historical waiting records never authorize automatic V3 writes.
    invalidateEquipmentReferences();
  }
  async function mount(element) {
    historyDisplayEpoch++;approvedHistoryView?.retire();approvedHistoryView=null;
    if(identity()?.id&&hasFqcTransfer())targetFqcClient();
    if(identity()?.id&&hasIqcTransfer())targetIqcClient();
    equipmentEditRequest++;navigationError=null;
    const delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>host===element&&element.isConnected&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
    const preserve = controlActor===identity()?.id&&(isDirty() || pendingPhotos.size > 0 || addingEquipment && newEquipmentForm);
    host = element;
    if (preserve) { message = t('本頁仍有未儲存草稿，已保留於工作區；請儲存或送審。', 'Trang này còn bản nháp chưa lưu; đã giữ trong vùng làm việc.'); render(); return; }
    message = ''; render();
    try {
      await read();if(!owns())return;
      const linkedId=new URL(location.href).searchParams.get('equipmentId');
      if (linkedId) {
        const effective=active(), item=effective?.equipment.find(row=>row.id===linkedId);
        if (item) {
          selectedVersionId=effective.id;selectedEquipmentId=item.id;selectedGroup=item.groupId;
          const group=structure(effective).groups.find(row=>row.id===item.groupId);
          selectedCategory=group?.categoryId || '';selectedSubcategory=group?.subcategoryId || '';
          equipmentPage=1;
          viewDialog={kind:'equipment',data:item};
          viewDialog.references=newViewReferences(item.id);
        } else message=t('此設備已不在目前生效版本，請核對歷史資料。','Thiết bị không còn trong phiên bản hiệu lực; kiểm tra lịch sử.');
      }
      render();if(!linkedId)void reconcilePendingReplacements();
    } catch (error) {if(!owns())return;navigationError=error; message = error.message; render(); }
  }
  function pendingCount() { return control?.versions.filter(version => version.status === 'pending').length || 0; }
  function reviewHTML() { return `<section class="routine-review routine-card" data-i18n-skip="true"><h3>${t('檢具與測試設備 · 待確認', 'Dưỡng kiểm và thiết bị đo · Chờ duyệt')}</h3><div class="routine-review-body">${t('正在載入…', 'Đang tải…')}</div></section>`; }
  async function bindReview(element) {
    reviewHost = element?.querySelector('.routine-review'); if (!reviewHost) return;
    const target=reviewHost,delivery=window.ProcessSync?.captureDelivery?.(),owns=()=>reviewHost===target&&target.isConnected&&(!delivery||window.ProcessSync.isCurrentDelivery(delivery));
    try { await read();if(owns())reviewRender(); } catch (error) {if(owns()){navigationError=error; target.querySelector('.routine-review-body').textContent = displayDraftError(error);}}
  }

  function reviewRender() {
    if (!reviewHost?.isConnected) return;
    reviewHost.querySelector('h3').textContent = t('檢具與測試設備 · 待確認', 'Dưỡng kiểm và thiết bị đo · Chờ duyệt');
    const pending = control?.versions.filter(version => version.status === 'pending') || [];
    const base = active();
    const body = reviewHost.querySelector('.routine-review-body');
    body.innerHTML = pending.length ? pending.map(version => {
      // Compute diff vs baseline
      const baseMap = new Map((base?.equipment || []).map(e => [e.id, e]));
      const added = version.equipment.filter(e => !baseMap.has(e.id));
      const disabled = version.equipment.filter(e => baseMap.has(e.id) && baseMap.get(e.id).enabled && !e.enabled);
      const modified = version.equipment.filter(e => {
        const old = baseMap.get(e.id);
        if (!old) return false;
        return ['assetCode','pieceMark','categoryId','subcategoryId','groupId','calibrationMethod','calibrationCycle','calibratedAt','expiresAt','unit','spec','name','nameVi','notes','photoId','photoHidden','confirmed','enabled'].some(k => old[k] !== e[k]);
      });
      const snapshotDiff = (title, before, after) => {
        const beforeMap = new Map((before || []).map(item => [item.id, item]));
        const changes = (after || []).filter(item => JSON.stringify(item) !== JSON.stringify(beforeMap.get(item.id)));
        return `<details><summary>${title} · ${changes.length}</summary>${changes.map(item => `<p data-i18n-skip="true">${h(item.id)} · ${h(item.name || item.nameVi || item.nameZh || '')} ${beforeMap.has(item.id) ? '(修改)' : '(新增)'}</p>`).join('') || `<p>${t('無變更', 'Không thay đổi')}</p>`}</details>`;
      };
      const fields = { assetCode:t('固定資產編號','Mã TSCĐ'), pieceMark:t('分件號','Ký hiệu thiết bị'), categoryId: t('類別', 'Nhóm'), subcategoryId: t('子類別', 'Phân nhóm'), groupId: t('規格群組', 'Nhóm quy cách'),
        name: t('名稱', 'Tên'), spec: t('規格', 'Quy cách'), photoId: t('照片', 'Ảnh'), photoHidden: t('照片移除狀態', 'Trạng thái ảnh'), calibrationMethod: t('校正方式', 'Phương thức hiệu chuẩn'),
        calibrationCycle: t('校正週期', 'Chu kỳ hiệu chuẩn'), calibratedAt: t('最近校正', 'Ngày hiệu chuẩn'), expiresAt: t('期限', 'Hạn'),
        confirmed: t('資料核對', 'Đối soát'), enabled: t('啟用', 'Kích hoạt') };
      const fieldValue = (key, value, sourceVersion) => {
        const collection = key === 'categoryId' ? sourceVersion?.categories : key === 'subcategoryId' ? sourceVersion?.subcategories : key === 'groupId' ? sourceVersion?.groups : null;
        return (collection?.find(record => record.id === value)?.name || value) ?? '—';
      };
      const itemDiff = [...added, ...modified].map(item => {
        const before = baseMap.get(item.id);
        const changedFields = before ? Object.keys(fields).filter(key => String(before[key] ?? '') !== String(item[key] ?? '')) : Object.keys(fields);
        return `<details><summary data-i18n-skip="true">${h(item.assetCode)}／${h(item.pieceMark)} · ${h(displayName(item))}</summary>
          ${changedFields.map(key => `<p><b>${fields[key]}</b>：<span data-i18n-skip="true">${h(fieldValue(key, before?.[key], base))} → ${h(fieldValue(key, item[key], version))}</span></p>`).join('')}
          ${photo(item) ? `<img decoding="async" src="${h(photo(item))}" loading="lazy" alt="${t('送審照片', 'Ảnh gửi duyệt')}" class="routine-review-photo">` : ''}
        </details>`;
      }).join('');

      return `<article>
        <h4>${t('檢具與測試設備', 'Dưỡng kiểm và Thiết bị')} · V${version.number}</h4>
        <p>${t('修改者', 'Người sửa')} ${h(version.creatorName)} · ${t('送審者', 'Người gửi')} ${h(version.submittedBy)} · ${h(date(version.submittedAt))}</p>
        <div class="routine-review-diff">
          <b>${t('變更比對清單（Diff）：', 'So sánh thay đổi (Diff):')}</b><br>
          ${!base ? `<span class="routine-diff-badge routine-diff-add">${t('首次匯入全量新增', 'Nhập nguồn mới toàn bộ')} (${version.equipment.length} ${t('筆', 'mục')})</span>` : `
            <span class="routine-diff-badge routine-diff-add">${t('新增設備', 'Thêm mới')} ${added.length} ${t('筆', 'mục')}</span>
            <span class="routine-diff-badge routine-diff-edit">${t('修改設備', 'Đã sửa')} ${modified.length} ${t('筆', 'mục')}</span>
            <span class="routine-diff-badge routine-diff-disable">${t('停用設備', 'Vô hiệu hóa')} ${disabled.length} ${t('筆', 'mục')}</span>
          `}
        </div>
        ${snapshotDiff(t('類別', 'Nhóm'), base?.categories, version.categories)}
        ${snapshotDiff(t('子類別', 'Phân nhóm'), base?.subcategories, version.subcategories)}
        ${snapshotDiff(t('規格群組', 'Nhóm quy cách'), base?.groups, version.groups)}
        <details><summary>${t('來源疑點處理差異', 'Thay đổi xử lý vấn đề nguồn')}</summary>${(version.issues || []).filter((issue, index) => JSON.stringify(issue) !== JSON.stringify((base?.issues || control.issues)[index])).map(issue => `<p data-i18n-skip="true">${h(issue.assetCode)}／${h(issue.pieceMark)} · ${h(issue.type)} · ${h(issue.status)} · ${h(issue.resolution || '')}</p>`).join('') || `<p>${t('無變更', 'Không thay đổi')}</p>`}</details>
        <details><summary>${t('設備與照片／校正／核對差異', 'Thay đổi thiết bị, ảnh, hiệu chuẩn, đối soát')} · ${added.length + modified.length}</summary>${itemDiff || `<p>${t('無變更', 'Không thay đổi')}</p>`}</details>
        <p>${t('設備總計', 'Tổng thiết bị')} ${version.equipment.length} ${t('筆', 'mục')}；${t('來源待確認', 'Chờ đối soát')} ${control.issues.length} ${t('筆。', 'mục.')}</p>
        <p>${t('歷程：', 'Nhật ký: ')}${version.history.map(event => `${h(actionName(event.action))} ${h(event.actorName)} ${h(date(event.at))} ${h(event.comment || '')}`).join('／')}</p>
        ${permitted('approval.approve') || permitted('approval.reject') ? `
          <label>${t('審核意見（選填）', 'Ý kiến duyệt (không bắt buộc)')}<textarea data-routine-review-comment="${h(version.id)}"></textarea></label>
          <div class="routine-review-actions">
            ${permitted('approval.reject') ? `<button class="button ghost" data-routine-review="reject" data-version="${h(version.id)}">${t('發回', 'Trả lại')}</button>` : ''}
            ${permitted('approval.approve') ? `<button class="button signal" data-routine-review="approve" data-version="${h(version.id)}">${t('確認', 'Duyệt')}</button>` : ''}
          </div>` : ''}
        ${permitted('approval.withdraw')?`<button class="button ghost" data-routine-review="withdraw" data-version="${h(version.id)}">${t('撤回送審','Rút hồ sơ')}</button>`:''}
      </article>`;
    }).join('') : `<p>${t('檢具與測試設備目前沒有待確認案件', 'Hiện không có hồ sơ thiết bị nào chờ duyệt')}</p>`;
    const latestApproved = control?.versions.filter(version=>['approved','superseded'].includes(version.status)).slice(-3).reverse() || [];
    body.insertAdjacentHTML('beforeend', latestApproved.map(version=>`<article><h4>${t('檢具與測試設備', 'Dưỡng kiểm và thiết bị')} · V${version.number} · ${t('已確認', 'Đã duyệt')}</h4><p>${t('確認者', 'Người duyệt')} ${h(version.reviewedBy || '—')} · ${h(date(version.reviewedAt))}${version.reviewComment?`<br>${t('審核意見', 'Ý kiến')}: ${h(version.reviewComment)}`:''}</p></article>`).join(''));

    body.querySelectorAll('[data-routine-review]').forEach(button => button.onclick = async () => {
      const version = control.versions.find(item => item.id === button.dataset.version);
      const comment = button.dataset.routineReview === 'approve' ? body.querySelector(`[data-routine-review-comment="${version.id}"]`)?.value?.trim() || '' : '';
      const result = await write(button.dataset.routineReview, { versionId: version.id, versionRevision: version.revision, comment });
      if (result) reviewRender();
    });
  }

  window.addEventListener('process-language-change', () => {
    if (routineTabIsActive()) render();
    if (reviewHost?.isConnected) reviewRender();
  });
  async function refreshOpenEquipmentReferences() {
    invalidateEquipmentReferences();
    const openIds = new Set([
      editingEquipmentId,
      viewDialog?.kind === 'equipment' && !viewDialog.references ? viewDialog.data?.id : ''
    ].filter(Boolean));
    await Promise.all([...openIds].map(id => loadEquipmentReferences(id, { renderAfter: false })));
    if (routineTabIsActive()) for (const id of openIds) updateEquipmentReferenceSections(id);
  }
  window.addEventListener('fqc-equipment-references-updated', refreshOpenEquipmentReferences);
  window.addEventListener('quality-equipment-references-updated', refreshOpenEquipmentReferences);

  // Legacy unidentified Begin markers cannot be settled by looking at today's draft.
  // Navigation may discard local input while retaining the exact legacy barrier.
  function equipmentDeparture(config){
    const base=window.VersionDraftUI.createDeparture(config);let held=null;
    const legacy=()=>{try{const markers=[beginRecoveryKey(identity()?.id),fqcTransferKey(identity()?.id),iqcTransferKey(identity()?.id)].map(key=>[key,sessionStorage.getItem(key)]).filter(([,raw])=>raw!==null);return markers.length&&![sharedClient,fqcTransferClient,iqcTransferClient].some(client=>client?.hasUnknown()||client?.hasSyncFailures())&&inputOwnerCurrent()&&!busy&&!transferBusy()?JSON.stringify(markers):null;}catch{return null;}};
    const valid=record=>record&&record.raw===legacy()&&record.actor===identity()&&record.epoch===window.ProcessSync?.identityGeneration?.();
    return {...base,autoAbandon:true,allowUnload:()=>!(busy&&!equipmentSaveComparison)&&!transferBusy(),
      inspect(){const status=base.inspect(),raw=legacy();if(raw===null)return status;return {state:valid(held)?'departing':'unknown',departureId:held?.id,canAbandon:!held,canSave:false,canDiscard:false,reason:beginRecoveryMessage()};},
      async abandon(){const raw=legacy();if(raw===null)return base.abandon();const record={raw,actor:identity(),epoch:window.ProcessSync?.identityGeneration?.(),id:{}};config.discard();if(!valid(record))throw Error('DEPARTURE_CONTEXT_CHANGED');held=record;return {departureId:record.id,release(){if(held===record)held=null;}};},
      closeClean(){if(held){if(!valid(held))throw Error('DEPARTURE_CONTEXT_CHANGED');return;}return base.closeClean();},
      otherDraftsPending(){return legacy()!==null?sharedClient?.otherDeparturePending([sharedClient])===true:base.otherDraftsPending();}
    };
  }
  let navigationError=null;
  let moduleDeparture;
  window.RoutineEquipmentUI = {
    navigation:{get departure(){return moduleDeparture ||= equipmentDeparture({
    root:()=>host,flow:()=>control?.workflow,sharedOwned:()=>false,sharedDirty:()=>false,
    context:()=>[controlActor,selectedVersionId,control?.workflow?.generation,sharedClient?.permission('save'),sharedClient?.permission('edit')],
    current:()=>controlActor===identity()?.id&&inputOwnerCurrent(),busy:()=>busy&&!equipmentSaveComparison||transferBusy()||!!equipmentReadAttempt,
    unknown:()=>sharedClient?.hasUnknown()||fqcTransferClient?.hasUnknown()||iqcTransferClient?.hasUnknown()||hasBeginRecovery(),failed:()=>sharedClient?.hasSyncFailures()||fqcTransferClient?.hasSyncFailures()||iqcTransferClient?.hasSyncFailures(),
    unknownTransports:()=>[sharedClient,fqcTransferClient,iqcTransferClient],unknownReady:()=>{try{return !readBeginRecovery();}catch{return false;}},discardUnknown(){this.discard();},
    local:()=>!!editingEquipmentId||isDirty()||isFormDirty()||!!pendingPhotos.size||!!nodeDialog||!!transferDialog||addingEquipment,
    canSave:()=>!!canDraftAction('save'),canDiscard:()=>editable()&&sharedClient?.permission('edit')===true,
    save:owner=>saveDraft('save',owner),dialogs:()=>[...host?.querySelectorAll('.routine-modal-backdrop,.routine-dialog-backdrop')||[]],
    discard(){retireEquipmentSaveComparison();equipmentEditRequest++;const urls=new Set([...pendingPhotos.values()].map(pending=>pending.url));for(const photo of [newEquipmentForm?.pendingPhoto,nodeDialog?.pendingPhoto])if(photo?.url)urls.add(photo.url);for(const url of urls)URL.revokeObjectURL(url);pendingPhotos.clear();localBeginReceipt=null;pendingSaveBatch=null;formPendingPhoto=null;editingEquipmentId='';formSnapshot=null;nodeDialog=null;transferDialog=null;addingEquipment=false;newEquipmentForm=null;newEquipmentOwner=null;working=open()?.status==='draft'?snapshotOf(open()):null;syncBase=working&&clone(working);syncGeneration=control.workflow?.generation;render();},
  });},requiresSave:()=>false,saveForDeparture:()=>saveDraft('save'),canLeave:()=>!(busy&&!equipmentSaveComparison)&&!transferBusy(),error:()=>navigationError,reset(){referenceAction?.controller.abort();referenceAction=null;historyDisplayEpoch++;approvedHistoryView?.retire();approvedHistoryView=null;retireEquipmentSaveComparison();equipmentSaveChoice?.();viewDialog?.references?.closeDetail?.();equipmentEditRequest++;writeShared.attempt=null;busy=false;equipmentReadAttempt=null;host=null;reviewHost=null;control=null;revision=null;working=null;controlActor='';readUnavailable=false;selectedVersionId='';editingEquipmentId='';selectedEquipmentId='';syncBase=null;syncGeneration=null;localBeginReceipt=null;pendingSaveBatch=null;inputOwner=null;viewDialog=null;formSnapshot=null;problemSnapshot=null;invalidateEquipmentReferences();equipmentRefReads.clear();navigationError=null;}},
    html,
    mount,
    reviewHTML,
    bindReview,
    pendingCount,
    async reconcilePendingReplacements() {
      if (isDirty() || pendingPhotos.size) return;
      try { await read(); await reconcilePendingReplacements(); }
      catch (error) { console.error('待處理替換暫未套用；紀錄仍保留', error); }
    },
    async getEquipmentReferences(eqId, { refresh = false } = {}) {
      if (!refresh && equipmentRefCache.has(eqId)) return equipmentRefCache.get(eqId);
      if (refresh) invalidateEquipmentReferences([eqId]);
      return loadEquipmentReferences(eqId, { renderAfter: false });
    },
    referencesHTML(eqId, refs, mode = 'view') {
      if (refs) equipmentRefCache.set(eqId, refs);
      return equipmentReferencesSectionHTML(eqId, mode);
    },
    bindReferenceActions
  };
})();

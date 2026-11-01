/* Assignment is part of the existing operation draft. This module never writes a second store. */
(() => {
  const h=value=>escapeHtml(String(value??''));
  const text=(vi,zh)=>document.documentElement.lang==='vi'?vi:zh;
  const label=(vi,zh)=>`<span>${h(text(vi,zh))}</span>`;
  const localized=value=>{const parts=String(value).split(' / ');return parts.length===2?text(parts[0],parts[1]):value;};
  const statusText=status=>({selected:text('Đã chọn ở bước này','本流程已選'),occupied:text('Đang dùng ở bước khác','其他流程使用中'),available:text('Chưa phân công','尚未分配')})[status];
  const statusOf=(c,op,owners)=>owners.get(key(c))&&owners.get(key(c)).id!==op.id?'occupied':(op.ipqcAssignments||[]).some(a=>key(a)===key(c))?'selected':'available';
  const badge=status=>`<span class="process-ipqc-badge ${status}"><i aria-hidden="true">${status==='selected'?'✓':status==='occupied'?'↗':'○'}</i>${h(statusText(status))}</span>`;
  function updateOverview(panel,choices,op,owners){
    for(const status of ['selected','occupied','available']){const count=choices.filter(c=>statusOf(c,op,owners)===status).length;panel.querySelector(`[data-ipqc-count="${status}"]`).textContent=count;}
    for(const group of panel.querySelectorAll('.process-ipqc-group')){const inputs=[...group.querySelectorAll('[data-ipqc-choice]')],used=inputs.filter(i=>i.checked||i.disabled&&i.closest('article').dataset.status==='occupied').length;group.querySelector('[data-ipqc-progress]').textContent=text(`${used}/${inputs.length} đã phân công`,`${used}/${inputs.length} 已分配`);group.dataset.complete=String(used===inputs.length);}
  }
  const key=a=>JSON.stringify([a.source,a.scope,a.itemId]);
  const choiceRequests=new WeakMap(),referenceViews=new WeakMap();
  const currentIdentity=()=>window.ProcessSync?.identity||null;
  const messages={SOURCE_NOT_APPROVED:['Chưa có nguồn IPQC được duyệt','尚無核准的 IPQC 來源'],NO_PRODUCTS:['Chọn sản phẩm trong thông tin cơ bản','請先在基本資料選擇產品'],NO_MATCHING_ITEMS:['Không có hạng mục phù hợp','沒有符合條件的項目']};
  const readPause=window.createScopedReadPause('IPQC 製程引用 / Tham chiếu IPQC');
  async function get(query,endpoint='/api/process-ipqc'){const owner=readPause.capture(),kind=endpoint==='/api/process-ipqc'&&new URLSearchParams(query).get('mode')==='references'?'references':endpoint+':'+query,response=await fetch(endpoint+'?'+query,{cache:'no-store',headers:window.ProcessSync?.platformHeaders?.()||{}});let body;try{body=await response.json();}catch(error){readPause.denied(kind,response.status,owner,()=>get(query,endpoint));if([401,403].includes(response.status))error.status=response.status;throw error;}if(!response.ok){readPause.denied(kind,response.status,owner,()=>get(query,endpoint));throw Object.assign(Error(body.error||text('Không thể tải','讀取失敗')),{status:response.status});}readPause.success(kind,owner);return body;}
  function frequency(item){
    const names={batch:'Theo lô / 按批次',time:'Theo thời gian / 按時間',none:'Chưa thiết lập / 未設定',aql:'AQL',fixed:'Số mẫu / 固定件數',quantity:'Số lượng lô / 批次數量',week:'Hàng tuần / 每週',month:'Hàng tháng / 每月',quarter:'Hàng quý / 每季','half-year':'Nửa năm / 每半年',year:'Hàng năm / 每年',weekly:'Hàng tuần / 每週',monthly:'Hàng tháng / 每月',quarterly:'Hàng quý / 每季',half_yearly:'Nửa năm / 每半年',yearly:'Hàng năm / 每年',custom:'Tùy chỉnh / 自訂'};
    names.fixed_count='Số lượng cố định / 固定件數';names.batch_quantity='Số lượng lô / 批次數量';
    return item.rules?.length?item.rules.map(r=>[localized(names[r.cadence]||r.cadence),localized(names[r.kind||r.batchKind||r.timeFrequency]||r.kind||r.batchKind||r.timeFrequency||''),r.name,r.value,r.aqlValue&&'AQL '+r.aqlValue,r.fixedCount,r.batchQuantity,r.customBatchText,r.customBatchValue,r.customTimeText].filter(Boolean).join(' · ')).join(' / '):localized(item.frequency||'Chưa thiết lập / 未設定');
  }
  function choiceDetailsMarkup(c){const eq=c.equipment;return `<p><b>${label('Tiêu chuẩn kiểm tra','檢查標準')}</b><span>${h(c.standard)}</span></p><p><b>${label('Sản phẩm áp dụng','適用產品')}</b>${c.productCodes.map(h).join(' · ')}</p><p><b>${label('Mô tả cách kiểm tra','檢查方式敘述')}</b><span>${h(c.description)}</span></p><div class="process-ipqc-photos">${c.photos.map(p=>`<figure><a href="/api/ipqc-${c.source==='AB'?'ab':'c'}/photo?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener"><img decoding="async" loading="lazy" src="/api/ipqc-${c.source==='AB'?'ab':'c'}/photo?id=${encodeURIComponent(p.id)}" alt="${h(p.name)}"></a><figcaption>${h(p.note||p.name)}</figcaption></figure>`).join('')}</div><p><b>${label('Thiết bị / cách kiểm tra','檢具／檢查方式')}</b>${eq?h([eq.assetCode,eq.pieceMark,eq.name].filter(Boolean).join(' · ')):h(c.inspection||text('Kiểm tra trực quan','目視檢查'))}</p><p><b>${label('Tần suất kiểm tra','檢查頻率')}</b>${h(frequency(c))}</p>`;}
  function choiceMarkup(c,op,owner,detailBodies){
    const selected=(op.ipqcAssignments||[]).some(a=>key(a)===key(c)),locked=owner&&owner.id!==op.id,readonly=document.querySelector('#apply-operation')?.disabled,status=locked?'occupied':selected?'selected':'available';
    detailBodies.push(choiceDetailsMarkup(c));
    return `<article class="process-ipqc-choice" data-status="${status}"><label><input type="checkbox" data-ipqc-choice="${h(key(c))}" ${selected?'checked':''} ${locked||readonly?'disabled':''}><span><b>${h(c.code)}</b>${badge(status)}${locked?`<small class="process-ipqc-owner">${h(owner.number||owner.id)} · ${h(owner.name)}</small>`:''}</span></label>${locked?`<p class="process-ipqc-advisory">${label('Mỗi hạng mục chỉ thuộc một bước trong công đoạn. Bỏ chọn ở bước đang giữ, áp dụng, rồi chọn ở bước này.','同工段每個項目只能分配一次。請先到占用方塊取消勾選並套用，再回來勾選此方塊。')}</p>`:''}<details class="process-ipqc-item-details"><summary>${label('Xem tiêu chuẩn nguồn hiện hành, sản phẩm và ảnh','查看現行來源標準、適用產品與照片')}</summary></details></article>`;
  }
  async function loadChoices(panel,op,editor){
    const query=new URLSearchParams({mode:'choices',line:state.editorLine,category:state.category,stage:op.stageCode});(op.productCodes||[]).forEach(p=>query.append('product',p));
    const sync=window.ProcessSync,request={identity:currentIdentity(),id:currentIdentity()?.id,epoch:sync?.identityGeneration?.(),delivery:sync?.captureDelivery?.(),context:query.toString()};choiceRequests.set(panel,request);
    const valid=()=>{const now=new URLSearchParams({mode:'choices',line:state.editorLine,category:state.category,stage:op.stageCode});(op.productCodes||[]).forEach(p=>now.append('product',p));return panel.isConnected&&choiceRequests.get(panel)===request&&currentIdentity()===request.identity&&currentIdentity()?.id===request.id&&now.toString()===request.context&&sync?.identityGeneration?.()===request.epoch&&(!request.delivery||sync?.isCurrentDelivery?.(request.delivery)!==false)&&!sync?.requiresReload&&(!editor||editor.isCurrent());};
    panel.innerHTML=`<p role="status">${label('Đang tải IPQC…','IPQC 載入中…')}</p>`;
    try{
      const result=await get(query);if(!valid())return;
      const choices=result.choices,choicesByKey=new Map(),owners=new Map();for(const c of choices){const k=key(c);if(!choicesByKey.has(k))choicesByKey.set(k,c);}for(const node of ensureCategoryEditor()[op.stageCode]||[])for(const a of node.ipqcAssignments||[])owners.set(key(a),node);
      const groups=new Map(),detailBodies=[];for(const c of choices){const list=groups.get(c.errorId)||[];list.push(c);groups.set(c.errorId,list);}
      const stale=(op.ipqcAssignments||[]).filter(a=>{const c=choicesByKey.get(key(a));return !c||c.sourceVersionId!==a.sourceVersionId||JSON.stringify([...a.productCodes].sort((a,b)=>a.localeCompare(b)))!==JSON.stringify([...c.productCodes].sort((a,b)=>a.localeCompare(b)));});

      panel.innerHTML=`<div class="process-ipqc-context"><b>${h(state.editorLine)} → ${h(state.category)} → ${h(op.stageCode)}</b><strong>${h(op.number||op.id)} · ${h(document.querySelector('#operation-name')?.value||op.name)}</strong><small>IPQC-${h(result.source)} · ${label('Chỉ dùng nguồn được duyệt','僅使用核准來源')}</small></div><p>${label('Chỉ phân công hạng mục. Hoàn tất để giữ cục bộ, rồi đồng bộ sơ đồ và lưu thủ công.','此處僅分配項目；完成方塊後先留本機，再同步目前畫布、手動儲存。')}</p>${result.reason?`<div class="process-ipqc-warning" role="status"><p>${label(...messages[result.reason])}</p>${result.reason==='NO_PRODUCTS'?`<button type="button" data-ipqc-products>${label('Chọn sản phẩm trong thông tin cơ bản','前往基本資料選擇產品')}</button>`:`<p>${result.reason==='SOURCE_NOT_APPROVED'?label('Lưu, gửi duyệt và duyệt nguồn đúng chuyền / nhóm; sau đó tải lại. Không dùng bản nháp làm nguồn.','請在品質後台將此線別／群組的來源保存、送審並核准，再重新讀取。草稿尚不能分配。'):label('Kiểm tra sản phẩm, công đoạn và trạng thái bật của tiêu chuẩn đã duyệt.','請核對核准標準的產品、工段與啟用狀態。')}</p><a href="?view=data&system=process&dataTab=quality-ipqc-${result.source==='AB'?'ab':'c'}&ipqcScope=${encodeURIComponent(result.scope)}&ipqcStage=${encodeURIComponent(op.stageCode)}" target="_blank" rel="noopener">${label('Mở nguồn chất lượng · '+result.scope,'開啟品質來源 · '+result.scope)}</a>`}</div>`:''}<div class="process-ipqc-overview" role="status" aria-live="polite">${['selected','occupied','available'].map(status=>`<div class="process-ipqc-metric ${status}"><strong data-ipqc-count="${status}">0</strong><span>${h(statusText(status))}</span></div>`).join('')}</div>${stale.map(a=>`<div class="process-ipqc-warning" role="status">${label('Liên kết cũ đã thay đổi hoặc không còn phù hợp; vẫn được giữ lại','既有關聯來源或產品條件已變更；原關聯仍保留')}<code>${h(a.itemId)}</code><button type="button" data-ipqc-remove="${h(key(a))}" ${document.querySelector('#apply-operation')?.disabled?'disabled':''}>${label('Bỏ liên kết','移除關聯')}</button></div>`).join('')}${[...groups.values()].map(list=>`<details class="process-ipqc-group"><summary><span class="process-ipqc-group-title"><b>${h(list[0].errorCode)}</b><span>${h(list[0].errorName)}</span></span><span class="process-ipqc-progress" data-ipqc-progress></span></summary>${list.map(c=>choiceMarkup(c,op,owners.get(key(c)),detailBodies)).join('')}</details>`).join('')}<button type="button" class="process-ipqc-reload" data-ipqc-reload>${label('Tải lại nguồn','重新讀取來源')}</button>`;
      updateOverview(panel,choices,op,owners);
      panel.querySelector('[data-ipqc-products]')?.addEventListener('click',()=>{
        const dialog=panel.closest('#process-operation-dialog');
        if(dialog){
          dialog.querySelector('[data-tab="products"]')?.click();
          dialog.querySelector('[data-product-search],[data-product]')?.focus({preventScroll:true});
          return;
        }
        document.querySelector('#operation-basic-tab')?.click();
        document.querySelector('#operation-basic-panel .product-multi')?.scrollIntoView({block:'center'});
        document.querySelector('#operation-basic-panel [data-operation-product]')?.focus({preventScroll:true});
      });
      panel.querySelector('[data-ipqc-reload]').onclick=()=>loadChoices(panel,op,editor);
      // Validate all details from this fresh response now; allocate their DOM only
      // when expanded. The strings belong only to this panel's current request.
      panel.querySelectorAll('.process-ipqc-item-details').forEach((detail,index)=>{let rendered=false;detail.addEventListener('toggle',()=>{if(rendered||!detail.open||!valid())return;detail.insertAdjacentHTML('beforeend',detailBodies[index]);rendered=true;});});
      panel.querySelectorAll('[data-ipqc-choice]').forEach(input=>input.onchange=()=>{if(!valid()||editor&&!editor.canEdit())return;const choice=choicesByKey.get(input.dataset.ipqcChoice);if(!choice||input.checked&&(op.ipqcAssignments||[]).some(a=>key(a)===key(choice)))return;op.ipqcAssignments=(op.ipqcAssignments||[]).filter(a=>key(a)!==key(choice));if(input.checked){op.ipqcAssignments.push({source:choice.source,scope:choice.scope,itemId:choice.itemId,sourceVersionId:choice.sourceVersionId,productCodes:[...choice.productCodes]});owners.set(key(choice),op);}else owners.delete(key(choice));const status=input.checked?'selected':'available';input.closest('article').dataset.status=status;input.closest('label').querySelector('.process-ipqc-badge').outerHTML=badge(status);updateOverview(panel,choices,op,owners);panel.dispatchEvent(new Event('input',{bubbles:true}));});
      panel.querySelectorAll('[data-ipqc-remove]').forEach(button=>button.onclick=()=>{if(!valid()||editor&&!editor.canEdit())return;op.ipqcAssignments=(op.ipqcAssignments||[]).filter(a=>key(a)!==button.dataset.ipqcRemove);panel.dispatchEvent(new Event('input',{bubbles:true}));void loadChoices(panel,op,editor);});
      if(editor&&result.source==='AB')mountSourceComparisons(panel,op,editor,valid,query);
    }catch(error){if(valid()){panel.innerHTML=`<p role="alert">${label('Không thể tải IPQC; liên kết cũ được giữ lại','IPQC 讀取失敗；既有關聯保留')}<small>${h(error.message)}</small></p><button type="button">${label('Thử lại','重試')}</button>`;panel.querySelector('button').onclick=()=>loadChoices(panel,op,editor);}}
  }
  // Explicit AB source comparison. Only assignment tuples enter the existing
  // local form; historical/current quality bodies never enter another store.
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const tuple=c=>({source:c.source,scope:c.scope,itemId:c.itemId,sourceVersionId:c.sourceVersionId,productCodes:[...c.productCodes]});
  const strings=value=>Array.isArray(value)&&value.every(v=>typeof v==='string');
  function sourceProjection(c){
    if(!c||c.source!=='AB'||!['scope','itemId','sourceVersionId','code','errorId','errorCode','errorName','standard','description','inspection','frequency'].every(k=>typeof c[k]==='string')||!c.itemId||!c.sourceVersionId||!strings(c.productCodes)||!Array.isArray(c.rules)||!Array.isArray(c.photos)||c.photos.some(p=>!p||!['id','name','note'].every(k=>typeof p[k]==='string'))||c.rules.some(r=>!r||typeof r!=='object'||Array.isArray(r))||c.equipment!==null&&(!c.equipment||!['assetCode','pieceMark','name'].every(k=>typeof c.equipment[k]==='string')))throw Error('IPQC_SOURCE_UNAVAILABLE');
    return {...tuple(c),code:c.code,errorId:c.errorId,errorCode:c.errorCode,errorName:c.errorName,standard:c.standard,description:c.description,inspection:c.inspection,equipment:c.equipment,rules:c.rules,frequency:c.frequency,photos:c.photos};
  }
  function currentSource(result,assignment,op){
    if(!Number.isSafeInteger(result?.revision)||result.revision<0||result.source!=='AB'||result.scope!==assignment.scope||!Array.isArray(result.choices)||result.reason)throw Error('IPQC_SOURCE_UNAVAILABLE');
    const matches=result.choices.filter(c=>c&&key(c)===key(assignment));if(matches.length!==1)throw Error('IPQC_SOURCE_UNAVAILABLE');const selected=sourceProjection(matches[0]);if(!selected.productCodes.length||new Set(selected.productCodes).size!==selected.productCodes.length||selected.productCodes.some(p=>!op.productCodes.includes(p)))throw Error('IPQC_SOURCE_UNAVAILABLE');return selected;
  }
  function historicalSource(body,assignment,op){
    const v=body?.version,s=v?.snapshot;if(v?.id!==assignment.sourceVersionId||!['approved','superseded'].includes(v.status)||!Array.isArray(s?.items)||!Array.isArray(s.errors))throw Error('IPQC_HISTORY_UNAVAILABLE');
    const items=s.items.filter(i=>i?.id===assignment.itemId);if(items.length!==1)throw Error('IPQC_HISTORY_UNAVAILABLE');const i=items[0],errors=s.errors.filter(e=>e?.id===i.errorId);if(errors.length!==1)throw Error('IPQC_HISTORY_UNAVAILABLE');const e=errors[0];
    if(!['sourceTool','sourceMethod'].every(k=>typeof i[k]==='string')||e.deleted!==false||i.deleted!==false||i.isEnabled!==true||e.line!==state.editorLine||e.group!==state.category||e.stageCode!==op.stageCode||!strings(i.productCodes)||assignment.productCodes.some(p=>!i.productCodes.includes(p))||!Array.isArray(i.standardPhotos)||!Array.isArray(i.methodPhotos))throw Error('IPQC_HISTORY_UNAVAILABLE');
    return sourceProjection({...tuple(assignment),code:i.code,errorId:e.id,errorCode:e.code,errorName:e.name,standard:i.standard,description:i.methodText,inspection:[i.sourceTool,i.sourceMethod].filter(Boolean).join(' · '),equipment:i.equipmentSnapshot,rules:i.rules,frequency:i.sourceFrequency,photos:[...i.standardPhotos,...i.methodPhotos]});
  }
  function stageOperations(flow,workspace,stage){const rows=flow?.working?.workspaces?.filter(w=>w.id===workspace);if(rows?.length!==1||!Array.isArray(rows[0].stages?.[stage]))throw Error('IPQC_CONTEXT_CHANGED');return rows[0].stages[stage];}
  function oneOperation(rows,id){const matches=rows.filter(row=>row?.id===id);if(matches.length!==1)throw Error('IPQC_CONTEXT_CHANGED');return matches[0];}
  function sourcePin(panel,op,editor,valid,assignment){
    const api=window.ProcessAuthoringV3,sync=window.ProcessSync,authority=api?.recoveryAuthority?.(),flow=api?.flow?.(),identity=currentIdentity(),epoch=sync?.identityGeneration?.(),delivery=sync?.captureDelivery?.(),revision=editor.localRevision(),stage=op.stageCode,id=op.id,workspace=editor.workspace;
    if(assignment.source!=='AB'||!['scope','itemId','sourceVersionId'].every(k=>typeof assignment[k]==='string'&&assignment[k])||state.view!=='editor'||!valid()||!editor.canEdit()||!identity?.id||!Number.isSafeInteger(epoch)||!Number.isSafeInteger(revision)||authority?.canView!==true||authority.canEdit!==true||authority.pending||authority.busy||window.ProcessCanvasLocal?.pending?.()||!flow?.generation||flow.scope!=='process:platform'||!Number.isSafeInteger(flow.revision)||assignment.scope!==state.editorLine+':'+state.category||!strings(assignment.productCodes))throw Error('IPQC_CONTEXT_CHANGED');
    const settled=()=>['clean','dirty'].includes(api.navigation?.departure?.inspect?.().state);if(!settled())throw Error('IPQC_PREVIOUS_OPERATION_UNKNOWN');
    const selected=(op.ipqcAssignments||[]).filter(a=>key(a)===key(assignment));if(selected.length!==1||!same(selected[0],assignment))throw Error('IPQC_SELECTION_CHANGED');
    const viewSignature=JSON.stringify(authority.currentView),original=JSON.stringify(op.ipqcAssignments),products=JSON.stringify(op.productCodes),base=oneOperation(stageOperations(flow,workspace,stage),id),baseAssignments=JSON.stringify(base.ipqcAssignments),baseProducts=JSON.stringify(base.productCodes),generation=flow.generation,flowRevision=flow.revision,savedId=flow.saved?.id??null;
    const current=()=>{const a=api.recoveryAuthority(),f=api.flow();return state.view==='editor'&&JSON.stringify(a.currentView)===viewSignature&&settled()&&valid()&&panel.isConnected&&editor.isCurrent()&&editor.canEdit()&&currentIdentity()===identity&&sync.identityGeneration()===epoch&&(!delivery||sync.isCurrentDelivery?.(delivery)===true)&&!sync.requiresReload&&a.canView===true&&a.canEdit===true&&!a.pending&&!a.busy&&!window.ProcessCanvasLocal?.pending?.()&&f?.generation===generation&&f.revision===flowRevision&&(f.saved?.id??null)===savedId&&editor.workspace===workspace&&op.id===id&&op.stageCode===stage&&editor.localRevision()===revision&&JSON.stringify(op.ipqcAssignments)===original&&JSON.stringify(op.productCodes)===products;};
    const check=()=>{if(!current())throw Error('IPQC_CONTEXT_CHANGED');};
    return {current,check,api,generation,flowRevision,workspace,stage,id,savedId,baseAssignments,baseProducts};
  }
  function comparisonMarkup(old,current){
    const equipment=c=>c.equipment?[c.equipment.assetCode,c.equipment.pieceMark,c.equipment.name].filter(Boolean).join(' · '):c.inspection;
    const fields=[['版本','Phiên bản',c=>c.sourceVersionId],['項目／錯誤','Hạng mục / lỗi',c=>[c.code,c.errorCode,c.errorName].join(' · ')],['檢查標準','Tiêu chuẩn',c=>c.standard],['檢查方式','Cách kiểm tra',c=>c.description],['分配適用產品','Sản phẩm phân công',c=>c.productCodes.join(' · ')],['檢具快照／方式','Bản chụp thiết bị / cách',equipment],['檢查頻率','Tần suất',frequency],['照片紀錄（不載入圖片）','Thông tin ảnh (không tải ảnh)',c=>c.photos.map(p=>[p.id,p.name,p.note].filter(Boolean).join(' · ')).join('\n')]];
    return `<div class="process-ipqc-diff">${[[text('Phiên bản được tham chiếu','原引用版本'),old],[text('Nguồn đã duyệt hiện hành','現行核准來源'),current]].map(([title,c])=>`<section><h4>${h(title)}</h4>${fields.map(([zh,vi,value])=>`<p data-changed="${value(old)!==value(current)}"><b>${h(text(vi,zh))}${value(old)!==value(current)?' · '+h(text('Đã thay đổi','有變更')):''}</b><span>${h(value(c)||'—')}</span></p>`).join('')}</section>`).join('')}</div>`;
  }
  function mountSourceComparisons(panel,op,editor,valid,query){
    for(const remove of panel.querySelectorAll('[data-ipqc-remove]')){
      const selected=(op.ipqcAssignments||[]).filter(a=>key(a)===remove.dataset.ipqcRemove);if(selected.length!==1||selected[0].source!=='AB')continue;
      const assignment=structuredClone(selected[0]),button=document.createElement('button'),detail=document.createElement('section');button.type='button';button.setAttribute('data-ipqc-compare','');button.textContent=text('So sánh nguồn','比較來源');detail.className='process-ipqc-source-review';detail.setAttribute('aria-live','polite');detail.setAttribute('tabindex','-1');remove.after(button);button.after(detail);let running=false,preview=null;
      button.onclick=async()=>{
        if(running)return;let pin;try{pin=sourcePin(panel,op,editor,valid,assignment);}catch(error){if(detail.isConnected)detail.textContent=text('Chưa thể so sánh; giữ nguyên đầu vào.','目前無法比較，原輸入保留。')+' '+error.message;return;}
        running=true;preview=null;button.disabled=true;detail.textContent=text('Đang đọc đúng phiên bản; nguồn lớn có thể tải chậm.','正在讀取確切版本；整個群組版本較大時可能較慢。');
        try{
          const candidates=await get(query);pin.check();const current=currentSource(candidates,assignment,op);
          const history=await get(new URLSearchParams({scope:assignment.scope,versionId:assignment.sourceVersionId}),'/api/ipqc-ab/workflow');pin.check();const old=historicalSource(history,assignment,op);
          detail.innerHTML=comparisonMarkup(old,current)+`<p>${label('Chỉ đổi liên kết trên máy. Hoàn tất bước, đồng bộ sơ đồ, rồi lưu thủ công. Không sửa tiêu chuẩn nguồn.','只更新本機分配版本記錄；完成方塊後另按同步畫布、手動儲存。不修改來源標準。')}</p>`;
          const adopt=document.createElement('button');adopt.type='button';adopt.setAttribute('data-ipqc-adopt','');adopt.textContent=text('Dùng nguồn này trên máy','明確採用此來源至本機');detail.append(adopt);preview={pin,current};
          adopt.onclick=async()=>{
            if(running||!preview)return;const selectedPreview=preview;running=true;adopt.disabled=true;button.disabled=true;
            try{
              pin.check();const candidates=await get(query);pin.check();const next=currentSource(candidates,assignment,op);if(!same(next,selectedPreview.current))throw Error('IPQC_SOURCE_CHANGED_RECOMPARE');
              // Last GET rechecks edit permission/pending/peers. Sources are not
              // locked: manual Sync still validates the then-current source.
              const token=pin.api.captureCanvasRecovery(),fresh=await pin.api.readCanvasRecovery(token);pin.check();const flow=fresh?.control?.workflow;
              if(fresh?.permissions?.view!==true||fresh.permissions.edit!==true||flow?.scope!=='process:platform'||flow.generation!==pin.generation||!Number.isSafeInteger(flow.revision)||flow.revision<pin.flowRevision||(flow.saved?.id??null)!==pin.savedId||flow.pendingId||!fresh.control.versions?.some(v=>v.status==='draft'))throw Error('IPQC_AUTHORITY_CHANGED');
              const shared=stageOperations(flow,pin.workspace,pin.stage),target=oneOperation(shared,pin.id);
              if(JSON.stringify(target.ipqcAssignments)!==pin.baseAssignments||JSON.stringify(target.productCodes)!==pin.baseProducts)throw Error('IPQC_SHARED_ASSIGNMENT_CHANGED');
              const local=editor.operations();if(!Array.isArray(local)||[...shared,...local].some(row=>row.id!==pin.id&&(row.ipqcAssignments||[]).some(a=>key(a)===key(assignment))))throw Error('IPQC_ALREADY_ASSIGNED');
              const matches=(op.ipqcAssignments||[]).filter(a=>key(a)===key(assignment));if(matches.length!==1||!same(matches[0],assignment))throw Error('IPQC_CONTEXT_CHANGED');pin.check();
              op.ipqcAssignments=op.ipqcAssignments.map(a=>key(a)===key(assignment)?{...a,sourceVersionId:next.sourceVersionId,productCodes:[...next.productCodes]}:a);preview=null;panel.dispatchEvent(new Event('input',{bubbles:true}));detail.textContent=text('Đã dùng nguồn trên biểu mẫu cục bộ; chưa đồng bộ hay lưu.','已採用至本機表單；尚未同步、尚未儲存。');button.disabled=true;
            }catch(error){preview=null;if(detail.isConnected)detail.textContent=text('Không áp dụng; giữ nguyên đầu vào. Hãy so sánh lại.','未採用，原輸入保留。請重新比較。')+' '+error.message;}
            finally{running=false;if(preview||detail.querySelector('[data-ipqc-adopt]'))adopt.disabled=true;if(detail.isConnected&&preview===null&&same(op.ipqcAssignments?.find(a=>key(a)===key(assignment)),assignment))button.disabled=!valid()||!editor.canEdit();if(document.activeElement===adopt&&detail.isConnected&&valid())detail.focus();}
          };
        }catch(error){if(detail.isConnected)detail.textContent=text('Không xác nhận được nội dung cũ; không suy đoán khác biệt, không áp dụng. Giữ liên kết cũ.','舊內容無法確認；不推論內容差異、不提供採用，原關聯保留。')+' '+error.message;}
        finally{running=false;if(detail.isConnected)button.disabled=!valid()||!editor.canEdit();}
      };
    }
  }
  // C is query-only: no assignment controls or mutation callbacks are installed.
  const cQueryViews=new Map();
  const canReadC=()=>!!currentIdentity()?.id&&!window.ProcessSync?.requiresReload&&typeof currentUser!=='undefined'&&currentUser?.id===currentIdentity()?.id&&window.hasPermission?.('view:editor')===true&&(currentUser.role==='admin'||currentUser.lines?.includes('C'));
  function cQueryContext(op){const query=new URLSearchParams({mode:'choices',line:state.editorLine,category:state.category,stage:op.stageCode});(op.productCodes||[]).forEach(p=>query.append('product',p));return query.toString();}
  function cQueryCurrent(panel,op,request){const sync=window.ProcessSync;return panel.isConnected&&cQueryViews.get(panel)===request&&request.isCurrent()&&state.view==='editor'&&state.editorLine==='C'&&op.ipqcQueryEnabled===true&&canReadC()&&currentIdentity()===request.identity&&currentIdentity()?.id===request.id&&sync?.identityGeneration?.()===request.epoch&&(request.delivery==null||sync?.isCurrentDelivery?.(request.delivery)===true)&&cQueryContext(op)===request.context;}
  function clearInvalidCQueries(){for(const [panel,r] of cQueryViews){if(!cQueryCurrent(panel,r.op,r)){cQueryViews.delete(panel);panel.innerHTML='';}}}
  function unmountCQuery(panel){if(!panel)return;cQueryViews.delete(panel);panel.innerHTML='';}
  function cQueryMarkup(c){const eq=c.equipment;return `<article class="process-ipqc-choice"><h4>${h(c.code)} · ${h(c.errorName)}</h4><p><b>${label('Tiêu chuẩn kiểm tra','檢查標準')}</b><span>${h(c.standard)}</span></p><p><b>${label('Sản phẩm áp dụng','適用產品')}</b>${c.productCodes.map(h).join(' · ')}</p><p><b>${label('Mô tả cách kiểm tra','檢查方式敘述')}</b>${h(c.description)}</p><div class="process-ipqc-photos">${c.photos.map(p=>`<figure><a href="/api/ipqc-c/photo?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener"><img decoding="async" loading="lazy" src="/api/ipqc-c/photo?id=${encodeURIComponent(p.id)}" alt="${h(p.name)}"></a><figcaption>${h(p.note||p.name)}</figcaption></figure>`).join('')}</div><p><b>${label('Thiết bị / cách kiểm tra','檢具／檢查方式')}</b>${eq?h([eq.assetCode,eq.pieceMark,eq.name].filter(Boolean).join(' · ')):h(c.inspection)}</p><p><b>${label('Tần suất kiểm tra','檢查頻率')}</b>${h(frequency(c))}</p></article>`;}
  async function mountCQuery(panel,op,{isCurrent=()=>true}={}){
    if(!panel)return;clearInvalidCQueries();cQueryViews.delete(panel);panel.innerHTML='';
    if(!op.ipqcQueryEnabled){panel.innerHTML=`<p role="status">${label('Bật truy vấn để xem các tiêu chuẩn đã duyệt; không phân công hạng mục.','啟用查詢後顯示核准標準；不分配項目。')}</p>`;return;}
    if(state.view!=='editor'||state.editorLine!=='C'||!isCurrent()||!canReadC()){panel.innerHTML=`<p role="alert">${label('Không có quyền xem hoặc phiên đã thay đổi.','無查看權限或登入狀態已變更。')}</p>`;return;}
    if(!op.productCodes?.length){panel.innerHTML=`<p role="status">${label(...messages.NO_PRODUCTS)}</p>`;return;}
    const sync=window.ProcessSync,identity=currentIdentity(),request={identity,id:identity.id,epoch:sync?.identityGeneration?.(),delivery:sync?.captureDelivery?.(),context:cQueryContext(op),op,isCurrent};cQueryViews.set(panel,request);
    const valid=()=>cQueryCurrent(panel,op,request),retire=()=>{if(cQueryViews.get(panel)===request){cQueryViews.delete(panel);panel.innerHTML='';}};
    panel.innerHTML=`<p role="status">${label('Đang tải tiêu chuẩn IPQC-C…','IPQC-C 標準載入中…')}</p>`;
    try{const result=await get(request.context);if(!valid()){retire();return;}if(result.source!=='C'||result.scope!=='C'||!Array.isArray(result.choices)||result.reason&&!messages[result.reason])throw Error('IPQC_RESPONSE_INVALID');
      panel.innerHTML=`<p>${label('Chỉ đọc nguồn IPQC-C đã duyệt; không thêm hoặc đổi phân công.','僅查閱已核准 IPQC-C；不新增或變更分配。')}</p>${result.reason?`<p role="status">${label(...messages[result.reason])}</p>`:result.choices.length?'':`<p role="status">${label(...messages.NO_MATCHING_ITEMS)}</p>`}${result.choices.map(cQueryMarkup).join('')}<button type="button" data-c-query-reload>${label('Tải lại tiêu chuẩn','重新讀取標準')}</button>`;
      panel.querySelector('[data-c-query-reload]').onclick=()=>{if(!valid()){retire();return;}return mountCQuery(panel,op,{isCurrent});};
    }catch(error){if(!valid()){retire();return;}panel.innerHTML=`<p role="alert">${label('Không thể tải IPQC-C; không hiển thị dữ liệu cũ.','IPQC-C 讀取失敗；不顯示舊資料。')}<small>${h(error.message)}</small></p><button type="button" data-c-query-reload>${label('Thử lại','重試')}</button>`;panel.querySelector('[data-c-query-reload]').onclick=()=>{if(!valid()){retire();return;}return mountCQuery(panel,op,{isCurrent});};}
  }
  for(const event of ['process-delivery-invalidated','process-shared-state-updated','process-sync-status'])window.addEventListener(event,clearInvalidCQueries);
  function mountInspector(form,op){
    const grid=form.querySelector('.inspector-form');if(!grid||grid.querySelector('.process-ipqc-tabs'))return;
    const actions=grid.querySelector('.inspector-actions'),basic=document.createElement('section'),panel=document.createElement('section'),nav=document.createElement('div');
    basic.id='operation-basic-panel';basic.className='process-basic-panel';basic.setAttribute('role','tabpanel');basic.setAttribute('aria-labelledby','operation-basic-tab');
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot the live collection before moving its children.
    for(const child of [...grid.children])if(child!==actions)basic.append(child);
    basic.querySelector('.editor-section-title')?.remove();
    panel.id='operation-ipqc-panel';panel.className='process-ipqc-panel';panel.dataset.i18nSkip='true';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','operation-ipqc-tab');
    nav.className='process-ipqc-tabs';nav.dataset.i18nSkip='true';nav.setAttribute('role','tablist');nav.innerHTML=`<button type="button" role="tab" id="operation-basic-tab" aria-controls="operation-basic-panel">${label('Thông tin cơ bản','基本資料')}</button><button type="button" role="tab" id="operation-ipqc-tab" aria-controls="operation-ipqc-panel">IPQC</button>`;
    grid.prepend(nav,basic,panel);
    function select(name){basic.hidden=name!=='basic';panel.hidden=name!=='ipqc';nav.querySelectorAll('button').forEach((b,i)=>{const on=(i===0)===(name==='basic');b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;});if(name==='ipqc')void loadChoices(panel,op);}
    nav.querySelectorAll('button').forEach((b,i)=>{b.onclick=()=>select(i?'ipqc':'basic');b.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-i;select(next?'ipqc':'basic');nav.children[next].focus();}};});
    select('basic');
  }
  function referenceMarkup(source,scope,itemId){return `<section class="process-ipqc-references" data-i18n-skip="true" data-ipqc-reference="${h(JSON.stringify([source,scope,itemId]))}"><h4>${label('Tham chiếu quy trình','製程引用')}</h4><div role="status">${label('Đang tải…','載入中…')}</div></section>`;}
  let referenceSession=null;
  function referenceRows(rows){return rows.map(r=>`<p>${h(r.line)} → ${h(r.category)} → ${h(r.stage)} → <b>${h(r.number)} · ${h(r.name)}</b><small class="process-ipqc-reference-status" data-status="${h(r.status)}">V${h(r.versionNumber)} · ${h(localized(({working:r.saved?'Bản nháp đã lưu / 草稿已儲存':'Đã đồng bộ · chưa lưu / 已同步，尚未儲存',pending:'Chờ duyệt / 待審固定內容',approved:'Đã duyệt / 核准',superseded:'Lịch sử / 歷史',returned:'Đã trả lại / 已發回',withdrawn:'Đã rút / 已撤回'})[r.status]||r.status))}</small></p>`).join('');}
  const validSession=session=>referenceSession===session&&currentIdentity()===session.identity&&currentIdentity()?.id===session.id;
  function renderReferences(node,result,session){
    if(!node.isConnected||!validSession(session))return;
    const previous=referenceViews.get(node);if(previous?.session===session&&previous.revision===result.revision)return;
    const [source,scope,itemId]=JSON.parse(node.dataset.ipqcReference),rows=result.references.filter(r=>r.source===source&&r.scope===scope&&r.itemId===itemId),view={session,revision:result.revision,offset:0,request:null};referenceViews.set(node,view);
    // A read action remains usable inside the quality viewer's disabled fieldset.
    node.lastElementChild.innerHTML=`<div>${rows.length?referenceRows(rows):label('Chưa có tham chiếu hiện tại trong phạm vi được xem','可查看範圍內目前尚無引用')}</div>${result.canReadHistory?`<div data-ipqc-history></div><a href="#" role="button" data-ipqc-history-more>${label('Xem lịch sử','查看歷史')}</a>`:''}`;
    const button=node.querySelector('[data-ipqc-history-more]');if(!button)return;
    button.onclick=async event=>{
      event.preventDefault();event.stopPropagation();if(!validSession(session)||view.request)return;
      const request={};view.request=request;button.setAttribute('aria-disabled','true');
      const valid=()=>node.isConnected&&validSession(session)&&referenceViews.get(node)===view&&view.request===request&&session.result?.revision===view.revision;
      try{const page=await get(new URLSearchParams({mode:'history',source,scope,itemId,revision:String(view.revision),offset:String(view.offset),limit:'10'}));if(!valid())return;
        node.querySelector('[data-ipqc-history]').insertAdjacentHTML('beforeend',page.references.length?referenceRows(page.references):`<p>${label('Không có tham chiếu trong trang lịch sử này','此歷史頁無引用')}</p>`);
        view.offset=page.nextOffset;button.hidden=page.nextOffset===null;button.innerHTML=label('Xem thêm lịch sử','載入更多歷史');
      }catch{if(valid())button.innerHTML=label('Không thể tải lịch sử · thử lại','歷史讀取失敗 · 重試');}finally{if(valid()){view.request=null;button.setAttribute('aria-disabled','false');}}
    };
    button.onkeydown=event=>{if(event.key===' '){event.preventDefault();button.click();}};
  }
  async function mountReferences(root=document){
    const nodes=[...root.querySelectorAll('[data-ipqc-reference]')];if(!nodes.length||!readPause.canPoll('references'))return;
    const identity=currentIdentity();if(!referenceSession||referenceSession.identity!==identity||referenceSession.id!==identity?.id){referenceSession={identity,id:identity?.id,pending:null,result:null};for(const node of document.querySelectorAll('[data-ipqc-reference]')){referenceViews.delete(node);node.lastElementChild.innerHTML=label('Đang tải…','載入中…');}}
    const session=referenceSession,query=new URLSearchParams({mode:'references'});if(session.result)query.set('revision',String(session.result.revision));
    const request=session.pending||(session.pending={promise:get(query)});
    try{const response=await request.promise;if(!validSession(session)||session.pending!==request)return;
      const result=response.unchanged?session.result:response;if(!result)return;session.result=result;
      for(const node of nodes)renderReferences(node,result,session);
    }catch(error){if(!validSession(session)||session.pending!==request)return;if([401,403].includes(error.status)&&session.result)return;for(const node of nodes)if(node.isConnected){referenceViews.delete(node);node.lastElementChild.innerHTML=label('Không thể tải tham chiếu; thử lại sau','引用讀取失敗，請稍後重試');}}
    finally{if(session.pending===request)queueMicrotask(()=>{if(session.pending===request)session.pending=null;});}
  }
  window.addEventListener('process-language-change',()=>{referenceSession=null;void mountReferences();const panel=document.querySelector('#operation-ipqc-panel');if(panel?.isConnected){const reload=panel.querySelector('[data-ipqc-reload]');if(reload&&!panel.hidden)reload.click();}const basic=document.querySelector('#operation-basic-tab');if(basic)basic.innerHTML=label('Thông tin cơ bản','基本資料');for(const node of document.querySelectorAll('[data-ipqc-reference] h4'))node.innerHTML=label('Tham chiếu quy trình','製程引用');});
  window.ProcessIPQC={mountCQuery,unmountCQuery,mountChoices:loadChoices,mountInspector,referenceMarkup,mountReferences};
  setInterval(()=>{if(document.visibilityState==='visible')void mountReferences();},5000);
})();

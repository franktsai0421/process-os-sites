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
  async function get(query){const owner=readPause.capture(),kind=new URLSearchParams(query).get('mode')==='references'?'references':query.toString(),response=await fetch('/api/process-ipqc?'+query,{cache:'no-store',headers:window.ProcessSync?.platformHeaders?.()||{}});let body;try{body=await response.json();}catch(error){readPause.denied(kind,response.status,owner,()=>get(query));if([401,403].includes(response.status))error.status=response.status;throw error;}if(!response.ok){readPause.denied(kind,response.status,owner,()=>get(query));throw Object.assign(Error(body.error||text('Không thể tải','讀取失敗')),{status:response.status});}readPause.success(kind,owner);return body;}
  function frequency(item){
    const names={batch:'Theo lô / 按批次',time:'Theo thời gian / 按時間',none:'Chưa thiết lập / 未設定',aql:'AQL',fixed:'Số mẫu / 固定件數',quantity:'Số lượng lô / 批次數量',week:'Hàng tuần / 每週',month:'Hàng tháng / 每月',quarter:'Hàng quý / 每季','half-year':'Nửa năm / 每半年',year:'Hàng năm / 每年',weekly:'Hàng tuần / 每週',monthly:'Hàng tháng / 每月',quarterly:'Hàng quý / 每季',half_yearly:'Nửa năm / 每半年',yearly:'Hàng năm / 每年',custom:'Tùy chỉnh / 自訂'};
    names.fixed_count='Số lượng cố định / 固定件數';names.batch_quantity='Số lượng lô / 批次數量';
    return item.rules?.length?item.rules.map(r=>[localized(names[r.cadence]||r.cadence),localized(names[r.kind||r.batchKind||r.timeFrequency]||r.kind||r.batchKind||r.timeFrequency||''),r.name,r.value,r.aqlValue&&'AQL '+r.aqlValue,r.fixedCount,r.batchQuantity,r.customBatchText,r.customBatchValue,r.customTimeText].filter(Boolean).join(' · ')).join(' / '):localized(item.frequency||'Chưa thiết lập / 未設定');
  }
  function choiceDetailsMarkup(c){const eq=c.equipment;return `<p><b>${label('Tiêu chuẩn kiểm tra','檢查標準')}</b><span>${h(c.standard)}</span></p><p><b>${label('Sản phẩm áp dụng','適用產品')}</b>${c.productCodes.map(h).join(' · ')}</p><p><b>${label('Mô tả cách kiểm tra','檢查方式敘述')}</b><span>${h(c.description)}</span></p><div class="process-ipqc-photos">${c.photos.map(p=>`<figure><a href="/api/ipqc-${c.source==='AB'?'ab':'c'}/photo?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener"><img decoding="async" loading="lazy" src="/api/ipqc-${c.source==='AB'?'ab':'c'}/photo?id=${encodeURIComponent(p.id)}" alt="${h(p.name)}"></a><figcaption>${h(p.note||p.name)}</figcaption></figure>`).join('')}</div><p><b>${label('Thiết bị / cách kiểm tra','檢具／檢查方式')}</b>${eq?h([eq.assetCode,eq.pieceMark,eq.name].filter(Boolean).join(' · ')):h(c.inspection||text('Kiểm tra trực quan','目視檢查'))}</p><p><b>${label('Tần suất kiểm tra','檢查頻率')}</b>${h(frequency(c))}</p>`;}
  function choiceMarkup(c,op,owner,detailBodies){
    const selected=(op.ipqcAssignments||[]).some(a=>key(a)===key(c)),locked=owner&&owner.id!==op.id,readonly=document.querySelector('#apply-operation')?.disabled,status=locked?'occupied':selected?'selected':'available';
    detailBodies.push(choiceDetailsMarkup(c));
    return `<article class="process-ipqc-choice" data-status="${status}"><label><input type="checkbox" data-ipqc-choice="${h(key(c))}" ${selected?'checked':''} ${locked||readonly?'disabled':''}><span><b>${h(c.code)}</b>${badge(status)}${locked?`<small class="process-ipqc-owner">${h(owner.number||owner.id)} · ${h(owner.name)}</small>`:''}</span></label>${locked?`<p class="process-ipqc-advisory">${label('Mỗi hạng mục chỉ thuộc một bước trong công đoạn. Bỏ chọn ở bước đang giữ, áp dụng, rồi chọn ở bước này.','同工段每個項目只能分配一次。請先到占用方塊取消勾選並套用，再回來勾選此方塊。')}</p>`:''}<details class="process-ipqc-item-details"><summary>${label('Xem tiêu chuẩn, sản phẩm và ảnh','查看標準、適用產品與照片')}</summary></details></article>`;
  }
  async function loadChoices(panel,op){
    const query=new URLSearchParams({mode:'choices',line:state.editorLine,category:state.category,stage:op.stageCode});(op.productCodes||[]).forEach(p=>query.append('product',p));
    const request={identity:currentIdentity(),id:currentIdentity()?.id,context:query.toString()};choiceRequests.set(panel,request);
    const valid=()=>{const now=new URLSearchParams({mode:'choices',line:state.editorLine,category:state.category,stage:op.stageCode});(op.productCodes||[]).forEach(p=>now.append('product',p));return panel.isConnected&&choiceRequests.get(panel)===request&&currentIdentity()===request.identity&&currentIdentity()?.id===request.id&&now.toString()===request.context;};
    panel.innerHTML=`<p role="status">${label('Đang tải IPQC…','IPQC 載入中…')}</p>`;
    try{
      const result=await get(query);if(!valid())return;
      const choices=result.choices,choicesByKey=new Map(),owners=new Map();for(const c of choices){const k=key(c);if(!choicesByKey.has(k))choicesByKey.set(k,c);}for(const node of ensureCategoryEditor()[op.stageCode]||[])for(const a of node.ipqcAssignments||[])owners.set(key(a),node);
      const groups=new Map(),detailBodies=[];for(const c of choices){const list=groups.get(c.errorId)||[];list.push(c);groups.set(c.errorId,list);}
      const stale=(op.ipqcAssignments||[]).filter(a=>{const c=choicesByKey.get(key(a));return !c||c.sourceVersionId!==a.sourceVersionId||JSON.stringify([...a.productCodes].sort((a,b)=>a.localeCompare(b)))!==JSON.stringify([...c.productCodes].sort((a,b)=>a.localeCompare(b)));});

      panel.innerHTML=`<div class="process-ipqc-context"><b>${h(state.editorLine)} → ${h(state.category)} → ${h(op.stageCode)}</b><strong>${h(op.number||op.id)} · ${h(document.querySelector('#operation-name')?.value||op.name)}</strong><small>IPQC-${h(result.source)} · ${label('Chỉ dùng nguồn được duyệt','僅使用核准來源')}</small></div><p>${label('Chỉ phân công hạng mục. Áp dụng để đồng bộ, sau đó lưu bản nháp.','此處僅分配項目；套用後同步，再手動儲存草稿。')}</p>${result.reason?`<div class="process-ipqc-warning" role="status"><p>${label(...messages[result.reason])}</p>${result.reason==='NO_PRODUCTS'?`<button type="button" data-ipqc-products>${label('Chọn sản phẩm trong thông tin cơ bản','前往基本資料選擇產品')}</button>`:`<p>${result.reason==='SOURCE_NOT_APPROVED'?label('Lưu, gửi duyệt và duyệt nguồn đúng chuyền / nhóm; sau đó tải lại. Không dùng bản nháp làm nguồn.','請在品質後台將此線別／群組的來源保存、送審並核准，再重新讀取。草稿尚不能分配。'):label('Kiểm tra sản phẩm, công đoạn và trạng thái bật của tiêu chuẩn đã duyệt.','請核對核准標準的產品、工段與啟用狀態。')}</p><a href="?view=data&system=process&dataTab=quality-ipqc-${result.source==='AB'?'ab':'c'}&ipqcScope=${encodeURIComponent(result.scope)}&ipqcStage=${encodeURIComponent(op.stageCode)}" target="_blank" rel="noopener">${label('Mở nguồn chất lượng · '+result.scope,'開啟品質來源 · '+result.scope)}</a>`}</div>`:''}<div class="process-ipqc-overview" role="status" aria-live="polite">${['selected','occupied','available'].map(status=>`<div class="process-ipqc-metric ${status}"><strong data-ipqc-count="${status}">0</strong><span>${h(statusText(status))}</span></div>`).join('')}</div>${stale.map(a=>`<div class="process-ipqc-warning" role="status">${label('Liên kết cũ đã thay đổi hoặc không còn phù hợp; vẫn được giữ lại','既有關聯來源或產品條件已變更；原關聯仍保留')}<code>${h(a.itemId)}</code><button type="button" data-ipqc-remove="${h(key(a))}" ${document.querySelector('#apply-operation')?.disabled?'disabled':''}>${label('Bỏ liên kết','移除關聯')}</button></div>`).join('')}${[...groups.values()].map(list=>`<details class="process-ipqc-group"><summary><span class="process-ipqc-group-title"><b>${h(list[0].errorCode)}</b><span>${h(list[0].errorName)}</span></span><span class="process-ipqc-progress" data-ipqc-progress></span></summary>${list.map(c=>choiceMarkup(c,op,owners.get(key(c)),detailBodies)).join('')}</details>`).join('')}<button type="button" class="process-ipqc-reload" data-ipqc-reload>${label('Tải lại nguồn','重新讀取來源')}</button>`;
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
      panel.querySelector('[data-ipqc-reload]').onclick=()=>loadChoices(panel,op);
      // Validate all details from this fresh response now; allocate their DOM only
      // when expanded. The strings belong only to this panel's current request.
      panel.querySelectorAll('.process-ipqc-item-details').forEach((detail,index)=>{let rendered=false;detail.addEventListener('toggle',()=>{if(rendered||!detail.open||!valid())return;detail.insertAdjacentHTML('beforeend',detailBodies[index]);rendered=true;});});
      panel.querySelectorAll('[data-ipqc-choice]').forEach(input=>input.onchange=()=>{const choice=choicesByKey.get(input.dataset.ipqcChoice);if(!choice)return;op.ipqcAssignments=(op.ipqcAssignments||[]).filter(a=>key(a)!==key(choice));if(input.checked){op.ipqcAssignments.push({source:choice.source,scope:choice.scope,itemId:choice.itemId,sourceVersionId:choice.sourceVersionId,productCodes:[...choice.productCodes]});owners.set(key(choice),op);}else owners.delete(key(choice));const status=input.checked?'selected':'available';input.closest('article').dataset.status=status;input.closest('label').querySelector('.process-ipqc-badge').outerHTML=badge(status);updateOverview(panel,choices,op,owners);panel.dispatchEvent(new Event('input',{bubbles:true}));});
      panel.querySelectorAll('[data-ipqc-remove]').forEach(button=>button.onclick=()=>{op.ipqcAssignments=(op.ipqcAssignments||[]).filter(a=>key(a)!==button.dataset.ipqcRemove);panel.dispatchEvent(new Event('input',{bubbles:true}));void loadChoices(panel,op);});
    }catch(error){if(valid()){panel.innerHTML=`<p role="alert">${label('Không thể tải IPQC; liên kết cũ được giữ lại','IPQC 讀取失敗；既有關聯保留')}<small>${h(error.message)}</small></p><button type="button">${label('Thử lại','重試')}</button>`;panel.querySelector('button').onclick=()=>loadChoices(panel,op);}}
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

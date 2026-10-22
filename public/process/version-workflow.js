(function(){
  const statusLabels={draft:"草稿 · 未送審",pending:"主管審核中",approved:"已核准",superseded:"歷史核准",rejected:"要求修改"};
  const fieldLabels={name:"名稱",people:"人數",mode:"方式",productCodes:"產品",bomSelections:"BOM",machineIds:"設備",instructionSteps:"操作步驟",productInstructionSteps:"產品補充",ipqc:"IPQC",nextIds:"流程連線"};
  const deepCopy=value=>JSON.parse(JSON.stringify(value||{}));
  const group=(category=state.category,line=state.editorLine)=>approvalVersions.filter(item=>item.category===category&&item.line===line).sort((a,b)=>(b.number||0)-(a.number||0));
  const approved=(category,line)=>window.ProcessAuthoringV3?.enabled()?window.ProcessAuthoringV3.approved(category,line):group(category,line).find(item=>item.status==="approved")||group(category,line).find(item=>item.status==="superseded");
  const returnCheck=version=>VersionReturnPolicy?.check(group(version.category,version.line),version)||{allowed:false,reason:"無法檢查返回條件。"};
  const history=(version,action,label,note="")=>{version.history=version.history||[];version.history.push({action,label,note,actor:currentUser?.name||"系統",at:new Date().toISOString()})};
  const stepsFor=(operation,productCode="")=>productCode?(operation.productInstructionSteps?.[productCode]||[]):(operation.instructionSteps?.length?operation.instructionSteps:(operation.instructions?.trim()?[{text:operation.instructions,standard:operation.ipqc||"依核准標準檢查"}]:[]));
  const validationRulesMarkup=(summary="查看送審檢查規則")=>`<details class="validation-rules"><summary>${summary}</summary><p>這些是系統送審時實際執行的全部檢查；尚未在任何流程方塊勾選的產品不列入送審檢查。</p><ol><li>產品只要在任一流程方塊被勾選，就會成為本工作區的參與產品；其正式路線每個必要工段都至少要有一個套用該產品的流程方塊。</li><li>有套用產品的流程方塊必須填寫流程名稱。</li><li>機器流程必須選擇至少一台設備。</li><li>流程至少要有一個操作步驟。</li><li>每個已填寫的操作步驟都必須填寫完成標準。</li><li>每個流程最多只能連到一個下一流程。</li><li>流程線只能連到同工段目前存在的方塊；刪除方塊後不可留下失效連線。</li><li>同工段有兩個以上適用流程時，所有流程必須連成同一個流程群組，不可有孤立方塊。</li><li>參與產品的根層 BOM 零件可以分配在不同工段或方塊，但所有適用流程方塊合併後必須完整涵蓋全部料號；同一料號至少在一個方塊勾選即可。</li></ol></details>`;

  function missingBomItemsMarkup(error){
    const normalizedRows=new Map(rootBom(error.productCode).map(row=>[String(row.itemCode||'').trim().toUpperCase(),row]));
    return `<section class="issue-missing-bom"><b>尚未分配的 BOM 料號</b><ul>${(error.items||[]).map(item=>{const normalized=String(item||'').trim().toUpperCase(),row=normalizedRows.get(normalized);return `<li><code>${escapeHtml(row?.itemCode||item)}</code><span>${escapeHtml(row?.itemName||'未找到品名')}</span></li>`}).join('')}</ul></section>`;
  }

  function validate(version,onlyProduct=""){
    const errors=[],stageEntries=Object.entries(version?.stages||{}),allOperations=stageEntries.flatMap(([stageCode,items])=>(items||[]).map(operation=>({operation,stageCode}))),participatingCodes=new Set(allOperations.flatMap(({operation})=>operation.productCodes||[])),routeProducts=data.products.filter(product=>product.category===version?.category&&routeFor(product.code)?.line===version?.line&&(onlyProduct?product.code===onlyProduct:participatingCodes.has(product.code))),productCodes=routeProducts.map(product=>product.code),operations=allOperations.filter(({operation})=>(operation.productCodes||[]).length&&(!onlyProduct||operation.productCodes.includes(onlyProduct)));
    const add=(operation,stageCode,type,field,message,items=[])=>errors.push({type,field,message,items,operationId:operation?.id||null,operationIds:operation?[operation.id]:[],stageCode,operationNumber:operation?.number||""});
    operations.forEach(({operation,stageCode})=>{
      if(!operation.name?.trim())add(operation,stageCode,"content","name",`${operation.number} 缺少流程名稱`);
      if(operation.mode==="machine"&&!(operation.machineIds||[]).length)add(operation,stageCode,"content","machines",`${operation.number} 是機器流程，但尚未選擇設備`);
      const steps=stepsFor(operation),hasText=steps.some(step=>step.text?.trim()),incomplete=steps.findIndex(step=>step.text?.trim()&&!step.standard?.trim());
      if(!hasText)add(operation,stageCode,"instruction","instructions",`${operation.number} ${operation.name||"未命名流程"} 尚未建立操作流程`);
      else if(incomplete>=0)add(operation,stageCode,"instruction","instructions",`${operation.number} 第 ${incomplete+1} 步缺少「需要達到的標準」`);
      if((operation.nextIds||[]).length>1)add(operation,stageCode,"connection","nextIds",`${operation.number} 同時連到 ${(operation.nextIds||[]).length} 個下一流程；每個流程只能有一個去向`);
    });
    stageEntries.forEach(([stageCode,items])=>{
      const stageOperations=(items||[]).filter(operation=>(window.ProcessAuthoringV3?.enabled()&&['entry','exit'].includes(operation.editorType))||((operation.productCodes||[]).length&&(!onlyProduct||operation.productCodes.includes(onlyProduct)))),ids=new Set(stageOperations.map(item=>item.id)),neighbors=new Map(stageOperations.map(item=>[item.id,new Set()]));
      stageOperations.forEach(operation=>(operation.nextIds||[]).forEach(nextId=>{if(!ids.has(nextId)){add(operation,stageCode,"connection","nextIds",`${operation.number} 的流程線指向已不存在的方塊`);return}neighbors.get(operation.id)?.add(nextId);neighbors.get(nextId)?.add(operation.id)}));
      if(stageOperations.length<2)return;
      const components=[],visited=new Set();
      stageOperations.forEach(operation=>{if(visited.has(operation.id))return;const component=[],queue=[operation.id];visited.add(operation.id);while(queue.length){const id=queue.shift();component.push(id);neighbors.get(id)?.forEach(nextId=>{if(!visited.has(nextId)){visited.add(nextId);queue.push(nextId)}})}components.push(component)});
      if(components.length<2)return;
      const main=components.slice().sort((a,b)=>b.length-a.length)[0],mainIds=new Set(main);
      stageOperations.filter(operation=>!mainIds.has(operation.id)).forEach(operation=>add(operation,stageCode,"connection","nextIds",neighbors.get(operation.id)?.size?`${operation.number} 所在的流程群組尚未與本工段主要流程連接`:`${operation.number} 尚未連接任何流程線`));
    });
    routeProducts.forEach(product=>(routeFor(product.code)?.stages||[]).forEach(stageCode=>{const related=(version?.stages?.[stageCode]||[]).filter(operation=>operation.productCodes?.includes(product.code));if(!related.length)errors.push({type:"stage",field:"products",message:`${product.code} ${product.name||""} 的必要工段 ${stageCode} 尚未建立適用流程`,items:[],productCode:product.code,operationIds:[],stageCode})}));
    productCodes.forEach(code=>{
      const routeStageCodes=new Set(routeFor(code)?.stages||[]),
        related=operations.filter(({operation,stageCode})=>routeStageCodes.has(stageCode)&&operation.productCodes?.includes(code)),
        normalize=value=>String(value||'').trim().toUpperCase(),
        required=[...new Set(rootBom(code).map(item=>normalize(bomReferenceKey(item))).filter(Boolean))],
        used=new Set(related.flatMap(({operation})=>{
          const selected=operation.bomSelections?.[code];
          if(Array.isArray(selected))return selected.map(normalize);
          if(operation.bomProductCode===code)return (operation.bomItems||[]).map(normalize);
          return [];
        })),
        missing=required.filter(item=>!used.has(item));
      if(missing.length){const product=data.products.find(item=>item.code===code);errors.push({type:"bom",field:"bom",message:`${code} ${product?.name||""} 尚有 ${missing.length} 項 BOM 未分配`,items:missing,productCode:code,operationIds:related.map(({operation})=>operation.id),stageCode:related[0]?.stageCode||""})}
    });
    return errors;
  }

  function dispatchReadiness(code,line){
    const product=data.products.find(item=>item.code===code),route=routeFor(code);if(!product||!route||route.line!==line)return {ok:false,errors:[{message:`${code} 已不在 ${line} 線後台資料中`}]};
    const version=approved(product.category,line);if(!version)return {ok:false,errors:[{message:`${code} 尚無已核准的製程版本`}]};
    const errors=validate(version,code);return {ok:!errors.length,errors,version};
  }

  function compare(current,base){
    const result={added:[],removed:[],changed:[],same:0},flatten=version=>new Map(Object.entries(version?.stages||{}).flatMap(([stage,operations])=>operations.map(operation=>[`${stage}:${operation.number}`,operation]))),now=flatten(current),before=flatten(base),keys=new Set([...now.keys(),...before.keys()]);
    keys.forEach(key=>{const a=now.get(key),b=before.get(key);if(!b){result.added.push(a);return}if(!a){result.removed.push(b);return}const fields=Object.keys(fieldLabels).filter(field=>JSON.stringify(a[field]||null)!==JSON.stringify(b[field]||null));if(fields.length)result.changed.push({operation:a,fields});else result.same++});return result;
  }

  function seedSamples(){
    if(window.ProcessSync?.protected||readStore("versionSampleSeed4",false))return;
    const previousCategory=state.category,previousLine=state.editorLine;state.category="BORUAXE1021";state.editorLine="A";
    const base=deepCopy(ensureCategoryEditor()),sampleProducts=productsForCategory().slice(0,3),operations=Object.values(base).flat();
    if(!base["A-CUT"]?.length||!sampleProducts.length){state.category=previousCategory;state.editorLine=previousLine;return;}
    operations.forEach((operation,index)=>{operation.productCodes=sampleProducts.map(product=>product.code);operation.bomSelections={};sampleProducts.forEach(product=>{operation.bomSelections[product.code]=rootBom(product.code).filter((row,rowIndex)=>rowIndex%operations.length===index%operations.length).map(row=>bomReferenceKey(row))});operation.bomItems=Object.values(operation.bomSelections).flat();operation.instructionSteps=[{text:`確認 ${operation.name} 作業前物料與設備`,standard:"料號、設備及安全防護確認完成"},{text:`依標準姿勢完成 ${operation.name}`,standard:"外觀完整、尺寸符合標準"}];operation.instructions=operation.instructionSteps.map((step,i)=>`${i+1}. ${step.text}`).join("\n");operation.ipqc="依製程標準與首件檢查表確認"});
    const existing=group("BORUAXE1021","A"),start=Math.max(0,...existing.map(item=>item.number||0)),stamp=Date.now();
    const make=(offset,status,days)=>({id:`SAMPLE-${stamp}-${offset}`,number:start+offset,category:"BORUAXE1021",line:"A",stages:deepCopy(base),createdAt:new Date(stamp-days*86400000).toISOString(),creatorId:"operator",creatorName:"製程人員",status,history:[]});
    const v1=make(1,"superseded",5),v2=make(2,"approved",2),v3=make(3,"superseded",1),v4=make(4,"draft",0);v1.stages["A-CUT"]=(v1.stages["A-CUT"]||[]).slice(0,4);v2.stages["A-CUT"][0].name="人工組裝（核准版）";v3.stages=deepCopy(v2.stages);v4.stages=deepCopy(v2.stages);v4.parentVersionId=v2.id;
    [v1,v2,v3,v4].forEach(version=>{version.history.push({action:"created",label:version.status==="draft"?"新版本草稿建立":"版本建立",actor:"製程人員",at:version.createdAt});if(["approved","superseded"].includes(version.status))version.history.push({action:"approved",label:"確認核准",actor:"RD 主管",at:new Date(new Date(version.createdAt).getTime()+3600000).toISOString(),note:"範例版本確認完成"})});
    approvalVersions.unshift(v4,v3,v2,v1);state.category=previousCategory;state.editorLine=previousLine;localStorage.setItem("versionSampleSeed4","true");persistPlatform();
  }

  function diffHtml(current,base){
    if(!base)return `<div class="compare-empty">沒有可比對的上一個版本</div>`;const diff=compare(current,base);
    return `<div class="diff-summary"><span class="diff-add">＋${diff.added.length} 新增</span><span class="diff-remove">－${diff.removed.length} 移除</span><span class="diff-change">△${diff.changed.length} 變更</span><span>${diff.same} 未變更</span></div><div class="diff-list">${diff.added.map(item=>`<div class="diff-row added"><b>新增 ${escapeHtml(item.number)}</b><span>${escapeHtml(item.name)}</span></div>`).join("")}${diff.removed.map(item=>`<div class="diff-row removed"><b>移除 ${escapeHtml(item.number)}</b><span>${escapeHtml(item.name)}</span></div>`).join("")}${diff.changed.map(item=>`<div class="diff-row changed"><b>變更 ${escapeHtml(item.operation.number)}</b><span>${item.fields.map(field=>fieldLabels[field]).join("、")}</span></div>`).join("")||`<div class="empty">兩個版本內容相同</div>`}</div>`;
  }

  function approvalPage(){
    if(window.ProcessAuthoringV3?.enabled())return `<section class="page approval-page v2 approval-page-lazy"></section>`;
    if(state.approvalTab!=='process')return `<section class="page approval-page v2 approval-page-lazy"></section>`;
    const selected=approvalVersions.find(item=>item.id===state.approvalVersionId)||approvalVersions[0],versions=selected?group(selected.category,selected.line):[],defaultBase=versions.find(item=>(item.number||0)<(selected?.number||0)),base=versions.find(item=>item.id===state.approvalCompareId)||defaultBase,errors=selected?validate(selected):[],back=selected?.status==="approved"?returnCheck(selected):null;if(base&&!state.approvalCompareId)state.approvalCompareId=base.id;
    return `<section class="page approval-page v2"><div class="approval-head"><div><p class="eyebrow">VERSION CONTROL & DIFF</p><h2>製程版本確認平台</h2><p>查看完整歷史、比對任意兩版，核准前自動檢查 BOM 與操作步驟。</p></div><div class="approval-stats"><span><b>${approvalVersions.length}</b>全部版本</span><span><b>${approvalVersions.filter(item=>item.status==="pending").length}</b>待確認</span><span><b>${approvalVersions.filter(item=>item.status==="approved").length}</b>目前核准</span></div></div><div class="approval-layout"><aside class="version-list">${approvalVersions.map(version=>{const versionsOfRoute=group(version.category,version.line),isLatest=versionsOfRoute[0]?.id===version.id,isProduction=approved(version.category,version.line)?.id===version.id;return `<button class="version-item ${selected?.id===version.id?"active":""}" data-v2-version="${version.id}"><span class="version-status ${version.status}">${statusLabels[version.status]||version.status}</span>${isLatest?`<i>最新版</i>`:""}${isProduction?`<i class="production">產線使用</i>`:""}<b>V${version.number} · ${escapeHtml(version.category)}</b><small>${version.line} 線 · ${escapeHtml(version.creatorName)}<br>${new Date(version.createdAt).toLocaleString("zh-TW")}</small></button>`}).join("")}</aside><section class="version-detail">${selected?`<header><div><code>VERSION ${selected.number}</code><h3>${escapeHtml(selected.category)} · ${selected.line} 線</h3><p>${escapeHtml(selected.creatorName)} 建立於 ${new Date(selected.createdAt).toLocaleString("zh-TW")}</p></div><span class="version-status ${selected.status}">${statusLabels[selected.status]||selected.status}</span></header><div class="approval-decision-strip"><span><small>案件狀態</small><b>${statusLabels[selected.status]||selected.status}</b></span><span class="${errors.length?"bad":"good"}"><small>確認前檢查</small><b>${errors.length?`${errors.length} 項需修正`:"完整，可確認"}</b></span><span><small>產線目前使用</small><b>V${approved(selected.category,selected.line)?.number||"—"}</b></span></div><div class="version-control-bar"><div class="field"><label>查看版本</label><select id="approval-current-version">${versions.map(version=>`<option value="${version.id}" ${version.id===selected.id?"selected":""}>V${version.number} · ${statusLabels[version.status]||version.status}</option>`).join("")}</select></div><div class="field"><label>比對版本（預設上一版）</label><select id="approval-compare-version"><option value="">不比對</option>${versions.filter(version=>version.id!==selected.id).map(version=>`<option value="${version.id}" ${version.id===base?.id?"selected":""}>V${version.number} · ${statusLabels[version.status]||version.status}</option>`).join("")}</select></div><button class="button ghost" data-edit-version="${selected.id}">回編輯台查看</button></div><section class="version-validation ${errors.length?"has-errors":"valid"}"><header><b>${errors.length?`確認前發現 ${errors.length} 項問題`:"確認前檢查通過"}</b><span>${errors.length?"修正後才能核准":"BOM 與操作流程完整"}</span></header>${errors.length?`<div>${errors.map(error=>`<article><b>${error.type==="bom"?"BOM 未使用完":error.type==="connection"?"流程線未連接":"缺少操作流程"}</b><span>${escapeHtml(error.message)}</span>${error.items?.length?`<small>${error.items.slice(0,8).map(escapeHtml).join("、")}${error.items.length>8?"…":""}</small>`:""}</article>`).join("")}</div>`:""}</section><section class="version-compare"><h4>版本差異：V${selected.number} ↔ ${base?`V${base.number}`:"無"}</h4>${diffHtml(selected,base)}</section><div class="version-stage-grid">${Object.entries(selected.stages||{}).map(([stageCode,operations])=>`<article class="version-stage"><header><code>${stageCode}</code><b>${escapeHtml(stageFor(stageCode)?.name||stageCode)} · ${operations.length} 個流程</b></header><div class="version-operations">${operations.map(operation=>`<div class="version-operation"><code>${escapeHtml(operation.number)}</code><b>${escapeHtml(operation.name)}</b><small>${stepsFor(operation).length} 步驟 · ${Object.values(operation.bomSelections||{}).flat().length} BOM · ${(operation.machineIds||[]).length} 設備</small></div>`).join("")}</div></article>`).join("")}</div><section class="version-history"><h4>確認歷史</h4>${(selected.history||[]).slice().reverse().map(item=>`<article><span>${new Date(item.at).toLocaleString("zh-TW")}</span><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.actor)}${item.note?` · ${escapeHtml(item.note)}`:""}</small></article>`).join("")}</section>${selected.reviewNote?`<div class="review-note"><b>最新修改要求</b><p>${escapeHtml(selected.reviewNote)}</p></div>`:""}${back?`<div class="approval-return-note ${back.allowed?"allowed":"blocked"}"><b>主管返回確認</b><span>${escapeHtml(back.reason)}</span></div>`:""}<div class="approval-actions-v2"><div class="field"><label>主管確認／退回原因</label><textarea id="review-note" placeholder="拒絕或要求修改時必須填寫原因"></textarea></div>${canApprove()&&selected.status==="pending"?`<button class="button ghost" data-version-action="reject">拒絕並反饋</button><button class="button signal" data-version-action="approve" ${errors.length?"disabled":""}>確認版本</button>`:""}${canApprove()&&selected.status==="approved"?`<button class="button ghost" data-version-action="request-change">要求建立修改版本</button><button class="button ghost danger" data-version-action="revoke" ${back?.allowed?"":"disabled"}>返回確認</button>`:""}${selected.status==="pending"&&(currentUser?.id===selected.creatorId||currentUser?.role==="admin")?`<button class="button ghost" data-version-action="withdraw">解除送審，繼續修改</button>`:""}${["draft","rejected"].includes(selected.status)?`<button class="button signal" data-edit-version="${selected.id}" data-revise="true">進入編輯台修改</button>`:""}</div>`:`<div class="empty">尚無版本資料</div>`}</section></div></section>`;
  }

  function productionProduct(product,lineCode,stageCode){const hasStage=(routeFor(product.code)?.stages||[]).includes(stageCode),version=approved(product.category,lineCode),operations=hasStage?(version?.stages?.[stageCode]||[]).filter(operation=>operation.productCodes?.includes(product.code)):[];return `<section class="device-product ${hasStage?"":"stage-not-applicable"}"><header><div><code>${product.code}</code><h3>${escapeHtml(product.name)}</h3><span>${escapeHtml(product.specification||"")}</span></div><b>${stageCode} · ${hasStage?(version?`V${version.number}`:"尚無核准版"):"不適用"}</b></header><div class="device-operation-grid">${hasStage?(operations.length?operations.map(operation=>playerOperationCard(operation,product)).join(""):`<div class="empty">此產品在已核准版本中尚無本工段流程</div>`):`<div class="empty">此產品沒有 ${escapeHtml(stageCode)} 工段</div>`}</div></section>`}
  function activeStageCodes(products,line){return line.stages.map(stage=>stage.code)}
  function initializePlayerSelection(){
    const available=statusLines(),first=state.playerSelectionActor!==currentUser?.id||!state.playerSelectionInitialized;
    let selected=available.find(line=>line.code===state.deviceLine);
    if(first&&currentUser?.role!=="device"){
      const active=available.filter(line=>(dispatchBoard[line.code]||[]).some(code=>data.products.some(product=>product.code===code)));
      if(active.length===1)selected=active[0];
    }
    selected ||= available[0];
    state.deviceLine=selected?.code||"";
    state.playerSelectionActor=currentUser?.id;state.playerSelectionInitialized=true;
    return {available,line:selected||{stages:[]}};
  }
  function playerPage(){const {available,line}=initializePlayerSelection(),products=(dispatchBoard[state.deviceLine]||[]).map(code=>data.products.find(product=>product.code===code)).filter(Boolean),stageCodes=activeStageCodes(products,line);if(!stageCodes.includes(state.deviceStage))state.deviceStage=stageCodes[0]||"";const matchingCount=products.filter(product=>(routeFor(product.code)?.stages||[]).includes(state.deviceStage)).length,stage=stageFor(state.deviceStage)||{name:state.deviceStage||"尚無工段"};return `<section class="page device-page"><button class="fullscreen-exit" id="fullscreen-exit" type="button" aria-label="退出全螢幕">退出全螢幕</button><div class="device-toolbar"><div><p class="eyebrow">APPROVED LINE MONITOR</p><h2>${state.deviceLine} 線 · ${escapeHtml(stage.name)}</h2><p>工段選單與後台產線同步；所有已發送產品都會顯示，不適用此工段時會明確標示。</p></div><div class="toolbar"><div class="field"><label>線別</label><select id="device-line">${available.map(item=>`<option value="${item.code}" ${item.code===state.deviceLine?"selected":""}>${item.code} 線 · ${escapeHtml(item.name)}</option>`).join("")}</select></div><div class="field"><label>工段</label><select id="device-stage" ${stageCodes.length?"":"disabled"}>${stageCodes.map(code=>`<option value="${code}" ${code===state.deviceStage?"selected":""}>${code} · ${escapeHtml(stageFor(code)?.name||code)}</option>`).join("")}</select></div><button class="button ghost" id="fullscreen">全螢幕</button></div></div><div class="device-live-strip"><span>● LIVE · APPROVED ONLY</span><b>${matchingCount}/${products.length} 項產品包含此工段</b><small id="board-clock">--:--</small></div>${products.length?`<div class="device-products">${products.map(product=>productionProduct(product,state.deviceLine,state.deviceStage)).join("")}</div>`:`<div class="device-empty"><b>此線尚未發送產品</b><p>請從發送介面選擇最多三項產品。</p></div>`}</section>`}

  function bindApproval(){
    document.querySelectorAll("[data-v2-version]").forEach(button=>button.onclick=()=>{state.approvalVersionId=button.dataset.v2Version;state.approvalCompareId=null;render()});
    document.querySelector("#approval-current-version")?.addEventListener("change",event=>{state.approvalVersionId=event.target.value;state.approvalCompareId=null;render()});
    document.querySelector("#approval-compare-version")?.addEventListener("change",event=>{state.approvalCompareId=event.target.value;render()});
    document.querySelectorAll("[data-edit-version]").forEach(button=>button.onclick=()=>{const version=approvalVersions.find(item=>item.id===button.dataset.editVersion);if(!version)return;state.category=version.category;state.editorLine=version.line;state.editorVersionId=button.dataset.revise?`revision:${version.id}`:version.id;state.editorByCategory[`${version.category}:${version.line}`]=deepCopy(version.stages);state.selectedOperation=Object.values(version.stages||{}).flat()[0]?.id||null;navigate("editor")});
    document.querySelectorAll("[data-version-action]").forEach(button=>button.onclick=()=>{
      const version=approvalVersions.find(item=>item.id===state.approvalVersionId)||approvalVersions[0];
      return changeVersionStatus(version,button.dataset.versionAction,document.querySelector('#review-note')?.value.trim()||'');
    });
  }

  let changingVersion=false;
  const workflowFailure='版本尚未完成伺服器儲存，內容與原狀態已保留。請確認連線後重試；衝突或登入失效需先重新登入確認。';
  async function commitVersionChange(change,success){
    if(changingVersion||savingEditorVersion)return false;
    changingVersion=true;
    const controls=[...document.querySelectorAll('#submit-version,[data-version-action],.direct-withdraw,#save-process,#logout-button')];
    const disabled=controls.map(button=>button.disabled);controls.forEach(button=>button.disabled=true);
    const panels=[document.querySelector('#view-root'),document.querySelector('#main-nav')].filter(Boolean);
    panels.forEach(panel=>{panel.inert=true;panel.setAttribute('aria-busy','true');});
    const before=deepCopy(approvalVersions),prior=localStorage.getItem('approvalVersions');
    try{
      // Finish prior workspace writes before staging a status transition.
      if(await window.ProcessSync?.flush?.()!==true)throw Error('Workspace not saved');
      change();
      const staged=JSON.stringify(approvalVersions);
      // Production views keep reading the confirmed status while the request runs.
      approvalVersions=deepCopy(before);
      localStorage.setItem('approvalVersions',staged);
      if(await window.ProcessSync?.flush?.()!==true)throw Error('Version not saved');
      approvalVersions=JSON.parse(staged);toast(success);return true;
    }catch{
      approvalVersions=before;
      window.ProcessSync?.discardPending?.('approvalVersions',prior);
      toast(workflowFailure);return false;
    }finally{
      changingVersion=false;controls.forEach((button,index)=>button.disabled=disabled[index]);panels.forEach(panel=>{panel.inert=false;panel.removeAttribute('aria-busy');});render();
    }
  }
  async function changeVersionStatus(version,action,note=''){
    if(!version||changingVersion)return false;
    const permission={approve:'approval.approve',reject:'approval.reject','request-change':'approval.requestChange',revoke:'approval.revoke',withdraw:'approval.withdraw'}[action];
    if(!permission||!(currentUser?.role==='admin'||currentUser?.permissions?.includes(permission)))return false;
    if(['approve','reject','withdraw'].includes(action)&&version.status!=='pending')return false;
    if(['request-change','revoke'].includes(action)&&version.status!=='approved')return false;
    if(['reject','request-change'].includes(action)&&!note){toast('請先填寫要求修改或拒絕原因');return false;}
    if(action==='approve'){const errors=validate(version);if(errors.length){toast(`尚有 ${errors.length} 項確認錯誤，無法核准`);return false;}}
    const back=action==='revoke'?returnCheck(version):null;
    if(back&&!back.allowed){toast(back.reason);return false;}
    if(back&&!confirm(`返回確認 V${version.number}？產線會先恢復 V${back.fallback.number}，本版回到主管審核中。`))return false;
    return commitVersionChange(()=>{
      if(action==='approve'){
        approvalVersions.filter(item=>item.category===version.category&&item.line===version.line&&item.status==='approved'&&item.id!==version.id).forEach(item=>item.status='superseded');
        version.status='approved';version.reviewNote=note||'版本內容確認完成';version.reviewerName=currentUser.name;version.reviewedAt=new Date().toISOString();history(version,'approved','確認核准',version.reviewNote);
      }
      if(action==='reject'){version.status='rejected';version.reviewNote=note;history(version,'rejected','拒絕並要求修改',note);}
      if(action==='request-change'){version.reviewNote=note;version.changeRequested=true;history(version,'change_requested','已核准版本要求建立修訂',note);}
      if(back){back.fallback.status='approved';history(back.fallback,'restored','恢復為產線使用版本',`V${version.number} 返回確認`);version.status='pending';version.reviewNote=note||'主管返回確認，等待重新確認';history(version,'approval_revoked','主管返回確認',`暫時恢復 V${back.fallback.number}`);}
      if(action==='withdraw'){version.status='draft';history(version,'withdrawn','編輯者解除送審','繼續修改中');}
      version.updatedAt=new Date().toISOString();
    },'版本狀態已更新');
  }
  window.ProcessVersionActions={changeVersionStatus};

  const issueActionLabel=error=>error.type==='connection'?'前往建立連線':error.type==='instruction'?'前往補寫作業說明':error.type==='content'?'前往填寫基本資料':error.type==='bom'?'前往分配 BOM':'前往建立流程';
  function showConnectionGuide(error,op){
    const canvas=document.querySelector(`[data-stage-canvas="${CSS.escape(error.stageCode||'')}"]`);
    if(!canvas||!op)return;
    const operations=ensureCategoryEditor()[error.stageCode]||[],sourceBlock=canvas.querySelector(`[data-operation="${CSS.escape(op.id)}"]`),
      candidates=operations.filter(target=>target.id!==op.id&&!op.nextIds?.includes(target.id)&&!wouldCreateCycle(operations,op.id,target.id)),
      target=candidates.find(item=>(item.nextIds||[]).length)||candidates[0],targetBlock=target?canvas.querySelector(`[data-operation="${CSS.escape(target.id)}"]`):null;
    sourceBlock?.classList.add('connection-guide-source');targetBlock?.classList.add('connection-guide-target');
    const notice=document.createElement('section');notice.className='connection-guide-notice';
    const needsCleanup=(op.nextIds||[]).length>1||((op.nextIds||[]).length&&!(op.nextIds||[]).every(id=>operations.some(item=>item.id===id)));
    notice.innerHTML=`<div><b>請建立連線</b><span>${needsCleanup?'先點擊錯誤或多餘的既有連線刪除，再重新連線。':'按住紅色提示方塊右側的圓點，拖到綠色提示方塊後放開。虛線只是操作示範，不會自動修改資料。'}</span></div><button type="button" aria-label="關閉連線示範">×</button>`;
    canvas.before(notice);notice.querySelector('button').onclick=()=>{notice.remove();canvas.querySelector('.connection-guide-overlay')?.remove();sourceBlock?.classList.remove('connection-guide-source');targetBlock?.classList.remove('connection-guide-target')};
    if(target&&!needsCleanup){
      const inner=canvas.querySelector('.flow-zoom-content')||canvas,from=operationGeometry(op,0),to=operationGeometry(target,0),token=String(error.stageCode||'stage').replace(/[^a-z0-9-]/gi,'-');
      inner.insertAdjacentHTML('beforeend',`<svg class="connection-guide-overlay" aria-hidden="true"><defs><marker id="guide-arrow-${token}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs><path d="M ${from.x+264} ${from.y+92} C ${from.x+330} ${from.y+92}, ${to.x-66} ${to.y+92}, ${to.x} ${to.y+92}" marker-end="url(#guide-arrow-${token})"></path><text x="${Math.max(8,(from.x+to.x+264)/2-52)}" y="${Math.max(18,(from.y+to.y)/2+70)}">按住圓點拖到這裡</text></svg>`);
    }
    notice.scrollIntoView({block:'center',behavior:'smooth'});toast('已帶到需要處理的工段，畫面會示範連線方向');
  }
  function navigateIssue(error){
    const product=data.products.find(p=>p.code===error.productCode);
    if(product){state.category=product.category;state.editorLine=routeFor(product.code).line;state.editorProblemProduct=product.code;}
    const ops=ensureCategoryEditor()[error.stageCode]||[],op=ops.find(o=>o.id===(error.operationId||error.operationIds?.[0]))||ops.find(o=>o.productCodes?.includes(error.productCode))||ops[0];
    if(!op&&error.type==='stage'){state.editorProblemPlaceholder={stageCode:error.stageCode,productCode:error.productCode};state.focusDiagnosticAfterRender=true;state.addingStage=error.stageCode}else state.editorProblemPlaceholder=null;
    state.selectedOperation=op?.id||null;state.editorProblemStage=error.stageCode;state.skipEditorViewportRestore=true;render();
    const stage=[...document.querySelectorAll('[data-stage-canvas]')].find(el=>el.dataset.stageCanvas===error.stageCode);
    stage?.classList.add('problem-target');
    if(error.type==='connection'&&op){showConnectionGuide(error,op);return;}
    stage?.scrollIntoView({block:'center',behavior:'smooth'});
    if(op){window.ProcessOpenOperation?.(op);const checkbox=[...document.querySelectorAll('[data-operation-product]')].find(el=>el.dataset.operationProduct===error.productCode);checkbox?.closest('label')?.classList.add('validation-field-error');const field=error.type==='bom'?document.querySelector('.bom-groups'):error.type==='instruction'?document.querySelector('.step-editor[data-step-kind="general"]'):null;field?.classList.add('validation-field-error');(field||checkbox)?.scrollIntoView?.({block:'center'});}
    else {document.querySelector('[data-diagnostic-placeholder]')?.scrollIntoView({block:'center',behavior:'smooth'});toast('已用暫時方塊標出缺少位置；請從上方選擇流程建立。暫時方塊不會寫入正式資料');}
  }
  function renderSubmissionIssues(panel, errors) {
    const previous=panel.querySelector('.editor-submit-issues');
    const opened=new Set([...(previous?.querySelectorAll('details[open]')||[])].map(el=>el.dataset.issueGroup));
    previous?.remove();state.editorSubmissionErrors=errors;
    const summary=document.createElement('section');summary.className='editor-submit-issues '+(errors.length?'has-errors':'resolved');
    const labels={stage:'缺少適用流程',bom:'BOM 未分配',connection:'流程連線',instruction:'作業說明',content:'基本資料'};
    const types=Object.groupBy(errors,error=>error.type);
    const reasons={stage:'已在至少一個方塊勾選的產品，其正式路線必要工段沒有任何方塊套用該產品。',bom:'參與產品的全部適用流程方塊合併後，仍有根層 BOM 料號尚未被勾選。',connection:'流程有孤立方塊、失效連線，或同時連到多個下一流程。',instruction:'流程缺少操作步驟或完成標準。',content:'流程缺少名稱，或機器流程尚未選擇設備。'};
    summary.innerHTML=errors.length?`<details data-issue-group="all" ${opened.has('all')?'open':''}><summary>送審前有 ${errors.length} 項問題 · 查看問題</summary><section class="issue-reason-guide"><b>目前無法送審的原因</b><p>下列數字是實際尚未完成的資料，不是系統故障；BOM 數字代表有問題的產品數量。</p><ul>${Object.entries(types).map(([type,items])=>`<li><strong>${labels[type]||'其他問題'}：${items.length}${type==='bom'?' 個產品':''}</strong><span>${reasons[type]||'請展開查看詳細原因。'}</span></li>`).join('')}</ul></section>${validationRulesMarkup('查看全部報錯規範（9 項）')}${Object.entries(types).map(([type,items])=>{
      const products=Object.groupBy(items,error=>error.productCode||'流程設定');
      return `<details data-issue-group="${type}" ${opened.has(type)?'open':''}><summary>${labels[type]||'其他問題'}：${items.length}${type==='bom'?' 個產品':''}</summary>${Object.entries(products).map(([code,list])=>{
        const key=type+':'+code,product=data.products.find(p=>p.code===code),stages=[...new Set(list.map(e=>e.stageCode).filter(Boolean))];
        const first=list[0];
        const missingBomCount=type==='bom'?new Set(list.flatMap(error=>error.items||[]).map(item=>String(item).trim().toUpperCase())).size:0;
        return `<section class="issue-product-row"><details data-issue-group="${escapeHtml(key)}" ${opened.has(key)?'open':''}><summary>${escapeHtml(code)} ${escapeHtml(product?.name||'')} · ${type==='bom'?`缺 ${missingBomCount} 個料號`:`${list.length} 項`}</summary>${type==='stage'?`<p>此產品需要經過 ${escapeHtml(stages.join('／'))} 等工段，但該工段目前沒有任何流程方塊套用此產品。</p>`:''}${list.map(error=>`<article><div class="issue-detail"><p>${type==='bom'?`此產品在所有適用流程方塊中，還有 ${error.items.length} 個根層 BOM 料號未被勾選。`:escapeHtml(error.message)}</p>${type==='bom'?missingBomItemsMarkup(error):''}</div><button type="button" data-submit-error="${errors.indexOf(error)}">${issueActionLabel(error)}${error.stageCode?' · '+escapeHtml(error.stageCode):''}</button></article>`).join('')}</details><button type="button" class="issue-quick-action" data-submit-error="${errors.indexOf(first)}">${issueActionLabel(first)}</button></section>`;
      }).join('')}</details>`;
    }).join('')}</details>`:'<b>✓ 先前問題皆已修正，可以重新送審</b>';
    panel.querySelector('#submit-version')?.before(summary);
    summary.querySelectorAll('[data-submit-error]').forEach(button=>button.onclick=()=>navigateIssue(errors[Number(button.dataset.submitError)]));
  }
  function refreshSubmissionIssues(){const panel=document.querySelector('.editor-version-panel');if(panel&&state.editorSubmissionVersionId===state.editorVersionId)renderSubmissionIssues(panel,validate({category:state.category,line:state.editorLine,stages:ensureCategoryEditor()}));}
  document.addEventListener?.('change',event=>{if(event.target.closest('#inspector-form'))setTimeout(refreshSubmissionIssues,0);},true);
  function editorVersionPanel(){
    if(localStorage.getItem('processAuthoringControl'))return;
    const versions=group(),selected=approvalVersions.find(item=>item.id===state.editorVersionId),base=selected?versions.find(item=>(item.number||0)<selected.number):null,locked=currentUser?.role==="rd"||["approved","superseded","rejected"].includes(selected?.status);
    const canCreateRevision=selected?.status==="approved"&&currentUser?.role!=="rd";
    const heading=selected?.status==="draft"?`正在編輯 V${selected.number} 草稿`:selected?.status==="pending"?`V${selected.number} 已送主管審核`:selected?.status==="approved"?`正在查看已核准 V${selected.number}`:selected?`正在查看 V${selected.number}`:"目前工作內容";
    const panel=document.createElement("section");panel.className=`editor-version-panel ${locked?"locked":""}`;panel.innerHTML=`<div><p class="eyebrow">VERSION WORKSPACE</p><h3>${heading} ${selected?`<span class="version-status ${selected.status}">${statusLabels[selected.status]}</span>`:""}</h3><small>${selected?.status==="draft"?"尚未送審，可反覆儲存":locked?"此版本已鎖定":"先儲存草稿，再送主管審核"}</small></div><div class="field"><label>切換版本</label><select id="editor-version-select"><option value="">目前工作內容</option>${versions.map(version=>`<option value="${version.id}" ${version.id===state.editorVersionId?"selected":""}>V${version.number} · ${statusLabels[version.status]}${versions[0]?.id===version.id?" · 最新版":""}</option>`).join("")}</select></div>${selected?`<div class="editor-mini-diff"><b>與${base?` V${base.number}`:"上一版"}差異</b>${diffHtml(selected,base)}</div>`:""}${selected?.status==="draft"?`<button class="button signal" id="submit-version">送出主管審核</button>`:""}${canCreateRevision?`<button class="button signal" id="create-revision">建立新版本草稿</button>`:""}${validationRulesMarkup()}`;
    document.querySelector(".editor-toolbar")?.after(panel);
    const legacyKey=`processEditor:${editorKey()}`;
    if(window.ProcessSync?.legacyDraftKeys?.().includes(legacyKey)&&currentUser?.role!=="rd"&&currentUser?.role!=="viewer"&&(!selected||selected.status==="draft"||canCreateRevision)){
      const recover=document.createElement('button');recover.type='button';recover.className='button ghost';recover.textContent='復原此瀏覽器的舊草稿';
      recover.onclick=()=>{if(!confirm('將舊草稿復原到目前工作區？伺服器內容及舊暫存會保留，直到您儲存並核對完整。'))return;
        const saved=window.ProcessSync.readLegacyDraft(legacyKey);if(!saved)return;
        state.editorByCategory[editorKey()]=deepCopy(saved.stages);if(canCreateRevision)state.editorVersionId=`revision:${selected.id}`;
        toast('舊草稿已復原到目前工作區；請儲存並核對完整後再關閉。');render();};panel.append(recover);
    }
    const showSubmissionErrors=selected?.status==="draft"&&state.editorSubmissionVersionId===selected.id,currentErrors=showSubmissionErrors?validate({category:state.category,line:state.editorLine,stages:ensureCategoryEditor()}):[];
    if(showSubmissionErrors) renderSubmissionIssues(panel,currentErrors);
    currentErrors.flatMap(error=>error.operationIds||[]).forEach(id=>{const block=document.querySelector(`[data-operation="${id}"]`);if(block&&!block.querySelector(".operation-error-badge")){block.classList.add("validation-error");block.insertAdjacentHTML("beforeend",`<span class="operation-error-badge">!</span>`)}});
    panel.querySelector("#editor-version-select").onchange=event=>{const version=approvalVersions.find(item=>item.id===event.target.value);state.editorVersionId=event.target.value||null;if(version){state.editorByCategory[editorKey()]=deepCopy(version.stages);state.selectedOperation=Object.values(version.stages||{}).flat()[0]?.id||null}else{const saved=readStore(`processEditor:${editorKey()}`,null);if(saved?.stages)state.editorByCategory[editorKey()]=deepCopy(saved.stages)}render()};
    panel.querySelector("#create-revision")?.addEventListener("click",()=>{state.editorVersionId=`revision:${selected.id}`;state.editorByCategory[editorKey()]=deepCopy(selected.stages);toast(`已由 V${selected.number} 建立新版本草稿`);render()});
    panel.querySelector("#submit-version")?.addEventListener("click",submitEditorVersion);
    const save=document.querySelector("#save-process");if(save){save.textContent=selected?.status==="draft"?`儲存 V${selected.number} 草稿`:state.editorVersionId?.startsWith("revision:")?"儲存為新版本草稿":"建立第一版草稿";save.onclick=saveEditorVersion}
    if(locked){document.querySelector(".editor-page")?.classList.add("editor-readonly");document.querySelectorAll(".add-operation,.auto-layout-stage,.arrange-all-stages,.operation-delete,#save-process").forEach(element=>{element.disabled=true;element.style.pointerEvents="none"});document.querySelectorAll(".operation-block").forEach(block=>block.setAttribute("draggable","false"));document.querySelectorAll("#inspector-form input,#inspector-form select,#inspector-form textarea,#inspector-form button").forEach(element=>element.disabled=true)}
  }

  let savingEditorVersion=false;
  async function saveEditorVersion(){
    if(window.ProcessAuthoringV3?.enabled())return window.ProcessAuthoringV3.save();
    if(savingEditorVersion||changingVersion)return;
    savingEditorVersion=true;
    const save=document.querySelector('#save-process');if(save)save.disabled=true;
    try{
      const stages=deepCopy(ensureCategoryEditor()),now=new Date().toISOString(),selected=group().find(item=>item.id===state.editorVersionId),isRevision=String(state.editorVersionId||"").startsWith("revision:"),parentId=isRevision?String(state.editorVersionId).split(":")[1]:null;
      localStorage.setItem(`processEditor:${editorKey()}`,JSON.stringify({category:state.category,line:state.editorLine,stages,savedAt:now}));if(selected?.status==="draft"){selected.stages=stages;selected.updatedAt=now;history(selected,"draft_saved","草稿已儲存");state.approvalVersionId=selected.id}else{const versions=group(),version={id:`PV-${crypto.randomUUID()}`,number:Math.max(0,...versions.map(item=>item.number||0))+1,category:state.category,line:state.editorLine,stages,createdAt:now,updatedAt:now,creatorId:currentUser?.id||"local",creatorName:currentUser?.name||"本機使用者",status:"draft",parentVersionId:parentId,history:[]};history(version,"draft_created",parentId?"新修訂草稿建立":"版本草稿建立");approvalVersions.unshift(version);state.editorVersionId=version.id;state.approvalVersionId=version.id}persistPlatform();
      const saved=await window.ProcessSync?.flush?.();
      if(saved!==true)toast(window.ProcessSync?.saveFailureMessage?.() || "草稿尚未完成伺服器儲存，內容保留在目前頁面。請勿關閉；確認連線後再次儲存。");
      else toast("草稿已儲存，可檢查後再送審");
    }catch(error){console.warn('Process draft save failed',error);toast(window.ProcessSync?.saveFailureMessage?.() || "草稿尚未完成伺服器儲存，內容保留在目前頁面。請勿關閉；確認連線後再次儲存。");}
    finally{savingEditorVersion=false;if(save)save.disabled=false;render();}
  }

  function submitEditorVersion(){
    if(changingVersion||savingEditorVersion)return;
    const version=approvalVersions.find(item=>item.id===state.editorVersionId);if(!version||version.status!=="draft")return;
    version.stages=deepCopy(ensureCategoryEditor());const errors=validate(version);if(errors.length){state.editorSubmissionVersionId=version.id;state.editorSubmissionErrors=errors;toast(`草稿尚有 ${errors.length} 項問題，請查看送審按鈕旁的原因`);render();return}
    if(group().some(item=>item.status==='pending'&&item.id!==version.id))return;
    if(!confirm(document.documentElement.lang==='vi'?'Gửi duyệt phiên bản quy trình? Sau khi gửi sẽ không thể chỉnh sửa cho đến khi rút hoặc được trả lại.':'確定送出製程版本審核？送審後將無法編輯，須先撤回或發回。'))return;
    state.editorSubmissionVersionId=null;state.editorSubmissionErrors=[];
    return commitVersionChange(()=>{version.status='pending';version.updatedAt=new Date().toISOString();history(version,'submitted','草稿送出確認');state.approvalVersionId=version.id;},`V${version.number} 已送出確認`);
  }

  function stepEditorHtml(title,steps,kind,productCode=""){
    const rows=steps.length?steps:[{text:"",standard:""}];return `<section class="step-editor" data-step-kind="${kind}" data-product-code="${productCode}"><header><div><b>${title}</b><small>完成一個步驟與標準後，才能建立下一個</small></div><span>${steps.filter(step=>step.text?.trim()).length} 步</span></header><div class="step-list">${rows.map((step,index)=>`<article><i>${index+1}</i><div class="field"><label>操作內容</label><textarea data-step-text="${index}" placeholder="第 ${index+1} 步要做什麼">${escapeHtml(step.text||"")}</textarea></div><div class="field"><label>需要達到的標準</label><textarea data-step-standard="${index}" placeholder="完成後要符合什麼標準">${escapeHtml(step.standard||"")}</textarea></div>${index?`<button type="button" data-remove-step="${index}">×</button>`:""}</article>`).join("")}</div><button type="button" class="button ghost add-step" ${rows.at(-1)?.text?.trim()&&rows.at(-1)?.standard?.trim()?"":"disabled"}>＋ 完成並建立下一步</button></section>`}
  function productMediaEditorHtml(operation,productCode){
    const items=operation.productMediaItems?.[productCode]||[];
    return `<section class="product-media-editor" data-product-media-editor="${escapeHtml(productCode)}"><header><div><b>${escapeHtml(productCode)} 專用照片與影片</b><small>只顯示在這個產品的核准製程內容，點擊縮圖可放大查看。</small></div><div class="product-media-head-actions"><span>${items.length} 個媒體</span><label class="button ghost product-media-upload"><input type="file" data-product-media-input="${escapeHtml(productCode)}" accept="image/*,video/*" multiple>＋ 增加照片／影片</label></div></header><div class="product-media-layout"><div class="inspector-media-grid media-count-${Math.min(items.length,4)}">${items.map((item,index)=>`<figure><button type="button" class="inspector-media-preview" data-lightbox-src="${escapeHtml(item.src)}" data-lightbox-type="${escapeHtml(item.type||'image/jpeg')}" data-lightbox-title="${escapeHtml(item.name||productCode)}" data-lightbox-group="product-${escapeHtml(operation.id||operation.number)}-${escapeHtml(productCode)}">${item.type?.startsWith('video/')?'<span class="media-video-mark">▶ 影片</span>':`<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.name||productCode)}">`}</button><button type="button" data-remove-product-media="${index}" data-product-code="${escapeHtml(productCode)}">×</button><figcaption>${escapeHtml(item.name||`照片 ${index+1}`)}</figcaption></figure>`).join('')}</div></div></section>`;
  }
  function enhanceInspector(operation){
    if(!operation)return;operation.instructionSteps=operation.instructionSteps||stepsFor(operation);operation.productInstructionSteps=operation.productInstructionSteps||{};operation.productMediaItems=operation.productMediaItems||{};const productBox=document.querySelector(".product-multi"),productList=productBox?.querySelector(".product-multi-list");if(productBox&&productList){const search=document.createElement("input");search.className="inspector-filter";search.placeholder="搜尋產品編號或名稱";search.oninput=()=>productList.querySelectorAll("label").forEach(label=>label.hidden=!label.textContent.toLowerCase().includes(search.value.toLowerCase()));productBox.insertBefore(search,productList)}
    state.openBomGroups=state.openBomGroups||{};const openGroups=state.openBomGroups[operation.id]||[];document.querySelectorAll(".bom-product-group").forEach((card,index)=>{const code=card.dataset.bomGroup,shouldOpen=openGroups.length?openGroups.includes(code):index===0;card.classList.toggle("collapsed",!shouldOpen);card.querySelector("header").onclick=event=>{if(event.target.closest("button"))return;card.classList.toggle("collapsed");state.openBomGroups[operation.id]=[...document.querySelectorAll(".bom-product-group:not(.collapsed)")].map(item=>item.dataset.bomGroup)}});
    const general=document.querySelector("#operation-instructions")?.closest(".field");if(general){general.classList.add("legacy-instructions");general.insertAdjacentHTML("afterend",stepEditorHtml("共用操作流程",operation.instructionSteps,"general"))}const product=document.querySelector("#operation-product-instructions")?.closest(".field");if(product&&operation.noteProductCode){operation.productInstructionSteps[operation.noteProductCode]=operation.productInstructionSteps[operation.noteProductCode]||stepsFor(operation,operation.noteProductCode);operation.productMediaItems[operation.noteProductCode]=operation.productMediaItems[operation.noteProductCode]||[];product.classList.add("legacy-instructions");product.insertAdjacentHTML("afterend",stepEditorHtml(`${operation.noteProductCode} 專用補充流程`,operation.productInstructionSteps[operation.noteProductCode],"product",operation.noteProductCode)+productMediaEditorHtml(operation,operation.noteProductCode))}bindStepEditor(operation);bindProductMediaEditor(operation);
    const selected=approvalVersions.find(item=>item.id===state.editorVersionId),showErrors=selected?.status==="draft"&&state.editorSubmissionVersionId===selected.id,errors=showErrors?validate({category:state.category,line:state.editorLine,stages:ensureCategoryEditor()}).filter(error=>(error.operationIds||[]).includes(operation.id)):[];if(errors.length){const notice=document.createElement("section");notice.className="inspector-validation";notice.innerHTML=`<b>此流程需補 ${errors.length} 項資料</b>${errors.map(error=>`<p>${escapeHtml(error.message)}</p>`).join("")}`;document.querySelector("#inspector-form .inspector-form")?.prepend(notice);const selectors={name:"#operation-name",products:".product-multi",machines:".machine-fields",instructions:'.step-editor[data-step-kind="general"]',bom:".bom-groups"};errors.forEach(error=>{const field=document.querySelector(selectors[error.field]);field?.classList.add("validation-field-error")})}
    const locked=currentUser?.role==="rd"||["approved","superseded","rejected"].includes(selected?.status);if(locked)document.querySelectorAll("#inspector-form input,#inspector-form select,#inspector-form textarea,#inspector-form button").forEach(element=>element.disabled=true)
  }
  function bindStepEditor(operation){document.querySelectorAll(".step-editor").forEach(editor=>{const isProduct=editor.dataset.stepKind==="product",code=editor.dataset.productCode,list=isProduct?(operation.productInstructionSteps[code]||[]):operation.instructionSteps;const sync=()=>{editor.querySelectorAll("[data-step-text]").forEach(input=>{const index=Number(input.dataset.stepText);list[index]=list[index]||{text:"",standard:""};list[index].text=input.value});editor.querySelectorAll("[data-step-standard]").forEach(input=>{const index=Number(input.dataset.stepStandard);list[index]=list[index]||{text:"",standard:""};list[index].standard=input.value});operation.instructions=operation.instructionSteps.map((step,index)=>`${index+1}. ${step.text}｜標準：${step.standard}`).join("\n");if(isProduct)operation.productInstructions[code]=list.map((step,index)=>`${index+1}. ${step.text}｜標準：${step.standard}`).join("\n")};editor.querySelectorAll("textarea").forEach(input=>input.oninput=()=>{sync();const last=list.at(-1);editor.querySelector(".add-step").disabled=!(last?.text?.trim()&&last?.standard?.trim())});editor.querySelector(".add-step").onclick=()=>{sync();list.push({text:"",standard:""});renderInspector(operation)};editor.querySelectorAll("[data-remove-step]").forEach(button=>button.onclick=()=>{list.splice(Number(button.dataset.removeStep),1);renderInspector(operation)})})}
  function bindProductMediaEditor(operation){
    document.querySelectorAll('[data-product-media-input]').forEach(input=>input.onchange=async event=>{const code=input.dataset.productMediaInput,files=[...(event.target.files||[])];if(!code||!files.length)return;try{const {items,compressedCount}=await prepareMediaUploads(files);operation.productMediaItems[code]=operation.productMediaItems[code]||[];operation.productMediaItems[code].push(...items);if(compressedCount)toast('照片已自動壓縮後加入');renderInspector(operation)}catch(error){console.warn('產品媒體上傳失敗',error);toast('照片處理失敗，請改用 JPG、PNG 或 WebP')}});
    document.querySelectorAll('[data-remove-product-media]').forEach(button=>button.onclick=()=>{const code=button.dataset.productCode,list=operation.productMediaItems?.[code];if(!Array.isArray(list))return;list.splice(Number(button.dataset.removeProductMedia),1);renderInspector(operation)});
  }

  function dispatchPage(){const line=lineFor(state.dispatchPreviewLine||"A"),products=(dispatchBoard[line.code]||[]).map(code=>data.products.find(product=>product.code===code)).filter(Boolean),stageCodes=activeStageCodes(products,line);if(!stageCodes.includes(state.dispatchPreviewStage))state.dispatchPreviewStage=stageCodes[0]||"";return `${dispatch()}<section class="page dispatch-live-preview"><div class="dispatch-head"><div><p class="eyebrow">SAME AS LINE DISPLAY</p><h2>產線播放內容監控</h2><p>監控工段與後台產線同步；每項已發送產品都會顯示，不屬於該產品路線的工段會標示為不適用。</p></div><div class="toolbar"><div class="field"><label>監控線別</label><select id="dispatch-preview-line">${lines.map(item=>`<option value="${item.code}" ${item.code===line.code?"selected":""}>${item.code} 線</option>`).join("")}</select></div><div class="field"><label>監控工段</label><select id="dispatch-preview-stage" ${stageCodes.length?"":"disabled"}>${stageCodes.map(code=>`<option value="${code}" ${code===state.dispatchPreviewStage?"selected":""}>${code} · ${escapeHtml(stageFor(code)?.name||code)}</option>`).join("")}</select></div></div></div><div class="production-board compact-monitor">${products.length?products.map(product=>productionProduct(product,line.code,state.dispatchPreviewStage)).join(""):`<div class="device-empty">此線尚未發送產品</div>`}</div></section>`}
  const originalBindView=bindView,originalBindEditor=bindEditor,originalRenderInspector=renderInspector,originalProductStatus=productStatus;
  function productStatusPage(){
    const product=selectedStatusProduct();
    if(!product)return `<section class="page status-page"><div class="toolbar status-filters">${productStatusSelects()}</div><p class="empty">此線別沒有可查看的產品</p></section>`;
    const route=routeFor(product.code),version=approved(product.category,route?.line||product.line||state.statusLine);
    const category=state.category,line=state.editorLine,workspace=state.editorByCategory,productCode=state.productCode;
    // Production rendering must never replace an in-progress editor workspace.
    state.editorByCategory={...workspace};
    try{
      state.category=product.category;state.editorLine=state.statusLine;state.productCode=product.code;
      state.editorByCategory[`${product.category}:${state.statusLine}`]={};
      if(version){state.category=version.category;state.editorLine=version.line;state.editorByCategory[`${version.category}:${version.line}`]=deepCopy(version.stages)}
      return originalProductStatus();
    }finally{state.category=category;state.editorLine=line;state.editorByCategory=workspace;state.productCode=productCode}
  }
  render=function(){root.innerHTML=({dashboard,player:playerPage,dispatch:dispatchPage,editor,productStatus:productStatusPage,approval:approvalPage,data:dataView})[state.view]();bindView()};
  bindView=function(){originalBindView();if(state.view==="player")document.querySelector("#fullscreen-exit")?.addEventListener("click",()=>document.exitFullscreen?.());if(state.view==="approval")bindApproval();if(state.view==="dispatch"){document.querySelectorAll(".publish-line").forEach(button=>button.onclick=async()=>{const card=button.closest("[data-dispatch-line]"),lineCode=button.dataset.line,codes=[...card.querySelectorAll("[data-dispatch-slot]")].map(select=>select.value).filter(Boolean);if(new Set(codes).size!==codes.length){toast("同一條線不能重複發送相同產品");return}const failures=codes.map(code=>({code,...dispatchReadiness(code,lineCode)})).filter(item=>!item.ok);if(failures.length){const details=[...new Set(failures.flatMap(item=>item.errors.slice(0,2).map(error=>error.message)))].slice(0,4).join("；");toast(`無法發送：${details}。請更新製程編輯台資料並重新送審。`);return}button.disabled=true;try{dispatchBoard[lineCode]=codes.slice(0,3);persistPlatform();if(window.ProcessSync&&!(await window.ProcessSync.flush())){toast(window.ProcessSync.saveFailureMessage());return}toast(`${lineCode} 線已發送 ${codes.length} 項產品`);render()}catch{toast(window.ProcessSync?.saveFailureMessage?.()||"發送未完成，請保留目前選擇並重試")}finally{button.disabled=false}});document.querySelector("#dispatch-preview-line")?.addEventListener("change",event=>{state.dispatchPreviewLine=event.target.value;const products=(dispatchBoard[state.dispatchPreviewLine]||[]).map(code=>data.products.find(product=>product.code===code)).filter(Boolean);state.dispatchPreviewStage=activeStageCodes(products,lineFor(state.dispatchPreviewLine))[0]||"";render()});document.querySelector("#dispatch-preview-stage")?.addEventListener("change",event=>{state.dispatchPreviewStage=event.target.value;render()})}};
  bindEditor=function(){originalBindEditor();if(editorSelectionReady())editorVersionPanel()};
  renderInspector=function(operation){originalRenderInspector(operation);enhanceInspector(operation)};
  window.ProcessVersionValidation={validate,dispatchReadiness,approved,refreshIssues:refreshSubmissionIssues};
  // Examples belong to unprotected legacy demos. Protected workspaces never seed
  // versions or dispatch defaults during startup.
  if(!window.ProcessSync?.protected){seedSamples();if(!(dispatchBoard.A||[]).length)dispatchBoard.A=data.products.filter(product=>product.category==="BORUAXE1021").slice(0,3).map(product=>product.code);persistPlatform();}if(currentUser)render();
})();




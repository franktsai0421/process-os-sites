(function(){
  const zoomLevels=[0.5,0.65,0.8,1,1.15,1.3,1.5,1.75,2];
  state.flowZoom=state.flowZoom||{};
  state.flowZoomManual=state.flowZoomManual||{};
  const safe=value=>String(value||"").replace(/[^a-zA-Z0-9-]/g,"-");
  const approvedVersion=(category,line)=>window.ProcessAuthoringV3?.enabled()?window.ProcessAuthoringV3.approved(category,line):approvalVersions.filter(item=>item.category===category&&item.line===line&&["approved","superseded"].includes(item.status)).sort((a,b)=>{
    if(a.status!==b.status)return a.status==="approved"?-1:1;
    return (b.number||0)-(a.number||0)
  })[0];

  function operationContent(operation,product,position){
    const present=window.ProcessOperationPresentation,type=present?.operationTypeMeta(operation)||{key:'custom',label:'自訂流程'},machineRows=present?.operationMachineRows(operation)||[],groups=present?.operationMediaGroups(operation,product.code)||[],photoCount=groups.filter(group=>group.key!=='machine').reduce((sum,group)=>sum+group.items.length,0);
    return `<article class="live-flow-node status-product-node process-type-${type.key}" data-process-type="${type.key}" style="left:${position.x}px;top:${position.y}px">${present?.productionOperationHeaderMarkup(operation,type,machineRows.length,photoCount)||''}<section class="status-node-scroll">${present?.operationNodeBody(operation,product)||''}</section></article>`
  }

  function productFlow(product,lineCode,stageCode,context){
    const hasStage=(routeFor(product.code)?.stages||[]).includes(stageCode);
    if(!hasStage)return `<section class="live-product-flow stage-not-applicable"><header><div><code>${escapeHtml(product.code)}</code><h3>${escapeHtml(product.name)}</h3><span>${escapeHtml(product.specification||"")}</span></div><b>${escapeHtml(stageCode)} · 不適用</b></header><div class="empty">此產品沒有 ${escapeHtml(stageCode)} 工段</div></section>`;
    const version=approvedVersion(product.category,lineCode),operations=(version?.stages?.[stageCode]||[]).filter(operation=>operation.productCodes?.includes(product.code));
    if(!operations.length)return `<section class="live-product-flow"><header><div><code>${escapeHtml(product.code)}</code><h3>${escapeHtml(product.name)}</h3><span>${escapeHtml(product.specification||"")}</span></div><b>${escapeHtml(stageCode)} · ${version?`V${version.number}`:"尚無核准版"}</b></header><div class="empty">此產品在本公段尚無已核准流程</div></section>`;
    const token=safe(`${context}-${product.code}-${stageCode}`),positions=calculateGraphLayout(operations,450,590),canvasWidth=Math.max(1160,...Object.values(positions).map(position=>position.x+430)),canvasHeight=Math.max(570,...Object.values(positions).map(position=>position.y+560)),nodes=operations.map(operation=>operationContent(operation,product,positions[operation.id])).join(""),marker=`live-arrow-${safe(context)}-${token}`;
    return `<section class="live-product-flow"><header><div><code>${escapeHtml(product.code)}</code><h3>${escapeHtml(product.name)}</h3><span>${escapeHtml(product.specification||"")}</span></div><b>${escapeHtml(stageCode)} · ${operations.length} 個流程 · 核准 V${version.number}</b></header><div class="live-flow-canvas" data-live-flow="${token}" style="height:${canvasHeight}px"><svg class="flow-links" width="${canvasWidth}" height="${canvasHeight}"><defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>${connectionMarkup(operations,token,positions,390,68,`live-arrow-${safe(context)}`)}</svg>${nodes}</div></section>`
  }

  function replaceLiveMonitors(){
    if(state.view==="dispatch"){
      const lineCode=state.dispatchPreviewLine||"A",stageCode=state.dispatchPreviewStage||lineFor(lineCode).stages[0]?.code,products=(dispatchBoard[lineCode]||[]).map(code=>data.products.find(item=>item.code===code)).filter(Boolean),board=document.querySelector(".dispatch-live-preview .compact-monitor");
      if(board){board.classList.add("live-graph-board");board.innerHTML=products.length?products.map(product=>productFlow(product,lineCode,stageCode,"dispatch")).join(""):`<div class="device-empty">此線尚未發送產品</div>`}
    }
    if(state.view==="player"){
      const lineCode=state.deviceLine,stageCode=state.deviceStage,products=(dispatchBoard[lineCode]||[]).map(code=>data.products.find(item=>item.code===code)).filter(Boolean),board=document.querySelector(".device-products");
      if(board){board.classList.add("live-graph-board");board.innerHTML=products.map(product=>productFlow(product,lineCode,stageCode,"player")).join("")}
    }
  }

  function zoomValue(key,min=.5){return Math.min(2,Math.max(min,Number(state.flowZoom[key])||1))}
  function controlBar(key,scale){const bar=document.createElement("div");bar.className="flow-zoom-controls";bar.title="縮放畫布，也可使用 Ctrl＋滑鼠滾輪";bar.innerHTML=`<button type="button" data-zoom-action="out" title="縮小">−</button><output>${Math.round(scale*100)}%</output><button type="button" data-zoom-action="in" title="放大">＋</button><button type="button" data-zoom-action="reset" title="重設為 100%">↺</button>`;bar.dataset.zoomFor=key;return bar}
  function nextScale(current,direction){const index=zoomLevels.reduce((best,value,i)=>Math.abs(value-current)<Math.abs(zoomLevels[best]-current)?i:best,0);return zoomLevels[Math.max(0,Math.min(zoomLevels.length-1,index+direction))]}

  function decorateCanvas(canvas,key){
    if(canvas.dataset.zoomReady)return;canvas.dataset.zoomReady="true";canvas.dataset.flowZoomKey=key;
    const inner=document.createElement("div");inner.className="flow-zoom-content";const svg=canvas.querySelector(":scope > svg"),baseWidth=Math.max(canvas.scrollWidth,Number(svg?.getAttribute("width"))||0,canvas.clientWidth),baseHeight=Math.max(canvas.scrollHeight,Number(svg?.getAttribute("height"))||0,parseFloat(canvas.style.height)||0);while(canvas.firstChild)inner.appendChild(canvas.firstChild);inner.style.width=`${baseWidth}px`;inner.style.height=`${baseHeight}px`;canvas.appendChild(inner);
    const isLive=canvas.classList.contains("live-flow-canvas"),minScale=.5,autoFitEnabled=isLive||canvas.classList.contains("status-product-canvas")||canvas.classList.contains("flow-canvas"),fitScale=()=>Math.min(1,Math.max(minScale,Math.min((canvas.clientWidth-20)/baseWidth,(Math.max(500,window.innerHeight-250)-20)/baseHeight))),initialScale=autoFitEnabled&&!state.flowZoomManual[key]?fitScale():zoomValue(key,minScale);
    const owner=canvas.closest(".stage-editor,.status-stage,.live-product-flow"),header=owner?.querySelector(":scope > header"),bar=controlBar(key,initialScale);if(header)header.appendChild(bar);else{bar.classList.add("standalone");canvas.before(bar)}
    const apply=scale=>{scale=Math.min(2,Math.max(minScale,scale));state.flowZoom[key]=scale;canvas.dataset.flowScale=String(scale);inner.style.zoom=String(scale);if(isLive)canvas.style.height=`${Math.max(500,Math.min(Math.ceil(baseHeight*scale)+12,window.innerHeight-210))}px`;bar.querySelector("output").textContent=`${Math.round(scale*100)}%`;bar.querySelector('[data-zoom-action="out"]').disabled=scale<=minScale;bar.querySelector('[data-zoom-action="in"]').disabled=scale>=2};
    const autoFit=()=>{delete state.flowZoomManual[key];apply(fitScale())};canvas.autoFitFlow=autoFit;
    bar.onclick=event=>{const action=event.target.closest("[data-zoom-action]")?.dataset.zoomAction;if(!action)return;if(action==="reset"&&autoFitEnabled){autoFit();return}state.flowZoomManual[key]=true;const current=zoomValue(key,minScale);apply(action==="reset"?1:nextScale(current,action==="in"?1:-1))};
    canvas.addEventListener("wheel",event=>{if(!event.ctrlKey)return;event.preventDefault();state.flowZoomManual[key]=true;apply(nextScale(zoomValue(key,minScale),event.deltaY<0?1:-1))},{passive:false});
    if(!canvas.classList.contains("flow-canvas")){
      let pan=null;const stop=event=>{if(!pan)return;try{canvas.releasePointerCapture(event.pointerId)}catch{}pan=null;canvas.classList.remove("is-panning")};
      canvas.addEventListener("pointerdown",event=>{if(event.button!==0||event.target.closest(".status-product-node,button,a,input,select,textarea,[role=button],.flow-connection"))return;pan={x:event.clientX,y:event.clientY,left:canvas.scrollLeft,top:canvas.scrollTop};canvas.setPointerCapture(event.pointerId);canvas.classList.add("is-panning");event.preventDefault()});
      canvas.addEventListener("pointermove",event=>{if(!pan)return;canvas.scrollLeft=pan.left-(event.clientX-pan.x);canvas.scrollTop=pan.top-(event.clientY-pan.y)});canvas.addEventListener("pointerup",stop);canvas.addEventListener("pointercancel",stop)
    }
    apply(initialScale)
  }

  function decorateApproval(){const grid=document.querySelector(".version-stage-grid");if(!grid||grid.dataset.zoomReady)return;grid.dataset.zoomReady="true";const key=`approval:${state.approvalVersionId||"current"}`,bar=controlBar(key,zoomValue(key));bar.classList.add("standalone");grid.before(bar);const apply=scale=>{scale=Math.min(2,Math.max(.5,scale));state.flowZoom[key]=scale;grid.style.zoom=String(scale);bar.querySelector("output").textContent=`${Math.round(scale*100)}%`};bar.onclick=event=>{const action=event.target.closest("[data-zoom-action]")?.dataset.zoomAction;if(!action)return;const current=zoomValue(key);apply(action==="reset"?1:nextScale(current,action==="in"?1:-1))};grid.addEventListener("wheel",event=>{if(!event.ctrlKey)return;event.preventDefault();apply(nextScale(zoomValue(key),event.deltaY<0?1:-1))},{passive:false});apply(zoomValue(key))}

  function simplifyApprovalActions(){
    if(state.view!=="approval")return;const panel=document.querySelector(".approval-actions-v2");if(!panel)return;
    panel.querySelectorAll('[data-version-action]:not([data-version-action="approve"]):not([data-version-action="withdraw"])').forEach(button=>button.remove());
    panel.querySelectorAll("[data-edit-version]").forEach(button=>button.remove());
    const label=panel.querySelector("label"),textarea=panel.querySelector("#review-note");if(label)label.textContent="主管確認備註";if(textarea)textarea.placeholder="可填寫本次確認備註";
    if(!panel.querySelector('[data-version-action="approve"], [data-version-action="withdraw"]'))panel.remove();else panel.classList.add("simplified")
  }

  const priorBindView=bindView;
  bindView=function(){priorBindView();replaceLiveMonitors();simplifyApprovalActions();document.querySelectorAll(".flow-canvas").forEach((canvas,index)=>decorateCanvas(canvas,`editor:${canvas.dataset.stageCanvas||index}`));document.querySelectorAll(".status-product-canvas").forEach((canvas,index)=>decorateCanvas(canvas,`status:${state.productCode}:${index}`));document.querySelectorAll(".live-flow-canvas").forEach((canvas,index)=>decorateCanvas(canvas,`${state.view}:${canvas.dataset.liveFlow||index}`));bindLightbox();if(state.view==="approval")decorateApproval()};
  window.addEventListener("process-language-change",()=>{if(["player","dispatch","productStatus"].includes(state.view))render()});
  document.addEventListener("fullscreenchange",()=>setTimeout(()=>document.querySelectorAll(".device-page .live-flow-canvas").forEach(canvas=>canvas.autoFitFlow?.()),80));
  if(currentUser)render()
})();

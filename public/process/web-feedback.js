/* Independent feedback UI: never reads/writes a process draft or canvas journal. */
(() => {
 'use strict';
 if(window.WebFeedback||window.ProcessSync?.requiresReload)return;
 const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh, esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const uid=()=>crypto.randomUUID(), api='/api/web-feedback', imageURL=id=>api+'?action=image&id='+encodeURIComponent(id);
 let actor='',draft=null,index=0,panel=null,dbPromise=null,persistChain=Promise.resolve(),objectURLs=[],selecting=false,selectionCleanup=null,busy=false,epoch=0,openAttempt=0;
 const selected=new Set();let board=null,boardActor='',issues=[],selectedIssue='',boardTab='list',isAdmin=false,boardPermissions={},exportOperation=null,boardDirty=false;
 let historyRequest=0,persisting=0,adminBusy=false,highlightTimer=null,panelOwner=null,composing=false,redrawPending=false,storageFailed=false,reportPhase='idle';
 const retained=[],guarded=new WeakSet(),compositionWired=new WeakSet(),nativeComposition=typeof HTMLElement!=='undefined'&&'oncompositionstart' in HTMLElement.prototype;
 const captureOwner=()=>window.WebFeedbackHost.capture();
 const owns=owner=>window.WebFeedbackHost.owns(owner);
 const guard=(fn,owner=captureOwner(),token=epoch,reportAttempt)=>{const wrapped=function(...args){if(token!==epoch||!owns(owner)||reportAttempt!==undefined&&(reportAttempt!==openAttempt||reportPhase!=='ready')){args[0]?.preventDefault?.();return;}return fn.apply(this,args);};guarded.add(wrapped);return wrapped;};
 // Bind only this owned panel/board, never scan or wrap the application's UI.
 function wire(root,report=false){if(!nativeComposition)for(const node of root.querySelectorAll('input,textarea'))if(!compositionWired.has(node)){compositionWired.add(node);for(const type of ['compositionstart','compositionend'])node.addEventListener(type,event=>node['on'+type]?.(event));}for(const node of [root,...root.querySelectorAll('button,input,textarea,select,a,[data-case-row]')])for(const key of ['onclick','oninput','onchange','onkeydown','oncompositionstart','oncompositionend']){const fn=node[key];if(typeof fn==='function'&&!guarded.has(fn))node[key]=guard(fn,captureOwner(),epoch,report?openAttempt:undefined);else if(key==='onclick'&&node.tagName==='A'&&!fn)node[key]=guard(()=>{});}}
 const notePending=()=>!!board?.querySelector('[data-note]')?.value.trim();
 const boardCanChange=()=>!adminBusy&&!exportOperation&&!notePending();
 function holdBoard(){if(boardCanChange())return false;const status=board?.querySelector('[role=status]');if(status)status.textContent=t('請先完成目前備註或確認原交接結果。','Hãy lưu ghi chú hoặc xác nhận kết quả bàn giao hiện tại.');return true;}
 const localKey=id=>location.origin+'|feedback-v1|'+id;
 const database=()=>dbPromise||(dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('process-web-feedback-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}));
 async function storage(mode,key,value,owner){const db=await database();if(mode==='readonly'&&owner&&!owns(owner))throw Error('FEEDBACK_OWNER_CHANGED');return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode),store=tx.objectStore('drafts'),req=mode==='readonly'?store.get(key):store.put(value,key);let result;req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
 function persist(){const key=localKey(actor),copy=structuredClone(draft),token=epoch;persisting++;
  const task=persistChain.catch(()=>{}).then(()=>storage('readwrite',key,copy));
  persistChain=task.then(value=>{if(token===epoch)storageFailed=false;return value;}).finally(()=>{persisting--;});persistChain.catch(()=>{if(token===epoch){storageFailed=true;message(t('本機草稿保存失敗；請勿關閉，修復儲存空間後重試。','Không lưu được bản nháp; đừng đóng trang.'));}});return persistChain;
 }
 async function request(action,body,owner=captureOwner()){
  if(!owns(owner))throw Error('FEEDBACK_OWNER_CHANGED');
  const res=await fetch(api+'?action='+action,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});if(owns(owner)&&res.status===401){window.ProcessSync?.clearIdentity?.();window.WebFeedbackHost.invalidate();}const data=await res.json();
  if(!owns(owner))throw Error('FEEDBACK_OWNER_CHANGED');if(!res.ok)throw Error(data.error||res.status);return data;
 }
 function page(){const url=new URL(location.href),view=url.searchParams.get('view')||'dashboard',tab=url.searchParams.get('dataTab')||'',system=url.searchParams.get('system')||'process';return{type:'page',view,tab,system,display:(document.querySelector('#page-title')?.textContent||view)+(tab?' → '+tab:''),locator:{},context:{}};}
 const marker=location=>({id:uid(),description:'',location:structuredClone(location),images:[]});
 function message(value){const node=panel?.querySelector('[role=status]');if(node)node.textContent=value;}
 function revoke(){objectURLs.forEach(url=>URL.revokeObjectURL(url));objectURLs=[];}
 function imageSource(blob){const url=URL.createObjectURL(blob);objectURLs.push(url);return url;}
 function helperHost(){return document.querySelector('#wf-launcher')?.closest('dialog[open]')||document.body;}
 let positionedDialog=null,dialogResize=null,dialogContent=null;
 function positionPanel(){
  if(!panel||panel.hidden)return;
  const dialog=panel.closest('dialog[open]');
  if(dialog!==positionedDialog){dialogResize?.disconnect();dialogContent?.disconnect();positionedDialog=dialog;dialogResize=null;dialogContent=null;if(dialog){if(typeof ResizeObserver==='function'){dialogResize=new ResizeObserver(positionPanel);dialogResize.observe(dialog);}dialogContent=new MutationObserver(records=>{if(records.some(record=>!record.target.closest?.('#wf-panel,#wf-viewer,#wf-launcher')))positionPanel();});dialogContent.observe(dialog,{childList:true,subtree:true});}}
  const footer=dialog&&[...dialog.querySelectorAll('footer')].find(el=>!el.closest('#wf-panel'));
  const bottom=footer?Math.max(72,Math.ceil(innerHeight-footer.getBoundingClientRect().top+12)):72;
  const tabs=dialog?.querySelector('[role=tablist]')||dialog?.querySelector('header');
  const top=tabs?tabs.getBoundingClientRect().bottom+12:12;
  const height=Math.max(0,innerHeight-bottom-top);
  panel.style.bottom=dialog?bottom+'px':'';panel.style.maxHeight=dialog?Math.min(540,height)+'px':'';window.WebFeedbackHost.positionPanel?.();
 }
 function showImage(source,report=false){if(report&&reportPhase!=='ready'||holdBoard())return;document.querySelector('#wf-viewer')?.remove();const previous=document.activeElement,viewer=document.createElement('section');viewer.id='wf-viewer';if(report)viewer.setAttribute('data-wf-report','true');viewer.setAttribute('role','dialog');viewer.setAttribute('aria-label',t('圖片','Ảnh'));viewer.innerHTML=`<button type="button">${t('關閉','Đóng')}</button><img alt="${t('回報原圖','Ảnh gốc')}">`;viewer.querySelector('img').src=source;const dismiss=()=>{viewer.remove();previous?.focus();};viewer.querySelector('button').onclick=dismiss;viewer.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss();}};helperHost().append(viewer);wire(viewer,report);window.WebFeedbackHost.positionPanel?.();viewer.querySelector('button').focus();}
 function draw(){
  if(reportPhase!=='ready'||!panel||!draft)return;if(composing){redrawPending=true;return;}panelOwner=captureOwner();redrawPending=false;revoke();const m=draft.markers[index]||draft.markers[0];index=draft.markers.indexOf(m);
  const locked=busy||!!draft.pending;
  panel.innerHTML=`<header><strong>${t('問題回報','Báo lỗi')}</strong><button type="button" data-close aria-label="${t('收合','Thu gọn')}">−</button></header><div class="wf-body"><div class="wf-muted">${t('回報起始頁','Trang bắt đầu')}: ${esc(draft.start.display)}</div><div class="wf-markers">${draft.markers.map((x,i)=>`<button type="button" data-marker="${i}" aria-pressed="${i===index}">${i+1}</button>`).join('')}<button type="button" data-add ${locked?'disabled':''}>＋</button><button type="button" data-delete ${locked?'disabled':''} aria-label="${t('刪除標記','Xóa đánh dấu')}">🗑</button></div><button type="button" data-select ${locked?'disabled':''}>${t('點選網頁位置','Chọn vị trí trên trang')}</button><div class="wf-location">${t('標記位置','Vị trí')}: ${esc(m.location.display)}</div><label>${t('問題說明','Mô tả')}<textarea maxlength="4000" ${locked?'disabled':''}>${esc(m.description)}</textarea></label><label class="wf-muted">Ctrl+V · PNG/JPEG/WebP · 5 MB · ${t('最多 6 張','Tối đa 6 ảnh')}<span class="wf-file-button">${t('選擇圖片','Chọn ảnh')}</span><input class="wf-file-input" aria-label="${t('上傳圖片','Tải ảnh')}" type="file" accept="image/png,image/jpeg,image/webp" multiple ${locked?'disabled':''}></label><div class="wf-thumbs">${m.images.map((a,i)=>`<div class="wf-thumb"><button type="button" data-image="${i}" aria-label="${esc(a.name)}" title="${esc(a.name)}"><img src="${imageSource(a.blob)}" alt="${esc(a.name)}"></button><button type="button" class="wf-remove" data-remove="${i}" ${locked?'disabled':''} aria-label="${t('移除圖片','Xóa ảnh')}">×</button></div>`).join('')}</div><p class="wf-error" role="status" aria-live="polite"></p></div><footer><button type="button" class="wf-primary" data-submit ${busy?'disabled':''}>${busy?t('送出中…','Đang gửi…'):draft.pending?t('重試全部送出','Thử gửi lại'):t('全部送出','Gửi tất cả')}</button></footer>`;
  panel.querySelector('[data-close]').onclick=close;
  panel.querySelectorAll('[data-marker]').forEach(b=>b.onclick=()=>{index=Number(b.dataset.marker);draw();});
  panel.querySelector('[data-add]').onclick=()=>{if(draft.markers.length>=20)return message(t('每批最多 20 筆','Tối đa 20 đánh dấu'));draft.markers.push(marker(draft.start));index=draft.markers.length-1;void persist();draw();};
  panel.querySelector('[data-delete]').onclick=()=>{draft.markers.splice(index,1);if(!draft.markers.length)draft.markers.push(marker(draft.start));index=0;void persist();draw();};
  panel.querySelector('textarea').oncompositionstart=()=>{composing=true;};
  panel.querySelector('textarea').oncompositionend=()=>{m.description=panel.querySelector('textarea').value;composing=false;void persist();if(redrawPending)draw();};
  panel.querySelector('textarea').oninput=e=>{if(m.description===e.target.value)return;m.description=e.target.value;if(!composing)void persist();};
  panel.querySelector('input').onchange=e=>{void addImages([...e.target.files]).catch(error=>message(error.message));};
  panel.querySelectorAll('[data-image]').forEach(b=>b.onclick=()=>showImage(b.querySelector('img').src,true));
  panel.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{m.images.splice(Number(b.dataset.remove),1);void persist();draw();});
  panel.querySelector('[data-select]').onclick=selectLocation;panel.querySelector('[data-submit]').onclick=submit;if(selecting){const cancel=panel.querySelector('[data-select]');cancel.textContent=t('取消點選（Esc）','Hủy chọn (Esc)');cancel.onclick=()=>{endSelect();draw();};}
  wire(panel,true);positionPanel();
 }
 async function addImages(files){const owner=captureOwner(),attempt=openAttempt;if(reportPhase!=='ready'||!owns(owner)||busy||draft?.pending)return;const target=draft?.markers[index],token=epoch;if(!target)return;for(const file of files){if(target.images.length>=6){message(t('最多 6 張圖片','Tối đa 6 ảnh'));break;}if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5_000_000){message(t('僅限 PNG/JPEG/WebP，每張 5 MB','Chỉ PNG/JPEG/WebP, 5 MB mỗi ảnh'));continue;}if(token!==epoch||attempt!==openAttempt||reportPhase!=='ready'||!owns(owner))return;target.images.push({id:uid(),name:file.name||'screenshot.png',blob:file});}await persist();if(token===epoch&&attempt===openAttempt&&reportPhase==='ready'&&owns(owner))draw();}
 function paste(e){if(reportPhase!=='ready'||panel?.hidden||!draft||!actor||!owns(captureOwner()))return;const files=[...e.clipboardData.items].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(files.length){e.preventDefault();e.stopPropagation();addImages(files).catch(e=>message(e.message));}}
 function locate(element,point){let el=element.closest('[data-feedback-id],[data-op-id],[data-node],[data-stage],[data-action],[data-tab],[data-testid],button,a,label,input,select,textarea,[id]')||element;
  // Port/action buttons repeat per card. The stable card identifies their business record.
  if(!el.id&&el.closest('[data-node]'))el=el.closest('[data-node]');
  const result=page(),locator={tag:el.tagName.toLowerCase()};
  if(el.id&&/^[\w:-]{1,100}$/.test(el.id)&&document.querySelectorAll('#'+CSS.escape(el.id)).length===1)locator.id=el.id;
  else for(const attribute of ['data-feedback-id','data-op-id','data-node','data-stage','data-action','data-tab','data-testid']){const value=el.getAttribute(attribute);if(value&&/^[\w .:-]{1,100}$/.test(value)&&document.querySelectorAll('['+attribute+'="'+CSS.escape(value)+'"]').length===1){locator.attribute=attribute;locator.value=value;break;}}
  result.type=locator.id||locator.attribute?'element':'page';result.locator=result.type==='element'?locator:{};
  const label=el.getAttribute('aria-label')||(['BUTTON','A','LABEL','H1','H2','H3'].includes(el.tagName)?el.textContent:'')||el.tagName.toLowerCase();result.display+=' → '+label.trim().slice(0,80)+(result.type==='page'?' ('+t('頁面定位','vị trí trang')+')':'');
  const op=el.closest('[data-op-id],[data-node]'),stage=el.closest('[data-stage]');if(op)result.context.recordId=op.getAttribute('data-op-id')||op.getAttribute('data-node');if(stage)result.context.stageCode=stage.getAttribute('data-stage');
  // Reused modal control IDs do not identify a record; avoid attaching to a different dialog later.
  if(el.closest('dialog')&&!op){result.type='page';result.locator={};}
  locator.label=(el.getAttribute('aria-label')||(['BUTTON','A','LABEL','H1','H2','H3'].includes(el.tagName)?el.textContent:'')||'').trim().slice(0,80);
  if(point)result.position={x:Math.round(point.clientX+scrollX),y:Math.round(point.clientY+scrollY),scrollX,scrollY,viewportWidth:innerWidth,viewportHeight:innerHeight,documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight};
  return result;
 }
 function resolveLocation(l){const p=page();if(l.view!==p.view||l.tab!==p.tab||l.system!==p.system||l.type!=='element')return null;const s=l.locator.id?'#'+CSS.escape(l.locator.id):l.locator.attribute?'['+l.locator.attribute+'="'+CSS.escape(l.locator.value)+'"]':'';if(!s)return null;const nodes=document.querySelectorAll(s),el=nodes[0];if(nodes.length!==1||el.tagName.toLowerCase()!==l.locator.tag)return null;if(l.locator.label!==undefined&&(el.getAttribute('aria-label')||(['BUTTON','A','LABEL','H1','H2','H3'].includes(el.tagName)?el.textContent:'')||'').trim().slice(0,80)!==l.locator.label)return null;const record=el.closest('[data-op-id],[data-node]');if(l.context?.recordId&&(record?.getAttribute('data-op-id')||record?.getAttribute('data-node'))!==l.context.recordId)return null;if(l.context?.stageCode&&el.closest('[data-stage]')?.getAttribute('data-stage')!==l.context.stageCode)return null;return el;}
 function outline(el,label){if(!el?.isConnected)return;const r=el.getBoundingClientRect();if(!r.width||!r.height)return;const box=document.createElement('div');box.className='wf-outline';box.style.cssText=`left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;const b=document.createElement('b');b.textContent=label;box.append(b);document.body.append(box);}
 function clearOutlines(){document.querySelectorAll('.wf-outline').forEach(e=>e.remove());}
 function selectLocation(){
  const owner=captureOwner(),attempt=openAttempt,current=()=>reportPhase==='ready'&&attempt===openAttempt&&owns(owner);
  if(selecting||!current()||busy||draft?.pending)return;
  if(!window.WebFeedbackHost.canSelectLocation?.())return message(t('定位功能仍在準備中；請稍後重試。','Đang chuẩn bị định vị; hãy thử lại.'));
  selecting=true;const previousFocus=document.activeElement;
  const shield=document.createElement('div');shield.id='wf-marking-shield';shield.tabIndex=0;shield.setAttribute('aria-label',t('點選任意位置標記；可捲動，Esc 取消','Chọn vị trí bất kỳ; có thể cuộn, Esc để hủy'));
  helperHost().append(shield);shield.focus({preventScroll:true});
  const selectButton=panel.querySelector('[data-select]');selectButton.textContent=t('取消點選（Esc）','Hủy chọn (Esc)');selectButton.onclick=()=>{endSelect();draw();};
  message(t('點選任意位置；捲動後仍可標記。跨來源框架只保存外框位置。','Chọn bất kỳ vị trí nào, kể cả sau khi cuộn. Khung khác nguồn chỉ lưu vị trí bên ngoài.'));
  const controller=new AbortController(),options={capture:true,passive:false,signal:controller.signal};
  let gesture=null,hover=null,frame=null;
  const own=e=>e.target.closest?.('#wf-panel,#wf-launcher,#wf-viewer');
  const underlying=(x,y)=>document.elementsFromPoint(x,y).find(el=>!el.closest('#wf-marking-shield,#wf-panel,#wf-launcher,#wf-viewer,.wf-outline'))||document.body;
  const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
  function scrollTarget(el,dx,dy){
   for(let node=el;node&&node!==document.body;node=node.parentElement){const style=getComputedStyle(node),top=node.scrollTop,left=node.scrollLeft;
    if(/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight)node.scrollTop+=dy;
    if(/auto|scroll/.test(style.overflowX)&&node.scrollWidth>node.clientWidth)node.scrollLeft+=dx;
    if(node.scrollTop!==top||node.scrollLeft!==left)return;
   }window.scrollBy(dx,dy);
  }
  const paint=()=>{frame=null;if(!current())return;clearOutlines();draft.markers.forEach((m,i)=>outline(resolveLocation(m.location),String(i+1)));if(hover)outline(hover,'+');};
  const schedule=()=>{if(frame===null)frame=requestAnimationFrame(paint);};
  const down=e=>{if(!current()||own(e))return;stop(e);gesture={x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,target:underlying(e.clientX,e.clientY),moved:false,touch:e.pointerType==='touch'};};
  const move=e=>{if(!current()||own(e))return;e.stopImmediatePropagation();hover=underlying(e.clientX,e.clientY);
   if(gesture){if(Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y)>6)gesture.moved=true;if(gesture.touch&&gesture.moved){e.preventDefault();scrollTarget(gesture.target,gesture.lastX-e.clientX,gesture.lastY-e.clientY);}gesture.lastX=e.clientX;gesture.lastY=e.clientY;}schedule();};
  const click=e=>{if(!current()||own(e))return;stop(e);if(gesture?.moved){gesture=null;return;}draft.markers[index].location=locate(underlying(e.clientX,e.clientY),e);void persist();endSelect();draw();};
  const block=e=>{if(!current()||own(e))return;stop(e);};
  const touch=e=>{if(!current()||own(e))return;e.stopImmediatePropagation();};
  const wheel=e=>{if(!current()||own(e))return;stop(e);const scale=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;scrollTarget(underlying(e.clientX,e.clientY),e.deltaX*scale,e.deltaY*scale);schedule();};
  const key=e=>{if(!current())return;if(e.key==='Escape'){stop(e);endSelect();draw();}else if(!own(e)&&['Enter',' '].includes(e.key))stop(e);};
  window.addEventListener('pointerdown',down,options);window.addEventListener('pointermove',move,options);window.addEventListener('click',click,options);
  for(const name of ['mousedown','mouseup','pointerup','dblclick','contextmenu','dragstart','selectstart'])window.addEventListener(name,block,options);
  for(const name of ['touchstart','touchmove','touchend'])window.addEventListener(name,touch,options);
  window.addEventListener('pointercancel',()=>{gesture={moved:true};},options);window.addEventListener('wheel',wheel,options);window.addEventListener('keydown',key,options);window.addEventListener('scroll',schedule,{capture:true,passive:true,signal:controller.signal});
  selectionCleanup=()=>{controller.abort();shield.remove();if(frame!==null)cancelAnimationFrame(frame);if(previousFocus?.isConnected)previousFocus.focus({preventScroll:true});};schedule();
 }
 function endSelect(){selectionCleanup?.();selectionCleanup=null;selecting=false;clearOutlines();}
 function close(options={}){if(options.force!==true&&holdBoard())return false;clearTimeout(highlightTimer);highlightTimer=null;window.removeEventListener('resize',positionPanel);dialogResize?.disconnect();dialogContent?.disconnect();dialogResize=null;dialogContent=null;positionedDialog=null;endSelect();if(panel)panel.hidden=true;document.removeEventListener('paste',paste,true);document.querySelector('#wf-viewer')?.remove();revoke();}
 function canOpen(){if(busy||persisting||composing){message(t('請先完成目前輸入或等待保存／送出結果。','Hãy hoàn tất nhập hoặc đợi kết quả lưu/gửi.'));return false;}return !holdBoard();}
 function beginOpen(){if(!canOpen())return false;reportPhase='verifying';openAttempt++;endSelect();document.querySelector('#wf-viewer[data-wf-report="true"]')?.remove();return true;}
 async function open(user,shell){const owner=shell?.owner||captureOwner();if(!user?.id||!owns(owner)||!canOpen()||draft&&actor!==user.id)return;reportPhase='verifying';const token=epoch,attempt=++openAttempt,current=()=>token===epoch&&attempt===openAttempt&&owns(owner),memoryDraft=draft,started=performance.now(),openedPage=shell?.start||page();actor=user.id;window.removeEventListener('resize',positionPanel);window.addEventListener('resize',positionPanel);endSelect();document.removeEventListener('paste',paste,true);revoke();document.querySelector('#wf-viewer[data-wf-report="true"]')?.remove();
  if(shell){panel=shell.panel;positionPanel();}
  if(!panel){panel=document.createElement('section');panel.id='wf-panel';panel.dataset.i18nSkip='true';panel.setAttribute('aria-label',t('問題回報','Báo lỗi'));}
  if(!shell){helperHost().append(panel);panel.hidden=false;panel.textContent=t('正在讀取草稿…','Đang tải bản nháp…');}
  try{
   const capsStarted=performance.now(),authorization=shell?.authorization?await shell.authorization:null;
   if(authorization?.error)throw authorization.error;
   const verified=authorization?authorization.data:await request('capabilities'),capsMs=authorization?authorization.elapsedMs:Math.round(performance.now()-capsStarted),capsWaitMs=Math.round(performance.now()-capsStarted);
   if(!current())return;
   if(verified.enabled===false)throw Error(t('沒有新增問題回報權限；請保留目前輸入。','Không có quyền tạo báo lỗi; hãy giữ nội dung hiện tại.'));
   if(verified.account!==user.id)throw Error(t('登入身分已變更，請重新開啟回報；未保存此段輸入。','Tài khoản đã đổi; mở lại báo lỗi. Nội dung chưa được lưu.'));
   const verifiedActor=verified.account,verifiedKey=localKey(verifiedActor),storageStarted=performance.now();await persistChain.catch(()=>{});if(!current())return;const stored=memoryDraft||await storage('readonly',verifiedKey,undefined,owner);
   if(!current())return;const storageMs=Math.round(performance.now()-storageStarted),start=openedPage;
   if(shell?.composing&&shell.active)await new Promise(resolve=>{shell.compositionEnd=resolve;});
   if(!current())return;
   draft=stored||{start,markers:[marker(start)],pending:null};index=0;
   const newText=shell?.input.value||'';
   if(newText.trim()){
    const blank=!draft.pending&&draft.markers.find(m=>!m.description&&!m.images.length);
    if(!blank&&draft.markers.length>=20)throw Error(t("已有 20 個標記，請先複製這段文字，再清空輸入並重新開啟草稿。","Đã có 20 dấu; sao chép nội dung, xóa ô nhập rồi mở lại bản nháp."));
    const target=blank||marker(start);target.description=newText;
    if(!blank)draft.markers.push(target);index=draft.markers.indexOf(target);if(shell)shell.consumed=true;
    await persist();if(!current())return;
   }
   if(shell)shell.consumed=true;reportPhase='ready';
   if(shell&&!shell.active)return;
   panel.style.cssText='';panel.hidden=false;
   const beforeDraw=performance.now();draw();if(storageFailed)message(t('本機保存尚未成功；保留目前草稿，請勿重新整理。','Chưa lưu được; giữ bản nháp, đừng tải lại trang.'));document.addEventListener('paste',paste,true);panel.querySelector('textarea')?.focus();
   document.documentElement.dataset.feedbackOpenStages=JSON.stringify({readyMs:Math.round(performance.now()-started),capsMs,capsWaitMs,storageMs,drawMs:Math.round(performance.now()-beforeDraw)});
   return true;
  }catch(e){if(current()){reportPhase='blocked';const status=panel.querySelector('[role=status]');if(status)status.textContent=t('草稿未載入；輸入尚未保存：','Bản nháp chưa tải, nội dung chưa lưu: ')+e.message;else panel.textContent=e.message;}}
 }
 async function submit(){const owner=captureOwner(),attempt=openAttempt;if(reportPhase!=='ready'||!owns(owner)||busy||!draft)return;const token=epoch;busy=true;
  const current=()=>reportPhase==='ready'&&attempt===openAttempt&&token===epoch&&owns(owner);
  try{
   if(!draft.pending){const valid=draft.markers.filter(m=>m.description.trim()||m.images.length);if(!valid.length){busy=false;return message(t('請輸入說明或加入圖片','Nhập mô tả hoặc thêm ảnh'));}draft.pending={operationId:uid(),markers:structuredClone(valid)};}
   // Every explicit retry first makes this exact pending receipt durable. A failed
   // earlier save is not permission to send a memory-only operation.
   await persist();if(!current())return;draw();const frozen=draft.pending,markers=[];
   for(const m of frozen.markers){const attachments=[];for(const a of m.images){if(!current())return;if(!a.uploaded){
    const res=await fetch(api+'?action=upload&name='+encodeURIComponent(a.name)+'&location='+encodeURIComponent(JSON.stringify(m.location)),{method:'POST',headers:{'Content-Type':a.blob.type},body:a.blob});if(current()&&res.status===401){window.ProcessSync?.clearIdentity?.();window.WebFeedbackHost.invalidate();}const value=await res.json();if(!current())return;if(!res.ok)throw Error(value.error);a.uploaded=value.id;await persist();if(!current())return;
   }attachments.push(a.uploaded);}markers.push({id:m.id,description:m.description,location:m.location,attachments});}
   const result=await request('submit',{operationId:frozen.operationId,markers},owner);if(!current())return;
   const completed=new Set(frozen.markers.map(m=>m.id));draft.markers=draft.markers.filter(m=>!completed.has(m.id));draft.pending=null;if(!draft.markers.length){draft.start=page();draft.markers=[marker(draft.start)];}index=0;await persist();if(!current())return;busy=false;draw();boardDirty=true;refreshDirtyBoard();message(t('已建立 '+result.ids.length+' 筆案件','Đã tạo '+result.ids.length+' báo cáo'));
  }catch(e){if(current()){busy=false;draw();message(t('未確認成功，草稿保留；請重試。','Chưa xác nhận thành công; đã giữ bản nháp. ')+e.message);}}finally{if(current())busy=false;}
 }
 function identityChanged(){
  // Terminal memory is not durable recovery and is never exposed to a new actor.
  // Persisted pending bytes stay under their original verified IndexedDB key.
  epoch++;reportPhase='quarantined';document.querySelector('#wf-location-notice')?.remove();sessionStorage.removeItem('web-feedback-highlight');const privateBoard=board?.querySelector('.wf-admin');
  if(draft||exportOperation||privateBoard)retained.push({actor,draft,panel,privateBoard,exportOperation});
  close({force:true});panel?.remove();panel=null;draft=null;actor='';privateBoard?.remove();board=null;boardActor='';boardTab='list';selectedIssue='';issues=[];boardDirty=false;selected.clear();exportOperation=null;adminBusy=false;busy=false;composing=false;redrawPending=false;storageFailed=false;panelOwner=null;clearTimeout(highlightTimer);highlightTimer=null;
  for(const key of Object.keys(filters))filters[key]='';
 }
 async function admin(host,user,force=false){if(!host||!user)return;if(board===host&&boardActor===user.id&&host.querySelector('.wf-admin')&&!force)return;if(holdBoard())return;board=host;boardActor=user.id;const token=epoch,owner=captureOwner();if(!owns(owner))return;host.innerHTML=`<section class="wf-admin" data-i18n-skip="true"><h2>${t('網頁問題回報','Báo lỗi trang web')}</h2><div role="status">${t('載入中…','Đang tải…')}</div></section>`;const shell=host.querySelector('.wf-admin'),current=()=>token===epoch&&owns(owner)&&board===host&&boardActor===user.id&&host.isConnected&&host.querySelector('.wf-admin')===shell;try{const value=await request('list',undefined,owner);if(!current())return;issues=value.issues;boardDirty=false;isAdmin=value.admin;boardPermissions=value.permissions||{};renderBoard(true);}catch(e){if(current()){shell.querySelector('[role=status]').textContent=e.message;const retry=document.createElement('button');retry.textContent=t('重試','Thử lại');retry.onclick=guard(()=>{void admin(host,user,true).catch(()=>{});},owner);shell.append(retry);}throw e;}}
 const filters={search:'',status:'',module:'',page:'',from:'',to:''};
 function renderBoard(fromLoad=false){if(!board?.isConnected||!board.querySelector('.wf-admin')||!fromLoad&&!board.querySelector('[data-board-tab]'))return;const total=issues.length,done=issues.filter(i=>i.status==='done').length;
  board.innerHTML=`<section class="wf-admin" data-i18n-skip="true"><h2>${t('網頁問題回報','Báo lỗi trang web')}</h2><nav>${[['list',t('問題清單','Danh sách')],['history',t('交接紀錄','Lịch sử bàn giao')]].map(([id,label])=>`<button type="button" data-board-tab="${id}" aria-selected="${boardTab===id}" ${(id==='mine'&&(!isAdmin||!boardPermissions.edit))||(id==='history'&&(!isAdmin||!boardPermissions.exchange))?'disabled':''}>${label}</button>`).join('')}<span data-counts>${t('全部','Tất cả')} ${total} · ${t('未完成','Chưa xong')} ${total-done} · ${t('已完成','Hoàn tất')} ${done}</span>${isAdmin&&boardPermissions.exchange?`<button type="button" class="wf-primary" data-export>${t('交接清單','Bàn giao')} (${selected.size}) · ZIP</button>`:''}<button type="button" data-reload>${t('更新','Tải lại')}</button></nav><div role="status" aria-live="polite"></div><div class="wf-board-body"></div></section>`;
  board.querySelectorAll('[data-board-tab]').forEach(b=>b.onclick=()=>{if(holdBoard())return;boardTab=b.dataset.boardTab;renderBoard();});board.querySelector('[data-reload]').onclick=()=>{if(!holdBoard())void admin(board,window.WebFeedbackHost.user(),true).catch(()=>{});};
  board.querySelector('[data-export]')?.addEventListener('click',guard(exportZip));
  if(boardTab==='history'){wire(board);void loadHistory();return;}
  const body=board.querySelector('.wf-board-body');body.innerHTML=`<div class="wf-filters"><input type="search" data-filter="search" aria-label="${t('搜尋 ID、人員、原始問題','Tìm ID, người, mô tả')}" placeholder="${t('搜尋 ID、人員、原始問題','Tìm ID, người, mô tả')}" value="${esc(filters.search)}"><select data-filter="status" aria-label="${t('狀態','Trạng thái')}"><option value="">${t('全部狀態','Mọi trạng thái')}</option><option value="open">${t('未完成','Chưa xong')}</option><option value="done">${t('已完成','Hoàn tất')}</option></select><select data-filter="module" aria-label="${t('模組','Hệ thống')}"><option value="">${t('全部模組','Mọi hệ thống')}</option><option value="process">${t('中控系統','Quy trình')}</option><option value="quality">${t('品質系統','Chất lượng')}</option></select><input data-filter="page" aria-label="${t('頁面','Trang')}" placeholder="${t('頁面','Trang')}" value="${esc(filters.page)}"><input data-filter="from" type="date" aria-label="${t('開始日期','Từ ngày')}" value="${filters.from}"><input data-filter="to" type="date" aria-label="${t('結束日期','Đến ngày')}" value="${filters.to}"></div><div class="wf-columns"><div class="wf-list"></div><div class="wf-detail"></div></div>`;
  body.querySelectorAll('[data-filter]').forEach(input=>{input.value=filters[input.dataset.filter];let composingFilter=false;const apply=()=>{if(composingFilter||holdBoard())return;filters[input.dataset.filter]=input.value;renderList();};input.oncompositionstart=()=>{composingFilter=true;};input.oncompositionend=()=>{composingFilter=false;apply();};input.oninput=apply;});renderList();wire(board);
 }
 function renderList(){const host=board.querySelector('.wf-list');if(!host)return;const scroll=host.scrollTop,previousIssue=selectedIssue;const rows=issues.filter(i=>(!filters.status||i.status===filters.status)&&(!filters.module||i.location.system===filters.module)&&(!filters.page||(i.location.view+' '+i.location.tab+' '+i.location.display).toLowerCase().includes(filters.page.toLowerCase()))&&(!filters.from||i.createdAt.slice(0,10)>=filters.from)&&(!filters.to||i.createdAt.slice(0,10)<=filters.to)&&(!filters.search||(i.id+' '+i.reporter+' '+i.description).toLowerCase().includes(filters.search.toLowerCase())));
  host.innerHTML=rows.map(i=>`<div class="wf-row" data-case-row="${i.id}">${isAdmin&&boardPermissions.exchange?`<input type="checkbox" data-pick="${i.id}" aria-label="${t('加入交接清單','Thêm vào bàn giao')} ${i.id}" ${selected.has(i.id)?'checked':''}>`:''}<button type="button" data-issue="${i.id}"><code>${i.id}</code><span class="wf-badge">${i.status==='done'?t('已完成','Hoàn tất'):t('未完成','Chưa xong')}</span><div>${esc(i.description.slice(0,130)||t('圖片回報','Báo cáo ảnh'))}</div><small>${esc(i.reporter)} · ${esc(i.createdAt.slice(0,16).replace('T',' '))}</small><div class="wf-thumbs">${i.attachments.slice(0,1).map(a=>`<img decoding="async" loading="lazy" src="${imageURL(a.id)}" alt="${esc(a.name)}">`).join('')}</div></button></div>`).join('')||`<p>${t('沒有符合條件的案件','Không có báo cáo phù hợp')}</p>`;
  host.querySelectorAll('[data-pick]').forEach(input=>input.onchange=()=>{if(exportOperation)return;if(input.checked)selected.add(input.dataset.pick);else selected.delete(input.dataset.pick);exportOperation=null;board.querySelector('[data-export]').textContent=t('交接清單','Bàn giao')+' ('+selected.size+') · ZIP';});host.querySelectorAll('[data-case-row]').forEach(row=>row.onclick=e=>{if(e.target.closest('[data-pick]')||holdBoard())return;selectedIssue=row.dataset.caseRow;renderDetail();});if(!rows.some(i=>i.id===selectedIssue))selectedIssue=rows[0]?.id||'';host.scrollTop=scroll;if(previousIssue!==selectedIssue||!board.querySelector('.wf-detail [data-original]'))renderDetail();else markSelected();wire(host);
 }
 function markSelected(){board.querySelectorAll('[data-case-row]').forEach(row=>{const active=row.dataset.caseRow===selectedIssue;row.classList.toggle('wf-row-selected',active);row.querySelector('[data-issue]').setAttribute('aria-pressed',String(active));});}
 function renderDetail(){const host=board.querySelector('.wf-detail'),i=issues.find(i=>i.id===selectedIssue);if(!host)return;markSelected();if(!i){host.textContent=t('選擇案件查看詳情','Chọn báo cáo để xem');return;}
  host.innerHTML=`<h3>${esc(i.id)}</h3><small>${esc(i.reporter)} · ${esc(i.createdAt)}</small><p>${esc(i.description)}</p><p>${esc(i.location.display)}</p><div class="wf-thumbs">${i.attachments.map(a=>`<button type="button" data-show-image="${a.id}"><img decoding="async" loading="lazy" src="${imageURL(a.id)}" alt="${esc(a.name)}"></button>`).join('')}</div>${i.restrictedImages?`<p class="wf-muted">${t('部分圖片需原業務授權','Một số ảnh yêu cầu quyền truy cập gốc')}</p>`:''}<button type="button" data-original>${t('查看原頁面標記','Xem vị trí gốc')}</button>${isAdmin?`<h4>${t('管理者私人備註','Ghi chú riêng của quản trị')}</h4>${i.notes.map(n=>`<p><small>${esc(n.author)} · ${esc(n.at)}</small><br>${esc(n.text)}</p>`).join('')}<label>${t('新增私人備註','Thêm ghi chú riêng')}<textarea maxlength="4000" data-note></textarea></label><button type="button" data-update="${i.status}" ${boardPermissions.edit?'':'disabled'}>${t('保存備註','Lưu ghi chú')}</button> <button type="button" data-update="${i.status==='open'?'done':'open'}" ${boardPermissions.edit?'':'disabled'}>${i.status==='open'?t('標記已完成','Đánh dấu hoàn tất'):t('重新開啟','Mở lại')}</button>${boardPermissions.delete?` <button type="button" class="wf-danger" data-delete-issue>${t('刪除問題','Xóa báo cáo')}</button>`:''}`:''}`;
  host.querySelectorAll('[data-show-image]').forEach(b=>b.onclick=()=>showImage(imageURL(b.dataset.showImage)));
  host.querySelector('[data-original]').onclick=()=>{
   if(window.WebFeedbackHost.navigation.canLeave()===false){holdBoard();return;}
   const l=i.location,currentPage=page();
   if(isAdmin)sessionStorage.setItem('web-feedback-highlight',JSON.stringify({location:l,description:i.description,issueId:i.id,expires:Date.now()+60000}));
   if(l.view===currentPage.view&&l.tab===currentPage.tab&&l.system===currentPage.system){routeChanged();return;}
   if(window.ProcessDeliveryNavigation?.ownsHistory){
    if(!window.ProcessDeliveryNavigation.navigate(l.view,l.tab||null,l.system)){sessionStorage.removeItem('web-feedback-highlight');return;}
   }else{const url=new URL('/process/',location.origin);url.searchParams.set('view',l.view);url.searchParams.set('system',l.system);if(l.tab)url.searchParams.set('dataTab',l.tab);location.href=url.href;}
  };
  let updateReceipt=null;
  host.querySelectorAll('[data-update]').forEach(b=>b.onclick=async()=>{const target=board,token=epoch,owner=captureOwner();if(adminBusy||!owns(owner))return;adminBusy=true;b.disabled=true;
   try{const body={id:i.id,version:i.version,status:b.dataset.update,note:host.querySelector('[data-note]').value},signature=JSON.stringify(body);if(updateReceipt?.signature!==signature)updateReceipt={signature,operationId:uid()};const result=await request('update',{...body,operationId:updateReceipt.operationId},owner);if(token===epoch&&owns(owner)&&board===target){host.querySelector('[data-note]').value='';Object.assign(i,result);adminBusy=false;refreshIssue(i);target.querySelector('[role=status]').textContent=t('已保存','Đã lưu');refreshDirtyBoard();}}
   catch(e){if(token===epoch&&owns(owner)&&board===target)target.querySelector('[role=status]').textContent=t('尚未確認保存；輸入已保留，請重試。','Chưa xác nhận lưu; nội dung được giữ, hãy thử lại. ')+e.message;}
   finally{if(token===epoch&&owns(owner)){adminBusy=false;b.disabled=false;}}
  });
  host.querySelector('[data-delete-issue]')?.addEventListener('click',guard(async()=>{
   if(adminBusy||!confirm(t('確定刪除此問題？既有交接紀錄與附件會保留。','Xóa báo cáo này? Lịch sử bàn giao và tệp đính kèm vẫn được giữ.')))return;
   const target=board,token=epoch,owner=captureOwner();adminBusy=true;
   try{await request('delete',{id:i.id,version:i.version},owner);if(token!==epoch||!owns(owner)||board!==target)return;issues=issues.filter(row=>row.id!==i.id);selected.delete(i.id);updateCounts();renderList();target.querySelector('[role=status]').textContent=t('問題已刪除，交接紀錄保留。','Đã xóa báo cáo; lịch sử bàn giao được giữ.');}
   catch(error){if(token===epoch&&owns(owner)&&board===target)target.querySelector('[role=status]').textContent=t('刪除失敗，請重試。','Không xóa được; hãy thử lại. ')+error.message;}finally{if(token===epoch&&owns(owner))adminBusy=false;}
  }));wire(host);
 }
 function refreshDirtyBoard(){if(!boardDirty||!board?.isConnected||!board.querySelector('.wf-admin'))return;if(!boardCanChange()){const status=board.querySelector('[role=status]');if(status)status.textContent=t('有新回報；請先保存備註或完成交接後更新。','Có báo cáo mới; hãy lưu ghi chú hoặc hoàn tất bàn giao rồi tải lại.');return;}void admin(board,window.WebFeedbackHost.user(),true).catch(()=>{boardDirty=true;});}
 function updateCounts(){const node=board?.querySelector('[data-counts]'),done=issues.filter(i=>i.status==='done').length;if(node)node.textContent=t('全部','Tất cả')+' '+issues.length+' · '+t('未完成','Chưa xong')+' '+(issues.length-done)+' · '+t('已完成','Hoàn tất')+' '+done;const button=board?.querySelector('[data-export]');if(button)button.textContent=t('交接清單','Bàn giao')+' ('+selected.size+') · ZIP';}
 function refreshIssue(issue){updateCounts();const row=[...board.querySelectorAll('[data-case-row]')].find(row=>row.dataset.caseRow===issue.id);if(row){if(filters.status&&filters.status!==issue.status)row.remove();else row.querySelector('.wf-badge').textContent=issue.status==='done'?t('已完成','Hoàn tất'):t('未完成','Chưa xong');}if(!row&&(!filters.status||filters.status===issue.status))renderList();if(selectedIssue===issue.id)renderDetail();}

 const statusLabel=status=>status==='done'?t('已完成','Hoàn tất'):status==='open'?t('未完成','Chưa xong'):t('已刪除','Đã xóa');
 async function loadHistory(){const target=board,token=epoch,owner=captureOwner(),host=board.querySelector('.wf-board-body'),generation=++historyRequest;host.textContent=t('載入中…','Đang tải…');try{const {handoffs}=await request('handoffs',undefined,owner);if(token!==epoch||!owns(owner)||board!==target||boardTab!=='history'||generation!==historyRequest||!host.isConnected)return;host.innerHTML=handoffs.slice().reverse().map(h=>`<article class="wf-history"><strong>${h.id}</strong> · ${h.generatedAt}<br><a href="${api}?action=download&id=${h.id}">${t('下載已生成 ZIP','Tải ZIP đã tạo')}</a><p>${t('生成成功不代表瀏覽器下載成功','Đã tạo không đồng nghĩa đã tải')}</p>${h.issues.map(i=>`<details><summary>${i.id} · ${esc(i.reporter)} · ${t('當時','Lúc đó')}: ${statusLabel(i.status)} · ${t('最新','Hiện tại')}: ${statusLabel(h.latest.find(v=>v.id===i.id)?.status)}</summary><p>${esc(i.description)}</p>${i.notes.map(n=>`<p>${esc(n.author)}: ${esc(n.text)}</p>`).join('')}</details>`).join('')}</article>`).join('')||t('尚無交接紀錄','Chưa có bàn giao');wire(host);}catch(e){if(token===epoch&&owns(owner)&&board===target&&host.isConnected&&generation===historyRequest){host.textContent=t('讀取失敗。','Không tải được. ')+e.message;const retry=document.createElement('button');retry.textContent=t('重試','Thử lại');retry.onclick=guard(loadHistory);host.append(retry);}}}
 async function exportZip(){const target=board,token=epoch,owner=captureOwner(),status=board.querySelector('[role=status]'),button=board.querySelector('[data-export]');if(!owns(owner)||adminBusy)return;if(!selected.size){status.textContent=t('請先勾選案件','Hãy chọn báo cáo');return;}
  adminBusy=true;button.disabled=true;const picks=[...board.querySelectorAll('[data-pick]')];picks.forEach(p=>p.disabled=true);status.textContent=t('產生 ZIP…','Đang tạo ZIP…');exportOperation ||= {operationId:uid(),ids:[...selected]};const frozen=exportOperation;
  try{const result=await request('export',frozen,owner);if(token!==epoch||!owns(owner)||board!==target)return;if(exportOperation===frozen)exportOperation=null;status.innerHTML=`${t('ZIP 已生成；請下載並確認檔案。','Đã tạo ZIP; hãy tải và kiểm tra.')} <a href="${api}?action=download&id=${encodeURIComponent(result.id)}">${result.id}.zip</a>`;wire(status);if(boardTab==='history')await loadHistory();}
  catch(e){if(token===epoch&&owns(owner)&&board===target)status.textContent=t('匯出尚未確認；重試使用同一批次。','Chưa xác nhận xuất; thử lại cùng lô. ')+e.message;}
  finally{if(token===epoch&&owns(owner)){adminBusy=false;button.disabled=false;picks.forEach(p=>p.disabled=!!exportOperation);}}
 }
 function showLocationFallback(saved){
  document.querySelector('#wf-location-notice')?.remove();const notice=document.createElement('section');notice.id='wf-location-notice';notice.setAttribute('role','status');notice.dataset.i18nSkip='true';
  const heading=document.createElement('strong'),text=document.createElement('p'),dismiss=document.createElement('button');
  heading.textContent=t('原標記無法精確重現','Không thể xác định chính xác vị trí gốc');
  text.textContent=t('頁面或元件已變更、僅保存頁面位置，或目前沒有存取權；未標到其他元件。','Trang hoặc thành phần đã đổi, chỉ lưu vị trí trang hoặc hiện không có quyền; không gắn vào thành phần khác.')+'\n'+(saved.issueId||'')+'\n'+(saved.location.display||'')+'\n'+(saved.description||'');
  const point=saved.location.position;if(point&&Number.isFinite(point.x)&&Number.isFinite(point.y))text.textContent+='\n'+t('已保存的頁面位置（僅供參考）：','Vị trí trang đã lưu (tham khảo): ')+Math.round(point.x)+', '+Math.round(point.y);
  dismiss.type='button';dismiss.textContent=t('關閉','Đóng');dismiss.onclick=()=>notice.remove();notice.append(heading,text,dismiss);helperHost().append(notice);
 }
 let renderedLanguage=document.documentElement.lang;
 function routeChanged(){if(window.ProcessSync?.requiresReload)return;if(panel&&!panel.hidden&&draft&&!busy&&panelOwner&&!owns(panelOwner))draw();if(selecting){endSelect();draw();}if(renderedLanguage!==document.documentElement.lang){renderedLanguage=document.documentElement.lang;if(panel&&!panel.hidden)draw();if(board?.isConnected&&boardCanChange())renderBoard();}if(document.documentElement.dataset.processNavigationStatus&&document.documentElement.dataset.processNavigationStatus!=='ready')return;const value=sessionStorage.getItem('web-feedback-highlight');if(!value)return;sessionStorage.removeItem('web-feedback-highlight');try{const saved=JSON.parse(value);if(saved.expires<Date.now())return;const el=resolveLocation(saved.location);if(el){el.scrollIntoView({block:'center'});outline(el,'●');clearTimeout(highlightTimer);highlightTimer=setTimeout(clearOutlines,8000);}else{showLocationFallback(saved);}}catch{/* Invalid/expired local navigation hint is not authority. */}}
 window.WebFeedback={open,admin,identityChanged,routeChanged};
 window.WebFeedback.canOpen=canOpen;
 window.WebFeedback.beginOpen=beginOpen;
 window.WebFeedback.positionPanel=positionPanel;
 window.WebFeedback.close=close;
 window.WebFeedback.navigation={canLeave:()=>!busy&&!persisting&&!storageFailed&&!composing&&!draft?.pending&&boardCanChange(),reset(){
  board=null;boardActor='';issues=[];selected.clear();selectedIssue='';boardTab='list';document.querySelector('#wf-viewer')?.remove();endSelect();clearTimeout(highlightTimer);highlightTimer=null;
 }};
 window.addEventListener('pagehide',()=>{endSelect();revoke();});
})();

(() => {
  const roles=window.ProcessRoles;if(!roles)return;
  const h=escapeHtml,users=()=>platformUsers.filter(u=>!u.deletedAt);
  const options=(selected='staff')=>Object.keys(roles.templates).map(id=>`<option value="${h(id)}" ${id===selected?'selected':''}>${h(roles.roleNames[id]||id)}</option>`).join('');
  const scope=(v,disabled=false)=>'<div class="access-scope">'+[['lines','可使用產線',[['A','A 線'],['B','B 線'],['C','C 線']]],['views','可進入頁面',roles.navItems.map(([id,,label])=>[id,label])],['permissions','可執行操作',roles.permissionGroups.flatMap(g=>g.items)]].map(([key,label,items])=>`<fieldset><legend>${label}</legend>${items.map(([id,name])=>`<label><input type="checkbox" data-scope="${key}" value="${h(id)}" ${v[key]?.includes(id)?'checked':''} ${disabled?'disabled':''}>${h(name)}</label>`).join('')}</fieldset>`).join('')+'</div>';
  const scopes=root=>Object.fromEntries(['lines','views','permissions'].map(key=>[key,[...root.querySelectorAll(`[data-scope="${key}"]:checked`)].map(i=>i.value)]));
  function refreshRoles(){roles.refresh?.();platformUsers=readStore('platformUsers',[]);if(currentUser){const latest=platformUsers.find(u=>u.id===currentUser.id);if(latest)Object.assign(currentUser,roles.ensurePermissions({...latest}));}}
  async function request(payload){
    const local=['localhost','127.0.0.1'].includes(location.hostname)&&new URLSearchParams(location.search).get('manage')==='1';
    const r=await fetch('/api/users'+(local?'?manage=1':''),{method:'POST',headers:window.ProcessSync.platformHeaders(),body:JSON.stringify({...payload,baseRevision:window.ProcessSync.revision})}),value=await r.json();
    if(!r.ok){if(r.status===409&&value.values){window.ProcessSync.applyServerState(value);refreshRoles();}throw Object.assign(Error(value.error||'資料版本已變更，輸入已保留，請確認後重試'),{field:value.field});}
    window.ProcessSync.applyServerState(value);refreshRoles();return value;
  }
  let selectedRole='staff',search='';
  const refresh=message=>{const root=document.querySelector('#data-content');if(root){root.innerHTML=userManagementView();bindDataInner('users');}if(message)toast(message);};
  const rows=()=>users().filter(u=>[u.id,u.name,roles.roleNames[u.role]].join(' ').toLowerCase().includes(search.toLowerCase())).map(u=>`<tr><td data-label="帳號">${h(u.id)}</td><td data-label="姓名">${h(u.name)}</td><td data-label="角色">${h(roles.roleNames[u.role]||u.role)}</td><td data-label="權限模式">${u.inheritRole!==false?'跟隨角色':'自訂權限'}</td><td data-label="狀態">${u.enabled!==false?'啟用':'停用'}</td><td class="user-row-actions"><button data-edit="${h(u.id)}">編輯</button><button data-toggle="${h(u.id)}">${u.enabled!==false?'停用':'啟用'}</button><button class="danger" data-delete="${h(u.id)}" ${u.id===currentUser?.id?'disabled':''}>刪除</button></td></tr>`).join('');
  userManagementView=function(){
    refreshRoles();if(!roles.templates[selectedRole])selectedRole='staff';const admin=selectedRole==='admin';
    return `<section class="user-admin"><section class="role-manager"><header><h2>角色管理</h2><label><input id="show-demo-identities" type="checkbox" ${localStorage.getItem('processShowDemoIdentities')!=='0'?'checked':''}>顯示示範身分</label></header><p>多數 User 使用「跟隨角色」；只有特殊需求才使用「自訂權限」。</p><div class="role-workspace"><div class="role-list"><label>選擇角色<select id="role-choice">${options(selectedRole)}</select></label>${Object.keys(roles.templates).map(id=>`<button data-role="${h(id)}" class="${id===selectedRole?'active':''}">${h(roles.roleNames[id]||id)}<small>${users().filter(u=>u.role===id).length} User</small></button>`).join('')}<button id="new-role">＋ 建立角色</button></div><form id="role-form"><label>角色名稱<input id="role-name" value="${h(roles.roleNames[selectedRole]||selectedRole)}" ${admin?'disabled':''}></label>${scope(roles.templates[selectedRole],admin)}<footer><button class="button signal" ${admin?'disabled':''}>儲存角色</button>${!['admin','rd','staff'].includes(selectedRole)?'<button type="button" id="delete-role" class="button danger">刪除角色</button>':''}</footer></form></div></section><section class="user-create-section"><h2>建立 User</h2><form id="user-create-form"><label>帳號<input name="id" autocomplete="off" required></label><label>姓名<input name="name" required></label><label>初始密碼<input name="password" type="password" autocomplete="new-password" minlength="6" required></label><label>角色<select name="role">${options()}</select></label><button class="button signal">建立 User</button></form></section><section class="user-list"><header><h2>User 列表與個別設定</h2><label>搜尋<input id="user-search" placeholder="帳號、姓名或角色" value="${h(search)}"></label></header><div class="user-table-wrap"><table><thead><tr><th>帳號</th><th>姓名</th><th>角色</th><th>權限模式</th><th>狀態</th><th>操作</th></tr></thead><tbody id="user-rows">${rows()}</tbody></table></div></section></section>`;
  };
  async function removeUser(user,dialog){if(!confirm(`第一次確認：刪除「${user.id}」？`)||!confirm('第二次確認：帳號將禁止登入，有歷史紀錄者保留歷史資料。確定刪除？'))return;try{await request({action:'delete',id:user.id});dialog?.close();refresh('User 已刪除');}catch(e){toast(e.message);}}
  function editUser(user){
    const draft={...roles.ensurePermissions({...user})},dialog=document.createElement('dialog');dialog.className='user-edit-dialog';
    dialog.innerHTML=`<form><header><h2>編輯 User · ${h(user.id)}</h2><button type="button" data-close aria-label="關閉">×</button></header><div class="user-edit-body"><div class="user-edit-fields"><label>帳號<input value="${h(user.id)}" readonly></label><label>姓名<input name="name" value="${h(user.name)}" required></label><label>角色<select name="role" ${user.id==='admin'?'disabled':''}>${options(user.role)}</select></label><label><input name="enabled" type="checkbox" ${user.enabled!==false?'checked':''}>啟用</label><label>權限模式<select name="mode" ${user.role==='admin'?'disabled':''}><option value="inherit" ${draft.inheritRole?'selected':''}>跟隨角色</option><option value="custom" ${!draft.inheritRole?'selected':''}>自訂權限</option></select></label><button type="button" id="reset-password">重設密碼</button></div><p id="effective-role"></p><div id="user-scope"></div><button type="button" id="restore-role">恢復跟隨角色</button></div><footer><button type="button" class="button danger" id="delete-user" ${user.id===currentUser?.id?'disabled':''}>刪除 User</button><button type="button" data-close class="button ghost">取消</button><button class="button signal">儲存</button></footer></form>`;
    document.body.append(dialog);dialog.showModal();const form=dialog.querySelector('form'),role=form.elements.role,mode=form.elements.mode;let dirty=false;
    const paint=()=>{const inherit=mode.value==='inherit'||role.value==='admin';dialog.querySelector('#effective-role').textContent=inherit?'目前跟隨：'+roles.roleNames[role.value]:'自訂權限只影響此 User';dialog.querySelector('#user-scope').innerHTML=scope(inherit?roles.templates[role.value]:draft,inherit);};paint();
    form.oninput=()=>dirty=true;role.onchange=()=>{if(!confirm('更換角色後會清除個別權限，改為跟隨新角色。確定繼續？')){role.value=draft.role;return;}draft.role=role.value;Object.assign(draft,roles.templates[role.value]);mode.value='inherit';mode.disabled=role.value==='admin';paint();};
    mode.onchange=()=>{if(mode.value==='custom')Object.assign(draft,structuredClone(roles.templates[role.value]));paint();};dialog.querySelector('#user-scope').onchange=()=>Object.assign(draft,scopes(dialog.querySelector('#user-scope')));
    dialog.querySelector('#restore-role').onclick=()=>{mode.value='inherit';paint();dirty=true;};
    const close=()=>{if(!dirty||confirm('尚未儲存，確定離開？'))dialog.close();};dialog.querySelectorAll('[data-close]').forEach(b=>b.onclick=close);dialog.oncancel=e=>{e.preventDefault();close();};dialog.onclose=()=>dialog.remove();
    dialog.querySelector('#delete-user').onclick=()=>removeUser(user,dialog);
    dialog.querySelector('#reset-password').onclick=()=>{const reset=document.createElement('dialog');reset.className='password-reset-dialog';reset.innerHTML='<form><h3>重設密碼</h3><label>新密碼<input type="password" autocomplete="new-password" minlength="6" required></label><footer><button type="button">取消</button><button>確認重設</button></footer></form>';document.body.append(reset);reset.showModal();reset.querySelector('button').onclick=()=>reset.close();reset.onclose=()=>reset.remove();reset.querySelector('form').onsubmit=async e=>{e.preventDefault();try{await request({action:'reset-password',id:user.id,password:reset.querySelector('input').value});reset.close();toast('密碼已重設');}catch(error){toast(error.message);}};};
    form.onsubmit=async e=>{e.preventDefault();try{await request({action:'update',id:user.id,name:form.elements.name.value,role:role.value,enabled:form.elements.enabled.checked,inheritRole:mode.value==='inherit',...scopes(dialog.querySelector('#user-scope'))});dirty=false;dialog.close();refresh('User 設定已儲存');}catch(error){toast(error.message);}};
  }
  const priorBindDataInner=bindDataInner;
  bindDataInner=function(tab){
    if(tab!=='users')return priorBindDataInner(tab);const root=document.querySelector('.user-admin');if(!root)return;
    root.querySelector('#show-demo-identities').onchange=e=>localStorage.setItem('processShowDemoIdentities',e.target.checked?'1':'0');
    const select=id=>{selectedRole=id;refresh();};root.querySelector('#role-choice').onchange=e=>select(e.target.value);root.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>select(b.dataset.role));
    root.querySelector('#role-form').onsubmit=async e=>{e.preventDefault();try{await request({action:'role-save',id:selectedRole,name:root.querySelector('#role-name').value,...scopes(e.target)});refresh('角色已儲存，跟隨角色的 User 已套用');}catch(error){toast(error.message);}};
    root.querySelector('#new-role').onclick=async()=>{const name=prompt('新角色名稱');if(!name?.trim())return;try{await request({...roles.templates.staff,action:'role-create',name});refresh('角色已建立');}catch(e){toast(e.message);}};
    root.querySelector('#delete-role')?.addEventListener('click',async()=>{if(!confirm('確定刪除此自訂角色？'))return;try{await request({action:'role-delete',id:selectedRole});selectedRole='staff';refresh('角色已刪除');}catch(e){toast(e.message);}});
    const createForm=root.querySelector('#user-create-form');createForm.noValidate=true;
    for(const [name,placeholder] of [['id','例如 chen.staff'],['name','使用者姓名'],['password','至少 6 個字元'],['role','']]){const input=createForm.elements[name];if(placeholder)input.placeholder=placeholder;input.setAttribute('aria-describedby','create-error-'+name);input.insertAdjacentHTML('afterend',`<small class="user-field-error" id="create-error-${name}" data-error-for="${name}" aria-live="polite"></small>`);}
    const fieldError=(name,message)=>{const field=createForm.elements[name]||createForm.elements.id;field.setAttribute('aria-invalid','true');createForm.querySelector(`[data-error-for="${field.name}"]`).textContent=message;field.focus();};
    createForm.onsubmit=async e=>{e.preventDefault();const f=createForm.elements;createForm.querySelectorAll('[data-error-for]').forEach(n=>n.textContent='');createForm.querySelectorAll('[aria-invalid]').forEach(n=>n.removeAttribute('aria-invalid'));if(!/^[a-z0-9._-]{1,80}$/i.test(f.id.value.trim()))return fieldError('id','請填寫英文字母或數字帳號，可使用點、底線及連字號');if(!f.name.value.trim())return fieldError('name','請填寫姓名');if(f.password.value.length<6)return fieldError('password','密碼至少需要 6 個字元');const button=createForm.querySelector('button');button.disabled=true;try{await request({action:'create',id:f.id.value,name:f.name.value,password:f.password.value,role:f.role.value});f.password.value='';search='';refresh('User 已建立');}catch(error){fieldError(error.field||'id',error.message);}finally{button.disabled=false;}};
    root.querySelector('#user-search').oninput=e=>{search=e.target.value;root.querySelector('#user-rows').innerHTML=rows();};
    root.querySelector('#user-rows').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const u=users().find(u=>u.id===(b.dataset.edit||b.dataset.toggle||b.dataset.delete));if(!u)return;if(b.dataset.edit)return editUser(u);if(b.dataset.delete)return removeUser(u);try{await request({...u,action:'update',enabled:u.enabled===false});refresh('User 狀態已更新');}catch(error){toast(error.message);}};
  };
  const priorRenderLogin=renderLogin;
  renderLogin=function(){priorRenderLogin();const demo=document.querySelector('.demo-identities')||document.querySelector('.role-login-grid')?.parentElement;if(demo)demo.hidden=false;
    document.querySelectorAll('[data-quick-login]').forEach(b=>b.onclick=async()=>{const role={admin:'admin',rd:'rd',operator:'staff'}[b.dataset.quickLogin],hint=document.querySelector('.login-hint');document.querySelector('#login-id').value='demo-'+role;const showDemoError=message=>{hint.textContent=message;hint.setAttribute('role','alert');hint.classList.add('error');hint.scrollIntoView({block:'nearest'});};
      if(!window.ProcessSync?.demoEnabled){showDemoError('此網站未開啟公開示範登入');return;}
      try{b.disabled=true;const r=await fetch('/api/platform-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({demoRole:role})}),v=await r.json();if(!r.ok)throw Error(v.error);window.ProcessSync.setDemoIdentity(v.user);await window.ProcessSync.refresh();state.editorByCategory={};state.editorVersionId=null;enterPlatform(v.user);}catch(error){showDemoError(error.message);}finally{b.disabled=false;}
    });
  };


  const nodeSize={width:360,height:270,xGap:500,yGap:360,yOffset:135};
  operationConnections=function(operations,stageCode){const positions=Object.fromEntries(operations.map((op,i)=>[op.id,operationGeometry(op,i)]));return connectionMarkup(operations,stageCode,positions,nodeSize.width,nodeSize.yOffset);};
  autoLayoutStage=function(stageCode){const ops=ensureCategoryEditor()[stageCode]||[],positions=calculateGraphLayout(ops,nodeSize.xGap,nodeSize.yGap);ops.forEach(op=>Object.assign(op,positions[op.id]));};
  function stageLayoutNeedsRepair(ops){
    const positions=ops.map((op,index)=>operationGeometry(op,index));
    if(ops.some(op=>!Number.isFinite(op.x)||!Number.isFinite(op.y)))return true;
    for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
      const a=positions[i],b=positions[j];
      const horizontalGap=Math.max(a.x,b.x)-Math.min(a.x+nodeSize.width,b.x+nodeSize.width),verticalGap=Math.max(a.y,b.y)-Math.min(a.y+nodeSize.height,b.y+nodeSize.height),verticalOverlap=verticalGap<0,horizontalOverlap=horizontalGap<0;
      if((verticalOverlap&&horizontalGap<120)||(horizontalOverlap&&verticalGap<80))return true;
    }
    return false;
  }
  const normalizedVersionStages=new WeakSet();
  function repairInitialLayouts(){
    if(localStorage.getItem('processAuthoringControl'))return;
    const stages=ensureCategoryEditor(),selected=approvalVersions.find(item=>item.id===state.editorVersionId),forceVersionLayout=selected?.status&&selected.status!=='draft'&&!normalizedVersionStages.has(stages);
    Object.entries(stages).forEach(([stageCode,ops])=>{if(forceVersionLayout||stageLayoutNeedsRepair(ops||[]))autoLayoutStage(stageCode);});
    if(forceVersionLayout)normalizedVersionStages.add(stages);
  }
  const baseEditorView=editor;
  editor=function(){if(editorSelectionReady())repairInitialLayouts();return baseEditorView();};
  let activeOperation=null,originalOperation=null,originalWorkspaceApplicability=null,modalDirty=false,gesture=null,suppressClickUntil=0;
  const operationById=id=>Object.values(ensureCategoryEditor()).flat().find(op=>op.id===id);
  const uniqueCardMedia=items=>[...new Map((items||[]).filter(item=>item?.src).map(item=>[`${item.src}\n${item.type||''}`,item])).values()];
  function operationCardMediaGroup(op,group){
    const items=uniqueCardMedia(group.items),lightboxGroup=`editor-${op.id}-${group.key}`;
    if(!items.length)return '';
    const mediaButton=(item,index,hidden=false)=>`<button type="button" ${hidden?'class="operation-media-lightbox-source" tabindex="-1" aria-hidden="true"':''} data-lightbox-src="${escapeHtml(item.src)}" data-lightbox-type="${escapeHtml(item.type||'image/jpeg')}" data-lightbox-title="${escapeHtml(`${group.label} ${index+1}/${items.length}`)}" data-lightbox-group="${escapeHtml(lightboxGroup)}">${item.type?.startsWith('video/')?'<span class="media-video-mark">▶</span>':`<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.name||`${group.label} ${index+1}`)}">`}</button>`;
    return `<section class="operation-card-media-group media-kind-${group.key}"><b>${escapeHtml(group.label)}</b>${mediaButton(items[0],0)}${items.slice(1).map((item,index)=>mediaButton(item,index+1,true)).join('')}${items.length>1?`<small>+${items.length}</small>`:''}</section>`;
  }
  function closeEditor(discard=true){const dialog=document.querySelector('#process-operation-dialog');if(modalDirty&&discard&&!confirm('尚未儲存，確定取消修改？'))return;if(discard&&originalOperation&&activeOperation){Object.keys(activeOperation).forEach(k=>delete activeOperation[k]);Object.assign(activeOperation,structuredClone(originalOperation));}if(discard&&originalWorkspaceApplicability)Object.values(ensureCategoryEditor()).flat().forEach(op=>{const saved=originalWorkspaceApplicability[op.id];if(saved)Object.assign(op,structuredClone(saved));});modalDirty=false;activeOperation=null;originalOperation=null;originalWorkspaceApplicability=null;delete state.editingOperationProductCodes;dialog?.close();document.body.classList.remove('editor-modal-open');if(discard)window.ProcessAuthoringV3?.cancelUnapplied();window.ProcessVersionValidation.refreshIssues?.();}
  function decorateInspector(op){
    const dialog=document.querySelector('#process-operation-dialog'),form=dialog?.querySelector('#inspector-form');if(!form||!op)return;
    form.querySelectorAll('.editor-section-title').forEach(el=>el.remove());
    [['#operation-sequence','基本資料'],['.product-multi','產品與 BOM'],['.machine-fields','人員與設備']].forEach(([selector,label])=>{const target=form.querySelector(selector)?.closest('.field,fieldset,section,.machine-fields');if(target)target.insertAdjacentHTML('beforebegin',`<h4 class="editor-section-title">${label}</h4>`);});
    form.querySelector('.operation-template-summary')?.remove();
    const general=form.querySelector('.step-editor[data-step-kind="general"]'),media=form.querySelector('.common-operation-media');
    if(general&&media){const layout=document.createElement('section');layout.className='operation-guidance-layout';layout.innerHTML='<h4 class="editor-section-title">作業說明、完成標準與媒體</h4><div class="operation-guidance-content"></div>';general.before(layout);layout.querySelector('.operation-guidance-content').append(general,media);}
    const ipqc=form.querySelector('#operation-ipqc')?.closest('.field');if(ipqc&&!general)ipqc.insertAdjacentHTML('beforebegin','<h4 class="editor-section-title">作業說明與完成標準</h4>');
    let close=dialog.querySelector('.editor-modal-close');if(!close){close=document.createElement('button');close.type='button';close.className='editor-modal-close';close.textContent='×';close.setAttribute('aria-label','關閉');dialog.querySelector('.inspector-head').append(close);}close.onclick=()=>closeEditor();
    dialog.oncancel=e=>{e.preventDefault();closeEditor();};
    form.oninput=()=>modalDirty=true;
    const actions=form.querySelector('.inspector-actions');if(actions&&!actions.querySelector('[data-editor-cancel]'))actions.insertAdjacentHTML('beforeend','<button type="button" class="button ghost" data-editor-cancel>取消</button>');
    form.querySelector('[data-editor-cancel]')?.addEventListener('click',()=>closeEditor());
    const apply=form.querySelector('#apply-operation');if(apply){const old=apply.onclick;apply.onclick=async event=>{apply.disabled=true;try{old?.call(apply,event);await persistCoordinates();modalDirty=false;originalOperation=null;closeEditor(false);requestAnimationFrame(()=>closeEditor(false));const saved=window.ProcessAuthoringV3?.enabled()?true:await window.ProcessSync.flush();toast(window.ProcessAuthoringV3?.enabled()?'Đã đồng bộ · chưa lưu / 已同步，尚未儲存':saved===false?'流程內容已保留在目前頁面，伺服器儲存尚未完成':'流程內容已儲存');}catch(error){const current=document.querySelector('#inspector-form .inspector-actions');let notice=document.querySelector('#operation-apply-error');if(!notice&&current){notice=document.createElement('p');notice.id='operation-apply-error';notice.setAttribute('role','alert');notice.dataset.i18nSkip='true';current.before(notice);}if(notice){notice.textContent=(document.documentElement.lang==='vi'?'Không thể áp dụng; giữ nguyên nội dung: ':'套用未完成，輸入已保留：')+(error.message||'SYNC_FAILED');notice.scrollIntoView({block:'nearest'});}toast(error.message||'儲存失敗，內容已保留在目前頁面');}finally{apply.disabled=false;}};}
    window.ProcessIPQC?.mountInspector(form,op);
    bindLightbox();
    if(activeOperation&&dialog.isConnected&&!dialog.open){dialog.showModal();document.body.classList.add('editor-modal-open');}
  }
  const previousInspector=renderInspector;
  renderInspector=function(op){previousInspector(op);decorateInspector(op);};
  function openEditor(op){activeOperation=op;originalOperation=structuredClone(op);originalWorkspaceApplicability=Object.fromEntries(Object.values(ensureCategoryEditor()).flat().map(item=>[item.id,{productCodes:structuredClone(item.productCodes||[]),bomSelections:structuredClone(item.bomSelections||{}),bomProductCode:item.bomProductCode||'',bomItems:structuredClone(item.bomItems||[])}]));modalDirty=false;state.editingOperationProductCodes=[...(op.productCodes||[])];state.selectedOperation=op.id;renderInspector(op);}
  window.ProcessOpenOperation=openEditor;
  function persistCoordinates(){if(window.ProcessAuthoringV3?.enabled()){const pending=window.ProcessAuthoringV3.sync();pending.catch(error=>toast(error.message||'同步失敗，請檢查同步狀態；工作內容仍保留'));return pending;}localStorage.setItem('processEditor:'+editorKey(),JSON.stringify({category:state.category,line:state.editorLine,stages:ensureCategoryEditor(),savedAt:new Date().toISOString()}));}
  const snapshots=()=>Object.fromEntries(Object.values(ensureCategoryEditor()).flat().map(op=>[op.id,{x:op.x,y:op.y}]));
  function decorateEditor(){
    if(document.querySelector('.pe-editor'))return;
    const page=document.querySelector('.editor-page');if(!page)return;
    page.querySelector('.editor-resizer')?.remove();
    page.querySelectorAll('[data-link-from]').forEach(line=>line.onclick=event=>{event.stopPropagation();if(page.classList.contains('editor-readonly')||window.ProcessAuthoringV3?.enabled()&&!window.ProcessAuthoringV3.canMutate())return;if(!confirm('確定刪除這條流程連線？'))return;const op=operationById(line.dataset.linkFrom);if(!op)return;op.nextIds=(op.nextIds||[]).filter(id=>id!==line.dataset.linkTo);persistCoordinates();render();toast(window.ProcessAuthoringV3?.enabled()?'Đã thay đổi liên kết · chưa lưu / 連線已修改，尚未儲存':window.ProcessSync?.paused?'變更已保留於目前畫面，尚未完成儲存':'連線已刪除');});
    const toolbar=page.querySelector('.editor-toolbar');if(toolbar&&!toolbar.querySelector('#undo-layout')){const b=document.createElement('button');b.id='undo-layout';b.className='button ghost';b.textContent='復原位置';b.disabled=!state.positionUndo;b.onclick=()=>{if(!state.positionUndo||window.ProcessAuthoringV3?.enabled()&&!window.ProcessAuthoringV3.canMutate())return;Object.values(ensureCategoryEditor()).flat().forEach(op=>Object.assign(op,state.positionUndo[op.id]||{}));state.positionUndo=null;persistCoordinates();render();};toolbar.append(b);}
    page.querySelectorAll('.auto-layout-stage,.arrange-all-stages').forEach(b=>{if(b.dataset.undoBound)return;b.dataset.undoBound='1';b.addEventListener('click',()=>{state.positionUndo=snapshots();setTimeout(persistCoordinates,0);},true);});
    page.querySelectorAll('.operation-block').forEach(block=>{
      const op=operationById(block.dataset.operation);if(!op)return;block.draggable=false;
      block.ondragstart=null;block.ondrop=null;block.ondragover=null;
      block.onkeydown=event=>{if(event.target!==block||!['Enter',' '].includes(event.key))return;event.preventDefault();openEditor(op)};
      if(!block.querySelector('.operation-move-handle'))block.insertAdjacentHTML('afterbegin','<span class="operation-move-handle" role="button" tabindex="0" aria-label="移動方塊">⠿</span><span class="operation-link-handle" role="button" tabindex="0" aria-label="拖曳建立連線"></span>');
      const count=block.querySelector('small');if(count)count.textContent=(op.productCodes?.length||0)+' 項適用產品';
      block.querySelector('.operation-product-content')?.remove();
      if((op.productCodes||[]).length)block.insertAdjacentHTML('beforeend',`<button type="button" class="operation-product-content" title="查看產品專屬流程與照片">${document.querySelector('.editor-readonly')?'產品內容':'產品照片設定'}</button>`);
      const type=window.ProcessOperationPresentation?.operationTypeMeta(op)||{key:'custom',label:'自訂流程'};
      block.classList.forEach(name=>{if(name.startsWith('process-type-'))block.classList.remove(name)});block.classList.add(`process-type-${type.key}`);block.querySelector('.process-type-badge')?.remove();block.insertAdjacentHTML('beforeend',`<span class="process-type-badge">${escapeHtml(type.label)}</span>`);
      const operationTitle=block.querySelector('strong'),repeatedTitle=(op.name||'').trim()===type.label;operationTitle?.classList.toggle('is-repeated-process-title',repeatedTitle);block.classList.toggle('has-repeated-process-title',repeatedTitle);
      const presentation=window.ProcessOperationPresentation,baseGroups=presentation?.operationMediaGroups(op,'')||[],workItems=baseGroups.find(group=>group.key==='common')?.items||[],machineItems=baseGroups.find(group=>group.key==='machine')?.items||[],productItems=uniqueCardMedia((op.productCodes||[]).flatMap(code=>op.productMediaItems?.[code]||[])),mediaGroups=[{key:'machine',label:'機器照片',items:machineItems},{key:'work',label:'作業照片',items:workItems},{key:'product',label:'產品照片',items:productItems}].filter(group=>group.items.length);block.querySelector('.operation-thumb')?.remove();block.querySelector('.operation-card-gallery')?.remove();block.querySelector('.operation-template-gallery')?.remove();block.querySelector('.operation-template-chip')?.remove();block.querySelector('.operation-card-media-sections')?.remove();

      if(mediaGroups.length){block.insertAdjacentHTML('beforeend',`<div class="operation-card-media-sections media-category-count-${mediaGroups.length}">${mediaGroups.map(group=>operationCardMediaGroup(op,group)).join('')}</div>`);}
      block.querySelector('.operation-bom-count')?.remove();const selectedBom=(op.productCodes||[]).reduce((sum,code)=>sum+(op.bomSelections?.[code]||[]).length,0),totalBom=(op.productCodes||[]).reduce((sum,code)=>sum+rootBom(code).length,0);block.insertAdjacentHTML('beforeend',`<span class="operation-bom-count">BOM ${selectedBom}/${totalBom}</span>`);
      block.querySelectorAll('.operation-template-chip,.operation-card-media-sections').forEach(gallery=>gallery.onclick=event=>event.stopPropagation());
    });
    page.querySelectorAll('[data-stage-canvas]').forEach(canvas=>{canvas.ondrop=null;canvas.ondragover=null;const ops=ensureCategoryEditor()[canvas.dataset.stageCanvas]||[],inner=canvas.querySelector('.flow-zoom-content')||canvas,svg=canvas.querySelector('svg');const w=Math.max(canvas.clientWidth,...ops.map((op,i)=>operationGeometry(op,i).x+nodeSize.width+100)),height=Math.max(430,...ops.map((op,i)=>operationGeometry(op,i).y+nodeSize.height+80));canvas.style.height=Math.min(Math.max(430,height),760)+'px';inner.style.width=w+'px';inner.style.height=height+'px';if(svg){svg.setAttribute('width',w);svg.setAttribute('height',height);}});
    bindLightbox();
  }
  const oldBindView=bindView;bindView=function(){oldBindView();if(state.view==='editor')decorateEditor();};
  function captureEditorViewport(){
    const anchorId=state.editorViewportAnchorOperationId,anchor=anchorId?document.querySelector(`[data-operation="${CSS.escape(anchorId)}"]`):null;
    return {x:window.scrollX,y:window.scrollY,anchorId,anchorRect:anchor?.getBoundingClientRect()||null,canvases:Object.fromEntries([...document.querySelectorAll('[data-stage-canvas]')].map(canvas=>[canvas.dataset.stageCanvas,{left:canvas.scrollLeft,top:canvas.scrollTop}]))};
  }
  function revealInsideCanvas(element){
    const canvas=element?.closest('[data-stage-canvas]');if(!element||!canvas)return;
    const rect=element.getBoundingClientRect(),bounds=canvas.getBoundingClientRect();
    if(rect.left<bounds.left+18)canvas.scrollLeft-=bounds.left+24-rect.left;
    else if(rect.right>bounds.right-18)canvas.scrollLeft+=rect.right-bounds.right+24;
    if(rect.top<bounds.top+18)canvas.scrollTop-=bounds.top+24-rect.top;
    else if(rect.bottom>bounds.bottom-18)canvas.scrollTop+=rect.bottom-bounds.bottom+24;
  }
  function restoreEditorViewport(snapshot,focusId,focusDiagnostic){
    if(!snapshot||state.view!=='editor')return;
    window.scrollTo(snapshot.x,snapshot.y);
    Object.entries(snapshot.canvases).forEach(([stageCode,position])=>{const canvas=document.querySelector(`[data-stage-canvas="${CSS.escape(stageCode)}"]`);if(canvas){canvas.scrollLeft=position.left;canvas.scrollTop=position.top;}});
    if(snapshot.anchorId&&snapshot.anchorRect){const block=document.querySelector(`[data-operation="${CSS.escape(snapshot.anchorId)}"]`),canvas=block?.closest('[data-stage-canvas]');if(block&&canvas){const rect=block.getBoundingClientRect();canvas.scrollLeft+=rect.left-snapshot.anchorRect.left;canvas.scrollTop+=rect.top-snapshot.anchorRect.top;}}
    const focus=focusId?document.querySelector(`[data-operation="${CSS.escape(focusId)}"]`):focusDiagnostic?document.querySelector('[data-diagnostic-placeholder]'):null;
    if(focus){revealInsideCanvas(focus);focus.classList.add('new-operation-focus');setTimeout(()=>focus.classList.remove('new-operation-focus'),1400);}
    window.scrollTo(snapshot.x,snapshot.y);
  }
  const stableRender=render;
  render=function(){
    const skipRestore=!!state.skipEditorViewportRestore,
      snapshot=!skipRestore&&state.view==='editor'&&document.querySelector('.editor-page')?captureEditorViewport():null,
      focusId=state.focusOperationAfterRender||'',focusDiagnostic=!!state.focusDiagnosticAfterRender;
    delete state.skipEditorViewportRestore;delete state.focusOperationAfterRender;delete state.focusDiagnosticAfterRender;delete state.editorViewportAnchorOperationId;
    stableRender();
    if(snapshot&&state.view==='editor'){
      restoreEditorViewport(snapshot,focusId,focusDiagnostic);
      requestAnimationFrame(()=>restoreEditorViewport(snapshot,focusId,focusDiagnostic));
    }
  };
  // Delegation survives every canvas redraw. Handles own all pointer gestures.
  document.addEventListener('click',event=>{
    const block=event.target.closest('.editor-page .operation-block');if(!block)return;
    if(event.target.closest('.operation-delete'))return;
    const media=event.target.closest('[data-lightbox-src]');if(media){event.preventDefault();event.stopImmediatePropagation();media.onclick?.({stopPropagation(){}});return;}
    event.preventDefault();event.stopImmediatePropagation();
    if(Date.now()<suppressClickUntil||event.target.closest('.operation-move-handle,.operation-link-handle'))return;
    const op=operationById(block.dataset.operation);if(!op)return;
    openEditor(op);
    if(event.target.closest('.operation-product-content'))requestAnimationFrame(()=>document.querySelector('.product-note-panel')?.scrollIntoView({block:'start'}));
  },true);
  function validTarget(source,target){if(!target||source.stageCode!==target.stageCode||source.id===target.id)return false;if(source.nextIds?.includes(target.id))return false;return !wouldCreateCycle(ensureCategoryEditor()[source.stageCode]||[],source.id,target.id);}
  function targetAt(x,y,sourceBlock,canvas){
    for(const element of document.elementsFromPoint(x,y)){
      const block=element.closest?.('.editor-page .operation-block');
      if(block&&block!==sourceBlock&&block.closest('[data-stage-canvas]')===canvas)return {block,op:operationById(block.dataset.operation)};
    }
    return null;
  }
  function targetError(source,target){
    if(!target)return '請放到同一工段的另一個方塊';
    if(source.nextIds?.includes(target.id))return '這兩個方塊已經連線';
    if(wouldCreateCycle(ensureCategoryEditor()[source.stageCode]||[],source.id,target.id))return '此連線會形成循環，已取消';
    return '無法建立這條流程連線';
  }
  function overlapsOperation(source){
    const sourceBox=operationGeometry(source,0);
    return (ensureCategoryEditor()[source.stageCode]||[]).some((other,index)=>{
      if(other.id===source.id)return false;
      const box=operationGeometry(other,index);
      return sourceBox.x<box.x+nodeSize.width&&sourceBox.x+nodeSize.width>box.x&&sourceBox.y<box.y+nodeSize.height&&sourceBox.y+nodeSize.height>box.y;
    });
  }
  function makePreview(){const preview=document.createElementNS('http://www.w3.org/2000/svg','svg');preview.classList.add('pointer-link-preview');preview.innerHTML='<defs><marker id="pointer-preview-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4b32"></path></marker></defs><line stroke="#ef4b32" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#pointer-preview-arrow)"/>';document.body.append(preview);return preview;}
  document.addEventListener('pointerdown',event=>{
    if(event.button!==0||document.querySelector('dialog[open]'))return;
    const handle=event.target.closest('.operation-move-handle,.operation-link-handle'),canvas=event.target.closest('[data-stage-canvas]');
    if(!canvas)return;
    const block=event.target.closest('.operation-block');if(event.target.closest('.operation-delete,.operation-product-content,[data-link-from],[data-lightbox-src]'))return;
    if(block&&document.querySelector('.editor-readonly'))return;
    if(block&&window.ProcessAuthoringV3?.enabled()&&!window.ProcessAuthoringV3.canMutate()){toast('Đang đồng bộ hoặc bị khóa · 請待同步完成或解除鎖定');return;}
    event.preventDefault();event.stopImmediatePropagation();
    const op=block?operationById(block.dataset.operation):null,scale=Number(canvas.dataset.flowScale)||1,
      kind=handle?.classList.contains('operation-link-handle')?'link':handle?.classList.contains('operation-move-handle')?'move':block?(event.pointerType==='mouse'?'move-link':'tap'):'pan';
    if(canvas.dataset.flowZoomKey){state.flowZoomManual[canvas.dataset.flowZoomKey]=true;state.flowZoom[canvas.dataset.flowZoomKey]=scale;}
    gesture={id:event.pointerId,kind,canvas,block,op,scale,x:event.clientX,y:event.clientY,left:canvas.scrollLeft,top:canvas.scrollTop,origin:op?{...operationGeometry(op,0)}:null,before:op?structuredClone(op):null,moved:false,handle:!!handle};
    canvas.setPointerCapture(event.pointerId);
    if(gesture.kind==='link'){gesture.preview=makePreview();}
    block?.classList.add('is-moving');canvas.classList.add('gesture-active');
  },true);
  document.addEventListener('pointermove',event=>{
    const g=gesture;if(!g||g.id!==event.pointerId)return;event.preventDefault();
    if(!g.moved&&Math.hypot(event.clientX-g.x,event.clientY-g.y)<5)return;g.moved=true;
    if(g.kind==='tap')return;
    if(g.kind==='pan'){g.canvas.scrollLeft=g.left-(event.clientX-g.x);g.canvas.scrollTop=g.top-(event.clientY-g.y);return;}
    if(g.kind==='move'||g.kind==='move-link'){g.op.x=Math.max(8,g.origin.x+(event.clientX-g.x)/g.scale);g.op.y=Math.max(8,g.origin.y+(event.clientY-g.y)/g.scale);g.block.style.left=g.op.x+'px';g.block.style.top=g.op.y+'px';}
    if(g.kind==='move')return;
    const candidate=targetAt(event.clientX,event.clientY,g.block,g.canvas),target=candidate?.op;
    document.querySelectorAll('.link-target').forEach(b=>b.classList.remove('link-target'));
    g.candidate=target||null;g.target=validTarget(g.op,target)?target:null;if(g.target)candidate.block.classList.add('link-target');
    if(!g.preview&&(g.kind==='link'||g.candidate))g.preview=makePreview();
    if(g.preview){g.preview.hidden=g.kind==='move-link'&&!g.candidate;const line=g.preview.querySelector('line');Object.entries({x1:g.x,y1:g.y,x2:event.clientX,y2:event.clientY}).forEach(([k,v])=>line.setAttribute(k,v));}
  },{capture:true,passive:false});
  function finishGesture(event,cancel=false){
    const g=gesture;if(!g||g.id!==event.pointerId)return;
    if(!cancel&&(g.kind==='link'||g.kind==='move-link')){const dropped=targetAt(event.clientX,event.clientY,g.block,g.canvas);if(dropped){g.candidate=dropped.op;g.target=validTarget(g.op,dropped.op)?dropped.op:null;}}
    gesture=null;suppressClickUntil=Date.now()+350;
    g.canvas.releasePointerCapture?.(event.pointerId);g.block?.classList.remove('is-moving');g.canvas.classList.remove('gesture-active');g.preview?.remove();document.querySelectorAll('.link-target').forEach(b=>b.classList.remove('link-target'));
    if(g.kind==='pan'||g.kind==='tap'&&g.moved)return;
    if(!g.moved&&!cancel){if(!g.handle)openEditor(g.op);return;}
    if(cancel){Object.assign(g.op,g.before);render();return;}
    const linkDrop=g.kind==='link'||g.kind==='move-link'&&g.candidate;
    if(linkDrop){
      if(g.kind==='move-link')Object.assign(g.op,g.before);
      if(!g.target){toast('連線已取消：'+targetError(g.op,g.candidate));render();return;}
      if(g.op.nextIds?.length&&!confirm('此流程已有下一流程，是否改接到新方塊？')){render();return;}
      g.op.nextIds=[g.target.id];
      state.positionUndo=snapshots();autoLayoutStage(g.op.stageCode);
    }else if((g.kind==='move'||g.kind==='move-link')&&overlapsOperation(g.op)){
      Object.assign(g.op,g.before);toast('位置未變更：方塊不可互相重疊');render();return;
    }
    persistCoordinates();
    if(linkDrop)toast(window.ProcessSync?.paused?'變更已保留於目前畫面，尚未完成儲存':'連線建立完成，畫面已依箭頭方向整理');
    const left=g.canvas.scrollLeft,top=g.canvas.scrollTop,stage=g.canvas.dataset.stageCanvas;render();const next=document.querySelector('[data-stage-canvas="'+CSS.escape(stage)+'"]');if(next){next.scrollLeft=left;next.scrollTop=top;}
  }
  document.addEventListener('pointerup',e=>finishGesture(e),true);
  document.addEventListener('pointercancel',e=>finishGesture(e,true),true);
  if(currentUser){if(new URL(location.href).searchParams.has('dataTab'))navigate('data');else render();}else renderLogin();
})();

(function(){
  const permissionGroups=[
    {id:"approval",view:"approval",title:"版本確認平台",icon:"✓",description:"控制版本查看、比較與主管確認動作",items:[
      ["approval.viewAll","查看全部版本"],["approval.viewLine","查看授權線版本"],["approval.compare","版本差異比對"],["approval.withdraw","解除送審，繼續修改"],["approval.approve","確認版本"],["approval.reject","退回修改"],["approval.requestChange","要求修改"],["approval.revoke","返回確認"],["approval.revise","由舊版建立修訂"]
    ]},
    {id:"editor",view:"editor",title:"製程編輯台",icon:"◇",description:"控制建立、儲存與送審製程版本",items:[
      ["approval.submit","建立／重新送審"]
    ]},
    {id:"status",view:"productStatus",title:"產品製程狀態",icon:"▣",description:"控制可查看的線別及方塊內容",items:[
      ["status.viewAllLines","查看全部線別"],["status.viewDetails","查看 BOM／設備／IPQC"],["status.viewMedia","查看操作照片／影片"]
    ]},
    {id:"master",view:"data",title:"主資料後台",icon:"▤",description:"控制後台刪除與 Excel 資料交換",items:[
      ["master.delete","刪除類別／產品／線別／工段"],["master.import","匯入 Excel 資料"],["master.export","匯出 Excel 資料"]
    ]}
  ];
  const allPermissions=permissionGroups.flatMap(group=>group.items.map(item=>item[0]));
  const templates={
    admin:{views:["dashboard","player","dispatch","productStatus","approval","editor","data"],lines:["A","B","C"],permissions:allPermissions},
    rd:{views:["dashboard","productStatus","approval","editor","data"],lines:["A","B","C"],permissions:["approval.viewAll","approval.compare","approval.approve","approval.reject","approval.requestChange","approval.revoke","approval.revise","status.viewAllLines","status.viewDetails","status.viewMedia","master.delete","master.import","master.export"]},
    staff:{views:["dashboard","productStatus","approval","editor","data"],lines:["A"],permissions:["approval.viewLine","approval.compare","approval.submit","approval.withdraw","approval.revise","status.viewDetails","status.viewMedia"]}
  };
  const builtInRoleNames={admin:"ADMIN",rd:"RD 主管",staff:"製程人員（STAFF）"};
  const roleNames={...builtInRoleNames};
  const customTemplates=(()=>{try{return JSON.parse(localStorage.getItem('processCustomRoles')||'[]')}catch{return []}})();
  customTemplates.forEach(item=>{templates[item.id]=item;roleNames[item.id]=item.name});
  const saveTemplates=()=>localStorage.setItem('processCustomRoles',JSON.stringify(customTemplates));
  const roleOverrides=(()=>{try{return JSON.parse(localStorage.getItem('processRoleTemplateOverrides')||'{}')}catch{return {}}})();
  const builtInTemplates=JSON.parse(JSON.stringify(Object.fromEntries(['admin','rd','staff'].map(id=>[id,templates[id]]))));
  function refresh(){for(const key of Object.keys(roleNames))delete roleNames[key];Object.assign(roleNames,builtInRoleNames);customTemplates.splice(0,customTemplates.length,...readStore('processCustomRoles',[]));for(const key of Object.keys(roleOverrides))delete roleOverrides[key];Object.assign(roleOverrides,readStore('processRoleTemplateOverrides',{}));Object.keys(templates).forEach(id=>delete templates[id]);Object.assign(templates,JSON.parse(JSON.stringify(builtInTemplates)));for(const item of readStore('processCustomRoles',[])){templates[item.id]=item;roleNames[item.id]=item.name;}for(const [id,value] of Object.entries(readStore('processRoleTemplateOverrides',{}))){if(id!=='admin'&&templates[id]){templates[id]={...templates[id],...value};if(value.name)roleNames[id]=value.name;}}templates.admin=JSON.parse(JSON.stringify(builtInTemplates.admin));}
  refresh();
  const saveRoleScope=role=>{const value={views:[...templates[role].views],lines:[...templates[role].lines],permissions:[...templates[role].permissions]};if(role.startsWith('custom_')){const item=customTemplates.find(entry=>entry.id===role);if(item)Object.assign(item,value);saveTemplates();}else{roleOverrides[role]=value;localStorage.setItem('processRoleTemplateOverrides',JSON.stringify(roleOverrides));}};
  const navItems=[["dashboard","▦","總覽"],["player","▶","產線播放台"],["dispatch","↗","發送介面"],["productStatus","▣","產品製程狀態"],["approval","✓","版本確認平台"],["editor","◇","製程編輯台"],["data","▤","資料後台"]];
  function ensurePermissions(user){if(user.cells)return user;if(user.role==='device'||user.role==='viewer')return user;const role=templates[user.role]?user.role:'staff',preset=templates[role],inherit=user.inheritRole!==false||role==='admin';user.id=String(user.id||'').trim().toLowerCase();user.role=role;user.enabled=user.enabled!==false;user.inheritRole=inherit;if(inherit){user.permissions=[...preset.permissions];user.views=[...preset.views];user.lines=[...preset.lines]}else{user.permissions=[...new Set(user.permissions||[])];user.views=[...new Set(user.views||[])];user.lines=[...new Set(user.lines||[])]}return user}
  window.normalizePlatformUser=ensurePermissions;
  window.ProcessRoles={templates,roleNames,permissionGroups,navItems,ensurePermissions,refresh};
  platformUsers.forEach(ensurePermissions);if(currentUser)ensurePermissions(currentUser);
  if(currentUser){const stored=platformUsers.find(user=>user.id===currentUser.id);if(stored){currentUser.views=[...stored.views];currentUser.lines=[...stored.lines];currentUser.permissions=[...stored.permissions];}}
  // Normalizing the working cache is not a user edit; do not post it on startup.
  function allowed(key){if(currentUser?.enabled===false)return false;if(window.ProcessSync?.protected&&!window.ProcessSync.identity&&!key.startsWith('status.')&&!['approval.viewAll','approval.viewLine','approval.compare'].includes(key))return false;const policy=window.ProcessAccessPolicy,cells=currentUser?.cells,workflowModule=window.ProcessSync?.destination?.module||policy?.moduleForURL(location.href),op=policy?.operationForLegacy(key);if(cells&&workflowModule&&op&&policy.accessKeys.includes(workflowModule+'.'+op))return cells[workflowModule+'.'+op]===true;if(cells&&policy?.accessKeys.includes(key))return cells[key]===true;if(key.startsWith('view:'))return !!currentUser?.views?.includes(key.slice(5));const group=permissionGroups.find(g=>g.items.some(([id])=>id===key));return !!currentUser?.permissions?.includes(key)&&(!group||currentUser.views?.includes(group.view))}
  window.hasPermission=allowed;
  canApprove=function(){return ["approval.approve","approval.reject","approval.requestChange","approval.revoke"].some(allowed)};

  function permissionsView(){
    const roleOptions=Object.keys(templates).map(id=>`<option value="${escapeHtml(id)}">${escapeHtml(roleNames[id]||id)}</option>`).join('');
    return `<section class="permission-admin"><div class="permission-intro"><div><p class="eyebrow">ROLE & MODULE PERMISSIONS</p><h2>使用者與平台權限</h2><p>新增使用者時選擇角色；角色的共用權限在下方統一設定。</p></div><div class="permission-legend"><span><i class="access-dot nav"></i>功能入口</span><span><i class="access-dot action"></i>平台內操作</span><span><i class="access-dot scope"></i>資料範圍</span></div></div><section class="role-template-builder"><div><b>建立角色範本</b><span>以現有角色為基礎建立，再套用到使用者。</span></div><div class="field"><label>新角色名稱</label><input id="new-role-template-name" maxlength="30" placeholder="例如：資料維護主管"></div><div class="field"><label>基礎權限</label><select id="new-role-template-base"><option value="staff">人員</option><option value="rd">主管</option><option value="admin">ADMIN</option></select></div><button class="button ghost" id="create-role-template">＋ 建立角色</button>${customTemplates.length?`<div class="custom-role-list">${customTemplates.map(item=>`<span>${escapeHtml(item.name)}<button data-delete-role-template="${escapeHtml(item.id)}" aria-label="刪除角色 ${escapeHtml(item.name)}">×</button></span>`).join('')}</div>`:''}</section><section class="user-create-v2"><div class="field"><label>帳號</label><input id="new-user-id" placeholder="例如 chen.rd"></div><div class="field"><label>姓名</label><input id="new-user-name" placeholder="使用者姓名"></div><div class="field"><label>密碼</label><input id="new-user-password" type="password"></div><div class="field role-choice-field"><label>角色範本</label><select id="new-user-role">${roleOptions}</select></div><button class="button signal" id="add-user">建立使用者</button></section>${roleEditor()}</section>`;
  }
  const roleTone=role=>['admin','rd','staff'].includes(role)?role:'custom';
  const roleInitial=role=>role==='admin'?'AD':role==='rd'?'主管':role==='staff'?'人員':'自訂';
  const roleCheck=(type,key,label,checked)=>`<label class="role-scope-check"><input type="checkbox" data-role-${type}="${escapeHtml(key)}" ${checked?'checked':''}><span>${label}</span></label>`;
  function roleScope(role){const preset=templates[role]||templates.staff,tone=roleTone(role);return `<section class="role-scope ${tone}" data-role-scope-for="${escapeHtml(role)}"><header><div><span class="role-scope-mark">${roleInitial(role)}</span><div><b>${escapeHtml(roleNames[role]||role)}權限範圍</b><small>先設定可進入的介面，再依介面設定可執行的操作。</small></div></div></header><div class="role-scope-block role-scope-lines"><b>① 線別資料範圍</b><small>限制此角色可查看及編輯的產線資料</small><div>${['A','B','C'].map(line=>roleCheck('line',line,`${line} 線`,preset.lines.includes(line))).join('')}</div></div><div class="role-scope-block role-scope-views"><b>② 可進入的介面</b><small>未勾選的介面不會出現在左側選單</small><div>${navItems.map(([id,icon,label])=>roleCheck('view',id,`${icon} ${label}`,preset.views.includes(id))).join('')}</div></div><div class="role-permission-heading"><b>③ 各介面的操作權限</b><small>未開放上方介面時，對應的操作權限會自動關閉。</small></div>${permissionGroups.map(group=>`<section class="role-scope-block permission-scope-block" data-requires-view="${group.view}"><header><span>${group.icon}</span><div><b>作用介面：${group.title}</b><small>${group.description}</small><em class="permission-lock-note">請先勾選上方「${group.title}」介面</em></div></header><div>${group.items.map(([key,label])=>roleCheck('permission',key,label,preset.permissions.includes(key))).join('')}</div></section>`).join('')}</section>`}
  function syncRolePermissionAvailability(scope){
    scope?.querySelectorAll('[data-requires-view]').forEach(group=>{
      const enabled=!!scope.querySelector(`[data-role-view="${group.dataset.requiresView}"]`)?.checked;
      group.classList.toggle('is-disabled',!enabled);
      group.querySelectorAll('[data-role-permission]').forEach(input=>{input.disabled=!enabled;if(!enabled)input.checked=false;});
    });
  }
  function roleOptions(selected){return Object.keys(templates).map(id=>`<option value="${escapeHtml(id)}" ${id===selected?'selected':''}>${escapeHtml(roleNames[id]||id)}</option>`).join('')}
  function roleEditor(){const role=localStorage.getItem('processRoleEditorSelection')&&templates[localStorage.getItem('processRoleEditorSelection')]?localStorage.getItem('processRoleEditorSelection'):'admin',tone=roleTone(role);return `<article class="user-card-v2 role-template-editor" data-edit-role="${escapeHtml(role)}"><header><div><h3>角色權限設定</h3><p>選擇一個角色後，直接修改該角色的共用範圍。</p></div><span class="role-pill ${tone}">${escapeHtml(roleNames[role]||role)}</span></header><div class="role-assignment"><label>選擇角色<select id="role-permission-choice">${roleOptions(role)}</select></label></div><div id="role-permission-scope">${roleScope(role)}</div><footer><div><b>角色統一管理</b><span>儲存後，所有使用此角色的人會立即套用</span></div><button class="button signal" id="save-role-permissions">儲存角色權限</button></footer></article>`}

  const _originalUserManagementView=userManagementView,originalBindDataInner=bindDataInner,originalBindView=bindView;
  userManagementView=permissionsView;
  bindDataInner=function(tab){
    originalBindDataInner(tab);if(tab!=="users")return;platformUsers.forEach(ensurePermissions);
    const roleSelect=document.querySelector('#new-user-role');
    const editor=document.querySelector('.role-template-editor'),editorSelect=document.querySelector('#role-permission-choice'),editorScope=document.querySelector('#role-permission-scope');
    const bindScopeDependencies=()=>{editorScope?.querySelectorAll('[data-role-view]').forEach(input=>input.addEventListener('change',()=>syncRolePermissionAvailability(editorScope)));syncRolePermissionAvailability(editorScope);};
    bindScopeDependencies();
    editorSelect?.addEventListener('change',()=>{const role=editorSelect.value,tone=roleTone(role),badge=editor.querySelector('.role-pill');editor.dataset.editRole=role;badge.className=`role-pill ${tone}`;badge.textContent=roleNames[role]||role;editorScope.innerHTML=roleScope(role);bindScopeDependencies();localStorage.setItem('processRoleEditorSelection',role);});
    document.querySelector('#save-role-permissions')?.addEventListener('click',()=>{const role=editor.dataset.editRole,preset=templates[role];preset.lines=[...editor.querySelectorAll('[data-role-line]:checked')].map(input=>input.dataset.roleLine);preset.views=[...editor.querySelectorAll('[data-role-view]:checked')].map(input=>input.dataset.roleView);preset.permissions=[...editor.querySelectorAll('[data-role-permission]:checked')].map(input=>input.dataset.rolePermission);saveRoleScope(role);platformUsers.filter(user=>user.role===role).forEach(ensurePermissions);if(currentUser?.role===role)ensurePermissions(currentUser);persistPlatform();toast(`「${roleNames[role]||role}」角色權限已儲存`)});
    document.querySelector('#create-role-template')?.addEventListener('click',()=>{const name=document.querySelector('#new-role-template-name')?.value.trim(),base=document.querySelector('#new-role-template-base')?.value||'staff';if(!name){toast('請輸入新角色名稱');return}if(Object.values(roleNames).some(value=>value===name)){toast('角色名稱已存在');return}const id=`custom_${Date.now()}`,source=templates[base];const item={id,name,views:[...source.views],lines:[...source.lines],permissions:[...source.permissions]};customTemplates.push(item);templates[id]=item;roleNames[id]=name;saveTemplates();document.querySelector('#data-content').innerHTML=userManagementView();bindDataInner('users');toast(`已建立角色範本：${name}`)});
    document.querySelectorAll('[data-delete-role-template]').forEach(button=>button.onclick=()=>{const id=button.dataset.deleteRoleTemplate,item=customTemplates.find(role=>role.id===id);if(platformUsers.some(user=>user.role===id)){toast('仍有使用者套用此角色，請先改用其他角色');return}if(!confirm(`刪除角色範本「${item?.name||id}」？`))return;customTemplates.splice(customTemplates.findIndex(role=>role.id===id),1);delete templates[id];delete roleNames[id];saveTemplates();document.querySelector('#data-content').innerHTML=userManagementView();bindDataInner('users')});
    const add=document.querySelector("#add-user");if(add)add.onclick=()=>{const id=document.querySelector("#new-user-id").value.trim(),name=document.querySelector("#new-user-name").value.trim(),password=document.querySelector("#new-user-password").value,role=roleSelect.value,preset=templates[role]||templates.staff;if(!id||!name){toast("請輸入帳號與姓名");return}if(platformUsers.some(user=>user.id===id)){toast("此帳號已存在");return}platformUsers.push({id,name,password,role,lines:[...preset.lines],views:[...preset.views],permissions:[...preset.permissions]});persistPlatform();document.querySelector("#data-content").innerHTML=userManagementView();bindDataInner("users");toast(`使用者已建立，角色：${roleNames[role]||role}`)}
  };

  function enforcePagePermissions(){
    if(state.view==="approval"){
      document.querySelector("#approval-compare-version")?.toggleAttribute("disabled",!allowed("approval.compare"));
      document.querySelectorAll("[data-version-action]").forEach(button=>{const permission={approve:"approval.approve",reject:"approval.reject","request-change":"approval.requestChange",revoke:"approval.revoke",withdraw:"approval.withdraw"}[button.dataset.versionAction];if(permission&&!allowed(permission))button.hidden=true});
      document.querySelectorAll("[data-edit-version][data-revise]").forEach(button=>button.hidden=!allowed("approval.revise"));
      document.querySelectorAll("[data-v2-version]").forEach(button=>{const version=approvalVersions.find(item=>item.id===button.dataset.v2Version),canSee=allowed("approval.viewAll")||allowed("approval.viewLine")&&currentUser.lines?.includes(version?.line)||version?.creatorId===currentUser?.id;button.hidden=!canSee});
    }
    if(state.view==="editor"){
      const save=document.querySelector("#save-process");if(save&&!allowed("approval.submit")){save.disabled=true;save.title="此帳號沒有建立／送審版本權限"}
      document.querySelector("#create-revision")?.toggleAttribute("hidden",!allowed("approval.revise"));
    }
    if(state.view==="productStatus"){
      if(!allowed("status.viewDetails"))document.querySelectorAll(".status-compact-list,.status-compact-machines,.status-node-notes").forEach(element=>element.hidden=true);
      if(!allowed("status.viewMedia"))document.querySelectorAll(".status-media-gallery,.status-no-photo").forEach(element=>element.hidden=true);
      if(!allowed("status.viewAllLines")){document.querySelectorAll("#product-select option").forEach(option=>{const route=routeFor(option.value);option.hidden=route?.line&&!currentUser.lines?.includes(route.line)})}
    }
  }
  bindView=function(){originalBindView();enforcePagePermissions()};
  if(currentUser){applyPlatformIdentity();render()}
})();

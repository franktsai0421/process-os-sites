(function(){
  const copy=value=>JSON.parse(JSON.stringify(value||{}));
  const labels={draft:"草稿 · 未送審",pending:"主管審核中",approved:"已確認",superseded:"歷史版本",rejected:"待修改"};
  const versionsForRoute=()=>approvalVersions.filter(version=>version.category===state.category&&version.line===state.editorLine).sort((a,b)=>(b.number||0)-(a.number||0));
  const selectedVersion=()=>approvalVersions.find(version=>version.id===state.editorVersionId);
  const timeLabel=value=>new Date(value).toLocaleString("zh-TW",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});

  function loadVersion(version){
    state.editorVersionId=version.id;state.editorByCategory[editorKey()]=copy(version.stages);state.selectedOperation=Object.values(version.stages||{}).flat()[0]?.id||null;render()
  }

  function autoOpenCurrentVersion(){
    if(state.view!=="editor"||state.editorVersionId)return false;const latest=versionsForRoute()[0];if(!latest)return false;
    const saved=readStore(`processEditor:${editorKey()}`,null);
    // Operation Apply/drag saves the workspace independently of the version snapshot.
    // Reopening a draft must not replace that newer workspace with its older version.
    if(latest.status==="draft"&&saved?.category===state.category&&saved?.line===state.editorLine&&saved?.stages&&saved.savedAt>=(latest.updatedAt||latest.createdAt)){
      state.editorVersionId=latest.id;render();return true;
    }
    loadVersion(latest);return true
  }

  function lockEditor(message){
    document.querySelector(".editor-page")?.classList.add("editor-readonly","editor-submitted-lock");
    document.querySelectorAll(".add-operation,.auto-layout-stage,.arrange-all-stages,.operation-delete,#save-process").forEach(element=>{element.disabled=true;element.style.pointerEvents="none"});
    document.querySelectorAll(".operation-block").forEach(block=>block.setAttribute("draggable","false"));
    document.querySelectorAll("#inspector-form input,#inspector-form select,#inspector-form textarea,#inspector-form button").forEach(element=>element.disabled=true);
    const save=document.querySelector("#save-process");if(save){save.textContent=message;save.title=message}
  }

  function versionTimeline(versions,current){
    const section=document.createElement("section");section.className="editor-version-timeline collapsed";section.innerHTML=`<header><button type="button" class="timeline-toggle" aria-expanded="false"><div><p class="eyebrow">VERSION HISTORY</p><h3>歷史版本</h3></div><span>${versions.length} 個版本</span><i>展開⌄</i></button></header><div class="timeline-items">${versions.map(version=>`<button type="button" class="${version.id===current?.id?"active":""}" data-guard-version="${version.id}"><span>V${version.number}</span><b>${labels[version.status]||version.status}</b><small>${timeLabel(version.updatedAt||version.createdAt)}</small></button>`).join("")}</div>`;const toggle=section.querySelector(".timeline-toggle");toggle.onclick=()=>{const collapsed=section.classList.toggle("collapsed");toggle.setAttribute("aria-expanded",String(!collapsed));toggle.querySelector("i").textContent=collapsed?"展開⌄":"收合⌃"};section.querySelectorAll("[data-guard-version]").forEach(button=>button.onclick=()=>{const version=approvalVersions.find(item=>item.id===button.dataset.guardVersion);if(version)loadVersion(version)});return section
  }

  function enhanceEditorVersions(){
    if(localStorage.getItem('processAuthoringControl'))return;
    if(state.view!=="editor")return;if(autoOpenCurrentVersion())return;
    const versions=versionsForRoute(),current=selectedVersion(),revision=String(state.editorVersionId||"").startsWith("revision:");
    const panel=document.querySelector(".editor-version-panel");if(!panel)return;
    const select=panel.querySelector("#editor-version-select");if(select)[...select.options].forEach(option=>{const version=approvalVersions.find(item=>item.id===option.value);if(version)option.textContent=`V${version.number} · ${labels[version.status]||version.status} · ${timeLabel(version.updatedAt||version.createdAt)}`});
    panel.after(versionTimeline(versions,current));
    const notice=document.createElement("div");notice.className=`editor-version-rule ${current?.status||revision?"revision":"new"}`;
    if(current?.status==="pending"){
      notice.className="editor-version-rule pending";notice.innerHTML=`<div><b>此版本已送審，現在不能修改</b><span>解除送審後，此項目會從確認平台移除，並立即解鎖同一版本。</span></div><button class="button signal direct-withdraw" type="button">解除送審，繼續修改</button>`;notice.querySelector(".direct-withdraw").onclick=()=>window.ProcessVersionActions.changeVersionStatus(current,'withdraw');lockEditor("版本待確認，無法再次送審")
    }else if(current?.status==="draft"){
      notice.remove()
    }else if(["approved","superseded"].includes(current?.status)){
      notice.className="editor-version-rule approved";notice.innerHTML=`<div><b>V${current.number} 已鎖定</b><span>確認後不能直接修改；要變更內容請按「以此版本建立修訂」。</span></div>`
    }else if(revision){
      notice.className="editor-version-rule revision";notice.innerHTML=`<div><b>正在建立新版本草稿</b><span>先儲存草稿，檢查完成後再送出確認。</span></div>`
    }else{
      notice.innerHTML=`<div><b>尚未建立版本</b><span>完成編輯後先建立第一版草稿。</span></div>`
    }
    if(current?.status!=="draft")panel.after(notice);
    const pending=versions.find(version=>version.status==="pending"),save=document.querySelector("#save-process"),createRevision=document.querySelector("#create-revision");
    if(pending&&createRevision){createRevision.disabled=true;createRevision.style.pointerEvents="none";createRevision.textContent=`已有 V${pending.number} 待確認`}
    if(save&&!current&&pending){save.disabled=true;save.textContent="已有待確認版本"}
    if(save)save.addEventListener("click",event=>{const otherPending=versionsForRoute().find(version=>version.status==="pending"&&version.id!==state.editorVersionId);if(otherPending){event.preventDefault();event.stopImmediatePropagation();toast(`V${otherPending.number} 尚待確認，不能重複送審`)}},true)
  }

  const priorBindView=bindView;
  bindView=function(){priorBindView();enhanceEditorVersions()};
  if(currentUser)render()
})();

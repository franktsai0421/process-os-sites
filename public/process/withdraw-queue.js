(function(){
  function submittedVersions(){return approvalVersions.filter(version=>version.status!=="draft")}
  function cleanApprovalQueue(){
    if(state.view!=="approval")return false;const visible=submittedVersions(),selected=approvalVersions.find(version=>version.id===state.approvalVersionId)||approvalVersions[0];
    if(selected?.status==="draft"&&visible.length){state.approvalVersionId=visible[0].id;state.approvalCompareId=null;render();return true}
    document.querySelectorAll("[data-v2-version]").forEach(button=>{const version=approvalVersions.find(item=>item.id===button.dataset.v2Version);if(version?.status==="draft")button.remove()});
    [document.querySelector("#approval-current-version"),document.querySelector("#approval-compare-version")].forEach(select=>{if(!select)return;[...select.options].forEach(option=>{const version=approvalVersions.find(item=>item.id===option.value);if(version?.status==="draft")option.remove()})});
    const total=document.querySelector(".approval-stats span:first-child b");if(total)total.textContent=String(visible.length);
    const totalLabel=document.querySelector(".approval-stats span:first-child");if(totalLabel)totalLabel.childNodes.forEach(node=>{if(node.nodeType===Node.TEXT_NODE&&node.textContent.includes("全部版本"))node.textContent="送審版本"});
    if(!visible.length){const layout=document.querySelector(".approval-layout");if(layout)layout.innerHTML=`<section class="approval-queue-empty"><b>目前沒有待確認或已確認版本</b><p>人員解除送審後，項目會暫時從這裡移除；重新送審後會再次出現。</p></section>`}
    return false
  }
  const priorBindView=bindView;
  bindView=function(){priorBindView();cleanApprovalQueue()};
  if(currentUser)render()
})();

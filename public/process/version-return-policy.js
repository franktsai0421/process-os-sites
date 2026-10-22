(function(host){
  'use strict';
  const activeStates=new Set(['draft','pending','rejected']);
  const numberOf=item=>Number(item?.number)||0;
  const statusText=status=>({draft:'草稿',pending:'主管審核中',rejected:'退回修改',approved:'已核准',superseded:'歷史核准'}[status]||status||'未知狀態');

  function check(versions,selected){
    const list=(versions||[]).filter(Boolean).slice().sort((a,b)=>numberOf(b)-numberOf(a));
    if(!selected||selected.status!=='approved')return {allowed:false,reason:'只有目前生效的已核准版本可以返回確認。'};
    const current=list.find(item=>item.status==='approved');
    if(current?.id!==selected.id)return {allowed:false,reason:'此版本不是目前產線使用版本，不能返回確認。'};
    const newer=list.find(item=>item.id!==selected.id&&numberOf(item)>numberOf(selected));
    if(newer)return {allowed:false,reason:`已有較新的 V${newer.number}（${statusText(newer.status)}），為避免版本衝突，不能返回確認。`};
    const inProgress=list.find(item=>item.id!==selected.id&&activeStates.has(item.status));
    if(inProgress)return {allowed:false,reason:`V${inProgress.number} 正在${statusText(inProgress.status)}，請先完成或取消該版本。`};
    const fallback=list.find(item=>item.id!==selected.id&&numberOf(item)<numberOf(selected)&&['approved','superseded'].includes(item.status));
    if(!fallback)return {allowed:false,reason:'這是第一個核准版本，沒有可恢復的上一版；請建立修訂版本處理。'};
    return {allowed:true,fallback,reason:`可返回確認；產線將暫時恢復 V${fallback.number}，V${selected.number} 回到主管審核中。`};
  }

  host.VersionReturnPolicy={check,statusText};
})(typeof window==='undefined'?globalThis:window);

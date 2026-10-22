(function(host){
  const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
  function labels(page){
    const bar=page.querySelector('.approval-tabs');if(!bar)return;
    const text=(element,value)=>{if(element&&element.textContent!==value)element.textContent=value;},attr=(element,name,value)=>{if(element?.getAttribute(name)!==value)element.setAttribute(name,value);};
    attr(bar,'aria-label',t('版本確認分類','Loại phê duyệt phiên bản'));
    text(bar.querySelector('[data-review-label="master"]'),t('主資料送審','Duyệt dữ liệu gốc'));
    text(bar.querySelector('[data-review-label="process"]'),t('製程版本確認','Duyệt phiên bản quy trình'));
    text(bar.querySelector('[data-review-label="quality"]'),t('品質系統資料庫','Cơ sở dữ liệu chất lượng'));
    text(bar.querySelector('[data-review-label="routine"]'),t('例行檢查','Kiểm tra định kỳ'));
    bar.querySelectorAll('.approval-tab-count').forEach(el=>attr(el,'title',t('待確認案件','Hồ sơ chờ duyệt')));
  }
  function mount({page,state,masterHTML,masterPending,processPending,qualityHTML='',qualityPending=0,routineHTML='',routinePending=0,onSelect}){
    if(!page)return;
    const priorProcess=page.querySelector('#approval-panel-process');
    if(priorProcess)page.replaceChildren(...priorProcess.childNodes);
    const process=document.createElement('div');process.id='approval-panel-process';process.className='approval-tab-panel';process.setAttribute('role','tabpanel');process.setAttribute('aria-labelledby','approval-tab-process');
    while(page.firstChild)process.appendChild(page.firstChild);
    const master=document.createElement('div');master.id='approval-panel-master';master.className='approval-tab-panel';master.setAttribute('role','tabpanel');master.setAttribute('aria-labelledby','approval-tab-master');master.innerHTML=masterHTML;
    const quality=document.createElement('div');quality.id='approval-panel-quality';quality.className='approval-tab-panel';quality.setAttribute('role','tabpanel');quality.setAttribute('aria-labelledby','approval-tab-quality');quality.innerHTML=qualityHTML;
    const routine=document.createElement('div');routine.id='approval-panel-routine';routine.className='approval-tab-panel';routine.setAttribute('role','tabpanel');routine.setAttribute('aria-labelledby','approval-tab-routine');routine.innerHTML=routineHTML;
    const bar=document.createElement('div');bar.className='approval-tabs';bar.setAttribute('role','tablist');bar.setAttribute('data-i18n-skip','true');
    bar.innerHTML=['master','process','quality','routine'].map(key=>`<button type="button" role="tab" id="approval-tab-${key}" aria-controls="approval-panel-${key}" data-review-tab="${key}"><span data-review-label="${key}"></span><span class="approval-tab-count">${key==='master'?masterPending:key==='process'?processPending:key==='quality'?qualityPending:routinePending}</span></button>`).join('');
    page.appendChild(bar);page.appendChild(master);page.appendChild(process);page.appendChild(quality);page.appendChild(routine);
    const buttons=[...bar.querySelectorAll('[data-review-tab]')];
    function select(key,focus=false){
      state.approvalTab=['process','quality','routine'].includes(key)?key:'master';
      master.hidden=state.approvalTab!=='master';process.hidden=state.approvalTab!=='process';quality.hidden=state.approvalTab!=='quality';routine.hidden=state.approvalTab!=='routine';
      buttons.forEach(button=>{const active=button.dataset.reviewTab===state.approvalTab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus();});
    }
    buttons.forEach((button,index)=>{
      button.onclick=()=>{const key=button.dataset.reviewTab;if(key===state.approvalTab)return;state.approvalTab=key;onSelect?.(key);};
      button.onkeydown=event=>{let next;if(event.key==='ArrowRight')next=(index+1)%buttons.length;else if(event.key==='ArrowLeft')next=(index-1+buttons.length)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;event.preventDefault();const key=buttons[next].dataset.reviewTab;state.approvalTab=key;onSelect?.(key);page.querySelector('[data-review-tab="'+key+'"]')?.focus({preventScroll:true});};
    });
    select(state.approvalTab);labels(page);
  }
  new MutationObserver(()=>{const page=document.querySelector('.approval-page');if(page)labels(page);}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
  host.ApprovalTabs={mount};
})(typeof window==='undefined'?globalThis:window);

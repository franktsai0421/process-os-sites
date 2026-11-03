// A tab-scoped, read-only input archive. This is never a command, receipt,
// authorization proof or replacement for the bounded transport's unknown lock.
(() => {
  const prefix='fqc-input-checkpoint-v1:',limit=2_000_000;
  const tags=new Set('div form header footer section article p span label input textarea select option optgroup button h1 h2 h3 h4 small strong b em code pre ul ol li table thead tbody tr th td details summary img br hr fieldset legend'.split(' '));
  const context=actor=>JSON.stringify([location.origin,location.pathname,actor]);
  const controls=node=>[...node.querySelectorAll('input,textarea,select')];
  function capture(node){
    let count=0;
    function visit(element){
      if(++count>20000)throw Error('FQC_CHECKPOINT_TOO_LARGE');
      if(element.nodeType===3)return {text:element.textContent};
      if(element.nodeType!==1) return null;
      const tag=element.localName;
      if(!tags.has(tag))throw Error('FQC_CHECKPOINT_UNSUPPORTED_CONTENT');
      if(element.isContentEditable||tag==='input'&&(element.type==='password'||element.type==='file'&&element.files?.length))throw Error('FQC_CHECKPOINT_INPUT_IN_PROGRESS');
      const value={tag,children:[...element.childNodes].map(visit).filter(Boolean)};
      if(['input','textarea','select'].includes(tag)){
        value.field={name:element.name,label:element.getAttribute('aria-label')||element.getAttribute('placeholder')||element.name,type:element.type,value:element.value,checked:element.checked===true,indeterminate:element.indeterminate===true,multiple:element.multiple===true,selectedIndex:tag==='select'?element.selectedIndex:null,selected:tag==='select'?[...element.options].map(option=>option.selected):[]};
        if(element.validity?.badInput)throw Error('FQC_CHECKPOINT_INCOMPLETE_NUMBER');
      }
      if(tag==='option')value.value=element.value;
      if(tag==='img'){
        value.src=element.getAttribute('src')||'';value.alt=element.alt;
        // Object URLs cannot survive a reload. Existing same-origin media stays
        // an authenticated reference; newly selected files must be data URLs.
        if(value.src&&!/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value.src)){
          const url=new URL(value.src,location.href);
          if(url.origin!==location.origin||url.protocol!=='https:')throw Error('FQC_CHECKPOINT_MEDIA_UNSUPPORTED');
        }
      }
      return value;
    }
    return visit(node);
  }
  function render(tree){
    let count=0;
    function visit(value){
      if(++count>20000||!value||typeof value!=='object')throw Error('FQC_CHECKPOINT_INVALID');
      if(typeof value.text==='string')return document.createTextNode(value.text);
      if(!tags.has(value.tag)||!Array.isArray(value.children))throw Error('FQC_CHECKPOINT_INVALID');
      // Historical action buttons are not restored as apparent choices. Their
      // labels remain in the archive, but this view cannot submit or query.
      if(value.tag==='button')return document.createTextNode('');
      const node=document.createElement(value.tag==='form'?'section':value.tag);
      for(const child of value.children)node.append(visit(child));
      if(value.tag==='option')node.value=String(value.value??'');
      if(value.field){
        const field=value.field;
        if(value.tag==='input')node.type=['checkbox','radio'].includes(field.type)?field.type:'text';
        if(value.tag==='select'&&Array.isArray(field.selected)){node.multiple=field.multiple===true;for(const [i,option]of [...node.options].entries())option.selected=field.selected[i]===true;if(field.selectedIndex===-1)node.selectedIndex=-1;}
        else node.value=String(field.value??'');
        node.checked=field.checked===true;node.indeterminate=field.indeterminate===true;node.readOnly=true;
        if(value.tag==='select'||['checkbox','radio'].includes(node.type))node.disabled=true;
        node.dataset.checkpointField=String(field.name||'');node.setAttribute('aria-label',String(field.label||''));node.style.maxWidth='100%';
        if(!['checkbox','radio'].includes(node.type))node.style.cssText='display:block;width:100%;max-width:100%;box-sizing:border-box;margin:.25rem 0 .75rem';
      }
      if(value.tag==='footer')node.style.display='block';
      if(value.tag==='img'){
        const src=String(value.src||'');
        if(src&&!/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)){
          const url=new URL(src,location.href);if(url.origin!==location.origin||url.protocol!=='https:')throw Error('FQC_CHECKPOINT_MEDIA_UNSUPPORTED');
        }
        node.src=src;node.alt=String(value.alt||'');node.style.maxWidth='100%';
      }
      return node;
    }
    return visit(tree);
  }
  function save(actor,payload){
    if(!actor||payload?.actorId!==actor)throw Error('FQC_CHECKPOINT_OWNER_CHANGED');
    const records=list(actor),existing=records.find(record=>JSON.stringify(record.payload)===JSON.stringify(payload));
    if(existing){const key=prefix+context(actor)+':'+existing.id,raw=sessionStorage.getItem(key);if(raw!==JSON.stringify(existing))throw Error('FQC_CHECKPOINT_CHANGED');return {id:existing.id,current:()=>sessionStorage.getItem(key)===raw};}
    if(records.length>=16)throw Error('FQC_CHECKPOINT_TOO_MANY');
    const id=crypto.randomUUID(),key=prefix+context(actor)+':'+id;
    const raw=JSON.stringify({schema:1,id,context:context(actor),createdAt:new Date().toISOString(),payload});
    if(raw.length>limit)throw Error('FQC_CHECKPOINT_TOO_LARGE');
    sessionStorage.setItem(key,raw);
    if(sessionStorage.getItem(key)!==raw)throw Error('FQC_CHECKPOINT_WRITE_NOT_VERIFIED');
    return {id,current:()=>sessionStorage.getItem(key)===raw};
  }
  function list(actor){
    const own=prefix+context(actor)+':',result=[];
    if(sessionStorage.length>1024)throw Error('FQC_CHECKPOINT_TOO_MANY');
    for(let i=0;i<sessionStorage.length;i++){
      const key=sessionStorage.key(i);if(!key?.startsWith(own))continue;
      const raw=sessionStorage.getItem(key);if(!raw||raw.length>limit)throw Error('FQC_CHECKPOINT_INVALID');
      const record=JSON.parse(raw);
      if(record.schema!==1||record.context!==context(actor)||record.payload?.actorId!==actor||key!==own+record.id)throw Error('FQC_CHECKPOINT_INVALID');
      result.push(record);if(result.length>16)throw Error('FQC_CHECKPOINT_TOO_MANY');
    }
    return result;
  }
  window.FQCInputCheckpoint={capture,render,save,list,controls};
  function notice(){
    document.querySelector('[data-fqc-parked-notice]')?.remove();
    const sync=window.ProcessSync;if(!sync?.identity?.id||sync.requiresReload)return;
    try{if(!list(sync.identity.id).length)return;}catch{return;}
    const note=document.createElement('p');note.dataset.fqcParkedNotice='true';note.setAttribute('role','status');note.style.cssText='padding:.75rem;margin:0;overflow-wrap:anywhere';
    note.textContent=document.documentElement.lang==='vi'?'Có bản bảo toàn FQC trong tab này. Quay lại FQC để xem đầu vào chỉ đọc và kiểm tra biên nhận gốc; không tự gửi lại.':'本分頁保留 FQC 輸入副本。請返回 FQC 檢視唯讀輸入並查詢原操作回執；不會自動重送。';document.body.prepend(note);
  }
  window.addEventListener('process-destination-ready',notice);
  window.addEventListener('process-language-change',notice);
  window.addEventListener('process-delivery-invalidated',()=>document.querySelector('[data-fqc-parked-notice]')?.remove());
})();

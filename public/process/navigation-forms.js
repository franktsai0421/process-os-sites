// Singleton input ownership tracker for same-document departure guards. This
// never saves/discards inputs or dispatches a synthetic beforeunload event.
(() => {
  const baselines=new WeakMap(),dirty=new WeakSet(),composing=new Set();
  const control=node=>node?.matches?.('input,textarea,select,[contenteditable="true"]');
  const value=node=>node.type==='file'?[...node.files||[]].map(f=>f.name+':'+f.size+':'+f.lastModified).join('|'):node.type==='checkbox'||node.type==='radio'?String(node.checked):node.isContentEditable?node.textContent:String(node.value??'');
  const initial=node=>node.type==='file'?'':node.type==='checkbox'||node.type==='radio'?String(node.defaultChecked):node.tagName==='SELECT'?[...node.options].find(o=>o.defaultSelected)?.value||node.options[0]?.value||'':node.isContentEditable?node.textContent:String(node.defaultValue??node.value??'');
  document.addEventListener('focusin',event=>{if(control(event.target)&&!baselines.has(event.target))baselines.set(event.target,value(event.target));},true);
  const changed=event=>{const node=event.target;if(!control(node))return;if(!baselines.has(node))baselines.set(node,initial(node));if(value(node)!==baselines.get(node))dirty.add(node);else dirty.delete(node);};
  document.addEventListener('input',changed,true);document.addEventListener('change',changed,true);
  document.addEventListener('compositionstart',event=>{if(control(event.target))composing.add(event.target);},true);
  document.addEventListener('compositionend',event=>{composing.delete(event.target);changed(event);},true);
  window.ProcessNavigationForms={
    dirty(root){if(!root)return false;return [...root.querySelectorAll('input,textarea,select,[contenteditable="true"]')].some(node=>dirty.has(node)||node.type==='file'&&node.files?.length);},
    acknowledge(root){if(!root)return;for(const node of root.querySelectorAll('input,textarea,select,[contenteditable="true"]')){baselines.set(node,value(node));dirty.delete(node);}},
    composing(){for(const node of composing)if(!node.isConnected)composing.delete(node);return composing.size>0;},
    clearDisconnected(){for(const node of composing)if(!node.isConnected)composing.delete(node);}
  };
})();

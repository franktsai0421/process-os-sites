import assert from 'node:assert/strict';
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
export function conflictDOM(x){
  const nodes=[],listeners=new Map();let opened=0;
  function element(tag){const node={tag,children:[],dataset:{},style:{},attrs:{},isConnected:false,textContent:'',append(...children){this.children.push(...children);for(const child of children)child.isConnected=true;},setAttribute(key,value){this.attrs[key]=value;},addEventListener(key,fn){(this.events||={})[key]=fn;},remove(){this.isConnected=false;},focus(){x.box.document.activeElement=this;},showModal(){opened++;this.open=true;}};nodes.push(node);return node;}
  x.box.document.createElement=element;x.box.document.body=element('body');
  x.box.addEventListener=(key,fn)=>{const set=listeners.get(key)||new Set();set.add(fn);listeners.set(key,set);};x.box.removeEventListener=(key,fn)=>listeners.get(key)?.delete(fn);
  return {nodes,opened:()=>opened,dialog:()=>nodes.findLast(n=>n.tag==='dialog'&&n.isConnected),choose(value){const node=nodes.findLast(n=>n.dataset.masterSaveChoice===value);assert(node,'A real bridge choice button exists');node.onclick();},emit(key){for(const fn of listeners.get(key)||[])fn({preventDefault(){}});},async wait(){for(let i=0;i<600&&!this.dialog();i++)await tick();assert(this.dialog(),'Expected conflict dialog');}};
}

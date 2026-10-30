// Pure viewport-space geometry. Platform toolbar is an obstacle, never modified.
const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const box=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
export function feedbackPlacement({viewport,reserved=[],dialogTop,dialogBottom}){
 const x=viewport.left||0,y=viewport.top||0,w=Math.max(0,viewport.width),h=Math.max(0,viewport.height),gap=12;
 const obstacles=reserved.filter(r=>r&&r.right>r.left&&r.bottom>r.top);
 let launcher=box(x+w-gap-46,Math.min(y+h-gap-46,Number.isFinite(dialogBottom)?dialogBottom-gap-46:Infinity),46,46);
 // Keep the requested right corner; move upward only for an observed obstacle.
 for(const obstacle of obstacles)if(overlap(launcher,box(obstacle.left-gap,obstacle.top-gap,obstacle.right-obstacle.left+2*gap,obstacle.bottom-obstacle.top+2*gap)))launcher=box(launcher.left,obstacle.top-gap-46,46,46);
 const launcherVisible=launcher.top>=Math.max(y+gap,Number.isFinite(dialogTop)?dialogTop+gap:y+gap)&&launcher.right<=x+w-gap&&!obstacles.some(r=>overlap(launcher,r));
 const width=Math.max(0,Math.min(360,w-2*gap)),left=x+w-gap-width;
 const top=Math.max(y+gap,Number.isFinite(dialogTop)?dialogTop+gap:y+gap);
 let bottom=Math.min(launcher.top-8,Number.isFinite(dialogBottom)?dialogBottom-gap:Infinity);
 for(const obstacle of obstacles)if(left<obstacle.right+gap&&left+width>obstacle.left-gap&&bottom>obstacle.top-gap)bottom=Math.min(bottom,obstacle.top-gap);
 const height=Math.max(0,Math.min(540,bottom-top));
 let viewerBottom=y+h-gap;for(const obstacle of obstacles)viewerBottom=Math.min(viewerBottom,obstacle.top-gap);if(Number.isFinite(dialogBottom))viewerBottom=Math.min(viewerBottom,dialogBottom-gap);
 return {launcher,launcherVisible,panel:box(left,Math.max(top,bottom-height),width,height),viewer:box(x+gap,top,Math.max(0,w-2*gap),Math.max(0,viewerBottom-top))};
}
export function createFeedbackPositioner({window,document}){
 let launcher=null,panel=null,platform=null,frame=null,disposed=false;
 const listeners=new AbortController(),resizer=typeof window.ResizeObserver==='function'?new window.ResizeObserver(schedule):null;
 function identify(host){
  const root=host?.shadowRoot;if(!root||root.mode!=='open')return null;
  const button=root.querySelector('button[aria-label="Edit site"]');if(!button)return null;
  // Match the observed platform semantics, not the full-viewport host rectangle.
  const links=[...root.querySelectorAll('a')].slice(0,16);
  const link=links.find(node=>{try{return (node.getAttribute('aria-label')||node.textContent||'').trim()==='Edit site in ChatGPT'&&new URL(node.href).origin==='https://chatgpt.com';}catch{return false;}});
  return link?{host,button}:null;
 }
 function adopt(found){if(!found||found.button===platform?.button)return;resizer?.disconnect();platform=found;resizer?.observe(found.button);if(found.button.parentElement)resizer?.observe(found.button.parentElement);}
 function discover(){
  if(platform?.host.isConnected&&platform.button.isConnected)return;
  platform=null;resizer?.disconnect();
  // At most 64 top-level children, once per relevant layout event; no subtree scan,
  // background polling or observation of the business DOM.
  for(const host of [...document.body.children].slice(-64)){const found=identify(host);if(found){adopt(found);break;}}
 }
 function isReservedTarget(value){
  const nodes=typeof value?.composedPath==='function'?value.composedPath().slice(0,16):[value];
  for(const node of nodes){if(platform&&(node===platform.host||node===platform.button||platform.button.contains?.(node)))return true;const found=identify(node)||identify(node?.getRootNode?.()?.host);if(found){adopt(found);return true;}}
  return false;
 }
 function rect(node){const r=node.getBoundingClientRect();return box(r.left,r.top,r.width,r.height);}
 function apply(node,r){
  Object.assign(node.style,{left:r.left+'px',top:r.top+'px',right:'auto',bottom:'auto'});
  // A transformed native-dialog ancestor can establish a fixed containing block.
  // Correct its measured offset without changing the original dialog or platform UI.
  const actual=node.getBoundingClientRect();if(actual.width&&actual.height){const dx=r.left-actual.left,dy=r.top-actual.top;if(Math.abs(dx)>.5)node.style.left=(r.left+dx)+'px';if(Math.abs(dy)>.5)node.style.top=(r.top+dy)+'px';}
 }
 function update(nextLauncher=launcher,nextPanel=panel){
  launcher=nextLauncher;panel=nextPanel;if(disposed||!launcher?.isConnected)return;
  discover();const visual=window.visualViewport,viewport={left:visual?.offsetLeft||0,top:visual?.offsetTop||0,width:visual?.width||window.innerWidth,height:visual?.height||window.innerHeight};
  const measured=platform?rect(platform.button):null;
  const obstacle=measured?.width>0&&measured?.height>0?measured:null;
  const dialog=panel?.closest('dialog[open]'),header=dialog?.querySelector('[role=tablist]')||dialog?.querySelector('header'),footer=dialog&&[...dialog.querySelectorAll('footer')].find(node=>!node.closest('#wf-panel'));
  const result=feedbackPlacement({viewport,reserved:obstacle?[obstacle]:[],dialogTop:header?.getBoundingClientRect().bottom,dialogBottom:footer?.getBoundingClientRect().top});
  apply(launcher,result.launcher);launcher.style.visibility=result.launcherVisible?'':'hidden';
  if(panel&&!panel.hidden){panel.style.width=result.panel.width+'px';panel.style.maxHeight=result.panel.height+'px';const height=Math.min(result.panel.height,panel.getBoundingClientRect().height||result.panel.height);apply(panel,{...result.panel,top:result.panel.bottom-height});}
  const viewer=document.querySelector('#wf-viewer');if(viewer){viewer.style.width=result.viewer.width+'px';viewer.style.maxHeight=result.viewer.height+'px';apply(viewer,result.viewer);}
 }
 function schedule(){if(disposed||frame!==null)return;frame=window.requestAnimationFrame(()=>{frame=null;update();});}
 for(const event of ['resize','scroll'])window.addEventListener(event,schedule,{passive:true,capture:event==='scroll',signal:listeners.signal});
 for(const event of ['resize','scroll'])window.visualViewport?.addEventListener(event,schedule,{passive:true,signal:listeners.signal});
 function dispose(){if(disposed)return;disposed=true;listeners.abort();resizer?.disconnect();if(frame!==null)window.cancelAnimationFrame(frame);frame=null;launcher=null;panel=null;platform=null;}
 return {update,isReservedTarget,dispose};
}

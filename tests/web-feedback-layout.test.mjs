import test from 'node:test';import assert from 'node:assert/strict';
import {feedbackPlacement,createFeedbackPositioner} from '../public/process/web-feedback-layout.mjs';import {feedbackDOM} from './helpers/feedback-dom.mjs';
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const rectangle=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height});
for(const viewport of [{width:1180,height:757},{width:390,height:844},{width:320,height:568},{width:667,height:375},{left:20,top:180,width:360,height:400}]){
 for(const fullWidth of [false,true])test('pure geometry avoids observed-shape toolbar '+JSON.stringify({viewport,fullWidth}),()=>{
  const x=viewport.left||0,y=viewport.top||0,toolbar=rectangle(fullWidth?x+12:x+viewport.width-161,y+viewport.height-60,fullWidth?viewport.width-24:137,36),plan=feedbackPlacement({viewport,reserved:[toolbar]});
  assert.equal(plan.launcherVisible,true);for(const name of ['launcher','panel','viewer']){const r=plan[name];assert(!overlaps(r,toolbar),name);assert(r.left>=x&&r.right<=x+viewport.width);assert(r.top>=y&&r.bottom<=y+viewport.height);assert(r.width>0&&r.height>0);}
 });
}
test('native-dialog header/footer geometry reserves original controls; not native-dialog browser acceptance',()=>{
 const plan=feedbackPlacement({viewport:{width:1180,height:757},reserved:[rectangle(1019,697,137,36)],dialogTop:230,dialogBottom:680});assert(plan.panel.top>=242);assert(plan.panel.bottom<=668);assert(plan.launcher.bottom<=668);assert(plan.viewer.top>=242&&plan.viewer.bottom<=668);
});
test('bounded positioner identifies actual button inside open shadow, not full-screen host; coalesces and disposes',()=>{
 const {Node,document,events,eventSets}=feedbackDOM(),host=new Node('div'),root=new Node('shadow'),button=new Node('button'),link=new Node('a');root.host=host;root.mode='open';host.shadowRoot=root;button.setAttribute('aria-label','Edit site');button.rect=rectangle(1019,697,137,36);link.textContent='Edit site in ChatGPT';link.href='https://chatgpt.com/';root.append(button,link);document.body.append(host);
 const launcher=new Node('button'),panel=new Node('section'),viewer=new Node('section');launcher.id='wf-launcher';panel.id='wf-panel';viewer.id='wf-viewer';document.body.append(launcher,panel,viewer);
 const frames=new Map(),observed=[],cancelled=[];let seq=0,disconnects=0;const window=events({innerWidth:1180,innerHeight:757,visualViewport:events({width:1180,height:757,offsetTop:0,offsetLeft:0}),ResizeObserver:class{observe(n){observed.push(n);}disconnect(){disconnects++;}},requestAnimationFrame:fn=>{frames.set(++seq,fn);return seq;},cancelAnimationFrame:id=>{cancelled.push(id);frames.delete(id);}});
 const positioner=createFeedbackPositioner({window,document});positioner.update(launcher,panel);assert(observed.includes(button));assert(!observed.includes(host));assert.equal(launcher.style.left,'12px');assert.equal(panel.style.maxHeight,'340px');assert.equal(positioner.isReservedTarget({composedPath:()=>[button,root,host,document.body]}),true);assert.equal(positioner.isReservedTarget({composedPath:()=>[host,document.body]}),true);assert.equal(positioner.isReservedTarget(panel),false);
 for(let i=0;i<100;i++){window.dispatchEvent({type:'scroll'});window.dispatchEvent({type:'resize'});}assert.equal(frames.size,1);const [id,fn]=frames.entries().next().value;frames.delete(id);fn();assert.equal(frames.size,0);
 window.visualViewport.width=390;window.visualViewport.height=844;button.rect=rectangle(229,784,137,36);window.visualViewport.dispatchEvent({type:'resize'});assert.equal(frames.size,1);positioner.dispose();assert.equal(frames.size,0);assert.equal(cancelled.length,1);assert.equal([...eventSets.keys()].filter(x=>x.target===window||x.target===window.visualViewport).length,0);assert(disconnects>=1);positioner.dispose();assert.equal(cancelled.length,1);
});
test('unidentified platform uses finite conservative lower-right reserve, never a whole-page DOM scan',()=>{
 const {Node,document,events}=feedbackDOM(),launcher=new Node('button'),panel=new Node('section');document.body.append(launcher,panel);let selectors=0;const query=document.querySelector.bind(document);document.querySelector=s=>{selectors++;assert.equal(s,'#wf-viewer');return query(s);};
 const window=events({innerWidth:390,innerHeight:844,requestAnimationFrame:()=>1,cancelAnimationFrame(){}}),positioner=createFeedbackPositioner({window,document});positioner.update(launcher,panel);assert.equal(launcher.style.left,'12px');assert(Number.parseFloat(panel.style.top)+Number.parseFloat(panel.style.maxHeight)<=748);assert.equal(selectors,1);positioner.dispose();
});

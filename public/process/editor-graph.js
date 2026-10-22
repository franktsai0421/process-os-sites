/* Pure geometry shared by the editor and its deterministic acceptance tests. */
(function(host){
 'use strict';
 const kinds={entry:{icon:'▶',zh:'進站',vi:'Vào công đoạn'},exit:{icon:'⚑',zh:'出站',vi:'Ra công đoạn'},manual:{icon:'♙',zh:'人工',vi:'Thủ công'},inspection:{icon:'✓',zh:'人工檢查',vi:'Kiểm tra thủ công'},machine:{icon:'⚙',zh:'機器設定',vi:'Cài đặt máy'},custom:{icon:'✎',zh:'自訂流程',vi:'Tùy chỉnh'}};
 function kind(op,templates=[]){const key=op.editorType||templates.find(t=>t.id===op.templateId)?.presetKey||op.presetKey||(op.mode==='machine'?'machine':'');return key==='manual-inspection'?'inspection':['machine-setting','machine-assembly','machine'].includes(key)?'machine':Object.hasOwn(kinds,key)?key:'custom';}
 function tabs(type){return ['entry','exit'].includes(type)?['basic','common']:['basic',...(type==='machine'?['machines']:[]),'products','bom','common','product-work','ipqc'];}
 function violations(ops,type){const errors=[],ids=new Map(ops.map(o=>[o.id,o]));for(const k of ['entry','exit'])if(ops.filter(o=>type(o)===k).length>1)errors.push('duplicate-'+k);
  for(const o of ops){const next=o.nextIds||[],incoming=ops.filter(p=>p.nextIds?.includes(o.id));if(type(o)==='entry'&&incoming.length)errors.push('entry-input:'+o.id);if(type(o)==='exit'&&(incoming.length>1||next.length))errors.push('exit-degree:'+o.id);if(type(o)!=='entry'&&next.length>1)errors.push('single-output:'+o.id);if(new Set(next).size!==next.length)errors.push('duplicate-link:'+o.id);for(const id of next){if(id===o.id||!ids.has(id)){errors.push('invalid-target:'+o.id+':'+id);continue;}const seen=new Set(),queue=[id];while(queue.length){const at=queue.pop();if(at===o.id){errors.push('cycle:'+o.id+':'+id);break;}if(seen.has(at))continue;seen.add(at);queue.push(...(ids.get(at)?.nextIds||[]));}}}return errors;}
 function connection(ops,from,to,type){
  const source=ops.find(o=>o.id===from),target=ops.find(o=>o.id===to);
  if(!source||!target||from===to||source.stageCode!==target.stageCode)return {valid:false,reason:'INVALID_TARGET'};
  if(type(source)==='exit'||type(target)==='entry'||source.nextIds?.includes(to))return {valid:false,reason:'INVALID_PORT_OR_DUPLICATE'};
  const replace=type(source)!=='entry'&&!!source.nextIds?.length;
  const next=ops.map(o=>o.id===from?{...o,nextIds:type(source)==='entry'?[...(o.nextIds||[]),to]:[to]}:o);
  const prior=violations(ops,type),errors=violations(next,type).filter(e=>!prior.includes(e));
  return {valid:!errors.length,replace,nextIds:next.find(o=>o.id===from).nextIds,reason:errors[0]||''};
 }
 function autoLayout(ops,sizes={},type=kind){
  const incoming=new Set(ops.flatMap(o=>o.nextIds||[])),connected=ops.filter(o=>incoming.has(o.id)||(o.nextIds||[]).length||type(o)==='entry'||type(o)==='exit'),loose=ops.filter(o=>!connected.includes(o));
  const result=layout(connected,sizes,type);
  const bottom=Math.max(0,...connected.map(o=>result[o.id].y+(sizes[o.id]?.height||240)))+104;
  let x=80,y=bottom,rowHeight=0;for(const o of loose){const width=sizes[o.id]?.width||320,height=sizes[o.id]?.height||240;if(x+width>1800&&x>80){x=80;y+=rowHeight+64;rowHeight=0;}result[o.id]={x,y};x+=width+96;rowHeight=Math.max(rowHeight,height);}
  return result;
 }
 function layout(ops,sizes={},type=kind){
  const hasEntry=ops.some(o=>type(o)==='entry');
  const byId=new Map(ops.map(o=>[o.id,o])),rank=new Map(ops.map(o=>[o.id,hasEntry&&type(o)!=='entry'?1:0])),degree=new Map(ops.map(o=>[o.id,0])),parents=new Map(ops.map(o=>[o.id,[]]));
  for(const o of ops)for(const id of o.nextIds||[])if(byId.has(id)){degree.set(id,degree.get(id)+1);parents.get(id).push(o.id);}
  const queue=ops.filter(o=>!degree.get(o.id)),seen=new Set();while(queue.length){const o=queue.shift();seen.add(o.id);for(const id of o.nextIds||[])if(byId.has(id)){rank.set(id,Math.max(rank.get(id),rank.get(o.id)+1));degree.set(id,degree.get(id)-1);if(!degree.get(id))queue.push(byId.get(id));}}
  // Existing cyclic graphs remain readable, but arrangement cannot invent order.
  if(seen.size!==ops.length)throw Error('GRAPH_CYCLE_REVIEW_REQUIRED');
  const exitRank=Math.max(-1,...ops.filter(o=>type(o)!=='exit').map(o=>rank.get(o.id)))+1;
  for(const o of ops)if(type(o)==='exit'&&!(o.nextIds||[]).length)rank.set(o.id,Math.max(rank.get(o.id),exitRank));
  const layers=[];for(const o of ops)(layers[rank.get(o.id)]||=[]).push(o);
  const groups=layers.filter(Boolean),order=new Map(ops.map((o,i)=>[o.id,i])),position=new Map(ops.map((o,i)=>[o.id,i]));
  const children=o=>(o.nextIds||[]).filter(id=>byId.has(id));
  // Sweep in both directions: stored array order must not cross branch/merge ports.
  for(let sweep=0;sweep<6;sweep++){const backwards=sweep%2;for(const group of backwards?[...groups].reverse():groups){
   const mean=o=>{const ids=backwards?children(o):parents.get(o.id);return ids.length?ids.reduce((n,id)=>n+position.get(id),0)/ids.length:position.get(o.id);};
   group.sort((a,b)=>mean(a)-mean(b)||order.get(a.id)-order.get(b.id));group.forEach((o,i)=>position.set(o.id,i));
  }}
  const result={},height=o=>sizes[o.id]?.height||240,width=o=>sizes[o.id]?.width||320,gap=64;
  const total=group=>group.reduce((n,o)=>n+height(o),0)+Math.max(0,group.length-1)*gap,maxHeight=Math.max(0,...groups.map(total));let x=80;
  for(const group of groups){let y=80+(maxHeight-total(group))/2;for(const o of group){result[o.id]={x,y};y+=height(o)+gap;}
   const cut=rank.get(group[0].id),lanes=ops.reduce((n,o)=>n+(rank.get(o.id)<=cut?children(o).filter(id=>rank.get(id)>cut).length:0),0);
   x+=Math.max(...group.map(width))+96+Math.min(128,Math.max(0,lanes-1)*14);
  }
  // Isotonic packing aligns chains while keeping branch rows ordered and separated.
  // Unlike forward-only pushing, it distributes displacement in both directions.
  for(let sweep=0;sweep<6;sweep++){const backwards=sweep%2;for(const group of backwards?[...groups].reverse():groups){
   const blocks=[];let offset=0;for(const o of group){const ids=backwards?children(o):parents.get(o.id),center=ids.length?ids.reduce((n,id)=>n+result[id].y+height(byId.get(id))/2,0)/ids.length:result[o.id].y+height(o)/2;
    blocks.push({sum:center-height(o)/2-offset,count:1,items:[{o,offset}]});offset+=height(o)+gap;
    while(blocks.length>1&&blocks.at(-2).sum/blocks.at(-2).count>blocks.at(-1).sum/blocks.at(-1).count){const b=blocks.pop(),a=blocks.at(-1);a.sum+=b.sum;a.count+=b.count;a.items.push(...b.items);}
   }for(const b of blocks)for(const item of b.items)result[item.o.id].y=b.sum/b.count+item.offset;
  }}
  const top=Math.min(80,...Object.values(result).map(p=>p.y));for(const p of Object.values(result))p.y+=80-top;
  return result;
 }
 const overlap=(a,b,pad=0)=>a.x<b.x+b.width+pad&&a.x+a.width+pad>b.x&&a.y<b.y+b.height+pad&&a.y+a.height+pad>b.y;
 function intersects(a,b,r,pad=12){const x0=r.x-pad,x1=r.x+r.width+pad,y0=r.y-pad,y1=r.y+r.height+pad;return a.x===b.x?a.x>x0&&a.x<x1&&Math.max(a.y,b.y)>y0&&Math.min(a.y,b.y)<y1:a.y>y0&&a.y<y1&&Math.max(a.x,b.x)>x0&&Math.min(a.x,b.x)<x1;}
 class Heap{constructor(){this.a=[];}push(item){const a=this.a;a.push(item);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].score<=item.score)break;a[i]=a[p];i=p;}a[i]=item;}pop(){const a=this.a,top=a[0],last=a.pop();if(a.length){let i=0;while(2*i+1<a.length){let c=2*i+1;if(c+1<a.length&&a[c+1].score<a[c].score)c++;if(a[c].score>=last.score)break;a[i]=a[c];i=c;}a[i]=last;}return top;}}
 function segmentRelation(a,b,c,d){
  const horizontal=a.y===b.y,other=c.y===d.y;
  if(horizontal===other){const gap=Math.abs(horizontal?a.y-c.y:a.x-c.x),length=Math.max(0,Math.min(horizontal?Math.max(a.x,b.x):Math.max(a.y,b.y),horizontal?Math.max(c.x,d.x):Math.max(c.y,d.y))-Math.max(horizontal?Math.min(a.x,b.x):Math.min(a.y,b.y),horizontal?Math.min(c.x,d.x):Math.min(c.y,d.y)));return {shared:gap<10?length:0,cross:0};}
  const [p,q,r,s]=horizontal?[a,b,c,d]:[c,d,a,b];return {shared:0,cross:r.x>Math.min(p.x,q.x)&&r.x<Math.max(p.x,q.x)&&p.y>Math.min(r.y,s.y)&&p.y<Math.max(r.y,s.y)?1:0};
 }
 function simplify(points){const unique=points.filter((p,i)=>!i||p.x!==points[i-1].x||p.y!==points[i-1].y);return unique.filter((p,i)=>!i||i===unique.length-1||!(unique[i-1].x===p.x&&p.x===unique[i+1].x||unique[i-1].y===p.y&&p.y===unique[i+1].y));}
 function separate(rects){const placed={},ordered=Object.entries(rects).sort((a,b)=>a[1].y-b[1].y||a[1].x-b[1].x||a[0].localeCompare(b[0]));for(const [id,box]of ordered){const r={...box};let collisions;while((collisions=Object.values(placed).filter(p=>overlap(r,p,32))).length)r.y=Math.max(...collisions.map(p=>p.y+p.height+32));placed[id]=r;}return placed;}
 function routes(ops,rects){
  const edges=ops.flatMap(o=>(o.nextIds||[]).filter(id=>rects[o.id]&&rects[id]&&id!==o.id).map(id=>({from:o.id,to:id}))),used=[],result=[];const boxes=Object.values(rects);
  const center=id=>rects[id].y+rects[id].height/2;
  // Short adjacent links get their direct lanes first; long skips go around them.
  edges.sort((a,b)=>Math.abs(rects[a.to].x-rects[a.from].x)-Math.abs(rects[b.to].x-rects[b.from].x)||center(a.from)-center(b.from)||a.from.localeCompare(b.from)||a.to.localeCompare(b.to));
  const distance=(p,q)=>Math.abs(p.x-q.x)+Math.abs(p.y-q.y);
  function segmentCost(p,q){let cross=0;for(const [a,b]of used){const relation=segmentRelation(p,q,a,b);if(relation.shared>0)return Infinity;cross+=relation.cross;}return cross*600;}
  for(let e=0;e<edges.length;e++){const edge=edges[e],a=rects[edge.from],b=rects[edge.to],out=edges.filter(x=>x.from===edge.from).sort((p,q)=>center(p.to)-center(q.to)||p.to.localeCompare(q.to)),inc=edges.filter(x=>x.to===edge.to).sort((p,q)=>center(p.from)-center(q.from)||p.from.localeCompare(q.from)),sy=a.y+a.height*(out.indexOf(edge)+1)/(out.length+1),ty=b.y+b.height*(inc.indexOf(edge)+1)/(inc.length+1),start={x:a.x+a.width+28,y:sy},end={x:b.x-28,y:ty};
   const head={x:a.x+a.width,y:sy},tail={x:b.x,y:ty};
   const xs=[start.x,end.x,24+e*12],ys=[start.y,end.y,24+e*12];for(const r of boxes){xs.push(r.x-28,r.x+r.width+28);ys.push(Math.max(16,r.y-28-e*12),r.y+r.height+28+e*12);}xs.push(Math.max(...boxes.map(r=>r.x+r.width))+70+e*12);ys.push(Math.max(...boxes.map(r=>r.y+r.height))+70+e*12);
   const clear=(p,q)=>!boxes.some(r=>intersects(p,q,r));
   // Most left-to-right connections need zero or two bends. Try those before
   // allocating a search grid; shared *partial* segments are forbidden too.
   const candidates=[];if(sy===ty)candidates.push([start,end]);
   const middle=(start.x+end.x)/2;
   const fan=out.length>1?out:inc,slot=fan.indexOf(edge)+1,preferred=sy<ty?end.x-slot*14:start.x+slot*14;
   // Nest bends in port order: downward wires use far-to-near lanes, upward
   // wires near-to-far. A centered lane for every edge creates a ladder of crosses.
   for(const lane of [...(fan.length>1?[preferred]:[]),...Array.from({length:edges.length+1},(_,i)=>middle+(i%2?1:-1)*Math.ceil(i/2)*14),...xs])if(lane>=start.x&&lane<=end.x)candidates.push([start,{x:lane,y:sy},{x:lane,y:ty},end]);
   for(const lane of ys)candidates.push([start,{x:start.x,y:lane},{x:end.x,y:lane},end]);
   let best=null,bestScore=Infinity;
   const portClear=!boxes.some(r=>r!==a&&intersects(head,start,r))&&!boxes.some(r=>r!==b&&intersects(end,tail,r));
   function score(points){let total=0,dir=1;for(let i=1;i<points.length;i++){const p=points[i-1],q=points[i],next=p.y===q.y?1:2;if(!clear(p,q))return Infinity;const cost=segmentCost(p,q);total+=distance(p,q)+cost+(next!==dir?140:0);dir=next;}return total+(dir!==1?140:0);}
   if(portClear)for(const candidate of candidates){const p=simplify(candidate),cost=score(p)+segmentCost(head,start)+segmentCost(end,tail);if(cost<bestScore){best=p;bestScore=cost;if(cost<=distance(start,end)+(sy===ty?0:280))break;}}
   if(best){const points=simplify([head,...best,tail]);for(let i=1;i<points.length;i++)used.push([points[i-1],points[i]]);result.push({...edge,points,blocked:false});continue;}
   // Exceptional manual placement: bounded orthogonal search with separate lanes.
   for(const [p,q]of used){if(p.x===q.x)xs.push(p.x-14,p.x+14);else ys.push(p.y-14,p.y+14);}
   const X=[...new Set(xs)].sort((a,b)=>a-b),Y=[...new Set(ys)].sort((a,b)=>a-b),nx=X.length,from=Y.indexOf(start.y)*nx+X.indexOf(start.x),to=Y.indexOf(end.y)*nx+X.indexOf(end.x),point=id=>({x:X[id%nx],y:Y[Math.floor(id/nx)]}),heap=new Heap(),dist=new Map(),prev=new Map();
   const origin=from*3;dist.set(origin,0);heap.push({state:origin,cost:0,score:distance(start,end)});let winner=null;
   while(heap.a.length){const current=heap.pop();if(dist.get(current.state)!==current.cost)continue;const id=Math.floor(current.state/3),direction=current.state%3;if(id===to){winner=current.state;break;}const ix=id%nx,iy=Math.floor(id/nx),p=point(id),neighbors=[];if(ix)neighbors.push([id-1,1]);if(ix+1<nx)neighbors.push([id+1,1]);if(iy)neighbors.push([id-nx,2]);if(iy+1<Y.length)neighbors.push([id+nx,2]);
    for(const [nid,dir]of neighbors){const q=point(nid);if(!clear(p,q))continue;const cost=current.cost+distance(p,q)+(direction&&direction!==dir?140:0)+segmentCost(p,q),state=nid*3+dir;if(cost>=(dist.get(state)??Infinity))continue;dist.set(state,cost);prev.set(state,current.state);heap.push({state,cost,score:cost+distance(q,end)});}
   }
   if(winner===null||!portClear||!Number.isFinite(segmentCost(head,start)+segmentCost(end,tail))){result.push({...edge,points:[],blocked:true});continue;}
   const path=[];for(let s=winner;s!==undefined;s=prev.get(s))path.push(point(Math.floor(s/3)));path.reverse();
   const points=simplify([head,...path,tail]);for(let i=1;i<points.length;i++)used.push([points[i-1],points[i]]);result.push({...edge,points,blocked:false});
  }return result;
 }
 function place(rect,others){if(!others.some(o=>overlap(rect,o,24)))return {x:rect.x,y:rect.y};for(let radius=1;radius<80;radius++){const candidates=[];for(let d=-radius;d<=radius;d++)for(const [dx,dy]of [[d,radius],[d,-radius],[radius,d],[-radius,d]]){const r={...rect,x:Math.max(30,rect.x+dx*40),y:Math.max(30,rect.y+dy*40)};if(!others.some(o=>overlap(r,o,24)))candidates.push(r);}if(candidates.length){candidates.sort((a,b)=>Math.hypot(a.x-rect.x,a.y-rect.y)-Math.hypot(b.x-rect.x,b.y-rect.y));return {x:candidates[0].x,y:candidates[0].y};}}throw Error('LOCAL_POSITION_UNAVAILABLE');}
 const api={connection,place,kinds,kind,tabs,violations,layout,autoLayout,routes,overlap,intersects,separate,segmentRelation};host.ProcessEditorGraph=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

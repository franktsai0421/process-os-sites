// Reuses the confirmed 7ef04ed three-way catalog merge, factored for page owners.
// No network, storage, actor or File ownership; callers retain their own inputs.
(function(host){'use strict';
const copy=value=>JSON.parse(JSON.stringify(value)),equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const t=(zh,vi)=>document.documentElement.lang==='vi'?vi:zh;
function diff(before,after,path=[],patches=[],guards=[]){
      if(equal(before,after))return{patches,guards};
      if(Array.isArray(before)&&Array.isArray(after)&&[...before,...after].every(r=>r&&typeof r==='object'&&typeof r.id==='string')){
        const old=new Map(before.map(r=>[r.id,r])),next=new Map(after.map(r=>[r.id,r]));
        for(const [id,row]of old)if(!next.has(id)){const p=[...path,{id}];patches.push({op:'remove',path:p});guards.push({path:p,value:row});}
        for(const [id,row]of next)if(!old.has(id))patches.push({op:'insert',path,value:row});else diff(old.get(id),row,[...path,{id}],patches,guards);
        // Persist order only when membership is unchanged; inserted rows retain stable identities.
        if(before.length===after.length&&before.every(r=>next.has(r.id))&&!equal(before.map(r=>r.id),after.map(r=>r.id))){patches.push({op:'order',path,ids:after.map(r=>r.id)});guards.push({path,value:before});}
      }else if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
        for(const key of Object.keys(after))if(key!=='id')diff(before[key],after[key],[...path,key],patches,guards);
      }else{patches.push({op:'set',path,value:after});guards.push({path,value:before});}
      return{patches,guards};
    }
function localValue(snapshot,path){let value=snapshot;for(const part of path)value=typeof part==='string'?value?.[part]:value?.find(row=>row.id===part.id);return value;}
function projectLocal(snapshot,batches){const next=copy(snapshot);for(const batch of batches)for(const p of batch.patches){const parent=localValue(next,p.path.slice(0,-1)),last=p.path.at(-1);if(p.op==='insert'){const list=localValue(next,p.path);if(Array.isArray(list)&&!list.some(row=>row.id===p.value.id))list.push(copy(p.value));}else if(p.op==='order'){const list=localValue(next,p.path);if(Array.isArray(list)){const order=new Map(p.ids.map((id,i)=>[id,i]));list.sort((a,b)=>(order.get(a.id)??p.ids.length)-(order.get(b.id)??p.ids.length));}}else if(parent){if(typeof last==='string')parent[last]=p.value===undefined?undefined:copy(p.value);else if(Array.isArray(parent)){const i=parent.findIndex(row=>row.id===last.id);if(i>=0&&p.op==='remove')parent.splice(i,1);}}}return next;}
function compareMasterSnapshots(base,mine,theirs,scope){
      const conflicts=[],clone=value=>value===undefined?undefined:copy(value);
      const entityList=value=>Array.isArray(value)&&value.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.id==='string');
      const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
      const label=path=>path.map(part=>typeof part==='string'?part:part.id).join(' · ');
      function merge(before,own,other,path,choice){
        if(equal(own,before))return clone(other);
        if(equal(other,before)||equal(own,other))return clone(own);
        // Legacy PROCESS photos have no entity ID. Only an unchanged, nonempty
        // prefix proves these are independent additions (including the primary
        // photo); replacement/deletion/reorder remain conservative conflicts.
        if(scope==='PROCESS'&&path.at(-1)==='mediaItems'&&Array.isArray(before)&&before.length&&[own,other].every(Array.isArray)){
          const valid=list=>list.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&!Object.hasOwn(row,'id')&&typeof row.src==='string'&&row.src)&&new Set(list.map(row=>row.src)).size===list.length;
          if([before,own,other].every(valid)&&[own,other].every(list=>list.length>=before.length&&before.every((row,index)=>equal(row,list[index])))){
            const otherBySrc=new Map(other.map(row=>[row.src,row]));
            if(own.every(row=>!otherBySrc.has(row.src)||equal(row,otherBySrc.get(row.src))))
              return clone([...other,...own.filter(row=>!otherBySrc.has(row.src))]);
          }
        }
        if(entityList(before)&&entityList(own)&&entityList(other)){
          for(const list of [before,own,other])if(new Set(list.map(row=>row.id)).size!==list.length)throw Error('CATALOG_IDENTITY_INVALID');
          const maps=[before,own,other].map(list=>new Map(list.map(row=>[row.id,row]))),ids=[...new Set([...other,...own,...before].map(row=>row.id))],rows=new Map();
          for(const id of ids){const row=merge(maps[0].get(id),maps[1].get(id),maps[2].get(id),[...path,{id}],choice);if(row!==undefined)rows.set(id,row);}
          const baseline=before.map(row=>row.id),baselineIds=new Set(baseline),common=baseline.filter(id=>maps[1].has(id)&&maps[2].has(id)),commonIds=new Set(common);
          const ownIds=own.map(row=>row.id),otherIds=other.map(row=>row.id),ownOrder=ownIds.filter(id=>commonIds.has(id)),otherOrder=otherIds.filter(id=>commonIds.has(id));
          const ownMoved=!equal(common,ownOrder),otherMoved=!equal(common,otherOrder);
          const anchors=(ids,id)=>{const index=ids.indexOf(id);return [ids.slice(0,index).findLast(key=>commonIds.has(key)),ids.slice(index+1).find(key=>commonIds.has(key))];};
          const sharedIds=new Set(ownIds.filter(id=>maps[2].has(id)&&rows.has(id))),ownShared=ownIds.filter(id=>sharedIds.has(id)),otherShared=otherIds.filter(id=>sharedIds.has(id));
          const insertedConflict=!equal(ownShared,otherShared)&&ownShared.some(id=>!baselineIds.has(id))||ownIds.some(id=>!baselineIds.has(id)&&maps[2].has(id)&&!equal(anchors(ownIds,id),anchors(otherIds,id)));
          const orderConflict=ownMoved&&otherMoved&&!equal(ownOrder,otherOrder)||insertedConflict;
          if(orderConflict&&choice===undefined)conflicts.push({path,label:label(path)+' · '+t('順序','Thứ tự'),mine:ownIds,theirs:otherIds});
          const preferOwn=orderConflict?choice==='mine':ownMoved;
          const primary=preferOwn?ownIds:otherIds,secondary=preferOwn?otherIds:ownIds,order=primary.filter(id=>rows.has(id));
          // Place independent additions at their original neighboring anchors.
          for(let index=0;index<secondary.length;index++){
            const id=secondary[index];if(!rows.has(id)||order.includes(id))continue;
            const after=secondary.slice(index+1).find(key=>order.includes(key)),before=secondary.slice(0,index).findLast(key=>order.includes(key));
            if(after!==undefined)order.splice(order.indexOf(after),0,id);else if(before!==undefined)order.splice(order.indexOf(before)+1,0,id);else order.push(id);
          }
          for(const id of rows.keys())if(!order.includes(id))order.push(id);
          return order.map(id=>rows.get(id));
        }
        if(object(before)&&object(own)&&object(other)){
          const result={};for(const key of new Set([...Object.keys(before),...Object.keys(own),...Object.keys(other)])){
            const value=merge(before[key],own[key],other[key],[...path,key],choice);if(value!==undefined)result[key]=value;
          }return result;
        }
        if(choice===undefined)conflicts.push({path,label:label(path),mine:clone(own),theirs:clone(other)});
        return clone(choice==='mine'?own:other);
      }
      merge(base,mine,theirs,[],undefined);
      return {conflicts,materialize(choice){
        const merged=merge(base,mine,theirs,[],choice),batch=diff(theirs,merged);
        // JSON has no undefined. Guard the original parent entity when adding
        // an absent optional field, retaining proof of absence over the wire.
        for(let i=0;i<batch.guards.length;i++)if(batch.guards[i].value===undefined){
          const path=batch.guards[i].path,parent=localValue(theirs,path.slice(0,-1));
          if(!parent||typeof parent!=='object'||Object.hasOwn(parent,path.at(-1)))throw Error('DEPENDENCY_GUARD_REQUIRED');
          batch.guards[i]={path:path.slice(0,-1),value:copy(parent)};
        }
        // The command also pins the exact observed workflow revision, including
        // chosen-theirs units, without duplicating the whole catalog in guards.
        if(batch.patches.some(p=>p.path[0]==='categoryGroups'&&(p.path.at(-1)==='defaultStages'||p.op==='insert')))
          for(const key of ['products',...(Object.hasOwn(theirs,'lines')?['lines']:[])])if(!batch.guards.some(g=>g.path.length===1&&g.path[0]===key))batch.guards.push({path:[key],value:copy(theirs[key])});
        const batches=[batch],projected=projectLocal(theirs,[batch]);
        // Existing diff deliberately omits ordering when membership changes.
        // Reconcile that order in a later guarded batch within the same CAS.
        function orderRows(current,wanted,path=[]){
          if(entityList(current)&&entityList(wanted)){
            const byId=new Map(current.map(row=>[row.id,row]));
            for(const row of wanted)if(byId.has(row.id))orderRows(byId.get(row.id),row,[...path,{id:row.id}]);
            if(!equal(current.map(row=>row.id),wanted.map(row=>row.id))){
              batches.push({patches:[{op:'order',path,ids:wanted.map(row=>row.id)}],guards:[{path,value:copy(current)}]});
              const positions=new Map(wanted.map((row,index)=>[row.id,index]));current.sort((a,b)=>positions.get(a.id)-positions.get(b.id));
            }
          }else if(object(current)&&object(wanted))for(const key of Object.keys(wanted))orderRows(current[key],wanted[key],[...path,key]);
        }
        orderRows(projected,merged);return batches;
      }};
    }
// PROCESS media-group comparison recovered from the real PR #102 head 55d4672cb8004d0b01715714cbc91fbce6b22d2b.
function compareProcessSnapshots(base,mine,theirs,scope){
      const conflicts=[],clone=value=>value===undefined?undefined:copy(value);
      const entityList=value=>Array.isArray(value)&&value.every(row=>row&&typeof row==='object'&&!Array.isArray(row)&&typeof row.id==='string');
      const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
      const label=path=>path.map(part=>typeof part==='string'?part:part.id).join(' · ');
      // Legacy photo src is a comparison key only: never add a persisted ID or
      // infer that a new src inherits metadata from a removed photo.
      function processMedia(before,own,other,path,choice){
        const lists=[before.mediaItems,own.mediaItems,other.mediaItems];
        if(!lists.every(Array.isArray)||lists.some(list=>list.some(row=>row&&Object.hasOwn(row,'id'))))return null;
        const fields=['mediaItems','media','mediaName','mediaType'],group=value=>Object.fromEntries(fields.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
        const groups=[before,own,other].map(group),valid=list=>list.every(row=>object(row)&&typeof row.src==='string'&&row.src)&&new Set(list.map(row=>row.src)).size===list.length;
        const aliases=value=>{const first=value.mediaItems[0];return ['media','mediaName','mediaType'].every((key,index)=>!Object.hasOwn(value,key)||equal(value[key],[first?.src||null,first?.name||'',first?.type||''][index]));};
        const fallback=reason=>{
          if(equal(groups[1],groups[0]))return clone(groups[2]);
          if(equal(groups[2],groups[0])||equal(groups[1],groups[2]))return clone(groups[1]);
          if(choice===undefined)conflicts.push({path:[...path,'mediaItems'],label:label(path)+' · '+t('照片組：無法安全辨識（','Nhóm ảnh: không thể xác định an toàn (')+reason+')',mine:clone(groups[1]),theirs:clone(groups[2])});
          return clone(groups[choice==='mine'?1:2]);
        };
        if(!lists.every(valid))return fallback(t('來源重複或不完整','nguồn trùng hoặc thiếu'));
        if(![before,own,other].every(aliases))return fallback(t('主照片別名不一致','bí danh ảnh chính không khớp'));
        if(!lists[0].length)return fallback(t('缺少原主照片基準','thiếu cơ sở ảnh chính gốc'));
        const [base,mine,peer]=lists,maps=lists.map(list=>new Map(list.map(row=>[row.src,row]))),firsts=lists.map(list=>list[0]),sources=firsts.map(row=>row?.src);
        const changedTailSource=[1,2].some(side=>base.slice(1).some(row=>!maps[side].has(row.src)&&lists[side].some(item=>!maps[0].has(item.src)&&item.src!==sources[side])&&(!maps[3-side].has(row.src)||!equal(maps[3-side].get(row.src),row))));
        if(changedTailSource)return fallback(t('更換來源無法可靠配對','không thể ghép nguồn ảnh thay thế'));
        let principalConflict=false,principal=sources[0],principalSide=null;
        if(!sources.every(src=>src===sources[0])){
          if(equal(firsts[1],firsts[0])){principal=sources[2];principalSide=2;}
          else if(equal(firsts[2],firsts[0])||equal(firsts[1],firsts[2])){principal=sources[1];principalSide=1;}
          else principalConflict=true;
          // Promoting an existing tail photo depends on that photo surviving.
          if(principal!==undefined&&maps[0].has(principal)&&(!maps[1].has(principal)||!maps[2].has(principal)))principalConflict=true;
          if(principalConflict){
            if(choice===undefined)conflicts.push({path:[...path,'mediaItems'],label:label(path)+' · '+t('主照片／相依移除','Ảnh chính / xóa phụ thuộc'),mine:clone(firsts[1]),theirs:clone(firsts[2])});
            principalSide=choice==='mine'?1:2;principal=sources[principalSide];
          }
        }
        const selected=choice==='mine'?1:2,principalKeys=new Set(sources.filter(src=>src!==undefined)),rows=new Map(),keys=[...new Set([...peer,...mine,...base].map(row=>row.src))];
        for(const src of keys){
          let row;
          // A competing replacement is part of the principal choice, not an
          // independent append. Existing tails outside this group still merge.
          if(principalConflict&&principalKeys.has(src)&&(!maps[1].has(src)||!maps[2].has(src)))row=clone(maps[selected].get(src));
          else row=merge(maps[0].get(src),maps[1].get(src),maps[2].get(src),[...path,'mediaItems',src],choice);
          if(row!==undefined)rows.set(src,row);
        }
        const ids=lists.map(list=>list.map(row=>row.src)),currentPrincipals=new Set(sources.slice(1)),common=ids[0].filter(src=>!currentPrincipals.has(src)&&maps[1].has(src)&&maps[2].has(src)&&rows.has(src)),commonSet=new Set(common),orders=ids.slice(1).map(list=>list.filter(src=>commonSet.has(src))),moved=orders.map(order=>!equal(order,common));
        const sharedNew=ids[1].filter(src=>!maps[0].has(src)&&maps[2].has(src)&&!currentPrincipals.has(src)&&rows.has(src)),sharedTail=new Set([...common,...sharedNew]),sharedOrders=ids.slice(1).map(list=>list.filter(src=>sharedTail.has(src)));
        const orderConflict=moved.every(Boolean)&&!equal(orders[0],orders[1])||sharedNew.length>0&&!equal(sharedOrders[0],sharedOrders[1]);
        if(orderConflict&&choice===undefined)conflicts.push({path:[...path,'mediaItems'],label:label(path)+' · '+t('照片順序','Thứ tự ảnh'),mine:ids[1],theirs:ids[2]});
        const preferMine=orderConflict?choice==='mine':moved[0],tailSide=preferMine?1:2,primary=ids[principalSide??tailSide],secondary=ids[(principalSide??tailSide)===1?2:1],newTail=src=>!maps[0].has(src)&&!principalKeys.has(src),order=primary.filter(src=>rows.has(src)&&!newTail(src));
        // Principal choice owns only its dependent positions. Tail order is a
        // separate three-way unit: keep the other side's independent reorder,
        // even when the global choice selected this side's principal photo.
        const tailOrder=orders[tailSide-1];let tailIndex=0;
        for(let index=0;index<order.length;index++)if(commonSet.has(order[index]))order[index]=tailOrder[tailIndex++];
        const insert=(sequence,include)=>{for(let index=0;index<sequence.length;index++){
          const src=sequence[index];if(!include(src)||!rows.has(src)||order.includes(src))continue;
          const after=sequence.slice(index+1).find(key=>order.includes(key));
          if(after!==undefined)order.splice(order.indexOf(after),0,src);else order.push(src);
        }};
        insert(secondary,src=>!newTail(src));
        // Tail anchors and append tie order follow the tail comparison, never
        // a conflicting principal choice. Peer additions precede local ties.
        insert(ids[tailSide],newTail);insert(ids[3-tailSide],newTail);
        for(const src of rows.keys())if(!order.includes(src))order.push(src);
        if(principal!==undefined&&rows.has(principal)){const index=order.indexOf(principal);order.splice(index,1);order.unshift(principal);}
        const mediaItems=order.map(src=>rows.get(src)),result={mediaItems},first=mediaItems[0];
        // Aliases are derived from the final first row, including merged metadata
        // and the surviving first tail after an independently deleted principal.
        for(const [index,key]of ['media','mediaName','mediaType'].entries())if([before,own,other].some(value=>Object.hasOwn(value,key)))result[key]=[first?.src||null,first?.name||'',first?.type||''][index];
        return result;
      }
      function merge(before,own,other,path,choice){
        if(equal(own,before))return clone(other);
        if(equal(other,before)||equal(own,other))return clone(own);
        if(entityList(before)&&entityList(own)&&entityList(other)){
          for(const list of [before,own,other])if(new Set(list.map(row=>row.id)).size!==list.length)throw Error('CATALOG_IDENTITY_INVALID');
          const maps=[before,own,other].map(list=>new Map(list.map(row=>[row.id,row]))),ids=[...new Set([...other,...own,...before].map(row=>row.id))],rows=new Map();
          for(const id of ids){const row=merge(maps[0].get(id),maps[1].get(id),maps[2].get(id),[...path,{id}],choice);if(row!==undefined)rows.set(id,row);}
          const baseline=before.map(row=>row.id),baselineIds=new Set(baseline),common=baseline.filter(id=>maps[1].has(id)&&maps[2].has(id)),commonIds=new Set(common);
          const ownIds=own.map(row=>row.id),otherIds=other.map(row=>row.id),ownOrder=ownIds.filter(id=>commonIds.has(id)),otherOrder=otherIds.filter(id=>commonIds.has(id));
          const ownMoved=!equal(common,ownOrder),otherMoved=!equal(common,otherOrder);
          const anchors=(ids,id)=>{const index=ids.indexOf(id);return [ids.slice(0,index).findLast(key=>commonIds.has(key)),ids.slice(index+1).find(key=>commonIds.has(key))];};
          const sharedIds=new Set(ownIds.filter(id=>maps[2].has(id)&&rows.has(id))),ownShared=ownIds.filter(id=>sharedIds.has(id)),otherShared=otherIds.filter(id=>sharedIds.has(id));
          const insertedConflict=!equal(ownShared,otherShared)&&ownShared.some(id=>!baselineIds.has(id))||ownIds.some(id=>!baselineIds.has(id)&&maps[2].has(id)&&!equal(anchors(ownIds,id),anchors(otherIds,id)));
          const orderConflict=ownMoved&&otherMoved&&!equal(ownOrder,otherOrder)||insertedConflict;
          if(orderConflict&&choice===undefined)conflicts.push({path,label:label(path)+' · '+t('順序','Thứ tự'),mine:ownIds,theirs:otherIds});
          const preferOwn=orderConflict?choice==='mine':ownMoved;
          const primary=preferOwn?ownIds:otherIds,secondary=preferOwn?otherIds:ownIds,order=primary.filter(id=>rows.has(id));
          // Place independent additions at their original neighboring anchors.
          for(let index=0;index<secondary.length;index++){
            const id=secondary[index];if(!rows.has(id)||order.includes(id))continue;
            const after=secondary.slice(index+1).find(key=>order.includes(key)),before=secondary.slice(0,index).findLast(key=>order.includes(key));
            if(after!==undefined)order.splice(order.indexOf(after),0,id);else if(before!==undefined)order.splice(order.indexOf(before)+1,0,id);else order.push(id);
          }
          for(const id of rows.keys())if(!order.includes(id))order.push(id);
          return order.map(id=>rows.get(id));
        }
        if(object(before)&&object(own)&&object(other)){
          const media=scope==='PROCESS'?processMedia(before,own,other,path,choice):null,result=media||{};
          for(const key of new Set([...Object.keys(before),...Object.keys(own),...Object.keys(other)])){
            if(media&&['mediaItems','media','mediaName','mediaType'].includes(key))continue;
            const value=merge(before[key],own[key],other[key],[...path,key],choice);if(value!==undefined)result[key]=value;
          }return result;
        }
        if(choice===undefined)conflicts.push({path,label:label(path),mine:clone(own),theirs:clone(other)});
        return clone(choice==='mine'?own:other);
      }
      merge(base,mine,theirs,[],undefined);
      return {conflicts,materialize(choice){
        const merged=merge(base,mine,theirs,[],choice),batch=diff(theirs,merged);
        for(let index=0;index<batch.guards.length;index++)if(batch.guards[index].value===undefined){
          const path=batch.guards[index].path,parent=localValue(theirs,path.slice(0,-1));
          if(!parent||typeof parent!=='object'||Object.hasOwn(parent,path.at(-1)))throw Error('DEPENDENCY_GUARD_REQUIRED');
          batch.guards[index]={path:path.slice(0,-1),value:copy(parent)};
        }
        // The command also pins the exact observed workflow revision, including
        // chosen-theirs units, without duplicating the whole catalog in guards.
        if(batch.patches.some(p=>p.path[0]==='categoryGroups'&&(p.path.at(-1)==='defaultStages'||p.op==='insert')))
          for(const key of ['products','lines'])if(!batch.guards.some(g=>g.path.length===1&&g.path[0]===key))batch.guards.push({path:[key],value:copy(theirs[key])});
        const batches=[batch],projected=projectLocal(theirs,[batch]);
        // Existing diff deliberately omits ordering when membership changes.
        // Reconcile that order in a later guarded batch within the same CAS.
        function orderRows(current,wanted,path=[]){
          if(entityList(current)&&entityList(wanted)){
            const byId=new Map(current.map(row=>[row.id,row]));
            for(const row of wanted)if(byId.has(row.id))orderRows(byId.get(row.id),row,[...path,{id:row.id}]);
            if(!equal(current.map(row=>row.id),wanted.map(row=>row.id))){
              batches.push({patches:[{op:'order',path,ids:wanted.map(row=>row.id)}],guards:[{path,value:copy(current)}]});
              const positions=new Map(wanted.map((row,index)=>[row.id,index]));current.sort((a,b)=>positions.get(a.id)-positions.get(b.id));
            }
          }else if(object(current)&&object(wanted))for(const key of Object.keys(wanted))orderRows(current[key],wanted[key],[...path,key]);
        }
        orderRows(projected,merged);return batches;
      }};
    }
function choose(conflicts,{current=()=>true}={}){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='vd-dialog';dialog.style.cssText='max-height:85dvh;overflow:auto;width:min(92vw,800px)';
  const add=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;dialog.append(node);return node;};
  add('h3',t('選擇本次全部衝突','Chọn cho tất cả xung đột'));add('p',t('保留所有不衝突修改。取消不會寫入。','Giữ thay đổi không xung đột. Hủy sẽ không ghi.'));
  for(const row of conflicts){add('h4',row.label);add('p',t('我的：','Của tôi: ')+JSON.stringify(row.mine));add('p',t('對方：','Của người khác: ')+JSON.stringify(row.theirs));}
  let done=false;const finish=value=>{if(done)return;done=true;dialog.remove();for(const event of ['pagehide','process-delivery-invalidated','process-destination-ready'])host.removeEventListener(event,cancel);resolve(current()?value:'cancel');},cancel=()=>finish('cancel');
  for(const [value,label]of [['mine',t('用我的','Dùng của tôi')],['theirs',t('用對方的','Dùng của người khác')],['cancel',t('取消','Hủy')]]){const button=add('button',label);button.type='button';button.onclick=()=>finish(value);}
  dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});for(const event of ['pagehide','process-delivery-invalidated','process-destination-ready'])host.addEventListener(event,cancel);document.body.append(dialog);dialog.showModal();
 });
}
host.ProcessPageDraftMerge={compare(base,mine,theirs,scope){if(!['AB','C','LINES','PROCESS'].includes(scope))throw Error('MASTER_PAGE_SCOPE_REQUIRED');return (scope==='PROCESS'?compareProcessSnapshots:compareMasterSnapshots)(base,mine,theirs,scope);},choose,diff,project:projectLocal};
})(window);

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
host.ProcessPageDraftMerge={compare(base,mine,theirs,scope){if(!['AB','C','LINES'].includes(scope))throw Error('MASTER_PAGE_SCOPE_REQUIRED');return compareMasterSnapshots(base,mine,theirs,scope);},diff,project:projectLocal};
})(window);

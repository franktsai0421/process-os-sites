import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentReferenceIndex,processMasterReferences} from '../lib/process-master-references.ts';

const targets=Array.from({length:182},(_,i)=>({kind:'equipment',id:'fixture-id-'+i,
 stage:i%2?'B-ST':'A-ST',number:'fixture-number-'+Math.floor(i/2)}));
const op=(id,machineIds,other={})=>({id,number:'STEP-'+id,name:'Fixture '+id,machineIds,productCodes:['product-a','product-b'],...other});
const content=(ops,stage='A-ST')=>({workspaces:[{id:'workspace-'+stage,line:stage[0],category:'fixture',stages:{[stage]:ops}}]});
const value=workflow=>({processAuthoringControl:JSON.stringify({workflow})});
const entries=(values,target,mode)=>[...equipmentReferenceIndex(values,[target],mode).get(target.id).values()];

test('authoritative effective blocks, current draft and pending case have independent display semantics',()=>{
 const active=content([op('1',[targets[0].number]),op('2',[targets[0].id])]);
 const working=content([op('1',[targets[0].id],{name:'current draft'})]);
 const saved={content:active},pending={id:'pending',status:'pending',content:active};
 const values={...value({active:{content:active},working,saved,cases:[pending]}),
  approvalVersions:JSON.stringify([{status:'approved',...content([op('obsolete',[targets[0].id])])}])};
 assert.deepEqual(entries(values,targets[0],'summary').map(r=>r.number),['STEP-1','STEP-2']);
 assert.equal(entries(values,targets[1],'summary').length,0);
 const detail=entries(values,targets[0],'detail');
 assert.deepEqual(detail.map(r=>r.status),['active','active','working','pending','pending']);
 assert.equal(detail[2].name,'current draft');assert.deepEqual(detail[0].products,['product-a','product-b']);
 assert.equal(entries(value({saved}),targets[0],'detail').length,2);
 assert.equal(entries(value({working:active,saved}),targets[0],'detail').length,2);
 assert.equal(entries(value({working:content([]),saved}),targets[0],'detail').length,0);
 assert.equal(processMasterReferences(value({working:content([]),saved}),[targets[0]]).total,2);
});
test('legacy highest effective fallback; a published reference is labeled separately from formal approval',()=>{
 const versions=[1,2].map(i=>({id:'v'+i,number:i,status:'superseded',category:'fixture',line:'A',...content([op(String(i),[targets[0].id])])}));
 const values={approvalVersions:JSON.stringify(versions),publishedProcess:JSON.stringify(content([op('live',[targets[0].id])]))};
 assert.deepEqual(entries(values,targets[0],'summary').map(r=>r.number),['STEP-2']);
 assert.equal(entries(values,targets[0],'detail').at(-1).source,'published');
 assert.throws(()=>entries({processAuthoringControl:'invalid'},targets[0],'summary'));
});
test('a batch of 182 IDs matches individually scanned active references',()=>{
 const ops=Array.from({length:720},(_,i)=>op(String(i),[targets[i%156].id]));
 const active=content(ops),values=value({active:{content:active},working:active,saved:{content:active}});
 const start=performance.now();
 const before=targets.map(t=>processMasterReferences(values,[t]).references.filter(r=>r.status==='active').length);
 const middle=performance.now(),index=equipmentReferenceIndex(values,targets,'summary'),end=performance.now();
 assert.deepEqual(targets.map(t=>index.get(t.id).size),before);
 console.log('182 equipment / 720 blocks / active, working and saved: individual scans '+(middle-start).toFixed(1)+' ms, batch '+(end-middle).toFixed(1)+' ms');
});

test('each equipment retains a shared block and the summary count exceeds the old 100-detail cap',()=>{
 const shared=op('shared',[targets[0].id,targets[2].id]);
 const ops=[shared,...Array.from({length:105},(_,i)=>op(String(i),[targets[0].id]))];
 const values=value({active:{content:content(ops)}});
 const index=equipmentReferenceIndex(values,[targets[0],targets[2]],'summary');
 assert.equal(index.get(targets[0].id).size,106);
 assert.deepEqual([...index.get(targets[2].id).values()].map(r=>r.operationId),['shared']);
 const guard=processMasterReferences(values,[targets[0],targets[2]]);
 assert.equal(guard.total,106);assert.equal(guard.references.length,100);
});

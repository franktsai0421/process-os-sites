import test from 'node:test';
import assert from 'node:assert/strict';
import {createDepartureCoordinator} from '../public/process/navigation-lifecycle.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 let status={state:'dirty',canSave:true,canDiscard:true},epoch=1,releaseCount=0,showCount=0,hideCount=0,cancelCount=0,stayCount=0;
 const actions=[],targets=[],updates=[],mutation=deferred();
 const coordinator=createDepartureCoordinator({owner:()=>({id:'actor',epoch}),isCurrent:owner=>owner?.id==='actor'&&owner.epoch===epoch,inspect:()=>status,
  act:async action=>{actions.push(action);await mutation.promise;status={state:'clean'};return{release(){releaseCount++;}};},show:value=>{showCount++;updates.push(value);},update:value=>updates.push(value),hide:()=>hideCount++,cancelNavigation:()=>cancelCount++,stay:()=>stayCount++,errorMessage:e=>e.message});
 const request=key=>coordinator.request({key,label:key,run:ticket=>{const result=deferred();targets.push({key,ticket,...result});return result.promise;}});
 return{coordinator,request,actions,targets,updates,mutation,setStatus:value=>status=value,invalidate:()=>epoch++,stats:()=>({releaseCount,showCount,hideCount,cancelCount,stayCount})};
}
void test('latest target replaces the pending decision and Save runs once with its lease through commit',async()=>{
 const f=fixture(),a=f.request('A'),duplicate=f.request('A');assert.equal(a,duplicate);assert.equal(f.stats().showCount,1);
 const saving=f.coordinator.choose('save');assert.deepEqual(f.actions,['save']);assert.equal((await f.coordinator.choose('save')).status,'busy');
 const b=f.request('B');assert.equal((await a).status,'superseded');f.mutation.resolve();await saving;await turn();assert.equal(f.targets[0].key,'B');assert.equal(f.stats().releaseCount,0);
 f.coordinator.committed(f.targets[0].ticket);assert.equal(f.stats().releaseCount,1);assert.equal(f.stats().hideCount,1);f.targets[0].resolve({status:'ready'});assert.equal((await b).status,'ready');
});
void test('Stay cancels an armed departure without running a mutation or later target',async()=>{
 const f=fixture(),pending=f.request('A');await f.coordinator.choose('stay');assert.equal((await pending).status,'cancelled');f.mutation.resolve();await turn();assert.deepEqual(f.actions,[]);assert.deepEqual(f.targets,[]);assert.equal(f.stats().stayCount,1);assert.equal(f.coordinator.pending(),false);
});
void test('a new target during preparation reuses the acknowledged lease without another mutation',async()=>{
 const f=fixture(),a=f.request('A');f.mutation.resolve();await f.coordinator.choose('discard');await turn();const b=f.request('B');await turn();assert.equal((await a).status,'superseded');assert.deepEqual(f.actions,['discard']);assert.deepEqual(f.targets.map(t=>t.key),['A','B']);
 assert.equal(f.coordinator.ticketCurrent(f.targets[0].ticket),false);f.targets[0].resolve({status:'superseded'});await turn();assert.equal(f.stats().releaseCount,0);f.coordinator.committed(f.targets[1].ticket);f.targets[1].resolve({status:'ready'});assert.equal((await b).status,'ready');assert.equal(f.stats().releaseCount,1);
});
void test('Stay during target preparation releases the lease and late readiness cannot navigate',async()=>{
 const f=fixture(),pending=f.request('A');f.mutation.resolve();await f.coordinator.choose('save');await turn();await f.coordinator.choose('stay');assert.equal((await pending).status,'cancelled');assert.equal(f.stats().releaseCount,1);assert.throws(()=>f.coordinator.committed(f.targets[0].ticket),/CONTEXT_CHANGED/);f.targets[0].resolve({status:'ready'});await turn();assert.equal(f.stats().releaseCount,1);
});
void test('failed preparation releases source lock and a mutation failure preserves a usable decision',async()=>{
 const f=fixture(),pending=f.request('A');f.mutation.resolve();await f.coordinator.choose('save');await turn();f.targets[0].resolve({status:'error',error:Error('403')});assert.equal((await pending).status,'error');assert.equal(f.stats().releaseCount,1);assert.equal(f.stats().stayCount,1);
 const g=fixture(),held=g.request('B');g.mutation.reject(Error('UNKNOWN: check receipt'));assert.equal((await g.coordinator.choose('save')).status,'error');assert.equal(g.coordinator.pending(),true);assert.equal(g.targets.length,0);assert.match(g.updates.at(-1).error,/check receipt/);
 g.setStatus({state:'unknown',canSave:false,canDiscard:false,reason:'Check original receipt'});assert.equal((await g.coordinator.choose('save')).status,'blocked');assert.equal((await g.coordinator.choose('discard')).status,'blocked');assert.deepEqual(g.actions,['save']);await g.coordinator.choose('stay');assert.equal((await held).status,'cancelled');
});
void test('identity invalidation while saving cannot transfer inputs or leak its late lease',async()=>{
 const f=fixture(),pending=f.request('A'),saving=f.coordinator.choose('save');f.invalidate();f.coordinator.cancel('invalidated',false);assert.equal((await pending).status,'invalidated');f.mutation.resolve();await saving;assert.equal(f.targets.length,0);assert.equal(f.stats().releaseCount,1);assert.equal(f.stats().stayCount,0);
});
void test('clean source runs without a prompt and blocked source cannot invoke save or discard',async()=>{
 const f=fixture();f.setStatus({state:'clean'});const task=f.request('A');await turn();assert.equal(f.stats().showCount,0);assert.equal(f.targets[0].ticket,null);f.targets[0].resolve({status:'ready'});assert.equal((await task).status,'ready');
 const g=fixture();g.setStatus({state:'blocked',reason:'Different form still owns input'});const pending=g.request('B');assert.equal((await g.coordinator.choose('discard')).status,'blocked');assert.deepEqual(g.actions,[]);await g.coordinator.choose('stay');await pending;
});

for(const state of ['dirty','unknown'])void test(`automatic ${state} abandonment uses one checked lease without a prompt`,async()=>{
 let status={state,canAbandon:true},shown=0,released=0,abandoned=0;const epoch=1,targets=[],gate=deferred(),departureId={};
 const coordinator=createDepartureCoordinator({owner:()=>({epoch}),isCurrent:owner=>owner.epoch===epoch,inspect:()=>status,autoAbandon:()=>true,
  async act(action){assert.equal(action,'abandon');abandoned++;await gate.promise;status={state:'departing',departureId};return {departureId,release(){released++;}};},show(){shown++;}});
 const request=key=>coordinator.request({key,run:ticket=>{const done=deferred();targets.push({ticket,key,...done});return done.promise;}});
 const first=request('first'),last=request('last');assert.equal((await first).status,'superseded');gate.resolve();await turn();
 assert.equal(shown,0);assert.equal(abandoned,1);assert.equal(targets[0].key,'last');assert.equal(released,0);
 coordinator.committed(targets[0].ticket);targets[0].resolve({status:'ready'});assert.equal((await last).status,'ready');assert.equal(released,1);
});
void test('automatic abandonment failure resolves without opening a decision or preparing target',async()=>{
 let shown=0,ran=0,failures=0,stayed=0;
 const coordinator=createDepartureCoordinator({owner:()=>({}),isCurrent:()=>true,inspect:()=>({state:'dirty',canAbandon:true}),autoAbandon:()=>true,
  act:()=>Promise.reject(Error('RECEIPT_REQUIRED')),show(){shown++;},failure(){failures++;},stay(){stayed++;}});
 const result=await coordinator.request({key:'target',run(){ran++;}});
 assert.equal(result.status,'error');assert.equal(shown,0);assert.equal(ran,0);assert.equal(failures,1);assert.equal(stayed,1);assert.equal(coordinator.pending(),false);
});
void test('automatic opt-in does not override busy, blocked or unproven unknown state',async()=>{
 for(const state of ['busy','blocked','unknown']){
  let shown=0,acted=0;const coordinator=createDepartureCoordinator({owner:()=>({}),isCurrent:()=>true,inspect:()=>({state,canAbandon:false}),autoAbandon:()=>true,act(){acted++;},show(){shown++;}});
  const result=coordinator.request({key:'target',run(){throw Error('unexpected target');}});assert.equal(shown,1);assert.equal(acted,0);coordinator.cancel();assert.equal((await result).status,'cancelled');
 }
});
void test('opted-in local input abandons without a decision and acknowledges the handoff',async()=>{
 let status={state:'dirty',canAbandon:true},shown=0,acts=0;const id={};
 const coordinator=createDepartureCoordinator({owner:()=>id,isCurrent:owner=>owner===id,inspect:()=>status,autoAbandon:()=>true,show:()=>shown++,act:async action=>{assert.equal(action,'abandon');acts++;status={state:'departing',departureId:id};return{departureId:id,release(){}};}});
 const result=await coordinator.request({key:'next',label:'next',run:async ticket=>{coordinator.committed(ticket);return{status:'ready'};}});
 assert.equal(result.status,'ready');assert.equal(shown,0);assert.equal(acts,1);
});

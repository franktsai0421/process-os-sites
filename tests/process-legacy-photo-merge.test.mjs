// Actual bridge + shared transport + signed route; only SQLite/R2/browser ports are synthetic.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {fixture} from './abc-local-bridge-fixture.mjs';import {conflictDOM} from './master-conflict-dom-fixture.mjs';
const copy=structuredClone,photo=src=>({src,name:src+'.png',type:'image/png'}),base=['a','b','c','d'].map(photo);
const value=(snapshot,path)=>path.reduce((row,key)=>typeof key==='string'?row?.[key]:row?.find(item=>item.id===key.id),snapshot);
const aliases=items=>({mediaItems:copy(items),media:items[0]?.src||null,mediaName:items[0]?.name||'',mediaType:items[0]?.type||''});
async function setPhotos(x,path,items,peer=false){
 const snapshot=peer?(await x.f.request('GET')).body.control.workflow.working:x.draft().snapshot,row=value(snapshot,path),next=aliases(items),patches=Object.entries(next).map(([key,v])=>({op:'set',path:[...path,key],value:v})),guards=Object.keys(next).map(key=>({path:[...path,key],value:row[key]}));
 if(peer){const response=await x.f.request('POST',x.f.command('apply',{patches,guards,clientId:'photo-peer'}));assert.equal(response.status,200,JSON.stringify(response.body));return;}
 await x.bridge.patch('PROCESS',patches,guards);
}
async function setup(t,place){
 const x=await fixture({scope:'PROCESS'});t.after(x.f.close);const template=['A-CUT',{id:place==='template'?'A-CUT-FLOW-02':'A-CUT-FLOW-04'}],path=place==='template'?template:[...template,'equipment',{id:'legacy-photo-machine'}];
 if(place==='equipment'){const response=await x.f.request('POST',x.f.command('apply',{patches:[{op:'insert',path:[...template,'equipment'],value:{id:'legacy-photo-machine',name:'Machine',number:'M1',stageCode:'A-CUT',line:'A',kind:'machine-assembly',...aliases(base)}}],guards:[]}));assert.equal(response.status,200,JSON.stringify(response.body));}
 else await setPhotos(x,path,base,true);
 await x.bridge.load('PROCESS');return {x,path,dom:conflictDOM(x)};
}
function check(row,expected){assert.deepEqual(copy(row.mediaItems),expected);for(const [key,v]of Object.entries(aliases(expected)))assert.deepEqual(copy(row[key]),v);assert(row.mediaItems.every(item=>!Object.hasOwn(item,'id')));}
for(const place of ['template','equipment'])for(const change of ['replace','delete','reorder','metadata'])void test(`${place}: principal ${change} retains independent tail membership/metadata and coherent aliases in one signed Save`,async t=>{
 const {x,path,dom}=await setup(t,place);let mine=copy(base),peer=copy(base);mine=mine.filter(row=>row.src!=='c');peer=peer.filter(row=>row.src!=='d');peer[1].description='Peer metadata';
 if(change==='replace')mine[0]=photo('mine-primary');if(change==='delete')mine.shift();if(change==='reorder')mine=[mine[1],mine[0],...mine.slice(2)];if(change==='metadata'){mine[0].name='Mine caption';peer[0].type='image/webp';}
 mine.push(photo('mine-tail'));peer.push(photo('peer-tail'));await setPhotos(x,path,mine);await setPhotos(x,path,peer,true);assert.equal(x.posts().length,0);
 const result=await x.bridge.execute('PROCESS','save'),saved=value(result.control.workflow.saved.content,path),b={...photo('b'),description:'Peer metadata'},first=change==='replace'?photo('mine-primary'):change==='delete'||change==='reorder'?b:{...photo('a'),name:'Mine caption',type:'image/webp'};
 check(saved,[first,...(change==='delete'?[]:change==='reorder'?[photo('a')]:[b]),photo('peer-tail'),photo('mine-tail')]);assert.equal(dom.opened(),0);assert.equal(x.posts().length,1);assert.equal(x.bridge.localDirty('PROCESS'),false);
});
for(const place of ['template','equipment'])for(const choice of ['mine','theirs','cancel'])void test(`${place}: competing principal replacements ${choice} resolve globally while disjoint tails survive`,async t=>{
 const {x,path,dom}=await setup(t,place),mine=[photo('mine-primary'),{...photo('b'),name:'Mine b'},photo('d'),photo('mine-tail')],peer=[photo('peer-primary'),{...photo('b'),description:'Peer b'},photo('c'),photo('peer-tail')];
 await setPhotos(x,path,mine);await setPhotos(x,path,peer,true);const pending=x.bridge.execute('PROCESS','save');await dom.wait();assert.equal(x.posts().length,0);dom.choose(choice);const result=await pending;
 if(choice==='cancel'){assert.equal(result,null);assert.equal(x.posts().length,0);assert(x.bridge.localDirty('PROCESS'));check(value(x.draft().snapshot,path),mine);return;}
 check(value(result.control.workflow.saved.content,path),[photo(choice==='mine'?'mine-primary':'peer-primary'),{...photo('b'),name:'Mine b',description:'Peer b'},...(choice==='mine'?[photo('mine-tail'),photo('peer-tail')]:[photo('peer-tail'),photo('mine-tail')])]);assert.equal(dom.opened(),1);assert.equal(x.posts().length,1);
});
for(const place of ['template','equipment'])for(const choice of ['mine','theirs'])void test(`${place}: principal deletion vs modified original and promoted-photo deletion are guarded ${choice} choices`,async t=>{
 const {x,path,dom}=await setup(t,place),mine=[photo('b'),photo('c'),photo('d'),photo('mine-tail')],peer=[{...photo('a'),name:'Peer primary'},photo('c'),photo('d'),photo('peer-tail')];
 await setPhotos(x,path,mine);await setPhotos(x,path,peer,true);const pending=x.bridge.execute('PROCESS','save');await dom.wait();dom.choose(choice);const result=await pending;
 check(value(result.control.workflow.saved.content,path),[...(choice==='mine'?[photo('b')]:[{...photo('a'),name:'Peer primary'}]),photo('c'),photo('d'),...(choice==='mine'?[photo('mine-tail'),photo('peer-tail')]:[photo('peer-tail'),photo('mine-tail')])]);assert.equal(dom.opened(),1);assert.equal(x.posts().length,1);
});
for(const place of ['template','equipment'])for(const choice of ['mine','theirs'])void test(`${place}: revision/content changes during principal choice reopen comparison before the only Save POST (${choice})`,async t=>{
 const {x,path,dom}=await setup(t,place),mine=[photo('mine-primary'),...copy(base.slice(1)),photo('mine-tail')];await setPhotos(x,path,mine);await setPhotos(x,path,[photo('peer-one'),...copy(base.slice(1)),photo('peer-tail')],true);
 const pending=x.bridge.execute('PROCESS','save');await dom.wait();await setPhotos(x,path,[photo('peer-two'),{...photo('b'),description:'Latest metadata'},photo('c'),photo('d'),photo('peer-tail'),photo('latest-tail')],true);dom.choose(choice);await dom.wait();assert.equal(dom.opened(),2);assert.equal(x.posts().length,0);dom.choose(choice);const result=await pending,saved=value(result.control.workflow.saved.content,path);
 assert.equal(saved.mediaItems[0].src,choice==='mine'?'mine-primary':'peer-two');assert.equal(saved.mediaItems.find(row=>row.src==='b').description,'Latest metadata');for(const src of ['mine-tail','peer-tail','latest-tail'])assert(saved.mediaItems.some(row=>row.src===src));check(saved,copy(saved.mediaItems));assert.equal(x.posts().length,1);
});
function helper(){const box={window:null,document:{documentElement:{lang:'zh'}}};box.window=box;vm.createContext(box);const source=fs.readFileSync('public/process/master-shared-client.js','utf8');vm.runInContext(source.replace('return{isLocalProcessInsert','host.compare=compareMasterSnapshots;host.project=projectLocal;return{isLocalProcessInsert'),box);box.createMasterSharedBridge({control:{versions:[]}});return box;}
for(const reason of ['duplicate','src-replacement','alias-mismatch'])void test(`ambiguous ${reason} reports an explicit conservative photo-group conflict without weakening guards`,()=>{
 const h=helper(),before=aliases(base),mine=aliases([...copy(base),photo('mine-tail')]),peer=aliases([...copy(base),photo('peer-tail')]);
 if(reason==='duplicate')mine.mediaItems.push(photo('b'));if(reason==='src-replacement'){mine.mediaItems[1]=photo('changed-b-src');peer.mediaItems[1].description='Peer original b';}if(reason==='alias-mismatch')mine.media='unmatched-alias';
 const comparison=h.compare({row:before,other:'Before'},{row:mine,other:'Mine unrelated'},{row:peer,other:'Before'},'PROCESS');assert.equal(comparison.conflicts.length,1);assert.match(comparison.conflicts[0].label,/無法安全辨識/);
 for(const choice of ['mine','theirs']){const batches=comparison.materialize(choice),next=copy(h.project({row:peer,other:'Before'},batches));assert.deepEqual(next.row,choice==='mine'?mine:peer);assert.equal(next.other,'Mine unrelated');assert(batches.some(batch=>batch.guards.some(guard=>JSON.stringify(guard.path)==='["row","mediaItems"]'))||choice==='theirs');}
});
for(const place of ['template','equipment'])for(const receipt of ['normal','lost'])for(const late of ['append','primary'])void test(`${place}: ${receipt} ACK rebases only late ${late} intent from immutable sent prefix without resurrecting rejected primary`,async t=>{
 const {x,path,dom}=await setup(t,place),mine=[photo('mine-primary'),...copy(base.slice(1))],peer=[photo('peer-primary'),...copy(base.slice(1)),photo('peer-tail')];await setPhotos(x,path,mine);await setPhotos(x,path,peer,true);
 let arrive,release;const arrived=new Promise(resolve=>arrive=resolve),gate=new Promise(resolve=>release=resolve),fetch=x.box.fetch;let operation;
 x.box.fetch=async(url,options)=>{const response=await fetch(url,options),command=options.body&&JSON.parse(options.body).command;if(command?.action==='save'){operation=command.operationId;arrive();await gate;if(receipt==='lost')throw Error('Synthetic lost original Save ACK');}return response;};
 const pending=x.bridge.execute('PROCESS','save');await dom.wait();dom.choose('theirs');await arrived;assert.equal(x.posts().length,1);
 const later=[...(late==='primary'?[photo('late-primary'),...copy(base.slice(1))]:copy(mine)),photo('late-tail')];await setPhotos(x,path,later);if(receipt==='lost')x.mode('missing');release();
 if(receipt==='lost')await assert.rejects(pending);else await pending;x.box.fetch=fetch;
 const accepted=copy(peer);if(receipt==='normal')check(value(x.control.workflowScopes.PROCESS.saved.content,path),accepted);
 if(receipt==='lost'){
  assert(x.bridge.client('PROCESS').hasUnknown());const sent=x.posts().length,markers=copy([...x.disk]);await assert.rejects(x.bridge.recover('PROCESS'));assert.deepEqual([...x.disk],markers);assert.equal(x.posts().length,sent);x.mode('');await setPhotos(x,path,[photo('later-readback-primary'),...copy(base.slice(1)),photo('peer-tail'),photo('readback-tail')],true);
  await x.bridge.recover('PROCESS');assert.equal(x.posts().length,sent,'recovery uses only original receipt GET, never resends');assert(x.calls.some(call=>call.url.includes('operationId='+operation)));assert(!x.bridge.client('PROCESS').hasUnknown());
 }
 assert(x.bridge.localDirty('PROCESS'));const local=value(x.draft().snapshot,path);assert.equal(local.mediaItems[0].src,late==='append'?'peer-primary':'late-primary');assert(local.mediaItems.some(row=>row.src==='late-tail'));assert.equal(x.posts().length,1);
 const saving=x.bridge.execute('PROCESS','save');
 if(late==='primary'){await dom.wait();assert.equal(x.posts().length,1,'actual later primary intent is compared at next explicit Save');dom.choose('mine');}
 const result=await saving,saved=value(result.control.workflow.saved.content,path),expectedPrimary=late==='primary'?'late-primary':receipt==='lost'?'later-readback-primary':'peer-primary';assert.equal(saved.mediaItems[0].src,expectedPrimary);for(const src of ['peer-tail','late-tail',...(receipt==='lost'?['readback-tail']:[])])assert(saved.mediaItems.some(row=>row.src===src));assert(!saved.mediaItems.some(row=>row.src==='mine-primary'));check(saved,copy(saved.mediaItems));assert.equal(x.posts().length,2);
});
for(const place of ['template','equipment'])void test(`${place}: clearing known photos retains a newly appended peer tail as coherent new principal`,async t=>{
 const {x,path,dom}=await setup(t,place);await setPhotos(x,path,[]);await setPhotos(x,path,[...copy(base),photo('new-peer-tail')],true);const result=await x.bridge.execute('PROCESS','save');check(value(result.control.workflow.saved.content,path),[photo('new-peer-tail')]);assert.equal(dom.opened(),0);assert.equal(x.posts().length,1);
});
for(const place of ['template','equipment'])for(const choice of ['mine','theirs'])void test(`${place}: competing existing-photo promotions ${choice} retain all other src identities and tail metadata`,async t=>{
 const {x,path,dom}=await setup(t,place),mine=[photo('b'),photo('a'),photo('c'),photo('d'),photo('mine-tail')],peer=[photo('c'),photo('a'),{...photo('b'),description:'Peer tail edit'},photo('d'),photo('peer-tail')];await setPhotos(x,path,mine);await setPhotos(x,path,peer,true);const pending=x.bridge.execute('PROCESS','save');await dom.wait();dom.choose(choice);const result=await pending,row=value(result.control.workflow.saved.content,path);assert.equal(row.mediaItems[0].src,choice==='mine'?'b':'c');for(const src of ['a','b','c','d','mine-tail','peer-tail'])assert(row.mediaItems.some(item=>item.src===src));assert.equal(row.mediaItems.find(item=>item.src==='b').description,'Peer tail edit');check(row,copy(row.mediaItems));assert.equal(dom.opened(),1);assert.equal(x.posts().length,1);
});
for(const place of ['template','equipment'])for(const choice of ['mine','theirs'])void test(`${place}: promoting a baseline tail conflicts with its concurrent deletion even if the peer primary is unchanged (${choice})`,async t=>{
 const {x,path,dom}=await setup(t,place);await setPhotos(x,path,[photo('b'),photo('a'),photo('c'),photo('d')]);await setPhotos(x,path,[photo('a'),photo('c'),photo('d'),photo('peer-tail')],true);const pending=x.bridge.execute('PROCESS','save');await dom.wait();dom.choose(choice);const result=await pending,row=value(result.control.workflow.saved.content,path);assert.equal(row.mediaItems[0].src,choice==='mine'?'b':'a');assert.equal(row.mediaItems.some(item=>item.src==='b'),choice==='mine');assert(row.mediaItems.some(item=>item.src==='peer-tail'));check(row,copy(row.mediaItems));assert.equal(x.posts().length,1);
});

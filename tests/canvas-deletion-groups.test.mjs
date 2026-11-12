import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const box={structuredClone};vm.runInNewContext(fs.readFileSync('public/process/canvas-local.js','utf8'),box);const Journal=box.CanvasJournal,w='workspace',s='S',clone=structuredClone;
const content=()=>({workspaces:[{id:w,stages:{S:[{id:'a',stageCode:s,name:'A',nextIds:['b']},{id:'b',stageCode:s,name:'B',nextIds:['c']},{id:'c',stageCode:s,name:'C',nextIds:[]},{id:'d',stageCode:s,name:'D',nextIds:['b']}]}}]});
const rows=c=>c.workspaces[0].stages.S,find=(c,id)=>rows(c).find(o=>o.id===id),plain=x=>JSON.parse(JSON.stringify(x));
for(const field of ['name','x'])for(const choice of ['mine','latest','cancel'])void test(`dependent deletion ${field} ${choice}`,()=>{
 const original=content(),j=new Journal(original);j.edit(w,s,[{id:'a',f:'name',value:'Independent mine'}]);j.remove(w,s,'b');const latest=clone(original);find(latest,'b')[field]=field==='name'?'Remote B':42;find(latest,'c').name='Independent theirs';
 const review=j.review(w,s,latest),before=JSON.stringify(j.record());assert(review.changes.some(c=>c.id==='b'&&c.conflict));
 if(choice==='cancel'){assert.equal(JSON.stringify(j.record()),before);return;}
 j.resolveReview(review,choice,choice==='mine');const projected=j.project(w,s);assert.equal(projected.find(o=>o.id==='a').name,'Independent mine');assert.equal(projected.find(o=>o.id==='c').name,'Independent theirs');
 if(choice==='latest'){assert(projected.some(o=>o.id==='b'));assert.deepEqual(plain(projected.find(o=>o.id==='a').nextIds),['b']);assert.deepEqual(plain(projected.find(o=>o.id==='d').nextIds),['b']);assert(!j.freeze(w,s).patches.some(p=>p.path.at(-1)==='nextIds'));}
 else{assert(!projected.some(o=>o.id==='b'));assert(!projected.some(o=>o.nextIds.includes('b')));}
});
void test('rejected B deletion and accepted C deletion resolve shared source dependencies together',()=>{
 const original=content(),j=new Journal(original);j.remove(w,s,'b');j.remove(w,s,'c');const latest=clone(original);find(latest,'b').name='Remote B';j.resolveReview(j.review(w,s,latest),'latest',true);const projected=j.project(w,s);assert(projected.some(o=>o.id==='b'));assert(!projected.some(o=>o.id==='c'));assert.deepEqual(plain(projected.find(o=>o.id==='a').nextIds),['b']);assert.deepEqual(plain(projected.find(o=>o.id==='b').nextIds),[]);
});
void test('remote new incoming edge is kept for theirs and requires mine confirmation',()=>{
 const original=content(),j=new Journal(original);j.remove(w,s,'b');const latest=clone(original);find(latest,'b').name='Remote';rows(latest).push({id:'e',stageCode:s,name:'New remote',nextIds:['b']});const review=j.review(w,s,latest);assert(j.deletionImpact(review,'mine').links.some(e=>e.from==='e'));assert.throws(()=>j.resolveReview(review,'mine'),/UNSAFE/);j.resolveReview(review,'latest');assert(j.project(w,s).find(o=>o.id==='e').nextIds.includes('b'));assert(j.project(w,s).find(o=>o.id==='a').nextIds.includes('b'));
});
void test('explicit independent relink after deletion is preserved when the deletion is rejected',()=>{
 const original=content(),j=new Journal(original);j.remove(w,s,'b');j.edit(w,s,[{id:'a',f:'nextIds',value:['c']}]);const latest=clone(original);find(latest,'b').name='Remote';j.resolveReview(j.review(w,s,latest),'latest');assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='a').nextIds),['c']);assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='d').nextIds),['b']);
});
void test('local inserted node restores its dependent link when B deletion is rejected',()=>{
 const original=content(),j=new Journal(original);j.operation(w,s,{id:'new',stageCode:s,name:'New local',nextIds:['b']},null);j.remove(w,s,'b');const latest=clone(original);find(latest,'b').name='Remote';j.resolveReview(j.review(w,s,latest),'latest');assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='new').nextIds),['b']);
});
for(const choice of ['mine','latest'])void test(`remote deletion wins without blocking independent edits: ${choice}`,()=>{
 const original=content(),j=new Journal(original);j.edit(w,s,[{id:'b',f:'name',value:'Never resurrect'},{id:'a',f:'name',value:'Keep mine'}]);j.operation(w,s,{id:'new',stageCode:s,name:'Keep new',nextIds:['b']},null);
 const latest=clone(original);latest.workspaces[0].stages.S=rows(latest).filter(o=>o.id!=='b');for(const o of rows(latest))o.nextIds=o.nextIds.filter(id=>id!=='b');find(latest,'c').name='Keep remote';const review=j.review(w,s,latest);assert.deepEqual(plain(review.removedRemotely),['b']);assert(review.removedLinks.some(e=>e.from==='new'&&e.to==='b'));
 j.resolveReview(review,choice);const projected=j.project(w,s);assert(!projected.some(o=>o.id==='b'));assert(!projected.some(o=>o.nextIds.includes('b')));assert.equal(projected.find(o=>o.id==='a').name,'Keep mine');assert.equal(projected.find(o=>o.id==='c').name,'Keep remote');assert.equal(projected.find(o=>o.id==='new').name,'Keep new');assert(!j.freeze(w,s).patches.some(p=>p.path.some(x=>x?.id==='b')));
});

void test('known remote-deleted link target is previewed even without editing that target',()=>{
 const original=content(),j=new Journal(original);j.operation(w,s,{id:'new',stageCode:s,name:'New',nextIds:['b']},null);const latest=clone(original);latest.workspaces[0].stages.S=rows(latest).filter(o=>o.id!=='b');for(const o of rows(latest))o.nextIds=o.nextIds.filter(id=>id!=='b');const review=j.review(w,s,latest);assert(review.removedRemotely.includes('b'));assert(review.removedLinks.some(e=>e.from==='new'));j.resolveReview(review,'mine');assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='new').nextIds),[]);
});
void test('receipt settlement strips committed deletion provenance from a later deletion group',()=>{
 const original=content();find(original,'a').nextIds=['b','c'];const j=new Journal(original);j.remove(w,s,'b');const sent=j.freeze(w,s);j.sent(sent);j.remove(w,s,'c');const committed=clone(original);committed.workspaces[0].stages.S=rows(committed).filter(o=>o.id!=='b');find(committed,'a').nextIds=['c'];find(committed,'d').nextIds=[];j.acknowledge(sent,committed);const latest=clone(committed);find(latest,'c').name='Remote C';j.resolveReview(j.review(w,s,latest),'latest');const a=j.project(w,s).find(o=>o.id==='a');assert.deepEqual(plain(a.nextIds),['c']);assert(!a.nextIds.includes('b'));
});
void test('explicit unlink before deletion remains independent when deletion is rejected',()=>{
 const original=content(),j=new Journal(original);j.edit(w,s,[{id:'a',f:'nextIds',value:[]}]);j.remove(w,s,'b');const latest=clone(original);find(latest,'b').name='Remote';j.resolveReview(j.review(w,s,latest),'latest');assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='a').nextIds),[]);assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='d').nextIds),['b']);
});

for(const change of ['existing-link','new-incoming'])void test(`link-only remote conflict groups the node deletion: ${change}`,()=>{
 const original=content(),j=new Journal(original);j.remove(w,s,'b');const latest=clone(original);if(change==='existing-link')find(latest,'a').nextIds=['c'];else rows(latest).push({id:'e',stageCode:s,name:'Remote new',nextIds:['b']});const review=j.review(w,s,latest);assert(review.changes.find(c=>c.id==='b'&&c.field==='$node').conflict);j.resolveReview(review,'latest');assert(j.project(w,s).some(o=>o.id==='b'));assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='a').nextIds),change==='existing-link'?['c']:['b']);if(change==='new-incoming')assert(j.project(w,s).find(o=>o.id==='e').nextIds.includes('b'));
});

for(const links of [[],['c']])void test(`peer explicit unlink/relink must survive deletion rejection: ${JSON.stringify(links)}`,()=>{
 const original=content(),j=new Journal(original);j.remove(w,s,'b');j.edit(w,s,[{id:'c',f:'name',value:'Keep'}]);const latest=clone(original);find(latest,'a').nextIds=links;find(latest,'b').name='Peer';const review=j.review(w,s,latest);if(!links.length)assert.equal(review.changes.find(c=>c.id==='a'&&c.field==='nextIds').conflict,false);
 j.resolveReview(review,'latest');assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='a').nextIds),links);assert.equal(j.project(w,s).find(o=>o.id==='b').name,'Peer');assert.equal(j.project(w,s).find(o=>o.id==='c').name,'Keep');assert(!j.freeze(w,s).patches.some(p=>p.path[4]?.id==='a'&&p.path.at(-1)==='nextIds'));
 j.resolveReview(j.review(w,s,latest),'latest');assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='a').nextIds),links);
});
void test('mine rebase retains peer unlink evidence before a later theirs decision',()=>{
 const original=content(),j=new Journal(original);j.remove(w,s,'b');j.edit(w,s,[{id:'c',f:'name',value:'Keep'}]);const latest=clone(original);find(latest,'a').nextIds=[];find(latest,'b').name='Peer';j.resolveReview(j.review(w,s,latest),'mine',true);const second=clone(latest);find(second,'b').name='Peer again';j.resolveReview(j.review(w,s,second),'latest');assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='a').nextIds),[]);assert.equal(j.project(w,s).find(o=>o.id==='c').name,'Keep');
});
void test('chain rejection does not recreate peer-disconnected links',()=>{
 const original=content(),j=new Journal(original);j.remove(w,s,'b');j.remove(w,s,'c');j.edit(w,s,[{id:'d',f:'name',value:'Keep'}]);const latest=clone(original);find(latest,'a').nextIds=[];find(latest,'b').nextIds=[];find(latest,'b').name='Peer B';find(latest,'c').name='Peer C';j.resolveReview(j.review(w,s,latest),'latest');assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='a').nextIds),[]);assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='b').nextIds),[]);assert.equal(j.project(w,s).find(o=>o.id==='d').name,'Keep');
});
void test('local independent link insertion is retained when peer did not remove a baseline edge',()=>{
 const original=content();find(original,'a').nextIds=[];const j=new Journal(original);j.edit(w,s,[{id:'a',f:'nextIds',value:['b']}]);j.remove(w,s,'b');const peer=clone(original);find(peer,'b').name='Peer';j.resolveReview(j.review(w,s,peer),'latest');assert.deepEqual(plain(j.project(w,s).find(o=>o.id==='a').nextIds),['b']);
});
void test('rebase evidence survives the journal record boundary without restoring peer-disconnected edges',()=>{
 const original=content(),j=new Journal(original);j.remove(w,s,'b');const peer=clone(original);find(peer,'a').nextIds=[];find(peer,'b').name='Peer';j.resolveReview(j.review(w,s,peer),'mine',true);const resumed=new Journal(peer,clone(j.record()));find(peer,'b').name='Peer again';resumed.resolveReview(resumed.review(w,s,peer),'latest');assert.deepEqual(plain(resumed.project(w,s).find(o=>o.id==='a').nextIds),[]);
});

void test('cancelled local node insertion cannot be revived by automatic unlink rebase',()=>{
 const original=content(),j=new Journal(original);j.operation(w,s,{id:'cancelled-local',stageCode:s,name:'Temporary',nextIds:[]},null);j.edit(w,s,[{id:'a',f:'nextIds',value:['cancelled-local']}]);j.remove(w,s,'cancelled-local');j.edit(w,s,[{id:'c',f:'name',value:'Keep'}]);j.resolveReview(j.review(w,s,clone(original)),'latest');assert(!j.project(w,s).some(o=>o.id==='cancelled-local'));assert(!j.project(w,s).some(o=>o.nextIds.includes('cancelled-local')));assert.equal(j.project(w,s).find(o=>o.id==='c').name,'Keep');
});

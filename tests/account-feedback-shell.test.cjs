const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const raw=fs.readFileSync('public/process/dual-system.js','utf8'),start=raw.indexOf('  const baseCanView ='),code=raw.slice(start,raw.indexOf('  const baseApplyPlatformIdentity',start));
function fixture(){const ctx={currentUser:{id:'synthetic',role:'staff',enabled:true,views:['dashboard'],cells:{'feedback.view':true}},window:{ProcessSync:{protected:true,deliveryProjection:true,identity:{id:'synthetic'},features:{webFeedback:true},destination:{view:'data',dataTab:'web-feedback',module:'feedback',key:'data:web-feedback'}}},qualityViews:{},canView:view=>ctx.currentUser.views.includes(view)};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx;}
void test('actual data shell admits only the current verified feedback destination without changing legacy data/business rights',()=>{
 const f=fixture(),before=JSON.stringify(f.currentUser);assert.equal(f.canView('data'),true);assert.equal(f.canView('dashboard'),true);for(const view of ['editor','approval','player'])assert.equal(f.canView(view),false);assert.equal(JSON.stringify(f.currentUser),before);assert.equal(f.currentUser.views.includes('data'),false);
});
for(const mutate of [
 f=>{f.window.ProcessSync.requiresReload=true;},f=>{f.window.ProcessSync.expired=true;},f=>{f.window.ProcessSync.protected=false;},f=>{f.window.ProcessSync.deliveryProjection=false;},
 f=>{f.window.ProcessSync.identity=null;},f=>{f.window.ProcessSync.identity.id='other';},f=>{f.window.ProcessSync.features.webFeedback=false;},
 f=>{f.window.ProcessSync.destination=null;},f=>{f.window.ProcessSync.destination.view='editor';},f=>{f.window.ProcessSync.destination.dataTab='AB';},f=>{f.window.ProcessSync.destination.module='ab';},f=>{f.window.ProcessSync.destination.key='data:AB';},
 f=>{f.currentUser.enabled=false;},f=>{f.currentUser.deletedAt='synthetic';},f=>{f.currentUser.cells['feedback.view']=false;},f=>{f.currentUser.role='device';},f=>{f.currentUser.role='viewer';}
])void test('feedback shell fails closed for '+mutate.toString(),()=>{const f=fixture();mutate(f);assert.equal(f.canView('data'),false);});
void test('ordinary previously authorized data users retain existing admission outside feedback',()=>{const f=fixture();f.currentUser.views.push('data');f.window.ProcessSync.destination={view:'data',module:'ab',dataTab:'AB',key:'data:AB'};assert.equal(f.canView('data'),true);});

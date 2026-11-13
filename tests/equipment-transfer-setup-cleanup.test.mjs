// Execute the shipped setup body with memory-only resource ports. No browser,
// sockets, Worker, credentials or real storage are constructed by this suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const raw=fs.readFileSync('tests/equipment-transfer-compiled.test.mjs','utf8');
const ast=ts.createSourceFile('equipment-transfer-compiled.test.mjs',raw,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),nodes=[];
const visit=node=>{nodes.push(node);ts.forEachChild(node,visit);};visit(ast);
const setups=nodes.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='setup');
const keyDeclarations=nodes.filter(node=>ts.isVariableDeclaration(node)&&node.name.getText(ast)==='keys');
assert.equal(setups.length,1);assert.equal(keyDeclarations.length,1);
const setup=vm.runInNewContext('const '+keyDeclarations[0].getText(ast)+';'+setups[0].getText(ast)+';setup',{URL,process:{env:{}}});
function ports({failAt,closeFailures=[]}={}){
 const events=[],failure=Error(failAt==='goto'?'net::ERR_NO_BUFFER_SPACE':'synthetic '+failAt),cleanup=new Map(closeFailures.map(name=>[name,Error('close '+name)]));
 const step=name=>{events.push(name);if(failAt===name)throw failure;};
 const close=async name=>{events.push('close:'+name);if(cleanup.has(name))throw cleanup.get(name);};
 const source={async goto(){step('goto');},async waitForFunction(){step('ready');},locator(){return{async waitFor(){step('locator');}};}};
 const context={async route(){step('route');},async addCookies(){step('cookies');},async addInitScript(){step('init');},on(){},async newPage(){step('page');return source;},close:()=>close('context')};
 const browser={async newContext(){step('context');return context;},close:()=>close('browser')};
 const fixture={url:new URL('http://synthetic.invalid'),cookie:()=> 'synthetic-cookie-not-a-credential',close:()=>close('fixture')};
 return{events,failure,cleanup,options:{async createTransferFixture(){step('seed');return{core:{async readState(){step('seed-read');return{values:{}};}},objects:new Map(),close:()=>close('seed')};},async createABCFixture(options){step('fixture');await options.decorate({},null,{async put(){assert.fail('empty synthetic seed has no objects');}});return fixture;},chromium:{async launch(){step('launch');return browser;}}}};
}
for(const [stage,closed]of [
 ['seed-read',['seed']],['fixture',['seed']],['launch',['seed','fixture']],['context',['seed','browser','fixture']],
 ...['route','cookies','init','page','goto','ready','locator'].map(stage=>[stage,['seed','context','browser','fixture']]),
])void test(stage+' setup failure retains its exact error and closes every acquired resource',async()=>{
 const f=ports({failAt:stage});await assert.rejects(setup(390,'vi',f.options),error=>error===f.failure);
 assert.deepEqual(f.events.filter(name=>name.startsWith('close:')),closed.map(name=>'close:'+name));
});
void test('successful setup closes context, browser and Worker exactly once across repeated callers',async()=>{
 const f=ports(),s=await setup(1280,'zh',f.options);assert.deepEqual(f.events.filter(name=>name.startsWith('close:')),['close:seed']);
 const first=s.close(),second=s.close();assert.strictEqual(first,second);await first;await s.close();
 assert.deepEqual(f.events.filter(name=>name.startsWith('close:')),['close:seed','close:context','close:browser','close:fixture']);
});
void test('a cleanup rejection cannot skip remaining resources or hide the navigation failure',async()=>{
 const f=ports({failAt:'goto',closeFailures:['context','browser','fixture']});
 await assert.rejects(setup(390,'vi',f.options),error=>{assert.strictEqual(error.cause,f.failure);assert.strictEqual(error.errors[0],f.failure);assert.deepEqual([...error.errors[1].errors],['context','browser','fixture'].map(name=>f.cleanup.get(name)));return true;});
 assert.deepEqual(f.events.filter(name=>name.startsWith('close:')),['close:seed','close:context','close:browser','close:fixture']);
});
void test('normal teardown reports all cleanup failures and never retries a close',async()=>{
 const f=ports({closeFailures:['context','browser','fixture']}),s=await setup(1280,'zh',f.options),first=s.close();
 await assert.rejects(first,error=>{assert.deepEqual([...error.errors],['context','browser','fixture'].map(name=>f.cleanup.get(name)));return true;});
 assert.strictEqual(s.close(),first);assert.deepEqual(f.events.filter(name=>name.startsWith('close:')),['close:seed','close:context','close:browser','close:fixture']);
});
void test('seed close failure is surfaced before any compiled resource is acquired',async()=>{
 const f=ports({closeFailures:['seed']});await assert.rejects(setup(390,'vi',f.options),error=>error===f.cleanup.get('seed'));
 assert.deepEqual(f.events,['seed','seed-read','close:seed']);
});

void test('seed read and cleanup failure retain both errors without acquiring compiled resources',async()=>{
 const f=ports({failAt:'seed-read',closeFailures:['seed']});await assert.rejects(setup(390,'vi',f.options),error=>{assert.strictEqual(error.cause,f.failure);assert.deepEqual([...error.errors],[f.failure,f.cleanup.get('seed')]);return true;});
 assert.deepEqual(f.events,['seed','seed-read','close:seed']);
});

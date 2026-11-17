const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:32*1024*1024});
const digest=b=>createHash('sha256').update(b).digest('hex');
// Independent uncached reference: no calls to the cache or source projections.
const normalized=b=>Buffer.from(b.toString('utf8').replaceAll('\r\n','\n'));
const pinsRaw=fs.readFileSync(path.join(__dirname,'fixtures/quality-cache-source-pins.json'));
assert.equal(digest(normalized(pinsRaw)),'44d61db165c51d1ee3b8e4a9aec265dd5770958566318c880b236f78e30608dc');
const pins=JSON.parse(pinsRaw);
const productRoots=['app','lib','public','package.json','package-lock.json'];
const compare=(a,b)=>a<b?-1:a>b?1:0;
const sorted=o=>Object.keys(o).sort(compare);
function tree(ref,roots){
  const out={};
  for(const row of git('ls-tree','-r','-z',ref,'--',...roots).toString().split('\0').filter(Boolean)){
    const [meta,file]=row.split('\t'),[mode,kind,blob]=meta.split(' ');
    assert.equal(kind,'blob');out[file]={mode,blob};
  }
  return out;
}
function index(roots){
  const out={};
  for(const row of git('ls-files','--stage','-z','--',...roots).toString().split('\0').filter(Boolean)){
    const [meta,file]=row.split('\t'),[mode,blob,stage]=meta.split(' ');
    assert.equal(stage,'0','no unresolved stages: '+file);assert(!out[file]);out[file]={mode,blob};
  }
  return out;
}
function verifyMap(actual,expected){
  assert.deepEqual(sorted(actual),sorted(expected),'complete path set');
  for(const file of sorted(expected))assert.deepEqual(actual[file],{mode:expected[file].mode,blob:expected[file].blob},file);
}
function verifyDisk(file,pin){
  const loc=path.join(root,file),stat=fs.lstatSync(loc);
  assert(stat.isFile()&&!stat.isSymbolicLink(),'regular source file: '+file);
  const raw=fs.readFileSync(loc);
  if(pin.text){
    assert.deepEqual(Buffer.from(raw.toString('utf8')),raw,'valid UTF8: '+file);
    assert.equal(digest(normalized(raw)),pin.lfSha256,'only LF/CRLF checkout differences: '+file);
  }else assert.equal(digest(raw),pin.sha256,'exact binary bytes: '+file);
  return raw;
}
// Bounded by pinned source directory names. No gitignore exclusions and no
// generated artifacts are allowed inside app/lib/public. Root .next,
// node_modules, .sites-runtime and .wrangler are outside this source scope.
function scan(directory,allowedDirectories){
  assert(allowedDirectories.has(directory),'unknown source directory: '+directory);
  const dir=path.join(root,directory),stat=fs.lstatSync(dir);
  assert(stat.isDirectory()&&!stat.isSymbolicLink(),'regular source directory');
  const found=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    const file=directory+'/'+entry.name;
    assert(!entry.isSymbolicLink(),'source symlink refused: '+file);
    if(entry.isDirectory())found.push(...scan(file,allowedDirectories));
    else {assert(entry.isFile(),'regular source file: '+file);found.push(file);}
  }
  return found;
}
function directories(files){
  const dirs=new Set();
  for(const file of files){let d=path.posix.dirname(file);while(d!=='.'){dirs.add(d);d=path.posix.dirname(d);}}
  return dirs;
}
void test('fixed 13 real changes, complete canonical HEAD/index and ignored-inclusive disk inventory',()=>{
  git('cat-file','-e',pins.base+'^{commit}');
  assert.equal(pins.changes.length,13);
  assert.deepEqual(pins.changes.filter(c=>c.status==='A').map(c=>c.path).sort(compare),['lib/quality-read-wire.ts','public/process/quality-read-wire.js']);
  const base=tree(pins.base,productRoots),expected=pins.products;
  const changes=[];
  for(const file of [...new Set([...sorted(base),...sorted(expected)])].sort(compare)){
    const before=base[file],after=expected[file];
    if(before?.blob===after?.blob && before?.mode===after?.mode)continue;
    changes.push({status:!before?'A':!after?'D':'M',path:file,before:before?.blob||'0'.repeat(40),after:after?.blob||'0'.repeat(40)});
  }
  assert.deepEqual(changes,pins.changes,'fixed status/path/before/after content');
  verifyMap(tree('HEAD',productRoots),expected);
  verifyMap(index(productRoots),expected);
  const dirs=directories(sorted(expected));
  const disk=['app','lib','public'].flatMap(d=>scan(d,dirs)).concat(['package.json','package-lock.json']).sort(compare);
  assert.deepEqual(disk,sorted(expected),'includes untracked and ignored product files');
  for(const file of disk)verifyDisk(file,expected[file]);
});
void test('all 42 historical JSON manifests and exactly three additions retain canonical and disk contents',()=>{
  const historical=pins.originalManifests,added=pins.addedManifests;
  assert.equal(sorted(historical).length,42);
  assert.deepEqual(sorted(added),['scripts/quality-account-integration-source.json','scripts/quality-inventory-integration-source.json','scripts/quality-operation-source-contract.json']);
  const jsonOnly=map=>Object.fromEntries(Object.entries(map).filter(([file])=>file.endsWith('.json')));
  verifyMap(jsonOnly(tree(pins.base,['scripts'])),historical);
  const expected={...historical,...added};
  verifyMap(jsonOnly(tree('HEAD',['scripts'])),expected);
  verifyMap(jsonOnly(index(['scripts'])),expected);
  const disk=scan('scripts',new Set(pins.scriptDirectories)).filter(file=>file.endsWith('.json')).sort(compare);
  assert.deepEqual(disk,sorted(expected),'deleted and ignored JSON cannot escape enumeration');
  for(const file of disk){
    const pin=expected[file];
    assert.equal(digest(git('cat-file','blob',pin.blob)),pin.sha256,'canonical manifest: '+file);
    verifyDisk(file,pin);
  }
});
const createCache=require('../scripts/source-normalization-cache.cjs');
for(const file of [...pins.changes.map(c=>c.path),'HANDOFF.md'])void test('current raw bytes vs uncached oracle, EOL and mutation: '+file,()=>{
  const pin=file==='HANDOFF.md'?pins.handoff:pins.products[file];
  const raw=verifyDisk(file,pin),canonical=git('cat-file','blob',pin.blob);
  assert.equal(digest(canonical),pin.sha256,'fixed canonical content');
  if(file==='HANDOFF.md'){
    assert.equal(digest(canonical),'7ee6020a611a5680ed03a868b739bc1380f67268d171189578ffc23fbf48278e');
    assert.equal(digest(git('show','0f2c8ec5b3bc8f6a5625ef049782fab1f96988b1:HANDOFF.md')),'9b599e427991573b3338ca037029295301e80bfb0a0bcdedc4c25ea333306a53');
  }
  const lf=normalized(raw).toString();
  const variants=[canonical,raw,Buffer.from(lf),Buffer.from(lf.replaceAll('\n','\r\n')),Buffer.from(lf.replace('\n','\r\n'))];
  const cache=createCache();
  for(const bytes of variants){
    const check=value=>{assert.deepEqual(cache.bytes(value),normalized(value));assert.equal(cache.hash(value),digest(normalized(value)));};
    check(bytes);const output=cache.bytes(bytes);output.fill(0);check(bytes);
    for(const at of [0,Math.floor(bytes.length/2),bytes.length-1]){
      const bad=Buffer.from(bytes);bad[at]^=1;
      assert.notDeepEqual(normalized(bad),normalized(bytes),'negative differs first');
      check(bad);check(bytes);
    }
    const shared=Buffer.from(new SharedArrayBuffer(bytes.length));bytes.copy(shared);check(shared);shared[0]^=1;check(shared);
  }
});
function uncachedComposition(){
  const filename=path.join(root,'scripts/inventory-quality-source-contract.cjs'),cjs={exports:{}};
  const nativeRequire=createRequire(filename);
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{Buffer,module:cjs,require:name=>name==='./source-normalization-cache.cjs'?()=>({bytes(raw){assert(Buffer.isBuffer(raw),'Source normalization requires raw Buffer');return normalized(raw);},hash(raw){assert(Buffer.isBuffer(raw),'Source normalization requires raw Buffer');return digest(normalized(raw));}}):nativeRequire(name)},{filename});
  return cjs.exports;
}
function failure(fn){
  try{fn();}catch(error){return {name:error.name,code:error.code,message:error.message};}
  assert.fail('real restore must reject');
}
void test('current composition uses real restore, uncached equivalence, genuine parent bytes and original error order',()=>{
  const cached=require('../scripts/inventory-quality-source-contract.cjs'),oracle=uncachedComposition();
  for(const file of ['public/process/fqc-master.js','public/process/shared-draft-client.js','HANDOFF.md']){
    const lf=normalized(fs.readFileSync(path.join(root,file))).toString();
    for(const target of Object.keys(cached.contract.parents)){
      const parent=git('show',cached.contract.parents[target]+':'+file);
      for(const raw of [Buffer.from(lf),Buffer.from(lf.replaceAll('\n','\r\n')),Buffer.from(lf.replace('\n','\r\n'))]){
        assert.deepEqual(cached.restore(raw,file,target),parent);
        assert.deepEqual(oracle.restore(raw,file,target),parent);
        assert.deepEqual(cached.projectKnown(raw,file,target),oracle.projectKnown(raw,file,target));
        const out=cached.restore(raw,file,target);out.fill(0);assert.deepEqual(cached.restore(raw,file,target),parent);
        for(const at of [0,Math.floor(raw.length/2),raw.length-1]){
          const bad=Buffer.from(raw);bad[at]^=1;assert.notDeepEqual(normalized(bad),normalized(raw));
          assert.deepEqual(failure(()=>cached.restore(bad,file,target)),failure(()=>oracle.restore(bad,file,target)));
          assert.equal(cached.projectKnown(bad,file,target),bad);
        }
      }
    }
  }
  const raw=fs.readFileSync(path.join(root,'HANDOFF.md'));
  for(const [bytes,file,target] of [[raw,'wrong','qualityMain'],[raw,'HANDOFF.md','wrong'],[Buffer.from('unknown'),'wrong','wrong'],[null,'wrong','wrong']])
    assert.deepEqual(failure(()=>cached.restore(bytes,file,target)),failure(()=>oracle.restore(bytes,file,target)));
});

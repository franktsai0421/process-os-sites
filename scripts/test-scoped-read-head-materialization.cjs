// Ephemeral Git fixture: validate EOL-only admission and zero writes on refusal.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {materializeHead}=require('./materialize-scoped-read-head.cjs');
const root=path.resolve(__dirname,'..'),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'scoped-head-eol-'));
const definition=JSON.parse(fs.readFileSync(path.join(__dirname,'scoped-read-phase-baseline.json'))),files=[...Object.keys(definition.files),'tests/scoped-workflow-read.test.mjs','tests/scoped-workflow-read-benchmark.mjs'];
const git=(...args)=>execFileSync('git',args,{cwd:temporary,stdio:'pipe'}),target=file=>path.join(temporary,file),readAll=()=>files.map(file=>fs.existsSync(target(file))?fs.readFileSync(target(file)):null);
let refused=0;
try{
 for(const file of files){fs.mkdirSync(path.dirname(target(file)),{recursive:true});fs.copyFileSync(path.join(root,file),target(file));}
 const manifestFile='scripts/scoped-read-phase-baseline.json',manifestBytes=fs.readFileSync(path.join(root,manifestFile));fs.mkdirSync(path.dirname(target(manifestFile)),{recursive:true});fs.writeFileSync(target(manifestFile),manifestBytes);fs.copyFileSync(path.join(root,'.gitattributes'),target('.gitattributes'));
 git('init');git('config','user.name','Synthetic Source Test');git('config','user.email','source-test@synthetic.invalid');git('config','core.autocrlf','false');git('add','.');git('commit','-m','Exact synthetic source baseline');
 assert.equal(git('check-attr','eol','--',manifestFile).toString().trim(),manifestFile+': eol: lf');
 fs.writeFileSync(target(manifestFile),manifestBytes.toString().replace(/\n/g,'\r\n'));git('-c','core.autocrlf=true','checkout-index','--force','--',manifestFile);assert.deepEqual(fs.readFileSync(target(manifestFile)),manifestBytes,'Real autocrlf checkout retains the exact manifest SHA');
 const committed=readAll();
 for(const file of files)fs.writeFileSync(target(file),fs.readFileSync(target(file)).toString().replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'));
 assert.equal(materializeHead(temporary).files,47);assert.deepEqual(readAll(),committed);
 const first=files[0],last=files.at(-1),firstVariant=Buffer.from(committed[0].toString().replace(/\r\n/g,'\n').replace(/\n/g,'\r\n'));
 fs.writeFileSync(target(first),firstVariant);fs.appendFileSync(target(last),'non-EOL mutation');let before=readAll();assert.throws(()=>materializeHead(temporary),/Non-EOL working/);assert.deepEqual(readAll(),before);refused++;fs.writeFileSync(target(last),committed.at(-1));
 fs.unlinkSync(target(last));before=readAll();assert.throws(()=>materializeHead(temporary));assert.deepEqual(readAll(),before);refused++;fs.writeFileSync(target(last),committed.at(-1));
 git('rm','--cached',last);git('commit','-m','Missing tracked oracle negative');before=readAll();assert.throws(()=>materializeHead(temporary),/Tracked regular/);assert.deepEqual(readAll(),before);refused++;git('add',last);git('commit','-m','Restore tracked oracle');
 const directory=path.join(temporary,'lib'),stored=path.join(temporary,'saved-lib');fs.renameSync(directory,stored);fs.symlinkSync(stored,directory,'junction');before=readAll();assert.throws(()=>materializeHead(temporary),/symlink/);assert.deepEqual(readAll(),before);refused++;fs.unlinkSync(directory);fs.renameSync(stored,directory);
 git('update-index','--chmod=+x',last);git('commit','-m','Non-regular source mode negative');before=readAll();assert.throws(()=>materializeHead(temporary),/Tracked regular/);assert.deepEqual(readAll(),before);refused++;
 console.log(JSON.stringify({status:'PASS_EXACT_HEAD_EOL_GATE',files:47,refusals:refused,allRefusalsZeroWrites:true,manifestAutocrlfCheckout:'PASS_EXACT_LF',network:false}));
}finally{fs.rmSync(temporary,{recursive:true,force:true});}

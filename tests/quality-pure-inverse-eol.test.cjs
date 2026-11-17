const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createHash}=require('node:crypto'),{createRequire}=require('node:module'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/quality-root-source-contract.cjs'),display=require('../scripts/ipqc-c-display-image-source-contract.cjs');
// Stable genuine quality successor: the same raw/normalized pins and mutant
// must run before and after a later merge commit moves HEAD.
const file='public/process/ipqc-c.js',source=execFileSync('git',['show','a1775a8a342d58335edf96d199a9c42844227dc6:'+file]),text=source.toString(),pin=proof.contract.files[file],hash=x=>createHash('sha256').update(x).digest('hex');
void test('quality successor has separate exact raw and normalized C pins',()=>{assert.equal(pin.afterHash,hash(source));assert.equal(pin.afterNormalizedHash,hash(text.replaceAll('\r\n','\n')));assert.equal(hash(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n')),pin.afterNormalizedHash,'native checkout remains separately EOL-equivalent to committed bytes');});
void test('pure C display inverse rejects equivalent EOL bytes; trusted HEAD checkout boundary admits them',()=>{
 const expected=display.withoutDisplay(source),lf=text.replaceAll('\r\n','\n'),crlf=lf.replaceAll('\n','\r\n');
 for(const candidate of [lf,crlf])if(candidate!==text){assert.throws(()=>display.withoutDisplay(candidate),/exact reviewed bytes/);assert.equal(display.imagePolicySource('ipqc-c.js',candidate,{headSource:source}),expected);assert.throws(()=>display.imagePolicySource('ipqc-c.js',candidate,{headSource:Buffer.from(candidate)}),/exact reviewed bytes/);}
 for(const candidate of [crlf+' ',crlf.replace('loading="lazy"','loading="eager"'),crlf.replaceAll('\r\n','\r')])assert.throws(()=>display.imagePolicySource('ipqc-c.js',candidate,{headSource:source}),/worktree differs/);
});
void test('removing the new exact successor guard reproduces the original negative-control escape',()=>{
 const path=require.resolve('../scripts/ipqc-c-display-image-source-contract.cjs'),actual=fs.readFileSync(path,'utf8'),line=" if(qualityPin&&hash(Buffer.from(source).toString('utf8').replaceAll('\\r\\n','\\n'))===qualityPin.afterNormalizedHash)assert.equal(hash(source),qualityPin.afterHash,'C display source differs from exact reviewed bytes');";
 assert(actual.includes(line),'mutant must remove actual guard');const box={module:{exports:{}},require:createRequire(path),Buffer};vm.runInNewContext(actual.replace(line,''),box);const changed=text.replaceAll('\r\n','\n').replaceAll('\n','\r\n');assert.notEqual(changed,text);assert.equal(box.module.exports.withoutDisplay(changed),display.withoutDisplay(source),'old inverse wrongly accepted unknown EOL bytes');
});

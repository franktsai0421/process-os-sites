const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{createHash}=require('node:crypto'),{createRequire}=require('node:module'),{execFileSync}=require('node:child_process');
const proof=require('../scripts/quality-root-source-contract.cjs'),display=require('../scripts/ipqc-c-display-image-source-contract.cjs');
const file='public/process/ipqc-c.js',hash=x=>createHash('sha256').update(x).digest('hex');
for(const {label,ref,pin,guard}of [{label:'historical',ref:'a1775a8a342d58335edf96d199a9c42844227dc6',pin:proof.contract.files[file],guard:'qualityPin'},{label:'office',ref:'HEAD',pin:require('../scripts/quality-office-source-contract.cjs').contract.files[file],guard:'officePin'}]){
 const source=execFileSync('git',['show',ref+':'+file]),text=source.toString();
void test(label+' quality successor has separate exact raw and normalized C pins',()=>{assert.equal(pin.afterHash,hash(source));assert.equal(pin.afterNormalizedHash,hash(text.replaceAll('\r\n','\n')));assert.equal(hash((label==='historical'?require('../scripts/quality-office-source-contract.cjs').projectKnown(fs.readFileSync(file),file):fs.readFileSync(file)).toString().replaceAll('\r\n','\n')),pin.afterNormalizedHash,'native checkout remains separately EOL-equivalent to committed bytes');});
void test(label+' pure C display inverse rejects equivalent EOL bytes; trusted HEAD checkout boundary admits them',()=>{
 const expected=display.withoutDisplay(source),lf=text.replaceAll('\r\n','\n'),crlf=lf.replaceAll('\n','\r\n');
 for(const candidate of [lf,crlf])if(candidate!==text){assert.throws(()=>display.withoutDisplay(candidate),/exact reviewed bytes/);assert.equal(display.imagePolicySource('ipqc-c.js',candidate,{headSource:source}),expected);assert.throws(()=>display.imagePolicySource('ipqc-c.js',candidate,{headSource:Buffer.from(candidate)}),/exact reviewed bytes/);}
 for(const candidate of [crlf+' ',crlf.replace('loading="lazy"','loading="eager"'),crlf.replaceAll('\r\n','\r')])assert.throws(()=>display.imagePolicySource('ipqc-c.js',candidate,{headSource:source}),/worktree differs/);
});
void test(label+' removing the new exact successor guard reproduces the original negative-control escape',()=>{
 const path=require.resolve('../scripts/ipqc-c-display-image-source-contract.cjs'),actual=fs.readFileSync(path,'utf8'),line=" if(officePin&&hash(Buffer.from(source).toString('utf8').replaceAll('\\r\\n','\\n'))===officePin.afterNormalizedHash)assert.equal(hash(source),officePin.afterHash,'C display source differs from exact reviewed bytes');";
 assert(actual.includes(line.replaceAll('officePin',guard)),'mutant must remove actual guard');const box={module:{exports:{}},require:createRequire(path),Buffer};vm.runInNewContext(actual.replace(line.replaceAll('officePin',guard),''),box);const changed=text.replaceAll('\r\n','\n').replaceAll('\n','\r\n');assert.notEqual(changed,text);assert.equal(box.module.exports.withoutDisplay(changed),display.withoutDisplay(source),'old inverse wrongly accepted unknown EOL bytes');
});
}

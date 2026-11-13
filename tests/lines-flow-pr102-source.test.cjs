// Real remote object, not the older PR description or a locally invented tree.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const sha='55d4672cb8004d0b01715714cbc91fbce6b22d2b',file='public/process/master-shared-client.js',hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const extra=`        for(let index=0;index<batch.guards.length;index++)if(batch.guards[index].value===undefined){
          const path=batch.guards[index].path,parent=localValue(theirs,path.slice(0,-1));
          if(!parent||typeof parent!=='object'||Object.hasOwn(parent,path.at(-1)))throw Error('DEPENDENCY_GUARD_REQUIRED');
          batch.guards[index]={path:path.slice(0,-1),value:copy(parent)};
        }
`;
void test('PR102 real remote head contains the candidate previously described as local-only',()=>{
 for(const commit of ['2a1d41503141a151419173c94f31acf8aa8407d8','ae8c20808ccc4270a1ae2e59249f0120695fe00a','e14f268188a5573812afd340e089043be826ead3'])execFileSync('git',['merge-base','--is-ancestor',commit,sha]);
});
void test('PROCESS recovered media helper is exact PR102 code plus retained main absence guards',()=>{
 const bytes=execFileSync('git',['show',sha+':'+file]),source=bytes.toString(),start=source.indexOf('    function compareMasterSnapshots('),end=source.indexOf('    function chooseCatalogConflicts(',start);assert(start>0&&end>start);
 const helper=source.slice(start,end).trim(),current=fs.readFileSync('public/process/page-draft-merge.js','utf8'),begin=current.indexOf('function compareProcessSnapshots('),finish=current.indexOf('function choose(conflicts,',begin),actual=current.slice(begin,finish).trim();assert(begin>0&&finish>begin);assert.equal(actual.split(extra).length,2,'one explicit main absence-guard addition');
 const expected=helper.replace('function compareMasterSnapshots(', 'function compareProcessSnapshots(').replace('        // The command also pins the exact observed workflow revision',extra+'        // The command also pins the exact observed workflow revision');assert.equal(hash(actual),hash(expected));assert.equal(actual,expected);
 for(const mutated of [actual.replace('scope===\'PROCESS\'?processMedia','false?processMedia'),actual.replace("if(!parent||typeof parent!=='object'",'if(false')]){assert.notEqual(mutated,actual);assert.notEqual(hash(mutated),hash(expected));}
 const caller=current.slice(current.indexOf('host.ProcessPageDraftMerge='));assert(caller.includes("scope==='PROCESS'?compareProcessSnapshots:compareMasterSnapshots"),'other master pages retain their main helper');
});

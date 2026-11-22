const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const proof=require('./routine-startup-read-successor.cjs');
const git=(...args)=>execFileSync('git',args);
const base='413614eaf83f466c7dfeb9d99d635f306115fee7';

void test('retirement successor pins the exact diff in both directions, modes, additions and all changed bytes',()=>{
 const opts=['--raw','--no-abbrev','--no-renames'];
 const delta=(a,b)=>git('diff',...opts,a,b,'--',...proof.scope).toString();
 const merged='23cc486120d6b3f175e805958b4a69a3b6235e38';
 const raw=delta(base,merged);
 proof.verify();proof.checkRecovery(raw);
 const inverse=[];
 for(const row of raw.trimEnd().split('\n')){
  const [entry,file]=row.split('\t');
  const [left,right,before,after,status]=entry.slice(1).split(' ');
  inverse.push(':'+right+' '+left+' '+after+' '+before+' '+(status==='A'?'D':'M')+'\t'+file);
  const bytes=git('show',proof.planTree+':'+file);
  assert.equal(require('node:crypto').createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),after);
  for(const changed of [row.replace(after,'1'.repeat(40)),row.replace('100644','100755'),row.replace(file,'unreviewed/'+file)]){
   assert.throws(()=>proof.checkRecovery(raw.replace(row,changed)),{code:'ERR_ASSERTION'});
  }
  if(status==='A')continue;
  const predecessor=proof.historicalPredecessor(bytes,file);
  const expected=git('show',(file==='lib/state-records.ts'?proof.base:base)+':'+file);
  assert(predecessor.equals(expected));
  const mutate=Buffer.from(bytes);mutate[mutate.length>>1]^=1;
  for(const altered of [mutate,bytes.subarray(1),Buffer.from(bytes.toString().replace(/\r?\n/g,'\r\n')),git('cat-file','blob',before)]){
   assert.throws(()=>proof.historicalPredecessor(altered,file),{code:'ERR_ASSERTION'});
  }
 }
 assert.equal(delta(merged,base),inverse.join('\n')+'\n');
 for(const invalid of [inverse.join('\n')+'\n',raw+raw,raw.replace(/^[^\n]+\n/,''),raw+'extra\n'])
  assert.throws(()=>proof.checkRecovery(invalid),{code:'ERR_ASSERTION'});
});


void test('plan-intent successor proves all raw paths in both directions, including new files',()=>{
 const merged='c80b3fa748143613ad218a2db814704966f0a5ba';
 const diff=(a,b)=>git('diff','--raw','--no-abbrev','--no-renames',a,b,'--',...proof.scope).toString();
 const raw=diff(merged,'HEAD'),inverse=[];
 proof.checkIntent(raw);
 for(const row of raw.trimEnd().split('\n')){
   const [entry,file]=row.split('\t'),[left,right,old,next,status]=entry.slice(1).split(' ');
   inverse.push(':'+right+' '+left+' '+next+' '+old+' '+(status==='A'?'D':'M')+'\t'+file);
   const bytes=git('show','HEAD:'+file);
   assert.equal(require('node:crypto').createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),next);
   for(const mutation of [row.replace(next,old),row.replace('100644','100755'),row.replace(file,'extra/'+file),'',row+'\n'+row])
     assert.throws(()=>proof.checkIntent(raw.replace(row,mutation)));
   if(status==='M'){
     const before=git('show',merged+':'+file);
     assert.deepEqual(proof.predecessor(bytes,file),proof.historicalPredecessor(before,file));
     if (file !== 'public/process/index.html') {
       const {assertRawRoutineEncoding}=require('../scripts/routine-integration-source-contract.cjs');
       for (const version of [before,bytes]) {
         const crlf=Buffer.from(version.toString().replace(/\r?\n/g,'\r\n'));
         const changed=crlf.equals(version)?Buffer.from(version.toString().replaceAll('\r\n','\n')):crlf;
         assertRawRoutineEncoding(version,file);
         assert.throws(()=>assertRawRoutineEncoding(changed,file));
       }
     }
     const flip=Buffer.from(bytes);flip[flip.length>>1]^=1;
     for(const bad of [before,flip,bytes.subarray(1),Buffer.concat([bytes,bytes]),Buffer.from(bytes.toString().replace(/\r?\n/g,'\r\n'))])
       assert.throws(()=>proof.predecessor(bad,file));
   }
 }
 assert.equal(diff('HEAD',merged),inverse.join('\n')+'\n');
 assert.throws(()=>proof.checkIntent(raw+'extra\n'));
});

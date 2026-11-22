const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const proof=require('./routine-startup-read-successor.cjs');
const git=(...args)=>execFileSync('git',args);
const base='413614eaf83f466c7dfeb9d99d635f306115fee7';

void test('retirement successor pins the exact diff in both directions, modes, additions and all changed bytes',()=>{
 const opts=['--raw','--no-abbrev','--no-renames'];
 const delta=(a,b)=>git('diff',...opts,a,b,'--',...proof.scope).toString();
 const raw=delta(base,'HEAD');
 proof.verify();proof.checkRecovery(raw);
 const inverse=[];
 for(const row of raw.trimEnd().split('\n')){
  const [entry,file]=row.split('\t');
  const [left,right,before,after,status]=entry.slice(1).split(' ');
  inverse.push(':'+right+' '+left+' '+after+' '+before+' '+(status==='A'?'D':'M')+'\t'+file);
  const bytes=git('show','HEAD:'+file);
  assert.equal(require('node:crypto').createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),after);
  for(const changed of [row.replace(after,'1'.repeat(40)),row.replace('100644','100755'),row.replace(file,'unreviewed/'+file)]){
   assert.throws(()=>proof.checkRecovery(raw.replace(row,changed)),{code:'ERR_ASSERTION'});
  }
  if(status==='A')continue;
  const predecessor=proof.predecessor(bytes,file);
  const expected=git('show',(file==='lib/state-records.ts'?proof.base:base)+':'+file);
  assert(predecessor.equals(expected));
  const mutate=Buffer.from(bytes);mutate[mutate.length>>1]^=1;
  for(const altered of [mutate,bytes.subarray(1),Buffer.from(bytes.toString().replace(/\r?\n/g,'\r\n')),git('cat-file','blob',before)]){
   assert.throws(()=>proof.predecessor(altered,file),{code:'ERR_ASSERTION'});
  }
 }
 assert.equal(delta('HEAD',base),inverse.join('\n')+'\n');
 for(const invalid of [inverse.join('\n')+'\n',raw+raw,raw.replace(/^[^\n]+\n/,''),raw+'extra\n'])
  assert.throws(()=>proof.checkRecovery(invalid),{code:'ERR_ASSERTION'});
});

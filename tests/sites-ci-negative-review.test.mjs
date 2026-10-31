import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validatePolicy,authorizeSupplementalReviews,inspectSourceBytes,gitBlobId,runPreflight} from '../scripts/sites-ci-preflight.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),policy=JSON.parse(fs.readFileSync(new URL('../config/sites-source-reviewed-blobs.json',import.meta.url))),review=policy.supplementalReviews.find(r=>r.commit==='f58d847d86e318f75631540656a4ae013103461a');
const checks=[],test=(name,run)=>{run();checks.push(name);};
const proof=()=>({commits:new Set(policy.supplementalReviews.map(r=>r.commit)),pairs:new Map(policy.supplementalReviews.map(r=>[r.commit,new Set(r.entries.map(e=>e.path+'\0'+e.blob))]))});
const git=(args,cwd=root)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['pipe','pipe','pipe']});
test('five exact public history tuples and bodies exist without altering historical bytes',()=>{
 assert.equal(review.commit,'f58d847d86e318f75631540656a4ae013103461a');assert.equal(review.entries.length,5);
 for(const entry of review.entries){assert.equal(git(['rev-parse',review.commit+':'+entry.path]).trim(),entry.blob);const bytes=execFileSync('git',['cat-file','blob',entry.blob],{cwd:root});assert.equal(gitBlobId(bytes),entry.blob);}
});
test('general policy entries never accept either sensitive category',()=>{
 for(const category of ['PRIVATE_KEY','BEARER_LITERAL'])assert.throws(()=>validatePolicy({...policy,entries:[{path:'tests/example.mjs',blob:'a'.repeat(40),categories:[category]}]}),/SOURCE_REVIEW_POLICY_INVALID/);
});
test('supplement cannot change commit path blob category or widen any tuple',()=>{
 for(const reviewedCommit of ['f58d847d86e318f75631540656a4ae013103461a','ae2ff91eca847faac12337e17cdcbfdfee78d789'])for(const change of [r=>r.commit='a'.repeat(40),r=>r.entries[0].path='tests/other.mjs',r=>r.entries[0].blob='b'.repeat(40),r=>r.entries[0].categories=['PRIVATE_KEY'],r=>r.entries[0].categories.push('INLINE_MEDIA'),r=>r.entries.push({...r.entries[0],path:'tests/*'})]){const p=structuredClone(policy);change(p.supplementalReviews.find(r=>r.commit===reviewedCommit));assert.throws(()=>validatePolicy(p),/SOURCE_SUPPLEMENT_REVIEW_INVALID/);}
});
test('missing ancestor and incorrect tree membership refuse even the exported structural helper',()=>{
 const p=proof();p.commits.delete(review.commit);assert.throws(()=>authorizeSupplementalReviews(policy,p.commits,p.pairs),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);
 const q=proof();q.pairs.set(review.commit,new Set());assert.throws(()=>authorizeSupplementalReviews(policy,q.commits,q.pairs),/SOURCE_SUPPLEMENT_BLOB_MISMATCH/);
});
test('fabricated Sets and Maps cannot mint the private actual-Git proof',()=>{
 const p=proof(),forged=authorizeSupplementalReviews(policy,p.commits,p.pairs);
 for(const entry of review.entries){const raw=execFileSync('git',['cat-file','blob',entry.blob],{cwd:root}),crlf=Buffer.from(raw.toString().replace(/\r?\n/g,'\r\n'));
  const changed=Buffer.concat([raw,Buffer.from('\n// changed')]);
  for(const policyCopy of [forged,{...forged},structuredClone(forged),{entries:forged.entries.map(e=>({...e,categories:[...e.categories,'PRIVATE_KEY','BEARER_LITERAL']}))}]){
   for(const [file,bytes,options] of [[entry.path,raw,{}],['tests/other.mjs',raw,{}],[entry.path,changed,{}],[entry.path,crlf,{}],[entry.path,crlf,{working:true}]])assert.throws(()=>inspectSourceBytes(file,bytes,policyCopy,options),/SOURCE_UNREVIEWED/);
  }
 }
});
test('real credential shapes and altered negative literals never gain generic permission',()=>{
 const p=proof(),forged=authorizeSupplementalReviews(policy,p.commits,p.pairs),header=['-----BEGIN ','PRIVATE KEY-----'].join('');
 for(const entry of review.entries.slice(3))for(const value of [['Bearer','x'.repeat(48)].join(' '),header+'\n'+Buffer.from('synthetic body').toString('base64')+'\n'+['-----END ','PRIVATE KEY-----'].join('')])assert.throws(()=>inspectSourceBytes(entry.path,Buffer.from(value),forged),/SOURCE_UNREVIEWED/);
});
test('actual public ancestry permits only exact historical blobs and CRLF working copies',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'source-review-positive-'));
 try{git(['clone','--shared','--no-checkout',root,temp]);git(['checkout','--detach','HEAD'],temp);fs.writeFileSync(path.join(temp,'config/sites-source-reviewed-blobs.json'),JSON.stringify(policy));
  for(const entry of review.entries){const target=path.join(temp,entry.path),raw=execFileSync('git',['cat-file','blob',entry.blob],{cwd:root});fs.writeFileSync(target,raw.toString().replace(/\r?\n/g,'\r\n'));}
  const prior=process.env.GITHUB_ACTIONS;try{delete process.env.GITHUB_ACTIONS;const result=runPreflight(temp);assert.equal(result.status,'PASS_SOURCE_ONLY_HISTORY_AND_WORKTREE');assert.equal(result.head,git(['rev-parse','HEAD']).trim());}finally{if(prior===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=prior;}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('real Git checkout without the pinned public ancestor fails closed',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'source-review-negative-'));
 try{git(['clone','--shared','--no-checkout',root,temp]);git(['checkout','--detach','1a7e36e7e518eb4fb4649cbda6f335c715fb7787'],temp);fs.writeFileSync(path.join(temp,'config/sites-source-reviewed-blobs.json'),JSON.stringify(policy));
  const prior=process.env.GITHUB_ACTIONS;try{delete process.env.GITHUB_ACTIONS;assert.throws(()=>runPreflight(temp),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);}finally{if(prior===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=prior;}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
const signerReview=policy.supplementalReviews.at(-1),signer=signerReview.entries[0];
test('sixth tuple pins actual public commit path blob and category without a reusable current signer',()=>{
 assert.equal(signerReview.commit,'ae2ff91eca847faac12337e17cdcbfdfee78d789');assert.equal(signerReview.entries.length,1);
 assert.equal(signer.path,'tests/master-ab-auth-phase-fixture.mjs');assert.equal(signer.blob,'e83221cf75f18c9cdcda72baa69476a78b298077');assert.deepEqual(signer.categories,['ASSIGNED_SECRET']);
 assert.equal(git(['rev-parse',signerReview.commit+':'+signer.path]).trim(),signer.blob);
 assert.deepEqual(inspectSourceBytes(signer.path,fs.readFileSync(path.join(root,signer.path)),{entries:[]},{working:true}),[]);
});
test('sixth tuple rejects fabricated ancestry policy clones mutation paths changed bytes and CRLF',()=>{
 const p=proof(),forged=authorizeSupplementalReviews(policy,p.commits,p.pairs),raw=execFileSync('git',['cat-file','blob',signer.blob],{cwd:root});
 for(const copy of [forged,{...forged},structuredClone(forged),{entries:[...forged.entries,{...signer,path:'tests/other.mjs'}]}])
  for(const file of [signer.path,'tests/other.mjs'])for(const bytes of [raw,Buffer.concat([raw,Buffer.from('\n')]),Buffer.from(raw.toString().replace(/\n/g,'\r\n'))])
   for(const working of [false,true])assert.throws(()=>inspectSourceBytes(file,bytes,copy,{working}),/SOURCE_UNREVIEWED/);
 const missing=proof();missing.commits.delete(signerReview.commit);assert.throws(()=>authorizeSupplementalReviews(policy,missing.commits,missing.pairs),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);
 const wrong=proof();wrong.pairs.set(signerReview.commit,new Set());assert.throws(()=>authorizeSupplementalReviews(policy,wrong.commits,wrong.pairs),/SOURCE_SUPPLEMENT_BLOB_MISMATCH/);
});
test('actual Git proof never permits reintroducing the exact historical signer into working files',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'source-signer-working-negative-'));
 try{git(['clone','--shared','--no-checkout',root,temp]);git(['checkout','--detach','HEAD'],temp);fs.writeFileSync(path.join(temp,'config/sites-source-reviewed-blobs.json'),JSON.stringify(policy));
  const raw=execFileSync('git',['cat-file','blob',signer.blob],{cwd:root});
  const prior=process.env.GITHUB_ACTIONS;try{delete process.env.GITHUB_ACTIONS;
   for(const bytes of [raw,Buffer.from(raw.toString().replace(/\n/g,'\r\n'))]){fs.writeFileSync(path.join(temp,signer.path),bytes);assert.throws(()=>runPreflight(temp),/SOURCE_UNREVIEWED_ASSIGNED_SECRET/);}
   git(['checkout','--force','--detach','00993fbd5455fe9dc337cf64bf9ee50ef804afff'],temp);fs.writeFileSync(path.join(temp,'config/sites-source-reviewed-blobs.json'),JSON.stringify(policy));assert.throws(()=>runPreflight(temp),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);
  }finally{if(prior===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=prior;}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
console.log(JSON.stringify({status:'PASS_EXACT_NEGATIVE_FIXTURE_PROOF_BOUNDARIES',checks,realData:false,network:false}));

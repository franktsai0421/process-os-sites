import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validatePolicy,authorizeSupplementalReviews,inspectSourceBytes,gitBlobId,runPreflight} from '../scripts/sites-ci-preflight.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),policy=JSON.parse(fs.readFileSync(new URL('../config/sites-source-reviewed-blobs.json',import.meta.url))),review=policy.supplementalReviews.at(-1);
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
 for(const change of [r=>r.commit='a'.repeat(40),r=>r.entries[0].path='tests/other.mjs',r=>r.entries[0].blob='b'.repeat(40),r=>r.entries[0].categories=['PRIVATE_KEY'],r=>r.entries[0].categories.push('INLINE_MEDIA'),r=>r.entries.push({...r.entries[0],path:'tests/*'})]){const p=structuredClone(policy);change(p.supplementalReviews.at(-1));assert.throws(()=>validatePolicy(p),/SOURCE_SUPPLEMENT_REVIEW_INVALID/);}
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
 try{git(['clone','--shared','--no-checkout',root,temp]);git(['checkout','--detach',review.commit],temp);fs.writeFileSync(path.join(temp,'config/sites-source-reviewed-blobs.json'),JSON.stringify(policy));
  for(const entry of review.entries){const target=path.join(temp,entry.path),raw=execFileSync('git',['cat-file','blob',entry.blob],{cwd:root});fs.writeFileSync(target,raw.toString().replace(/\r?\n/g,'\r\n'));}
  const prior=process.env.GITHUB_ACTIONS;try{delete process.env.GITHUB_ACTIONS;const result=runPreflight(temp);assert.equal(result.status,'PASS_SOURCE_ONLY_HISTORY_AND_WORKTREE');assert.equal(result.head,review.commit);}finally{if(prior===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=prior;}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('real Git checkout without the pinned public ancestor fails closed',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'source-review-negative-'));
 try{git(['clone','--shared','--no-checkout',root,temp]);git(['checkout','--detach','1a7e36e7e518eb4fb4649cbda6f335c715fb7787'],temp);fs.writeFileSync(path.join(temp,'config/sites-source-reviewed-blobs.json'),JSON.stringify(policy));
  const prior=process.env.GITHUB_ACTIONS;try{delete process.env.GITHUB_ACTIONS;assert.throws(()=>runPreflight(temp),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);}finally{if(prior===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=prior;}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
console.log(JSON.stringify({status:'PASS_EXACT_NEGATIVE_FIXTURE_PROOF_BOUNDARIES',checks,realData:false,network:false}));

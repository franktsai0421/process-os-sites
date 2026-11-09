import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import vm from 'node:vm';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validatePolicy,authorizeSupplementalReviews,inspectSourceBytes,gitBlobId,runPreflight} from '../scripts/sites-ci-preflight.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),policy=JSON.parse(fs.readFileSync(new URL('../config/sites-source-reviewed-blobs.json',import.meta.url))),review=policy.supplementalReviews.find(r=>r.commit==='f58d847d86e318f75631540656a4ae013103461a');
const checks=[],test=(name,run)=>{run();checks.push(name);};
const fqcReview=policy.supplementalReviews.find(r=>r.commit==='6fb5e5b25e01603b1e34c1db4b99ed16a2ce8e0c'),iqcBeginReview=policy.supplementalReviews.find(r=>r.commit==='7767ba5480cdc9f194fb72f4838ce6463a2cb2c0'),iqcUIOwnerReview=policy.supplementalReviews.find(r=>r.commit==='2245941e658d67ba6d091e81fa9088b03be3a29b'),negativeEntries=[...review.entries,...fqcReview.entries,...iqcBeginReview.entries,...iqcUIOwnerReview.entries];
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
 for(const reviewedCommit of ['f58d847d86e318f75631540656a4ae013103461a','ae2ff91eca847faac12337e17cdcbfdfee78d789','6fb5e5b25e01603b1e34c1db4b99ed16a2ce8e0c',iqcBeginReview.commit,iqcUIOwnerReview.commit])for(const change of [r=>r.commit='a'.repeat(40),r=>r.entries[0].path='tests/other.mjs',r=>r.entries[0].blob='b'.repeat(40),r=>r.entries[0].categories=['INLINE_MEDIA'],r=>r.entries[0].categories.push('INLINE_MEDIA'),r=>r.entries.push({...r.entries[0],path:'tests/*'})]){const p=structuredClone(policy);change(p.supplementalReviews.find(r=>r.commit===reviewedCommit));assert.throws(()=>validatePolicy(p),/SOURCE_SUPPLEMENT_REVIEW_INVALID/);}
});
test('missing ancestor and incorrect tree membership refuse even the exported structural helper',()=>{
 const p=proof();p.commits.delete(review.commit);assert.throws(()=>authorizeSupplementalReviews(policy,p.commits,p.pairs),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);
 const q=proof();q.pairs.set(review.commit,new Set());assert.throws(()=>authorizeSupplementalReviews(policy,q.commits,q.pairs),/SOURCE_SUPPLEMENT_BLOB_MISMATCH/);
});
test('fabricated Sets and Maps cannot mint the private actual-Git proof',()=>{
 const p=proof(),forged=authorizeSupplementalReviews(policy,p.commits,p.pairs);
 for(const entry of negativeEntries){const raw=execFileSync('git',['cat-file','blob',entry.blob],{cwd:root}),crlf=Buffer.from(raw.toString().replace(/\r?\n/g,'\r\n'));
  const changed=Buffer.concat([raw,Buffer.from('\n// changed')]);
  for(const policyCopy of [forged,{...forged},structuredClone(forged),{entries:forged.entries.map(e=>({...e,categories:[...e.categories,'PRIVATE_KEY','BEARER_LITERAL']}))}]){
   for(const [file,bytes,options] of [[entry.path,raw,{}],['tests/other.mjs',raw,{}],[entry.path,changed,{}],[entry.path,crlf,{}],[entry.path,crlf,{working:true}]])assert.throws(()=>inspectSourceBytes(file,bytes,policyCopy,options),/SOURCE_UNREVIEWED/);
  }
 }
});
test('real credential shapes and altered negative literals never gain generic permission',()=>{
 const p=proof(),forged=authorizeSupplementalReviews(policy,p.commits,p.pairs),header=['-----BEGIN ','PRIVATE KEY-----'].join('');
 for(const entry of negativeEntries.filter(entry=>entry.categories.some(c=>['PRIVATE_KEY','BEARER_LITERAL'].includes(c))))for(const value of [['Bearer','x'.repeat(48)].join(' '),header+'\n'+Buffer.from('synthetic body').toString('base64')+'\n'+['-----END ','PRIVATE KEY-----'].join('')])assert.throws(()=>inspectSourceBytes(entry.path,Buffer.from(value),forged),/SOURCE_UNREVIEWED/);
});
test('actual public ancestry permits only exact historical blobs and CRLF working copies',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'source-review-positive-'));
 try{git(['clone','--shared','--no-checkout',root,temp]);git(['checkout','--detach','HEAD'],temp);fs.writeFileSync(path.join(temp,'config/sites-source-reviewed-blobs.json'),JSON.stringify(policy));
  for(const entry of review.entries){const target=path.join(temp,entry.path),raw=execFileSync('git',['cat-file','blob',entry.blob],{cwd:root});fs.writeFileSync(target,raw.toString().replace(/\r?\n/g,'\r\n'));}
  const prior=process.env.GITHUB_ACTIONS;try{delete process.env.GITHUB_ACTIONS;const result=runPreflight(temp);assert.equal(result.status,'PASS_SOURCE_ONLY_HISTORY_AND_WORKTREE');assert.equal(result.head,git(['rev-parse','HEAD']).trim());
   const entry=fqcReview.entries[0],target=path.join(temp,entry.path),raw=execFileSync('git',['cat-file','blob',entry.blob],{cwd:root});
   fs.writeFileSync(target,Buffer.concat([raw,Buffer.from('\n// changed')]));assert.throws(()=>runPreflight(temp),/SOURCE_UNREVIEWED_PRIVATE_KEY/);
   fs.writeFileSync(target,raw.toString().replace(/\r?\n/g,'\r\n'));assert.equal(runPreflight(temp).status,'PASS_SOURCE_ONLY_HISTORY_AND_WORKTREE');
   const moved=path.join(temp,'tests/fqc-moved-fixture.mjs');fs.writeFileSync(moved,raw);assert.throws(()=>runPreflight(temp),/SOURCE_UNREVIEWED_PRIVATE_KEY/);fs.unlinkSync(moved);
  }finally{if(prior===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=prior;}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('real Git checkout without the pinned public ancestor fails closed',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'source-review-negative-'));
 try{git(['clone','--shared','--no-checkout',root,temp]);git(['checkout','--detach','1a7e36e7e518eb4fb4649cbda6f335c715fb7787'],temp);fs.writeFileSync(path.join(temp,'config/sites-source-reviewed-blobs.json'),JSON.stringify(policy));
  const prior=process.env.GITHUB_ACTIONS;try{delete process.env.GITHUB_ACTIONS;assert.throws(()=>runPreflight(temp),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);}finally{if(prior===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=prior;}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
const signerReview=policy.supplementalReviews.find(r=>r.commit==='ae2ff91eca847faac12337e17cdcbfdfee78d789'),signer=signerReview.entries[0];
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
test('real Git ancestor before the FQC extension cannot authorize its tuple',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'source-fqc-ancestor-negative-'));
 try{git(['clone','--shared','--no-checkout',root,temp]);git(['checkout','--detach','d88b416123fca250bab813939d82033c3ef1ee2f'],temp);fs.writeFileSync(path.join(temp,'config/sites-source-reviewed-blobs.json'),JSON.stringify(policy));
  const prior=process.env.GITHUB_ACTIONS;try{delete process.env.GITHUB_ACTIONS;assert.throws(()=>runPreflight(temp),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);}finally{if(prior===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=prior;}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('FQC extension pins only the same synthetic marker plus appended recovery tests',()=>{
 assert.equal(fqcReview.entries.length,1);const entry=fqcReview.entries[0];
 assert.equal(entry.path,'tests/multiuser-local-recovery-helper.test.mjs');assert.equal(entry.blob,'81c1f0947d8376352ba8670a7dade3c9c6954c35');assert.deepEqual(entry.categories,['PRIVATE_KEY']);
 assert.equal(git(['rev-parse',fqcReview.commit+':'+entry.path]).trim(),entry.blob);
 const old=execFileSync('git',['cat-file','blob',review.entries.at(-1).blob],{cwd:root}),raw=execFileSync('git',['cat-file','blob',entry.blob],{cwd:root});
 assert(raw.subarray(0,old.length).equals(old));assert.equal(raw.length-old.length,1028);
 const marker=['-----BEGIN ','PRIVATE KEY-----'].join('');assert.equal(raw.toString().split(marker).length-1,1);assert(!raw.toString().includes(['-----END ','PRIVATE KEY-----'].join('')));
 const p=proof();p.commits.delete(fqcReview.commit);assert.throws(()=>authorizeSupplementalReviews(policy,p.commits,p.pairs),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);
 const q=proof();q.pairs.set(fqcReview.commit,new Set());assert.throws(()=>authorizeSupplementalReviews(policy,q.commits,q.pairs),/SOURCE_SUPPLEMENT_BLOB_MISMATCH/);
});
test('IQC Begin extension pins one changed test line and the sole unchanged synthetic key classification',()=>{
 assert.deepEqual(iqcBeginReview,{commit:'7767ba5480cdc9f194fb72f4838ce6463a2cb2c0',entries:[{path:'scripts/test-iqc-editing-projection-races.cjs',blob:'9c17679c4a2f5380e667facded10178c4e9dcc53',categories:['WORKSTATION_PATH']}]});
 const entry=iqcBeginReview.entries[0],prior=review.entries.find(e=>e.path===entry.path);
 assert.equal(git(['rev-parse',iqcBeginReview.commit+':'+entry.path]).trim(),entry.blob);
 git(['merge-base','--is-ancestor',review.commit,iqcBeginReview.commit]);
 const old=execFileSync('git',['cat-file','blob',prior.blob],{cwd:root}).toString(),raw=execFileSync('git',['cat-file','blob',entry.blob],{cwd:root}),lines=raw.toString().split('\n'),oldLines=old.split('\n');
 assert.equal(lines.length,oldLines.length);const changed=lines.flatMap((line,index)=>line===oldLines[index]?[]:[index]);assert.equal(changed.length,1);
 assert(lines[changed[0]].includes('actual Begin projection registers every future active switch as fresh'));assert(oldLines[changed[0]].includes('actual Begin projection registers every future active switch as fresh'));
 const scanner=fs.readFileSync(path.join(root,'scripts/sites-ci-preflight.mjs'),'utf8'),start=scanner.indexOf('const patterns=['),end=scanner.indexOf('\n];',start);assert(start>=0&&end>start);
 const patterns=vm.runInNewContext(scanner.slice(start,end+3)+';patterns;');
 assert.deepEqual(Array.from(patterns,([name])=>name),['PRIVATE_KEY','GITHUB_TOKEN','JWT_LITERAL','BEARER_LITERAL','ASSIGNED_SECRET','INLINE_MEDIA','WORKSTATION_PATH']);
 const counts=text=>Object.fromEntries(patterns.map(([name,pattern])=>[name,[...text.matchAll(new RegExp(pattern.source,pattern.flags+'g'))].length]));
 assert.deepEqual(counts(raw.toString()),{PRIVATE_KEY:0,GITHUB_TOKEN:0,JWT_LITERAL:0,BEARER_LITERAL:0,ASSIGNED_SECRET:0,INLINE_MEDIA:0,WORKSTATION_PATH:1});assert.deepEqual(counts(old),counts(raw.toString()));
 const syntheticKey=['shared-draft-v3-operation','a','/api/iqc/workflow?caseMetadata=1'].join(':');
 assert.equal(lines[6],oldLines[6]);assert(lines[6].includes(syntheticKey));
 assert.deepEqual(inspectSourceBytes(entry.path,fs.readFileSync(path.join(root,entry.path)),{entries:[]},{working:true}),[],'current fixture has no classified literal');
 const missing=proof();missing.commits.delete(iqcBeginReview.commit);assert.throws(()=>authorizeSupplementalReviews(policy,missing.commits,missing.pairs),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);
 const wrong=proof();wrong.pairs.set(iqcBeginReview.commit,new Set([entry.path+'\0'+'a'.repeat(40)]));assert.throws(()=>authorizeSupplementalReviews(policy,wrong.commits,wrong.pairs),/SOURCE_SUPPLEMENT_BLOB_MISMATCH/);
});
test('actual Git IQC Begin proof permits only exact historical bytes and rejects changed or moved fixtures',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'source-iqc-begin-review-'));
 try{git(['clone','--shared','--no-checkout',root,temp]);git(['checkout','--detach','HEAD'],temp);fs.writeFileSync(path.join(temp,'config/sites-source-reviewed-blobs.json'),JSON.stringify(policy));
  const entry=iqcBeginReview.entries[0],target=path.join(temp,entry.path),raw=execFileSync('git',['cat-file','blob',entry.blob],{cwd:root}),prior=process.env.GITHUB_ACTIONS;
  try{delete process.env.GITHUB_ACTIONS;
   fs.writeFileSync(target,raw.toString().replace(/\r?\n/g,'\r\n'));assert.equal(runPreflight(temp).status,'PASS_SOURCE_ONLY_HISTORY_AND_WORKTREE');
   fs.writeFileSync(target,Buffer.concat([raw,Buffer.from('\n// changed')]));assert.throws(()=>runPreflight(temp),/SOURCE_UNREVIEWED_WORKSTATION_PATH/);
   fs.writeFileSync(target,raw);const moved=path.join(temp,'tests/moved-iqc-fixture.mjs');fs.writeFileSync(moved,raw);assert.throws(()=>runPreflight(temp),/SOURCE_UNREVIEWED_WORKSTATION_PATH/);fs.unlinkSync(moved);
   git(['checkout','--force','--detach',iqcBeginReview.commit+'^'],temp);fs.writeFileSync(path.join(temp,'config/sites-source-reviewed-blobs.json'),JSON.stringify(policy));assert.throws(()=>runPreflight(temp),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);
  }finally{if(prior===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=prior;}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('IQC UI owner tuple pins the independently reviewed ancestor and unchanged synthetic receipt classification',()=>{
 assert.deepEqual(iqcUIOwnerReview,{commit:'2245941e658d67ba6d091e81fa9088b03be3a29b',entries:[{path:'scripts/test-iqc-editing-projection-ui.cjs',blob:'43ca7bcdcfc0594c5401c38f198428d21132fbe1',categories:['WORKSTATION_PATH']}]});
 const entry=iqcUIOwnerReview.entries[0],raw=execFileSync('git',['cat-file','blob',entry.blob],{cwd:root});assert.equal(git(['rev-parse',iqcUIOwnerReview.commit+':'+entry.path]).trim(),entry.blob);git(['merge-base','--is-ancestor',iqcUIOwnerReview.commit,'HEAD']);
 const old=execFileSync('git',['cat-file','blob',review.entries.find(row=>row.path===entry.path).blob],{cwd:root});const key=['shared-draft-v3-operation','a','/api/iqc/workflow?caseMetadata=1'].join(':');assert(raw.includes(key)&&old.includes(key));assert.equal([...raw.toString().matchAll(/\b[A-Za-z]:[\\/]/g)].length,1);assert(raw.includes("identity:{id:'a'}"));assert(raw.includes('synthetic-legacy-full-command'));
 const missing=proof();missing.commits.delete(iqcUIOwnerReview.commit);assert.throws(()=>authorizeSupplementalReviews(policy,missing.commits,missing.pairs),/SOURCE_SUPPLEMENT_NOT_ANCESTOR/);const wrong=proof();wrong.pairs.set(iqcUIOwnerReview.commit,new Set());assert.throws(()=>authorizeSupplementalReviews(policy,wrong.commits,wrong.pairs),/SOURCE_SUPPLEMENT_BLOB_MISMATCH/);
});
console.log(JSON.stringify({status:'PASS_EXACT_NEGATIVE_FIXTURE_PROOF_BOUNDARIES',checks,realData:false,network:false}));

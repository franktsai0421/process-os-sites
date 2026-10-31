import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sourcePathDisposition} from '../lib/sites-source-boundary.mjs';

const held=new Set(['scripts/dev-package-restore.mjs','scripts/u1-package.mjs','scripts/dev-package-update.mjs']);
// Independently reviewed exact synthetic fixtures. No other commit, path,
// blob or category is admitted by this supplement; the original anchor stays.
// Only these exact historical synthetic rejection fixtures can receive a proof.
// The proof is private and is minted below only after real Git ancestry/tree checks.
const negativeFixtureReview={"commit":"f58d847d86e318f75631540656a4ae013103461a","entries":[{"path":"scripts/test-iqc-editing-projection-races.cjs","blob":"9874f0c059728373f9b8e60df6d74b167b9ecbf1","categories":["WORKSTATION_PATH"]},{"path":"scripts/test-iqc-editing-projection-ui.cjs","blob":"f4c1d47bb90371b329c2f53f0b55a3023c09de3e","categories":["WORKSTATION_PATH"]},{"path":"tests/multiuser-canvas-actual-transport.test.mjs","blob":"62de3828f3748c6544702062e835bc4942df338d","categories":["WORKSTATION_PATH"]},{"path":"tests/multiuser-iqc-local-recovery-composition.test.mjs","blob":"2f9e9dd898fccddb300b4f8d306ea63d3ac5e76e","categories":["BEARER_LITERAL"]},{"path":"tests/multiuser-local-recovery-helper.test.mjs","blob":"e038d0aaddb80a09ff6fdff6a1d1a19de04e6e57","categories":["PRIVATE_KEY"]}]};
for(const entry of negativeFixtureReview.entries){Object.freeze(entry.categories);Object.freeze(entry);}
Object.freeze(negativeFixtureReview.entries);Object.freeze(negativeFixtureReview);
const negativeFixtureProofs=new WeakMap();
const proofKey=(file,blob,category)=>file+'\0'+blob+'\0'+category;
const negativeFixtureKeys=Object.freeze(negativeFixtureReview.entries.flatMap(entry=>entry.categories.map(category=>proofKey(entry.path,entry.blob,category))));
const supplementalReviews=[{commit:'f5992734796c93d384759af4656ec878fb9614ce',entries:[
 {path:'scripts/test-integrated-bootstrap.cjs',blob:'c991cb7e3d377436df4780a7fa334b35472cd8f6',categories:['ASSIGNED_SECRET']},
 {path:'tests/sites-delivery-browser.test.mjs',blob:'ce58816f488382bfe41438ce629c15b6b0594c08',categories:['WORKSTATION_PATH']},
]},
// PR26's extended synthetic browser fixture retains the previously reviewed
// standard Chrome fallback. Admit only this historical ancestor/path/blob/category;
// future browser discovery no longer embeds an installation path.
{commit:'705e92bf53b7cd4ed9667444bcd5289679a86234',entries:[
 {path:'tests/sites-delivery-browser.test.mjs',blob:'f7992a769f1e739ce60ec6887137348824a429e6',categories:['WORKSTATION_PATH']},
]},negativeFixtureReview];
const patterns=[
 ['PRIVATE_KEY',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['GITHUB_TOKEN',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b/],
 ['JWT_LITERAL',/\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/],
 ['BEARER_LITERAL',/Bearer\s+[A-Za-z0-9_-]{32,}/],
 ['ASSIGNED_SECRET',/(?:CLOUDFLARE_API_TOKEN|CF_API_KEY|SUPABASE_SERVICE_ROLE_KEY|JWT_SECRET|PROCESS_SESSION_SECRET|PROCESS_RELEASE_TOKEN|PROCESS_OWNER_BOOTSTRAP_SECRET)\s*[:=]\s*["'][A-Za-z0-9_/-]{24,}["']/],
 ['INLINE_MEDIA',/data:(?:image|video|audio)\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{80,}/i],
 ['WORKSTATION_PATH',/\b[A-Za-z]:[\\/]/],
];
export function validateSourceMember(file,mode='100644'){
 if(held.has(file)||sourcePathDisposition(file)!=='source')throw Error('SOURCE_MEMBER_FORBIDDEN');
 if(!['100644','100755'].includes(mode))throw Error('SOURCE_MEMBER_MODE');
 if(/\.(?:png|jpe?g|gif|webp|ico|avif|mp[34]|mov|pdf|xlsx?|docx?|7z|rar|wasm|exe|dll)$/i.test(file))throw Error('SOURCE_MEDIA_OR_BINARY_PATH');
}
export function gitBlobId(bytes){return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');}
export function validatePolicy(policy){
 if(policy?.version!==1||!/^[a-f0-9]{40}$/.test(policy.reviewedSource)||!Array.isArray(policy.entries))throw Error('SOURCE_REVIEW_POLICY_INVALID');
 const seen=new Set();for(const item of policy.entries){validateSourceMember(item.path);const key=item.path+'\0'+item.blob;
  if(!/^[a-f0-9]{40}$/.test(item.blob)||seen.has(key)||!Array.isArray(item.categories)||!item.categories.length||item.categories.some(c=>!['ASSIGNED_SECRET','INLINE_MEDIA','WORKSTATION_PATH'].includes(c)))throw Error('SOURCE_REVIEW_POLICY_INVALID');seen.add(key);
 }
 if(policy.supplementalReviews!==undefined&&JSON.stringify(policy.supplementalReviews)!==JSON.stringify(supplementalReviews))throw Error('SOURCE_SUPPLEMENT_REVIEW_INVALID');
 return policy;
}
export function authorizeSupplementalReviews(policy,commits,pairsByCommit){
 validatePolicy(policy);
 for(const review of policy.supplementalReviews||[]){
  if(!commits.has(review.commit))throw Error('SOURCE_SUPPLEMENT_NOT_ANCESTOR');
  for(const item of review.entries)if(!pairsByCommit.get(review.commit)?.has(item.path+'\0'+item.blob))throw Error('SOURCE_SUPPLEMENT_BLOB_MISMATCH');
 }
 return {...policy,entries:[...policy.entries,...(policy.supplementalReviews||[]).flatMap(review=>review.entries)]};
}
export function inspectSourceBytes(file,bytes,policy,{working=false}={}){
 validateSourceMember(file);
 if(!Buffer.isBuffer(bytes)||bytes.length>5*1024*1024)throw Error('SOURCE_BLOB_SIZE');
 if(bytes.includes(0))throw Error('SOURCE_BINARY_PAYLOAD');
 let value;try{value=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('SOURCE_TEXT_ENCODING');}
 const oid=gitBlobId(bytes),canonical=working?gitBlobId(Buffer.from(value.replace(/\r\n/g,'\n'))):oid;
 const reviewed=policy.entries.find(item=>item.path===file&&(item.blob===oid||item.blob===canonical));
 const classified=[];
 for(const [category,pattern] of patterns)if(pattern.test(value)){
  const sensitive=category==='PRIVATE_KEY'||category==='BEARER_LITERAL';
  const key=proofKey(file,canonical,category),fixedNegative=negativeFixtureKeys.includes(key);
  if(!reviewed?.categories.includes(category)||(sensitive&&!fixedNegative)||((sensitive||fixedNegative)&&!negativeFixtureProofs.get(policy)?.includes(key)))throw Error('SOURCE_UNREVIEWED_'+category);
  // Hash/tuple authority is mandatory; these shapes are additional checks, not exemptions.
  if(fixedNegative&&category==='BEARER_LITERAL'){
   const matches=value.match(new RegExp(pattern.source,'g'))||[];
   if(matches.length!==1||matches[0]!==['Bearer','abcdefghijklmnopqrstuvwxyz0123456789'].join(' '))throw Error('SOURCE_NEGATIVE_FIXTURE_SHAPE');
  }
  if(fixedNegative&&category==='PRIVATE_KEY'){
   const marker=['-----BEGIN ','PRIVATE KEY-----'].join(''),matches=value.match(new RegExp(pattern.source,'g'))||[];
   if(matches.length!==1||matches[0]!==marker||!value.includes("{ note: '"+marker+"' }")||value.includes(['-----END ','PRIVATE KEY-----'].join('')))throw Error('SOURCE_NEGATIVE_FIXTURE_SHAPE');
  }
  classified.push(category);
 }
 return classified;
}
export function parseBatch(raw,objects){
 let position=0;const result=[];
 for(const item of objects){const nl=raw.indexOf(10,position);if(nl<0)throw Error('SOURCE_BATCH_HEADER');
  const header=raw.subarray(position,nl).toString().split(' '),size=Number(header[2]);
  if(header[0]!==item.oid||header[1]!=='blob'||!Number.isSafeInteger(size)||size<0||size>5*1024*1024||nl+size+1>=raw.length||raw[nl+size+1]!==10)throw Error('SOURCE_BATCH_BOUNDARY');
  const bytes=raw.subarray(nl+1,nl+size+1);if(gitBlobId(bytes)!==item.oid)throw Error('SOURCE_BATCH_HASH');result.push(bytes);position=nl+size+2;
 }
 if(position!==raw.length)throw Error('SOURCE_BATCH_EXTRA_BYTES');return result;
}
export function runPreflight(root=path.resolve(fileURLToPath(new URL('..',import.meta.url)))){
 const git=args=>execFileSync('git',args,{cwd:root,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},maxBuffer:64*1024*1024});
 const head=git(['rev-parse','HEAD']).toString().trim();if(!/^[a-f0-9]{40}$/.test(head))throw Error('SOURCE_REAL_COMMIT_REQUIRED');
 if(process.env.GITHUB_ACTIONS==='true'&&head!==process.env.GITHUB_SHA)throw Error('SOURCE_CI_COMMIT_MISMATCH');
 const policy=validatePolicy(JSON.parse(fs.readFileSync(path.join(root,'config/sites-source-reviewed-blobs.json'),'utf8')));
 // Anchor exceptions to the already reviewed ancestor, rather than allowing this PR
 // to approve arbitrary new fixture blobs. A future baseline change needs review.
 const anchor='e3f7be2f78a07a6e4d1eaffd6dbd4bb8308d0d70';
 if(policy.reviewedSource!==anchor)throw Error('SOURCE_REVIEW_ANCHOR');
 git(['merge-base','--is-ancestor',anchor,head]);
 const commits=git(['rev-list',head]).toString().trim().split(/\r?\n/),objects=new Map(),anchorPairs=new Set(),supplementPairs=new Map();let classified=0;
 const supplementCommits=new Set((policy.supplementalReviews||[]).map(review=>review.commit));
 const reviewedCommits=new Set(git(['rev-list',anchor]).toString().trim().split(/\r?\n/));
 for(const commit of commits){
  const metadata=git(['show','-s','--format=%B%n%an%n%ae',commit]);
  inspectSourceBytes('commit-metadata.txt',metadata,{entries:[]});
  for(const record of git(['ls-tree','-rz',commit]).toString().split('\0').filter(Boolean)){
   const tab=record.indexOf('\t'),[mode,type,oid]=record.slice(0,tab).split(' '),file=record.slice(tab+1);
   validateSourceMember(file,mode);if(type!=='blob'||!/^[a-f0-9]{40}$/.test(oid))throw Error('SOURCE_TREE_OBJECT');
   if(reviewedCommits.has(commit))anchorPairs.add(file+'\0'+oid);
   if(supplementCommits.has(commit)){if(!supplementPairs.has(commit))supplementPairs.set(commit,new Set());supplementPairs.get(commit).add(file+'\0'+oid);}
   const object=objects.get(oid)||{oid,paths:new Set()};object.paths.add(file);objects.set(oid,object);
  }
 }
 for(const item of policy.entries)if(!anchorPairs.has(item.path+'\0'+item.blob))throw Error('SOURCE_REVIEW_NOT_IN_ANCHOR');
 const authorizedPolicy=authorizeSupplementalReviews(policy,new Set(commits),supplementPairs);
 // Unlike exported helper inputs, these Sets/Maps were obtained directly from Git
 // for this real checkout. Missing public ancestry or exact tree membership refuses.
 if(!commits.includes(negativeFixtureReview.commit))throw Error('SOURCE_SUPPLEMENT_NOT_ANCESTOR');
 for(const entry of negativeFixtureReview.entries)if(!supplementPairs.get(negativeFixtureReview.commit)?.has(entry.path+'\0'+entry.blob))throw Error('SOURCE_SUPPLEMENT_BLOB_MISMATCH');
 negativeFixtureProofs.set(authorizedPolicy,negativeFixtureKeys);

 const list=[...objects.values()];let bytesTotal=0;
 for(let i=0;i<list.length;i+=8){const batch=list.slice(i,i+8);
  // Check declared sizes before asking cat-file for contents. At most 40 MiB per batch.
  const sizes=execFileSync('git',['cat-file','--batch-check'],{cwd:root,input:batch.map(item=>item.oid).join('\n')+'\n',maxBuffer:8192}).toString().trim().split('\n');
  if(sizes.length!==batch.length)throw Error('SOURCE_BATCH_HEADER');
  sizes.forEach((line,index)=>{const [oid,type,rawSize]=line.trim().split(' '),size=Number(rawSize);if(oid!==batch[index].oid||type!=='blob'||!Number.isSafeInteger(size)||size<0||size>5*1024*1024)throw Error('SOURCE_BLOB_SIZE');});
  const raw=execFileSync('git',['cat-file','--batch'],{cwd:root,input:batch.map(item=>item.oid).join('\n')+'\n',maxBuffer:41*1024*1024});
  const bodies=parseBatch(raw,batch);for(let j=0;j<batch.length;j++){bytesTotal+=bodies[j].length;for(const file of batch[j].paths)classified+=inspectSourceBytes(file,bodies[j],authorizedPolicy).length;}
 }
 const files=git(['ls-files','-z','--cached','--others','--exclude-standard']).toString().split('\0').filter(Boolean),realRoot=fs.realpathSync(root);
 for(const file of new Set(files)){validateSourceMember(file);const target=path.resolve(root,file),stat=fs.lstatSync(target);
  if(!stat.isFile()||stat.isSymbolicLink()||!fs.realpathSync(target).startsWith(realRoot+path.sep))throw Error('SOURCE_WORKTREE_MODE');if(stat.size>5*1024*1024)throw Error('SOURCE_BLOB_SIZE');
  inspectSourceBytes(file,fs.readFileSync(target),authorizedPolicy,{working:true});
 }
 return {status:'PASS_SOURCE_ONLY_HISTORY_AND_WORKTREE',head,commits:commits.length,uniqueBlobs:objects.size,bytesTotal,workingFiles:new Set(files).size,classifiedHistoricalFindings:classified,realDataOpened:false,credentialValuesReturned:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(runPreflight()));}catch(error){console.error(JSON.stringify({status:'FAIL_SOURCE_ONLY_PREFLIGHT',code:/^SOURCE_[A-Z_]+$/.test(error.message)?error.message:'SOURCE_READ_OR_GIT_FAILURE'}));process.exitCode=1;}
}

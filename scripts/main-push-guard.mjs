import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const refusal='main不得直接Push，請建立工作分支並提交Pull Request。';
export const sitesSourceProject='appgprj_6ad9abaff47c8191846eb9821034696b';
export const sitesSourceRemote='https://git.chatgpt-team.site/40678213-b558-4c8e-ac51-cedecb775cec/'+sitesSourceProject+'.git';
const sha=/^[a-f0-9]{40}$/,digest=/^[a-f0-9]{64}$/,zero='0'.repeat(40);
const fail=(v,c)=>{if(!v)throw Error(c);};
export function validateSiteApproval(permit,{remote,head,tree,previous,profile,hosting,now=Date.now()}){
 fail(remote===sitesSourceRemote,'SITE_REMOTE');
 const keys='approvalId,credentialExpiresAt,expiresAt,format,issuedAt,previousRemoteCommit,projectId,projectionSha256,reviewedGitHubCommit,reviewedGitHubTree,sourceCommit,sourceTree';
 fail(permit&&Object.keys(permit).sort().join()===keys&&permit.format==='PROCESS_OS_SITE_SOURCE_APPROVAL_V1'&&permit.projectId===sitesSourceProject&&/^[a-f0-9]{32}$/.test(permit.approvalId),'SITE_APPROVAL');
 fail(sha.test(head)&&sha.test(tree)&&sha.test(previous)&&permit.sourceCommit===head&&permit.sourceTree===tree&&permit.previousRemoteCommit===previous&&head!==zero,'SITE_PIN');
 const issued=Date.parse(permit.issuedAt),expires=Date.parse(permit.expiresAt),credentialExpiry=Date.parse(permit.credentialExpiresAt);
 fail(Number.isFinite(issued)&&Number.isFinite(expires)&&Number.isFinite(credentialExpiry)&&issued<=now&&issued<expires&&expires>now&&expires<=credentialExpiry,'SITE_APPROVAL_EXPIRED');
 fail(sha.test(permit.reviewedGitHubCommit)&&sha.test(permit.reviewedGitHubTree)&&digest.test(permit.projectionSha256)&&![permit.reviewedGitHubCommit,permit.reviewedGitHubTree,permit.projectionSha256].some(v=>/^0+$/.test(v)),'SITE_PROVENANCE');
 fail(hosting?.project_id===sitesSourceProject&&hosting.d1==='DB'&&hosting.r2==='STATE_ARCHIVE'&&!hosting.static,'SITE_HOSTING');
 fail(profile?.format==='PROCESS_OS_FRESH_SITE_SOURCE_V1'&&profile.project_id===sitesSourceProject&&profile.migrationProfile==='schema-only-fresh-target'&&profile.sourceProgramCommit===permit.reviewedGitHubCommit&&profile.sourceTree===permit.reviewedGitHubTree&&profile.sourceProjectionSha256===permit.projectionSha256,'SITE_PROVENANCE');
}
function runGuard(){
 const git=args=>{const r=spawnSync('git',args,{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});fail(r.status===0,'GIT_CHECK');return r.stdout.trim();};
  const branch=spawnSync('git',['symbolic-ref','--quiet','--short','HEAD'],{encoding:'utf8',windowsHide:true});
  if(branch.error || ![0,1].includes(branch.status))throw Error('GIT_BRANCH_CHECK_FAILED');
  const input=fs.readFileSync(0,'utf8');
  const records=input.split(/\r?\n/).filter(line=>line.trim()).map(line=>line.trim().split(/\s+/));
  for(const fields of records){
    if(fields.length!==4 || !fields[1].match(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i) || !fields[3].match(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i))throw Error('INVALID_PUSH_INPUT');
  }
  const main=branch.stdout.trim()==='main'||records.some(f=>f[0]==='refs/heads/main'||f[2]==='refs/heads/main');
  if(!main)return;
  const remote=process.argv[3];fail(remote===sitesSourceRemote&&process.argv.length===4&&branch.stdout.trim()==='main'&&records.length===1,'MAIN_REFUSED');
  fail(!['GIT_DIR','GIT_WORK_TREE','GIT_INDEX_FILE','GIT_COMMON_DIR'].some(key=>process.env[key]),'SITE_GIT_OVERRIDE');
  const [localRef,local,remoteRef,previous]=records[0];fail(remoteRef==='refs/heads/main'&&local!==zero&&(localRef==='refs/heads/main'||localRef===local),'MAIN_REFUSED');
  const head=git(['rev-parse','HEAD']),tree=git(['rev-parse','HEAD^{tree}']);fail(local===head&&!git(['status','--porcelain']),'SITE_SOURCE_CHANGED');
  fail(git(['ls-remote','--get-url',remote])===remote,'SITE_URL_REWRITE');
  const rewrites=spawnSync('git',['config','--get-regexp','^url\\..*\\.(pushinsteadof|insteadof)$'],{encoding:'utf8',windowsHide:true});fail([0,1].includes(rewrites.status),'SITE_URL_CHECK');
  fail(!rewrites.stdout.split(/\r?\n/).some(line=>{const prefix=line.match(/^\S+\s+(.+)$/)?.[1];return prefix&&remote.startsWith(prefix);}), 'SITE_URL_REWRITE');
  const root=fs.realpathSync(git(['rev-parse','--show-toplevel'])),metadata=fs.realpathSync(git(['rev-parse','--absolute-git-dir']));
  fail(metadata===path.join(root,'.git')&&git(['config','--local','--get','core.hooksPath'])==='.git/hooks','SITE_HOOK_CONFIGURATION');
  const trackedGuard=git(['show',head+':scripts/main-push-guard.mjs']),trackedHook=git(['show',head+':.githooks/pre-push']);
  const normalize=s=>s.replace(/\r\n/g,'\n').trim();
  for(const file of ['hooks','hooks/pre-push','hooks/process-main-push-guard.mjs'])fail(!fs.lstatSync(path.join(metadata,file)).isSymbolicLink(),'SITE_HOOK_CHANGED');
  fail(normalize(fs.readFileSync(path.join(metadata,'hooks/pre-push'),'utf8'))===normalize(trackedHook)&&normalize(fs.readFileSync(path.join(metadata,'hooks/process-main-push-guard.mjs'),'utf8'))===normalize(trackedGuard),'SITE_HOOK_CHANGED');
  const runtime=path.join(root,'.sites-runtime');fail(fs.lstatSync(runtime).isDirectory()&&!fs.lstatSync(runtime).isSymbolicLink(),'SITE_APPROVAL_PATH');
  const permitFile=path.join(runtime,'sites-source-push-approval.json'),stat=fs.lstatSync(permitFile);fail(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=16384,'SITE_APPROVAL_PATH');
  const permit=JSON.parse(fs.readFileSync(permitFile,'utf8')),profile=JSON.parse(git(['show',head+':SOURCE-PROFILE.json'])),hosting=JSON.parse(git(['show',head+':.openai/hosting.json']));
  validateSiteApproval(permit,{remote,head,tree,previous,profile,hosting});
  if(previous!==zero){fail(git(['cat-file','-t',previous])==='commit','SITE_ANCESTOR_REQUIRED');git(['merge-base','--is-ancestor',previous,head]);}
  const used=path.join(runtime,'sites-source-approvals-used');if(!fs.existsSync(used))fs.mkdirSync(used);
  fail(fs.lstatSync(used).isDirectory()&&!fs.lstatSync(used).isSymbolicLink(),'SITE_APPROVAL_PATH');
  // This receipt is only a local accident-prevention constraint, not authority.
  // A used/uncertain attempt requires readback and fresh human disposition.
  fs.writeFileSync(path.join(used,permit.approvalId+'.json'),JSON.stringify({sourceCommit:head,sourceTree:tree,previousRemoteCommit:previous,projectId:sitesSourceProject}),{flag:'wx'});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)try{runGuard();}catch(error){
  console.error(refusal);
  console.error('GUARD_REFUSED code='+(error instanceof Error&&/^[A-Z_]+$/.test(error.message)?error.message:'GUARD_UNAVAILABLE'));
  process.exitCode=1;
}

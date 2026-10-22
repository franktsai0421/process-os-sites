import {withFixtureCleanupSync} from './fixture-cleanup.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'process-main-guard-'));
const work=path.join(fixture,'Unicode 測試 checkout'),remote=path.join(fixture,'remote.git');
fs.writeFileSync(path.join(fixture,'global-git-config'),'');
const environment={...process.env,GIT_CONFIG_GLOBAL:path.join(fixture,'global-git-config'),GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'};
let phase='start';
const run=(cwd,args,input)=>spawnSync('git',args,{cwd,input,encoding:'utf8',env:environment,windowsHide:true});
const ok=(cwd,args)=>{phase='git-'+args[0];const p=run(cwd,args);assert.equal(p.status,0);return p.stdout.trim();};
const node=(cwd,file,args=[])=>{phase='setup';const p=spawnSync(process.execPath,[file,...args],{cwd,encoding:'utf8',env:environment,windowsHide:true});if(p.status!==0)phase+='-'+(p.stderr.match(/stage=([a-z-]+)/)?.[1]||'unknown');return p;};
withFixtureCleanupSync(() => {
 fs.mkdirSync(work);ok(fixture,['init','--bare',remote]);ok(work,['init','-b','main']);
 for(const file of ['.githooks/pre-push','scripts/main-push-guard.mjs','scripts/collaboration-setup.mjs']){fs.mkdirSync(path.dirname(path.join(work,file)),{recursive:true});fs.copyFileSync(path.join(source,file),path.join(work,file));}
 fs.chmodSync(path.join(work,'.githooks/pre-push'),0o755);
 ok(work,['config','user.name','Local Simulation']);ok(work,['config','user.email','simulation@example.invalid']);
 ok(work,['add','.']);ok(work,['update-index','--chmod=+x','.githooks/pre-push']);ok(work,['commit','-m','Isolated guard fixture']);ok(work,['remote','add','origin',remote]);
 // Minimal Git distributions may omit the stock hooks template directory.
 if(fs.existsSync(path.join(work,'.git/hooks')))fs.rmSync(path.join(work,'.git/hooks'),{recursive:true,force:true});
 const setup='scripts/collaboration-setup.mjs';assert.equal(node(work,setup).status,0);assert.equal(node(work,setup).status,0);
 assert.equal(ok(work,['config','--local','--get','core.hooksPath']),'.git/hooks');
 const configBefore=fs.readFileSync(path.join(work,'.git/config'),'utf8');
 ok(work,['config','core.hooksPath','existing-hooks']);assert.notEqual(node(work,setup).status,0);assert.equal(ok(work,['config','core.hooksPath']),'existing-hooks');
 fs.writeFileSync(path.join(work,'.git/config'),configBefore);
 // Installed copies still block main when an older checkout lacks templates.
 const hookSource=fs.readFileSync(path.join(work,'.githooks/pre-push'));
 const guardSource=fs.readFileSync(path.join(work,'scripts/main-push-guard.mjs'));
 fs.unlinkSync(path.join(work,'.githooks/pre-push'));fs.unlinkSync(path.join(work,'scripts/main-push-guard.mjs'));
 const mainPush=run(work,['push','origin','main']);assert.notEqual(mainPush.status,0);assert(mainPush.stderr.includes('main不得直接Push，請建立工作分支並提交Pull Request。'));
 fs.writeFileSync(path.join(work,'.githooks/pre-push'),hookSource);fs.writeFileSync(path.join(work,'scripts/main-push-guard.mjs'),guardSource);
 assert.equal(ok(fixture,['--git-dir',remote,'for-each-ref','refs/heads/main']),'');
 ok(work,['switch','-c','feature/guard-fixture']);ok(work,['push','-u','origin','feature/guard-fixture']);
 const head=ok(work,['rev-parse','HEAD']);
 const guard=input=>spawnSync(process.execPath,['scripts/main-push-guard.mjs'],{cwd:work,input,encoding:'utf8',env:environment});
 const zeros='0'.repeat(40);
 assert.notEqual(guard(`refs/heads/feature/guard-fixture ${head} refs/heads/main ${zeros}\n`).status,0);
 assert.notEqual(guard(`(delete) ${zeros} refs/heads/main ${head}\n`).status,0);
 assert.notEqual(guard(`refs/heads/main ${head} refs/heads/another ${zeros}\n`).status,0);
 assert.notEqual(guard('invalid input').status,0);
 assert.equal(guard(`refs/heads/feature/guard-fixture ${head} refs/heads/feature/guard-fixture ${zeros}\n`).status,0);
 ok(work,['fetch','origin']);ok(work,['pull','--ff-only']);
 fs.writeFileSync(path.join(work,'fixture.txt'),'Local-only change');ok(work,['add','fixture.txt']);ok(work,['commit','-m','Local fixture commit']);ok(work,['push']);
 ok(fixture,['--git-dir',remote,'symbolic-ref','HEAD','refs/heads/feature/guard-fixture']);
 ok(fixture,['clone',remote,path.join(fixture,'second-clone')]);
 assert.equal(ok(path.join(fixture,'second-clone'),['rev-parse','HEAD']),ok(work,['rev-parse','HEAD']));
 console.log('PASS: Windows-compatible local-bare push refusal, branch push, main target/delete refusal, clone/fetch/pull/commit, Unicode paths, idempotent setup and existing-hook preservation; no GitHub main push.');
}, () => {const target=fs.realpathSync(fixture),parent=fs.realpathSync(os.tmpdir());if(path.dirname(target)!==parent||!path.basename(target).startsWith('process-main-guard-'))throw Error('Fixture cleanup verification failed');fs.rmSync(target,{recursive:true,force:true});}, (error) => {console.error(JSON.stringify({passed:false,phase,errorType:error.name,details:'Sensitive details suppressed'}));process.exitCode=1;});

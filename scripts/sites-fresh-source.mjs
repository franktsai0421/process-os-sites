// Source-only projection for a NEW empty Site. No Git initialization, source
// push, credentials, dependency copy, database operation or deployment.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {sourcePathDisposition} from '../lib/sites-source-boundary.mjs';
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=(v,c)=>{if(!v)throw Error(c);};
const held=new Set(['scripts/dev-package-restore.mjs','scripts/u1-package.mjs','scripts/dev-package-update.mjs']);
export function materializeFreshSitesSource({sourceRoot,output,programCommit,projectId}){
 sourceRoot=fs.realpathSync(sourceRoot);output=path.resolve(output);
 fail(/^[a-f0-9]{40}$/.test(programCommit||'')&&/^appgprj_[a-zA-Z0-9_]+$/.test(projectId||''),'FRESH_SOURCE_IDENTITY');
 fail(!fs.existsSync(output)&&output!==sourceRoot,'FRESH_SOURCE_NEW_OUTPUT_REQUIRED');
 const parent=fs.realpathSync(path.dirname(output));fail(parent===path.dirname(output),'FRESH_SOURCE_PARENT_LINK');
 const git=(args,options={})=>execFileSync('git',args,{cwd:sourceRoot,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},maxBuffer:40*1024*1024,...options});
 const records=git(['ls-tree','-rz',programCommit]).toString().split('\0').filter(Boolean).map(line=>{const i=line.indexOf('\t'),meta=line.slice(0,i).split(' ');return {file:line.slice(i+1),mode:meta[0],type:meta[1],object:meta[2]};});
 fail(records.every(r=>r.type==='blob'&&r.mode!=='120000'&&!held.has(r.file)&&sourcePathDisposition(r.file)==='source'),'FRESH_SOURCE_BOUNDARY');
 fail(!records.some(r=>r.file==='SOURCE-PROFILE.json'),'FRESH_SOURCE_ALREADY_PROJECTED');
 const batch=git(['cat-file','--batch'],{input:records.map(r=>r.object).join('\n')+'\n'}),files=new Map();let offset=0;
 for(const r of records){const nl=batch.indexOf(10,offset),header=batch.subarray(offset,nl).toString().split(' '),length=Number(header[2]);fail(header[1]==='blob'&&Number.isSafeInteger(length)&&length<20*1024*1024,'FRESH_SOURCE_BLOB');files.set(r.file,batch.subarray(nl+1,nl+1+length));offset=nl+1+length+1;}
 const hosting=JSON.parse(files.get('.openai/hosting.json'));fail(hosting.project_id===projectId&&hosting.d1==='DB'&&hosting.r2==='STATE_ARCHIVE'&&!hosting.static,'FRESH_SOURCE_PROJECT_MISMATCH');
 const migrations=[...files].filter(([name])=>name.startsWith('drizzle-sites-fresh/'));
 fail(migrations.some(([name])=>name.endsWith('/meta/_journal.json'))&&migrations.some(([name])=>name.endsWith('.sql')),'FRESH_MIGRATIONS_MISSING');
 for(const [name,bytes]of migrations)if(name.endsWith('.sql'))fail(!/\b(INSERT|UPDATE|DELETE|REPLACE|DROP)\b/i.test(bytes.toString()),'FRESH_MIGRATIONS_NOT_SCHEMA_ONLY');
 fs.mkdirSync(output);
 const entries=[],legacy=[],inactiveLocks=[];
 function write(name,bytes){const target=path.join(output,name);fail(target.startsWith(output+path.sep),'FRESH_SOURCE_PATH');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});entries.push({path:name,bytes:bytes.length,sha256:digest(bytes)});}
 // The validated installation uses the unchanged npm lock. Preserve other
 // historical lock bytes outside root so the official helper has one manager.
 fail(files.has('package-lock.json')&&!files.has('npm-shrinkwrap.json'),'FRESH_SOURCE_NPM_LOCK_REQUIRED');
 for(const [name,bytes]of files){if(['pnpm-lock.yaml','yarn.lock','bun.lock','bun.lockb'].includes(name)){const target='dependency-lock-history/'+name;write(target,bytes);inactiveLocks.push({source:name,target,sha256:digest(bytes)});continue;}if(name==='drizzle.config.ts'){write('config/drizzle-legacy-entry.ts',bytes);continue;}if(name.startsWith('drizzle/')){const target='drizzle-legacy-history/'+name.slice('drizzle/'.length);write(target,bytes);legacy.push({source:name,target,sha256:digest(bytes)});}else write(name,bytes);}
 for(const [name,bytes]of migrations)write('drizzle/'+name.slice('drizzle-sites-fresh/'.length),bytes);
 write('drizzle.config.ts',Buffer.from("import {defineConfig} from 'drizzle-kit';\nexport default defineConfig({out:'./drizzle',schema:'./db/sites-fresh-schema.ts',dialect:'sqlite'});\n"));
 const profile={format:'PROCESS_OS_FRESH_SITE_SOURCE_V1',project_id:projectId,sourceProgramCommit:programCommit,sourceTree:git(['rev-parse',programCommit+'^{tree}']).toString().trim(),migrationProfile:'schema-only-fresh-target',requiresEmptyUnmigratedTarget:true,originalAppliedMigrationBytesPreserved:legacy,migrationInputSha256:digest(Buffer.from(JSON.stringify(migrations.map(([name,bytes])=>({name,sha256:digest(bytes)}))))),sourceFiles:entries.length,sourceProjectionSha256:digest(Buffer.from(JSON.stringify(entries))),gitInitialized:false,sourceGuardDisposition:'REQUIRED_BEFORE_ANY_SOURCE_PUSH',platformMigrationApplied:false};
 profile.packageManager='npm';profile.inactiveHistoricalLocks=inactiveLocks;
 write('SOURCE-PROFILE.json',Buffer.from(JSON.stringify(profile,null,2)+'\n'));
 return {output,profile,entries};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args=process.argv.slice(2),get=name=>args[args.indexOf(name)+1];fail(args.length===6&&args.includes('--output')&&args.includes('--program-commit')&&args.includes('--project-id'),'FRESH_SOURCE_ARGUMENTS');const sourceRoot=path.resolve(fileURLToPath(new URL('..',import.meta.url))),head=execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();fail(head===get('--program-commit')&&!execFileSync('git',['status','--porcelain'],{cwd:sourceRoot,encoding:'utf8'}).trim(),'FRESH_SOURCE_CLEAN_REVIEWED_COMMIT_REQUIRED');const result=materializeFreshSitesSource({sourceRoot,output:get('--output'),programCommit:head,projectId:get('--project-id')});console.log(JSON.stringify({status:'PREPARED_FRESH_SITE_SOURCE_ONLY',output:result.output,profile:result.profile}));}catch(error){console.error(/^[A-Z0-9_]+$/.test(error.message)?error.message:'FRESH_SOURCE_UNAVAILABLE');process.exitCode=1;}
}

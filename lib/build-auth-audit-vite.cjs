'use strict';
// Candidate for lib/build-auth-audit-vite.cjs. Read-only post-build; never replaces auth or build/exit handlers.
const fs=require('node:fs'),path=require('node:path');
const {bindingsFromVinext,createAuthBoundaryAudit,safeFailure}=require('./build-auth-safety.cjs');
const K=['dev','ino','size','nlink','mtimeNs','ctimeNs'];
function need(v){if(!v)throw Object.assign(Error('Build authentication boundary incomplete or violated'),{code:'AUTH_AUDIT_INPUT'});}
function parentDirs(p){for(let q=path.resolve(p);;q=path.dirname(q)){const s=fs.lstatSync(q);need(s.isDirectory()&&!s.isSymbolicLink());if(path.dirname(q)===q)return;}}
function read(file,max=64*1024*1024){parentDirs(path.dirname(file));const a=fs.lstatSync(file,{bigint:true});need(a.isFile()&&!a.isSymbolicLink()&&a.nlink===1n&&a.size<=BigInt(max));const fd=fs.openSync(file,'r');try{const f=fs.fstatSync(fd,{bigint:true});need(K.every(k=>a[k]===f[k]));const raw=fs.readFileSync(fd);need(BigInt(raw.length)===a.size);for(const x of [fs.lstatSync(file,{bigint:true}),fs.fstatSync(fd,{bigint:true})])need(K.every(k=>a[k]===x[k]));return raw;}finally{fs.closeSync(fd);}}
function inventory(root){parentDirs(root);const rows=[];function walk(dir,rel=''){for(const name of fs.readdirSync(dir).sort()){need(!/[\\:]/.test(name)&&!Array.from(name).some(character=>character.charCodeAt(0)<32)&&name!=='.'&&name!=='..');const rp=rel?rel+'/'+name:name,s=fs.lstatSync(path.join(dir,name));need(!s.isSymbolicLink());if(s.isDirectory())walk(path.join(dir,name),rp);else{need(s.isFile()&&s.nlink===1);rows.push(rp);need(rows.length<=10000);}}}walk(root);return rows;}
function buildAuthAuditPlugin(){return{name:'process-os:known-build-auth-boundary',apply:'build',enforce:'post',buildApp:{order:'post',async handler(builder){try{
 const env=builder.environments;need(env?.client?.isBuilt===true&&env?.rsc?.isBuilt===true&&env?.ssr?.isBuilt===true);
 const dist=path.resolve(builder.config.root,'dist'),clientRoot=path.resolve(builder.config.root,env.client.config.build.outDir);need(clientRoot===path.join(dist,'client'));
 const rsc=env.rsc.config.define,ssr=env.ssr.config.define;need(rsc&&ssr);
 const names=['process.env.__VINEXT_REVALIDATE_SECRET','process.env.__VINEXT_PREVIEW_MODE_ID','process.env.__VINEXT_PREVIEW_MODE_SIGNING_KEY','process.env.__VINEXT_PREVIEW_MODE_ENCRYPTION_KEY'];for(const k of names)need(Object.getOwnPropertyDescriptor(rsc,k)?.value===Object.getOwnPropertyDescriptor(ssr,k)?.value);
 const serverManifests=['server/vinext-server.json','server/ssr/vinext-server.json'].map(r=>{try{return JSON.parse(read(path.join(dist,r),65536).toString('utf8'));}catch{need(false);}});
 const bindings=bindingsFromVinext(rsc,serverManifests),before=inventory(clientRoot),audit=createAuthBoundaryAudit(before.map(p=>'client/'+p),bindings);let total=0;
 for(const rel of before){const raw=read(path.join(clientRoot,rel));total+=raw.length;need(total<=128*1024*1024);audit.observe('client/'+rel,'client-public',raw);}
 need(JSON.stringify(inventory(clientRoot))===JSON.stringify(before));const result=audit.finish();if(result.status!=='PASS_DECLARED_KNOWN_AUTH_BOUNDARY_ONLY'){process.stderr.write('\n'+JSON.stringify({format:'KNOWN_BUILD_AUTH_CLIENT_BOUNDARY_FAILURE_V1',status:result.status,violations:result.violations})+'\n');need(false);}
 // Exact allowlisted DTO only. No define object, manifest body, exception.message/stack or raw artifact window.
 const report={format:'KNOWN_BUILD_AUTH_CLIENT_BOUNDARY_V1',status:result.status,clientFiles:before.length,clientBytes:total,bindingCategories:result.bindingCategories,serverPrivateAuthenticationPreserved:true,compiledServerPublicDistributionApproved:false,buildLogKnownValueAbsence:'NOT_PROVED_BY_THIS_HOOK',universalSecretAbsence:false};process.stdout.write('\n'+JSON.stringify(report)+'\n');
 }catch(e){const dto=safeFailure(e);throw Object.assign(new Error('Build authentication boundary: '+dto.safeCode),{code:dto.safeCode});}}}};}
module.exports={buildAuthAuditPlugin};

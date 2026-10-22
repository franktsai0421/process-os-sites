// Filename/path boundary for a source handoff; never opens excluded contents.
const generated=new Set(['.git','node_modules','.wrangler','.sites-runtime','.u1s','.process-update','.next','.vinext','dist','out','coverage','test-results','outputs','work','tmp','temp','backups','.local-backups','_local-auth-backups','logs','log','diagnostics']);
export function sourcePathDisposition(relative){
 if(typeof relative!=='string'||!relative.length||relative.includes('\\')||relative.startsWith('/')||relative.split('/').some(part=>!part||part==='.'||part==='..'||part.includes(':')))throw Error('SOURCE_PATH_INVALID');
 const parts=relative.toLowerCase().split('/'),name=parts.at(-1);
 if(parts.some(part=>generated.has(part)))return 'generated-or-private-directory';
 if(parts.some(part=>['.npmrc','.yarnrc','.yarnrc.yml','.netrc','_netrc'].includes(part)))return 'package-manager-private-configuration';
 if(parts.some(part=>/^\.env|^\.dev\.vars/.test(part)))return 'environment-or-credential';
 if(/\.(?:sqlite(?:3)?(?:-wal|-shm)?|db|pem|key|p12|pfx|zip|tgz|tar|gz|log)$/.test(name)||/(?:-wal|-shm)$/.test(name))return 'data-archive-or-key';
 if(/^(?:data\/(?:canonical|local)(?:\/|$)|public\/process\/(?:data|iqc-media|routine-media)(?:\/|$)|local-assets(?:\/|$))/.test(parts.join('/')))return 'business-data';
 if(['database.json','manifest.snapshot.json','conversion-verified.json','complete.json','session.json'].includes(name))return 'private-data-or-session';
 return 'source';
}

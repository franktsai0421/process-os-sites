import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {assertPlainDirectory,openSnapshotDirectory} from '../lib/snapshot-files.mjs';
import {restoreLocalSnapshot} from '../lib/snapshot-local.mjs';
import {validateSnapshot} from '../lib/snapshot-contract.mjs';
import {localWorkerConfig,assertLocalMode} from '../lib/local-runtime.mjs';
import {installLocalNetworkGuard} from '../lib/local-network-guard.mjs';
import {createReadOnlySnapshotStage} from '../lib/snapshot-readonly-stage.mjs';

export async function importIntoNewLocalRoot({root,packageDirectory,manifestSha256,openRuntime}) {
  assertLocalMode([],process.env);
  root=assertPlainDirectory(root);
  const target=path.join(root,'.wrangler');
  if(!fs.existsSync(path.join(root,'package.json'))||fs.existsSync(target)||fs.existsSync(path.join(root,'.sites-import.lock')))throw Error('SNAPSHOT_LOCAL_ROOT_NOT_EMPTY');
  const source=await openSnapshotDirectory(packageDirectory,manifestSha256),manifest=await source.manifest(),summary=validateSnapshot(manifest);
  const space=fs.statfsSync(root),required=summary.totalBytes*3+1024**3;
  if(space.bavail*space.bsize<required)throw Error('SNAPSHOT_LOCAL_SPACE');
  const stage=path.join(root,'.sites-import-'+crypto.randomUUID());
  fs.writeFileSync(path.join(root,'.sites-import.lock'),JSON.stringify({stage,manifestSha256}),{flag:'wx',mode:0o600});
  fs.mkdirSync(stage,{mode:0o700});fs.mkdirSync(path.join(stage,'local-only'),{mode:0o700});
  fs.writeFileSync(path.join(stage,'INCOMPLETE'),'Private isolated import is incomplete.\n',{flag:'wx',mode:0o600});
  const configFile=path.join(stage,'local-only/wrangler.json');fs.writeFileSync(configFile,JSON.stringify(localWorkerConfig()),{flag:'wx',mode:0o600});
  Object.assign(process.env,{CLOUDFLARE_CF_FETCH_ENABLED:'false',WRANGLER_SEND_METRICS:'false',WRANGLER_SEND_ERROR_REPORTS:'false',WRANGLER_WRITE_LOGS:'false',WRANGLER_LOG_PATH:path.join(stage,'local-only/logs'),MINIFLARE_CACHE_DIR:path.join(stage,'local-only/cf-cache'),MINIFLARE_REGISTRY_PATH:path.join(stage,'local-only/registry'),WRANGLER_REGISTRY_PATH:path.join(stage,'local-only/registry')});
  installLocalNetworkGuard(stage);
  let proxy,receipt;
  try {
    // The default opener is invoked only by the explicit CLI apply operation.
    // Tests inject simulated bindings; no SDK is needed for adapter tests.
    proxy=await openRuntime({configPath:configFile,persist:{path:path.join(stage,'state/v3')},remoteBindings:false,envFiles:[]});
    const journal=JSON.parse(fs.readFileSync(path.join(root,'drizzle/meta/_journal.json'),'utf8'));
    for(const entry of journal.entries){if(!/^\d{4}_[a-zA-Z0-9_]+$/.test(entry.tag))throw Error('SNAPSHOT_MIGRATION_PATH');const sql=fs.readFileSync(path.join(root,'drizzle',entry.tag+'.sql'),'utf8');if(/\b(DROP|DELETE|ALTER|TRUNCATE|UPDATE)\b/i.test(sql))throw Error('SNAPSHOT_MIGRATION_UNREVIEWED');const statements=sql.split(';').map(text=>text.trim()).filter(Boolean);await proxy.env.DB.batch(statements.map(statement=>proxy.env.DB.prepare(statement)));}
    // Only the known empty placeholder created by migration 0002 is removed in
    // this freshly created stage; an existing local target is never opened.
    await proxy.env.DB.prepare('DELETE FROM web_feedback_store WHERE id=1 AND revision=0 AND payload=?').bind('{"issues":[],"attachments":[],"batches":[],"handoffs":[]}').run();
    const staging=await createReadOnlySnapshotStage({source,
      async onComplete(value){receipt=value;},
      async onAbort(){fs.writeFileSync(path.join(stage,'FAILED'),'Import failed; no completed local target published.\n',{flag:'a',mode:0o600});},
    });
    await restoreLocalSnapshot(source,{db:proxy.env.DB,bucket:proxy.env.STATE_ARCHIVE,staging,proof:{kind:'local-platform-proxy',remoteBindings:false,emptyTarget:true}});
    await proxy.dispose();proxy=null;
    if(!receipt||fs.existsSync(target))throw Error('SNAPSHOT_LOCAL_PUBLISH_REFUSED');
    fs.writeFileSync(path.join(stage,'local-only/sites-snapshot-receipt.json'),JSON.stringify({...receipt,manifestSha256}),{flag:'wx',mode:0o600});
    fs.renameSync(path.join(stage,'INCOMPLETE'),path.join(stage,'COMPLETE'));
    fs.renameSync(stage,target);
    fs.unlinkSync(path.join(root,'.sites-import.lock'));
    return {status:'LOCAL_DATA_IMPORTED_AUTH_CONFIGURATION_REQUIRED',root,sourceRevision:manifest.source.revision,objects:receipt.objects,credentialsCreated:false};
  }catch(error){if(proxy){try{await proxy.dispose();}catch{fs.writeFileSync(path.join(stage,'RUNTIME_CLOSE_UNKNOWN'),'Do not retry or publish this stage.\n',{flag:'a',mode:0o600});}}fs.writeFileSync(path.join(stage,'FAILED'),'Import failed; retain the stage and lock for review.\n',{flag:'a',mode:0o600});throw error;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [operation,root,packageDirectory,manifestSha256,...extra]=process.argv.slice(2);
  if(operation!=='--apply'||!root||!packageDirectory||!manifestSha256||extra.length)throw Error('Usage: node scripts/snapshot-import-local.mjs --apply <empty-project-root> <private-package> <manifest-sha256>');
  const require=createRequire(path.join(path.resolve(root),'package.json'));
  const openRuntime=async options=>require('wrangler').getPlatformProxy(options);
  importIntoNewLocalRoot({root,packageDirectory,manifestSha256,openRuntime}).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('SNAPSHOT_LOCAL_IMPORT_FAILED_RETAIN_STAGE');process.exitCode=1;});
}

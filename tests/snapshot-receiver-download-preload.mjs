// Explicitly opt-in, synthetic-only preload for the normal snapshot download CLI.
// Never opens a network connection or reads application credentials.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
if(process.env.SNAPSHOT_RECEIVER_FIXTURE!=='owned-synthetic')throw Error('SYNTHETIC_DOWNLOAD_FIXTURE_REQUIRED');
const bodyFile=process.env.SNAPSHOT_RECEIVER_BODY;
if(!bodyFile)throw Error('SYNTHETIC_DOWNLOAD_BODY_REQUIRED');
const directory=path.dirname(path.resolve(bodyFile));
if(path.dirname(directory)!==path.resolve(os.tmpdir())||!/^snapshot-abort-receiver-[a-zA-Z0-9]+$/.test(path.basename(directory))||!/^case-[0-9]+\.ndjson$/.test(path.basename(bodyFile))||fs.lstatSync(bodyFile).isSymbolicLink()||!fs.statSync(bodyFile).isFile())throw Error('SYNTHETIC_DOWNLOAD_BODY_NOT_OWNED');
globalThis.fetch=async(url,options)=>{
 if(url!=='https://snapshot-fixture.invalid/api/snapshots?action=export'||options.redirect!=='error')throw Error('SYNTHETIC_DOWNLOAD_TARGET');
 return new Response(fs.readFileSync(bodyFile),{headers:{'Content-Type':'application/x-ndjson'}});
};

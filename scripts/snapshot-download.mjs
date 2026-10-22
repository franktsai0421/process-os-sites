import path from 'node:path';
import fs from 'node:fs';
import {createSnapshotDirectorySink} from '../lib/snapshot-files.mjs';
import {receiveSnapshotStream} from '../lib/snapshot-stream.mjs';
// Authorization is read once from stdin, never arguments, files, logs or URLs.
const [output,...extra]=process.argv.slice(2);
if(!output||extra.length)throw Error('Usage: node scripts/snapshot-download.mjs <new-private-directory> (stdin: origin and existing application cookie)');
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>8192)throw Error('SNAPSHOT_AUTH_INPUT_LIMIT');}
const authorization=JSON.parse(input),origin=new URL(authorization.origin);
if(origin.protocol!=='https:'||origin.origin!==authorization.origin||origin.username||origin.password||typeof authorization.cookie!=='string'||!/^process_demo=[A-Za-z0-9+/=]+\.[a-f0-9]{64}$/.test(authorization.cookie))throw Error('SNAPSHOT_AUTH_INPUT');
const response=await fetch(origin.origin+'/api/snapshots?action=export',{headers:{Cookie:authorization.cookie},redirect:'error'});
if(!response.ok||!response.body||!response.headers.get('content-type')?.startsWith('application/x-ndjson'))throw Error('SNAPSHOT_DOWNLOAD_REFUSED');
const sink=createSnapshotDirectorySink(output),manifest=await receiveSnapshotStream(response.body,sink);
console.log(JSON.stringify({status:'PRIVATE_SNAPSHOT_DOWNLOADED',directory:path.resolve(output),manifestSHA256:fs.readFileSync(path.join(output,'manifest.sha256'),'utf8'),revision:manifest.source.revision,chunks:manifest.chunks.length}));

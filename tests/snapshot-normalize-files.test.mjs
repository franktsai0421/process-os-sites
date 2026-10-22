import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setup} from './hosted-import-fixtures.mjs';
import {sha256} from '../lib/snapshot-contract.mjs';
import {createNormalizationDirectory,openNormalizationDirectory} from '../lib/snapshot-normalize-files.mjs';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url))),base=fs.mkdtempSync(path.join(root,'.sites-runtime/normalization-files-fixture-')),f=await setup({canonical:false,feedback:true}),pin=await sha256(new TextEncoder().encode(JSON.stringify(f.pack.completed))),programCommit='e'.repeat(40),output=path.join(base,'view');
try{
 let interrupted=false;
 await assert.rejects(createNormalizationDirectory({source:f.pack,output,programCommit,sourceManifestSha256:pin,onProgress:async dto=>{if(!interrupted&&dto.stage==='reference-plan'){interrupted=true;throw Error('SYNTHETIC_INTERRUPTION');}}}),/SYNTHETIC_INTERRUPTION/);
 assert.equal(fs.existsSync(path.join(output,'COMPLETE')),false);assert.equal(fs.existsSync(path.join(output,'INCOMPLETE')),true);assert.equal(JSON.parse(fs.readFileSync(path.join(output,'OWNER.json'))).state,'STOPPED');
 const result=await createNormalizationDirectory({source:f.pack,output,programCommit,sourceManifestSha256:pin,resume:true});assert.equal(result.result.audit.currentAndAllHistoryBusinessRowsMatch,true);assert.equal(result.result.audit.accountsAndRolesPreserved,true);await result.view.close();
 assert.equal(fs.existsSync(path.join(output,'chunks')),false);assert.equal(fs.existsSync(path.join(output,'COMPLETE')),true);assert.equal(fs.existsSync(path.join(output,'INCOMPLETE')),false);
 const reopened=await openNormalizationDirectory({source:f.pack,output}),manifest=await reopened.view.manifest();for(const c of manifest.chunks)assert.equal(await sha256(await reopened.view.readChunk(c.id)),c.sha256);await reopened.view.close();
 const file=path.join(output,'PLAN.json'),original=fs.readFileSync(file);fs.writeFileSync(file,Buffer.concat([original,Buffer.from(' ')]));await assert.rejects(openNormalizationDirectory({source:f.pack,output}),/NORMALIZE_PLAN_FILE_INTEGRITY/);
 console.log(JSON.stringify({status:'PASS_PRIVATE_NORMALIZATION_DIRECTORY',tests:4,resumeVerified:true,copiedPayloadBytes:0,realR1:false,fixtureDirectory:base}));
}finally{await f.close();}

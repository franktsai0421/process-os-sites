import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {baselineFiles,verifyBaseline,materializeBaseline} from '../scripts/materialize-performance-baseline.mjs';
void test('fixed paired baseline fails closed on missing or altered bytes before writing output',()=>{
 assert.throws(()=>verifyBaseline(()=>{throw Error('MISSING_BASELINE');}),/MISSING_BASELINE/);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'performance-baseline-test-'));
 try{assert.throws(()=>materializeBaseline(directory,()=>Buffer.from('not the pinned source')),/PERFORMANCE_BASELINE_HASH_MISMATCH/);assert.deepEqual(fs.readdirSync(directory),[]);}finally{fs.rmdirSync(directory);}
});
void test('all checked-in baseline paths are fixed source files, never data, credentials or a path escape',()=>{
 assert.equal(Object.keys(baselineFiles).length,6);
 for(const [file,hash]of Object.entries(baselineFiles)){assert.match(file,/^(lib|app\/api|public\/process)\/[a-zA-Z0-9/-]+\.(ts|js)$/);assert(!file.includes('..'));assert.match(hash,/^[a-f0-9]{64}$/);}
});

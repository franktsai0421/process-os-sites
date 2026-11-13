// Actual directory boundary; only private, newly created fixtures are touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {assertPlainDirectory,createSnapshotDirectorySink,openSnapshotDirectory} from '../lib/snapshot-files.mjs';

const networkPaths=[
  String.raw`\\fixture-server\share`, '//fixture-server/share',
  String.raw`\/fixture-server\share`, String.raw`/\fixture-server/share`,
  String.raw`\\?\UNC\fixture-server\share`, String.raw`\\.\fixture-device`,
];
for(const directory of networkPaths)void test(`network/device path refuses before any filesystem access: ${JSON.stringify(directory)}`,async t=>{
  let calls=0;
  for(const name of ['existsSync','lstatSync','mkdirSync','readFileSync','writeFileSync','renameSync'])
    t.mock.method(fs,name,()=>{calls++;throw Error('UNEXPECTED_FILESYSTEM_ACCESS');});
  const refused=error=>error.message==='SNAPSHOT_NETWORK_PATH';
  assert.throws(()=>assertPlainDirectory(directory),refused);
  assert.throws(()=>createSnapshotDirectorySink(directory),refused);
  await assert.rejects(openSnapshotDirectory(directory,'a'.repeat(64)),refused);
  assert.equal(calls,0,'refusal precedes reads, writes, completion checks and staging');
});
void test('ordinary local paths stay usable and symlink/junction targets and ancestors still refuse',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'snapshot-directory-boundary-'));
  try{
    const target=path.join(root,'local-target'),link=path.join(root,'local-link');
    fs.mkdirSync(target);
    assert.equal(assertPlainDirectory(target),target);
    assert.equal(assertPlainDirectory(path.relative(process.cwd(),target)),target);
    assert.equal(assertPlainDirectory(path.join(target,'not-yet-created')),path.join(target,'not-yet-created'));
    fs.symlinkSync(target,link,'junction');
    assert.throws(()=>assertPlainDirectory(link),/SNAPSHOT_LINK_PATH/);
    assert.throws(()=>assertPlainDirectory(path.join(link,'nested')),/SNAPSHOT_LINK_PATH/);
    assert.deepEqual(fs.readdirSync(target),[],'denied paths create no files');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

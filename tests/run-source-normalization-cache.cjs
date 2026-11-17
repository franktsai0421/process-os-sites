// Run the unmodified six historical assertions against the CURRENT cache,
// then independently check raw current sources. Never project current bytes
// into historical expectations or substitute a historical cache on drift.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const root = path.resolve(__dirname, '..');
const history = '0f2c8ec5b3bc8f6a5625ef049782fab1f96988b1';
const base = 'ea137c7dd8d608d216d45ab29b033fc5f782ff5d';
const cachePath = 'scripts/source-normalization-cache.cjs';
const testPath = 'tests/source-normalization-cache.test.cjs';
const hash = raw => createHash('sha256').update(raw).digest('hex');
const git = (...args) => execFileSync('git', args, {cwd:root, maxBuffer:32*1024*1024});
let failed = false;
let temp;
let fixture;
try {
  for (const ref of [history, base]) git('cat-file', '-e', ref+'^{commit}');
  const historicalCache = git('show', history+':'+cachePath);
  const currentCache = git('show', 'HEAD:'+cachePath);
  assert.equal(hash(historicalCache), 'a81c6662a3c2706a3a910d19b6cba7afa0550a6a879d0193c6871e7760064570');
  assert.deepEqual(currentCache, historicalCache, 'current canonical cache MUST equal fixed historical implementation');
  const workingCache = fs.readFileSync(path.join(root, cachePath));
  assert.deepEqual(Buffer.from(workingCache.toString('utf8').replaceAll('\r\n','\n')), currentCache, 'working cache has only checkout EOL differences');
  const originalTest = git('show', history+':'+testPath);
  assert.equal(hash(originalTest), '33f88a4ae7d8b3e72bcef47c503c83183b390e9388ac90bb6d7fa7c17510e005');
  assert.deepEqual(git('show','HEAD:'+testPath), originalTest, 'all six original tests remain committed unchanged');
  assert.deepEqual(Buffer.from(fs.readFileSync(path.join(root,testPath),'utf8').replaceAll('\r\n','\n')), originalTest, 'all six working tests remain unchanged');
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-cache-history-'));
  fixture = path.join(temp, 'fixture');
  git('-c','core.autocrlf=false','worktree','add','--detach',fixture,history);
  // Install exactly the verified CURRENT canonical implementation. No fallback.
  fs.writeFileSync(path.join(fixture,cachePath),currentCache);
  assert.deepEqual(fs.readFileSync(path.join(fixture,cachePath)),currentCache);
  assert.deepEqual(fs.readFileSync(path.join(fixture,testPath)),originalTest);
  const result=spawnSync(process.execPath,['--test',testPath],{cwd:fixture,stdio:'inherit'});
  assert.ifError(result.error);
  assert.equal(result.status,0,'original six historical assertions must all pass');
} catch (error) {
  failed = true;
  console.error('Historical fixture/current cache verification FAILED:',error);
} finally {
  if (fixture && fs.existsSync(fixture)) {
    try { git('worktree','remove','--force',fixture); }
    catch (error) { failed=true; console.error('Fixture cleanup FAILED:',error); }
  }
  if (temp && fs.existsSync(temp) && fs.readdirSync(temp).length===0) fs.rmdirSync(temp);
}
// Run current checks even if historical checks fail; neither failure is hidden.
const current=spawnSync(process.execPath,['--test','tests/source-normalization-current.test.cjs','tests/quality-inventory-integration-source.test.cjs'],{cwd:root,stdio:'inherit'});
if (current.error) console.error(current.error);
if (current.error || current.status!==0) failed=true;
process.exitCode=failed?1:0;

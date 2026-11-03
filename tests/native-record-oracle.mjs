// Test-only Worker oracle. It is not an application route and has no public port.
// The same production decoder hydrates ALL records with its default options.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';

export async function readFqcFixtureValues(db, records, bucket, mark) {
  mark('shared-row');
  const row = await db.prepare('SELECT "values" FROM shared_state WHERE id=1').first();
  mark('row-json'); const envelope = JSON.parse(row.values);
  mark('record-decode'); const decoded = await records.decodeRecordValues(bucket, envelope);
  mark('complete'); return decoded.values;
}
export const nativeRecordOracleName = 'synthetic-record-oracle';
const oracleUrl = 'http://synthetic-record-oracle.invalid/values';
const phases = ['shared-row', 'row-json', 'record-decode', 'complete'];
export async function createNativeRecordOracleWorker(applicationRoot) {
  const require = createRequire(import.meta.url), {build} = require('esbuild');
  const decoder = path.join(applicationRoot, 'lib/state-records.ts');
  const entry = `import {decodeRecordValues} from ${JSON.stringify(decoder)};
${readFqcFixtureValues.toString()}
export default {async fetch(request, env) {
 if(request.method !== 'GET' || request.url !== ${JSON.stringify(oracleUrl)}) return new Response(null,{status:404});
 let phase='shared-row';
 try {const values=await readFqcFixtureValues(env.DB,{decodeRecordValues},env.STATE_ARCHIVE,next=>{phase=next;});return Response.json({values});}
 catch {return Response.json({error:'RECORD_ORACLE_FAILED',phase},{status:500});}
}};`;
  const bundled = await build({stdin: {contents: entry, resolveDir: applicationRoot, sourcefile: 'synthetic-record-oracle.mjs'}, bundle: true, write: false,
    platform: 'neutral', format: 'esm', target: 'es2022', logLevel: 'silent'});
  assert.equal(bundled.outputFiles.length, 1);
  return {name: nativeRecordOracleName, modules: true, script: bundled.outputFiles[0].text,
    compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    d1Databases: {DB: 'synthetic-root-entry'}, r2Buckets: {STATE_ARCHIVE: 'synthetic-root-entry'}};
}
// Exactly one service request; failed transport/body/decoder/shape is fatal.
// No cache, retry, partial projections, fallback or replacement values.
export function bindNativeRecordOracle(fetcher) {
  const dispatch = fetcher.fetch.bind(fetcher);
  return async function readValues(mark = () => {}) {
    mark('oracle-dispatch');
    const response = await dispatch(oracleUrl, {method: 'GET'});
    mark('oracle-response');
    const result = await response.json();
    if (response.status !== 200) {
      if (result?.error === 'RECORD_ORACLE_FAILED' && phases.includes(result.phase)) mark(result.phase);
      throw Error('Synthetic record oracle failed: HTTP ' + response.status);
    }
    assert.deepEqual(Object.keys(result), ['values']);
    assert(result.values && typeof result.values === 'object' && !Array.isArray(result.values));
    assert(Object.values(result.values).every(value => typeof value === 'string'));
    mark('complete'); return result.values;
  };
}

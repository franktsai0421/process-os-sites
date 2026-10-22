/* oxlint-disable typescript/no-require-imports -- Node CommonJS fixture fault-injects the actual production photo loop. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('public/process/routine-fqc.js', 'utf8');
const start = source.indexOf('    for (const p of all) {', source.indexOf('async function exportDocument()'));
const loop = source.slice(start, source.indexOf('    const page =', start));
assert.ok(start >= 0 && loop.includes('images[p]'), 'Actual production export loop must exist');
async function scenario(mode) {
  const images = {}, counts = {reads: 0};
  class Reader {
    readAsDataURL() {
      counts.reads++;
      if (mode === 'read-error') { this.error = Error('SYNTHETIC_READ_ERROR'); this.onerror(); }
      else if (mode === 'abort') this.onabort();
      else { this.result = 'data:image/png;base64,c3ludGhldGlj'; this.onload(); }
    }
  }
  const context = {all: ['isolated-photo'], images, endpoint: '/isolated', FileReader: Reader,
    fetch: async () => ({ok: mode !== 'http-error', blob: async () => {if (mode === 'body-error') throw Error('SYNTHETIC_BODY_ERROR'); return {};}})};
  const job = vm.runInNewContext('(async()=>{' + loop + '})()', context);
  const bounded = Promise.race([job, new Promise((_, reject) => setTimeout(() => reject(Error('EXPORT_NEVER_SETTLED')), 200))]);
  if (mode === 'success') { await bounded; assert.ok(images['isolated-photo'].startsWith('data:image/png')); }
  else await assert.rejects(bounded, /EXPORT_PHOTO_|SYNTHETIC_/);
  if (mode === 'body-error' || mode === 'http-error') assert.equal(counts.reads, 0);
}
(async () => {
  for (const mode of ['success', 'http-error', 'body-error', 'read-error', 'abort']) await scenario(mode);
  console.log(JSON.stringify({status: 'PASS', cases: 5, scope: 'Actual photo export loop settles on HTTP/body/FileReader error or abort; isolated VM, no business writes or GUI'}));
})().catch(error => {console.error(error); process.exitCode = 1;});

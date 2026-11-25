import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {expectedProcessBundleGroups,historicalProcessBundleGroups} from './process-shell-bundle-oracle.mjs';
import {combineProcessScripts} from '../lib/process-scripts-build.mjs';
import {combineProcessStyles} from '../lib/process-styles-build.mjs';

const read = name => readFileSync(new URL('../public/process/' + name, import.meta.url), 'utf8');
const shell = read('index.html');
const dependencies = ['routine-reset.js', 'routine-fqc-page.js', 'routine-iqc.js', 'routine-fqc.js'];

void test('the routine reset control loads once before all three renderers on a cold boot', () => {
  const urls = Array.from(shell.matchAll(/<script data-process-src="([^"]+)"><\/script>/g), match => match[1]);
  const selected = urls.filter(url => dependencies.includes(url.split('?')[0]));
  assert.deepEqual(selected, ['routine-reset.js?v=20261123-admin-reset1', 'routine-fqc-page.js?v=20261124-receipt-display1', 'routine-iqc.js?v=20261125-overdue-submit1', 'routine-fqc.js?v=20261124-status-filter1']);
  assert.deepEqual(Array.from(shell.matchAll(/href="(routine-fqc\.css\?v=[^"]+)"/g), m => m[1]),
    ['routine-fqc.css?v=20261124-vi-layout1']);
});

// Exercise the proposed added dependency independently of the historical oracle.
void test('both distributed bundles have exactly the proposed sources, bytes and completion receipts', () => {
  const {assets, html} = combineProcessScripts(combineProcessStyles(shell, read).html, read);
  const expected = historicalProcessBundleGroups.map(group => group.flatMap(name =>
    name === 'routine-fqc-page.js' ? ['routine-reset.js', name] : [name]));
  assert.equal(expected.flat().length, 60);
  assert.deepEqual(expected, expectedProcessBundleGroups);
  const verify = bundles => {
    assert.deepEqual(bundles.map(asset => asset.sources), expected);
    for (const [index, group] of expected.entries()) {
      const body = group.map(name => `;\n/* ${name} */\n${read(name)}\n`).join('\n');
      const id = createHash('sha256').update(body).digest('hex').slice(0,20);
      const asset = bundles[index];
      assert.equal(asset.id, id);
      assert.equal(asset.name, `shell-scripts.${id}.js`);
      assert.ok(html.includes(asset.name));
      assert.equal(asset.source, body + `\n;(window.ProcessRuntimeBundles ||= Object.create(null))["${id}"] = true;\n`);
    }
  };
  verify(assets);
  const index = expected.findIndex(group => group.includes('routine-reset.js'));
  const at = expected[index].indexOf('routine-reset.js');
  for (const mutate of [
    asset => asset.sources.splice(at,1),
    asset => asset.sources.splice(at,0,'routine-reset.js'),
    asset => asset.sources.splice(at,2,'routine-fqc-page.js','routine-reset.js'),
    asset => { asset.source += ' '; },
    asset => { asset.source = asset.source.slice(0,asset.source.lastIndexOf('\n;(window.ProcessRuntimeBundles')); },
  ]) {
    const altered=structuredClone(assets);
    mutate(altered[index]);
    assert.throws(() => verify(altered), {code:'ERR_ASSERTION'});
  }
});

// Compare the exact Git bytes; checkout line-ending conversion is irrelevant.
void test('the proposed shell delta is confined to the four routine asset tags', () => {
  const path = 'public/process/index.html';
  const base = '0149cf21fd2e46e83f8eab99a8426bc8c9df6b47';
  const show = rev => execFileSync('git',['show',rev+':'+path]);
  const script = url => '    <script data-process-src="'+url+'"></script>';
  let expected = show(base).toString('utf8');
  for (const [from,to] of [
    ['routine-fqc.css?v=20261120-fqc-period-history1','routine-fqc.css?v=20261121-readiness1'],
    [script('routine-fqc-page.js?v=20261112-quality-main-joint1'),script('routine-reset.js?v=2')+'\n'+script('routine-fqc-page.js?v=20261121-reset1')],
    [script('routine-iqc.js?v=20261120-routine-refresh1'),script('routine-iqc.js?v=20261121-reset1')],
    [script('routine-fqc.js?v=20261120-fqc-period-history1'),script('routine-fqc.js?v=20261121-readiness1')],
  ]) {
    assert.equal(expected.split(from).length,2,from);
    expected=expected.replace(from,to);
  }
  const merged = 'c80b3fa748143613ad218a2db814704966f0a5ba';
  execFileSync('git',['merge-base','--is-ancestor',merged,'HEAD']);
  assert.deepEqual(show(merged),Buffer.from(expected));
  for (const [file,old] of [['routine-fqc.js','20261121-readiness1'],['routine-iqc.js','20261121-reset1']]) {
    const from=script(file+'?v='+old);
    assert.equal(expected.split(from).length,2,from);
    expected=expected.replace(from,script(file+'?v=20261122-plan-intent1'));
  }
  assert.deepEqual(show('d7288eb0ccc54df4817f50de36e6900cd6615678'),Buffer.from(expected));
  expected=expected.replace(script('app.js?v=20261114-lines-flow-review1'),script('app.js?v=20261125-process-master-draft'));
  expected=expected.replace('routine-reset.js?v=2','routine-reset.js?v=20261123-scoped-reset1').replace('routine-iqc.js?v=20261122-plan-intent1','routine-iqc.js?v=20261123-scoped-reset1').replace('routine-fqc.js?v=20261122-plan-intent1','routine-fqc.js?v=20261123-scoped-reset1');
  expected=expected.replaceAll('20261123-scoped-reset1','20261123-admin-reset1').replace('routine-fqc-page.js?v=20261121-reset1','routine-fqc-page.js?v=20261123-admin-reset1');
  expected=expected.replace('routine-fqc-page.js?v=20261123-admin-reset1','routine-fqc-page.js?v=20261124-receipt-display1').replace('routine-page-approved-history.js?v=20261112-quality-main-joint1','routine-page-approved-history.js?v=20261124-receipt-display1');
  expected=expected.replace('routine-iqc.js?v=20261123-admin-reset1','routine-iqc.js?v=20261125-overdue-submit1');
  expected=expected.replace('routine-fqc.js?v=20261123-admin-reset1','routine-fqc.js?v=20261124-status-filter1');
  expected=expected.replace('routine-fqc.css?v=20261121-readiness1','routine-fqc.css?v=20261124-vi-layout1');
  expected=expected.replace('routine-iqc.css?v=20261119-integration1','routine-iqc.css?v=20261124-vi-layout1');
  expected=expected.replace(script('process-equipment.js?v=20261105-process-local-save1'),script('process-equipment.js?v=20261125-reference-retry1'));
  expected=expected.replace('process-equipment.js?v=20261125-reference-retry1','process-equipment.js?v=20261125-usage-index1');
  expected=expected.replace('process-equipment.css?v=20261029-flow1','process-equipment.css?v=20261125-usage-index1');
  expected=expected.replace(script('canvas-local.js?v=20261110-process-integration2'),script('canvas-local.js?v=20261125-canvas-photos'));
  expected=expected.replace(script('app.js?v=20261125-process-master-draft'),script('app.js?v=20261125-machine-reference2'));
  expected=expected.replace(script('process-equipment.js?v=20261125-usage-index1'),script('process-equipment.js?v=20261125-machine-reference2'));
  expected=expected.replace(script('flow-zoom.js?v=20261002-v3'),script('flow-zoom.js?v=20261125-machine-reference2'));
  expected=expected.replace(script('process-editor.js?v=20261114-ipqc-link1'),script('process-editor.js?v=20261125-machine-reference2'));
  assert.equal(shell.replace(/\r\n/g,'\n'),expected.replace(/\r\n/g,'\n'));
});

void test('both account cache tags retain their main versions and order', () => {
  const tags = Array.from(shell.matchAll(/<script data-process-src="([^"]+)"><\/script>/g), m => m[1]);
  assert.deepEqual(tags.filter(url => /^(account-write-receipt|user-access)\.js(?:\?|$)/.test(url)),
    ['account-write-receipt.js?v=20261115-account-outcome1', 'user-access.js?v=20261115-account-outcome1']);
});

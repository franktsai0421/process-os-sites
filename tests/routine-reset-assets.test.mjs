import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {expectedProcessBundleGroups} from './process-shell-bundle-oracle.mjs';
import {combineProcessScripts} from '../lib/process-scripts-build.mjs';
import {combineProcessStyles} from '../lib/process-styles-build.mjs';

const read = name => readFileSync(new URL('../public/process/' + name, import.meta.url), 'utf8');
const shell = read('index.html');
const dependencies = ['routine-reset.js', 'routine-fqc-page.js', 'routine-iqc.js', 'routine-fqc.js'];

void test('the routine reset control loads once before all three renderers on a cold boot', () => {
  const urls = Array.from(shell.matchAll(/<script data-process-src="([^"]+)"><\/script>/g), match => match[1]);
  const selected = urls.filter(url => dependencies.includes(url.split('?')[0]));
  assert.deepEqual(selected, ['routine-reset.js?v=2', 'routine-fqc-page.js?v=20261121-reset1', 'routine-iqc.js?v=20261121-reset1', 'routine-fqc.js?v=20261121-reset1']);
  assert.deepEqual(Array.from(shell.matchAll(/href="(routine-fqc\.css\?v=[^"]+)"/g), m => m[1]),
    ['routine-fqc.css?v=20261121-reset1']);
});

void test('the distributable contains the exact reset helper and all three consumers once in order', () => {
  const {assets, html} = combineProcessScripts(combineProcessStyles(shell, read).html, read);
  const bundle = assets.find(asset => asset.sources.includes(dependencies[0]));
  assert.ok(bundle);
  assert.ok(html.includes(bundle.name));
  const files = assets.flatMap(asset => asset.sources);
  let offset = 0;
  for (const name of dependencies) {
    assert.equal(files.filter(file => file === name).length, 1, name);
    const bytes = read(name);
    const position = bundle.source.indexOf(bytes, offset);
    assert.ok(position >= offset, name);
    offset = position + bytes.length;
  }
});

// Proposed successor coverage; the existing historical oracle remains independently executable.
void test('the reset helper adds exactly one source to the two existing groups', () => {
  const {assets} = combineProcessScripts(combineProcessStyles(shell, read).html, read);
  const expected = expectedProcessBundleGroups.map(group => group.flatMap(name =>
    name === 'routine-fqc-page.js' ? ['routine-reset.js', name] : [name]));
  const actual = assets.map(asset => asset.sources);
  assert.equal(expected.flat().length, 60);
  assert.deepEqual(actual, expected);
  const group = actual.findIndex(names => names.includes('routine-reset.js'));
  const at = actual[group].indexOf('routine-reset.js');
  for (const replacement of [[], ['routine-reset.js', 'routine-reset.js'], ['routine-iqc.js']]) {
    const changed = actual.map((names, index) => index === group ? names.toSpliced(at, 1, ...replacement) : names);
    assert.notDeepEqual(changed, expected);
  }
});

void test('both account cache tags retain their main versions and order', () => {
  const tags = Array.from(shell.matchAll(/<script data-process-src="([^"]+)"><\/script>/g), m => m[1]);
  assert.deepEqual(tags.filter(url => /^(account-write-receipt|user-access)\.js(?:\?|$)/.test(url)),
    ['account-write-receipt.js?v=20261115-account-outcome1', 'user-access.js?v=20261115-account-outcome1']);
});

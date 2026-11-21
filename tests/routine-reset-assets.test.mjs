import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {combineProcessScripts} from '../lib/process-scripts-build.mjs';
import {combineProcessStyles} from '../lib/process-styles-build.mjs';

const read = name => readFileSync(new URL('../public/process/' + name, import.meta.url), 'utf8');
const shell = read('index.html');
const dependencies = ['routine-reset.js', 'routine-iqc.js', 'routine-fqc.js'];

void test('the routine reset control loads once before both owners on a cold boot', () => {
  const urls = Array.from(shell.matchAll(/<script data-process-src="([^"]+)"><\/script>/g), match => match[1]);
  const selected = urls.filter(url => dependencies.includes(url.split('?')[0]));
  assert.deepEqual(selected, ['routine-reset.js?v=1', 'routine-iqc.js?v=20261121-reset1', 'routine-fqc.js?v=20261121-reset1']);
  assert.deepEqual(Array.from(shell.matchAll(/href="(routine-fqc\.css\?v=[^"]+)"/g), m => m[1]),
    ['routine-fqc.css?v=20261121-reset1']);
});

void test('the distributable contains the exact reset helper and both consumers once in order', () => {
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

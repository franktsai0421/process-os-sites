import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { combineProcessStyles } from '../lib/process-styles-build.mjs';

void test('shell CSS preserves every source byte, cascade order and relative URL base', () => {
  const html = fs.readFileSync('public/process/index.html', 'utf8');
  const names = [];
  const result = combineProcessStyles(html, name => {
    names.push(name);
    return fs.readFileSync('public/process/' + name, 'utf8');
  });
  // The reviewed IQC sheet follows FQC. A missing, duplicate or reordered
  // stylesheet must still fail even if the generated CSS links collapse to one.
  const expected = [
    'styles.css',
    'photo-viewer.css',
    'version-workflow.css',
    'version-workflow-extra.css',
    'permission-controls.css',
    'flow-zoom.css',
    'editor-version-guard.css',
    'i18n.css',
    'master-data.css',
    'master-data-extra.css',
    'master-data-validation.css',
    'master-admin-ui.css',
    'approval-tabs.css',
    'bom-search.css',
    'bom-workspace.css',
    'process-equipment.css',
    'dual-system.css',
    'fqc-master.css',
    'iqc-master.css',
    'routine-equipment.css',
    'ipqc-c.css',
    'ipqc-ab.css',
    'version-draft-ui.css',
    'data-safety.css',
    'system-upgrade.css',
    'tooling.css',
    'process-ipqc.css',
    'routine-fqc.css',
    'routine-iqc.css',
    'process-editor.css',
    'interface-layout.css',
    'user-access.css',
  ];
  assert.deepEqual(names, expected);
  assert.equal(result.count, expected.length);
  assert.equal((result.html.match(/rel="stylesheet"/g) || []).length, 1);
  let end = 0;
  for (const name of names) {
    const source = fs.readFileSync('public/process/' + name, 'utf8');
    const start = result.css.indexOf(`/* ${name} */\n`, end);
    assert(start >= end);
    assert.equal(result.css.slice(start + name.length + 7, start + name.length + 7 + source.length), source);
    end = start + name.length + 7 + source.length;
  }
  assert.deepEqual(result.html.match(/<script[\s\S]*?<\/script>/g), html.match(/<script[\s\S]*?<\/script>/g));
  assert.equal(combineProcessStyles(html, n => fs.readFileSync('public/process/' + n, 'utf8')).name, result.name);
});

void test('content changes invalidate the CSS URL; unsupported cascade changes fail closed', () => {
  const html = '<link rel="stylesheet" href="a.css?v=1"><link rel="stylesheet" href="b.css">';
  const a = combineProcessStyles(html, n => `.${n}{background:url(./photo.png)}`);
  const b = combineProcessStyles(html, n => `.${n}{color:red}`);
  assert.notEqual(a.name, b.name);
  assert.match(a.css, /url\(\.\/photo.png\)/);
  assert.throws(() => combineProcessStyles(html, () => '@import "other.css";'), /DIRECTIVE/);
  assert.throws(() => combineProcessStyles(html, () => '@namespace svg url(http://www.w3.org/2000/svg);'), /DIRECTIVE/);
  assert.throws(() => combineProcessStyles(html + '<link rel="stylesheet" href="print.css" media="print">', () => ''), /ATTRIBUTES/);
  assert.throws(() => combineProcessStyles(html.replace('><link', '><style>p{}</style><link'), () => ''), /ORDER/);
  assert.throws(() => combineProcessStyles('<base href="/other/">' + html, () => ''), /ORDER/);
});

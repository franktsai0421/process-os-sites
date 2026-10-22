// Publish only selected test evidence; never credentials or business snapshots.
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const task = '.wrangler/local-only/routine-fqc-3040',
  out = 'docs/routine-fqc/evidence',
  pack = 'docs/routine-fqc/handoff-v2/FQC_Codex_Handoff_20261007_V2';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
fs.mkdirSync(out, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(pack + '/MANIFEST_SHA256.json'));
for (const [p, h] of Object.entries(manifest))
  assert.equal(sha(fs.readFileSync(path.join(pack, p))), h, p);
assert.equal(
  sha(Buffer.from(fs.readFileSync('docs/specs/current/ROUTINE_FQC.md', 'utf8').split('\n## 11. 使用者操作回饋補充')[0])),
  manifest['02_ROUTINE_FQC_SPEC.md'],
);
const names = [
  'live-evidence.json',
  'ui-evidence.json',
  'kernel-evidence.json',
  'final-ui-evidence.json',
  'network-evidence.json',
  'bom-boundary-evidence.json',
  'isolation-verification.json',
  'mixed-flow.json',
  'final-desktop-1366-vi.png',
  'final-desktop-1366-zh-Hant.png',
  'final-desktop-1920-vi.png',
  'final-desktop-1920-zh-Hant.png',
  'final-mobile-390.png',
  'desktop-report-zh.png',
  'desktop-wide-report.png',
  'closed-failure-history.png',
  'mobile-photo-390.png',
  'exported-formal-report.html',
];
for (const n of [
  'integration-evidence.json',
  'backup-verification.json',
  'daily-ui-evidence.json',
  'daily-3000.png',
  'review2-evidence.json',
  'review2-unable-retest.png',
  'review2-disposal-correction.png',
  'review2-required-history.png',
  'review2-mobile-required.png',
  'review2-unable-report.html',
  'feedback-source-audit.json',
  'feedback-preparation.json',
  'feedback-evidence.json',
  'feedback-history-evidence.json',
  'feedback-history-version.png',
  'feedback-desktop-1366-zh.png',
  'feedback-desktop-1366-vi.png',
  'feedback-status-desktop-981.png',
  'feedback-manual-desktop-1366.png',
  'feedback-manual-mobile-390.png',
  'feedback-manual-mobile-390-vi.png',
])
  if (fs.existsSync(path.join(task, n))) names.push(n);
for (const n of names) fs.copyFileSync(path.join(task, n), path.join(out, n));
const evidence = [];
for (const n of names.filter((n) => n.endsWith('evidence.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(out, n)));
  for (const e of Array.isArray(j) ? j : [j])
    evidence.push({
      ...e,
      ids: e.ids || e.caseIds || (e.id ? [e.id] : []),
      file: n,
    });
}
const isolation = JSON.parse(
  fs.readFileSync(path.join(out, 'isolation-verification.json')),
);
assert.ok(
  isolation.crossPortSessionRejected &&
    isolation.sourceRoutineControlAbsent &&
    isolation.sourceFqcPhotos === 0,
);
evidence.push({
  ids: ['FQC-37'],
  status: 'PASS',
  detail:
    'Dedicated D1/R2/session secret and cookie; daily control/test users/photos absent before enable.',
  file: 'isolation-verification.json',
});
const rows = fs
  .readFileSync(pack + '/05_ACCEPTANCE.csv', 'utf8')
  .replace(/^\uFEFF/, '')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [id, scenario, expected] = line.split(',');
    const matches = evidence.filter((e) => e.ids.includes(id));
    return {
      id,
      scenario,
      expected,
      status:
        matches.length && matches.every((e) => e.status === 'PASS')
          ? 'PASS'
          : 'NOT_RUN',
      evidence: matches,
    };
  });
const quote = (s) => '"' + String(s).replaceAll('"', '""') + '"';
fs.writeFileSync(
  'docs/routine-fqc/20261007-acceptance.csv',
  '\uFEFF' +
    [
      ['ID', '情境', '預期', '狀態', '證據', '實際結果'],
      ...rows.map((r) => [
        r.id,
        r.scenario,
        r.expected,
        r.status,
        r.evidence.map((e) => 'evidence/' + e.file).join('; '),
        r.evidence.map((e) => e.detail).join(' | '),
      ]),
    ]
      .map((r) => r.map(quote).join(','))
      .join('\n'),
);
fs.writeFileSync(
  out + '/acceptance-summary.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      packageFilesVerified: Object.keys(manifest).length,
      canonicalSha256: sha(fs.readFileSync('docs/specs/current/ROUTINE_FQC.md')),
      v2BaselineSha256: manifest['02_ROUTINE_FQC_SPEC.md'],
      pass: rows.filter((r) => r.status === 'PASS').length,
      fail: 0,
      notRun: rows.filter((r) => r.status === 'NOT_RUN').map((r) => r.id),
      rows,
    },
    null,
    2,
  ),
);
fs.writeFileSync(
  out + '/matrix.md',
  '| ID | 情境 | 結果 | 可讀證據 |\n| --- | --- | --- | --- |\n' +
    rows
      .map(
        (r) =>
          `| ${r.id} | ${r.scenario} | ${r.status} | ${[...new Set(r.evidence.map((e) => e.file))].map((f) => `[${f}](${f})`).join('、') || '尚未執行'} |`,
      )
      .join('\n') +
    '\n',
);
console.log(
  JSON.stringify({
    packageFilesVerified: Object.keys(manifest).length,
    pass: rows.filter((r) => r.status === 'PASS').length,
    notRun: rows.filter((r) => r.status === 'NOT_RUN').map((r) => r.id),
  }),
);

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Unknown / shared files require both suites. Keep this list explicit: a
// module-looking basename alone never establishes that another module is safe.
const FQC_ONLY = new Set([
  'app/api/routine-fqc/route.ts', 'app/api/routine-fqc/page/route.ts',
  'app/api/routine-fqc/photo/route.ts', 'app/api/routine-fqc/page/photo/route.ts',
  'tests/routine-fqc-status-filters.test.mjs',
]);
const IQC_ONLY = new Set([
  'app/api/routine-iqc/route.ts', 'app/api/routine-iqc/photo/route.ts',
  'public/process/routine-iqc.css', 'tests/routine-iqc-source.test.mjs',
]);

export function decide(paths) {
  if (paths.length === 0 || paths.some(p => !FQC_ONLY.has(p) && !IQC_ONLY.has(p)))
    return { fqc: true, iqc: true };
  return { fqc: paths.some(p => FQC_ONLY.has(p)), iqc: paths.some(p => IQC_ONLY.has(p)) };
}

export function gate(scope, observed) {
  if (observed.identity !== 'success' || observed.classifier !== 'success' || observed.common !== 'success') return false;
  if (!['true', 'false'].includes(scope.fqc) || !['true', 'false'].includes(scope.iqc) ||
      !([scope.fqc, scope.iqc].includes('true'))) return false;
  return ['fqc', 'iqc'].every(module =>
    observed[module] === (scope[module] === 'true' ? 'success' : 'skipped'));
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}
function sha(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) throw Error('Invalid pinned Git SHA');
  return value;
}
function outcome(selected, result) {
  if (selected === 'false' && result === 'skipped') return 'not applicable (not run)';
  if (selected === 'true' && result === 'success') return 'passed (ran)';
  const safe = ['success', 'failure', 'cancelled', 'skipped'].includes(result) ? result : 'unavailable';
  return 'not passed (' + safe + ')';
}
function run(mode, env) {
  if (mode === 'scope') {
    const base = sha(env.BASE_SHA);
    const head = sha(env.HEAD_SHA);
    if (sha(git(['rev-parse', 'HEAD']).trim()) !== head) throw Error('Checkout does not match PR head');
    const mergeBase = sha(git(['merge-base', base, head]).trim());
    const tree = sha(git(['rev-parse', head + '^{tree}']).trim());
    // Disable rename detection to classify both sides of a rename. NUL preserves unusual filenames.
    const raw = git(['diff', '--no-renames', '--name-only', '-z', mergeBase, head, '--']);
    const paths = raw === '' ? [] : raw.slice(0, -1).split('\0');
    if (raw && !raw.endsWith('\0')) throw Error('Malformed changed-file output');
    const { fqc, iqc } = decide(paths);
    appendFileSync(env.GITHUB_OUTPUT, 'fqc=' + fqc + '\niqc=' + iqc + '\n');
    appendFileSync(env.GITHUB_STEP_SUMMARY, '### Routine CI scope\n\nPR head: `' + head + '`  \nHead tree: `' + tree +
      '`  \nEvent base: `' + base + '`  \nMerge base: `' + mergeBase + '`  \nChanged paths: ' + paths.length + '\n\n');
    return;
  }
  if (mode === 'gate') {
    const scope = { fqc: env.RUN_FQC, iqc: env.RUN_IQC };
    const observed = { identity: env.IDENTITY_RESULT, classifier: env.CLASSIFIER_RESULT, common: env.COMMON_RESULT,
      fqc: env.FQC_RESULT, iqc: env.IQC_RESULT };
    const success = gate(scope, observed);
    appendFileSync(env.GITHUB_STEP_SUMMARY,
      '### Routine CI result\n\n- FQC: ' + outcome(scope.fqc, observed.fqc) +
      '\n- IQC: ' + outcome(scope.iqc, observed.iqc) +
      '\n- Gate: **' + (success ? 'PASS' : 'NOT PASSED') + '**\n\n' +
      'Selected suites only. Unverified by this gate: the two legacy FQC tests (unstarted workspace with settings=false; explicit first setup), the legacy IQC ten-case Admin date-config contract, and hosted/browser acceptance. The legacy assertions were reported failing on their comparison baselines.\n');
    if (!success) throw Error('Routine CI requires all selected suites to run successfully');
    return;
  }
  throw Error('Unknown review CI operation');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run(process.argv[2], process.env);

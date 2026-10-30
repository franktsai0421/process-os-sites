import copy
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

from benchmark_support import CheckError, pairs, write_json

TOOLS = Path(__file__).resolve().parent
ROOT = TOOLS.parents[1]


def module(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), TOOLS / (name + '.py'))
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


entry_summary = module('summarize-entry').summarize
workflow_summary = module('summarize-final-performance').summarize


class SummaryTests(unittest.TestCase):
    def setUp(self):
        self.entry = json.loads((ROOT / 'docs/sites/PROCESS_ENTRY_PROFILE_29102026_RESULTS.json').read_text())
        self.workflow = json.loads((ROOT / 'docs/sites/PROCESS_FLOW_FINAL_PERFORMANCE_29102026_RESULTS.json').read_text())

    def test_original_entry_statistics_are_reproducible(self):
        result = entry_summary(self.entry['raw'])['summaryMs']
        for label in ['before', 'after']:
            for key, expected in self.entry['summaryMs'][label].items():
                self.assertAlmostEqual(round(result[label][key]['medianMs'], 1), expected['median'])
                self.assertAlmostEqual(round(result[label][key]['maxMs'], 1), expected['max'])
        self.assertEqual(result['before']['total']['medianMs'], 708)
        self.assertEqual(result['after']['total']['maxMs'], 927)

    def test_workflow_failures_are_not_completed_speed(self):
        result = workflow_summary(self.workflow['runs'])
        self.assertEqual(result['summary']['search']['baseline']['completed']['n'], 0)
        self.assertIsNone(result['summary']['search']['baseline']['completed']['medianMs'])
        self.assertEqual(result['summary']['search']['baseline']['failedAttempts']['n'], 3)
        self.assertEqual(result['summary']['save']['final']['completed']['medianMs'], 101)

    def test_sensitive_extra_fields_do_not_escape(self):
        source = copy.deepcopy(self.entry['raw'])
        for group in source.values():
            for report in group:
                report['secret'] = 'SENSITIVE_SENTINEL'
                report['runs'][0]['detail']['navigation'][0]['name'] = 'https://private.invalid/?token=SENSITIVE_SENTINEL'
                report['runs'][0]['detail']['screenText'] = 'SENSITIVE_SENTINEL'
        self.assertNotIn('SENSITIVE_SENTINEL', json.dumps(entry_summary(source)))
        source = copy.deepcopy(self.workflow['runs'])
        for group in source.values():
            for report in group:
                report['screenText'] = 'SENSITIVE_SENTINEL'
                for sample in report['samples']:
                    sample['error'] = 'SENSITIVE_SENTINEL'
                report['apiTimings'].append({'method': 'GET', 'path': '/private/SENSITIVE_SENTINEL', 'action': '', 'ms': 1})
        self.assertNotIn('SENSITIVE_SENTINEL', json.dumps(workflow_summary(source)))

    def test_unready_or_mixed_versions_are_refused(self):
        source = copy.deepcopy(self.entry['raw'])
        source['after'][0]['runs'][0]['detail']['dataset']['processNavigationStatus'] = 'loading'
        with self.assertRaises(CheckError):
            entry_summary(source)
        source = copy.deepcopy(self.entry['raw'])
        source['after'][0]['assetHashes']['app.js'] = 'a' * 64
        with self.assertRaises(CheckError):
            entry_summary(source)

    def test_existing_files_and_symlinks_are_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'historical.json'
            path.write_text('KEEP_HISTORY')
            with self.assertRaises(FileExistsError):
                write_json(path, {'new': True})
            self.assertEqual(path.read_text(), 'KEEP_HISTORY')
            link = Path(tmp) / 'alias.json'
            link.symlink_to(path)
            with self.assertRaises(FileExistsError):
                write_json(link, {})
            self.assertEqual(path.read_text(), 'KEEP_HISTORY')

    def test_missing_pair_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_json(Path(tmp) / '1-before.json', {})
            with self.assertRaises(CheckError):
                pairs(tmp, 'before', 'after')


class EntryRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'checkout'
        self.root.mkdir()
        self.output = Path(self.temp.name) / 'output'
        self.index = self.root / 'dist/client/process/index.html'
        self.index.parent.mkdir(parents=True)
        self.index.write_bytes(b'ORIGINAL_COMPILED_INDEX')
        server = self.root / 'dist/server/index.js'
        server.parent.mkdir(parents=True)
        server.write_text('// synthetic tool-test build')
        public = self.root / 'public/process/index.html'
        public.parent.mkdir(parents=True)
        public.write_text('BEFORE_HTML')
        self.git('init', '-q')
        self.git('add', 'public')
        self.git('-c', 'user.name=Tool Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'before')
        self.before = self.git('rev-parse', 'HEAD')
        public.write_text('AFTER_HTML')
        self.git('add', 'public')
        self.git('-c', 'user.name=Tool Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'after')
        self.after = self.git('rev-parse', 'HEAD')
        self.script = self.root / 'tests/process-entry-profile-browser.test.mjs'
        self.script.parent.mkdir()
        report = json.loads((ROOT / 'docs/sites/PROCESS_ENTRY_PROFILE_29102026_RESULTS.json').read_text())['raw']['before'][0]
        (self.root / 'fixture.json').write_text(json.dumps(report))
        self.stub('')
        self.args = [sys.executable, str(TOOLS / 'run-entry-comparison.py'), '--root', str(self.root),
                     '--baseline-ref', self.before, '--candidate-ref', self.after, '--build-commit', self.after,
                     '--output-dir', str(self.output), '--node', sys.executable, '--rounds', '1']

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], stderr=subprocess.DEVNULL, text=True).strip()

    def stub(self, prefix):
        self.script.write_text(prefix + '''
import os,json,pathlib
p=pathlib.Path.cwd()
r=json.loads((p/'fixture.json').read_text());r['commit']=os.environ['PROCESS_PROGRAM_COMMIT']
assert 'PROFILE_TRACE' not in os.environ
pathlib.Path(os.environ['PROFILE_OUTPUT']).write_text(json.dumps(r))
''')

    def test_success_restores_index_and_reuses_no_historical_outputs(self):
        env = {**os.environ, 'PROFILE_TRACE': 'must-not-be-used'}
        run = subprocess.run(self.args, env=env, capture_output=True)
        self.assertEqual(run.returncode, 0, run.stdout)
        self.assertEqual(self.index.read_bytes(), b'ORIGINAL_COMPILED_INDEX')
        self.assertTrue((self.output / '1-after.json').is_file())
        self.assertFalse(list(self.output.glob('private-*.json')))
        again = subprocess.run(self.args, capture_output=True)
        self.assertNotEqual(again.returncode, 0)
        self.assertEqual(self.index.read_bytes(), b'ORIGINAL_COMPILED_INDEX')

    def test_failed_child_and_timeout_restore_index(self):
        self.stub('raise SystemExit(2)\n')
        run = subprocess.run(self.args, capture_output=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertEqual(self.index.read_bytes(), b'ORIGINAL_COMPILED_INDEX')
        self.output = Path(self.temp.name) / 'timed-out'
        self.args[self.args.index('--output-dir') + 1] = str(self.output)
        self.stub('import time\ntime.sleep(20)\n')
        run = subprocess.run(self.args + ['--timeout', '1'], capture_output=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertEqual(self.index.read_bytes(), b'ORIGINAL_COMPILED_INDEX')

    @unittest.skipIf(os.name == 'nt', 'POSIX signal-specific test')
    def test_sigterm_restores_index(self):
        self.stub("import pathlib,time\npathlib.Path('child-started').touch()\ntime.sleep(20)\n")
        child = subprocess.Popen(self.args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 5
            while not (self.root / 'child-started').exists() and time.monotonic() < deadline:
                time.sleep(0.02)
            self.assertTrue((self.root / 'child-started').exists())
            child.send_signal(signal.SIGTERM)
            child.communicate(timeout=5)
            self.assertNotEqual(child.returncode, 0)
            self.assertEqual(self.index.read_bytes(), b'ORIGINAL_COMPILED_INDEX')
        finally:
            if child.poll() is None:
                child.kill()
                child.communicate()

    def test_concurrent_lock_and_external_write_are_preserved(self):
        lock = self.root / '.sites-runtime/benchmark-run.lock'
        lock.parent.mkdir()
        lock.write_text('ANOTHER_RUN')
        run = subprocess.run(self.args, capture_output=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertEqual(lock.read_text(), 'ANOTHER_RUN')
        lock.unlink()
        self.args[self.args.index('--output-dir') + 1] = str(Path(self.temp.name) / 'conflict')
        self.stub("import pathlib\npathlib.Path('dist/client/process/index.html').write_text('EXTERNAL_CHANGE')\n")
        run = subprocess.run(self.args, capture_output=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertEqual(self.index.read_text(), 'EXTERNAL_CHANGE')


class WorkflowRunnerTests(unittest.TestCase):
    git = EntryRunnerTests.git
    stub = EntryRunnerTests.stub
    tearDown = EntryRunnerTests.tearDown
    def setUp(self):
        EntryRunnerTests.setUp(self)
        archive = json.loads((ROOT / 'docs/sites/PROCESS_FLOW_FINAL_PERFORMANCE_29102026_RESULTS.json').read_text())
        for label in ['baseline', 'final']:
            (self.root / (label + '.json')).write_text(json.dumps(archive['runs'][label][0]))
        self.script = self.root / 'tests/process-master-performance-browser.test.mjs'
        self.script.write_text("""
import json,os,pathlib
root=pathlib.Path.cwd();phase=os.environ['MEASUREMENT_PHASE'];label='baseline' if phase=='baseline' else 'final'
r=json.loads((root/(label+'.json')).read_text());r['commit']=os.environ['PROCESS_PROGRAM_COMMIT']
(root/'.sites-runtime'/('process-master-'+phase+'.json')).write_text(json.dumps(r))
(root/'.sites-runtime'/('process-master-'+phase+'.png')).write_bytes(b'SYNTHETIC_PRIVATE_IMAGE')
raise SystemExit(1 if label=='baseline' else 0)
""")
        self.args = [sys.executable, str(TOOLS / 'run-final-performance.py'), '--baseline-root', str(self.root),
                     '--baseline-commit', self.before, '--candidate-root', str(self.root),
                     '--candidate-commit', self.after, '--output-dir', str(self.output),
                     '--node', sys.executable, '--rounds', '2']

    def test_success_restores_index_and_reuses_no_historical_outputs(self):
        run = subprocess.run(self.args, capture_output=True)
        self.assertEqual(run.returncode, 0, run.stdout)
        self.assertEqual(self.index.read_bytes(), b'ORIGINAL_COMPILED_INDEX')
        result = json.loads((self.output / '1-baseline.json').read_text())
        self.assertEqual(result['status'], 'FAIL')
        self.assertEqual(next(r['status'] for r in result['samples'] if r['name']=='search'), 'FAIL')
        self.assertTrue((self.output / 'private-baseline-2/process-master-baseline.png').exists())
        self.assertFalse(list((self.root / '.sites-runtime').glob('process-master-baseline*')))
        self.assertNotIn('SYNTHETIC_PRIVATE_IMAGE', (self.output / '1-final.json').read_text())

    def test_failed_child_and_timeout_restore_index(self):
        self.script.write_text('raise SystemExit(2)\n')
        run = subprocess.run(self.args, capture_output=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertEqual(self.index.read_bytes(), b'ORIGINAL_COMPILED_INDEX')

    def test_concurrent_lock_and_external_write_are_preserved(self):
        runtime=self.root / '.sites-runtime';runtime.mkdir()
        old=runtime/'process-master-baseline.json';old.write_text('KEEP_OLD_RUN')
        run=subprocess.run(self.args,capture_output=True)
        self.assertNotEqual(run.returncode,0)
        self.assertEqual(old.read_text(),'KEEP_OLD_RUN')


if __name__ == '__main__':
    unittest.main()

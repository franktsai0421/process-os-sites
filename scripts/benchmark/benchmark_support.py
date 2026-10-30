"""Local synthetic benchmark helpers; no publication or historical-document writes."""
import contextlib
import hashlib
import json
import math
import os
from pathlib import Path
import re
import signal
import statistics
import subprocess


class CheckError(Exception):
    """A fixed, non-sensitive diagnostic code."""


def require(value, code):
    if not value:
        raise CheckError(code)


def number(value):
    require(type(value) in (int, float) and math.isfinite(value) and value >= 0,
            'INVALID_NONNEGATIVE_TIMING')
    return value


def sha(value, length=40):
    require(isinstance(value, str) and re.fullmatch(r'[a-f0-9]{%d}' % length, value),
            'INVALID_COMMIT_OR_HASH')
    return value


def stats(values):
    values = [number(v) for v in values]
    return {'n': len(values), 'medianMs': statistics.median(values) if values else None,
            'maxMs': max(values) if values else None, 'valuesMs': values}


def read_json(path):
    require(Path(path).stat().st_size <= 16 * 1024 * 1024, 'REPORT_TOO_LARGE')
    with Path(path).open(encoding='utf-8') as source:
        return json.load(source)


def write_json(path, value):
    # Exclusive creation: never replace an old report, including through a symlink.
    with Path(path).open('x', encoding='utf-8') as target:
        json.dump(value, target, ensure_ascii=False, indent=2, allow_nan=False)
        target.write('\n')


def new_directory(path):
    target = Path(path).absolute()
    target.mkdir(mode=0o700, parents=False, exist_ok=False)
    return target


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def git(root, *args):
    result = subprocess.run(['git', '-C', str(root), *args], capture_output=True)
    require(result.returncode == 0, 'GIT_READ_FAILED')
    return result.stdout


def commit(root, ref):
    require(isinstance(ref, str) and not ref.startswith('-'), 'INVALID_GIT_REF')
    return sha(git(root, 'rev-parse', '--verify', ref + '^{commit}').decode().strip())


def script_path(root, relative):
    path = (root / relative).resolve()
    require(path.is_relative_to(root) and path.is_file() and path.suffix == '.mjs',
            'INVALID_TEST_SCRIPT')
    return path


@contextlib.contextmanager
def checkout_lock(root):
    directory = root / '.sites-runtime'
    directory.mkdir(exist_ok=True)
    lock = directory / 'benchmark-run.lock'
    # An existing lock is never removed or stolen by another invocation.
    handle = lock.open('x')
    try:
        handle.write(str(os.getpid()))
        handle.close()
        yield
    finally:
        handle.close()
        lock.unlink()


@contextlib.contextmanager
def terminate_as_interrupt():
    def stop(_signal, _frame):
        raise KeyboardInterrupt()

    previous = signal.signal(signal.SIGTERM, stop)
    try:
        yield
    finally:
        signal.signal(signal.SIGTERM, previous)


def run_node(node, script, root, env, timeout):
    # No shell interpolation, raw page text, request bodies, or child error logs.
    child = subprocess.Popen([node, str(script)], cwd=root, env=env,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=os.name != 'nt')
    try:
        return child.wait(timeout=timeout)
    except BaseException:
        if os.name != 'nt':
            os.killpg(child.pid, signal.SIGTERM)
        else:
            child.terminate()
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            if os.name != 'nt':
                os.killpg(child.pid, signal.SIGKILL)
            else:
                child.kill()
            child.wait()
        raise


def benchmark_env(build_commit):
    env = os.environ.copy()  # Preserve the configured proxy, trust and guard variables.
    for key in ['PROFILE_TRACE', 'PROFILE_OUTPUT', 'PROFILE_VARIANT', 'PROFILE_ROUNDS',
                'MEASUREMENT_PHASE', 'EXTENDED_ACCEPTANCE']:
        env.pop(key, None)
    env['PROCESS_PROGRAM_COMMIT'] = sha(build_commit)
    return env


def entry_record(report):
    require(len(report['runs']) == 1, 'EXPECTED_ONE_ENTRY_RUN')
    row = report['runs'][0]
    require(not row.get('errors'), 'ENTRY_BROWSER_ERROR')
    detail = row['detail']
    keys = ['processSharedReadyMs', 'processAssetsReadyMs', 'processReadyMs']
    dataset = {key: str(number(float(detail['dataset'][key]))) for key in keys}
    require(detail['dataset'].get('processNavigationStatus') == 'ready', 'ENTRY_NOT_READY')
    dataset['processNavigationStatus'] = 'ready'
    timing_keys = ['startTime', 'responseStart', 'responseEnd']
    http = []
    for path in ['/api/platform-login', '/api/process-bootstrap', '/api/master/workflow']:
        records = [h for h in row['http'] if h['path'] == path]
        require(len(records) == 1 and records[0]['status'] == 200, 'ENTRY_HTTP_MISMATCH')
        timing = records[0]['timing']
        safe = {key: number(timing[key]) for key in timing_keys if key != 'responseEnd'}
        safe['responseEnd'] = -1 if timing['responseEnd'] == -1 else number(timing['responseEnd'])
        http.append({'path': path, 'status': 200, 'timing': safe})
    metric_names = ['LayoutDuration', 'ScriptDuration', 'RecalcStyleDuration']
    metrics = []
    for name in metric_names:
        value = next(m['value'] for m in row['metrics'] if m['name'] == name)
        metrics.append({'name': name, 'value': number(value)})
    safe_row = {key: number(row[key]) for key in ['total', 'clickWall', 'completeWall']}
    safe_row.update(errors=[], http=http, metrics=metrics, detail={
        'timeOrigin': number(detail['timeOrigin']), 'dataset': dataset,
        'navigation': [{'responseEnd': number(detail['navigation'][0]['responseEnd'])}]})
    return {'commit': sha(report['commit']),
            'assetHashes': {key: sha(report['assetHashes'][key], 64)
                            for key in ['index.html', 'bootstrap.js', 'app.js']},
            'runs': [safe_row]}


OPERATIONS = set('first-entry tab-switch warm-entry begin equipment-list search edit-equipment '
                 'apply-equipment save reload-readback name-input photo-upload save-photos submit '
                 'withdraw resubmit-withdrawn review-entry return resubmit-returned approve '
                 'effective-readback viewport-1365 viewport-390'.split())
API_PATHS = {'/api/process-bootstrap', '/api/master/workflow', '/api/master/references'}
ACTIONS = {'', 'begin', 'apply', 'save', 'submit', 'withdraw', 'return', 'approve'}


def workflow_record(report):
    require(not report.get('failure') and not report.get('errors'), 'WORKFLOW_BROWSER_ERROR')
    require(report['conditions'].get('realData') is False, 'SYNTHETIC_DATA_REQUIRED')
    samples = []
    for row in report['samples']:
        require(row['name'] in OPERATIONS and row['status'] in ['PASS', 'FAIL'], 'INVALID_SAMPLE')
        samples.append({'name': row['name'], 'status': row['status'], 'ms': number(row['ms'])})
    require(samples and {'first-entry', 'save', 'approve', 'effective-readback'} <= {s['name'] for s in samples},
            'INCOMPLETE_WORKFLOW')
    api = []
    for row in report.get('apiTimings', []):
        if row.get('path') in API_PATHS and row.get('action', '') in ACTIONS and row.get('method') in ['GET', 'POST']:
            api.append({'path': row['path'], 'method': row['method'], 'action': row.get('action', ''),
                        'ms': number(row['ms'])})
    return {'commit': sha(report['commit']), 'conditions': {'realData': False},
            'samples': samples, 'apiTimings': api, 'errors': [],
            'status': 'FAIL' if any(s['status'] == 'FAIL' for s in samples) else 'PASS'}


def pairs(directory, first, second):
    directory = Path(directory)
    found = {}
    for label in [first, second]:
        found[label] = {int(p.name.split('-')[0]): p for p in directory.glob('*-' + label + '.json')
                        if re.fullmatch(r'[1-9][0-9]*-' + label + r'\.json', p.name)}
    require(found[first] and found[first].keys() == found[second].keys(), 'UNPAIRED_MEASUREMENTS')
    require(sorted(found[first]) == list(range(1, len(found[first]) + 1)), 'MISSING_ROUND')
    return {label: [read_json(found[label][n]) for n in sorted(found[label])] for label in [first, second]}


def cli(main):
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        # Do not print argv, local paths, raw JSON, page text or credentials.
        print(json.dumps({'status': 'FAIL', 'code': str(error) if isinstance(error, CheckError)
                          else type(error).__name__}))
        raise SystemExit(1)

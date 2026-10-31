"""Alternate full workflow measurements in two explicitly selected synthetic checkouts."""
import argparse
import contextlib
import shutil
from pathlib import Path
from uuid import uuid4
from benchmark_support import (benchmark_env, checkout_lock, cli, commit, digest, new_directory,
                               read_json, require, run_node, script_path, terminate_as_interrupt,
                               workflow_record, write_json)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for label in ['baseline', 'candidate']:
        parser.add_argument('--' + label + '-root', type=Path, required=True)
        parser.add_argument('--' + label + '-commit', required=True)
        parser.add_argument('--' + label + '-script', default='tests/process-master-performance-browser.test.mjs')
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--rounds', type=int, default=3)
    parser.add_argument('--timeout', type=int, default=300)
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    require(1 <= args.rounds <= 100 and args.timeout > 0, 'INVALID_RUN_LIMIT')
    sources = {}
    for label, key in [('baseline', 'baseline'), ('final', 'candidate')]:
        root = getattr(args, key + '_root').resolve()
        source = script_path(root, getattr(args, key + '_script'))
        require((root / 'dist/server/index.js').is_file(), 'COMPILED_SERVER_REQUIRED')
        sources[label] = (root, source, commit(root, getattr(args, key + '_commit')))
    output = new_directory(args.output_dir)
    with contextlib.ExitStack() as stack:
        for root in sorted({row[0] for row in sources.values()}):
            stack.enter_context(checkout_lock(root))
        stack.enter_context(terminate_as_interrupt())
        for n in range(1, args.rounds + 1):
            for label in (['baseline', 'final'] if n % 2 else ['final', 'baseline']):
                root, source, build = sources[label]
                # The legacy harness uses the exact 'baseline' phase to continue after
                # failed operations. Refuse existing outputs before using that phase.
                phase = 'baseline' if label == 'baseline' else 'supplement-' + uuid4().hex
                prefix = 'process-master-' + phase
                require(not list((root / '.sites-runtime').glob(prefix + '*')), 'EXISTING_HARNESS_OUTPUTS')
                env = benchmark_env(build)
                env['MEASUREMENT_PHASE'] = phase
                try:
                    code = run_node(args.node, source, root, env, args.timeout)
                finally:
                    if label == 'baseline':
                        # Only this invocation's new files; pre-existing files were refused.
                        private = output / ('private-baseline-' + str(n))
                        private.mkdir(mode=0o700)
                        for created in (root / '.sites-runtime').glob(prefix + '*'):
                            require(created.is_file() and not created.is_symlink(), 'UNEXPECTED_HARNESS_OUTPUT')
                            shutil.move(str(created), str(private / created.name))
                raw = (private if label == 'baseline' else root / '.sites-runtime') / (prefix + '.json')
                require(code in (0, 1) and raw.is_file(), 'WORKFLOW_PROCESS_FAILED')
                safe = workflow_record(read_json(raw))
                require(safe['commit'] == build, 'BUILD_CLAIM_MISMATCH')
                require(code == (0 if safe['status'] == 'PASS' else 1), 'EXIT_STATUS_MISMATCH')
                write_json(output / (str(n) + '-' + label + '.json'), safe)
                # Baseline failures stay explicitly FAIL in the report, never "completed speed".
                require(label == 'baseline' or (code == 0 and safe['status'] == 'PASS'), 'CANDIDATE_WORKFLOW_FAILED')
    write_json(output / 'manifest.json', {'kind': 'workflow-comparison', 'rounds': args.rounds,
               'sources': {label: {'buildCommitClaim': build, 'scriptSha256': digest(source),
                                  'serverSha256': digest(root / 'dist/server/index.js')}
                           for label, (root, source, build) in sources.items()}, 'realData': False})
    print('PASS: measurements collected; inspect baseline FAIL samples separately')


if __name__ == '__main__':
    cli(main)

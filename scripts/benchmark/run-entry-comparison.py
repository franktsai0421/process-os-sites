"""Alternate only the entry HTML in an isolated, already-built test checkout."""
import argparse
from pathlib import Path
from benchmark_support import (benchmark_env, checkout_lock, cli, commit, digest, entry_record,
                               git, new_directory, read_json, require, run_node, script_path,
                               terminate_as_interrupt, write_json)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--baseline-ref', required=True)
    parser.add_argument('--candidate-ref', required=True)
    parser.add_argument('--build-commit', required=True, help='Commit used for the existing server build')
    parser.add_argument('--output-dir', type=Path, required=True, help='New private output directory')
    parser.add_argument('--rounds', type=int, default=5)
    parser.add_argument('--timeout', type=int, default=180)
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    require(1 <= args.rounds <= 100 and args.timeout > 0, 'INVALID_RUN_LIMIT')
    root = args.root.resolve()
    script = script_path(root, 'tests/process-entry-profile-browser.test.mjs')
    build = commit(root, args.build_commit)
    refs = {label: commit(root, ref) for label, ref in
            [('before', args.baseline_ref), ('after', args.candidate_ref)]}
    variants = {label: git(root, 'show', ref + ':public/process/index.html') for label, ref in refs.items()}
    index = root / 'dist/client/process/index.html'
    require(index.is_file() and not index.is_symlink() and index.resolve().is_relative_to(root),
            'COMPILED_INDEX_REQUIRED')
    require((root / 'dist/server/index.js').is_file(), 'COMPILED_SERVER_REQUIRED')
    output = new_directory(args.output_dir)
    with checkout_lock(root), terminate_as_interrupt():
        original = index.read_bytes()
        # Retain a private recovery copy for a hard kill, which cannot run finally.
        with (output / 'index-original.html').open('xb') as backup:
            backup.write(original)
        written = original
        try:
            for n in range(1, args.rounds + 1):
                for label in (['before', 'after'] if n % 2 else ['after', 'before']):
                    require(index.read_bytes() == written, 'COMPILED_INDEX_CHANGED_EXTERNALLY')
                    index.write_bytes(variants[label])
                    written = variants[label]
                    raw = output / ('private-' + str(n) + '-' + label + '.json')
                    env = benchmark_env(build)
                    env.update(PROFILE_ROUNDS='1', PROFILE_VARIANT=label, PROFILE_OUTPUT=str(raw))
                    require(run_node(args.node, script, root, env, args.timeout) == 0, 'ENTRY_RUN_FAILED')
                    safe = entry_record(read_json(raw))
                    require(safe['commit'] == build, 'BUILD_CLAIM_MISMATCH')
                    write_json(output / (str(n) + '-' + label + '.json'), safe)
                    raw.unlink()
        finally:
            # Preserve someone else's concurrent write; recovery copy stays available.
            require(index.read_bytes() == written, 'INDEX_RESTORE_CONFLICT_USE_RECOVERY_COPY')
            index.write_bytes(original)
    write_json(output / 'manifest.json', {'kind': 'entry-index-only', 'buildCommitClaim': build,
               'sourceRefs': refs, 'rounds': args.rounds, 'serverSha256': digest(root / 'dist/server/index.js'),
               'scriptSha256': digest(script), 'indexRestored': True, 'realData': False})
    print('PASS: entry pairs complete; original compiled index restored')


if __name__ == '__main__':
    cli(main)

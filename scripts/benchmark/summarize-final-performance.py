"""Summarize completed workflow timings separately from failed attempts."""
import argparse
from collections import defaultdict
from pathlib import Path
from benchmark_support import cli, pairs, read_json, require, stats, workflow_record, write_json


def summarize(source):
    require(source['baseline'] and len(source['baseline']) == len(source['final']), 'UNPAIRED_MEASUREMENTS')
    reports = {label: [workflow_record(item) for item in source[label]] for label in ['baseline', 'final']}
    operations = sorted({r['name'] for group in reports.values() for report in group for r in report['samples']})
    summary, api, commits = {}, {}, {}
    for name in operations:
        summary[name] = {}
        for label, group in reports.items():
            rows = [r for report in group for r in report['samples'] if r['name'] == name]
            summary[name][label] = {
                'completed': stats([r['ms'] for r in rows if r['status'] == 'PASS']),
                'failedAttempts': stats([r['ms'] for r in rows if r['status'] == 'FAIL']),
            }
    for label, group in reports.items():
        require(len({report['commit'] for report in group}) == 1, 'MIXED_BUILD_CLAIMS')
        commits[label] = group[0]['commit']
        buckets = defaultdict(list)
        for report in group:
            for timing in report['apiTimings']:
                key = timing['method'] + ' ' + timing['path'] + (' ' + timing['action'] if timing['action'] else '')
                buckets[key].append(timing['ms'])
        api[label] = {key: stats(values) for key, values in buckets.items()}
    return {'kind': 'workflow-summary', 'sourceCommits': commits, 'summary': summary, 'apiSummary': api,
            'notes': ['Only PASS samples contribute to completed speed; FAIL durations are separate.',
                      'HTTP timing includes transport and receipt; it is not database-only or server CPU time.',
                      'No raw request bodies, page text, error strings or images are copied.',
                      'Synthetic measurements do not establish live-site performance.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--input-dir', type=Path)
    source.add_argument('--archive', type=Path, help='Existing published RESULTS JSON with runs.baseline/runs.final')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    data = read_json(args.archive)['runs'] if args.archive else pairs(args.input_dir, 'baseline', 'final')
    write_json(args.output, summarize(data))
    print('PASS: new workflow summary created')


if __name__ == '__main__':
    cli(main)

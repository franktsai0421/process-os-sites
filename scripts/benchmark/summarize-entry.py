"""Summarize numeric entry timing only; never copy URLs, credentials, traces or raw errors."""
import argparse
from pathlib import Path
from benchmark_support import cli, entry_record, pairs, read_json, require, stats, write_json


def summarize(source):
    require(source['before'] and len(source['before']) == len(source['after']), 'UNPAIRED_MEASUREMENTS')
    summary, metadata = {}, {}
    for label in ['before', 'after']:
        reports = [entry_record(item) for item in source[label]]
        rows = []
        for report in reports:
            r = report['runs'][0]
            detail = r['detail']
            origin = detail['timeOrigin']
            data = detail['dataset']
            login = next(h['timing'] for h in r['http'] if h['path'] == '/api/platform-login')
            shared, assets, ready = [float(data[key]) for key in
                                    ['processSharedReadyMs', 'processAssetsReadyMs', 'processReadyMs']]
            html = detail['navigation'][0]['responseEnd']
            row = {'total': r['total'], 'automationUntilLogin': login['startTime'] - r['clickWall'],
                   'loginResponseHeaders': login['responseStart'],
                   'headersToNavigation': origin - login['startTime'] - login['responseStart'],
                   'redirectAndDocument': html, 'initialAssetsAndBootstrap': shared - html,
                   'orderedAssets': assets - shared, 'destinationReady': ready - assets,
                   'readyToVisibleConfirmation': r['completeWall'] - origin - ready}
            for name, key in [('LayoutDuration', 'layout'), ('ScriptDuration', 'script'),
                              ('RecalcStyleDuration', 'styles')]:
                row[key] = next(m['value'] for m in r['metrics'] if m['name'] == name) * 1000
            for path, key in [('/api/process-bootstrap', 'bootstrapHttp'), ('/api/master/workflow', 'masterHttp')]:
                row[key] = next(h['timing']['responseEnd'] for h in r['http'] if h['path'] == path)
            rows.append(row)
        require(len({r['commit'] for r in reports}) == 1, 'MIXED_BUILD_CLAIMS')
        require(all(r['assetHashes'] == reports[0]['assetHashes'] for r in reports), 'MIXED_ASSET_VERSIONS')
        metadata[label] = {'buildCommitClaim': reports[0]['commit'], 'assetHashes': reports[0]['assetHashes']}
        summary[label] = {key: stats([row[key] for row in rows]) for key in rows[0]}
    return {'kind': 'entry-summary', 'summaryMs': summary, 'sources': metadata,
            'notes': ['Local synthetic results only; no live-site claim.',
                      'Login is measured to response headers, not responseEnd.',
                      'Layout/style/script durations overlap wall-clock stages; do not add them.',
                      'Stage medians do not sum to the total median; retain maximum and every sample.',
                      'This numeric summary excludes raw URLs, page text, traces, images and errors.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--input-dir', type=Path)
    source.add_argument('--archive', type=Path, help='Existing published RESULTS JSON with raw.before/raw.after')
    parser.add_argument('--output', type=Path, required=True, help='New JSON file; existing files are refused')
    args = parser.parse_args()
    data = read_json(args.archive)['raw'] if args.archive else pairs(args.input_dir, 'before', 'after')
    write_json(args.output, summarize(data))
    print('PASS: new numeric entry summary created')


if __name__ == '__main__':
    cli(main)

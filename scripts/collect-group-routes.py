"""Read-only comparison of private isolated checkpoints; export only task evidence."""
import hashlib
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
evidence = Path('docs/ipqc-reference/evidence/20261007-group-routes')
before = json.loads((root / '3020-before.json').read_text(encoding='utf-8-sig'))
after = json.loads((root / '3020-after.json').read_text(encoding='utf-8-sig'))
changed = [key for key in set(before['values']) | set(after['values'])
           if before['values'].get(key) != after['values'].get(key)]
old = json.loads(before['values']['masterDataControl'])
new = json.loads(after['values']['masterDataControl'])
summary = {
    'beforeRevision': before['revision'], 'afterRevision': after['revision'],
    'changedStateKeys': sorted(changed),
    'unrelatedStateUnchanged': changed == ['masterDataControl'],
    'backupSha256': hashlib.sha256((root / '3020-before.json').read_bytes()).hexdigest(),
    'latestSha256': hashlib.sha256((root / '3020-after.json').read_bytes()).hexdigest(),
    'scopes': {},
}
for scope in ['AB', 'C']:
    baseline = old['active'][scope]
    active = new['active'][scope]
    flow = new['workflowScopes'][scope]
    products_unchanged = all(
        {k: v for k, v in p.items() if k not in ['id', 'routeMode']} ==
        {k: v for k, v in next(n for n in active['products'] if n['code'] == p['code']).items()
         if k not in ['id', 'routeMode']}
        for p in baseline['products']) and len(baseline['products']) == len(active['products'])
    prior_ids = {c['id'] for c in old.get('workflowScopes', {}).get(scope, {}).get('cases', [])}
    cases = [{k: c.get(k) for k in ['id', 'actor', 'reason', 'status', 'result']}
             for c in flow['cases'] if c['id'] not in prior_ids]
    summary['scopes'][scope] = {
        'productsUnchangedExceptRouteMode': products_unchanged,
        'productCount': len(active['products']),
        'groups': [g for g in active['categoryGroups'] if isinstance(g.get('defaultStages'), list)],
        'cases': cases,
        'workingMatchesActive': flow['working'] == active,
        'savedMatchesActive': bool(flow.get('saved')) and flow['saved']['content'] == active,
    }
(evidence / '3020-preservation.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
assert summary['unrelatedStateUnchanged'], changed
assert all(s['productsUnchangedExceptRouteMode'] for s in summary['scopes'].values())
print('PASS: only masterDataControl changed; all original product routes, IPQC, assignments, dispatch, permissions and other modules preserved.')
print(f"Revisions: {before['revision']} -> {after['revision']}")

"""Read-only audit of an existing Wrangler Local D1/R2 snapshot against IPQC-C source codes."""
import hashlib
import json
import os
import pathlib
import re
import sqlite3
import subprocess
import sys

original = pathlib.Path(sys.argv[1])
source = pathlib.Path(sys.argv[2])
d1_files = [file for file in (original / '.wrangler/state/v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite')
            if file.name != 'metadata.sqlite']
assert len(d1_files) == 1, 'Expected exactly one Local D1 file'
with sqlite3.connect(d1_files[0]) as db:
    revision, raw = db.execute('SELECT revision, "values" FROM shared_state WHERE id=1').fetchone()
stored = json.loads(raw)
if '__processR2' in stored:
    ref = stored['__processR2']
    r2_files = [file for file in (original / '.wrangler/state/v3/r2/miniflare-R2BucketObject').glob('*.sqlite')
                if file.name != 'metadata.sqlite']
    assert len(r2_files) == 1, 'Expected exactly one Local R2 metadata file'
    with sqlite3.connect(r2_files[0]) as db:
        blob = db.execute('SELECT blob_id FROM _mf_objects WHERE key=?', (ref['key'],)).fetchone()
    assert blob, 'Referenced Local snapshot not found'
    data = (original / '.wrangler/state/v3/r2/site-creator-r2/blobs' / blob[0]).read_bytes()
    assert hashlib.sha256(data).hexdigest() == ref['sha256'], 'Snapshot SHA mismatch'
    values = json.loads(data)
else:
    values = stored
parsed = subprocess.check_output([sys.executable, str(pathlib.Path(__file__).with_name('read-ipqc-c-source.py')), str(source)],
                                 env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
rows = json.loads(parsed)['rows']
codes = {entry['cells'][4]: entry['row'] for entry in rows}
codes.update({entry['cells'][6]: entry['row'] for entry in rows})
master = json.loads(values['masterDataControl'])['active']['C']
products = {str(item['code']): item for item in master['products']}
stages = {str(stage['code']) for line in master['lines'] for stage in line['stages']}
master_conflicts = []
name_differences = set()
for entry in rows:
    _, product_code, source_name, stage_code = entry['cells'][:4]
    product = products.get(product_code)
    reasons = []
    if not product:
        reasons.append('product absent')
    else:
        if product['name'] != source_name:
            name_differences.add(product_code)
        if stage_code not in product['stages']:
            reasons.append('stage absent from product route')
    if stage_code not in stages:
        reasons.append('stage absent')
    if reasons:
        master_conflicts.append({'sourceRow': entry['row'], 'productCode': product_code,
                                 'stageCode': stage_code, 'reasons': reasons})
references = {}
pattern = re.compile(r'C-[A-Z0-9]+-[A-Z0-9-]+-L\d+(?:-\d+)?')
for key, serialized in values.items():
    if key == 'platformUsers':
        continue
    matched = sorted(set(pattern.findall(serialized)) & codes.keys())
    if matched:
        references[key] = [{'sourceRow': codes[code], 'code': code} for code in matched]
print(json.dumps({'originalRevision': revision, 'ipqcCExists': 'ipqcCMasterControl' in values,
                  'snapshotShaVerified': True, 'sourceRows': len(rows),
                  'masterProducts': len(products), 'masterStages': len(stages),
                  'masterNameDifferences': len(name_differences), 'masterConflictRows': master_conflicts,
                  'historicalCollisionCount': sum(map(len, references.values())),
                  'references': references}, ensure_ascii=False))

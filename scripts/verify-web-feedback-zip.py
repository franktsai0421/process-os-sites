"""Read-only ZIP integrity check; no extraction or execution of report contents."""
import hashlib, json, sys, zipfile
from pathlib import Path
target=Path(sys.argv[1])
with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None
    names=archive.namelist()
    assert len(names)==len(set(names))
    for name in names:
        assert not name.startswith('/') and '..' not in Path(name).parts
    for required in ['README.md','manifest.json','issues.json','locations.json','history.json','environment.json']:
        assert required in names
    manifest=json.loads(archive.read('manifest.json'))
    assert set(names)=={'manifest.json',*[f['path'] for f in manifest['files']]}
    for item in manifest['files']:
        payload=archive.read(item['path'])
        assert len(payload)==item['size']
        assert hashlib.sha256(payload).hexdigest()==item['sha256']
    data=json.loads(archive.read('issues.json'))
    for attachment in data['attachments']:
        payload=archive.read(attachment['relativePath'])
        assert hashlib.sha256(payload).hexdigest()==attachment['sha256']
        assert attachment['name'] and attachment['id'].startswith('ATT-')
    for issue in data['issues']:
        assert issue['description'] in archive.read('issues/'+issue['id']+'.md').decode('utf-8')
    report={'status':'PASS','zip':str(target),'entries':len(names),'cases':len(data['issues']),'images':len(data['attachments']),'checks':['standard zipfile CRC integrity','safe unique relative paths','required UTF-8 JSON/MD files','all manifest sizes and SHA-256','attachment IDs/original names/hash','original descriptions preserved']}
    target.with_suffix('.verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

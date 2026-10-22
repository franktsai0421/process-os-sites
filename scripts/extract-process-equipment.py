"""Read the supplied machine workbook; never modify it. Preserve source photos/fields."""
import collections
import hashlib
import json
import io
import re
import sys
import unicodedata
from pathlib import Path
import openpyxl
from PIL import Image, ImageOps

source = Path(sys.argv[1])
target = Path(__file__).resolve().parents[1] / 'public' / 'process'
assets = target / 'assets' / 'equipment-20260910'
assets.mkdir(parents=True, exist_ok=True)
workbook = openpyxl.load_workbook(source, data_only=True)
selected = ['機器設定表'] if '機器設定表' in workbook.sheetnames else ['LINE A, LINE B', 'LINE C', 'C-TIEN', 'C-PREP']
records = []
image_count = 0
for sheet_name in selected:
    sheet = workbook[sheet_name]
    photos = collections.defaultdict(list)
    for picture in sheet._images:
        row = picture.anchor._from.row + 1
        original = picture._data()
        with Image.open(io.BytesIO(original)) as image:
            image = ImageOps.exif_transpose(image)
            image.thumbnail((1280, 1280))
            buffer = io.BytesIO()
            image.convert('RGB').save(buffer, format='WEBP', quality=82)
            raw = buffer.getvalue()
        digest = hashlib.sha256(raw).hexdigest()[:20]
        filename = digest + '.webp'
        (assets / filename).write_bytes(raw)
        photo = {'src': 'assets/equipment-20260910/' + filename,
                 'name': filename, 'type': 'image/webp'}
        if photo not in photos[row]:
            photos[row].append(photo)
        image_count += 1
    consolidated = sheet_name == '機器設定表'
    wide = not consolidated and sheet.max_column == 13
    for row in range(5, sheet.max_row + 1):
        def cell(col):
            value = sheet.cell(row, col).value
            return '' if value is None else str(value).strip()
        raw_stage = cell(3 if consolidated else 4)
        if not raw_stage:
            continue
        stage = ''.join(c for c in unicodedata.normalize('NFD', raw_stage) if unicodedata.category(c) != 'Mn')
        if stage == 'A-ASSY 1':
            stage = 'A-ASSY'
        raw_number = cell(7 if consolidated else (9 if wide else 8))
        numbers = re.findall(r'\b[A-Z]{2,}\d+\b', raw_number)
        # Missing physical labels remain missing; record IDs are not machine numbers.
        for number in numbers or ['']:
            raw_line = cell(2 if consolidated else 3)
            line = raw_line.replace('LINE ', '').strip()
            identity = f'{line}:{stage}:{number or row}'
            if consolidated:
                name, name_vi, process = cell(5), cell(6), cell(4)
                purpose, purpose_vi, note = cell(8), cell(9), cell(10)
                machine_type = cell(11)
                photo_code = ''
            else:
                name = (cell(7) or cell(6)) if wide else cell(6)
                name_vi, process = cell(8 if wide else 7), cell(5)
                purpose, purpose_vi = cell(11 if wide else 10), cell(12 if wide else 11)
                note, machine_type, photo_code = cell(13 if wide else 12), '', cell(2)
            record = {
                'id': 'EQ-' + hashlib.sha256(identity.encode()).hexdigest()[:16],
                'number': number, 'line': line, 'stageCode': stage,
                # The site now exposes one unified machine process. PREP equipment is
                # classified by its line/stage, not by a second process type.
                'kind': 'machine-assembly',
                'name': name, 'nameVi': name_vi, 'process': process,
                'purpose': purpose, 'purposeVi': purpose_vi, 'note': note,
                'machineType': machine_type,
                'mediaItems': photos[row],
                'source': {'sheet': sheet_name, 'row': row, 'photoCode': photo_code,
                           'stage': raw_stage, 'number': raw_number,
                           'cells': {openpyxl.utils.get_column_letter(c): cell(c) for c in range(1, sheet.max_column + 1) if cell(c)}}
            }
            records.append(record)
# The consolidated workbook may repeat the same physical machine in a later
# summary block. Keep one selectable record per line/stage/machine number and
# retain every distinct photo plus the source row references.
deduped = collections.OrderedDict()
for record in records:
    current = deduped.get(record['id'])
    if not current:
        deduped[record['id']] = record
        continue
    seen_photos = {photo['src'] for photo in current['mediaItems']}
    current['mediaItems'].extend(photo for photo in record['mediaItems'] if photo['src'] not in seen_photos)
    if len(record.get('note', '')) > len(current.get('note', '')):
        current['note'] = record['note']
    current['source'].setdefault('duplicateRows', []).append(record['source']['row'])
records = list(deduped.values())
payload = {'format': 'PROCESS_OS_EQUIPMENT_SOURCE', 'version': 2,
           'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
           'sourceName': source.name, 'sheets': selected, 'excludedSheets': [s for s in workbook.sheetnames if s not in selected],
           'records': records}
(target / 'data' / 'process-equipment-source.json').write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(json.dumps({'records': len(records), 'kinds': dict(collections.Counter(r['kind'] for r in records)),
                  'sourceImages': image_count, 'uniquePhotos': len(list(assets.iterdir())),
                  'missingNumber': sum(not r['number'] for r in records),
                  'missingPhotos': sum(not r['mediaItems'] for r in records)}, ensure_ascii=False))

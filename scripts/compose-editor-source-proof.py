#!/usr/bin/env python3
"""Compose test-only source evidence from real, frozen Git objects.

No checkout, ref, object-database, product, existing contract or witness is written.
Outputs must be new files outside this checkout. The frozen original generator
runs in an external scratch directory with its Git reader bound to this repo.
Source evidence is not functional acceptance, upload or publication authority.
"""
import argparse
import base64
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import types

FROZEN = '3f6e736efddcd03f731ea180d063c489731339df'
OLD_TARGETS = {
    'main': 'b06394ce0065849733399423afd2d906761d69c1',
    'latest_main': 'd4ac309fe05c89288af226b52c18161865ccdcb8',
    'bom_integration': '4960d74f0db395e34f2faef91325345b55c22927',
    'equipment': 'ed35ad1ed39607ff8d105ef8a84d3f73062643cd',
    'ipqc': 'e8254e6fd438c2d509073b60adafb9fd0c3f3035',
    'canvas_tooling': '130a9abb98f83e8f93b304cbc64ea96ebfec8343',
    'routine': '527efd2ab2866d3f0ed846e5c055328aa72a5bf3',
    'initial_unified': '4a10e935ef8bd4cb3d4beecaa38ebf8c6f1508c2',
    'previous_runtime': 'ce824f28d8f033500d81d7aa57104dfda1595eb3',
}
NEW_TARGETS = {
    'main99': '021f0f388b16ebcdff0f64ff44039d2ea07f4165',
    'count101': '8f1f24321764d7aaa51941bce8c48b2b6634ac6d',
    'background100': '158bb6b7ad3b98eda8104ef9a271073ee1caf0b3',
    'history_frozen': FROZEN,
    'filter807': '80745895c952ea7415cedfac9de27235116a4100',
    'boundary102': 'b172aaf53e6c2da6f9c5b1a6b331d15944340c03',
    'main100': '9fbba823090f03da8385c8d92f5e59293d19d2f1',
    'unified_main100': '7ef04ed741249816aac2f1336cf15f888ff92fa0',
    'editor_frozen': 'a31039d33b17b9929e2f4de11cbd2119126f65b1',
    'history_complete': 'e3d92846cd6e5963213c2970f65c9e019895d6c9',
    'previous_editor_runtime': '380d016fc80fe9a92b6f38eeb5f8519e536315b0',
    'boundary_runtime': '972e3a8cad7be5da7af0f4d7519fc36ff8bb2b6d',
    'boundary_revision': 'dfdfe76f0060a127ac2c08fff0fd780263695cb9',
    'conflict_revision': '88a4a2c6959dea76acfbaee24c11eb8e20494d5f',
}
FILES = {
    'generator': 'scripts/generate-unified-draft-source-contract.py',
    'manifest': 'scripts/unified-draft-source-contract.json',
    'witness': 'scripts/unified-draft-source-witness.json',
    'requests': 'scripts/unified-draft-historical-requests.json',
    'engine': 'scripts/unified-draft-source-engine.cjs',
    'witness_engine': 'scripts/unified-draft-source-witness.cjs',
}
HEX40 = re.compile(r'[a-f0-9]{40}\Z')
HEX64 = re.compile(r'[a-f0-9]{64}\Z')


class ProofError(ValueError):
    pass


def require(condition, code):
    if not condition:
        raise ProofError(code)


def exact_sha(value):
    require(isinstance(value, str) and HEX40.fullmatch(value), 'EXACT_40_CHARACTER_COMMIT_REQUIRED')
    return value


def normalized_path(value):
    require(isinstance(value, str) and value and not any(c in value for c in '\\:\x00')
            and all(p and p not in ('.', '..') for p in value.split('/')), 'NORMALIZED_PATH_REQUIRED')
    return value


def decode(value):
    require(isinstance(value, str), 'CANONICAL_BASE64_REQUIRED')
    try:
        raw = base64.b64decode(value, validate=True)
    except (ValueError, TypeError) as error:
        raise ProofError('CANONICAL_BASE64_REQUIRED') from error
    require(base64.b64encode(raw).decode() == value, 'CANONICAL_BASE64_REQUIRED')
    return raw


def object_oid(kind, raw):
    return hashlib.sha1(kind.encode() + b' ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()


def metadata(value):
    require(isinstance(value, dict) and type(value.get('bytes')) is int and value['bytes'] >= 0
            and isinstance(value.get('sha256'), str) and HEX64.fullmatch(value['sha256'])
            and isinstance(value.get('blob'), str) and HEX40.fullmatch(value['blob']), 'INVALID_BLOB_METADATA')


def attest_blob_metadata(raw, pin):
    metadata(pin)
    require(isinstance(raw, bytes) and len(raw) == pin['bytes']
            and hashlib.sha256(raw).hexdigest() == pin['sha256']
            and object_oid('blob', raw) == pin['blob'], 'PINNED_BLOB_BODY_METADATA_DRIFT')


def attest_pin_bodies(manifest, read_blob):
    pins = list(manifest['current'])
    for entry in manifest['projections']:
        pins.extend((entry['before'], entry['after']))
    seen = {}
    for pin in pins:
        metadata(pin)
        prior = seen.get(pin['blob'])
        require(prior is None or all(pin[key] == prior[key] for key in ('blob', 'sha256', 'bytes')), 'CONFLICTING_METADATA_FOR_ONE_BLOB')
        if prior is None:
            attest_blob_metadata(read_blob(pin['blob']), pin)
            seen[pin['blob']] = pin


class Witness:
    """Verify actual raw Git object framing and bounded commit/tree/path claims."""
    def __init__(self, cache):
        require(isinstance(cache, dict) and cache.get('format') == 'PROCESS_OS_SOURCE_WITNESS_V1'
                and isinstance(cache.get('objects'), list), 'WITNESS_FORMAT_REQUIRED')
        self.objects = {}
        for item in cache['objects']:
            require(isinstance(item, dict) and item.get('type') in ('commit', 'tree', 'blob'), 'WITNESS_OBJECT_METADATA_INVALID')
            oid = exact_sha(item.get('oid'))
            require(oid not in self.objects, 'DUPLICATE_WITNESS_OID')
            raw = decode(item.get('raw'))
            require(object_oid(item['type'], raw) == oid, 'WITNESS_RAW_OID_MISMATCH')
            self.objects[oid] = (item['type'], raw)
        require(isinstance(cache.get('historical', []), list), 'HISTORICAL_REQUESTS_INVALID')
        self.historical = cache.get('historical', [])

    def get(self, oid, kind):
        require(oid in self.objects and self.objects[oid][0] == kind, 'MISSING_WITNESS_OBJECT:' + str(oid))
        return self.objects[oid][1]

    def tree(self, commit):
        raw = self.get(exact_sha(commit), 'commit')
        first = raw.split(b'\n', 1)[0]
        require(re.fullmatch(b'tree [a-f0-9]{40}', first), 'COMMIT_TREE_METADATA_INVALID')
        return first[5:].decode()

    def entries(self, tree):
        raw, position, result = self.get(tree, 'tree'), 0, {}
        while position < len(raw):
            space, null = raw.find(b' ', position), raw.find(b'\0', position)
            require(space > position and null > space and null + 21 <= len(raw), 'TREE_FRAMING_INVALID')
            try:
                mode = raw[position:space].decode('ascii')
                name = raw[space + 1:null].decode('utf-8')
            except UnicodeError as error:
                raise ProofError('TREE_ENCODING_INVALID') from error
            require(mode in ('40000', '100644', '100755', '120000', '160000')
                    and name and '/' not in name and name not in ('.', '..') and name not in result, 'TREE_ENTRY_INVALID')
            result[name] = (mode, raw[null + 1:null + 21].hex())
            position = null + 21
        return result

    def resolve(self, commit, file):
        parts = normalized_path(file).split('/')
        oid = self.tree(commit)
        for index, part in enumerate(parts):
            item = self.entries(oid).get(part)
            if item is None:
                return None
            mode, oid = item
            require(mode == '40000' if index < len(parts) - 1 else mode in ('100644', '100755'), 'WITNESS_PATH_KIND_INVALID')
        return oid

    def attest(self, manifest):
        require(manifest.get('format') == 'PROCESS_OS_UNIFIED_SOURCE_V1', 'MANIFEST_FORMAT_REQUIRED')
        references = [manifest['source'], *manifest['targets'].values()]
        for reference in references:
            require(self.tree(reference['commit']) == reference['tree'], 'WITNESS_COMMIT_TREE_DRIFT')
        current = {}
        for item in manifest['current']:
            file = normalized_path(item['file'])
            require(file not in current, 'DUPLICATE_CURRENT_FILE')
            metadata(item)
            require(self.resolve(manifest['source']['commit'], file) == item['blob'], 'WITNESS_CURRENT_BLOB_DRIFT')
            current[file] = item
        pairs = set()
        for item in manifest['projections']:
            file, target = normalized_path(item['file']), item['target']
            require(target in manifest['targets'] and file in current and (target, file) not in pairs, 'PROJECTION_TARGET_FILE_INVALID')
            pairs.add((target, file))
            metadata(item['before'])
            metadata(item['after'])
            require(all(item['after'][key] == current[file][key] for key in ('blob', 'sha256', 'bytes')), 'PROJECTION_CURRENT_METADATA_DRIFT')
            require(self.resolve(manifest['targets'][target]['commit'], file) == item['before']['blob'], 'WITNESS_PREDECESSOR_BLOB_DRIFT')
        for item in manifest['added']:
            file, target = normalized_path(item['file']), item['absentFrom']
            require(target in manifest['targets'] and file in current and (target, file) not in pairs, 'ADDED_TARGET_FILE_INVALID')
            pairs.add((target, file))
            require(self.resolve(manifest['targets'][target]['commit'], file) is None, 'FALSE_ADDED_FILE_CLAIM')

    def attest_requests(self, requests):
        require(isinstance(requests, list) and len(self.historical) == len(requests), 'HISTORICAL_REQUEST_LOSS')
        seen = set()
        for request, item in zip(requests, self.historical):
            require(isinstance(request, dict) and set(request) == {'ref', 'file'} and isinstance(item, dict)
                    and set(item) == {'ref', 'file', 'blob'}, 'HISTORICAL_REQUEST_METADATA_INVALID')
            ref, file = exact_sha(request['ref']), normalized_path(request['file'])
            key = (ref, file)
            require(key not in seen, 'DUPLICATE_HISTORICAL_REQUEST')
            seen.add(key)
            require(item['ref'] == ref and item['file'] == file, 'HISTORICAL_REQUEST_ORDER_OR_IDENTITY_DRIFT')
            oid = self.resolve(ref, file)
            require(item['blob'] == oid, 'HISTORICAL_BLOB_METADATA_DRIFT')
            if oid is not None:
                self.get(oid, 'blob')


def assert_target_pins(manifest, pins):
    require(list(manifest.get('targets', {})) == list(pins), 'NAMED_TARGET_SET_OR_ORDER_DRIFT')
    for name, ref in pins.items():
        require(manifest['targets'][name].get('commit') == ref, 'NAMED_TARGET_COMMIT_DRIFT:' + name)
        exact_sha(manifest['targets'][name].get('tree'))


def parse_new_targets(values):
    supplied = {}
    for value in values:
        require(value.count('=') == 1, 'NAMED_TARGET_ARGUMENT_INVALID')
        name, ref = value.split('=')
        require(name not in supplied and name in NEW_TARGETS, 'DUPLICATE_OR_UNKNOWN_NEW_TARGET')
        supplied[name] = exact_sha(ref)
    require(supplied == NEW_TARGETS, 'NEW_NAMED_TARGET_PIN_DRIFT_OR_MISSING')
    return dict(NEW_TARGETS)


def union_witness(old, new, requests):
    """Never discard old objects or requests, and never silently prefer an OID."""
    old_proof, new_proof = Witness(old), Witness(new)
    old_proof.attest_requests(requests)
    require(new_proof.historical == [], 'GENERATOR_HISTORICAL_LEDGER_MUST_BE_EMPTY')
    objects = {item['oid']: dict(item) for item in old['objects']}
    # Compare before validation as well: a same-OID/different-raw insertion has
    # an explicit collision error, including malformed bytes under that OID.
    for item in new['objects']:
        prior = objects.get(item['oid'])
        require(prior is None or prior == item, 'SAME_OID_DIFFERENT_RAW_OR_METADATA')
        objects[item['oid']] = dict(item)
    combined = {
        'format': 'PROCESS_OS_SOURCE_WITNESS_V1',
        'scope': 'Bounded actual Git-object paths; composed source evidence only, not full history or functional acceptance.',
        'historical': [dict(item) for item in old_proof.historical],
        'objects': [objects[oid] for oid in sorted(objects)],
    }
    Witness(combined).attest_requests(requests)
    return combined


class GitReader:
    ALLOWED = {'cat-file', 'rev-parse', 'ls-tree', 'diff', 'status', 'ls-files'}

    def __init__(self, repository, object_sources=()):
        self.repository = Path(repository).resolve()
        self.object_sources = tuple(dict.fromkeys(Path(value).resolve() for value in object_sources))
        self.cache = {}

    def __call__(self, *arguments):
        require(arguments and arguments[0] in self.ALLOWED, 'NON_READONLY_GIT_COMMAND_FORBIDDEN')
        key = tuple(arguments)
        # Worktree/index status must never use a stale cached observation.
        cacheable = arguments[0] not in ('status', 'ls-files', 'diff')
        if not cacheable or key not in self.cache:
            # Historical objects may exist in another genuine local repo. This
            # is a read port, never a fetch/import or a synthetic object source.
            # Worktree/index observations never fall back to another checkout.
            locations = (self.repository, *self.object_sources) if cacheable else (self.repository,)
            failure = None
            for location in locations:
                try:
                    value = subprocess.check_output(['git', *arguments], cwd=location,
                                                    stderr=subprocess.PIPE,
                                                    env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'})
                    break
                except subprocess.CalledProcessError as error:
                    failure = error
            else:
                raise ProofError('REQUIRED_GIT_OBJECT_OR_READ_UNAVAILABLE:' + ' '.join(arguments)) from failure
            if cacheable:
                self.cache[key] = value
            else:
                return value
        return self.cache[key]

    def reference(self, ref):
        exact_sha(ref)
        require(self('cat-file', '-t', ref).strip() == b'commit', 'REAL_COMMIT_REQUIRED')
        return {'commit': ref, 'tree': self('rev-parse', ref + '^{tree}').decode().strip()}

    def frozen_blob(self, file):
        normalized_path(file)
        raw = self('cat-file', 'blob', FROZEN + ':' + file)
        require(object_oid('blob', raw) == self('rev-parse', FROZEN + ':' + file).decode().strip(), 'FROZEN_BLOB_OBJECT_MISMATCH')
        return raw

    def assert_frozen_runtime(self, source):
        require(not self('ls-files', '--unmerged').strip(), 'UNMERGED_INDEX_RUNTIME_NOT_FROZEN')
        paths = ('lib', 'app', 'public/process')
        require(not self('status', '--porcelain', '--untracked-files=all', '--', *paths).strip(), 'DIRTY_RUNTIME_NOT_FROZEN')
        require(not self('diff', '--name-only', source, 'HEAD', '--', *paths).strip(), 'HEAD_RUNTIME_DIFFERS_FROM_SOURCE')


def load_frozen(reader):
    reader.reference(FROZEN)
    raw = {name: reader.frozen_blob(file) for name, file in FILES.items()}
    old, witness, requests = (json.loads(raw[name]) for name in ('manifest', 'witness', 'requests'))
    assert_target_pins(old, OLD_TARGETS)
    require(len(requests) == 79, 'FROZEN_HISTORICAL_REQUEST_COUNT_DRIFT')
    proof = Witness(witness)
    proof.attest(old)
    proof.attest_requests(requests)
    attest_pin_bodies(old, lambda oid: reader('cat-file', 'blob', oid))
    return raw, old, witness, requests


def run_original_generator(code, reader, scratch, source, pins):
    """Unmodified frozen algorithm; only ROOT/output and Git cwd ports differ."""
    module = types.ModuleType('frozen_editor_source_generator')
    module.__file__ = str(reader.repository / FILES['generator'])
    exec(compile(code, FROZEN + ':' + FILES['generator'], 'exec'), module.__dict__)
    module.ROOT = Path(scratch)
    module.git = reader
    arguments = ['frozen-generator', '--source', source,
                 '--output', 'generated-contract.json', '--witness-output', 'generated-witness.json']
    for name, ref in pins.items():
        arguments.extend(['--target', name + '=' + ref])
    previous = sys.argv
    try:
        sys.argv = arguments
        with contextlib.redirect_stdout(io.StringIO()):
            module.main()
    finally:
        sys.argv = previous
    return (json.loads((Path(scratch) / file).read_text()) for file in ('generated-contract.json', 'generated-witness.json'))


NODE_VERIFY = r"""
const fs=require('node:fs'),assert=require('node:assert/strict');
const input=JSON.parse(fs.readFileSync(0,'utf8'));
function load(code){const box={exports:{}};new Function('require','module','exports',code)(require,box,box.exports);return box.exports;}
const proof=load(input.engine).createSourceContract(input.manifest);
const witness=load(input.witnessEngine).createWitness(input.witness);
witness.attest(proof.manifest);
const read=file=>Buffer.from(input.current[file],'base64');
proof.attest(read);
const changed=new Set();
for(const target of Object.values(proof.manifest.targets))for(const file of witness.runtimeChanges(proof.manifest.source.commit,target.commit))changed.add(file);
assert.deepEqual([...changed].sort(),proof.manifest.current.map(x=>x.file));
for(const entry of proof.manifest.projections){const prior=proof.restore(read(entry.file),entry.file,entry.target);assert.equal(require('node:crypto').createHash('sha1').update(Buffer.from('blob '+prior.length+'\0')).update(prior).digest('hex'),witness.resolve(proof.manifest.targets[entry.target].commit,entry.file));}
for(const item of input.witness.historical){if(item.blob)witness.readHistorical(item.ref,item.file);else assert.throws(()=>witness.readHistorical(item.ref,item.file),/path is absent/);}
process.stdout.write(JSON.stringify({status:'PASS_EXACT_GENERATED_EVIDENCE',current:proof.manifest.current.length,projections:proof.manifest.projections.length,objects:witness.count}));
"""


def verify_generated(reader, raw, manifest, witness, source, pins):
    require(manifest['source'] == reader.reference(source), 'GENERATED_SOURCE_REFERENCE_DRIFT')
    assert_target_pins(manifest, pins)
    for name, ref in pins.items():
        require(manifest['targets'][name] == reader.reference(ref), 'GENERATED_TARGET_TREE_DRIFT:' + name)
    Witness(witness).attest(manifest)
    payload = {
        'engine': raw['engine'].decode(), 'witnessEngine': raw['witness_engine'].decode(),
        'manifest': manifest, 'witness': witness,
        'current': {item['file']: base64.b64encode(reader('cat-file', 'blob', item['blob'])).decode()
                    for item in manifest['current']},
    }
    try:
        result = subprocess.run(['node', '-e', NODE_VERIFY], input=json.dumps(payload).encode(),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    except subprocess.CalledProcessError as error:
        raise ProofError('FROZEN_ENGINE_REJECTED_GENERATED_EVIDENCE:' + error.stderr.decode(errors='replace')[-1500:]) from error
    return json.loads(result.stdout)


def external_outputs(repository, paths):
    outputs = [Path(file).resolve() for file in paths]
    require(len(set(outputs)) == len(outputs), 'DISTINCT_OUTPUTS_REQUIRED')
    for output in outputs:
        require(output != repository and repository not in output.parents, 'OUTPUT_MUST_BE_EXTERNAL')
        require(not output.exists() and not output.is_symlink(), 'OUTPUT_ALREADY_EXISTS')
    return outputs


def encode_span_refs(manifest):
    """Lossless transport only; the frozen V1 verifier already checked this model."""
    require(manifest.get('encoding') == 'content-addressed-base64-spans-v1'
            and isinstance(manifest.get('spans'), dict) and 'spanRefs' not in manifest,
            'INDEXED_SPAN_SOURCE_REQUIRED')
    encoded = copy.deepcopy(manifest)
    refs = sorted(manifest['spans'])
    indexes = {key: index for index, key in enumerate(refs)}
    for projection in encoded['projections']:
        for rule in projection['rules']:
            for side in ('beforeRef', 'afterRef'):
                require(isinstance(rule.get(side), str) and rule[side] in indexes,
                        'INDEXED_SPAN_REFERENCE_REQUIRED')
                rule[side] = indexes[rule[side]]
    encoded['encoding'] = 'content-addressed-base64-indexed-spans-v2'
    encoded['spanRefs'] = refs
    restored = copy.deepcopy(encoded)
    for projection in restored['projections']:
        for rule in projection['rules']:
            for side in ('beforeRef', 'afterRef'):
                rule[side] = refs[rule[side]]
    del restored['spanRefs']
    restored['encoding'] = manifest['encoding']
    require(json.dumps(restored, ensure_ascii=False, separators=(',', ':'))
            == json.dumps(manifest, ensure_ascii=False, separators=(',', ':')),
            'INDEXED_SPAN_ROUNDTRIP_CHANGED')
    return encoded


def write_pair(outputs, values):
    created = []
    try:
        # Open both exclusively before writing; existing caller files are never
        # overwritten or removed, including if a competing writer wins a race.
        for output in outputs:
            output.parent.mkdir(parents=True, exist_ok=True)
            handle = output.open('x', encoding='utf-8', newline='\n')
            created.append((output, handle, os.fstat(handle.fileno())))
        for (_, handle, _), value in zip(created, values):
            handle.write(json.dumps(value, ensure_ascii=True, separators=(',', ':')) + '\n')
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        for output, handle, stat in created:
            handle.close()
            try:
                current = output.stat()
                if (current.st_dev, current.st_ino) == (stat.st_dev, stat.st_ino):
                    output.unlink()
            except FileNotFoundError:
                pass
        raise
    finally:
        for _, handle, _ in created:
            handle.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, help='Exact final committed runtime SHA; no working source is read')
    parser.add_argument('--target', action='append', required=True, help='All fixed new name=SHA pins are mandatory')
    parser.add_argument('--repository', default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument('--objects-from', action='append', default=[], help='Optional genuine local Git repo for read-only historical objects; never fetches/imports')
    parser.add_argument('--output', required=True, help='New external contract JSON path')
    parser.add_argument('--witness-output', required=True, help='New external witness JSON path')
    args = parser.parse_args()
    source, new_pins = exact_sha(args.source), parse_new_targets(args.target)
    primary = GitReader(args.repository)
    reader = GitReader(args.repository, args.objects_from)
    outputs = external_outputs(reader.repository, (args.output, args.witness_output))
    primary.reference(source)
    primary.assert_frozen_runtime(source)
    # A final source or new integration target cannot be supplied only by an
    # external object source. Those must be real commits in the main checkout.
    for ref in new_pins.values():
        primary.reference(ref)
    raw, old_manifest, old_witness, requests = load_frozen(reader)
    pins = {**OLD_TARGETS, **new_pins}
    # Required real targets must be available before creating any scratch output;
    # historical-only nonancestor objects remain in their bounded witness.
    for ref in pins.values():
        reader.reference(ref)
    outputs[0].parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='editor-source-proof-', dir=outputs[0].parent) as scratch:
        manifest, generated = run_original_generator(raw['generator'], reader, scratch, source, pins)
        assert_target_pins(manifest, pins)
        combined = union_witness(old_witness, generated, requests)
        Witness(combined).attest(old_manifest)
        checked = verify_generated(reader, raw, manifest, combined, source, pins)
        # Observe again after generation; never silently certify a runtime that
        # changed while this read-only generator was running.
        primary.assert_frozen_runtime(source)
        write_pair(outputs, (encode_span_refs(manifest), combined))
    print(json.dumps({**checked, 'source': manifest['source'], 'frozen': FROZEN,
                      'targets': len(pins), 'historicalRequests': len(requests),
                      'contract': str(outputs[0]), 'witness': str(outputs[1]),
                      'gitWrites': 0, 'functionalAcceptance': False}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        print('SOURCE_EVIDENCE_REFUSED: ' + str(error), file=sys.stderr)
        sys.exit(1)

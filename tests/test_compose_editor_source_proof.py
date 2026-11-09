"""Pure synthetic Git object-format fixtures; no repo/network/object DB writes."""
import base64
import copy
import hashlib
from pathlib import Path
import runpy
import unittest
from unittest.mock import Mock, patch

p = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scripts/compose-editor-source-proof.py'))
Witness, ProofError = p['Witness'], p['ProofError']


def obj(kind, raw):
    return {'oid': p['object_oid'](kind, raw), 'type': kind,
            'raw': base64.b64encode(raw).decode()}


def fixture():
    # This is only an object-format fixture; none of its commits claim real history.
    raw = b'// synthetic unit source only\n'
    leaf = obj('blob', raw)
    tree = obj('tree', b'100644 example.js\0' + bytes.fromhex(leaf['oid']))
    commit = obj('commit', b'tree ' + tree['oid'].encode() + b'\n\nSynthetic test only.\n')
    request = {'ref': commit['oid'], 'file': 'example.js'}
    cache = {'format': 'PROCESS_OS_SOURCE_WITNESS_V1',
             'objects': [commit, tree, leaf],
             'historical': [{**request, 'blob': leaf['oid']}]}
    manifest = {'format': 'PROCESS_OS_UNIFIED_SOURCE_V1',
                'source': {'commit': commit['oid'], 'tree': tree['oid']},
                'targets': {'old': {'commit': commit['oid'], 'tree': tree['oid']}},
                'current': [{'file': 'example.js', 'blob': leaf['oid'],
                             'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}],
                'projections': [], 'added': []}
    generated = copy.deepcopy(cache)
    generated['historical'] = []
    return cache, generated, [request], manifest


class ComposerTests(unittest.TestCase):
    def test_valid_union_is_deterministic_preserves_raw_objects_and_request_order(self):
        old, new, requests, manifest = fixture()
        before = copy.deepcopy((old, new, requests))
        a = p['union_witness'](old, new, requests)
        new['objects'].reverse()
        b = p['union_witness'](old, new, requests)
        self.assertEqual(a, b)
        self.assertEqual(a['historical'], old['historical'])
        self.assertEqual(a['objects'], sorted(old['objects'], key=lambda x: x['oid']))
        Witness(a).attest(manifest)
        Witness(a).attest_requests(requests)
        self.assertEqual(old, before[0])
        self.assertEqual(requests, before[2])

    def test_missing_old_object_fails_before_composition(self):
        for index in range(3):
            old, new, requests, _ = fixture()
            old['objects'].pop(index)
            with self.assertRaisesRegex(ProofError, 'MISSING_WITNESS_OBJECT'):
                p['union_witness'](old, new, requests)

    def test_modified_old_raw_oid_type_or_base64_rejects(self):
        changes = [lambda x: x.update(raw=x['raw'] + '!'),
                   lambda x: x.update(raw=base64.b64encode(b'changed').decode()),
                   lambda x: x.update(oid='0' * 40), lambda x: x.update(type='blob')]
        for change in changes:
            old, new, requests, _ = fixture()
            change(old['objects'][0])
            with self.assertRaises(ProofError):
                p['union_witness'](old, new, requests)

    def test_same_oid_different_raw_is_not_silently_preferred(self):
        old, new, requests, _ = fixture()
        new['objects'][0]['raw'] = base64.b64encode(b'collision').decode()
        with self.assertRaises(ProofError):
            p['union_witness'](old, new, requests)
        # Exercise the union comparison even under a mocked hash collision.
        with patch.dict(p['union_witness'].__globals__, {'Witness': Mock(side_effect=[Mock(historical=old['historical']), Mock(historical=[])])}):
            with self.assertRaisesRegex(ProofError, 'SAME_OID_DIFFERENT_RAW'):
                p['union_witness'](old, new, requests)

    def test_request_loss_reorder_and_metadata_drift_reject(self):
        old, new, requests, _ = fixture()
        missing = {'ref': requests[0]['ref'], 'file': 'absent.js'}
        old['historical'].append({**missing, 'blob': None})
        requests.append(missing)
        Witness(old).attest_requests(requests)
        for change in ('loss', 'order', 'ref', 'blob'):
            broken = copy.deepcopy(old)
            if change == 'loss': broken['historical'].pop()
            if change == 'order': broken['historical'].reverse()
            if change == 'ref': broken['historical'][0]['ref'] = 'f' * 40
            if change == 'blob': broken['historical'][0]['blob'] = None
            with self.assertRaises(ProofError):
                p['union_witness'](broken, new, requests)
        with self.assertRaisesRegex(ProofError, 'DUPLICATE_HISTORICAL_REQUEST'):
            Witness({**old, 'historical': old['historical'] * 2}).attest_requests(requests * 2)

    def test_absent_leaf_remains_absent_without_git_lookup_or_synthetic_ref(self):
        old, new, requests, _ = fixture()
        missing = {'ref': requests[0]['ref'], 'file': 'absent.js'}
        old['historical'].append({**missing, 'blob': None})
        requests.append(missing)
        union = p['union_witness'](old, new, requests)
        self.assertIsNone(Witness(union).resolve(missing['ref'], missing['file']))
        self.assertEqual(union['historical'][-1]['blob'], None)

    def test_target_loss_order_commit_and_tree_drift_reject(self):
        old, _, _, manifest = fixture()
        pins = {'old': manifest['targets']['old']['commit']}
        p['assert_target_pins'](manifest, pins)
        for change in ('missing', 'commit', 'tree'):
            broken = copy.deepcopy(manifest)
            if change == 'missing': broken['targets'] = {}
            if change == 'commit': broken['targets']['old']['commit'] = 'f' * 40
            if change == 'tree': broken['targets']['old']['tree'] = 'f' * 40
            with self.assertRaises(ProofError):
                p['assert_target_pins'](broken, pins)
                Witness(old).attest(broken)

    def test_old_positive_length_hash_and_body_metadata_drift_reject(self):
        old, _, _, manifest = fixture()
        bodies = {item['oid']: base64.b64decode(item['raw']) for item in old['objects'] if item['type'] == 'blob'}
        p['attest_pin_bodies'](manifest, bodies.__getitem__)
        for change in ('positive_length', 'hash', 'body'):
            broken = copy.deepcopy(manifest)
            changed_bodies = dict(bodies)
            if change == 'positive_length': broken['current'][0]['bytes'] += 1
            if change == 'hash': broken['current'][0]['sha256'] = 'f' * 64
            if change == 'body': changed_bodies[broken['current'][0]['blob']] += b'!'
            with self.assertRaisesRegex(ProofError, 'PINNED_BLOB_BODY_METADATA_DRIFT'):
                p['attest_pin_bodies'](broken, changed_bodies.__getitem__)

    def test_target_order_is_not_silently_rewritten(self):
        _, _, _, manifest = fixture()
        manifest['targets']['second'] = dict(manifest['targets']['old'])
        pins = {name: item['commit'] for name, item in manifest['targets'].items()}
        manifest['targets'] = dict(reversed(list(manifest['targets'].items())))
        with self.assertRaisesRegex(ProofError, 'NAMED_TARGET_SET_OR_ORDER_DRIFT'):
            p['assert_target_pins'](manifest, pins)

    def test_all_new_target_pins_required_without_old_alias_overwrite(self):
        targets = p['NEW_TARGETS']
        args = [name + '=' + ref for name, ref in targets.items()]
        self.assertEqual(p['parse_new_targets'](args), targets)
        bad = [args[:-1], args + [args[0]], args + ['main=' + 'a' * 40],
               [args[0].split('=')[0] + '=' + 'f' * 40, *args[1:]]]
        for values in bad:
            with self.assertRaises(ProofError): p['parse_new_targets'](values)

    def test_manifest_metadata_current_projection_and_false_absence_reject(self):
        old, _, _, manifest = fixture()
        for change in ('source_tree', 'blob', 'length', 'false_added'):
            broken = copy.deepcopy(manifest)
            if change == 'source_tree': broken['source']['tree'] = 'f' * 40
            if change == 'blob': broken['current'][0]['blob'] = 'f' * 40
            if change == 'length': broken['current'][0]['bytes'] = -1
            if change == 'false_added': broken['added'] = [{'file': 'example.js', 'absentFrom': 'old'}]
            with self.assertRaises(ProofError): Witness(old).attest(broken)

    def test_noncanonical_paths_duplicate_objects_and_new_historical_claim_reject(self):
        old, new, requests, _ = fixture()
        for path in ('./example.js', '../example.js', '/example.js', 'a\\b', 'a:b'):
            with self.assertRaises(ProofError): Witness(old).resolve(requests[0]['ref'], path)
        duplicate = copy.deepcopy(old)
        duplicate['objects'].append(duplicate['objects'][0])
        with self.assertRaisesRegex(ProofError, 'DUPLICATE_WITNESS_OID'): Witness(duplicate)
        new['historical'] = copy.deepcopy(old['historical'])
        with self.assertRaisesRegex(ProofError, 'GENERATOR_HISTORICAL_LEDGER_MUST_BE_EMPTY'):
            p['union_witness'](old, new, requests)

    def test_git_reader_has_no_ref_object_or_network_write_port(self):
        reader = p['GitReader']('.')
        for command in ('hash-object', 'update-ref', 'fetch', 'push', 'checkout', 'commit', 'write-tree'):
            with self.assertRaisesRegex(ProofError, 'NON_READONLY_GIT_COMMAND_FORBIDDEN'):
                reader(command)

    def test_object_fallback_uses_real_git_read_ports_but_never_worktree_status(self):
        reader = p['GitReader']('/synthetic-main', ['/synthetic-objects'])
        failure = p['subprocess'].CalledProcessError(128, ['git'])
        with patch.object(p['subprocess'], 'check_output', side_effect=[failure, b'commit\n']) as calls:
            self.assertEqual(reader('cat-file', '-t', 'a' * 40), b'commit\n')
            self.assertEqual([str(call.kwargs['cwd']) for call in calls.call_args_list], ['/synthetic-main', '/synthetic-objects'])
        with patch.object(p['subprocess'], 'check_output', side_effect=failure) as calls:
            with self.assertRaises(ProofError): reader('status', '--porcelain')
            self.assertEqual(calls.call_count, 1)
        primary = p['GitReader']('/synthetic-main')
        with patch.object(p['subprocess'], 'check_output', side_effect=failure) as calls:
            with self.assertRaises(ProofError): primary.reference('b' * 40)
            self.assertEqual(calls.call_count, 1)

    def test_runtime_freeze_checks_are_readonly_and_fail_closed(self):
        method = p['GitReader'].assert_frozen_runtime
        class Fake:
            def __init__(self, responses): self.responses, self.calls = iter(responses), []
            def __call__(self, *args): self.calls.append(args); return next(self.responses)
        good = Fake([b'', b'', b''])
        method(good, 'a' * 40)
        self.assertEqual([args[0] for args in good.calls], ['ls-files', 'status', 'diff'])
        for responses in ([b'unmerged'], [b'', b' M public/process/a.js'], [b'', b'', b'public/process/a.js']):
            with self.assertRaises(ProofError): method(Fake(responses), 'a' * 40)


class IndexedSpanTransportTests(unittest.TestCase):
    def test_lossless_order_metadata_and_input_preservation(self):
        import json
        key_a, key_b = 'a' * 64, 'b' * 64
        source = {'encoding': 'content-addressed-base64-spans-v1',
                  'spans': {key_b: {'sha256': key_b, 'bytes': 1, 'base64': 'Yg=='},
                            key_a: {'sha256': key_a, 'bytes': 1, 'base64': 'YQ=='}},
                  'projections': [{'rules': [{'beforeOffset': 0, 'afterOffset': 0,
                                             'beforeRef': key_b, 'afterRef': key_a}]}]}
        before = json.dumps(source)
        encoded = p['encode_span_refs'](source)
        self.assertEqual(json.dumps(source), before)
        self.assertEqual(encoded['spanRefs'], [key_a, key_b])
        self.assertEqual(encoded['spans'], source['spans'])
        self.assertEqual(encoded['projections'][0]['rules'][0]['beforeRef'], 1)
        self.assertEqual(encoded['projections'][0]['rules'][0]['afterRef'], 0)
        for mutate in (lambda m: m.update(encoding='unknown'),
                       lambda m: m.update(spanRefs=[]),
                       lambda m: m['projections'][0]['rules'][0].update(beforeRef='missing')):
            damaged = copy.deepcopy(source)
            mutate(damaged)
            with self.assertRaises(ProofError): p['encode_span_refs'](damaged)


if __name__ == '__main__':
    unittest.main()

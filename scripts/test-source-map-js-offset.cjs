'use strict';
// Bounded, offline regression for GHSA-68fv-2mgg-jv7q. Never expand huge maps.
const assert = require('node:assert/strict');
const { SourceMapConsumer, SourceMapGenerator, SourceNode } = require('source-map-js');
assert.equal(require('source-map-js/package.json').version, '1.2.2');
const flat = () => ({
  version: 3, file: 'output.js', sources: ['中文-kiểm-tra.js'],
  sourcesContent: ['const 名稱 = "Việt";'], names: [], mappings: 'AAAA',
});
const indexed = line => ({ version: 3, sections: [{ offset: { line, column: 0 }, map: flat() }] });
const nested = (depth, line) => {
  let map = flat();
  for (let i = 0; i < depth; i++) map = { version: 3, sections: [{ offset: { line, column: 0 }, map }] };
  return map;
};
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(JSON.stringify({ check: name, status: 'PASS' })); }
check('flat-map-roundtrip-and-multilingual-content', () => {
  const result = new SourceMapConsumer(SourceMapGenerator.fromSourceMap(new SourceMapConsumer(flat())).toJSON());
  assert.equal(result.originalPositionFor({ line: 1, column: 0 }).source, '中文-kiểm-tra.js');
  assert.equal(result.sourceContentFor('中文-kiểm-tra.js'), 'const 名稱 = "Việt";');
});
check('indexed-map-position-and-mapping', () => {
  const consumer = new SourceMapConsumer(indexed(2));
  assert.equal(consumer.originalPositionFor({ line: 3, column: 1 }).source, '中文-kiểm-tra.js');
  const rows = []; consumer.eachMapping(row => rows.push(row));
  assert.equal(rows.length, 1); assert.equal(rows[0].generatedLine, 3); assert.equal(rows[0].generatedColumn, 0);
});
check('over-limit-offset-rejected-before-expansion', () => {
  assert.throws(() => new SourceMapConsumer(indexed(10000001)), /must not exceed/);
  assert.throws(() => new SourceMapConsumer(nested(3, 5000000)), /nested/);
});
check('invalid-offset-fields-refused', () => {
  for (const value of [-1, 1.5, NaN, Infinity, '1', null, undefined, {}, 9007199254740992]) {
    for (const field of ['line', 'column']) {
      const map = indexed(0); map.sections[0].offset[field] = value;
      assert.throws(() => new SourceMapConsumer(map));
    }
  }
});
check('valid-upper-bound-construction-only', () => {
  assert.doesNotThrow(() => new SourceMapConsumer(indexed(10000000)));
});
check('source-node-stops-when-generated-code-exhausted', () => {
  assert.equal(SourceNode.fromStringWithSourceMap('a\nb', new SourceMapConsumer(indexed(10))).toString(), 'a\nb');
});
console.log(JSON.stringify({ status: 'PASS_SOURCE_MAP_OFFSET_REGRESSION', checks }));

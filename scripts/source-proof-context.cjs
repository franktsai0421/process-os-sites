// Test-only memoization for synchronous, deterministic source proofs. Never
// retain results between proofs, cache exceptions, or use caller-owned bytes
// as a cache key. File/parent selectors and the verifier are part of the key.
const maxBytes = 16 * 1024 * 1024;
const maxInput = 1024 * 1024;
let active;

function own(bytes) {
  const copy = Buffer.allocUnsafeSlow(bytes.length);
  bytes.copy(copy);
  return copy;
}

function cacheable(bytes) {
  return Buffer.isBuffer(bytes) && bytes.length <= maxInput &&
    !(typeof SharedArrayBuffer === 'function' && bytes.buffer instanceof SharedArrayBuffer);
}

function memoizeSourceProof(verify) {
  return function (bytes, ...selectors) {
    const outer = !active;
    if (outer) active = {entries: new Map(), bytes: 0};
    try {
      if (!cacheable(bytes) || selectors.some(key => typeof key !== 'string' && key !== undefined))
        return verify(bytes, ...selectors);
      let entries = active.entries.get(verify);
      if (!entries) {
        entries = [];
        active.entries.set(verify, entries);
      }
      const existing = entries.find(entry =>
        entry.selectors.length === selectors.length &&
        entry.selectors.every((key, index) => key === selectors[index]) &&
        entry.input.equals(bytes));
      if (existing) return existing.output === null ? bytes : own(existing.output);

      if (entries.length >= 8 || active.bytes + bytes.length > maxBytes)
        return verify(bytes, ...selectors);
      const input = own(bytes);
      const result = verify(bytes, ...selectors);
      if (!cacheable(result) || !input.equals(bytes)) return result;
      const size = input.length + (result === bytes ? 0 : result.length);
      if (entries.length < 8 && active.bytes + size <= maxBytes) {
        entries.push({selectors, input, output: result === bytes ? null : own(result)});
        active.bytes += size;
      }
      return result;
    } finally {
      if (outer) active = undefined;
    }
  };
}

module.exports = {memoizeSourceProof};

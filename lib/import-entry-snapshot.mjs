// A single ImportPage mount owns this immutable browser-entry snapshot.
// No global cache or history subscription: a real remount captures a new URL.
/** @param {() => string} readSearch */
export function createImportEntrySnapshot(readSearch) {
  /** @type {string | undefined} */
  let captured;
  return Object.freeze({
    subscribe: () => () => {},
    getSnapshot: () => captured ??= readSearch(),
    // SSR and the first hydration render must share the loading shell.
    getServerSnapshot: () => null,
  });
}

/** @param {string} rawSearch */
export function parseImportEntry(rawSearch) {
  const entry = new URLSearchParams(rawSearch).get('continue');
  return {
    observation: rawSearch === '?observe=c273',
    continuation: entry === 'verify',
    application: entry === 'apply' || entry === 'repair-copy',
    repairCopy: entry === 'repair-copy',
  };
}

// Preserve the CLI; the ESM implementation uses static imports and an explicit
// Node createRequire bridge for synchronous production-fixture interoperability.
import('./test-demo-auth.mjs').catch(error => { console.error(error); process.exitCode = 1; });

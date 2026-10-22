// Keep the established CLI entry while the implementation uses ESM.
import('./test-user-access-dialog-dirty.mjs').catch(error => { console.error(error); process.exitCode = 1; });

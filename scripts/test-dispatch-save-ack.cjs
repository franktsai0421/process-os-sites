// Keep the established CLI entry while the implementation uses ESM.
import('./test-dispatch-save-ack.mjs').catch(error => { console.error(error); process.exitCode = 1; });

// Keep the established CLI entry while the implementation uses ESM.
import('./test-process-editor-sync-feedback.mjs').catch(error => { console.error(error); process.exitCode = 1; });

// Keep the established CLI entry while the implementation uses ESM.
import('./test-editor-integration-ui.mjs').catch(error => { console.error(error); process.exitCode = 1; });

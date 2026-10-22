// Keep the established CLI entry while the implementation uses ESM.
import('./test-player-initial-selection.mjs').catch(error => { console.error(error); process.exitCode = 1; });

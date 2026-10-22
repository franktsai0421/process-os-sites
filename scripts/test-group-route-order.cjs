// Keep the established CLI entry while the implementation uses ESM.
import('./test-group-route-order.mjs').catch(error => { console.error(error); process.exitCode = 1; });

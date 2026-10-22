// Preserve the historical CLI spelling; the core awaits actual isolated child exits.
import('./test-user-management.mjs').catch(error => { console.error(error); if (!process.exitCode) process.exitCode = 1; });

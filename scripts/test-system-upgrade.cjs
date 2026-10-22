// Keep the established CLI entry while the implementation uses ESM.
import('./test-system-upgrade.mjs').catch(error => {
  console.error(error);
  process.exitCode = 1;
});

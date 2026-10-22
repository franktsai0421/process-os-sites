/* Compatibility CLI entry; patched dependency and normal image checks live in the ESM core. */
import('./test-image-parser-guard.mjs').catch(error=>{console.error(error);process.exitCode=1;});

// Re-evaluate module-local state for each CJS facade cache generation.
// Literal synchronous require remains an explicit lint boundary.
module.exports = require('./user-access-ui-fixture-sync-core.mjs').default();

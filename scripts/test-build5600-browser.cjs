// Build 5700 intentionally replaced Build 5600's JSON exchange with the
// versioned Excel workflow. Keep this historical entry point running the
// current regression so older local checklists do not exercise removed UI.
require('./test-build5700-browser.cjs');

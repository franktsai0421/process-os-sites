# Reject inactive master document selectors

Requests that specify the proposed catalog/line document selector must not silently reach the existing combined AB/C workflow. Valid split selectors return `409 MASTER_DOCUMENT_SPLIT_NOT_ENABLED`; malformed, partial or duplicate selectors return `422 MASTER_DOCUMENT_SELECTOR_INVALID`. Requests without these selectors keep their existing dispatch.

This independent source increment starts from GitHub main `1d02e90c3723211fbdc1a710d014f057fac62e47`, tree `d195885f1c1b4876799a2ce7bf8349f76937713d`. The route, pure helper and synthetic test are selected from the reviewed disabled foundation `ed4ede5767f024a0b56b993311a3773153ba2c74`. They do not depend on unpublished editor or shared-client changes.

The helper provides immutable ownership descriptors, approved-source projections and a non-executable preview. Only selector refusal is wired to the HTTP route. It grants no permission, registers no independent workflow, exposes no preview endpoint and performs no adoption, migration or stored-data change. Independent line/stage editing remains unavailable.

Run `node scripts/test-master-document-boundary.cjs` for the 13 synthetic groups, including 34 actual GET/POST selector cases with no DB/R2 access. Existing master regression scripts remain enabled in the AB/C CI workflow; no deployment step is added. Validation for this exact main-derived tree is recorded in the draft PR. Native browser, live data, migration and deployment acceptance are outside this increment.

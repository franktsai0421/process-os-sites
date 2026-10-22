> 狀態：Historical / Deprecated as current guidance。原日期驗證或安全評估完整保留，不代表本次checkout／目前依賴／部署狀態，也不是建立新Git歷史或操作其他副本的指令。現況：[AI_CONTEXT](AI_CONTEXT.md)；資料：[DATA_MODEL](DATA_MODEL.md)；接续：[HANDOFF](../HANDOFF.md)。

# Local Demo Verification Evidence

Verified on 2026-09-16. Only hosted-site source and documentation were changed. Tests used disposable Local storage under the OS temporary directory. Existing Local DB/R2 was never started or queried.

## Data protection

- 23 original Local data files: paths, byte sizes and SHA-256 match the pre-implementation baseline individually.
- Manifest SHA-256 (JSON array in filesystem enumeration order): `19885982f4e1643aec9e0fcb24aafcdaaa1b9981ea798d5b52fdaf5262f90cf9`.
- Non-auth seed SHA-256 (parsed seed with only values.platformUsers omitted): `7fc738834c7602188bfc56ac52bd65fe2fa355e8be70c9bffa5164109c4d05db`; unchanged.
- Original Sites mapping SHA-256: `b15577f15957cd9778f83e24664f0a1989e166a6e45e1f3e8e95c7ce23130700`; unchanged.
- The pre-existing untracked site-v18.tar.gz was not changed, deleted or copied.
- The original Git branch remains main. No staging, commits, history edits or remote operations were performed.

| Original relative path | Bytes | SHA-256 |
| --- | ---: | --- |
| `.wrangler/state/v3/cache/miniflare-CacheObject/metadata.sqlite` | 4096 | `4c34b48e33536be849e9810707c97ff2b5625bb5cbf1637dbe384cfffdda3b9d` |
| `.wrangler/state/v3/cache/miniflare-CacheObject/metadata.sqlite-shm` | 32768 | `cd49b8abc7b133bc3fc3a52fcf33ea357d6f48316269201d33283a7b0d656009` |
| `.wrangler/state/v3/cache/miniflare-CacheObject/metadata.sqlite-wal` | 8272 | `4fc1f58cb6825192a2755c469309154a13852b0fb6fb2b774db3ac83b523b560` |
| `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite` | 82685952 | `d8ff6c67ab04424c2e305af1807d93ac9f1304be5a3103f46a765291d8765c5c` |
| `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite-shm` | 32768 | `fd4c9fda9cd3f9ae7c962b0ddf37232294d55580e1aa165aa06129b8549389eb` |
| `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite-wal` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/metadata.sqlite` | 4096 | `4c34b48e33536be849e9810707c97ff2b5625bb5cbf1637dbe384cfffdda3b9d` |
| `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/metadata.sqlite-shm` | 32768 | `66cf840a0c3a64e56f2bd5b18831a0d24b8403b7a5eef683256462c89343a225` |
| `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/metadata.sqlite-wal` | 8272 | `7d66baa39f82e9b7734094bfcaf94215ecf82e9d37892ce879f1c3017baf6c92` |
| `.wrangler/state/v3/r2/miniflare-R2BucketObject/49e6826fd41b4990fd0dd7b3ba19a3021a358ffb618ea1ab8f4454a592996ae7.sqlite` | 28672 | `013d78bf68c489674c08c39f243d262356ec6b223e9db64ccbc2efb4b9e6eec3` |
| `.wrangler/state/v3/r2/miniflare-R2BucketObject/49e6826fd41b4990fd0dd7b3ba19a3021a358ffb618ea1ab8f4454a592996ae7.sqlite-shm` | 32768 | `fd4c9fda9cd3f9ae7c962b0ddf37232294d55580e1aa165aa06129b8549389eb` |
| `.wrangler/state/v3/r2/miniflare-R2BucketObject/49e6826fd41b4990fd0dd7b3ba19a3021a358ffb618ea1ab8f4454a592996ae7.sqlite-wal` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `.wrangler/state/v3/r2/miniflare-R2BucketObject/metadata.sqlite` | 4096 | `4c34b48e33536be849e9810707c97ff2b5625bb5cbf1637dbe384cfffdda3b9d` |
| `.wrangler/state/v3/r2/miniflare-R2BucketObject/metadata.sqlite-shm` | 32768 | `c7ce07e473e84e4bb5bc83fbe40e2f25a0a74118ee9723dbb8d22644915746b8` |
| `.wrangler/state/v3/r2/miniflare-R2BucketObject/metadata.sqlite-wal` | 8272 | `820030000b2c16a5f60cd5a7772e9af37e3614c4666bd0b53d6728442b28bbe8` |
| `.wrangler/state/v3/r2/site-creator-r2/blobs/a3fbe1c41acf9fec1df9b81ebdbd6a02830a0738c4659a6103d7c93d229f97e9000001a09493e807` | 2692654 | `cab4f804d4a04b4f077fb6cd38b6cdb95369596e59059ec32d378d0d3361ee17` |
| `.wrangler/state/v3/r2/site-creator-r2/blobs/f84887746e0fb887d18de5339f2f78a25596b1e0049b2c68f17136a1ef44fda6000001a09480a32b` | 2691729 | `8fcb5040d5fbc241ecf1f5c810ddb01599b8dff666376f670db10ce2a7c667fc` |
| `.wrangler/state/v3/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite` | 4096 | `4c34b48e33536be849e9810707c97ff2b5625bb5cbf1637dbe384cfffdda3b9d` |
| `.wrangler/state/v3/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite-shm` | 32768 | `90b25d933eaf045cb1926de9613a1199b8bf4e150a17bb8e39a41dd762d6b7d4` |
| `.wrangler/state/v3/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite-wal` | 12392 | `e26553a8caa3b487d27a7e130e9b56a2f99b83d735f157a674c5b0d8393757e1` |
| `.wrangler/state/v3/v3/d1/miniflare-D1DatabaseObject/metadata.sqlite` | 4096 | `4c34b48e33536be849e9810707c97ff2b5625bb5cbf1637dbe384cfffdda3b9d` |
| `.wrangler/state/v3/v3/d1/miniflare-D1DatabaseObject/metadata.sqlite-shm` | 32768 | `6e872940343debc7132581b0b7d9199902cf2acac4570fbf2bb97a620b139379` |
| `.wrangler/state/v3/v3/d1/miniflare-D1DatabaseObject/metadata.sqlite-wal` | 8272 | `8c64e67d87ee1afb2f454648738989178bddb3a6bcd1ca5f7040851b5a452d33` |

## Migration and fixture checks

Existing migrations 0000_conscious_skin.sql and 0001_woozy_roxanne_simpson.sql cover shared_state and state_backups, including column types, primary keys and nullability. No destructive statement was found in these checked-in migrations; neither was modified.

An npm CLI from the official npm registry was prepared only in an isolated temporary tools directory, as authorized. A clean temporary source copy excluded Git, environment files, Local databases, R2 blobs, secrets and backup archives. npm install completed with 566 packages. npm run dev initialized and started Local storage. Installed workerd required a supported Local compatibility date (2026-05-15), and Wrangler registry/log paths were explicitly confined to the Local project.

Actual Local API checks passed for unset/true demo mode, all three role logins, exactly three accounts after restart, preservation of every non-auth seed value, and false mode refusing both direct login and a previously valid signed Session on protected APIs. Production credentials/overrides are rejected before initialization, remoteBindings is false, and D1/R2 resource names/IDs are fixed Local placeholders. No Production resource was queried or modified. No system-wide packet capture was performed; this evidence concerns explicit binding configuration, application paths and Local tests. The unchanged login page still references Google Fonts.

## Tests

PASS:
- test-demo-auth.cjs: centralized flags, fixed identities, role scopes, tampering/expiry, disable/archive, old demo rejection, formal-session compatibility, password-reset refusal, protected APIs, seed and no readState admin injection.
- test-local-init.mjs: disposable D1/R2, exact existing migrations, constraints, remote/Production refusal, repeated initialization, existing fixture business preservation, account conflicts and incomplete schema rejection.
- Existing test-data-safety.cjs, test-process-master-api.cjs, test-release-safety.cjs, test-user-management.cjs, test-local-backup.cjs and test-local-r2-backup.cjs.
- npm run build in the isolated clone.
- TypeScript noEmit check.
- Real browser: ADMIN/RD desktop login and STAFF mobile login; correct visible role navigation. 1366×900 desktop and 390×844 mobile quick buttons and false-mode hints. No horizontal overflow; mobile buttons are 75–79 px tall.

The data-safety regression test now reads the repository's public/process/data-safety.js rather than an outer-directory file, so it works in a standalone clone.

## Changed files

- Backend: `lib/process-state.ts`, `lib/demo-identities.mjs`, `app/api/platform-login/route.ts`, `app/api/users/route.ts`.
- Local startup/configuration: `lib/local-runtime.mjs`, `scripts/local-init.mjs`, `scripts/local-dev.mjs`, `package.json`, `vite.config.ts`.
- Seed: `db/seed.json`.
- Frontend: `public/process/app.js`, `public/process/data-safety-ui.js`, `public/process/shared-state.js`, `public/process/system-upgrade.js`.
- Tests: `scripts/test-demo-auth.cjs`, `scripts/test-local-init.mjs`, `scripts/test-data-safety.cjs`, `scripts/test-process-master-api.cjs`, `scripts/test-release-safety.cjs`, `scripts/test-user-management.cjs`.
- Documents: `README.md`, `AI_CONTEXT/AI_CONTEXT.md`, `AI_CONTEXT/DATA_MODEL.md`, `AI_CONTEXT/CHANGELOG.md`, `AI_CONTEXT/LOCAL_DEMO_VERIFICATION.md`.

## Scope limits and cleanup

Disposable fixture directories, the temporary clone, build outputs, npm tool/cache and test runtime processes were removed after verification. The original project's Local storage and dependencies were not used as writable test targets.

The original Local database has not been converted, started or login-tested. Existing state lacking the complete fixed demo identities stops initialization for separate review rather than silently changing accounts or business data. No Production account transition, deployed-site change, formal-password hashing, migration addition, Git history cleanup or deployment was performed. This source change alone does not certify Git history or backup archives safe for GitHub.

測試階段快捷入口預設開放；正式營運前必須由Frank明確確認關閉。

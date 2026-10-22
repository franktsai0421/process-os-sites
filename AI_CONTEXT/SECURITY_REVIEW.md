> 狀態：Historical / Deprecated as current guidance。原日期驗證或安全評估完整保留，不代表本次checkout／目前依賴／部署狀態，也不是建立新Git歷史或操作其他副本的指令。現況：[AI_CONTEXT](AI_CONTEXT.md)；資料：[DATA_MODEL](DATA_MODEL.md)；接续：[HANDOFF](../HANDOFF.md)。

# Local candidate security scope — 2026-09-17

Current Local candidate verification is recorded in [GITHUB_DATA_READINESS.md](GITHUB_DATA_READINESS.md). Demo shortcuts use passwordless, fixed backend identities and signed eight-hour Sessions. `DEMO_LOGIN_ENABLED` unset/true permits testing; false rejects both new and existing demo Sessions. Seed has no login credentials; read APIs neither create schema nor inject administrators. Local runtime binds loopback, uses isolated bindings and the supported built-in Request.cf fixture. npm update checks are disabled. No deployed environment was queried or changed.

**測試階段快捷入口預設開放；正式營運前必須由Frank明確確認關閉。** Demo ADMIN keeps existing privileges. Legacy formal-password storage and destructive backup reauthentication remain separate future work. Pattern scanning and passing functional tests do not establish a complete penetration test or a vulnerability-free dependency tree.

## Historical release review — 2026-09-12

The following review records the earlier implementation and installation. It is not evidence of today's deployed state. In particular, `PROCESS_PUBLIC_DEMO` below describes the earlier hosted access flow; current passwordless demo Sessions use `DEMO_LOGIN_ENABLED`. The historical pnpm audit and parser patch are not a current npm audit or proof that npm-installed dependencies carry that patch. A fresh dependency security review remains necessary before formal operation. Do not report the legacy pnpm-specific parser-patch check as passed under npm without verifying it.

## Verified safeguards

- Hosted demo access is explicitly controlled by PROCESS_PUBLIC_DEMO. Signed HttpOnly, SameSite=Strict, expiring cookies use a persistent server secret; HTTPS cookies are Secure. Disabled or deleted identities cannot reuse a session. Cross-site mutations fail.
- Public shared-state responses redact account passwords. Release snapshot export/replacement uses a separate temporary maintenance secret, not demo ADMIN authority. Replacement checks the revision and retains both old and new backups.
- After transfer, PROCESS_RELEASE_DISABLED=true closes hosted release access even if an older maintenance secret remains bound in the hosting runtime. Local recovery remains loopback-only.
- Snapshots larger than 512 KiB move to private content-addressed R2 objects. D1 references retain a digest, verified when reading or restoring; corrupt/missing objects fail closed. Existing inline snapshots remain readable.
- Local backup includes consistent D1 and R2 metadata snapshots plus blob files. Restore regression covers live SQLite/WAL operation. Backup filenames are unique even in the same second.
- Isolated tests cover all three demo roles, cookie tampering/expiry/configuration, account status, CSRF, secret-gated release access, revision conflicts, >3 MiB snapshots, backup restoration, digest mismatches and password redaction. Browser fixtures cover seven sections at 1366, 1024 and 390 px without mutating user data.

## Dependency review

React and React DOM/RSC updated to 19.2.8; Vite to 8.0.16. Overrides update qs, esbuild, ws, undici and sharp. Final pnpm audit reports 0 low, 0 moderate, 2 high and 0 critical advisories. Both remaining alerts identify image-size 2.0.2; the registry did not provide the reported fixed 2.0.3 release. A checked-in pnpm patch rejects ICNS, JPEG XL and HEIF before vulnerable parsers run in all four distributed top-level bundles. Regression verifies crafted ICNS/HEIF rejection and ordinary PNG support. This is a mitigation, not a clean dependency-audit result; upgrade and remove the patch when the fixed version is available.

## Intentional exposure and remaining limitations

- The owner explicitly requested public demo ADMIN for staff testing. Anyone with the URL can therefore change/delete shared test content and use administrative functions. Do not treat this deployment as a confidential production environment. Turn off public demo and review roles before production use.
- Existing account-password storage remains legacy plaintext in protected snapshots. API redaction is not password hashing; migrate credentials before a production rollout. Password-bearing backups remain private.
- Logout clears the browser cookie; there is no per-token revocation table. Tokens expire after eight hours, and disabling an account or public demo prevents reuse.
- Browser localStorage has its own quota. R2 resolves the server D1 row-size limit, not every browser storage limit. Automatic backups rely on existing request-driven catch-up behavior; no independent cloud scheduler is claimed.
- Strict repository lint still flags existing typing/style debt. TypeScript and functional tests pass; lint is not reported as passing. No destructive production fuzzing was performed.

# Account login and password confirmation

## Current implementation

The account controller reads a fresh authorized projection before the first
mutation. It proceeds only if the dialog, actor identity and permissions, and
the selected account or role still match. An unrelated global revision can
advance without forcing a second confirmation; a changed target, closed dialog,
failed read or changed identity stops before POST. The server's final revision
and compare-and-swap checks remain mandatory. An uncertain write is never
automatically retried.

Password forms provide localized validation and preserve entered values after
a known prewrite failure. Native constraints and the controller's separate
validation/recovery messages remain active. The document language takes
precedence over shared local storage, and complete account toasts are protected
from a second translation pass. Existing role-template matrix/layout work is
retained.

Login accepts supported scrypt and existing legacy credentials without modifying
stored accounts. Malformed or unsupported hashes do not fall back to a legacy
password. Anonymous account failures share one public response; server logging
uses fixed reason codes without account IDs, submitted values or exceptions.
The authenticated account projection exposes only a credential-state category,
and only within existing per-target password-management rights. Password hash
and salt creation failures return a known prewrite service-unavailable response.
Successful explicit changes retain permission checks, session revocation,
revision/CAS and audit behavior. No new permission, schema or migration is added.

## Verification and limits

- `tests/account-login-password.test.mjs` exercises actual source handlers and
  crypto against isolated in-memory SQLite and Map-backed R2.
- `tests/user-access-prewrite-native.test.mjs` exercises the compiled app with
  generated credentials, ephemeral D1/R2, actual form confirmation, new-password
  success, old-password rejection, concurrency and recovery cases.
- `.github/workflows/account-password-acceptance.yml` registers that compiled
  test on Windows with installed Chrome, enabled sandbox, no browser download,
  a read-only token and no secrets or artifact uploads. It retains the unchanged
  source guard and builds the exact PR merge commit.
- `tests/native-account-ci-contract.test.mjs` checks launcher and registration
  only. It does not prove that a browser or Windows CI has run.

This recovered candidate was reconstructed by three-way applying the verified
`2882f35` to `ff3ed84` account delta onto main `dc348749`. It is a new candidate,
not a recovery of the old combined commit or proof of complete Git ancestry.
Exact-run results belong to the delivery receipt. Browser, Windows CI,
physical-device and real-account acceptance remain separate gates. No real
credential was read or changed, and no deployment is included.

## 2026-11-09 local integration on merged main #100

The account-only `efa7b75` delta has been semantically integrated into the current
account/permissions branch based on merged main `9fbba823`. It retains #92 role
layout, explicit Save labels, owner-bound persistent results, canonical target
checks and required ACK targets. Prewrite reads are forced fresh and reject a
changed actor/target or closed dialog before POST; unrelated revision advances
can proceed with the freshly read revision. Known password-service 503 is the
only 5xx that releases the account unknown guard, backed by actual salt/derive
failure tests proving no state/audit/epoch/archive change.

The new dependency-free source tests also couple the actual controller sender
to the actual password API, with generated credentials and memory-only SQL/R2.
They preserve uniform anonymous failures, protected authenticated diagnostics,
old-secret rejection and old-session revocation. This is source-level evidence,
not compiled/native/browser/real-account acceptance. The existing full handler
suite and Windows compiled confirmation workflow remain registered. No dependency
install, normal build retry, real-account mutation or external transfer happened
as part of this local integration. See the current
[tracking and exact-run evidence](../acceptance/accounts-permissions-20261109.md).


本機續修：帳號 native invalid 以目前介面語言的固定規則顯示持續提示並 focus 第一個無效欄位，不顯示瀏覽器其他語言泡泡；正常 native constraints 仍擋 submit。fresh prewrite GET 已納入乾淨停用／刪除確認框的 busy departure。確定輸入／權限拒絕不附無法修正它的 read-only recovery，CAS／unknown／ACK-readback 仍有明確只讀核對且禁止自動重送。[來源反例、測試與待驗項](../acceptance/accounts-permissions-20261109.md#不需等待草稿拆分的帳號介面續修)。

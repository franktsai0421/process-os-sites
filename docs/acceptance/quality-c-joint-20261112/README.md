# Follow-up: add IPQC A/B #107 to existing #109

The current candidate integrates #107 `8a6d64e06cd5c9f086f7e2ffbffacccfd494454e`
into #109 `61bbc8f67a89e785ca4acf527254dd7d49b75cde`. The prior pair-only
notes below are historical. #103/#104/#108 are still excluded. Source branches
are preserved and main is not merged/deployed. No real data is changed.

Shared runtime combines module history paths and AB access/restore fences,
FQC/IQC separation, C product-switch retention and AB filtering. New exact
source proof composes both genuine parents without replacing their old pins.
Four-module same-DB isolation covers both execution orders.
New HEAD must rerun all CI; the preceding #109 green result is not reused.

---

# FQC／IQC＋IPQC C 共同測試候選

## 固定來源與範圍

- #105：`d14808cf2df4407dcbfd8bea1363f5d6f5eb1b89`
- #106：`21a1765627c5eacede0af391036861387d6c9636`
- 共同 main：`9fbba823090f03da8385c8d92f5e59293d19d2f1`

本候選保留兩個真實父提交，供 Frank 決定合併後測試；沒有自行合併、部署、操作正式資料或備份。#103／#104／#107／#108 不納入本候選，不能用本候選宣稱全站共同驗收。

六個文字衝突已逐一整理：保留兩方變更紀錄、FQC／IQC 的兩個例行載入模組與 C 產品保留程式；合併 version UI 的同頁核准歷史入口；更新唯一 cache 版本。背景來源證明先將精確共同位元組還原成各自真實父來源，再沿用既有 main inverse。原歷史 SHA／blob、敏感來源 guard 與負例不放寬。

## 保留的功能

- FQC、IQC、例行 FQC 及 IPQC C 的獨立草稿與審核。
- 各模組整組「用我的／用對方的／取消」、非衝突內容及原 ID／關聯保留。
- 儲存時上傳照片；未知結果只查原收據，不能以 404 授權重送。
- 同 IPQC C 切產品保留未送修改／照片，離開模組才捨棄；已送 UNKNOWN 收據保留。
- 原頁核准歷史唯讀、撤權與 pending 鎖、原子保存。
- #105 Linux UNC 根路徑與隔離診斷續修。

原需求逐項證據沿用 [#105](../fqc-iqc-integration-20261112/README.md) 與 [#106](../ipqc-c-cloud-integration-20261112/README.md)，不得將其中歷史 PASS 當成本候選 PASS。

## 共同驗證

本候選新增真實 FQC／IQC／C routes 共用同一隔離 DB 的兩個操作順序：各自 Save／Submit／withdraw 期間其他模組逐 byte 不變；不同模組保存與案件 ID 不混用；錯案件撤回及 pending Save 拒絕且不發布收據。新 source proof、既有導航與 bundle 獨立 oracle 也列入共同 CI。

最終執行結果在 PR 說明記錄，不將尚未執行或 CI pending 列為成功。實體手機、原生 IME、真人雙帳號、現場 500／速度、真實缺漏數字、正式資料切換均未驗收；隔離測試不代表正式站驗收。

## Executed joint validation

At merge commit f206967: source proofs 83/83; navigation/bundle/build-oracle
68/68; concentrated quality suite 1116/1116 plus routine route checks;
IPQC C compare/save 33 assertions; module departure/isolation 254/254;
new three-route same-database isolation 2/2. Lint, full TypeScript,
protected production build, and source-only history/worktree preflight passed.
Counts overlap and must not be added together.

Browser regression launch is BLOCKED, not passed: Chromium exits before a
page opens with `process_singleton_posix.cc socket() failed: Operation not
permitted`. An approved isolated retry had the same environment restriction.
No real accounts, production data, test-site deployment, or physical-device
acceptance was performed. New GitHub CI remains pending until this draft is
published. These limits prevent treating this draft as accepted for release.

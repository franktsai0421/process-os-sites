# 3030 最終銜接與退役

2026-10-07（Asia/Bangkok）。使用者確認本次 3030 已完成，要求併入日常 3000 並停止使用舊隔離環境。沿 `codex/ipqc-ab-local`／HEAD `84278d837898f4e836ec003f7adb67ff38f785c8`，保留並行未提交修改，未 commit／push／Git merge／部署。

## 最終資料

上輪 [完整流程驗收](20261007-flow-acceptance.md)完成 V8 後，使用者在 3030 又正常完成 V10 撤回及 V12 核准。本輪確認 3000 模具仍是未修改的 V8，其他模組已有後續更新至 revision 449，因此只增量銜接模具控制。

- 正式 V12：`505aaf24-afc9-4e48-9b09-e8351185d3b3`，原核准及操作者紀錄直接延續，沒有重新送審或生成替代核准。
- 366 筆器具、243 照片引用／239 唯一原圖、38 筆 IQC 引用、12 個版本、4 次 Save、6 個案件及全部歷史／收據／序列保留；沒有草稿或待審。
- V8→V12 器具差異只有 `DC01-0001`：規格為使用者已核准的 `TEST`；IQC 改為 `3040203`、`3060603`。照確認的 V12 延續，未自行改寫。新增 IQC 穩定 ID 在 3000 正式來源可讀。
- 交接時間 `2026-10-07T06:41:38.874Z`，操作 `f79e90f5-8538-4516-b0a0-f43766afb40a`，3000 revision **449→450**。
- 精確寫入前備份 `acc10865-23b5-4b1d-a3e3-9c432b09a210`，revision 449；values 與寫入前逐位一致。
- 完整控制 SHA-256 `b3b486122893510f13d1dfeb93b0beb9a47754a5112133f6dd499814d63428aa`，兩端一致；manifest 只有 `toolingMasterControl` 改變，並行 IPQC／例行 FQC／使用者及其他資料保留。

程式共用目前 checkout，五個相關 JS/CSS 兩端雜湊一致，不需 Git 合併。開發 runtime 熱更新曾出現 500，沿原 D1/R2 正常重啟後恢復；没有初始化、整庫覆蓋或使用隔離測試副本。

## 3030 退役

`2026-10-07T06:43:39.8764446Z` 停止已核對的 3030 node 服務。完整 runtime 原地改名為 `.wrangler/local-only/import-3030-20261006/runtime-retired-20261007/`，D1/R2 及原備份保留；原 `runtime/` 不存在。isolation／server／服務紀錄標記 retired，舊匯入及初次驗收腳本在登入／網路操作前拒絕此環境。

**日常只使用 3000。未來需要 3030 時另建新的工作目錄、隔離資料及當時基準，不得重啟封存 runtime 或重跑此次匯入／交接。** 封存只供追溯及明確授權的復原。有效 3030 分頁已關閉，保留 3000 V12 與原 ChatGPT 對話。

## 驗證及修改

PASS：完整歷史後繼與 closed 狀態、239 原圖逐張 SHA-256、IQC 正式 ID、正常 ADMIN API dry-run／精確備份／CAS 寫入／完整回讀、只改模具 pointer、SQLite integrity；`scripts/test-tooling.cjs` 22 項及 TypeScript 檢查通過。3030 無監聽、原 runtime 不存在，兩個舊腳本退役 guard 實測通過；停止 3030 後正常登入 3000 仍讀到 V12／366 筆，UI 顯示 V12。

本輪檔案：`app/api/tooling/local-handoff/route.ts` 增加明確目標摘要及歷史後繼保護；`scripts/test-tooling.cjs` 補摘要／CAS／歷史改寫拒絕與冪等測試；`scripts/tooling-import-local.mjs`、`scripts/verify-tooling-local.mjs` 增加 retired guard。規格、實作模型、CHANGELOG、HANDOFF 同步更新。共用 UI 未改，無 schema／migration／新增資料模型欄位。

NOT RUN：具名員工密碼帳號、實體手機、遠端部署，沿前輪界線。V12 UI 顯示 518 待補；原照片識別、IQC 來源疑義與舊移轉缺目的地仍待業務補正，未猜填。復原到 V8 會失去使用者 V12 變更；有後續資料時不得直接還原 revision 449 整庫備份。

私有本機證據（Git ignored）：`.wrangler/local-only/tooling-flow-20261007/retirement-3030/`，含完整前後控制、照片雜湊、dry-run、receipt、精確前後 manifest、退役及最終回讀。修改前檔案另保全於專案外 `<USERPROFILE>/.codex/visualizations/2026/10/06/01a11057-de14-79b0-b43a-afa645a67c8c/tooling-retirement-before-20261007/`。

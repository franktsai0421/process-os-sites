# Round 5 隔離 fixture 回讀範圍與等價核對

最後小資料五對的 `paired-review-final/baseline-3.json` 在 saved-reload 與圖片完成後，下一次 host-side `fixture.readAuthoring()` 發生 `fetch failed`。當時四個完整 run 已 PASS、該 run 沒有 page error，但這次持久化回讀沒有完成，原批次仍為 FAIL，不以畫面或 POST 成功代替回讀通過。stack 指向 undici／Miniflare worker MessagePort，尚不足以證明網路／橋接失敗的完整觸發原因；沒有盲目重試或修改相依套件。

此次只修改 `tests/process-platform-round5-fixture.mjs` 的回讀路徑：D1 讀取 `shared_state.values`，使用 fixture 原已取得的 R2 bucket，呼叫 `decodeRecordValues(bucket, manifest, {keys:['processAuthoringControl']})`，再解析 `decoded.values.processAuthoringControl`。未設定 `deferHistory`、`deferDependencyHistory`、`effectiveOnly` 或 `modelKey`；working、saved、saves、cases、active、versions／封存及引用 body 仍完整展開並核對原雜湊。只是停止為製程斷言解碼不使用的其他模組，不是整個資料庫完整性驗證。

回讀失敗會附上 `d1-select`／`r2-handle`／`decode` 階段、遞迴 cause／AggregateError errors 及標準錯誤欄位與 stack，外層 Error 仍保留原 cause。不序列化任意 request 或憑證物件。沒有增加 retry、移除原 scenario 斷言或改動產品 build。它減少不必要的 host bridge 讀取；尚未證明能根除所有 Miniflare 橋接中斷。

等價驗證使用新增 `tests/process-platform-round5-readback-equivalence.mjs`，在同一隔離 Worker 的初始狀態，以及原完整 native scenario 每次持久化回讀時，先比較舊 `JSON.parse((await fixture.readValues()).processAuthoringControl)` 與新 reader 的全部 JSON，再保留既有斷言。候選 build `c0a5d14599fa5a9f6a2309dac43148201d248f7439a528300da5954d59b02e49`、fixture hash `65fe42ffbc8f1d0e10da0c0bd1bb3c952817369a21379955848db9549ee3fe60` 的結果：

- 全部 **17 次 JSON deepEqual** 成功：初始一次，加原 scenario 的 16 次持久回讀；沒有未展開的 `__immutableBody`。
- 原生 scenario **42 邊界 PASS、18 checks PASS、14 次唯一 ACK、0 page errors**。18 checks 包含 16 次回讀，另加 effective hash 與唯一寫入兩項。
- 比較涵蓋 Save、Save 後 working 差異、撤回、退回、再送、核准、全部三個案件快照與舊 superseded 版本；未以只比較目前 working 取代歷史核對。

原始功能資料在 `.sites-runtime/process-platform-round5/readback-equivalence-final/`。該次外層 runner 在所有比較及 scenario 通過後，因新 wrapper 把預期比較數誤寫為 19 而 FAIL；沒有把 exit1 改稱 exit0。已修正未來 runner 為 17，並離線驗證原始資料的全部邊界、17 次成功比較、16 次回讀、18 checks、三案結果及 14 次寫入，另存 `verified-equivalence.json`，狀態為 **VERIFIED_OFFLINE_AFTER_COUNT_FIX**。未重跑或拼接速度樣本。

更早兩份失敗也保留：`readback-equivalence/` 缺少必要 `PROCESS_PROGRAM_COMMIT`，尚未建立 Worker；`readback-equivalence-accepted/` 是新 fixture 漏取 decoder `.values` 的錯誤，初始 decode 即被測試攔下、未進瀏覽器，已修正。兩項均為測試程式問題，不標成產品失敗或通過。

限定只讀複核與 scoped lint／diff check PASS。fixture SHA-256 為 `64fd0f088367183b455b05b3995fd091841c212f9d57f4731f82604a4c4ee069`；等價 harness 為 `1f259dd5f12431a1f0f9e2ee1f25f79ec10d988a39248e3dccd8c90935d3c26a`。可重現命令：

```bash
PROCESS_PROGRAM_COMMIT=ca6647977a8680038444ce2c1ba4e80f2343cd0a \
ROUND5_EQUIVALENCE_FOLDER=.sites-runtime/process-platform-round5/readback-equivalence-new \
node tests/process-platform-round5-readback-equivalence.mjs
```

這是功能等價證據，**不作速度改善表**。持久化核對位於 UI stopwatch 之外；後續正式重跑仍須兩版使用相同新 reader、全新完整五對、獨立目錄。先前 100／500 項與 bf47 原生離頁結果保持原版本／原 harness 記錄，不由此補標重新執行。

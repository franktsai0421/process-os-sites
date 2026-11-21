# 例行 FQC／IQC 原始碼審查

本工具為例行檢查範圍內的 Git 提交產生核對資料，並唯讀查證 GitHub 上的獨立核准。工具支援個人儲存庫，由儲存庫本人審查另一位提交者的簽署提交。已核准的歷史來源、固定雜湊、既有來源驗證與 CI 維持原有行為。工具輸出的 JSON 不會被任何來源測試或 CI 套用。

## 在可信的工作副本執行

候選必須經正式披露審查才可上傳至 GitHub。這個程序不能解除拒絕上傳的決定。若在公開之前審查，先以核准的私人方式提供差異與測試結果。比對資料只列固定的例行檢查檔案路徑與 Git 物件摘要，仍須依適用的分享權限處理。

1. 用已合併且可信的程式版本執行腳本。從維護者的乾淨 clone 取得 `main` 與待審的實際 Git 物件，輸入 GitHub PR 顯示的完整 base 和 head。工具要求 head 包含該 base。工作樹檔案不參與，也無須 checkout 或執行候選程式。指令中的 `OWNER/REPO` 與其他參數由維護者取自實際目標。
2. 執行：

   ```sh
   node scripts/routine-source-review.cjs evidence OWNER/REPO PR_NUMBER BASE_SHA HEAD_SHA
   ```

   結果列出固定範圍內各變更檔案的路徑、前後 Git blob、模式，以及以原始 bytes 計算的 SHA-256。核對實際 diff 與驗證結果，包括範圍以外的共同殼層或測試依賴。輸出的 `challenge` 綁定儲存庫、PR、base、head 與上述每筆資料。新的 base、head 或內容都要重新取證。
3. PR 由另一位獨立的人建立，所有 PR 提交須由該作者使用自己已驗證的 GitHub 身分簽署。工具拒絕無法對應作者、共同撰寫、由審查者提交，以及無法確認完整提交清單的 PR。GitHub 可以驗證簽署與連結帳號。審查人也須確認實際作者與自己互相獨立。
4. 完成審查後，由儲存庫擁有人親自在 GitHub 提交 **Approve**，在核准文字中獨立一行貼上完整的 `Routine source review SHA-256 …`。不使用機器人、代審或共用帳號。如果擁有人是 PR 作者，目前工具拒絕此 PR，需走另行審查的多維護者制度。一般留言、空白核准或核准其他版本都不能替代本次核准。
5. 執行：

   ```sh
   node scripts/routine-source-review.cjs verify OWNER/REPO PR_NUMBER BASE_SHA HEAD_SHA
   ```

   指令只向公開 GitHub API 做唯讀查詢，無須權杖。它查證目前 PR、簽署提交、擁有人和該 PR 上的核准。舊 head 的核准、最新要求修改或被撤銷的核准、比對期間改變的證據、失敗的 API 查詢，都會中止。成功僅表示當時查到符合條件的 GitHub 審查紀錄。它不能保證此後的審查狀態、證明誰實際操作帳號、發佈資料，或讓來源 CI 接受新的檔案內容。

## 啟用強制合併關卡的前提

本提交沒有安裝 GitHub workflow 或變更儲存庫設定。若日後要把流程設為必要檢查，先由有權的維護者確認正式設定與能在測試儲存庫強制執行的結果。

- 透過 GitHub 的受保護目標分支或 ruleset 要求獨立的人審，推送後失效或重新確認核准，並保留既有必要 CI。追查管理員、App 與分支的 bypass 設定，確保不可用來避開本檢查。不要把 `CODEOWNERS` 檔案當作已啟用的設定。
- 需要能從受保護來源執行的驗證者，並限制必要狀態只能由該可信來源發布。若是 GitHub App，唯讀 GitHub PR／內容權限及寫入專用狀態的權限只由維護者控管。PR 候選、其 workflow、留言或資料檔不能提供審查者身分、改寫驗證器，或偽造通過狀態。驗證者發布成功狀態或合併前須重新核對 head、base 與最新審查，並由 GitHub 在合併時保護最新版狀態。
- 在拋棄式儲存庫驗證實際獨立人審能通過，以及無審查、自己審查、變更後沿用審查、審查被撤回和假的狀態來源均阻擋。模擬測試不能證明這些設定已生效。現有環境設定未在這次採用或核實。
- 真正變更來源驗證的接受範圍需要獨立、受保護的程式審查。必須保留原公開前身與歷史負例，保留拒絕未授權、混入其他檔案或內容不符的行為。候選的 manifest、base/head、甚至本工具的輸出都不能自行批准其內容。

參考 GitHub 文件

- [Pull request reviews REST API](https://docs.github.com/en/rest/pulls/reviews#list-reviews-for-a-pull-request)
- [Displaying verification for all of your commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)
- [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

## 合成回歸及目前限制

```sh
node --test tests/routine-source-review.test.cjs
node --test --test-concurrency=1 tests/accounts-process-integration-source.test.mjs tests/account-page-source-proof.test.cjs tests/routine-fqc-source-contract.test.cjs tests/source-normalization-cache.test.cjs
```

工具覆蓋固定的例行 FQC／IQC 路由、模組與前端檔案。共用 shell、其他模組、CI 設定及歷史來源合約本身仍須各自的審查。對受保護的實際 GitHub 設定、新的獨立人審事件與必要狀態來源的驗證，須在啟用前另行完成。

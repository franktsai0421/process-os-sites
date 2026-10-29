# 共用入口整合核對 — CLOUD 29102026

這是整合審查資料，不是已合併或發布的程式。只用 `git merge-tree` 建立暫存 Git tree、比較內容，沒有把其他任務程式合併到流程／照片分支。

|固定比較對象|commit|結果|
|---|---|---|
|開始時／本輪核對 main|2cac307f29b8017a2bb6dc5229d47720f2deab33|沒有假定等於既有 Site 版本|
|權限 cloud/users-permissions-29102026|1f88a7e24936fa63b387eb40637e32aa0d892c6d|程式可自動合併；衝突為 CHANGELOG、RUNTIME、HANDOFF|
|小幫手 codex/web-feedback-helper-20261029|2b05c6fc12d4fa8695e726c592ea6f405adb35ab|index 資產標記及 CHANGELOG、HANDOFF 衝突|

本次新增的 master-data.js、master-review.js、bom-workspace.js 在上述兩個固定分支沒有同檔變更；原警告已具體縮小為共用 index 與交接文件。照片與流程兩候選原有 app.js、process-equipment.js、index.html 重疊仍須按區塊合併。

[candidate-index.patch](candidate-index.patch) 是套用於流程＋照片獨立預覽的最小入口方案，保留 flowreview1、photo2、預覽照片／設備標記，加入 user-access-initial-read、更新權限與小幫手資產標記。`git apply --check` 通過；沒有遺失既有資產，詳細值見 [checks.json](checks.json)。補丁不能單獨套到正式站；它需要相對應分支的 JS/CSS 程式一併在整合候選中存在。基準 index 的 SHA-256 已記錄，後續任務改版需重新比對。

文件衝突處理：保留三任務各自最新區段及連結，去除重複的共同祖先段落；不得以 ours/theirs 整份覆蓋。這些候選尚未在含權限及小幫手新程式的四任務組合上執行瀏覽器測試，不能把入口靜態檢查當成四任務端到端通過。流程＋照片本身的隔離互動驗收另見兩份模組報告。

不變：資料庫、附件、權限管理介面、共用草稿協定、審核資格與自審限制。最終 dot 核對及 Frank 合併決定仍保留；本任務未 merge／auto-merge／發布。

最後已用預覽產品 commit `642d4defc8057c5d96e902070e39a6181a1afc17` 重新執行 merge-tree 比對；照片組成 `88ccd815ff341d80e23b573eea6c8016a93a430c`，衝突範圍未增加。入口補丁仍通過 apply check，checks 記錄最終 index 雜湊。

離開提醒補驗後，已更新至預覽 `b307b8d`（流程 `72e6de9`＋照片 `88ccd81`）重新核對同一組固定分支；入口保留 flowleave1。最新 patch apply check 通過，未合併其他任務程式。

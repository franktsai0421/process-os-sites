# #121 source-proof 計算成本修復

## 根因與範圍

已發布來源 ea137c7dd8d608d216d45ab29b033fc5f782ff5d 的 Quality C job
[43902009304 / 133420791860](https://github.com/franktsai0421/process-os-sites/actions/runs/43902009304/job/133420791860)
由 GitHub annotation 明確記錄超過 30m0s 上限；並非通過。來源步驟取消後，隔離與導航兩組被跳過。
原 job 上限及全部既有命令維持原樣，不以延長 timeout 或縮減 assertions 解決。

同一獲准 tree c8d9963036a460ac103c48fbc5ab8320a2b9f066 的舊十檔來源補跑已正式完成：
161 PASS、0 FAIL／cancel／skip、exit 0；UTC 15:56:27–16:32:04，2137 秒。
這補足本機舊紀錄無終局的缺口，不能代替取消的完整 GitHub job。

其中 FQC main-parent 案例耗時 813594ms。獨立 profile 對相同 253824 bytes 的 FQC 來源執行
一次真實父版還原與兩次原變造拒絕，觸發 inventory-quality.projectKnown 1913 次、
account-outcome.projectKnown 871 次：歷史 adapter 多層組合，反覆對相同內容正規化／SHA。
這是測試用來源證明的 CPU 成本，不是 D1／R2 或實站 workflow 的速度成果。

## 最小修復與保護

僅 inventory-quality source-proof helper 採用有界正規化／digest 快取。
每次命中都以 Buffer.equals 比較私有原始 snapshot；不是只按 Buffer 指標判斷。
快取最多四個原始輸入，每個 <=1MiB；大型或 SharedArrayBuffer 輸入完整走未快取轉換，
不是資料或驗證限制。快取 normalized bytes 的返回值為複本，呼叫者不能污染快取。
無效 UTF8、LF／CRLF／mixed EOL 仍使用原本 toString／replaceAll 的完整語意。

快取沒有保存投影結果、權限或成功判斷。所有還原 spans、normalized SHA、raw parent SHA、
path／target／raw Buffer 及原負例均照常驗證。原始 JSON manifests、產品 app/lib/public、
套件鎖檔、Quality C workflow 與 30 分鐘上限保持 byte-identical。
新增單元測試只追加到 Inventory workflow；不刪改任何原測試。

既有歷史交接／changelog 亦受來源 manifests 保護，本次不修改它們；本文件與 PR 紀錄保存此批
測試基礎設施修復，避免為了更新說明而重寫既有 manifest。獨立 IQC 候選不在此批。

## 同條件量測與重現

Node v24.22.1、同一 Linux Dot。基準是真實 ea137 source-only archive；同一 runner 指向兩個 root，
每 arm fresh Node process，三對交錯 before/after，不丟棄 warmup。
所有臂的父版輸出 SHA 及原 projectKnown 呼叫數完全相同；raw profiles 保存於 [paired.json](paired.json)。
profile 包含輕量函式計數包裝，巢狀 inclusive times 不可加總。

| 同一操作 | 前→後三次中位數 ms |
| --- | ---: |
| 已知來源完整還原 | 1444 → 308 |
| 變造來源 restore 拒絕 | 1110 → 271 |
| 變造來源 admission 拒絕 | 1063 → 247 |

```bash
mkdir /tmp/proof-before
git archive ea137c7dd8d608d216d45ab29b033fc5f782ff5d | tar -x -C /tmp/proof-before
python scripts/compare-source-proof-cost.py /tmp/proof-before /tmp/proof-paired.json
```

原 35 分鐘全組時間是一次完整本機執行，不是 profile 三對樣本；不把兩種數據混算。
修復後原 Quality C 三個命令均完成，終局結果如下；與舊十檔161案例的整組時間不是相同命令集合，不混作前後時間比例。

## 防回歸與已知失敗

新五項測試涵蓋相同內容不同 Buffer、原 Buffer／slice alias 變造、返回 bytes 污染、LRU 淘汰、
大型輸入、shared backing store、無效 UTF8、LF/CRLF/mixed EOL，以及真正 ea137 舊 helper 的
全部三父版代表檔等價／warm-cache mutation 拒絕。所有原 script JSON manifest 逐 bytes 核對，
並驗證所有產品來源及套件未變、IQC helper 不存在。

初版新測試讀取超過 1MiB 的原 manifest 時遇 child_process ENOBUFS（4 PASS／1 讀取失敗）；
改為完整 stream 讀取再逐 bytes 比較後 5/5 PASS，未截斷內容、未增加 timeout 或改 expected。
執行環境曾短暫 transport disconnected；同工具唯讀核對隨即恢復，未重連受限中控連接器。

## 修復後完整退出結果

驗證檢查點 bcf49fe119070c8e17f8fb71b621e38ca91f5e38，tree b47af6b61dc3bb70827ff6384d0e1442bdf422bb。
之後僅整理本文件與驗證回執，測試程式及快取 code 不變；最終新 head CI 仍須另行核對。
完整命令、commit/tree、退出碼及逐組摘要：[validation.json](validation.json)。

| 原命令／補測 | PASS | FAIL／cancel／skip | exit | 秒 |
| --- | ---: | --- | ---: | ---: |
| Quality C 原來源七檔 | 116 | 0／0／0 | 0 | 577.20 |
| Quality C 原隔離四檔（舊job未跑） | 48 | 0／0／0 | 0 | 9.37 |
| Quality C 原導航／bundle四檔（舊job未跑） | 225 | 0／0／0 | 0 | 8.53 |
| 原十檔中未包含於上述七檔的六檔 | 73 | 0／0／0 | 0 | 19.33 |
| Inventory 原來源／權限集中 | 515 | 0／0／0 | 0 | 37.19 |
| 新快取防回歸 | 5 | 0／0／0 | 0 | 1.73 |

Quality C 三個原命令總計 595.10 秒（約9分55秒），所有命令／assertions與30分鐘上限不變。
原十檔的全部161案例由七檔命令中的四檔與六檔補測完整覆蓋，並逐檔驗證其測試程式仍與
原 ea137 bytes 相同；另外的28來源案例亦執行。各組存在重疊，不能加總宣稱獨立測試總數。

新增測試 fixture 曾因局部變數 module 觸發 Next lint；改名 cjs 後 lint／非增量TypeScript通過，
沒有停用 lint 規則或移除測試。相對 ea137 無任何既有JSON修改／刪除或產品來源變更。
獨立 IQC 候選、實站資料、帳號、權限、D1/R2、部署均未操作。

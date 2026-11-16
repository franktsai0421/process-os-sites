# 辦公室Chrome實測功能續修候選

來源：最新遠端main `a1775a8a342d58335edf96d199a9c42844227dc6`，GitHub已確認#123 merged。獨立clone／`fix/quality-office-fqc-ab-20261116`；不是速度PR，不合併或部署。無Diem、業務／正式資料、帳號／ACL、schema或migration操作。

| 觀察 | 查證與處置 | 必要驗證／限制 |
| --- | --- | --- |
| FQC新增未設定→按批次，AQL缺數值欄 | 現main已有#123預設子欄刷新，完整controller＋共用header隔離新增可立即顯示；舊回歸只測修改既有項目。本次補新增入口、真實markup預設、空AQL驗證及完成本地→一次Save。不重複改已正確的runtime | 中越文隔離回歸通過不代表Office實際載入相同程式；未核實當時部署commit。公開靜態GET403，未登入或讀業務API。原生不觸碰取樣select回歸須由CI執行 |
| A Save後B顯示尚未檢查、無錯誤碼 | 以真handler保存A，再增加合法B catalog而不建立B品質scope，重現空群組；這種情境沒有已存標準，不能推論資料被刪或讀取失敗。明示尚無版本／標準，已完成工作內容錯誤檢查則顯示0；失敗仍走既有錯誤／權限邊界 | 另驗既有B的錯誤碼、項目與版本不被A取代；不把實站B的空白斷言為正常，實站內容未讀 |
| B開始修改顯示Vundefined | `startLocal`建立RAM version但scope無open／active可繼承number，generic header直接前綴V。標記未持久化的本機version，只顯示本機草稿／尚未存取，不捏造伺服器number；真正Save仍由原handler分配 | Begin／filter前後DB revision與全部values完全相同、0新增POST；原生CI另驗B明確Save後取得真number |
| B最後保存時間沿A | 頁首以B群組version配全模組flow，A Save的全模組receipt被無標籤顯示。保留真全模組快照，明示全模組儲存者／時間，未存B不能顯示為已儲存 | 不改全模組Save／Submit規則。語言切換、A↔B、未存表單／snapshot與晚到B permission各有隔離回歸 |

共用VersionDraftUI僅新增可選version title／saved label與既有savedMetadata初次呈現；其他adapter的預設不變。AB本機unpersisted欄只在RAM版本上，不進後端、沒有更動stored內容。既有permissions、CAS、UNKNOWN／原收據、pending lock及整份Save／Submit路徑不改。

原歷史manifest／pins不修改。新exact office→#123 main逆向，以hash／固定offset／EOL範圍驗真Git bytes，串入既有quality root證明；未識別source不正規化成已知來源。JS cache只更新AB／C／共用header，FQC runtime與其tag、各CSS及其他模組維持原版。

本機native環境：Playwright標準headless-shell下載為空／截斷ZIP；system Chromium被Unix process-singleton socket sandbox拒絕，未繞過。新增390px／1280px中越文native tests留在原Equipment CI，不以合成DOM充當Chrome、實體手機／IME或實站驗收。最終lint／typecheck／build／回歸、遠端head及CI以交付紀錄為準；此文件不是發布授權。

補充已核實測試語意：Office B新群組明確Save後V1、重載保留；25組送審V2、撤回V3成功。本PR修初始化顯示，不聲稱B保存／送審／撤回失敗。另C第二輪送審與撤回皆HTTP200成功；僅觀察處理中按鈕仍可點，沒有已證實重複資料。

C處理中按鈕根因：writeShared原有同步busy鎖可擋第二次dispatch；但僅Save入口直接停用Save，已被共用header搬移的Submit沒有即時更新，Submit入口也未更新兩鍵。新增同一函式同步兩鍵disabled與aria-busy，並在共用header重掛／回執查詢開始／原owner finally依busy、UNKNOWN、未套用新輸入、草稿與原permission重新評估；不重新建表單、不重送、不清UNKNOWN。隔離實際C controller/client/header＋簽章handler覆蓋POST延遲、後續GET延遲、已寫入但回應丟失、GET原回執、送審取消與寫入前錯誤，中越文驗證兩鍵停用、重複Save/Submit零額外POST、輸入保留與安全恢復。原生390px／1280px另測真button搬移與click行為，CI結果須獨立核對。此為功能回饋，不宣稱實站速度提升。

#125首輪CI `13b836e` 的C原生local-browser在既有「舊Save回應晚於同transport重入」斷言失敗（run43823450717，script239）：新頁於UNKNOWN時正確停用，但原請求結束不會重畫新mount，造成新頁永久停用。修正為mount完成後只觀察同transport既有flush promise，在同mount／actor／epoch／delivery／client仍成立時重新依當前權限同步兩鍵；不讀取、不寫入、不清marker。新增兩語系真controller/handler重入回歸，原native斷言不改，失敗後未跑項須由新CI重跑。

首輪Equipment run43823450784：FQC新增預設AQL及AB初始化／明確Save／重載的390px中文、1280px越文4個原生案例通過；2個新增C案例於結束後enabled斷言失敗。查證為native測試port將簽章fixture的Origin http://fixture原樣送到synthetic.invalid，真handler依原same-origin規則拒403而非成功Save。修正port令Origin等於攔截請求origin，另斷言真POST必須200，再驗按鈕恢復；不改產品或伺服器Origin保護。新CI須確認修正後兩個C原生案例，舊4項不是新SHA全綠證據。

`2ec1a80` C local Save run43824791452已通過原script239重入斷言，於283舊測試按Save來查UNKNOWN而停止：新的明確UI會停用Save/Submit，並保留既有「查證操作結果」按鈕。調整原native測試使用真查證按鈕，新增UNKNOWN兩鍵停用、GET恢復後兩鍵可用斷言，原receipt marker／只有一次POST／保存內容與後續歷史／兩尺寸檢查全保留；不是把UNKNOWN當成功或移除測試。此為預期入口契約更新，產品不再改。

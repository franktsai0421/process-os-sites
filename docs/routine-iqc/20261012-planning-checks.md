# IQC規劃文件與3040開啟核對

日期：2026年10月12日。Task：以FQC續談包規劃IQC，列可沿用、批次抽樣差異及審核待決條件；只規劃，不實作。

Changed：新增[IQC規劃](IQC例行檢查規劃_20261012.md)，文件索引與HANDOFF增加Proposal入口，不改已確認主檔規格。保留其他工作區修改與checkpoint；分支codex/ipqc-ab-local，HEAD 8b182626085bb2aa1f3a216903c5b373ee82bc44。

| Tests | 結果 |
| --- | --- |
| 原FQC續談包21個列冊檔案SHA256 | PASS |
| 保存指南及IQC主檔規格對包內內容 | PASS，兩份與保存版相同；新共享文稿政策依目前規格另讀 |
| 新規劃相對連結及C01至C10 | PASS |
| 文件增量diff及其他原文保留 | PASS |
| git diff --check文件範圍 | PASS |
| 3040原隔離runtime與既有資料路徑檢查 | PASS，CheckOnly拒絕初始化；僅沿原3040啟動 |
| 3040 HTTP入口與實際畫面 | PASS，HTTP200，顯示品質系統登入頁；未代登入 |
| IQC功能、審核、抽樣計算、真實附件與實機 | NOT_RUN，本次是規劃 |
| 開啟中SQLite二進位雜湊／完整業務內容保全 | Not available。一般讀取遇鎖；共享唯讀重查見metadata三檔相同，但主DB雜湊與原WAL／SHM布局變動，不能以啟動前後檔案hash宣稱整庫內容一致。沒有還原、重設或以舊副本覆蓋 |

3040冷啟動沿既有隔離runtime，同命令且固定3040，PID13680。SQLite服務開檔與本機服務metadata屬正常啟動範圍；本次未呼叫任何IQC/FQC業務POST、登入、Save、Submit、Approve、Generate或新增DEMO。原FQC入口具有自動Generate，因此先在既有分頁切到品質總覽再開服務，最後停在登入頁。其他服務未啟停，不啟動已取消排程。

Documentation updated：規劃、本核對、HANDOFF及文件索引。資料模型影響：無；沒有新欄位、schema或migration。Material risks：批次身分、AQL方案、缺漏是否可送審、自審及放行仍未定案；不能直接複製FQC的樣品失敗聚合與理由例外，也不能把主檔「缺漏可送審」當批次接受政策。

修改前兩份入口文件保全於專案外TEMP/iqc-plan-20261012；原續談包保留。3040畫面證據在本對話visualizations的iqc-plan-20261012/3040-open.png。未commit、push、merge或部署。

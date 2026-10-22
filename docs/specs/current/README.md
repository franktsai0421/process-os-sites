# 現行正式規格入口

狀態：Current。2026-10-05 文件整理；本入口不表示功能或部署已驗收。

最新明確確認需求決定目標；程式／schema 證明現況；測試證據只涵蓋其日期、環境與案例。三者不相互冒充。沿用有效 KD 路徑，不為排版搬動全部規格。

| 範圍 | 正式來源 | 補充 |
| --- | --- | --- |
| 單一共享草稿／版本邊界 | [SHARED_DRAFT](SHARED_DRAFT.md) | 各模組決定其驗證與理由政策 |
| 整份文稿／權限／Local 3000 銜接 | [WHOLE_MODULE_DRAFT](WHOLE_MODULE_DRAFT.md) | 2026-10-07 最新確認；取代 AB 逐群組部分成功與舊維護限制 |
| 製程畫布／2、6、7 分頁／BOM 選取 | [PROCESS_EDITOR](PROCESS_EDITOR.md) | 2026-10-08 最新文字；C 編輯頁改查詢開關，舊關聯保留 |
| 網頁問題回報／案件／交接 ZIP | [WEB_FEEDBACK](WEB_FEEDBACK.md) | 2026-10-08 直接實作授權；僅 3020 opt-in，驗收限制見交付 |
| 製程、連線、核准及下游 | [PROCESS_WORKFLOW](PROCESS_WORKFLOW.md) | [製程現況](../../../AI_CONTEXT/modules/PROCESS.md) |
| FQC | [FQC_SPEC](../../../KD/FQC_SPEC.md) | 異常報告為歷史來源稽核 |
| 例行檢查／FQC 執行閉環 | [ROUTINE_FQC](ROUTINE_FQC.md) | 2026-10-07 V2 最新單一規格；原 FQC 標準主檔規格仍負責主檔 |
| IQC | [最終規格](../../../KD/IQC/IQC_UI_最終規格與差異.md) | 圖片在 iqc_ui_final；不可重灌既有資料 |
| IPQC-AB/C 送審 | [2026-10-06 最新送審政策](IPQC_POLICY.md) | 三項非阻擋待補；其他驗證保留 |
| IPQC-AB | [模組路由](../../../KD/IPQC-AB/README_先讀.md) | 01 業務；02 匯入；03 未決；04 UI；08 歷史匯入及還原 |
| IPQC-C | [模組路由](../../../KD/IPQC-C/README.md) | 按 UI／資料／建置任務分讀 |
| 品質設備 | [QUALITY_EQUIPMENT](QUALITY_EQUIPMENT.md) | [來源稽核](../../../KD/ROUTINE/IMPORT_AUDIT.md) |
| 模具設備 | [TOOLING](TOOLING.md) | 20261006 新版 Excel、3030 隔離匯入與共用草稿 |
| 群組預設路線／產品例外 | [GROUP_ROUTES](GROUP_ROUTES.md) | AB/C、IPQC工段、畫布排列與相容投影 |
| 帳號／角色／個人權限 | [PERMISSIONS_ADMIN](PERMISSIONS_ADMIN.md) | 2026-10-10 ZIP確認需求；151有效格，真實移轉未套用 |
| BOM／主資料 | [BOM Digiwin 重建](BOM_REBUILD.md)、[主資料](../../../MASTER_ADMIN_UI.zh-TW.md) | 翻譯是閱讀版本，不另定業務規則 |

實作：[AI_CONTEXT](../../../AI_CONTEXT/AI_CONTEXT.md)；持久化：[DATA_MODEL](../../../AI_CONTEXT/DATA_MODEL.md)；進度：[HANDOFF](../../../HANDOFF.md)。未解衝突見[文件索引](../../DOCUMENTATION_INDEX.md)，不得自行用程式取代確認需求。部署、協作及工程規則由根目錄 DEPLOYMENT、EMPLOYEE_WORKFLOW、AGENTS 負責。

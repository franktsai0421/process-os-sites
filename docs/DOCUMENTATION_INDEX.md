# 專案文件索引與整理結果

2026-10-05。唯一repository基準：<WORKSPACE>/中控系統，codex/ipqc-ab-local，HEAD 2685b4044141ee3abc328cd4e5202c42eee36864。起始已有大量功能及3份AI_CONTEXT未提交修改；本次保全，不切換checkout／branch，不以GitHubmain替代。

## 2026-10-10 權限目前來源

[PERMISSIONS_ADMIN](specs/current/PERMISSIONS_ADMIN.md) 為已確認需求；[MASTER_DATA實作](../AI_CONTEXT/modules/MASTER_DATA.md)及[CORE欄位](../AI_CONTEXT/models/CORE.md)為候選現況，[隔離驗證](local-integration/20261010-permissions-admin.md)保留測試與未驗界線。舊ADMIN全權、id admin強制角色、line AUTH或「未開始權限」文字由最新來源取代，不能由舊交接啟動發布。

## 範圍與來源分工

起始59份專案自行維護MD；刪除1份完全相同副本，新增28份入口／拆分／archive，整理後86份。下表涵蓋全部原文件及新增文件；Deleted行保留還原資訊。只發現根AGENTS，範圍內無子目錄AGENTS；未移動作用範圍。

排除依賴、工具cache、建置產物、backup／診斷／輸出：node_modules、.git、.next、.vinext、dist/build、.wrangler、.openai、.local-backups、outputs、diagnostics等；work及.worktrees為舊checkout、rehearsal／生成證據，未作repository現況來源或修改。其他巢狀Git專案排除。未以日期或引用數推斷使用頻率。

[AGENTS](../AGENTS.md)管工程；[正式規格](specs/current/README.md)管確認需求；[AI_CONTEXT](../AI_CONTEXT/AI_CONTEXT.md)管實作；[DATA_MODEL](../AI_CONTEXT/DATA_MODEL.md)管實際資料；[HANDOFF](../HANDOFF.md)管目前階段。archive只供歷史，Deprecated表示不能當日常規格／操作授權，不否定原來源或測試證據。多語閱讀版保留，不另定規則。

整理方法參考[OpenAI官方文章](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)：按任務揭露文件、縮小常駐指令及明確自主邊界。它不是本專案業務規則或repository狀態來源。

## 2026年10月8日FQC保存版

[FQC設計與審核條件](routine-fqc/FQC設計與審核條件_20261008.md)、[ChatGPT續談提示](routine-fqc/ChatGPT續談提示_20261008.md)及[續談包](routine-fqc/FQC續談包_20261008.zip)供後續IQC、模具檢查和校準差異討論。這是日期固定的保存摘要，正式需求仍以現行規格為準；驗證限制見[本輪報告](routine-fqc/20261008-plans-groups.md)。未開始三個新例行模組的實作。

## 2026年10月12日IQC規劃草案

[IQC例行檢查規劃](routine-iqc/IQC例行檢查規劃_20261012.md)列可沿用FQC的設計、批次抽樣差異與C01至C10審核／接受政策。狀態Proposal，等待使用者確認；未實作、不取代IQC主檔現行規格。

## 全文件結果

| 文件 | 用途 | 狀態 | 正式來源／替代 | 整理結果 |
| --- | --- | --- | --- | --- |
| [ROUTINE_FQC](specs/current/ROUTINE_FQC.md) | 例行FQC V2唯一正式規格 | Current / 2026-10-07 | 使用者V2交接包02，SHA一致 | [模型](../AI_CONTEXT/models/ROUTINE_FQC.md)、[驗收與本機銜接](routine-fqc/20261007-acceptance.md)分開維護 |
| [AGENTS.md](../AGENTS.md) | 工程入口與授權／驗證邊界 | Current | [AGENTS.md](../AGENTS.md) | 重寫精簡、按任務路由；保留安全、相容性、既有工作及PR規則 |
| [AI_CONTEXT/AI_CONTEXT.md](../AI_CONTEXT/AI_CONTEXT.md) | 實作現況路由 | Current | [AI_CONTEXT/AI_CONTEXT.md](../AI_CONTEXT/AI_CONTEXT.md) | 精簡入口；細節拆modules，原未提交內容完整歷史保存 |
| [AI_CONTEXT/CHANGELOG.md](../AI_CONTEXT/CHANGELOG.md) | 重要變更入口 | Current history router | [AI_CONTEXT/CHANGELOG.md](../AI_CONTEXT/CHANGELOG.md) | 原歷史全文保留archive；不日常載入105KB |
| [AI_CONTEXT/DATA_MODEL.md](../AI_CONTEXT/DATA_MODEL.md) | 實際schema與讀寫／欄位路由 | Current | [AI_CONTEXT/DATA_MODEL.md](../AI_CONTEXT/DATA_MODEL.md) | 拆models；核對DB／allowlist／專用control責任，不改模型 |
| [AI_CONTEXT/GITHUB_DATA_READINESS.md](../AI_CONTEXT/GITHUB_DATA_READINESS.md) | 2026-09-17上傳前驗證 | Historical / Deprecated current guidance | [AI_CONTEXT/AI_CONTEXT.md](../AI_CONTEXT/AI_CONTEXT.md) | 原位保留證據，加環境／日期標記；不再要求新Git歷史 |
| [AI_CONTEXT/LOCAL_DATA_COLLABORATION.md](../AI_CONTEXT/LOCAL_DATA_COLLABORATION.md) | Local Canonical程序與同步保護 | Current | [AI_CONTEXT/LOCAL_DATA_COLLABORATION.md](../AI_CONTEXT/LOCAL_DATA_COLLABORATION.md) | 保留baseline三方合併；部署清單改引用，移除品質無UI過時說法 |
| [AI_CONTEXT/LOCAL_DEMO_VERIFICATION.md](../AI_CONTEXT/LOCAL_DEMO_VERIFICATION.md) | 2026-09-16demo／資料保護驗證 | Historical / Deprecated current guidance | [AI_CONTEXT/modules/RUNTIME.md](../AI_CONTEXT/modules/RUNTIME.md) | 保留原驗證、migration與digest，不當目前checkout狀態 |
| [AI_CONTEXT/SECURITY_REVIEW.md](../AI_CONTEXT/SECURITY_REVIEW.md) | 歷史安全／pnpm評估 | Historical / Deprecated current guidance | [AI_CONTEXT/modules/RUNTIME.md](../AI_CONTEXT/modules/RUNTIME.md) | 保留風險與舊audit；不宣稱當前npm／依賴已通過 |
| [BACKUP_AND_RESTORE.en.md](../BACKUP_AND_RESTORE.en.md) | 備份／還原安全閱讀版本 | Current | [BACKUP_AND_RESTORE.zh-TW.md](../BACKUP_AND_RESTORE.zh-TW.md) | 保留；正式維護來源與翻譯責任標明，未刪restore資訊 |
| [BACKUP_AND_RESTORE.md](../BACKUP_AND_RESTORE.md) | 備份／還原安全閱讀版本 | Current | [BACKUP_AND_RESTORE.zh-TW.md](../BACKUP_AND_RESTORE.zh-TW.md) | 保留；正式維護來源與翻譯責任標明，未刪restore資訊 |
| [BACKUP_AND_RESTORE.zh-TW.md](../BACKUP_AND_RESTORE.zh-TW.md) | 備份／還原安全閱讀版本 | Current | [BACKUP_AND_RESTORE.zh-TW.md](../BACKUP_AND_RESTORE.zh-TW.md) | 保留；正式維護來源與翻譯責任標明，未刪restore資訊 |
| [BOM_SEARCH.en.md](../BOM_SEARCH.en.md) | BOM搜尋與子樹規格閱讀版本 | Current | [BOM_SEARCH.zh-TW.md](../BOM_SEARCH.zh-TW.md) | 保留有用小型規格／fixture入口，標明單一維護來源 |
| [BOM_SEARCH.md](../BOM_SEARCH.md) | BOM搜尋與子樹規格閱讀版本 | Current | [BOM_SEARCH.zh-TW.md](../BOM_SEARCH.zh-TW.md) | 保留有用小型規格／fixture入口，標明單一維護來源 |
| [BOM_SEARCH.zh-TW.md](../BOM_SEARCH.zh-TW.md) | BOM搜尋與子樹規格閱讀版本 | Current | [BOM_SEARCH.zh-TW.md](../BOM_SEARCH.zh-TW.md) | 保留有用小型規格／fixture入口，標明單一維護來源 |
| [COLLABORATION.en.md](../COLLABORATION.en.md) | 協作語言入口 | Current router | [EMPLOYEE_WORKFLOW.zh-TW.md](../EMPLOYEE_WORKFLOW.zh-TW.md) | 整合Git程序至員工流程，資料程序至Local協作 |
| [COLLABORATION.md](../COLLABORATION.md) | 協作語言入口 | Current router | [EMPLOYEE_WORKFLOW.zh-TW.md](../EMPLOYEE_WORKFLOW.zh-TW.md) | 整合Git程序至員工流程，資料程序至Local協作 |
| [COLLABORATION.zh-TW.md](../COLLABORATION.zh-TW.md) | 協作語言入口 | Current router | [EMPLOYEE_WORKFLOW.zh-TW.md](../EMPLOYEE_WORKFLOW.zh-TW.md) | 整合Git程序至員工流程，資料程序至Local協作 |
| [DEPLOYMENT.md](../DEPLOYMENT.md) | 完整與保留資料維護release／恢復 | Current operational procedure | [DEPLOYMENT.md](../DEPLOYMENT.md) | 保留；兩條release路徑已有區分，重要安全及Site目標不刪 |
| [EMPLOYEE_WORKFLOW.en.md](../EMPLOYEE_WORKFLOW.en.md) | 員工Git／PR操作閱讀版本 | Current | [EMPLOYEE_WORKFLOW.zh-TW.md](../EMPLOYEE_WORKFLOW.zh-TW.md) | 保留實用命令；圖片政策改引用，不強制文件任務export或全部tests |
| [EMPLOYEE_WORKFLOW.md](../EMPLOYEE_WORKFLOW.md) | 員工Git／PR操作閱讀版本 | Current | [EMPLOYEE_WORKFLOW.zh-TW.md](../EMPLOYEE_WORKFLOW.zh-TW.md) | 保留實用命令；圖片政策改引用，不強制文件任務export或全部tests |
| [EMPLOYEE_WORKFLOW.zh-TW.md](../EMPLOYEE_WORKFLOW.zh-TW.md) | 員工Git／PR操作閱讀版本 | Current | [EMPLOYEE_WORKFLOW.zh-TW.md](../EMPLOYEE_WORKFLOW.zh-TW.md) | 保留實用命令；圖片政策改引用，不強制文件任務export或全部tests |
| [KD/FQC_HANDOFF.md](../KD/FQC_HANDOFF.md) | FQC前置分析／交接 | Deprecated router | [HANDOFF.md](../HANDOFF.md) | 全文歸檔；避免舊branch／HEAD與推測當現況 |
| [KD/FQC_PROGRESS.md](../KD/FQC_PROGRESS.md) | FQC歷史進度／測試 | Deprecated router | [HANDOFF.md](../HANDOFF.md) | 全文歸檔含事故與資料疑點；不重複維護進度 |
| [KD/FQC_SPEC.md](../KD/FQC_SPEC.md) | FQC確認規格 | Current, conflicts recorded | [KD/FQC_SPEC.md](../KD/FQC_SPEC.md) | 整合最新規則，清除ExcelUI、多週期與舊理由矛盾；原REQ全文歸檔 |
| [KD/IPQC-AB/01_規格與資料結構.md](../KD/IPQC-AB/01_規格與資料結構.md) | AB品質業務與歸屬 | Current | [KD/IPQC-AB/01_規格與資料結構.md](../KD/IPQC-AB/01_規格與資料結構.md) | 保留；獨有矩陣、覆蓋、目視／設備及正式／測試規則仍有效 |
| [KD/IPQC-AB/02_欄位對應與匯入.md](../KD/IPQC-AB/02_欄位對應與匯入.md) | 固定來源解析／增量保護 | Current import procedure | [KD/IPQC-AB/02_欄位對應與匯入.md](../KD/IPQC-AB/02_欄位對應與匯入.md) | 保留人工／照片／baseline保障；去除指定AG角色的工作拆分 |
| [KD/IPQC-AB/03_資料核對與待處理.md](../KD/IPQC-AB/03_資料核對與待處理.md) | 2026-09-30來源差異／衝突 | Historical source audit + unresolved source decisions | [KD/IPQC-AB/03_資料核對與待處理.md](../KD/IPQC-AB/03_資料核對與待處理.md) | 保留來源排除、4組衝突及待映射；標示歷史數量 |
| [KD/IPQC-AB/04_UI與驗收.md](../KD/IPQC-AB/04_UI與驗收.md) | AB品質UI與模組驗收 | Current | [KD/IPQC-AB/04_UI與驗收.md](../KD/IPQC-AB/04_UI與驗收.md) | 保留；模組驗收清單是適用任務參考，不每次強制全跑 |
| [KD/IPQC-AB/04_歷史文件_不可作為匯入依據/IPQC_AB_AG_掃描提示.md](../KD/IPQC-AB/04_歷史文件_不可作為匯入依據/IPQC_AB_AG_掃描提示.md) | 舊來源包決策／討論／prompt | Deprecated historical package | [KD/IPQC-AB/README_先讀.md](../KD/IPQC-AB/README_先讀.md) | 原位歸檔標記；保留獨有討論與來源背景，不作匯入依據 |
| [KD/IPQC-AB/04_歷史文件_不可作為匯入依據/IPQC_AB_Codex_執行提示.md](../KD/IPQC-AB/04_歷史文件_不可作為匯入依據/IPQC_AB_Codex_執行提示.md) | 舊來源包決策／討論／prompt | Deprecated historical package | [KD/IPQC-AB/README_先讀.md](../KD/IPQC-AB/README_先讀.md) | 原位歸檔標記；保留獨有討論與來源背景，不作匯入依據 |
| [KD/IPQC-AB/04_歷史文件_不可作為匯入依據/IPQC_AB_實作與匯入交接.md](../KD/IPQC-AB/04_歷史文件_不可作為匯入依據/IPQC_AB_實作與匯入交接.md) | 舊來源包決策／討論／prompt | Deprecated historical package | [KD/IPQC-AB/README_先讀.md](../KD/IPQC-AB/README_先讀.md) | 原位歸檔標記；保留獨有討論與來源背景，不作匯入依據 |
| [KD/IPQC-AB/04_歷史文件_不可作為匯入依據/IPQC_AB_討論框架.md](../KD/IPQC-AB/04_歷史文件_不可作為匯入依據/IPQC_AB_討論框架.md) | 舊來源包決策／討論／prompt | Deprecated historical package | [KD/IPQC-AB/README_先讀.md](../KD/IPQC-AB/README_先讀.md) | 原位歸檔標記；保留獨有討論與來源背景，不作匯入依據 |
| [KD/IPQC-AB/04_歷史文件_不可作為匯入依據/README_先讀.md](../KD/IPQC-AB/04_歷史文件_不可作為匯入依據/README_先讀.md) | 舊來源包決策／討論／prompt | Deprecated historical package | [KD/IPQC-AB/README_先讀.md](../KD/IPQC-AB/README_先讀.md) | 原位歸檔標記；保留獨有討論與來源背景，不作匯入依據 |
| [KD/IPQC-AB/04_歷史文件_不可作為匯入依據/歷史檔案說明.md](../KD/IPQC-AB/04_歷史文件_不可作為匯入依據/歷史檔案說明.md) | 舊來源包決策／討論／prompt | Deprecated historical package | [KD/IPQC-AB/README_先讀.md](../KD/IPQC-AB/README_先讀.md) | 原位歸檔標記；保留獨有討論與來源背景，不作匯入依據 |
| [KD/IPQC-AB/05_AG_只讀掃描提示.md](../KD/IPQC-AB/05_AG_只讀掃描提示.md) | 舊唯讀掃描prompt | Deprecated router | [KD/IPQC-AB/02_欄位對應與匯入.md](../KD/IPQC-AB/02_欄位對應與匯入.md) | 全文歸檔避免舊任務限制變永久指令；留路徑供來源包追溯 |
| [KD/IPQC-AB/06_Codex_實作提示.md](../KD/IPQC-AB/06_Codex_實作提示.md) | 舊實作／匯入prompt | Deprecated router | [KD/IPQC-AB/02_欄位對應與匯入.md](../KD/IPQC-AB/02_欄位對應與匯入.md) | 全文歸檔；不把完成批次重當新任務 |
| [KD/IPQC-AB/07_最新決定_初次匯入與檢具.md](../KD/IPQC-AB/07_最新決定_初次匯入與檢具.md) | 2026-09-30來源確認決定 | Current source decision record | [KD/IPQC-AB/02_欄位對應與匯入.md](../KD/IPQC-AB/02_欄位對應與匯入.md) | 保留日期及獨有8個G7T來源對照；完整匯入程序由02維護 |
| [KD/IPQC-AB/08_Local重新匯入結果.md](../KD/IPQC-AB/08_Local重新匯入結果.md) | Local增量匯入／還原／驗證 | Historical verification and recovery evidence | [KD/IPQC-AB/08_Local重新匯入結果.md](../KD/IPQC-AB/08_Local重新匯入結果.md) | 保留完整備份位置／命令／結果；舊revision不能直接再套用 |
| [KD/IPQC-AB/README_先讀.md](../KD/IPQC-AB/README_先讀.md) | IPQC-AB按任務路由 | Current router | [KD/IPQC-AB/README_先讀.md](../KD/IPQC-AB/README_先讀.md) | 移除強制全包讀取；數量／結果引用03／08，標hash清單為舊包證據 |
| [KD/IPQC-C/IPQC-C_UI規格.md](../KD/IPQC-C/IPQC-C_UI規格.md) | C品質UI／雙語 | Current, legacy design deltas marked | [KD/IPQC-C/IPQC-C_UI規格.md](../KD/IPQC-C/IPQC-C_UI規格.md) | 共享草稿取代舊衝突；標示已移除欄位，原來源值保留 |
| [KD/IPQC-C/IPQC-C_資料結構.md](../KD/IPQC-C/IPQC-C_資料結構.md) | C來源歸屬／編號／CPK決定 | Current source relationships | [KD/IPQC-C/IPQC-C_資料結構.md](../KD/IPQC-C/IPQC-C_資料結構.md) | 共享草稿引用；實際serializer另由DATA_MODEL，不捏造schema |
| [KD/IPQC-C/IPQC-C_首次資料建置與驗收.md](../KD/IPQC-C/IPQC-C_首次資料建置與驗收.md) | 首次來源／映射／資料保護 | Current controlled initialization plan | [KD/IPQC-C/IPQC-C_首次資料建置與驗收.md](../KD/IPQC-C/IPQC-C_首次資料建置與驗收.md) | 保留源檔基線與保護，改shared-draft引用；不授權Production寫入 |
| [KD/IPQC-C/README.md](../KD/IPQC-C/README.md) | C品質模組路由 | Current router | [KD/IPQC-C/README.md](../KD/IPQC-C/README.md) | 去除解壓／全包必讀及尚未建置說法；數量保留來源基線 |
| [KD/IPQC-C/UI/畫面索引與雙語欄位.md](../KD/IPQC-C/UI/畫面索引與雙語欄位.md) | 19畫面／固定詞彙 | Reference design, partial deprecation | [KD/IPQC-C/IPQC-C_UI規格.md](../KD/IPQC-C/IPQC-C_UI規格.md) | 保留圖與詞彙；圖11及移除欄位標舊設計，修建置引用 |
| [KD/IPQC-C/給Codex的任務.md](../KD/IPQC-C/給Codex的任務.md) | 舊首次實作prompt | Deprecated router | [KD/IPQC-C/README.md](../KD/IPQC-C/README.md) | 全文歸檔；去除全量必讀與已過期任務口吻 |
| [KD/IQC/IQC_UI_最終規格與差異.md](../KD/IQC/IQC_UI_最終規格與差異.md) | IQC單一正式規格 | Current, conflicts recorded | [KD/IQC/IQC_UI_最終規格與差異.md](../KD/IQC/IQC_UI_最終規格與差異.md) | 移除過時匯入UI／implicit save；補圖路徑，收合差異列未決 |
| `KD/IQC/iqc_ui_final/IQC_UI_最終規格與差異.md` | IQC逐位元重複副本 | Deleted | [KD/IQC/IQC_UI_最終規格與差異.md](../KD/IQC/IQC_UI_最終規格與差異.md) | 無獨有資訊；無有效依賴；刪前專案外備份，詳下方還原 |
| [KD/ROUTINE/IMPORT_AUDIT.md](../KD/ROUTINE/IMPORT_AUDIT.md) | 來源設備／照片／疑點稽核 | Historical source audit | [KD/ROUTINE/IMPORT_AUDIT.md](../KD/ROUTINE/IMPORT_AUDIT.md) | 原位完整保留，加基線範圍，未擅自結案來源疑點 |
| [KD/ROUTINE/READ-ME.md](../KD/ROUTINE/READ-ME.md) | 品質設備入口 | Current router | [docs/specs/current/QUALITY_EQUIPMENT.md](specs/current/QUALITY_EQUIPMENT.md) | 原型交接全文歸檔，改規格／實作／來源稽核路由 |
| [KD/ROUTINE/equipment-d1-r2-plan.md](../KD/ROUTINE/equipment-d1-r2-plan.md) | 未採用設備SQL／binding提案 | Deprecated router | [AI_CONTEXT/DATA_MODEL.md](../AI_CONTEXT/DATA_MODEL.md) | 全文歸檔；EQUIPMENT_DB等不是實際資源，不據此migration |
| [KD/ROUTINE/equipment-review-workflow.md](../KD/ROUTINE/equipment-review-workflow.md) | 舊原型審核及FQC提案 | Deprecated router | [docs/specs/current/QUALITY_EQUIPMENT.md](specs/current/QUALITY_EQUIPMENT.md) | 全文歸檔，意見政策衝突列未決 |
| [KD/fqc-analysis/FQC_ANOMALY_REPORT.md](../KD/fqc-analysis/FQC_ANOMALY_REPORT.md) | 原Excel異常／來源分析 | Historical source audit | [KD/FQC_SPEC.md](../KD/FQC_SPEC.md) | 原位保留；基線與曾需決策非今日DB，不能因無引用刪除 |
| [MASTER_ADMIN_UI.en.md](../MASTER_ADMIN_UI.en.md) | 主資料／BOMUI閱讀版本 | Current | [MASTER_ADMIN_UI.zh-TW.md](../MASTER_ADMIN_UI.zh-TW.md) | 保留；標正式維護來源，V3與實際API見現況／模型 |
| [MASTER_ADMIN_UI.md](../MASTER_ADMIN_UI.md) | 主資料／BOMUI閱讀版本 | Current | [MASTER_ADMIN_UI.zh-TW.md](../MASTER_ADMIN_UI.zh-TW.md) | 保留；標正式維護來源，V3與實際API見現況／模型 |
| [MASTER_ADMIN_UI.zh-TW.md](../MASTER_ADMIN_UI.zh-TW.md) | 主資料／BOMUI閱讀版本 | Current | [MASTER_ADMIN_UI.zh-TW.md](../MASTER_ADMIN_UI.zh-TW.md) | 保留；標正式維護來源，V3與實際API見現況／模型 |
| [README.en.md](../README.en.md) | 專案入口及語言閱讀版本 | Current router | [README.zh-TW.md](../README.zh-TW.md) | 重写精簡；品質UI現況更新，移除重複程序與無關全量tests |
| [README.md](../README.md) | 專案入口及語言閱讀版本 | Current router | [README.zh-TW.md](../README.zh-TW.md) | 重写精簡；品質UI現況更新，移除重複程序與無關全量tests |
| [README.zh-TW.md](../README.zh-TW.md) | 專案入口及語言閱讀版本 | Current router | [README.zh-TW.md](../README.zh-TW.md) | 重写精簡；品質UI現況更新，移除重複程序與無關全量tests |
| [WORK_CHECKPOINT.md](../WORK_CHECKPOINT.md) | 舊進度入口 | Deprecated router | [HANDOFF.md](../HANDOFF.md) | 完整歷史歸檔；原路徑只引用目前交接 |
| [AI_CONTEXT/models/CANONICAL.md](../AI_CONTEXT/models/CANONICAL.md) | 按範圍實際欄位／讀寫關係 | Current source reference | [AI_CONTEXT/models/CANONICAL.md](../AI_CONTEXT/models/CANONICAL.md) | 由原DATA_MODEL拆分，schema及資料未改 |
| [AI_CONTEXT/models/CORE.md](../AI_CONTEXT/models/CORE.md) | 按範圍實際欄位／讀寫關係 | Current source reference | [AI_CONTEXT/models/CORE.md](../AI_CONTEXT/models/CORE.md) | 由原DATA_MODEL拆分，schema及資料未改 |
| [AI_CONTEXT/models/QUALITY.md](../AI_CONTEXT/models/QUALITY.md) | 按範圍實際欄位／讀寫關係 | Current source reference | [AI_CONTEXT/models/QUALITY.md](../AI_CONTEXT/models/QUALITY.md) | 由原DATA_MODEL拆分，schema及資料未改 |
| [AI_CONTEXT/models/V3.md](../AI_CONTEXT/models/V3.md) | 按範圍實際欄位／讀寫關係 | Current source reference | [AI_CONTEXT/models/V3.md](../AI_CONTEXT/models/V3.md) | 由原DATA_MODEL拆分，schema及資料未改 |
| [AI_CONTEXT/modules/MASTER_DATA.md](../AI_CONTEXT/modules/MASTER_DATA.md) | 按模組實作現況 | Current source notes | [AI_CONTEXT/modules/MASTER_DATA.md](../AI_CONTEXT/modules/MASTER_DATA.md) | 由原AI_CONTEXT拆分；保留現況細節與驗收限制 |
| [AI_CONTEXT/modules/PROCESS.md](../AI_CONTEXT/modules/PROCESS.md) | 按模組實作現況 | Current source notes | [AI_CONTEXT/modules/PROCESS.md](../AI_CONTEXT/modules/PROCESS.md) | 由原AI_CONTEXT拆分；保留現況細節與驗收限制 |
| [AI_CONTEXT/modules/QUALITY.md](../AI_CONTEXT/modules/QUALITY.md) | 按模組實作現況 | Current source notes | [AI_CONTEXT/modules/QUALITY.md](../AI_CONTEXT/modules/QUALITY.md) | 由原AI_CONTEXT拆分；保留現況細節與驗收限制 |
| [AI_CONTEXT/modules/RUNTIME.md](../AI_CONTEXT/modules/RUNTIME.md) | 按模組實作現況 | Current source notes | [AI_CONTEXT/modules/RUNTIME.md](../AI_CONTEXT/modules/RUNTIME.md) | 由原AI_CONTEXT拆分；保留現況細節與驗收限制 |
| [AI_CONTEXT/modules/V3.md](../AI_CONTEXT/modules/V3.md) | 按模組實作現況 | Current source notes | [AI_CONTEXT/modules/V3.md](../AI_CONTEXT/modules/V3.md) | 由原AI_CONTEXT拆分；保留現況細節與驗收限制 |
| [HANDOFF.md](../HANDOFF.md) | 目前階段與下一步 | Current checkpoint | [HANDOFF.md](../HANDOFF.md) | 新建唯一短交接，不取代原歷史證據 |
| [docs/DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) | 全MD盤點／來源／處理結果 | Current inventory | [docs/DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) | 新增，每個範圍內文件都有記錄 |
| [docs/archive/AI_CONTEXT_20261005.md](archive/AI_CONTEXT_20261005.md) | 完整歷史快照／淘汰提案 | Deprecated | [AI_CONTEXT/AI_CONTEXT.md](../AI_CONTEXT/AI_CONTEXT.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/archive/CHANGELOG_THROUGH_20261003.md](archive/CHANGELOG_THROUGH_20261003.md) | 完整歷史快照／淘汰提案 | Deprecated | [AI_CONTEXT/CHANGELOG.md](../AI_CONTEXT/CHANGELOG.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/archive/DATA_MODEL_20261005.md](archive/DATA_MODEL_20261005.md) | 完整歷史快照／淘汰提案 | Deprecated | [AI_CONTEXT/DATA_MODEL.md](../AI_CONTEXT/DATA_MODEL.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/specs/archive/EQUIPMENT_PROTOTYPE_20260923.md](specs/archive/EQUIPMENT_PROTOTYPE_20260923.md) | 完整歷史快照／淘汰提案 | Deprecated | [docs/specs/current/QUALITY_EQUIPMENT.md](specs/current/QUALITY_EQUIPMENT.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/specs/archive/EQUIPMENT_REVIEW_20260923.md](specs/archive/EQUIPMENT_REVIEW_20260923.md) | 完整歷史快照／淘汰提案 | Deprecated | [docs/specs/current/QUALITY_EQUIPMENT.md](specs/current/QUALITY_EQUIPMENT.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/specs/archive/EQUIPMENT_STORAGE_PROPOSAL_20260923.md](specs/archive/EQUIPMENT_STORAGE_PROPOSAL_20260923.md) | 完整歷史快照／淘汰提案 | Deprecated | [AI_CONTEXT/DATA_MODEL.md](../AI_CONTEXT/DATA_MODEL.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/specs/archive/FQC_HANDOFF_20260921.md](specs/archive/FQC_HANDOFF_20260921.md) | 完整歷史快照／淘汰提案 | Deprecated | [HANDOFF.md](../HANDOFF.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/specs/archive/FQC_PROGRESS_THROUGH_20260928.md](specs/archive/FQC_PROGRESS_THROUGH_20260928.md) | 完整歷史快照／淘汰提案 | Deprecated | [HANDOFF.md](../HANDOFF.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/specs/archive/FQC_SPEC_THROUGH_20260926.md](specs/archive/FQC_SPEC_THROUGH_20260926.md) | 完整歷史快照／淘汰提案 | Deprecated | [KD/FQC_SPEC.md](../KD/FQC_SPEC.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/specs/archive/IPQC_AB_IMPLEMENT_PROMPT_20260930.md](specs/archive/IPQC_AB_IMPLEMENT_PROMPT_20260930.md) | 完整歷史快照／淘汰提案 | Deprecated | [KD/IPQC-AB/02_欄位對應與匯入.md](../KD/IPQC-AB/02_欄位對應與匯入.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/specs/archive/IPQC_AB_SCAN_PROMPT_20260930.md](specs/archive/IPQC_AB_SCAN_PROMPT_20260930.md) | 完整歷史快照／淘汰提案 | Deprecated | [KD/IPQC-AB/02_欄位對應與匯入.md](../KD/IPQC-AB/02_欄位對應與匯入.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/specs/archive/IPQC_C_TASK_PROMPT_20260926.md](specs/archive/IPQC_C_TASK_PROMPT_20260926.md) | 完整歷史快照／淘汰提案 | Deprecated | [KD/IPQC-C/README.md](../KD/IPQC-C/README.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/specs/archive/WORK_CHECKPOINT_THROUGH_20260917.md](specs/archive/WORK_CHECKPOINT_THROUGH_20260917.md) | 完整歷史快照／淘汰提案 | Deprecated | [HANDOFF.md](../HANDOFF.md) | 新增歸檔，保留獨有原文與舊證據，退出預設閱讀 |
| [docs/specs/current/PROCESS_WORKFLOW.md](specs/current/PROCESS_WORKFLOW.md) | 確認需求／安全邊界與差距 | Current | [docs/specs/current/PROCESS_WORKFLOW.md](specs/current/PROCESS_WORKFLOW.md) | 新增正式入口／聚合規格，沿用KD有效路徑 |
| [docs/specs/current/QUALITY_EQUIPMENT.md](specs/current/QUALITY_EQUIPMENT.md) | 確認需求／安全邊界與差距 | Current | [docs/specs/current/QUALITY_EQUIPMENT.md](specs/current/QUALITY_EQUIPMENT.md) | 新增正式入口／聚合規格，沿用KD有效路徑 |
| [docs/specs/current/README.md](specs/current/README.md) | 現行規格路由 | Current | [docs/specs/current/README.md](specs/current/README.md) | 新增正式入口／聚合規格，沿用KD有效路徑 |
| [docs/specs/current/SHARED_DRAFT.md](specs/current/SHARED_DRAFT.md) | 確認需求／安全邊界與差距 | Current | [docs/specs/current/SHARED_DRAFT.md](specs/current/SHARED_DRAFT.md) | 新增正式入口／聚合規格，沿用KD有效路徑 |

## 衝突、差距及未決事項

1. **共享草稿**：使用者本次明確確認取代PR #11個人草稿／三值衝突。Canonical同步及Excel來源baseline的三方合併仍有效，名稱相似不是同一方案。
2. **製程待補**：舊checkpoint／validation文案阻擋未完成內容，最新需求允許送審；Current規格已訂正，archive保留歷史。V3白名單只放寬business codes，不能推定所有legacy／IPQC情境都符合；權限、pending、無修改及適用BOM互鎖保留。傳遞驗收須到入口發送，按影響到播放／狀態。
3. **連線安全**：UI有wouldCreateCycle；V3adapter未見明確direction／directedcycle檢查。列後端通路待核對，不改程式，也不說UI測試已保證所有入口。
4. **FQC理由**：2026-09-26規格移除所有操作／送審理由，2026-10-03現況與lib/shared-draft.ts要求整體Submitreason及非approve reason。舊每項理由與整體理由可能不同，但沒有足夠明確確認紀錄直接裁定適用範圍；需求與實作並列待確認。
5. **品質設備審核意見**：9/23原型要求approve／return必填，後續UI紀錄允許不填，V3核心又對return／withdraw有reason要求。舊原型storage提案已淘汰，意見政策不能僅靠碼或截圖決定。
6. **IQC展開**：9/25規格要求可收合列，後續現況為完整展開項目；保留原確認基線，列交互差異，未把舊待修表當當前BUG。
7. **IPQC-C設計**：圖11衝突流程及method／reason／notApplicable設計落後後續UI。共享草稿方案已明確淘汰舊流程；歷史來源欄位仍保留，其他設計差異須依最新明確需求處理，不能重新添加舊UI。
8. **來源待確認**：IPQC-AB1個群組未映射、49來源品號缺失、4組基本欄位衝突及空J欄保留於03；這是當時來源報告，未查今日DB，不自行結案。Routine設備37項來源疑點及FQC歷史來源差異也保留，不推定尚未修或已修。資料變更需新任務／當前核對。
9. **V3驗收**：整體NOT_COMPLETE；前次有限Localadoption／FQCcleanup不是本次結果，其他scope、容量、原生IME／實機鍵盤、員工驗收及lint未全面完成。未重新驗證live／DB／部署。DEPLOYMENT全資料及保留資料維護兩條路徑保留，不再與根AGENTS的強制全同步重複衝突。

## 本次驗證

- PASS：59份原文件＋28份新增文件逐份分類，86份現存MD全部在索引（另1行記錄已刪副本）；範圍內只有根AGENTS。
- PASS：492個本機Markdown連結／anchor、11個可操作MD文字引用、UTF-8及code fences；可操作文件內MD引用定向檢查。刪除行與歷史原文名稱不作有效連結。
- PASS：git diff --check限定MD；審閱相對整理前副本的逐檔diff，改動限預期文件。
- PASS：1084份tracked／untracked非MD逐檔SHA256與開始前一致；branch／HEAD一致，未commit／push／merge／切換分支。
- PASS：整理前未提交AI_CONTEXT原文保留在3份完整archive；共13份歸檔原文核對一致（僅相對連結隨位置修正），所有59份MD副本可在專案外before核對。已刪IQC副本與正式來源在刪除前逐位元相同，副本SHA已核對。
- 未執行：build、型別／全功能回歸、browser／實機、DB／migration／sync、Staging／Production／Site或依賴安全audit；純文件整理不需要這些檢查。定向查碼只證明文件中的來源觀察，不代表功能驗收。

詳細機器檢查及逐檔diff保留在同一專案外Temp目录的validation.json／review.diff；不另增加專案內重複驗證報告。

## 刪除與還原

只刪除KD/IQC/iqc_ui_final/IQC_UI_最終規格與差異.md：與正式KD/IQC/IQC_UI_最終規格與差異.md逐位元完全相同；掃描目前checkout有效引用，無仍依賴此副本的功能／文件。正式來源保留並修圖片路徑。它原為未追蹤文件，所以先存專案外副本後才刪除。

副本：<TEMP>/process-docs-20261005-XzbRc7\before\KD\IQC\iqc_ui_final\IQC_UI_最終規格與差異.md。
SHA256：4ed6a7564ecb85fe8bd167f0849a1d8ded26c88e488fb71a58be64990c529911。可將此檔複製回原路徑還原；不要用gitreset覆蓋其他工作。整個同名Temp目錄另外保留起始59份MD、branch／HEAD／status與非MDhash基準；含原未提交內容，勿公開上傳。Temp可能被系統清理，需长期保存時先轉存核准位置。

13份完整歸檔不是刪掉獨有資訊；原tracked版本仍可從起始HEAD查閱，未提交內容另在專案外before副本。除上述完全相同副本外，無法確定無用的來源／驗證／事故文件均保留並標狀態。本次不修改Git歷史、全域設定、功能、資料模型、DB或部署。

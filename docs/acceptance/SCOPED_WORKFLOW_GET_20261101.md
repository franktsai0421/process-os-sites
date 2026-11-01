# IPQC-C／定期 FQC：授權後限定必要讀取

本地分階段候選，未公開／部署。不是後台 FQC Apply、不是登入；POST、CAS、receipt 重送規則和手動儲存均未改。基準是 public main `268a8e49ec751bb6849033e20a27d30194aad67c`；本候選承接 AB Save 與其已審相容性補正，GET 改動獨立列出。

## 授權與必要資料

owner 已同意「必要權限／目標／引用損壞拒絕；確定無關模組故障不拖住當次操作且保留追查資訊」。本版只採固定 server-owned GET closure，不接受 client keys、projection 或自選授權範圍。

| GET | 必要 business keys（另加五個原 authority keys） |
| --- | --- |
| IPQC-C `permissions` | 無；原第一優先分支仍是 auth-only |
| IPQC-C 其他 selector | `ipqcCMasterControl` |
| 定期 FQC，包含 `availability` | `routineFqcEnabled`、`routineFqcControl`、`qualityMasterControl`、`masterDataControl` |

C 的 GET restore preview 使用原空 products context，不依賴 POST 的 master.C／equipment；這張表不能套用到 POST。定期 FQC 的有效 FQC 標準、AB catalog、自己的 documents/cases/report 關係仍完整驗證；這一步仍載入整個 quality/master aggregate 所需 body，**不是** quality/master 內其他 scope 的完全故障隔離。原非選取歷史 body deferred 行為保留，不聲稱所有歷史 body 已驗。

supported records-v1 一次 D1 SELECT 固定 manifest/revision，先完整 SHA／JSON 驗證 authority，再加原 `identity`＋`can(view)` gate，通過才讀必要 business keys。原 route 讀後 identity／各項 access 檢查全部保留，因此正常 GET 額外增加兩個 fresh revocation queries，不以減少安全檢查換速度。讀 body 期間撤權，原末段檢查仍拒絕交付 DTO。

合法缺省值保原預設；存在但 malformed JSON 的必要 aggregate 必須拒絕，不能被 adapter 當空模組。此項相較舊 parser fallback 可能更嚴格，與無關故障隔離分開列。defined inline authority 必須是合法字串 JSON；optional users mirror 不作授權，維持缺省／合法 stale 表示；maintenance override 保原優先序。真正 immutable body reference 不得藏入權限並於授權前 hydrate，普通字串／描述恰為 `__immutableBody` 仍合法。

回傳 State 同時標記 `deliveryOnly`、`partial`，兩種普通 encoder 均拒絕；沒有新增 writer capability、cache、表格、migration 或 background repair。必要 shared_state row 缺失立即沿原錯誤退出，不能 fallback 第二 SELECT 接受剛初始化的另一快照。

## 格式與 HEAD 相容性

inline／chunk／whole-R2／unsupported records layout 仍用原 full reader。這條相容路徑會多一次 probe SELECT，且原布局可能同 blob 混合權限／業務，所以不宣稱 legacy 格式也有授權前零敏感 bytes 或性能改善。supported layout 的 required integrity 錯誤不 catch 成 fallback。

實際 vinext auto-HEAD 會以 HEAD Request 呼叫 GET handler；因此只有真 GET 使用新 helper，HEAD 保原 full reader。曾真實重現候選把兩個原 200 HEAD 錯拒 503，現已修正並保存反例；私有 helper 本身仍拒非 GET／錯 route／錯 scope。HEAD 在無關資料損壞時仍保原拒絕行為，不借本次 GET 政策偷偷放寬。

## 可追查界線

scope log 只記 named policy、選取 revision、固定 required key 名稱及未驗 aggregate 數；不記帳號、session、命令或業務內容。原 row／refs 不改。未讀物件完整性是 **unknown**，不是已觀測到錯誤、也不是驗證通過。後續追查使用原 revision/manifest 與既有完整性／備份工具；本版不建立另一個持久快照或審計資料庫。

## 驗證與測速

- 239 個原新增案例已以六個 disjoint shards 通過、零 skip/cancel；包含 selector/conflict precedence、合法 defaults、auth denial 零 business GET、required refs/body 故障、無關 faults、撤權、readonly writer、同 D1 snapshot 與格式 fallback。
- 後續獨立 review 找到並修復 HEAD 與缺 shared_state row 兩類真反例；新增六個精準案例及兩個正常 GET smoke，不能用先前 239 PASS 冒充它們原本已涵蓋。
- 兩次先前測試錯誤保留原 RED log：content-addressed alias 被誤當未選 module GET；view-only fixture 錯用原有 legacy bypass 的 admin。修正 test oracle／staff fixture，未改產品權限去迎合測試。
- 完整 245-case Windows CI 入口會保留，不以本地分片宣稱完整 CI 已通過。
- 同條件配對：兩個真 production GET，main／candidate，各 7 cycle、零人工等待與固定 12ms/R2 GET 人工等待，完整 DTO／headers／decoded state 配對。CPU／SQL／撤權／R2／bytes／peak 分列；不是 Worker、HTTPS 或 UI click-to-ready。結果如下，不保證低於 2 秒或 1 秒。

初次 full TypeScript 768 MiB 在 urgent FQC repair lint 可能重疊時遭 SIGKILL 137，沒有型別診斷；保原 log，未升 heap 或宣稱 PASS。後續測速採明確唯一 runner 窗口。現有 required lint/build/browser gates 不放寬；實站／browser 仍未跑。

### 固定來源的配對結果

唯一 runner 時窗 `2026-11-01T05:16:47.419Z`–`05:17:39.874Z`；56 samples、84 組 healthy/role/legacy/HEAD 完整 DTO/header/decoded-state 配對、13 組單獨故障政策配對全部 PASS。以下是同一合成 fixture，不能套回先前已刪驗收站的歷史毫秒數。

| 正常 GET 資源／cycle | IPQC-C main→候選 | 定期 FQC main→候選 |
| --- | --- | --- |
| D1 SELECT snapshot | 1→1 | 1→1 |
| SQL 總數 | 14→16 | 12→14 |
| 其中 fresh revocation | 13→15 | 11→13 |
| R2 GET | 26→8 | 26→15 |
| R2 decoded read bytes | 147358→5367 | 147358→9492 |
| Response bytes | 925→925 | 3136→3136 |
| PUT／HEAD／CAS／寫入 bytes | 全 0 | 全 0 |

各 cycle 一次 GET 請求、無 request body。GET in-flight peak兩邊皆2（既有 identity prefetch，沒有增加 business speculative讀）；body/text peak零人工等待為2、12ms模式為1；結束時 active皆0。

| 模式：median／max ms | IPQC-C main→候選 | 定期 FQC main→候選 |
| --- | --- | --- |
| 無人工等待 | 23.888／41.316→28.525／40.412 | 23.237／51.667→20.469／53.511 |
| 每 R2 GET 固定人工12ms | 335.203／343.032→112.861／205.589 | 347.701／367.992→199.068／232.752 |

**不得只報有利數字：** C 零人工等待中位數回退、routine 零等待最大值回退，SQL增加；這不是所有環境都更快的承諾。CPU user中位（含harness）：零等待 C23.293→24.039ms、routine21.051→20.837ms；人工等待 C30.950→25.809ms、routine44.425→26.594ms。人工等待只展示減少串行物件讀取的可能效益，不是實際 R2／D1／平台延遲估計。

最末邊界套件新增6案＋正常2案共8/8 PASS、零skip；245 coverage是先前239個固定來源案例加最後6個邊界案例，**不是**聲稱最後source整組245重跑。56 samples與84＋13 contracts均使用最後helper／兩route固定來源。故障表明確保留無body marker的無關 malformed aggregate 舊本已200，以及必要enabled malformed value舊404→新503的政策差異。

### 最末 source gate 狀態

獨立 reviewer 25 個代表案例 PASS、零skip，包含 HEAD／缺 row、auth零business、required JSON／body、maintenance、readonly、晚撤權、同快照；它們與245 coverage重疊不加總。affected 5 檔 typed lint 最末 PASS；初次3個 test/harness lint診斷已保留，修正只涉及helper符號名、相同字串比較、相同parent subprocess順序。兩檔可逆 bytes 證明與原測量harness保留，產品SHA未變，不重跑時間美化。

完整 TypeScript 在獨占窗口以同768MiB限制再驗仍SIGKILL137、沒有型別診斷，因此 **BLOCKED**，不是PASS；未升heap／放寬規則。完整repo lint及完整245 CI仍待受保護Windows入口，沒有以affected lint替代。
